import {
  ClipboardList,
  Cpu,
  FileText as FileTextIcon,
  HeartPulse,
  Plus,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { ExportToolbar } from './ExportToolbar';
import type { OcrEngine } from '@ocr-web/shared';

interface WorkspaceToolbarProps {
  selectedEngine: OcrEngine;
  onSelectEngine: (engine: OcrEngine) => void;
  working: boolean;
  pendingPlusErrorCount: number;
  successCount: number;
  canEditorAct: boolean;
  fontSize: number;
  minFontSize: number;
  maxFontSize: number;
  onProcessAll: () => void;
  onCancel: () => void;
  onAddMore: () => void;
  onClear: () => void;
  onCopyAll: () => void;
  onExportDocx: () => void;
  onCleanFormat: () => void;
  onFontSizeChange: (size: number) => void;
}

export function WorkspaceToolbar({
  selectedEngine,
  onSelectEngine,
  working,
  pendingPlusErrorCount,
  successCount,
  canEditorAct,
  fontSize,
  minFontSize,
  maxFontSize,
  onProcessAll,
  onCancel,
  onAddMore,
  onClear,
  onCopyAll,
  onExportDocx,
  onCleanFormat,
  onFontSizeChange,
}: WorkspaceToolbarProps) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-2 justify-between items-center bg-pink-50 px-4 py-2 border-b-2 border-pink-100 rounded-t-3xl relative z-10">
      <div className="flex items-center gap-x-2.5 gap-y-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Select
            value={selectedEngine}
            onValueChange={(v) => onSelectEngine(v as OcrEngine)}
            disabled={working}
          >
            <SelectTrigger
              aria-label="Motor de OCR"
              className="h-9 min-w-[180px] rounded-full border-2 border-pink-200 bg-white px-3 text-xs font-extrabold text-pink-600 shadow-sm hover:border-pink-300 focus:ring-2 focus:ring-pink-300 focus:ring-offset-1"
            >
              <SelectValue placeholder="Elegí el motor" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-2 border-pink-100">
              <SelectItem value="gemini" className="font-bold">
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-pink-500" aria-hidden />
                  IA (Gemini) — Alta precisión
                </span>
              </SelectItem>
              <SelectItem value="groq" className="font-bold">
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" aria-hidden />
                  IA (Groq Llama) — Mil/día
                </span>
              </SelectItem>
              <SelectItem value="paddle" className="font-bold">
                <span className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-500" aria-hidden />
                  Local (en tu navegador) — Sin cuota
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          {working ? (
            <button
              onClick={onCancel}
              className="btn-bounce inline-flex items-center gap-1.5 bg-rose-400 text-white h-9 px-4 rounded-full text-xs font-extrabold hover:bg-rose-500 shadow-md shadow-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2"
            >
              <XCircle className="w-4 h-4" aria-hidden />
              Cancelar (Esc)
            </button>
          ) : (
            <button
              onClick={onProcessAll}
              disabled={pendingPlusErrorCount === 0}
              className="btn-bounce inline-flex items-center gap-1.5 bg-pink-400 text-white h-9 px-4 rounded-full text-xs font-extrabold hover:bg-pink-500 shadow-md shadow-pink-200 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-offset-2"
            >
              <HeartPulse className="w-4 h-4 motion-safe:animate-pulse" aria-hidden />
              ¡DALAAAA! <Sparkles className="w-3.5 h-3.5" aria-hidden />
            </button>
          )}
        </div>

        <div className="h-6 w-px bg-pink-200 hidden md:block" aria-hidden />

        <div className="flex items-center gap-1.5 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onAddMore}
                disabled={working}
                aria-label="Agregar más imágenes"
                className="btn-bounce inline-flex items-center gap-1 bg-white text-pink-500 h-9 px-3 rounded-full text-xs font-bold hover:bg-pink-50 border-2 border-pink-200 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden />
                Más
              </button>
            </TooltipTrigger>
            <TooltipContent>Agregar imágenes (o arrastrá acá)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onClear}
                disabled={working}
                aria-label="Vaciar todo"
                className="btn-bounce inline-flex items-center gap-1 bg-white text-rose-500 h-9 px-3 rounded-full text-xs font-bold hover:bg-rose-50 border-2 border-rose-100 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden />
                Vaciar
              </button>
            </TooltipTrigger>
            <TooltipContent>Limpiar toda la cola (con deshacer)</TooltipContent>
          </Tooltip>
        </div>

        <div className="h-6 w-px bg-pink-200 hidden md:block" aria-hidden />

        <div className="flex items-center gap-1.5 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onCopyAll}
                disabled={successCount === 0}
                aria-label="Copiar todo concatenado"
                className="btn-bounce inline-flex items-center gap-1 bg-white text-pink-500 h-9 px-3 rounded-full text-xs font-bold hover:bg-pink-50 border-2 border-pink-200 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
              >
                <ClipboardList className="w-3.5 h-3.5" aria-hidden />
                Copiar todo
              </button>
            </TooltipTrigger>
            <TooltipContent>Copiar todos los textos juntos</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onExportDocx}
                disabled={successCount === 0}
                aria-label={`Exportar ${successCount} archivos a Word`}
                className="btn-bounce inline-flex items-center gap-1 bg-white text-blue-700 h-9 px-3 rounded-full text-xs font-bold hover:bg-blue-50 border-2 border-blue-100 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
              >
                <FileTextIcon className="w-3.5 h-3.5" aria-hidden />
                Word
                <Badge
                  variant="secondary"
                  className="ml-0.5 bg-blue-100 text-blue-700 border-0 font-extrabold text-[10px] px-1.5"
                >
                  {successCount}
                </Badge>
              </button>
            </TooltipTrigger>
            <TooltipContent>Exportar todos como .docx</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <ExportToolbar
        canAct={canEditorAct}
        fontSize={fontSize}
        minFontSize={minFontSize}
        maxFontSize={maxFontSize}
        onCleanFormat={onCleanFormat}
        onFontSizeChange={onFontSizeChange}
      />
    </div>
  );
}
