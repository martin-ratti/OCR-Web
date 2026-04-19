import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Files,
  ImageIcon,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { OcrFile } from '../../../store/useOcrStore';

interface QueueSidebarProps {
  files: OcrFile[];
  activeFileId: string | null;
  working: boolean;
  successCount: number;
  errorCount: number;
  onSelect: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

export function QueueSidebar({
  files,
  activeFileId,
  working,
  successCount,
  errorCount,
  onSelect,
  onRetry,
  onRemove,
}: QueueSidebarProps) {
  return (
    <aside
      className="w-full md:w-72 shrink-0 border-b-2 md:border-b-0 md:border-r-2 border-pink-100 bg-white/60 p-3 overflow-y-auto flex flex-col gap-2 max-h-56 md:max-h-none"
      aria-label="Cola de imágenes"
    >
      <div className="sticky top-0 pb-2 mb-2 border-b-2 border-pink-100 bg-white/90 z-10 font-black text-[12px] text-pink-400 uppercase flex items-center justify-between px-2 gap-2">
        <span className="flex items-center gap-1">
          <Files className="w-3.5 h-3.5" aria-hidden /> La data
        </span>
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
      <ul className="flex flex-col gap-2" role="list">
        {files.map((file) => {
          const isActive = activeFileId === file.id;
          return (
            <li
              key={file.id}
              className={`flex items-center gap-2 w-full text-left rounded-2xl transition-all ${
                isActive
                  ? 'bg-pink-100 border-pink-300 border-2 shadow-sm'
                  : 'hover:bg-pink-50 border-2 border-transparent'
              }`}
            >
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
                      className={`w-5 h-5 ${
                        isActive ? 'text-pink-500' : 'text-zinc-300'
                      }`}
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
                      : 'text-zinc-400'
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
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
