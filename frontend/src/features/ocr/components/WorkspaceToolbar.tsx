import {
  ClipboardList,
  Cpu,
  FileArchive,
  FileText as FileTextIcon,
  HeartPulse,
  Highlighter,
  Leaf,
  Plus,
  Sparkles,
  Trash2,
  XCircle,
  Zap,
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
import type { OcrEngine, OcrMode } from '@ocr-web/shared';

interface WorkspaceToolbarProps {
  selectedEngine: OcrEngine;
  extractionMode: OcrMode;
  quotaSavedCount: number;
  onSelectEngine: (engine: OcrEngine) => void;
  onSelectMode: (mode: OcrMode) => void;
  working: boolean;
  pendingPlusErrorCount: number;
  exportableCount: number;
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
  onExportZip: () => void;
  onSaveSingleTxt: () => void;
  onCleanFormat: () => void;
  onFontSizeChange: (size: number) => void;
}

export function WorkspaceToolbar({
  selectedEngine,
  extractionMode,
  quotaSavedCount,
  onSelectEngine,
  onSelectMode,
  working,
  pendingPlusErrorCount,
  exportableCount,
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
  onExportZip,
  onSaveSingleTxt,
  onCleanFormat,
  onFontSizeChange,
}: WorkspaceToolbarProps) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-2 justify-between items-center bg-pink-50/90 dark:bg-zinc-900/95 px-4 py-2 border-b-2 border-pink-100 dark:border-pink-950/60 rounded-t-3xl relative z-10">
      <div className="flex items-center gap-x-2 gap-y-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={selectedEngine}
            onValueChange={(v) => onSelectEngine(v as OcrEngine)}
            disabled={working}
          >
            <SelectTrigger
              aria-label="Motor de OCR"
              className="h-9 min-w-[195px] rounded-full border-2 border-pink-200 dark:border-pink-900/70 bg-white dark:bg-zinc-950 px-3 text-xs font-extrabold text-pink-600 dark:text-pink-300 shadow-sm hover:border-pink-300 focus:ring-2 focus:ring-pink-300 focus:ring-offset-1"
            >
              <SelectValue placeholder="Elegí el motor" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-2 border-pink-100 dark:border-pink-900/60">
              <SelectItem value="gemini" className="font-bold">
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-pink-500" aria-hidden />
                  Gemini Flash-Lite (Cascada IA · Alta precisión)
                </span>
              </SelectItem>
              <SelectItem value="groq" className="font-bold">
                <span className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" aria-hidden />
                  Groq Qwen 3.8 (IA Rápida · Lotes grandes)
                </span>
              </SelectItem>
              <SelectItem value="paddle" className="font-bold">
                <span className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-500" aria-hidden />
                  Local PP-OCRv6 (WebGPU · Ilimitado sin cuota)
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          <div
            role="radiogroup"
            aria-label="Modo de extracción"
            className="inline-flex items-center h-9 p-0.5 rounded-full bg-white dark:bg-zinc-950 border-2 border-pink-200 dark:border-pink-900/70 shadow-sm"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={extractionMode === 'highlight'}
                  disabled={working}
                  onClick={() => onSelectMode('highlight')}
                  className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-extrabold transition-colors disabled:opacity-50 ${
                    extractionMode === 'highlight'
                      ? 'bg-pink-400 text-white shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-pink-500'
                  }`}
                >
                  <Highlighter className="w-3.5 h-3.5" aria-hidden />
                  Resaltado
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Extrae únicamente las frases marcadas con resaltador flúor o pastel
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={extractionMode === 'full'}
                  disabled={working}
                  onClick={() => onSelectMode('full')}
                  className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-extrabold transition-colors disabled:opacity-50 ${
                    extractionMode === 'full'
                      ? 'bg-pink-400 text-white shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-pink-500'
                  }`}
                >
                  <FileTextIcon className="w-3.5 h-3.5" aria-hidden />
                  Página entera
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Transcribe toda la hoja literalmente (incluye notas al pie y aclaraciones)
              </TooltipContent>
            </Tooltip>
          </div>

          {working ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onCancel}
                  aria-label="Cancelar procesamiento de la cola (Esc)"
                  className="btn-bounce inline-flex items-center gap-1.5 bg-rose-500 text-white h-9 px-4 rounded-full text-xs font-extrabold hover:bg-rose-600 shadow-md shadow-rose-200 dark:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2"
                >
                  <XCircle className="w-4 h-4" aria-hidden />
                  Cancelar (Esc)
                </button>
              </TooltipTrigger>
              <TooltipContent>Detener el proceso actual (Esc)</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onProcessAll}
                  disabled={pendingPlusErrorCount === 0}
                  aria-label="Procesar cola (Ctrl + Enter)"
                  className="btn-bounce inline-flex items-center gap-1.5 bg-pink-400 text-white h-9 px-4 rounded-full text-xs font-extrabold hover:bg-pink-500 shadow-md shadow-pink-200 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-offset-2"
                >
                  <HeartPulse className="w-4 h-4 motion-safe:animate-pulse" aria-hidden />
                  ¡DALAAAA!
                  {pendingPlusErrorCount > 0 && (
                    <span className="bg-white/25 px-1.5 py-0.2 rounded-full text-[10px] tabular-nums">
                      {pendingPlusErrorCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {pendingPlusErrorCount > 0
                  ? `Procesar ${pendingPlusErrorCount} pendiente(s) (Ctrl + Enter)`
                  : 'Cola al día'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="h-6 w-px bg-pink-200 dark:bg-pink-900/50 hidden lg:block" aria-hidden />

        <div className="flex items-center gap-1.5 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onAddMore}
                disabled={working}
                aria-label="Agregar más imágenes"
                className="btn-bounce inline-flex items-center gap-1 bg-white dark:bg-zinc-950 text-pink-500 dark:text-pink-300 h-9 px-3 rounded-full text-xs font-bold hover:bg-pink-50 dark:hover:bg-pink-950/40 border-2 border-pink-200 dark:border-pink-900/60 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden />
                Más
              </button>
            </TooltipTrigger>
            <TooltipContent>Agregar más fotos (o arrastralas acá)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onClear}
                disabled={working}
                aria-label="Vaciar todo"
                className="btn-bounce inline-flex items-center gap-1 bg-white dark:bg-zinc-950 text-rose-500 dark:text-rose-400 h-9 px-3 rounded-full text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/40 border-2 border-rose-100 dark:border-rose-900/50 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden />
                Vaciar
              </button>
            </TooltipTrigger>
            <TooltipContent>Limpiar toda la cola (con opción de deshacer)</TooltipContent>
          </Tooltip>
        </div>

        <div className="h-6 w-px bg-pink-200 dark:bg-pink-900/50 hidden lg:block" aria-hidden />

        <div className="flex items-center gap-1.5 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onCopyAll}
                disabled={exportableCount === 0}
                aria-label="Copiar todo concatenado"
                className="btn-bounce inline-flex items-center gap-1 bg-white dark:bg-zinc-950 text-pink-500 dark:text-pink-300 h-9 px-3 rounded-full text-xs font-bold hover:bg-pink-50 dark:hover:bg-pink-950/40 border-2 border-pink-200 dark:border-pink-900/60 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
              >
                <ClipboardList className="w-3.5 h-3.5" aria-hidden />
                Copiar todo
              </button>
            </TooltipTrigger>
            <TooltipContent>Copia todos los apuntes con texto válido juntos</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onExportDocx}
                disabled={exportableCount === 0}
                aria-label={`Exportar ${exportableCount} apuntes a Word`}
                className="btn-bounce inline-flex items-center gap-1 bg-white dark:bg-zinc-950 text-blue-700 dark:text-blue-300 h-9 px-3 rounded-full text-xs font-bold hover:bg-blue-50 dark:hover:bg-blue-950/40 border-2 border-blue-100 dark:border-blue-900/50 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
              >
                <FileTextIcon className="w-3.5 h-3.5" aria-hidden />
                Word
                <Badge
                  variant="secondary"
                  className="ml-0.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-0 font-extrabold text-[10px] px-1.5"
                >
                  {exportableCount}
                </Badge>
              </button>
            </TooltipTrigger>
            <TooltipContent>Exportar apuntes con texto como .docx limpio</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onExportZip}
                disabled={exportableCount === 0}
                aria-label={`Exportar ${exportableCount} apuntes en ZIP`}
                className="btn-bounce inline-flex items-center gap-1 bg-white dark:bg-zinc-950 text-emerald-700 dark:text-emerald-300 h-9 px-2.5 rounded-full text-xs font-bold hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-2 border-emerald-100 dark:border-emerald-900/50 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
              >
                <FileArchive className="w-3.5 h-3.5" aria-hidden />
                ZIP
              </button>
            </TooltipTrigger>
            <TooltipContent>Descargar un .txt por foto dentro de un .zip</TooltipContent>
          </Tooltip>

          {quotaSavedCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 rounded-full text-[11px] font-extrabold gap-1 px-2.5 py-1 cursor-default">
                  <Leaf className="w-3 h-3" aria-hidden />
                  {quotaSavedCount} ahorrada{quotaSavedCount === 1 ? '' : 's'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Llamadas de IA ahorradas automáticamente al detectar hojas sin resaltador
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <ExportToolbar
        canAct={canEditorAct}
        fontSize={fontSize}
        minFontSize={minFontSize}
        maxFontSize={maxFontSize}
        onCleanFormat={onCleanFormat}
        onSaveSingleTxt={onSaveSingleTxt}
        onFontSizeChange={onFontSizeChange}
      />
    </div>
  );
}
