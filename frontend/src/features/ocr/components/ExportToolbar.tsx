import { AlignLeft, ZoomIn, ZoomOut } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';

interface ExportToolbarProps {
  canAct: boolean;
  fontSize: number;
  minFontSize: number;
  maxFontSize: number;
  onCleanFormat: () => void;
  onFontSizeChange: (next: number) => void;
}

const FONT_STEP = 2;

export function ExportToolbar({
  canAct,
  fontSize,
  minFontSize,
  maxFontSize,
  onCleanFormat,
  onFontSizeChange,
}: ExportToolbarProps) {
  return (
    <div
      className="flex items-center gap-0.5 bg-white px-1.5 py-0.5 rounded-full border-2 border-pink-100 shadow-sm"
      role="toolbar"
      aria-label="Acciones sobre el texto extraído"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onFontSizeChange(Math.max(minFontSize, fontSize - FONT_STEP))}
            disabled={fontSize <= minFontSize}
            aria-label="Achicar texto"
            className="btn-bounce p-1.5 rounded-full text-zinc-500 hover:text-pink-500 hover:bg-pink-50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
          >
            <ZoomOut className="w-4 h-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>Achicar texto (A-)</TooltipContent>
      </Tooltip>

      <span
        className="px-1 text-[10px] font-extrabold text-zinc-600 tabular-nums select-none"
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
            className="btn-bounce p-1.5 rounded-full text-zinc-500 hover:text-pink-500 hover:bg-pink-50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
          >
            <ZoomIn className="w-4 h-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>Agrandar texto (A+)</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-5 bg-pink-200 mx-0.5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onCleanFormat}
            disabled={!canAct}
            aria-label="Ordenar párrafos"
            className="btn-bounce p-1.5 rounded-full text-zinc-500 hover:text-emerald-500 hover:bg-emerald-50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
          >
            <AlignLeft className="w-4 h-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>Ordenar párrafos en un bloque</TooltipContent>
      </Tooltip>
    </div>
  );
}
