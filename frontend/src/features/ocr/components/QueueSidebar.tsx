import { memo, useMemo, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Files,
  Highlighter,
  ImageIcon,
  RotateCcw,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isEmptyExtractionText } from '../../../lib/textFormatters';
import type { OcrFile } from '../../../store/useOcrStore';

export type QueueFilter = 'all' | 'with_text' | 'no_highlight' | 'error';

interface QueueSidebarProps {
  files: OcrFile[];
  activeFileId: string | null;
  working: boolean;
  successCount: number;
  errorCount: number;
  onSelect: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onRetryAllErrors: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onReorder: (fromId: string, toId: string) => void;
}

const ROW_HEIGHT = 64;
const VIRTUALIZE_THRESHOLD = 20;

interface RowProps {
  filteredFiles: OcrFile[];
  activeFileId: string | null;
  working: boolean;
  onSelect: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

function FileRow({
  filteredFiles,
  activeFileId,
  working,
  onSelect,
  onRetry,
  onRemove,
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
        onSelect={onSelect}
        onRetry={onRetry}
        onRemove={onRemove}
      />
    </div>
  );
}

interface RowInnerProps {
  file: OcrFile;
  isActive: boolean;
  working: boolean;
  onSelect: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

const FileRowInner = memo(function FileRowInner({
  file,
  isActive,
  working,
  onSelect,
  onRetry,
  onRemove,
}: RowInnerProps) {
  const isNoHighlight = file.status === 'success' && isEmptyExtractionText(file.resultText);

  return (
    <div
      className={`relative flex items-center gap-2 w-full text-left rounded-2xl transition-all ${
        isActive
          ? 'bg-pink-100 dark:bg-pink-950/60 border-2 border-pink-400 dark:border-pink-600 shadow-md ring-1 ring-pink-200 dark:ring-pink-900 pl-1'
          : 'hover:bg-pink-50 dark:hover:bg-zinc-800/70 border-2 border-transparent'
      }`}
    >
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-pink-500"
        />
      )}
      <button
        onClick={() => onSelect(file.id)}
        aria-pressed={isActive}
        aria-label={`Ver ${file.file.name}, estado ${isNoHighlight ? 'sin resaltado' : file.status}`}
        className="flex items-center gap-2.5 flex-1 text-left p-2.5 pl-3 btn-bounce min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 rounded-2xl"
      >
        <div className="shrink-0">
          {file.status === 'success' ? (
            isNoHighlight ? (
              <Highlighter
                className="w-5 h-5 text-amber-400 dark:text-amber-500 opacity-85"
                aria-hidden
              />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400" aria-hidden />
            )
          ) : file.status === 'processing' ? (
            <CircleDashed
              className="w-5 h-5 text-pink-400 motion-safe:animate-spin"
              aria-hidden
            />
          ) : file.status === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-rose-500 dark:text-rose-400" aria-hidden />
          ) : (
            <ImageIcon
              className={`w-5 h-5 ${
                isActive ? 'text-pink-500 dark:text-pink-300' : 'text-zinc-300 dark:text-zinc-600'
              }`}
              aria-hidden
            />
          )}
        </div>
        <div className="min-w-0 flex-1 flex flex-col">
          <span
            className={`truncate text-sm font-bold ${
              isActive
                ? 'text-pink-600 dark:text-pink-300'
                : file.status === 'success'
                  ? isNoHighlight
                    ? 'text-zinc-500 dark:text-zinc-400'
                    : 'text-zinc-700 dark:text-zinc-200'
                  : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            {file.file.name}
          </span>
          {isNoHighlight && (
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 leading-tight truncate">
              Sin resaltador
            </span>
          )}
        </div>
      </button>
      <div className="flex items-center gap-0.5 pr-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onRetry(file.id)}
              disabled={working || file.status === 'processing'}
              aria-label={
                file.status === 'success'
                  ? `Reprocesar ${file.file.name}`
                  : `Reintentar ${file.file.name}`
              }
              className="p-1.5 rounded-full text-zinc-400 dark:text-zinc-500 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
            >
              <RotateCcw className="w-4 h-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {file.status === 'success' ? 'Reprocesar (ignora caché)' : 'Reintentar'}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onRemove(file.id)}
              disabled={working}
              aria-label={`Eliminar ${file.file.name}`}
              className="p-1.5 rounded-full text-zinc-300 dark:text-zinc-600 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
            >
              <Trash2 className="w-4 h-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent>Eliminar</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
});

export function QueueSidebar({
  files,
  activeFileId,
  working,
  successCount,
  errorCount,
  onSelect,
  onRetry,
  onRemove,
  onRetryAllErrors,
  collapsed,
  onToggleCollapsed,
  onReorder,
}: QueueSidebarProps) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>('all');

  const filterStats = useMemo(() => {
    let withText = 0;
    let noHighlight = 0;
    for (const f of files) {
      if (f.status === 'success') {
        if (isEmptyExtractionText(f.resultText)) noHighlight++;
        else withText++;
      }
    }
    return { withText, noHighlight };
  }, [files]);

  const effectiveFilter: QueueFilter =
    (filter === 'error' && errorCount === 0) ||
    (filter === 'no_highlight' && filterStats.noHighlight === 0) ||
    (filter === 'with_text' && filterStats.withText === 0)
      ? 'all'
      : filter;

  const filteredFiles = useMemo(() => {
    if (effectiveFilter === 'all') return files;
    if (effectiveFilter === 'with_text') {
      return files.filter((f) => f.status === 'success' && !isEmptyExtractionText(f.resultText));
    }
    if (effectiveFilter === 'no_highlight') {
      return files.filter((f) => f.status === 'success' && isEmptyExtractionText(f.resultText));
    }
    return files.filter((f) => f.status === 'error');
  }, [files, effectiveFilter]);

  const useVirtual = filteredFiles.length > VIRTUALIZE_THRESHOLD;
  const canDragReorder = !working && effectiveFilter === 'all';
  const showFilterPills =
    files.length > 1 && (filterStats.withText > 0 || filterStats.noHighlight > 0 || errorCount > 0);

  if (collapsed) {
    return (
      <aside
        className="w-12 shrink-0 border-r-2 border-pink-100 dark:border-pink-950/60 bg-white/60 dark:bg-zinc-900/80 flex flex-col items-center py-3"
        aria-label="Cola de imágenes (colapsada)"
      >
        <button
          onClick={onToggleCollapsed}
          aria-label="Expandir cola"
          className="btn-bounce p-2 rounded-full hover:bg-pink-100 dark:hover:bg-pink-950/50 text-pink-500 dark:text-pink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
        >
          <Files className="w-5 h-5" aria-hidden />
        </button>
        <span className="mt-2 text-[10px] font-extrabold text-pink-500 dark:text-pink-300">
          {files.length}
        </span>
      </aside>
    );
  }

  return (
    <aside
      className="w-full md:w-64 shrink-0 border-b-2 md:border-b-0 md:border-r-2 border-pink-100 dark:border-pink-950/60 bg-white/60 dark:bg-zinc-900/80 p-2.5 flex flex-col gap-2 max-h-56 md:max-h-none md:h-full"
      aria-label="Cola de imágenes"
    >
      <div className="pb-2 border-b-2 border-pink-100 dark:border-pink-950/60 bg-white/90 dark:bg-zinc-900/90 rounded-t-xl font-black text-[12px] text-pink-400 dark:text-pink-300 uppercase flex items-center justify-between px-2 pt-1 gap-2">
        <button
          onClick={onToggleCollapsed}
          className="flex items-center gap-1 hover:text-pink-600 dark:hover:text-pink-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
          aria-label="Colapsar cola"
        >
          <Files className="w-3.5 h-3.5" aria-hidden /> La data
        </button>
        <div className="flex items-center gap-1">
          {successCount > 0 && (
            <Badge className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-0 hover:bg-emerald-100">
              <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden />
              {filterStats.withText}
            </Badge>
          )}
          {errorCount > 0 && (
            <Badge className="bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-0 hover:bg-rose-100">
              <AlertTriangle className="w-3 h-3 mr-1" aria-hidden />
              {errorCount}
            </Badge>
          )}
          <Badge className="bg-pink-100 dark:bg-pink-950 text-pink-600 dark:text-pink-300 border-0 hover:bg-pink-100">
            {files.length}
          </Badge>
        </div>
      </div>

      {showFilterPills && (
        <div
          className="flex items-center gap-1 flex-wrap px-0.5"
          role="tablist"
          aria-label="Filtrar cola"
        >
          <button
            type="button"
            role="tab"
            aria-selected={effectiveFilter === 'all'}
            onClick={() => setFilter('all')}
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold transition-colors ${
              effectiveFilter === 'all'
                ? 'bg-pink-400 text-white'
                : 'bg-pink-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-pink-100'
            }`}
          >
            Todas ({files.length})
          </button>
          {filterStats.withText > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={effectiveFilter === 'with_text'}
              onClick={() => setFilter('with_text')}
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold transition-colors ${
                effectiveFilter === 'with_text'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
              }`}
            >
              Con texto ({filterStats.withText})
            </button>
          )}
          {filterStats.noHighlight > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={effectiveFilter === 'no_highlight'}
              onClick={() => setFilter('no_highlight')}
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold transition-colors ${
                effectiveFilter === 'no_highlight'
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
              }`}
            >
              Sin marca ({filterStats.noHighlight})
            </button>
          )}
          {errorCount > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={effectiveFilter === 'error'}
              onClick={() => setFilter('error')}
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold transition-colors ${
                effectiveFilter === 'error'
                  ? 'bg-rose-500 text-white'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
              }`}
            >
              Errores ({errorCount})
            </button>
          )}
        </div>
      )}

      {errorCount > 0 && (
        <div className="px-1">
          <button
            onClick={onRetryAllErrors}
            disabled={working}
            className="w-full inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-extrabold border-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" aria-hidden />
            Reintentar errores ({errorCount})
          </button>
        </div>
      )}

      {filteredFiles.length === 0 ? (
        <div className="py-6 text-center text-pink-400 text-xs font-bold">
          No hay hojas en este filtro.
        </div>
      ) : useVirtual ? (
        <div className="flex-1 min-h-0">
          <List
            rowComponent={FileRow}
            rowCount={filteredFiles.length}
            rowHeight={ROW_HEIGHT}
            rowProps={{
              filteredFiles,
              activeFileId,
              working,
              onSelect,
              onRetry,
              onRemove,
            }}
            style={{ height: '100%' }}
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar" role="list">
          {filteredFiles.map((file) => {
            const isDragOver = dragOverId === file.id;
            return (
              <li
                key={file.id}
                draggable={canDragReorder}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', file.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (!canDragReorder) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverId !== file.id) setDragOverId(file.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === file.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                  if (!canDragReorder) return;
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
                  onSelect={onSelect}
                  onRetry={onRetry}
                  onRemove={onRemove}
                />
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
