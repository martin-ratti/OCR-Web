import { AlignLeft, Download, ZoomIn, ZoomOut } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';

interface ExportToolbarProps {
  canAct: boolean;
  fontSize: number;
  minFontSize: number;
  maxFontSize: number;
  onCleanFormat: () => void;
  onSaveSingleTxt: () => void;
  onFontSizeChange: (next: number) => void;
}

const FONT_STEP = 2;

export function ExportToolbar({
  canAct,
  fontSize,
  minFontSize,
  maxFontSize,
  onCleanFormat,
  onSaveSingleTxt,
  onFontSizeChange,
}: ExportToolbarProps) {
  return (
    <div
      className="flex items-center gap-0.5 bg-white dark:bg-zinc-900 px-1.5 py-0.5 rounded-full border-2 border-pink-100 dark:border-pink-900/50 shadow-sm"
      role="toolbar"
      aria-label="Acciones sobre el texto extraído"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onFontSizeChange(Math.max(minFontSize, fontSize - FONT_STEP))}
            disabled={fontSize <= minFontSize}
            aria-label="Achicar texto"
            className="btn-bounce p-1.5 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-950/50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
          >
            <ZoomOut className="w-4 h-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>Achicar letra (A-)</TooltipContent>
      </Tooltip>

      <span
        className="px-1 text-[10px] font-extrabold text-zinc-600 dark:text-zinc-300 tabular-nums select-none"
        aria-live="polite"
      >
        {fontSize}px
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onFontSizeChange(Math.min(maxFontSize, fontSize + FONT_STEP))}
            disabled={fontSize >= maxFontSize}
            aria-label="Agrandar texto"
            className="btn-bounce p-1.5 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-950/50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
          >
            <ZoomIn className="w-4 h-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>Agrandar letra (A+)</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-5 bg-pink-200 dark:bg-pink-900/60 mx-0.5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onCleanFormat}
            disabled={!canAct}
            aria-label="Ordenar párrafos y guiones"
            className="btn-bounce p-1.5 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
          >
            <AlignLeft className="w-4 h-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>Unir guiones y ordenar párrafos</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onSaveSingleTxt}
            disabled={!canAct}
            aria-label="Guardar apunte actual como .txt"
            className="btn-bounce p-1.5 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-950/50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
          >
            <Download className="w-4 h-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>Descargar este apunte (.txt · Ctrl+S)</TooltipContent>
      </Tooltip>
    </div>
  );
}
