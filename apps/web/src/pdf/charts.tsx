import * as React from 'react';
import { ClipPath, Defs, G, Line, Path, Rect, Svg, Text } from '@react-pdf/renderer';
import { computeBarChartGeometry, computeLineChartGeometry, computePieChartGeometry } from './reportGeometry.ts';
import type { ComputedChartBlock } from '../engine/reportSpecCompute.ts';
import { REPORT_FONT_FAMILY } from './fonts.ts';

// Palette à luminance clairement échelonnée (reste distinguable convertie en niveaux de gris) +
// un motif de hachures par série au-delà de la première, pour ne jamais dépendre de la seule
// teinte — l'exigence explicite du cahier des charges ("imprimées en noir et blanc").
const SERIES_COLORS = ['#1f3a5f', '#7a1f2b', '#3f6b3f', '#8a6d1f', '#5a3f7a'];
const AXIS_COLOR = '#6b7280';
const GRID_COLOR = '#e5e7eb';

const CHART_WIDTH = 460;
const CHART_HEIGHT = 220;
const MARGIN = { top: 12, right: 12, bottom: 28, left: 36 };
const PLOT_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

/** Hachures diagonales dessinées à la main (react-pdf n'a pas de <pattern> SVG) et rognées au rectangle de la barre. */
function BarHatch({ x, y, width, height, seriesIndex }: { x: number; y: number; width: number; height: number; seriesIndex: number }) {
  if (seriesIndex === 0 || width <= 0 || height <= 0) return null;
  const spacing = 5;
  const lines: React.ReactElement[] = [];
  const diag = width + height;
  for (let offset = -height; offset < diag; offset += spacing) {
    lines.push(
      <Line key={offset} x1={x + offset} y1={y + height} x2={x + offset + height} y2={y} stroke="#ffffff" strokeWidth={seriesIndex === 1 ? 1 : 1.6} />,
    );
  }
  const clipId = `clip-${x.toFixed(1)}-${y.toFixed(1)}-${seriesIndex}`;
  return (
    <G>
      <Defs>
        <ClipPath id={clipId}>
          <Rect x={x} y={y} width={width} height={height} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>{lines}</G>
    </G>
  );
}

function Legend({ series }: { series: { label: string }[] }) {
  if (series.length <= 1) return null;
  return (
    <G>
      {series.map((s, i) => (
        <G key={i}>
          <Rect x={MARGIN.left + i * 120} y={2} width={8} height={8} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
          <Text x={MARGIN.left + i * 120 + 12} y={9} style={{ fontSize: 7, fontFamily: REPORT_FONT_FAMILY }}>
            {s.label}
          </Text>
        </G>
      ))}
    </G>
  );
}

function BarOrHistogramChart({ block, stacked, horizontal }: { block: ComputedChartBlock; stacked: boolean; horizontal: boolean }) {
  const geo = computeBarChartGeometry(block.categories, block.series, { width: PLOT_WIDTH, height: PLOT_HEIGHT }, { stacked, horizontal });
  return (
    <Svg width={CHART_WIDTH} height={CHART_HEIGHT + 14}>
      <G transform="translate(0, 14)">
        <Legend series={block.series} />
      </G>
      <G transform={`translate(${MARGIN.left}, ${MARGIN.top + 14})`}>
        <Line x1={0} y1={PLOT_HEIGHT} x2={PLOT_WIDTH} y2={PLOT_HEIGHT} stroke={AXIS_COLOR} strokeWidth={0.75} />
        <Line x1={0} y1={0} x2={0} y2={PLOT_HEIGHT} stroke={AXIS_COLOR} strokeWidth={0.75} />
        {geo.yTicks.map((t, i) => (
          <G key={i}>
            <Line x1={0} y1={t.position} x2={PLOT_WIDTH} y2={t.position} stroke={GRID_COLOR} strokeWidth={0.5} />
            <Text x={-6} y={t.position + 2} style={{ fontSize: 6, fontFamily: REPORT_FONT_FAMILY, textAnchor: 'end' }}>
              {t.label}
            </Text>
          </G>
        ))}
        {geo.bars.map((b, i) => (
          <G key={i}>
            <Rect x={b.x} y={b.y} width={Math.max(b.width, 0)} height={Math.max(b.height, 0)} fill={SERIES_COLORS[b.seriesIndex % SERIES_COLORS.length]} />
            <BarHatch x={b.x} y={b.y} width={b.width} height={b.height} seriesIndex={b.seriesIndex} />
          </G>
        ))}
        {geo.xTicks.map((t, i) => (
          <Text key={i} x={t.position} y={PLOT_HEIGHT + 12} style={{ fontSize: 6, fontFamily: REPORT_FONT_FAMILY, textAnchor: 'middle' }}>
            {t.label}
          </Text>
        ))}
      </G>
    </Svg>
  );
}

const DASH_PATTERNS = [undefined, '4,2', '1,2', '6,2,1,2'];

function LineChart({ block }: { block: ComputedChartBlock }) {
  const geo = computeLineChartGeometry(block.categories, block.series, { width: PLOT_WIDTH, height: PLOT_HEIGHT });
  return (
    <Svg width={CHART_WIDTH} height={CHART_HEIGHT + 14}>
      <G transform="translate(0, 14)">
        <Legend series={block.series} />
      </G>
      <G transform={`translate(${MARGIN.left}, ${MARGIN.top + 14})`}>
        <Line x1={0} y1={PLOT_HEIGHT} x2={PLOT_WIDTH} y2={PLOT_HEIGHT} stroke={AXIS_COLOR} strokeWidth={0.75} />
        <Line x1={0} y1={0} x2={0} y2={PLOT_HEIGHT} stroke={AXIS_COLOR} strokeWidth={0.75} />
        {geo.yTicks.map((t, i) => (
          <G key={i}>
            <Line x1={0} y1={t.position} x2={PLOT_WIDTH} y2={t.position} stroke={GRID_COLOR} strokeWidth={0.5} />
            <Text x={-6} y={t.position + 2} style={{ fontSize: 6, fontFamily: REPORT_FONT_FAMILY, textAnchor: 'end' }}>
              {t.label}
            </Text>
          </G>
        ))}
        {geo.series.map((s, i) => (
          <Path key={i} d={s.path} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={1.4} fill="none" strokeDasharray={DASH_PATTERNS[i % DASH_PATTERNS.length]} />
        ))}
        {geo.xTicks.map((t, i) => (
          <Text key={i} x={t.position} y={PLOT_HEIGHT + 12} style={{ fontSize: 6, fontFamily: REPORT_FONT_FAMILY, textAnchor: 'middle' }}>
            {t.label}
          </Text>
        ))}
      </G>
    </Svg>
  );
}

function PieOrDonutChart({ block, donut }: { block: ComputedChartBlock; donut: boolean }) {
  const values = block.series[0]?.values ?? [];
  const geo = computePieChartGeometry(block.categories, values, { width: 160, height: 160 }, { donut });
  return (
    <Svg width={CHART_WIDTH} height={180}>
      <G transform={`translate(${(CHART_WIDTH - 160) / 2}, 10)`}>
        {geo.slices.map((s, i) => (
          <Path key={i} d={s.path} fill={SERIES_COLORS[i % SERIES_COLORS.length]} stroke="#ffffff" strokeWidth={1} transform={`translate(${geo.cx}, ${geo.cy})`} />
        ))}
      </G>
      <G transform="translate(190, 10)">
        {geo.slices.map((s, i) => (
          <G key={i} transform={`translate(0, ${i * 12})`}>
            <Rect x={0} y={0} width={8} height={8} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
            <Text x={12} y={7} style={{ fontSize: 7, fontFamily: REPORT_FONT_FAMILY }}>
              {s.label} — {(s.fraction * 100).toFixed(0)}% ({s.value})
            </Text>
          </G>
        ))}
      </G>
    </Svg>
  );
}

export function ChartFigure({ block }: { block: ComputedChartBlock }) {
  switch (block.chartType) {
    case 'bar':
      return <BarOrHistogramChart block={block} stacked={false} horizontal={block.orientation === 'horizontal'} />;
    case 'bar_stacked':
      return <BarOrHistogramChart block={block} stacked={true} horizontal={block.orientation === 'horizontal'} />;
    case 'histogram':
      return <BarOrHistogramChart block={block} stacked={false} horizontal={false} />;
    case 'line':
      return <LineChart block={block} />;
    case 'pie':
      return <PieOrDonutChart block={block} donut={false} />;
    case 'donut':
      return <PieOrDonutChart block={block} donut={true} />;
  }
}
