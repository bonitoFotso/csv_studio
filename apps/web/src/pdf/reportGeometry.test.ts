import { describe, expect, it } from 'vitest';
import { computeBarChartGeometry, computeLineChartGeometry, computePieChartGeometry } from './reportGeometry.ts';

describe('computeBarChartGeometry — barres groupées', () => {
  it('une barre par catégorie par série, hauteur proportionnelle à la valeur', () => {
    const geo = computeBarChartGeometry(
      ['Admis', 'Recalé'],
      [{ label: 'Candidats', values: ['10', '5'] }],
      { width: 200, height: 100 },
      { stacked: false, horizontal: false },
    );
    expect(geo.bars).toHaveLength(2);
    expect(geo.maxValue).toBe(10);
    // La barre du max (10) doit occuper toute la hauteur disponible.
    const admisBar = geo.bars.find((b) => b.categoryIndex === 0)!;
    const recaleBar = geo.bars.find((b) => b.categoryIndex === 1)!;
    expect(admisBar.height).toBeCloseTo(100);
    expect(recaleBar.height).toBeCloseTo(50);
    // En repère écran (y croît vers le bas), les deux barres doivent toucher le bas du graphique.
    expect(admisBar.y + admisBar.height).toBeCloseTo(100);
    expect(recaleBar.y + recaleBar.height).toBeCloseTo(100);
  });

  it('plusieurs séries se placent côte à côte dans chaque catégorie (pas empilées)', () => {
    const geo = computeBarChartGeometry(
      ['Douala'],
      [
        { label: 'S1', values: ['10'] },
        { label: 'S2', values: ['20'] },
      ],
      { width: 200, height: 100 },
      { stacked: false, horizontal: false },
    );
    expect(geo.bars).toHaveLength(2);
    const [bar1, bar2] = geo.bars;
    // Pas de chevauchement horizontal entre les deux barres groupées.
    expect(bar1.x + bar1.width).toBeLessThanOrEqual(bar2.x + 0.01);
  });

  it('barres empilées : la hauteur totale de la catégorie correspond à la somme des séries', () => {
    const geo = computeBarChartGeometry(
      ['Douala'],
      [
        { label: 'S1', values: ['10'] },
        { label: 'S2', values: ['20'] },
      ],
      { width: 200, height: 100 },
      { stacked: true, horizontal: false },
    );
    expect(geo.maxValue).toBe(30); // 10+20, pas max(10,20)
    // Les deux barres partagent le même x (empilées verticalement).
    const [bar1, bar2] = geo.bars;
    expect(bar1.x).toBeCloseTo(bar2.x);
    expect(bar1.height + bar2.height).toBeCloseTo(100);
  });

  it('orientation horizontale : la longueur de barre vient de `width`, pas de `height`', () => {
    const geo = computeBarChartGeometry(['A'], [{ label: 'S', values: ['5'] }], { width: 200, height: 100 }, { stacked: false, horizontal: true });
    expect(geo.bars[0].width).toBeCloseTo(200); // valeur max = 5, occupe toute la largeur
  });

  it('une catégorie avec une valeur manquante (chaîne vide) donne une barre de longueur nulle, pas une erreur', () => {
    const geo = computeBarChartGeometry(['A', 'B'], [{ label: 'S', values: ['10', ''] }], { width: 200, height: 100 }, { stacked: false, horizontal: false });
    const barB = geo.bars.find((b) => b.categoryIndex === 1)!;
    expect(barB.height).toBe(0);
  });
});

describe('computeLineChartGeometry', () => {
  it('produit un point par catégorie et un chemin SVG non vide', () => {
    const geo = computeLineChartGeometry(['Jan', 'Fév', 'Mar'], [{ label: 'Inscrits', values: ['10', '20', '15'] }], { width: 300, height: 100 });
    expect(geo.series).toHaveLength(1);
    expect(geo.series[0].points).toHaveLength(3);
    expect(geo.series[0].path).toMatch(/^M/); // un chemin SVG "line" commence par un moveto
  });

  it('la valeur maximale toutes séries confondues détermine l\'échelle', () => {
    const geo = computeLineChartGeometry(
      ['A', 'B'],
      [
        { label: 'S1', values: ['10', '5'] },
        { label: 'S2', values: ['3', '40'] },
      ],
      { width: 200, height: 100 },
    );
    expect(geo.maxValue).toBe(40);
  });
});

describe('computePieChartGeometry', () => {
  it('la somme des fractions des parts vaut 1', () => {
    const geo = computePieChartGeometry(['A', 'B', 'C'], ['10', '20', '30'], { width: 100, height: 100 }, { donut: false });
    const totalFraction = geo.slices.reduce((sum, s) => sum + s.fraction, 0);
    expect(totalFraction).toBeCloseTo(1);
    expect(geo.slices.map((s) => s.value)).toEqual([10, 20, 30]);
  });

  it('chaque part a un chemin SVG non vide', () => {
    const geo = computePieChartGeometry(['A', 'B'], ['1', '1'], { width: 100, height: 100 }, { donut: true });
    expect(geo.slices.every((s) => s.path.length > 0)).toBe(true);
  });

  it('un total de zéro ne fait pas planter le calcul (fractions à zéro plutôt que NaN)', () => {
    const geo = computePieChartGeometry(['A', 'B'], ['0', '0'], { width: 100, height: 100 }, { donut: false });
    expect(geo.slices.every((s) => Number.isFinite(s.fraction))).toBe(true);
  });
});
