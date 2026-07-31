import { matchRowsExact, type KeyPair } from '@csv-studio/core/engine/join.ts';
import { resolveFuzzyMatches, unmatchedRightRows, type FuzzyMatchConfig } from '@csv-studio/core/engine/fuzzyJoin.ts';
import type { KeyNormalization } from '@csv-studio/core/engine/keyNormalize.ts';
import type { Row, Table } from '@csv-studio/core/engine/types.ts';
import { loadTableFromCsvFile, writeTableToCsvFile } from '../csvIo.ts';
import { resolveInWorkdir } from '../workdir.ts';
import { clampSampleCap } from '../bounded.ts';
import { boundRecords, resolveExactColumnIds } from '../records.ts';
import { asRecord, optionalBoolean, optionalNumber, optionalString, requireArray, requireString, ToolInputError } from '../validate.ts';
import type { ToolContext, ToolDefinition } from './types.ts';

const DEFAULT_TOKENIZED = true;
const DEFAULT_THRESHOLD_HIGH = 90;
const DEFAULT_THRESHOLD_LOW = 65;
const NORMALIZATIONS: KeyNormalization[] = ['none', 'text', 'date'];

interface ResolvedKeyPairs {
  keyPairs: KeyPair[];
}

function parseKeyPairs(raw: unknown, leftTable: Table, rightTable: Table): ResolvedKeyPairs {
  const arr = requireArray(asRecord({ keyPairs: raw }), 'keyPairs');
  if (arr.length === 0) throw new ToolInputError('"keyPairs" doit contenir au moins une paire.');
  const keyPairs = arr.map((raw, i) => {
    const obj = asRecord(raw, `keyPairs[${i}]`);
    const leftColumn = requireString(obj, 'leftColumn');
    const rightColumn = requireString(obj, 'rightColumn');
    const normalization = optionalString(obj, 'normalization') ?? 'text';
    if (!NORMALIZATIONS.includes(normalization as KeyNormalization)) {
      throw new ToolInputError(`keyPairs[${i}].normalization doit être l'une de : ${NORMALIZATIONS.join(', ')}.`);
    }
    const [leftColumnId] = resolveExactColumnIds(leftTable, [leftColumn]);
    const [rightColumnId] = resolveExactColumnIds(rightTable, [rightColumn]);
    return { leftColumnId, rightColumnId, normalization: normalization as KeyNormalization };
  });
  return { keyPairs };
}

function unmatchedRightRowsExact(rightRows: Row[], results: { matches: Row[] }[]): Row[] {
  const matchedIds = new Set<string>();
  for (const r of results) for (const m of r.matches) matchedIds.add(m.id);
  return rightRows.filter((r) => !matchedIds.has(r.id));
}

export const matchFilesTool: ToolDefinition = {
  name: 'match_files',
  description:
    "Rapproche deux fichiers CSV sur des paires de colonnes-clés (exact ou flou). Renvoie les compteurs (appariés, ambigus, non appariés de chaque côté) ; peut écrire les lignes non appariées de chaque côté dans des fichiers séparés du répertoire de travail.",
  inputSchema: {
    type: 'object',
    required: ['leftPath', 'rightPath', 'keyPairs'],
    properties: {
      leftPath: { type: 'string' },
      rightPath: { type: 'string' },
      matchStrategy: { type: 'string', enum: ['exact', 'fuzzy'], description: "Défaut 'exact'." },
      keyPairs: {
        type: 'array',
        items: {
          type: 'object',
          required: ['leftColumn', 'rightColumn'],
          properties: {
            leftColumn: { type: 'string' },
            rightColumn: { type: 'string' },
            normalization: { type: 'string', enum: ['none', 'text', 'date'], description: "Défaut 'text'." },
          },
        },
      },
      tokenized: { type: 'boolean', description: 'Mode flou uniquement : comparaison par jetons non ordonnés (défaut true).' },
      thresholdHigh: { type: 'number', description: 'Mode flou uniquement : score minimal (0-100) pour un appariement automatique (défaut 90).' },
      thresholdLow: { type: 'number', description: 'Mode flou uniquement : score minimal (0-100) pour la zone ambiguë (défaut 65).' },
      unmatchedLeftOutputPath: { type: 'string', description: 'Si fourni, écrit les lignes de gauche non appariées dans ce fichier.' },
      unmatchedRightOutputPath: { type: 'string', description: 'Si fourni, écrit les lignes de droite non appariées dans ce fichier.' },
      overwrite: { type: 'boolean', description: 'Écrase les fichiers de sortie déjà existants (défaut false).' },
      sampleRows: { type: 'number', description: "Nombre de lignes d'exemple non appariées à renvoyer dans la réponse (défaut 30, plafond 200)." },
    },
  },
  handler(args, ctx: ToolContext) {
    const input = asRecord(args);
    const leftPath = requireString(input, 'leftPath');
    const rightPath = requireString(input, 'rightPath');
    const strategy = optionalString(input, 'matchStrategy') ?? 'exact';
    if (strategy !== 'exact' && strategy !== 'fuzzy') throw new ToolInputError('"matchStrategy" doit être "exact" ou "fuzzy".');
    const unmatchedLeftOutputPath = optionalString(input, 'unmatchedLeftOutputPath');
    const unmatchedRightOutputPath = optionalString(input, 'unmatchedRightOutputPath');
    const overwrite = optionalBoolean(input, 'overwrite', false);
    const cap = clampSampleCap(optionalNumber(input, 'sampleRows'));

    const leftTable = loadTableFromCsvFile(resolveInWorkdir(ctx.workdir, leftPath));
    const rightTable = loadTableFromCsvFile(resolveInWorkdir(ctx.workdir, rightPath));
    const { keyPairs } = parseKeyPairs(input.keyPairs, leftTable, rightTable);

    let matchedCount: number;
    let ambiguousCount: number;
    let unmatchedLeft: Row[];
    let unmatchedRight: Row[];

    if (strategy === 'exact') {
      const results = matchRowsExact(leftTable.rows, rightTable.rows, keyPairs);
      matchedCount = results.filter((r) => r.matches.length === 1).length;
      ambiguousCount = results.filter((r) => r.matches.length > 1).length;
      unmatchedLeft = results.filter((r) => r.matches.length === 0).map((r) => r.leftRow);
      unmatchedRight = unmatchedRightRowsExact(rightTable.rows, results);
    } else {
      const tokenized = optionalBoolean(input, 'tokenized', DEFAULT_TOKENIZED);
      const thresholdHigh = optionalNumber(input, 'thresholdHigh') ?? DEFAULT_THRESHOLD_HIGH;
      const thresholdLow = optionalNumber(input, 'thresholdLow') ?? DEFAULT_THRESHOLD_LOW;
      const config: FuzzyMatchConfig = {
        leftKeyColumnIds: keyPairs.map((p) => p.leftColumnId),
        rightKeyColumnIds: keyPairs.map((p) => p.rightColumnId),
        blockingPairs: keyPairs,
        tokenized,
        thresholdHigh,
        thresholdLow,
        manualDecisions: [],
      };
      const resolution = resolveFuzzyMatches(leftTable.rows, rightTable.rows, config);
      matchedCount = resolution.matches.size;
      ambiguousCount = resolution.pending.length;
      const matchedLeftIds = new Set(resolution.matches.keys());
      const ambiguousLeftIds = new Set(resolution.pending.map((p) => p.leftRow.id));
      unmatchedLeft = leftTable.rows.filter((r) => !matchedLeftIds.has(r.id) && !ambiguousLeftIds.has(r.id));
      unmatchedRight = unmatchedRightRows(rightTable.rows, resolution);
    }

    let writtenLeftPath: string | undefined;
    let writtenRightPath: string | undefined;
    if (unmatchedLeftOutputPath) {
      const abs = resolveInWorkdir(ctx.workdir, unmatchedLeftOutputPath);
      writeTableToCsvFile({ ...leftTable, rows: unmatchedLeft }, abs, { overwrite });
      writtenLeftPath = unmatchedLeftOutputPath;
    }
    if (unmatchedRightOutputPath) {
      const abs = resolveInWorkdir(ctx.workdir, unmatchedRightOutputPath);
      writeTableToCsvFile({ ...rightTable, rows: unmatchedRight }, abs, { overwrite });
      writtenRightPath = unmatchedRightOutputPath;
    }

    return {
      leftPath,
      rightPath,
      matchStrategy: strategy,
      leftTotalRows: leftTable.rows.length,
      rightTotalRows: rightTable.rows.length,
      matchedCount,
      ambiguousCount,
      unmatchedLeftCount: unmatchedLeft.length,
      unmatchedRightCount: unmatchedRight.length,
      unmatchedLeftOutputPath: writtenLeftPath,
      unmatchedRightOutputPath: writtenRightPath,
      unmatchedLeftSample: boundRecords(leftTable, unmatchedLeft, cap),
      unmatchedRightSample: boundRecords(rightTable, unmatchedRight, cap),
    };
  },
};
