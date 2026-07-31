import { Undo2, Redo2, FileText } from 'lucide-react';
import { canRedo, canUndo, moveCursor, redo, undo } from '@csv-studio/core/engine/pipeline.ts';
import type { OperationReport, Pipeline, Table } from '@csv-studio/core/engine/types.ts';
import { useWorkspace } from '@/state/workspace.tsx';
import { Button } from '@/components/ui/button.tsx';
import { operationLabel, buildPipelineReportText } from '@csv-studio/core/report.ts';
import { downloadTextFile } from '@/lib/download.ts';
import { suggestExportFilename } from '@csv-studio/core/csv.ts';
import { cn } from '@/lib/utils.ts';

export function PipelineSidebar({
  entryId,
  sourceTable,
  pipeline,
  reportsByIndex,
}: {
  entryId: string;
  sourceTable: Table;
  pipeline: Pipeline;
  reportsByIndex: Map<number, OperationReport>;
}) {
  const { setPipeline } = useWorkspace();

  const exportReport = () => {
    const text = buildPipelineReportText(sourceTable, pipeline, reportsByIndex);
    downloadTextFile(suggestExportFilename(sourceTable.name, 'rapport.txt'), text, 'text/plain;charset=utf-8;');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Pipeline</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" disabled={!canUndo(pipeline)} onClick={() => setPipeline(entryId, undo(pipeline))} title="Annuler">
            <Undo2 size={14} />
          </Button>
          <Button variant="ghost" size="icon" disabled={!canRedo(pipeline)} onClick={() => setPipeline(entryId, redo(pipeline))} title="Rétablir">
            <Redo2 size={14} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <button
          onClick={() => setPipeline(entryId, moveCursor(pipeline, 0))}
          className={cn(
            'flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left hover:bg-surface-alt',
            pipeline.cursor === 0 && 'bg-surface-alt',
          )}
        >
          <span className="text-[12.5px] font-medium text-text">Source</span>
          <span className="text-[11px] text-text-muted">{sourceTable.rows.length.toLocaleString('fr-FR')} lignes</span>
        </button>

        {pipeline.steps.map((step, i) => {
          const report = reportsByIndex.get(i);
          const delta = report ? report.rowsOut - report.rowsIn : 0;
          const isActive = pipeline.cursor === i + 1;
          return (
            <button
              key={step.operation.id}
              onClick={() => setPipeline(entryId, moveCursor(pipeline, i + 1))}
              className={cn(
                'flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left hover:bg-surface-alt',
                isActive && 'bg-surface-alt',
                !step.operation.enabled && 'opacity-50',
              )}
            >
              <span className="text-[12.5px] font-medium text-text">
                {i + 1}. {step.operation.label ?? operationLabel(step.operation.type)}
              </span>
              {report && (
                <span className="text-[11px] text-text-muted">
                  {report.rowsOut.toLocaleString('fr-FR')} lignes
                  {delta !== 0 && <span className={delta < 0 ? 'text-destructive' : 'text-validated'}> ({delta > 0 ? '+' : ''}{delta})</span>}
                </span>
              )}
            </button>
          );
        })}

        {pipeline.steps.length === 0 && (
          <p className="px-3 py-4 text-[11.5px] text-text-faint">
            Aucune étape pour l'instant. Les opérations de colonnes, filtres, dédoublonnage et rapprochement viendront ici.
          </p>
        )}
      </div>

      <div className="border-t border-border p-2">
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={exportReport}>
          <FileText size={14} />
          Exporter le rapport (.txt)
        </Button>
      </div>
    </div>
  );
}
