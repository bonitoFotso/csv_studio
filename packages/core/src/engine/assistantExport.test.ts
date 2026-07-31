import { describe, expect, it } from 'vitest';
import { buildAssistantProfileExport } from './assistantExport.ts';
import { createTableFromRows } from './table.ts';

describe('buildAssistantProfileExport', () => {
  it('contient chaque nom de colonne', () => {
    const table = createTableFromRows('candidats', ['nom', 'prenom', 'note'], [
      { nom: 'Alice', prenom: 'Amélie', note: '12,5' },
      { nom: 'Bob', prenom: 'Bruno', note: '15' },
    ]);
    const text = buildAssistantProfileExport(table);
    expect(text).toContain('nom');
    expect(text).toContain('prenom');
    expect(text).toContain('note');
  });

  it('ne contient aucune valeur réelle des lignes échantillonnées', () => {
    const table = createTableFromRows('candidats', ['nom'], [
      { nom: 'ZzUniqueRealValueXx' },
    ]);
    const text = buildAssistantProfileExport(table);
    expect(text).not.toContain('ZzUniqueRealValueXx');
  });

  it('inclut le rappel du format ReportSpec', () => {
    const table = createTableFromRows('t', ['a'], [{ a: '1' }]);
    const text = buildAssistantProfileExport(table);
    expect(text).toContain('ReportSpec');
    expect(text).toContain('expectedColumns');
  });

  it('signale le type détecté et le taux de remplissage par colonne', () => {
    const table = createTableFromRows('t', ['note'], [{ note: '12' }, { note: '' }]);
    const text = buildAssistantProfileExport(table);
    expect(text).toMatch(/note.*entier.*50 %/);
  });

  it('ne contient pas les topValues ni les exemples d\'anomalie (données réelles potentiellement identifiantes)', () => {
    const table = createTableFromRows('t', ['nom'], [
      { nom: '  Alice  ' },
      { nom: '  Alice  ' },
      { nom: 'Bob' },
    ]);
    const text = buildAssistantProfileExport(table);
    // "  Alice  " (avec espaces) ne doit apparaître nulle part comme exemple brut d'anomalie.
    expect(text).not.toContain('  Alice  ');
  });
});
