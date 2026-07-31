import { describe, expect, it } from 'vitest';
import { anonymizeValue, buildAnonymizedSample } from './anonymize.ts';
import { createTableFromRows } from './table.ts';

describe('anonymizeValue', () => {
  it('laisse une valeur vide inchangée', () => {
    expect(anonymizeValue('', 'text')).toBe('');
    expect(anonymizeValue('', 'integer')).toBe('');
  });

  it('laisse un booléen inchangé (jamais identifiant)', () => {
    expect(anonymizeValue('oui', 'boolean')).toBe('oui');
    expect(anonymizeValue('false', 'boolean')).toBe('false');
  });

  it('anonymise un entier en préservant le signe et la longueur', () => {
    const result = anonymizeValue('-42', 'integer');
    expect(result).toMatch(/^-\d{2}$/);
    const positive = anonymizeValue('12345', 'integer');
    expect(positive).toMatch(/^\d{5}$/);
  });

  it('anonymise un décimal en préservant le séparateur et les longueurs de chaque côté', () => {
    const comma = anonymizeValue('12,5', 'decimal');
    expect(comma).toMatch(/^\d{2},\d{1}$/);
    const dot = anonymizeValue('-3.14', 'decimal');
    expect(dot).toMatch(/^-\d{1}\.\d{2}$/);
  });

  it('anonymise une date en préservant le format exact (ISO, slash, dash)', () => {
    expect(anonymizeValue('2026-07-19', 'date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(anonymizeValue('19/07/2026', 'date')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(anonymizeValue('19-07-2026', 'date')).toMatch(/^\d{2}-\d{2}-\d{4}$/);
  });

  it('anonymise du texte en préservant longueur, casse, espaces et ponctuation', () => {
    const result = anonymizeValue('Fotso Bonito', 'text');
    expect(result).toHaveLength('Fotso Bonito'.length);
    expect(result[5]).toBe(' '); // l'espace reste à sa place
    expect(result[0]).toMatch(/[A-Z]/); // majuscule -> majuscule
    expect(result[1]).toMatch(/[a-z]/); // minuscule -> minuscule
    expect(result).not.toBe('Fotso Bonito');
  });

  it('préserve les accents/apostrophes/ponctuation en position (jamais remplacés par une lettre)', () => {
    const result = anonymizeValue("N'Guessan", 'text');
    expect(result).toHaveLength("N'Guessan".length);
    expect(result[1]).toBe("'");
  });

  it("n'expose jamais un chiffre réel via le repli texte — régression : une colonne 'decimal' avec une valeur individuelle sans séparateur (ex. \"16\") ne matche pas DECIMAL_RE et retombait sur anonymizeText, qui ne touchait pas les chiffres", () => {
    // Une seule tentative sur un chiffre pourrait coïncidentellement retomber sur la même valeur
    // (1 chance sur 10) : on répète pour rendre la régression détectable sans jamais dépendre du hasard.
    const results = Array.from({ length: 30 }, () => anonymizeValue('16', 'decimal'));
    for (const r of results) expect(r).toMatch(/^\d{2}$/);
    expect(results.some((r) => r !== '16')).toBe(true);
  });

  it("retombe sur l'anonymisation texte si une valeur ne correspond pas au format attendu de son type détecté", () => {
    // Cas défensif : ne devrait pas arriver en pratique (le type détecté vient de la même donnée),
    // mais ne doit jamais lever ni renvoyer la valeur réelle telle quelle.
    const result = anonymizeValue('abc', 'integer');
    expect(result).not.toBe('abc');
  });
});

describe('buildAnonymizedSample', () => {
  it("ne mute jamais la table d'origine", () => {
    const table = createTableFromRows('t', ['nom', 'note'], [
      { nom: 'Alice', note: '12,5' },
      { nom: 'Bob', note: '15' },
    ]);
    const before = JSON.stringify(table);
    buildAnonymizedSample(table, 2);
    expect(JSON.stringify(table)).toBe(before);
  });

  it('ne renvoie jamais une valeur réelle des lignes anonymisées', () => {
    const table = createTableFromRows('t', ['nom', 'note'], [
      { nom: 'Alice', note: '12,5' },
      { nom: 'Bob', note: '15' },
      { nom: 'Charlie', note: '8' },
    ]);
    const sample = buildAnonymizedSample(table, 3);
    const nomId = table.columns[0].id;
    const noteId = table.columns[1].id;
    const realNames = ['Alice', 'Bob', 'Charlie'];
    for (const row of sample) {
      expect(realNames).not.toContain(row.cells[nomId]);
    }
    expect(sample[0].cells[noteId]).toMatch(/^\d{2},\d{1}$/);
  });

  it('respecte sampleSize et ne dépasse jamais le nombre de lignes réel', () => {
    const table = createTableFromRows('t', ['a'], [{ a: '1' }]);
    expect(buildAnonymizedSample(table, 3)).toHaveLength(1);
  });
});
