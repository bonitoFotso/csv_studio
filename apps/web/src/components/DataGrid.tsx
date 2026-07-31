import * as React from 'react';
import { GripVertical } from 'lucide-react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ColumnId, Row, Table as EngineTable } from '@csv-studio/core/engine/types.ts';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import { cn } from '@/lib/utils.ts';

const ROW_HEIGHT = 28;
const LEADING_COLUMNS = 2; // numéro de ligne + case à cocher, avant les colonnes réelles

function Cell({ value }: { value: string }) {
  if (value === '') {
    return (
      <span className="cell-empty" aria-label="valeur vide">
        vide
      </span>
    );
  }
  return <span className="cell-value">{value}</span>;
}

export interface DataGridProps {
  table: EngineTable;
  selectedColumnIds: Set<ColumnId>;
  onToggleColumn: (id: ColumnId) => void;
  onToggleAllColumns: (ids: ColumnId[], select: boolean) => void;
  onReorderVisibleColumns: (newVisibleOrder: ColumnId[]) => void;
}

export function DataGrid({ table, selectedColumnIds, onToggleColumn, onToggleAllColumns, onReorderVisibleColumns }: DataGridProps) {
  const visibleColumns = React.useMemo(() => table.columns.filter((c) => !c.hidden), [table.columns]);
  const [dragOverId, setDragOverId] = React.useState<ColumnId | null>(null);
  const dragIdRef = React.useRef<ColumnId | null>(null);

  const columnDefs = React.useMemo<ColumnDef<Row>[]>(
    () => [
      { id: '__row_number', header: '', size: 40 },
      { id: '__select', header: '', size: 32 },
      ...visibleColumns.map(
        (col): ColumnDef<Row> => ({
          id: col.id,
          header: col.name,
          size: 200,
          accessorFn: (row) => row.cells[col.id] ?? '',
          cell: (ctx) => <Cell value={ctx.getValue<string>()} />,
        }),
      ),
    ],
    [visibleColumns],
  );

  const reactTable = useReactTable({
    data: table.rows,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowModel = reactTable.getRowModel();

  const virtualizer = useVirtualizer({
    count: rowModel.rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  const allVisibleSelected = visibleColumns.length > 0 && visibleColumns.every((c) => selectedColumnIds.has(c.id));

  const handleDrop = (targetId: ColumnId) => {
    const draggedId = dragIdRef.current;
    setDragOverId(null);
    dragIdRef.current = null;
    if (!draggedId || draggedId === targetId) return;
    const ids = visibleColumns.map((c) => c.id);
    const fromIndex = ids.indexOf(draggedId);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = [...ids];
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, draggedId);
    onReorderVisibleColumns(reordered);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden border border-border bg-surface">
      <div ref={parentRef} className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-surface-alt">
            <tr>
              {reactTable.getFlatHeaders().map((header, i) => {
                if (header.column.id === '__row_number') {
                  return <th key={header.id} style={{ width: header.getSize() }} className="border-b border-r border-border" />;
                }
                if (header.column.id === '__select') {
                  return (
                    <th key={header.id} style={{ width: header.getSize() }} className="border-b border-r border-border px-1.5">
                      <Checkbox
                        checked={allVisibleSelected}
                        onChange={() => onToggleAllColumns(visibleColumns.map((c) => c.id), !allVisibleSelected)}
                        aria-label="Sélectionner toutes les colonnes visibles"
                      />
                    </th>
                  );
                }
                const columnId = header.column.id;
                const isSelected = selectedColumnIds.has(columnId);
                return (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    draggable
                    onDragStart={() => {
                      dragIdRef.current = columnId;
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverId(columnId);
                    }}
                    onDragLeave={() => setDragOverId((id) => (id === columnId ? null : id))}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(columnId);
                    }}
                    className={cn(
                      'cursor-grab select-none border-b border-r border-border px-2 py-1.5 font-semibold text-text-muted last:border-r-0',
                      isSelected && 'bg-validated-bg text-validated',
                      dragOverId === columnId && 'outline outline-2 -outline-offset-2 outline-text-muted',
                    )}
                    title={i >= LEADING_COLUMNS ? 'Glisser pour réordonner' : undefined}
                  >
                    <span className="flex items-center gap-1">
                      <GripVertical size={11} className="shrink-0 text-text-faint" />
                      <span
                        className="truncate"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleColumn(columnId);
                        }}
                        title="Cliquer pour sélectionner cette colonne"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: paddingTop }} colSpan={columnDefs.length} />
              </tr>
            )}
            {virtualRows.map((virtualRow) => {
              const row = rowModel.rows[virtualRow.index];
              return (
                <tr key={row.id} className={cn('h-[28px]', virtualRow.index % 2 === 1 && 'bg-bg/40')}>
                  {row.getVisibleCells().map((cell) => {
                    if (cell.column.id === '__row_number') {
                      return (
                        <td key={cell.id} className="border-b border-r border-border px-2 py-1 text-text-faint">
                          {virtualRow.index + 1}
                        </td>
                      );
                    }
                    if (cell.column.id === '__select') {
                      return <td key={cell.id} className="border-b border-r border-border" />;
                    }
                    return (
                      <td
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        className={cn(
                          'truncate border-b border-r border-border px-2 py-1 last:border-r-0',
                          selectedColumnIds.has(cell.column.id) && 'bg-validated-bg/40',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {paddingBottom > 0 && (
              <tr>
                <td style={{ height: paddingBottom }} colSpan={columnDefs.length} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-1 text-[11px] text-text-muted">
        <span>{table.rows.length.toLocaleString('fr-FR')} lignes</span>
        <span>
          {visibleColumns.length} colonnes visibles
          {visibleColumns.length !== table.columns.length ? ` (${table.columns.length - visibleColumns.length} masquées)` : ''}
        </span>
      </div>
    </div>
  );
}
