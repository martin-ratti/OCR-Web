import { memo, useState } from 'react';
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
  onSelect: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onRetryAllErrors: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onReorder: (fromId: string, toId: string) => void;
}

const ROW_HEIGHT = 64;
const VIRTUALIZE_THRESHOLD = 50;

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
  return (
    <div
      className={`relative flex items-center gap-2 w-full text-left rounded-2xl transition-all ${
        isActive
          ? 'bg-pink-100 border-2 border-pink-400 shadow-md ring-1 ring-pink-200 pl-1'
          : 'hover:bg-pink-50 border-2 border-transparent'
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
        aria-label={`Ver ${file.file.name}, estado ${file.status}`}
        className="flex items-center gap-3 flex-1 text-left p-2.5 pl-3 btn-bounce min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 rounded-2xl"
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
  const useVirtual = files.length > VIRTUALIZE_THRESHOLD;

  if (collapsed) {
    return (
      <aside
        className="w-12 shrink-0 border-r-2 border-pink-100 bg-white/60 flex flex-col items-center py-3"
        aria-label="Cola de imágenes (colapsada)"
      >
        <button
          onClick={onToggleCollapsed}
          aria-label="Expandir cola"
          className="btn-bounce p-2 rounded-full hover:bg-pink-100 text-pink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
        >
          <Files className="w-5 h-5" aria-hidden />
        </button>
        <span className="mt-2 text-[10px] font-extrabold text-pink-500">{files.length}</span>
      </aside>
    );
  }

  return (
    <aside
      className="w-full md:w-64 shrink-0 border-b-2 md:border-b-0 md:border-r-2 border-pink-100 bg-white/60 p-2.5 flex flex-col gap-2 max-h-56 md:max-h-none md:h-full"
      aria-label="Cola de imágenes"
    >
      <div className="pb-2 mb-1 border-b-2 border-pink-100 bg-white/90 font-black text-[12px] text-pink-400 uppercase flex items-center justify-between px-2 gap-2">
        <button
          onClick={onToggleCollapsed}
          className="flex items-center gap-1 hover:text-pink-600 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
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

      {errorCount > 0 && (
        <div className="px-1 pt-1">
          <button
            onClick={onRetryAllErrors}
            disabled={working}
            className="w-full inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-extrabold border-2 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" aria-hidden />
            Reintentar errores ({errorCount})
          </button>
        </div>
      )}

      {files.length === 0 ? (
        <div className="py-6 text-center text-pink-400 text-xs font-bold">
          No hay archivos.
        </div>
      ) : useVirtual ? (
        <div className="flex-1 min-h-0">
          <List
            rowComponent={FileRow}
            rowCount={files.length}
            rowHeight={ROW_HEIGHT}
            rowProps={{
              filteredFiles: files,
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
        <ul className="flex flex-col gap-2 overflow-y-auto custom-scrollbar" role="list">
          {files.map((file) => {
            const isDragOver = dragOverId === file.id;
            return (
              <li
                key={file.id}
                draggable={!working}
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
