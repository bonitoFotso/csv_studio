import * as React from 'react';
import { Plus, Trash2, UploadCloud } from 'lucide-react';
import { parseCsvFile, parseCsvText } from '@/lib/csv.ts';
import { createTableFromRows, cloneTableWithRows } from '@/engine/table.ts';
import { matchRowsExact, type AggregateFn, type KeyPair } from '@/engine/join.ts';
import { resolveFuzzyMatches, type FuzzyManualDecision, type FuzzyMatchConfig } from '@/engine/fuzzyJoin.ts';
import { addStep, createOperation } from '@/engine/pipeline.ts';
import type { CopyColumn, AggregateRule, EnrichJoinParams } from '@/engine/operations/enrichJoin.ts';
import type { ColumnId, Pipeline, Table as EngineTable } from '@/engine/types.ts';
import { useWorkspace } from '@/state/workspace.tsx';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import { FuzzyValidationScreen } from '@/components/join/FuzzyValidationScreen.tsx';

type Collision = 'prefix' | 'suffix' | 'overwrite' | 'skip';
type MultiMatch = 'first' | 'aggregate' | 'flag_conflict';
type Strategy = 'exact' | 'fuzzy';

function ColumnSelect({ value, onChange, columns }: { value: string; onChange: (id: string) => void; columns: { id: string; name: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12px]">
      {columns.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function EnrichJoinDialog({
  entryId,
  table,
  pipeline,
  open,
  onOpenChange,
}: {
  entryId: string;
  table: EngineTable;
  pipeline: Pipeline;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { setPipeline, setAuxiliaryTable, importTable } = useWorkspace();
  const [rightTable, setRightTable] = React.useState<EngineTable | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [strategy, setStrategy] = React.useState<Strategy>('exact');

  // Rapprochement exact
  const [keyPairs, setKeyPairs] = React.useState<KeyPair[]>([]);
  const [multiMatch, setMultiMatch] = React.useState<MultiMatch>('first');
  const [aggregateRules, setAggregateRules] = React.useState<Map<ColumnId, { fn: AggregateFn; separator?: string }>>(new Map());

  // Rapprochement flou
  const [fuzzyLeftIds, setFuzzyLeftIds] = React.useState<Set<ColumnId>>(new Set());
  const [fuzzyRightIds, setFuzzyRightIds] = React.useState<Set<ColumnId>>(new Set());
  const [blockingPairs, setBlockingPairs] = React.useState<KeyPair[]>([]);
  const [tokenized, setTokenized] = React.useState(true);
  const [thresholdHigh, setThresholdHigh] = React.useState(90);
  const [thresholdLow, setThresholdLow] = React.useState(65);
  const [manualDecisions, setManualDecisions] = React.useState<FuzzyManualDecision[]>([]);
  const [validating, setValidating] = React.useState(false);
  const [initialPendingCount, setInitialPendingCount] = React.useState(0);

  // Partagé
  const [copySelection, setCopySelection] = React.useState<Map<ColumnId, string>>(new Map());
  const [collision, setCollision] = React.useState<Collision>('suffix');
  const [collisionText, setCollisionText] = React.useState('_droite');
  const [joinType, setJoinType] = React.useState<'left' | 'inner'>('left');

  const resetAll = () => {
    setRightTable(null);
    setStrategy('exact');
    setKeyPairs([]);
    setMultiMatch('first');
    setAggregateRules(new Map());
    setFuzzyLeftIds(new Set());
    setFuzzyRightIds(new Set());
    setBlockingPairs([]);
    setTokenized(true);
    setThresholdHigh(90);
    setThresholdLow(65);
    setManualDecisions([]);
    setValidating(false);
    setCopySelection(new Map());
    setCollision('suffix');
    setCollisionText('_droite');
    setJoinType('left');
  };

  React.useEffect(() => {
    if (open) resetAll();
  }, [open]);

  const loadRightTable = (t: EngineTable) => {
    setRightTable(t);
    setKeyPairs([{ leftColumnId: table.columns[0]?.id ?? '', rightColumnId: t.columns[0]?.id ?? '' }]);
    setBlockingPairs([{ leftColumnId: table.columns[0]?.id ?? '', rightColumnId: t.columns[0]?.id ?? '' }]);
  };

  const importFile = async (file: File) => {
    const parsed = await parseCsvFile(file);
    loadRightTable(createTableFromRows(file.name.replace(/\.[^.]+$/, ''), parsed.columnNames, parsed.rows));
  };

  // --- Aperçu exact ---
  const exactMatches = React.useMemo(() => {
    if (strategy !== 'exact' || !rightTable || keyPairs.some((p) => !p.leftColumnId || !p.rightColumnId)) return [];
    return matchRowsExact(table.rows, rightTable.rows, keyPairs);
  }, [strategy, table.rows, rightTable, keyPairs]);

  const exactUnmatched = exactMatches.filter((m) => m.matches.length === 0).length;
  const exactAmbiguous = exactMatches.filter((m) => m.matches.length > 1).length;
  const exactMatched = exactMatches.length - exactUnmatched;

  // --- Aperçu flou ---
  const fuzzyConfig = React.useMemo<FuzzyMatchConfig | null>(() => {
    if (fuzzyLeftIds.size === 0 || fuzzyRightIds.size === 0 || blockingPairs.length === 0 || !blockingPairs.every((p) => p.leftColumnId && p.rightColumnId)) {
      return null;
    }
    return {
      leftKeyColumnIds: [...fuzzyLeftIds],
      rightKeyColumnIds: [...fuzzyRightIds],
      blockingPairs,
      tokenized,
      thresholdHigh,
      thresholdLow,
      manualDecisions,
    };
  }, [fuzzyLeftIds, fuzzyRightIds, blockingPairs, tokenized, thresholdHigh, thresholdLow, manualDecisions]);

  const fuzzyResolution = React.useMemo(() => {
    if (strategy !== 'fuzzy' || !rightTable || !fuzzyConfig) return null;
    return resolveFuzzyMatches(table.rows, rightTable.rows, fuzzyConfig);
  }, [strategy, table.rows, rightTable, fuzzyConfig]);

  const copyColumns: CopyColumn[] = [...copySelection.entries()].map(([rightColumnId, asName]) => ({ rightColumnId, asName }));

  const canApply =
    rightTable !== null &&
    copyColumns.length > 0 &&
    (strategy === 'exact'
      ? keyPairs.length > 0 && keyPairs.every((p) => p.leftColumnId && p.rightColumnId)
      : fuzzyConfig !== null);

  const apply = () => {
    if (!rightTable || !canApply) return;
    setAuxiliaryTable(entryId, rightTable);

    let params: EnrichJoinParams;
    if (strategy === 'exact') {
      const aggregate: AggregateRule[] = copyColumns.map((c) => ({
        rightColumnId: c.rightColumnId,
        fn: aggregateRules.get(c.rightColumnId)?.fn ?? 'concat',
        separator: aggregateRules.get(c.rightColumnId)?.separator,
      }));
      params = {
        rightTableId: rightTable.id,
        keyPairs,
        matchStrategy: 'exact',
        copyColumns,
        collision,
        collisionText,
        joinType,
        multiMatch,
        aggregate: multiMatch === 'aggregate' ? aggregate : undefined,
      };
    } else {
      params = {
        rightTableId: rightTable.id,
        keyPairs: [],
        matchStrategy: 'fuzzy',
        fuzzy: fuzzyConfig!,
        copyColumns,
        collision,
        collisionText,
        joinType,
        multiMatch: 'first',
      };
    }
    setPipeline(entryId, addStep(pipeline, createOperation('enrich_join', params)));
    onOpenChange(false);
  };

  const exportExactSubset = (predicate: (count: number) => boolean, label: string) => {
    const rows = exactMatches.filter((m) => predicate(m.matches.length)).map((m) => m.leftRow);
    importTable(cloneTableWithRows(table, `${table.name} (${label})`, rows));
  };

  const openValidation = () => {
    if (!fuzzyResolution) return;
    setInitialPendingCount(fuzzyResolution.pending.length);
    setValidating(true);
  };

  const recordDecision = (pair: { leftKeyNormalized: string; rightKeyNormalized: string }, decision: 'validated' | 'rejected') => {
    setManualDecisions((prev) => [...prev, { leftKeyNormalized: pair.leftKeyNormalized, rightKeyNormalized: pair.rightKeyNormalized, decision }]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Rapprochement / enrichissement</DialogTitle>
        </DialogHeader>

        {!rightTable ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void importFile(file);
            }}
            className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 text-center ${isDragging ? 'border-text bg-surface-alt' : 'border-border'}`}
          >
            <UploadCloud size={22} className="text-text-faint" />
            <p className="text-[12.5px] text-text">Importez le second fichier (celui qui contient les colonnes à copier)</p>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              Choisir un fichier
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
                e.target.value = '';
              }}
            />
            <button
              className="text-[11px] text-text-muted underline"
              onClick={async () => {
                const text = await navigator.clipboard.readText().catch(() => '');
                if (text.trim()) {
                  const parsed = parseCsvText(text);
                  loadRightTable(createTableFromRows(`collé ${new Date().toLocaleTimeString('fr-FR')}`, parsed.columnNames, parsed.rows));
                }
              }}
            >
              ou coller depuis le presse-papiers
            </button>
          </div>
        ) : validating && fuzzyResolution ? (
          <FuzzyValidationScreen
            pairs={fuzzyResolution.pending}
            initialCount={initialPendingCount}
            leftColumns={table.columns}
            rightColumns={rightTable.columns}
            onValidate={(pair) => recordDecision(pair, 'validated')}
            onReject={(pair) => recordDecision(pair, 'rejected')}
            onBack={() => setValidating(false)}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border bg-surface-alt px-2.5 py-1.5 text-[12px]">
              <span>
                Fichier de droite : <span className="cell-value font-medium">{rightTable.name}</span> ({rightTable.rows.length.toLocaleString('fr-FR')} lignes,{' '}
                {rightTable.columns.length} colonnes)
              </span>
              <Button variant="ghost" size="sm" onClick={resetAll}>
                Changer de fichier
              </Button>
            </div>

            <div className="flex items-center gap-4 text-[12.5px]">
              <span className="text-text-muted">Type de rapprochement :</span>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={strategy === 'exact'} onChange={() => setStrategy('exact')} /> Exact
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={strategy === 'fuzzy'} onChange={() => setStrategy('fuzzy')} /> Flou (noms, prénoms…)
              </label>
            </div>

            {strategy === 'exact' ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-text-muted">Colonnes-clés (gauche ↔ droite)</label>
                <div className="space-y-1">
                  {keyPairs.map((pair, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <ColumnSelect
                        value={pair.leftColumnId}
                        onChange={(id) => setKeyPairs((prev) => prev.map((p, idx) => (idx === i ? { ...p, leftColumnId: id } : p)))}
                        columns={table.columns}
                      />
                      <span className="text-[11px] text-text-faint">↔</span>
                      <ColumnSelect
                        value={pair.rightColumnId}
                        onChange={(id) => setKeyPairs((prev) => prev.map((p, idx) => (idx === i ? { ...p, rightColumnId: id } : p)))}
                        columns={rightTable.columns}
                      />
                      {keyPairs.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => setKeyPairs((prev) => prev.filter((_, idx) => idx !== i))}>
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setKeyPairs((prev) => [...prev, { leftColumnId: table.columns[0]?.id ?? '', rightColumnId: rightTable.columns[0]?.id ?? '' }])}
                  >
                    <Plus size={12} /> Paire de clés
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 rounded-md border border-border p-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">Colonnes comparées (gauche) — ex: nom + prénom</label>
                    <div className="max-h-24 space-y-0.5 overflow-y-auto">
                      {table.columns.map((c) => (
                        <label key={c.id} className="flex items-center gap-1.5 text-[12px]">
                          <Checkbox
                            checked={fuzzyLeftIds.has(c.id)}
                            onChange={() =>
                              setFuzzyLeftIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(c.id)) next.delete(c.id);
                                else next.add(c.id);
                                return next;
                              })
                            }
                          />
                          <span className="cell-value truncate">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">Colonnes comparées (droite)</label>
                    <div className="max-h-24 space-y-0.5 overflow-y-auto">
                      {rightTable.columns.map((c) => (
                        <label key={c.id} className="flex items-center gap-1.5 text-[12px]">
                          <Checkbox
                            checked={fuzzyRightIds.has(c.id)}
                            onChange={() =>
                              setFuzzyRightIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(c.id)) next.delete(c.id);
                                else next.add(c.id);
                                return next;
                              })
                            }
                          />
                          <span className="cell-value truncate">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <label className="flex items-center gap-1.5 text-[12px]">
                  <Checkbox checked={tokenized} onChange={(e) => setTokenized(e.target.checked)} />
                  Comparer par jetons non ordonnés (« FOTSO BONITO » = « BONITO FOTSO »)
                </label>

                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Blocage obligatoire (pré-filtre exact, ex : année de naissance)</label>
                  <div className="space-y-1">
                    {blockingPairs.map((pair, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <ColumnSelect
                          value={pair.leftColumnId}
                          onChange={(id) => setBlockingPairs((prev) => prev.map((p, idx) => (idx === i ? { ...p, leftColumnId: id } : p)))}
                          columns={table.columns}
                        />
                        <span className="text-[11px] text-text-faint">↔</span>
                        <ColumnSelect
                          value={pair.rightColumnId}
                          onChange={(id) => setBlockingPairs((prev) => prev.map((p, idx) => (idx === i ? { ...p, rightColumnId: id } : p)))}
                          columns={rightTable.columns}
                        />
                        {blockingPairs.length > 1 && (
                          <Button variant="ghost" size="icon" onClick={() => setBlockingPairs((prev) => prev.filter((_, idx) => idx !== i))}>
                            <Trash2 size={13} />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setBlockingPairs((prev) => [...prev, { leftColumnId: table.columns[0]?.id ?? '', rightColumnId: rightTable.columns[0]?.id ?? '' }])
                      }
                    >
                      <Plus size={12} /> Critère de blocage
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[12px]">
                  <label className="flex items-center gap-1.5">
                    Seuil haut (auto-apparié) ≥
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="h-6 w-16"
                      value={thresholdHigh}
                      onChange={(e) => setThresholdHigh(Number(e.target.value))}
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    Seuil bas (rejeté) &lt;
                    <Input type="number" min={0} max={100} className="h-6 w-16" value={thresholdLow} onChange={(e) => setThresholdLow(Number(e.target.value))} />
                  </label>
                </div>

                {fuzzyResolution && (
                  <div className="rounded-md bg-surface-alt px-2.5 py-2 text-[12px]">
                    <p>
                      <span className="font-medium text-validated">{fuzzyResolution.matches.size}</span> auto-appariée(s) ·{' '}
                      <span className="font-medium text-destructive">{fuzzyResolution.pending.length}</span> en attente de validation ·{' '}
                      {fuzzyResolution.rejectedCount} rejetée(s) · {fuzzyResolution.noCandidateCount} sans bloc candidat
                    </p>
                    {fuzzyResolution.pending.length > 0 && (
                      <Button size="sm" className="mt-1.5" onClick={openValidation}>
                        Valider les {fuzzyResolution.pending.length} paire(s) en attente
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">Colonnes à copier depuis la droite</label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {rightTable.columns.map((c) => {
                  const checked = copySelection.has(c.id);
                  return (
                    <div key={c.id} className="flex items-center gap-2 text-[12px]">
                      <Checkbox
                        checked={checked}
                        onChange={() =>
                          setCopySelection((prev) => {
                            const next = new Map(prev);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.set(c.id, c.name);
                            return next;
                          })
                        }
                      />
                      <span className="cell-value w-32 shrink-0 truncate">{c.name}</span>
                      {checked && (
                        <Input
                          className="h-6 w-40"
                          value={copySelection.get(c.id) ?? ''}
                          onChange={(e) =>
                            setCopySelection((prev) => {
                              const next = new Map(prev);
                              next.set(c.id, e.target.value);
                              return next;
                            })
                          }
                        />
                      )}
                      {checked && strategy === 'exact' && multiMatch === 'aggregate' && (
                        <select
                          value={aggregateRules.get(c.id)?.fn ?? 'concat'}
                          onChange={(e) =>
                            setAggregateRules((prev) => {
                              const next = new Map(prev);
                              next.set(c.id, { ...next.get(c.id), fn: e.target.value as AggregateFn });
                              return next;
                            })
                          }
                          className="h-6 rounded border border-border bg-surface px-1 text-[11px]"
                        >
                          <option value="concat">concaténer</option>
                          <option value="sum">somme</option>
                          <option value="max">max</option>
                          <option value="min">min</option>
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-[12px]">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-muted">Collision de noms</label>
                <div className="space-y-1">
                  {(['prefix', 'suffix', 'overwrite', 'skip'] as const).map((c) => (
                    <label key={c} className="flex items-center gap-1.5">
                      <input type="radio" checked={collision === c} onChange={() => setCollision(c)} />
                      {c === 'prefix' ? 'préfixer' : c === 'suffix' ? 'suffixer' : c === 'overwrite' ? 'écraser' : 'ignorer'}
                    </label>
                  ))}
                  {(collision === 'prefix' || collision === 'suffix') && (
                    <Input className="h-6 w-28" value={collisionText} onChange={(e) => setCollisionText(e.target.value)} />
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-text-muted">Type de jointure</label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={joinType === 'left'} onChange={() => setJoinType('left')} /> Garder toutes les lignes de gauche
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={joinType === 'inner'} onChange={() => setJoinType('inner')} /> Seulement les lignes appariées
                </label>

                {strategy === 'exact' && (
                  <>
                    <label className="mb-1 mt-2 block text-xs font-medium text-text-muted">Si plusieurs correspondances (1→N)</label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={multiMatch === 'first'} onChange={() => setMultiMatch('first')} /> Prendre la première
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={multiMatch === 'aggregate'} onChange={() => setMultiMatch('aggregate')} /> Agréger
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={multiMatch === 'flag_conflict'} onChange={() => setMultiMatch('flag_conflict')} /> Signaler (laisser vide)
                    </label>
                  </>
                )}
              </div>
            </div>

            {strategy === 'exact' && (
              <div className="rounded-md border border-border bg-surface-alt px-2.5 py-2 text-[12.5px]">
                <p className="font-medium text-text">
                  {exactMatched.toLocaleString('fr-FR')} ligne(s) appariée(s), {exactUnmatched.toLocaleString('fr-FR')} non appariée(s),{' '}
                  {exactAmbiguous.toLocaleString('fr-FR')} ambiguë(s) sur {table.rows.length.toLocaleString('fr-FR')} lignes.
                </p>
                <div className="mt-1.5 flex gap-2">
                  <Button variant="outline" size="sm" disabled={exactUnmatched === 0} onClick={() => exportExactSubset((n) => n === 0, 'non appariées')}>
                    Exporter les non-appariées
                  </Button>
                  <Button variant="outline" size="sm" disabled={exactAmbiguous === 0} onClick={() => exportExactSubset((n) => n > 1, 'ambiguës')}>
                    Exporter les ambiguës
                  </Button>
                </div>
              </div>
            )}
            {strategy === 'fuzzy' && fuzzyResolution && fuzzyResolution.pending.length > 0 && (
              <p className="text-[11.5px] text-destructive">
                {fuzzyResolution.pending.length} paire(s) encore en attente de validation seront traitées comme non appariées si vous appliquez maintenant.
              </p>
            )}
          </div>
        )}

        {!validating && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button disabled={!canApply} onClick={apply}>
              Appliquer
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
