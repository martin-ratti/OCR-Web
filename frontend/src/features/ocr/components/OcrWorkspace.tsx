import { useState } from 'react';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { useOcrStore } from '../../../store/useOcrStore';
import { KawaiiModal } from './KawaiiModal';
import { OriginalViewer } from './OriginalViewer';
import { ExtractedEditor } from './ExtractedEditor';
import { ExportToolbar } from './ExportToolbar';
import { QueueSidebar } from './QueueSidebar';
import {
  HeartPulse,
  Sparkles,
  Cpu,
  Package,
  ScanLine,
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
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

import pandaImg from '../../../assets/panda.png';
import monkeyImg from '../../../assets/monkey.png';

const MIN_FONT = 12;
const MAX_FONT = 28;
const DEFAULT_FONT = 16;

function cleanParagraphs(input: string): string {
  return input.replace(/(?<!\n)\n(?!\n)/g, ' ');
}

export function OcrWorkspace() {
  const {
    files,
    activeFileId,
    globalStatus,
    globalProgress,
    updateFileResult,
    setActiveFile,
    processAll,
    processOne,
    clearAll,
    cancel,
    removeFile,
    selectedEngine,
    setSelectedEngine,
  } = useOcrStore();
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT);

  const activeFile = files.find((f) => f.id === activeFileId);
  const working = globalStatus === 'working';
  const successCount = files.filter((f) => f.status === 'success').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const pendingCount = files.filter((f) => f.status === 'idle').length;
  const processingCount = files.filter((f) => f.status === 'processing').length;
  const canEditorAct = !!activeFile?.resultText;

  const handleCleanFormat = () => {
    if (!activeFile?.resultText) return;
    updateFileResult(activeFile.id, cleanParagraphs(activeFile.resultText));
    toast.success('Párrafos ordenados');
  };

  const handleCopy = async (): Promise<boolean> => {
    if (!activeFile?.resultText) return false;
    try {
      await navigator.clipboard.writeText(activeFile.resultText);
      toast.success('Texto copiado');
      return true;
    } catch {
      toast.error('No se pudo copiar al portapapeles');
      return false;
    }
  };

  const handleSave = () => {
    if (!activeFile?.resultText) return;
    const blob = new Blob([activeFile.resultText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Apunte_${activeFile.file.name.replace(/\.[^.]+$/, '')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportAll = async () => {
    const done = files.filter((f) => f.status === 'success' && f.resultText);
    if (done.length === 0) {
      toast.warning('No hay textos extraídos todavía');
      return;
    }
    const zip = new JSZip();
    done.forEach((f) => {
      const name = `Apunte_${f.file.name.replace(/\.[^.]+$/, '')}.txt`;
      zip.file(name, f.resultText ?? '');
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Apuntes_${done.length}_archivos.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${done.length} apunte(s) exportado(s)`);
  };

  const handleEditorChange = (text: string) => {
    if (!activeFile) return;
    updateFileResult(activeFile.id, text);
  };

  return (
    <div className="relative w-full min-h-[calc(100vh-12rem)] mx-auto">
      <div
        className="absolute left-[-200px] top-[15%] z-0 pointer-events-none hidden lg:block motion-safe:animate-[bounce_5s_infinite]"
        aria-hidden
      >
        <img
          src={pandaImg}
          alt=""
          className="w-60 h-auto drop-shadow-xl rotate-[-15deg]"
        />
      </div>
      <div
        className="absolute right-[-200px] top-[40%] z-0 pointer-events-none hidden lg:block motion-safe:animate-[bounce_6s_infinite]"
        aria-hidden
      >
        <img
          src={monkeyImg}
          alt=""
          className="w-60 h-auto drop-shadow-xl rotate-[15deg] scale-x-[-1]"
        />
      </div>

      <div className="flex flex-col h-full w-full paper-card overflow-visible relative z-10 group">
        <div className="flex flex-wrap gap-3 justify-between items-center bg-pink-50 p-4 border-b-2 border-pink-100 rounded-t-3xl relative z-10">
          <div className="flex items-center gap-3 flex-wrap">
            <Select
              value={selectedEngine}
              onValueChange={(v) => setSelectedEngine(v as 'gemini' | 'tesseract')}
              disabled={working}
            >
              <SelectTrigger
                aria-label="Motor de OCR"
                className="h-10 min-w-[232px] rounded-full border-2 border-pink-200 bg-white px-4 text-sm font-extrabold text-pink-600 shadow-sm hover:border-pink-300 focus:ring-2 focus:ring-pink-300 focus:ring-offset-1"
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
                <SelectItem value="tesseract" className="font-bold">
                  <span className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-500" aria-hidden />
                    Motor local (Tesseract) — Gratis
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>

            {working ? (
              <button
                onClick={cancel}
                className="btn-bounce inline-flex items-center gap-2 bg-rose-400 text-white px-5 py-2.5 rounded-full font-extrabold hover:bg-rose-500 shadow-md shadow-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2"
              >
                <XCircle className="w-5 h-5" aria-hidden />
                Cancelar
              </button>
            ) : (
              <button
                onClick={processAll}
                disabled={pendingCount + errorCount === 0}
                className="btn-bounce inline-flex items-center gap-2 bg-pink-400 text-white px-5 py-2.5 rounded-full font-extrabold hover:bg-pink-500 shadow-md shadow-pink-200 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-offset-2"
              >
                <HeartPulse className="w-5 h-5 motion-safe:animate-pulse" aria-hidden />
                ¡DALAAAA! <Sparkles className="w-4 h-4" aria-hidden />
              </button>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowConfirmClear(true)}
                  disabled={working}
                  aria-label="Vaciar todo"
                  className="btn-bounce inline-flex items-center gap-2 bg-white text-rose-500 px-4 py-2.5 rounded-full font-bold hover:bg-rose-50 border-2 border-rose-100 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                >
                  <Trash2 className="w-4 h-4" aria-hidden />
                  Sacá todo esto
                </button>
              </TooltipTrigger>
              <TooltipContent>Limpiar toda la cola</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleExportAll}
                  disabled={successCount === 0}
                  aria-label={`Exportar ${successCount} archivos como ZIP`}
                  className="btn-bounce inline-flex items-center gap-2 bg-white text-indigo-500 px-4 py-2.5 rounded-full font-bold hover:bg-indigo-50 border-2 border-indigo-100 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                >
                  <Package className="w-4 h-4" aria-hidden />
                  Exportar todo
                  <Badge
                    variant="secondary"
                    className="ml-1 bg-indigo-100 text-indigo-700 border-0 font-extrabold"
                  >
                    {successCount}
                  </Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent>Descargá los textos como ZIP</TooltipContent>
            </Tooltip>
          </div>

          <ExportToolbar
            canAct={canEditorAct}
            fontSize={fontSize}
            minFontSize={MIN_FONT}
            maxFontSize={MAX_FONT}
            onCleanFormat={handleCleanFormat}
            onCopy={handleCopy}
            onSave={handleSave}
            onFontSizeChange={setFontSize}
          />
        </div>

        {working && (
          <div
            className="bg-pink-50 border-b-2 border-pink-100 px-4 py-3"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center justify-between text-xs font-extrabold text-pink-600 mb-1.5">
              <span className="inline-flex items-center gap-1.5">
                <ScanLine className="w-3.5 h-3.5 motion-safe:animate-pulse" aria-hidden />
                Procesando {processingCount || '—'} /{' '}
                {pendingCount + errorCount + processingCount}
              </span>
              <span>{globalProgress}%</span>
            </div>
            <Progress
              value={globalProgress}
              aria-label="Progreso del lote"
              className="h-2 bg-pink-100 [&>div]:bg-pink-400"
            />
          </div>
        )}

        <div className="flex flex-col md:flex-row flex-1 min-h-0 bg-transparent">
          <QueueSidebar
            files={files}
            activeFileId={activeFileId}
            working={working}
            successCount={successCount}
            errorCount={errorCount}
            onSelect={setActiveFile}
            onRetry={processOne}
            onRemove={removeFile}
          />

          <div className="flex flex-1 min-w-0 flex-col md:flex-row">
            <OriginalViewer activeFile={activeFile} />
            <ExtractedEditor
              activeFile={activeFile}
              fontSize={fontSize}
              onChange={handleEditorChange}
              onCopy={handleCopy}
            />
          </div>
        </div>
      </div>

      <KawaiiModal
        isOpen={showConfirmClear}
        onClose={() => setShowConfirmClear(false)}
        onConfirm={() => {
          clearAll();
          setShowConfirmClear(false);
        }}
        title="¿Vaciamos todo?"
        description="Se van a borrar todas las imágenes y el texto que extrajimos. ¡Ojo que no hay vuelta atrás!"
        confirmText="Sip, borralo"
        cancelText="Nopi, dejalo"
        variant="danger"
      />
    </div>
  );
}
