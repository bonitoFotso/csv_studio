// Couche de calcul géométrique commune écran/PDF — aucune dépendance au DOM (pas de `document`,
// pas de `SVGElement`). Un graphique du ReportSpec est toujours calculé ici puis rendu deux fois
// (aperçu écran à venir, export PDF dès cette phase) à partir des mêmes nombres : un écart entre
// les deux serait un bug de cette couche, jamais un bug de rendu.
import { scaleBand, scaleLinear } from 'd3-scale';
import { arc as d3arc, line as d3line, pie as d3pie } from 'd3-shape';

export interface Dimensions {
  width: number;
  height: number;
}

export interface BarRect {
  categoryIndex: number;
  seriesIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AxisTick {
  label: string;
  /** Position au centre de la catégorie (échelle de bande) ou à la valeur (échelle linéaire), en coordonnées locales du graphique. */
  position: number;
}

export interface CategoricalChartGeometry {
  bars: BarRect[];
  xTicks: AxisTick[];
  yTicks: AxisTick[];
  /** Valeur maximale de l'axe des valeurs, pour dessiner l'axe/la grille si besoin. */
  maxValue: number;
}

function parseSeriesValue(v: string): number {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Barres groupées ou empilées. `stacked: false` place les séries côte à côte dans chaque
 * catégorie ; `stacked: true` les empile verticalement. `horizontal` échange x et y en sortie
 * (les consommateurs n'ont qu'à dessiner des `Rect` avec ces coordonnées, sans logique d'orientation).
 */
export function computeBarChartGeometry(
  categories: string[],
  series: { label: string; values: string[] }[],
  dims: Dimensions,
  options: { stacked: boolean; horizontal: boolean; yTickCount?: number },
): CategoricalChartGeometry {
  const numericSeries = series.map((s) => s.values.map(parseSeriesValue));
  const maxValue = options.stacked
    ? Math.max(0, ...categories.map((_, ci) => numericSeries.reduce((sum, vals) => sum + (vals[ci] ?? 0), 0)))
    : Math.max(0, ...numericSeries.flat());

  const categoryScale = scaleBand<string>()
    .domain(categories)
    .range([0, options.horizontal ? dims.height : dims.width])
    .padding(0.2);
  const valueScale = scaleLinear()
    .domain([0, maxValue || 1])
    .range([0, options.horizontal ? dims.width : dims.height]);

  const bars: BarRect[] = [];
  const seriesCount = series.length || 1;
  const bandWidth = categoryScale.bandwidth();
  const groupedWidth = options.stacked ? bandWidth : bandWidth / seriesCount;

  categories.forEach((cat, ci) => {
    let stackedOffset = 0;
    numericSeries.forEach((vals, si) => {
      const value = vals[ci] ?? 0;
      const length = valueScale(value) ?? 0;
      const catPos = categoryScale(cat) ?? 0;
      const crossAxisPos = options.stacked ? catPos : catPos + si * groupedWidth;

      if (options.horizontal) {
        const x = options.stacked ? valueScale(stackedOffset) ?? 0 : 0;
        bars.push({ categoryIndex: ci, seriesIndex: si, x, y: crossAxisPos, width: length, height: groupedWidth });
      } else {
        // En repère écran/PDF, y croît vers le bas : une barre verticale part du bas du graphique.
        const totalHeight = options.horizontal ? 0 : dims.height;
        const y = options.stacked ? totalHeight - (valueScale(stackedOffset) ?? 0) - length : totalHeight - length;
        bars.push({ categoryIndex: ci, seriesIndex: si, x: crossAxisPos, y, width: groupedWidth, height: length });
      }
      stackedOffset += value;
    });
  });

  const xTicks: AxisTick[] = categories.map((cat) => ({ label: cat, position: (categoryScale(cat) ?? 0) + bandWidth / 2 }));
  const tickCount = options.yTickCount ?? 4;
  const yTicks: AxisTick[] = valueScale.ticks(tickCount).map((v) => ({ label: String(v), position: dims.height - (valueScale(v) ?? 0) }));

  return { bars, xTicks, yTicks, maxValue };
}

export interface LineSeriesGeometry {
  label: string;
  /** Chemin SVG (attribut `d`), utilisable tel quel par `<path>` (DOM) ou `<Path>` (@react-pdf/renderer). */
  path: string;
  points: { x: number; y: number }[];
}

export interface LineChartGeometry {
  series: LineSeriesGeometry[];
  xTicks: AxisTick[];
  yTicks: AxisTick[];
  maxValue: number;
}

export function computeLineChartGeometry(
  categories: string[],
  series: { label: string; values: string[] }[],
  dims: Dimensions,
  options: { yTickCount?: number } = {},
): LineChartGeometry {
  const numericSeries = series.map((s) => s.values.map(parseSeriesValue));
  const maxValue = Math.max(0, ...numericSeries.flat());

  const xScale = scaleBand<string>().domain(categories).range([0, dims.width]).padding(0.5);
  const yScale = scaleLinear()
    .domain([0, maxValue || 1])
    .range([0, dims.height]);

  const lineGen = d3line<number>()
    .x((_, i) => (xScale(categories[i]) ?? 0) + xScale.bandwidth() / 2)
    .y((v) => dims.height - (yScale(v) ?? 0));

  const seriesGeometry: LineSeriesGeometry[] = series.map((s, si) => {
    const values = numericSeries[si];
    const path = lineGen(values) ?? '';
    const points = values.map((v, i) => ({ x: (xScale(categories[i]) ?? 0) + xScale.bandwidth() / 2, y: dims.height - (yScale(v) ?? 0) }));
    return { label: s.label, path, points };
  });

  const xTicks: AxisTick[] = categories.map((cat) => ({ label: cat, position: (xScale(cat) ?? 0) + xScale.bandwidth() / 2 }));
  const tickCount = options.yTickCount ?? 4;
  const yTicks: AxisTick[] = yScale.ticks(tickCount).map((v) => ({ label: String(v), position: dims.height - (yScale(v) ?? 0) }));

  return { series: seriesGeometry, xTicks, yTicks, maxValue };
}

export interface PieSlice {
  label: string;
  value: number;
  /** Chemin SVG de la part, à dessiner autour du centre `(cx, cy)`. */
  path: string;
  /** Position suggérée pour l'étiquette (centroïde de la part). */
  labelPosition: { x: number; y: number };
  fraction: number;
}

export interface PieChartGeometry {
  slices: PieSlice[];
  cx: number;
  cy: number;
  outerRadius: number;
}

/** `donut: true` perce un trou central (anneau) plutôt qu'un disque plein. */
export function computePieChartGeometry(categories: string[], values: string[], dims: Dimensions, options: { donut: boolean }): PieChartGeometry {
  const numeric = values.map(parseSeriesValue);
  const total = numeric.reduce((a, b) => a + b, 0);
  const cx = dims.width / 2;
  const cy = dims.height / 2;
  const outerRadius = Math.min(dims.width, dims.height) / 2;
  const innerRadius = options.donut ? outerRadius * 0.55 : 0;

  const pieGen = d3pie<number>().value((v) => v).sort(null);
  const arcGen = d3arc<{ startAngle: number; endAngle: number }>().innerRadius(innerRadius).outerRadius(outerRadius);
  const centroidArc = d3arc<{ startAngle: number; endAngle: number }>()
    .innerRadius((innerRadius + outerRadius) / 2)
    .outerRadius((innerRadius + outerRadius) / 2);

  const arcs = pieGen(numeric);
  const slices: PieSlice[] = arcs.map((a, i) => {
    const path = arcGen(a) ?? '';
    const [lx, ly] = centroidArc.centroid(a);
    return {
      label: categories[i] ?? '',
      value: numeric[i] ?? 0,
      path,
      labelPosition: { x: cx + lx, y: cy + ly },
      fraction: total > 0 ? (numeric[i] ?? 0) / total : 0,
    };
  });

  return { slices, cx, cy, outerRadius };
}
