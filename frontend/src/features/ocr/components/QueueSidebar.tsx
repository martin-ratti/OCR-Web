import { useMemo, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { List, type RowComponentProps } from 'react-window';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Files,
  ImageIcon,
  RefreshCw,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { OcrFile, OcrStatus } from '../../../store/useOcrStore';

export type QueueFilter = 'all' | OcrStatus;

interface QueueSidebarProps {
  files: OcrFile[];
  activeFileId: string | null;
  working: boolean;
  successCount: number;
  errorCount: number;
  filter: QueueFilter;
  onFilterChange: (f: QueueFilter) => void;
  onSelect: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onRetryAllErrors: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAllVisible: (ids: string[], allSelected: boolean) => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkRetry: () => void;
  onReorder: (fromId: string, toId: string) => void;
}

const ROW_HEIGHT = 64;
const VIRTUALIZE_THRESHOLD = 50;

interface RowProps {
  filteredFiles: OcrFile[];
  activeFileId: string | null;
  working: boolean;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleSelect: (id: string) => void;
}

function FileRow({
  filteredFiles,
  activeFileId,
  working,
  selectedIds,
  onSelect,
  onRetry,
  onRemove,
  onToggleSelect,
  index,
  style,
}: RowComponentProps<RowProps>) {
  const file = filteredFiles[index];
  if (!file) return null;
  const isActive = activeFileId === file.id;
  return (
    <div style={style} className="px-1">
      <FileRowInner
        file={file}
        isActive={isActive}
        working={working}
        isSelected={selectedIds.has(file.id)}
        onSelect={onSelect}
        onRetry={onRetry}
        onRemove={onRemove}
        onToggleSelect={onToggleSelect}
      />
    </div>
  );
}

interface RowInnerProps {
  file: OcrFile;
  isActive: boolean;
  working: boolean;
  isSelected: boolean;
  draggable?: boolean;
  onSelect: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleSelect: (id: string) => void;
}

function FileRowInner({
  file,
  isActive,
  working,
  isSelected,
  draggable,
  onSelect,
  onRetry,
  onRemove,
  onToggleSelect,
}: RowInnerProps) {
  return (
    <div
      className={`relative flex items-center gap-2 w-full text-left rounded-2xl transition-all ${
        isActive
          ? 'bg-pink-100 border-2 border-pink-400 shadow-md ring-1 ring-pink-200 pl-1'
          : isSelected
          ? 'bg-violet-50 border-2 border-violet-300'
          : 'hover:bg-pink-50 border-2 border-transparent'
      }`}
    >
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-pink-500"
        />
      )}
      {draggable && (
        <span
          className="pl-1.5 cursor-grab active:cursor-grabbing text-zinc-400 hover:text-pink-400 touch-none"
          aria-label="Mover (arrastrar)"
          title="Arrastrá para reordenar"
        >
          <GripVertical className="w-4 h-4" aria-hidden />
        </span>
      )}
      <label
        className={`${draggable ? '' : 'pl-2'} flex items-center cursor-pointer`}
        aria-label={`Seleccionar ${file.file.name} para acciones en lote`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(file.id)}
          disabled={working}
          className="w-4 h-4 rounded border-pink-300 text-pink-500 focus:ring-pink-400 focus:ring-offset-0 accent-pink-500 cursor-pointer disabled:opacity-40"
        />
      </label>
      <button
        onClick={() => onSelect(file.id)}
        aria-pressed={isActive}
        aria-label={`Seleccionar ${file.file.name}, estado ${file.status}`}
        className="flex items-center gap-3 flex-1 text-left p-3 btn-bounce min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 rounded-2xl"
      >
        <div className="shrink-0">
          {file.status === 'success' ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-400" aria-hidden />
          ) : file.status === 'processing' ? (
            <CircleDashed
              className="w-6 h-6 text-pink-400 motion-safe:animate-spin"
              aria-hidden
            />
          ) : file.status === 'error' ? (
            <AlertTriangle className="w-6 h-6 text-rose-400" aria-hidden />
          ) : (
            <ImageIcon
              className={`w-5 h-5 ${isActive ? 'text-pink-500' : 'text-zinc-300'}`}
              aria-hidden
            />
          )}
        </div>
        <span
          className={`truncate flex-1 text-sm font-bold ${
            isActive
              ? 'text-pink-600'
              : file.status === 'success'
              ? 'text-zinc-700'
              : 'text-zinc-500'
          }`}
        >
          {file.file.name}
        </span>
      </button>
      <div className="flex items-center gap-0.5 pr-2">
        {file.status === 'error' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onRetry(file.id)}
                disabled={working}
                aria-label={`Reintentar ${file.file.name}`}
                className="p-1.5 rounded-full text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
              >
                <RefreshCw className="w-4 h-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>Reintentar</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onRemove(file.id)}
              disabled={working}
              aria-label={`Eliminar ${file.file.name}`}
              className="p-1.5 rounded-full text-zinc-300 hover:text-rose-500 hover:bg-rose-50 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
            >
              <Trash2 className="w-4 h-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent>Eliminar</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

const FILTER_LABELS: Record<QueueFilter, string> = {
  all: 'Todos',
  idle: 'Pendientes',
  processing: 'En curso',
  success: 'OK',
  error: 'Error',
};

export function QueueSidebar({
  files,
  activeFileId,
  working,
  successCount,
  errorCount,
  filter,
  onFilterChange,
  onSelect,
  onRetry,
  onRemove,
  onRetryAllErrors,
  collapsed,
  onToggleCollapsed,
  selectedIds,
  onToggleSelect,
  onSelectAllVisible,
  onClearSelection,
  onBulkDelete,
  onBulkRetry,
  onReorder,
}: QueueSidebarProps) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const filtered = useMemo(
    () => (filter === 'all' ? files : files.filter((f) => f.status === filter)),
    [files, filter],
  );
  const useVirtual = filtered.length > VIRTUALIZE_THRESHOLD;
  const selectionCount = selectedIds.size;
  const visibleIds = useMemo(() => filtered.map((f) => f.id), [filtered]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const bulkRetryEligible = useMemo(
    () => files.some((f) => selectedIds.has(f.id) && f.status !== 'processing'),
    [files, selectedIds],
  );

  if (collapsed) {
    return (
      <aside
        className="w-12 shrink-0 border-r-2 border-pink-100 bg-white/60 flex flex-col items-center py-3"
        aria-label="Cola de imágenes (colapsada)"
      >
        <button
          onClick={onToggleCollapsed}
          aria-label="Expandir cola"
          className="btn-bounce p-2 rounded-full hover:bg-pink-100 text-pink-500"
        >
          <Files className="w-5 h-5" aria-hidden />
        </button>
        <span className="mt-2 text-[10px] font-extrabold text-pink-500">{files.length}</span>
      </aside>
    );
  }

  return (
    <aside
      className="w-full md:w-72 shrink-0 border-b-2 md:border-b-0 md:border-r-2 border-pink-100 bg-white/60 p-3 flex flex-col gap-2 max-h-56 md:max-h-none md:h-full"
      aria-label="Cola de imágenes"
    >
      <div className="pb-2 mb-1 border-b-2 border-pink-100 bg-white/90 font-black text-[12px] text-pink-400 uppercase flex items-center justify-between px-2 gap-2">
        <button
          onClick={onToggleCollapsed}
          className="flex items-center gap-1 hover:text-pink-600"
          aria-label="Colapsar cola"
        >
          <Files className="w-3.5 h-3.5" aria-hidden /> La data
        </button>
        <div className="flex items-center gap-1">
          {successCount > 0 && (
            <Badge className="bg-emerald-100 text-emerald-700 border-0 hover:bg-emerald-100">
              <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden />
              {successCount}
            </Badge>
          )}
          {errorCount > 0 && (
            <Badge className="bg-rose-100 text-rose-700 border-0 hover:bg-rose-100">
              <AlertTriangle className="w-3 h-3 mr-1" aria-hidden />
              {errorCount}
            </Badge>
          )}
          <Badge className="bg-pink-100 text-pink-600 border-0 hover:bg-pink-100">
            {files.length}
          </Badge>
        </div>
      </div>

      {files.length > 0 && (
        <div className="flex items-center justify-between gap-2 px-2 h-7">
          <label className="flex items-center gap-1.5 text-[11px] font-extrabold text-pink-500 cursor-pointer h-full">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={() => onSelectAllVisible(visibleIds, allVisibleSelected)}
              disabled={working || visibleIds.length === 0}
              className="w-4 h-4 rounded border-pink-300 accent-pink-500 disabled:opacity-40"
              aria-label={allVisibleSelected ? 'Deseleccionar todos visibles' : 'Seleccionar todos visibles'}
            />
            Todos
          </label>
          {selectionCount > 0 && (
            <span className="inline-flex items-center text-[11px] font-extrabold text-pink-600 bg-pink-100 rounded-full px-2 h-5 whitespace-nowrap">
              {selectionCount} seleccionado{selectionCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}

      {selectionCount > 0 && (
        <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 px-2 py-1.5 bg-violet-50 border border-violet-200 rounded-xl">
          <button
            onClick={onBulkRetry}
            disabled={working || !bulkRetryEligible}
            className="h-7 inline-flex items-center justify-center gap-1 px-2.5 rounded-full text-[11px] font-extrabold border-2 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <RotateCw className="w-3.5 h-3.5 shrink-0" aria-hidden />
            Reintentar
          </button>
          <button
            onClick={onBulkDelete}
            disabled={working}
            className="h-7 inline-flex items-center justify-center gap-1 px-2.5 rounded-full text-[11px] font-extrabold border-2 bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
            Eliminar
          </button>
          <button
            onClick={onClearSelection}
            className="h-7 inline-flex items-center justify-center px-2.5 rounded-full text-[11px] font-extrabold border-2 bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50 transition-colors whitespace-nowrap"
          >
            Limpiar
          </button>
        </div>
      )}

      <div
        className="flex flex-wrap gap-1.5 px-1 pt-1"
        role="tablist"
        aria-label="Filtrar cola por estado"
      >
        {(Object.keys(FILTER_LABELS) as QueueFilter[]).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => onFilterChange(f)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border-2 transition-all ${
              filter === f
                ? 'bg-pink-500 text-white border-pink-500 shadow-sm scale-105'
                : 'bg-white text-pink-500 border-pink-200 hover:bg-pink-50 hover:border-pink-300'
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
        {errorCount > 0 && (
          <button
            onClick={onRetryAllErrors}
            disabled={working}
            className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold border-2 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" aria-hidden />
            Reintentar errores ({errorCount})
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="py-6 text-center text-pink-400 text-xs font-bold">
          No hay archivos en este filtro.
        </div>
      ) : useVirtual ? (
        <div className="flex-1 min-h-0">
          <List
            rowComponent={FileRow}
            rowCount={filtered.length}
            rowHeight={ROW_HEIGHT}
            rowProps={{
              filteredFiles: filtered,
              activeFileId,
              working,
              selectedIds,
              onSelect,
              onRetry,
              onRemove,
              onToggleSelect,
            }}
            style={{ height: '100%' }}
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto custom-scrollbar" role="list">
          {filtered.map((file) => {
            const isDragOver = dragOverId === file.id;
            return (
              <li
                key={file.id}
                draggable={!working && filter === 'all'}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', file.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverId !== file.id) setDragOverId(file.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === file.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromId = e.dataTransfer.getData('text/plain');
                  setDragOverId(null);
                  if (fromId && fromId !== file.id) onReorder(fromId, file.id);
                }}
                onDragEnd={() => setDragOverId(null)}
                className={isDragOver ? 'ring-2 ring-pink-400 rounded-2xl' : ''}
              >
                <FileRowInner
                  file={file}
                  isActive={activeFileId === file.id}
                  working={working}
                  isSelected={selectedIds.has(file.id)}
                  draggable={!working && filter === 'all'}
                  onSelect={onSelect}
                  onRetry={onRetry}
                  onRemove={onRemove}
                  onToggleSelect={onToggleSelect}
                />
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
