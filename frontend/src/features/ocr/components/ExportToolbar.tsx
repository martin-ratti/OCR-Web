import { AlignLeft, Save, ZoomIn, ZoomOut } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';

interface ExportToolbarProps {
  canAct: boolean;
  fontSize: number;
  minFontSize: number;
  maxFontSize: number;
  onCleanFormat: () => void;
  onSave: () => void;
  onFontSizeChange: (next: number) => void;
}

const FONT_STEP = 2;

export function ExportToolbar({
  canAct,
  fontSize,
  minFontSize,
  maxFontSize,
  onCleanFormat,
  onSave,
  onFontSizeChange,
}: ExportToolbarProps) {
  return (
    <div
      className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-full border-2 border-pink-100 shadow-sm"
      role="toolbar"
      aria-label="Acciones sobre el texto extraído"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onFontSizeChange(Math.max(minFontSize, fontSize - FONT_STEP))}
            disabled={fontSize <= minFontSize}
            aria-label="Achicar texto"
            className="btn-bounce p-2.5 rounded-full text-zinc-500 hover:text-pink-500 hover:bg-pink-50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
          >
            <ZoomOut className="w-5 h-5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>Achicar texto (A-)</TooltipContent>
      </Tooltip>

      <span
        className="px-2 text-xs font-extrabold text-zinc-600 tabular-nums select-none"
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
            className="btn-bounce p-2.5 rounded-full text-zinc-500 hover:text-pink-500 hover:bg-pink-50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
          >
            <ZoomIn className="w-5 h-5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>Agrandar texto (A+)</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6 bg-pink-200 mx-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onCleanFormat}
            disabled={!canAct}
            aria-label="Ordenar párrafos"
            className="btn-bounce p-2.5 rounded-full text-zinc-500 hover:text-emerald-500 hover:bg-emerald-50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
          >
            <AlignLeft className="w-5 h-5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>Ordenar párrafos</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6 bg-pink-200 mx-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onSave}
            disabled={!canAct}
            aria-label="Guardar como TXT"
            className="btn-bounce p-2.5 rounded-full text-zinc-500 hover:text-indigo-500 hover:bg-indigo-50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
          >
            <Save className="w-5 h-5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>Guardar como .txt (Ctrl+S)</TooltipContent>
      </Tooltip>
    </div>
  );
}
