import { useState } from 'react';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { useOcrStore } from '../../../store/useOcrStore';
import { KawaiiModal } from './KawaiiModal';
import {
  Save,
  Copy,
  CheckCircle2,
  CircleDashed,
  AlignLeft,
  Trash2,
  Camera,
  HeartPulse,
  Sparkles,
  Coffee,
  FileText,
  Files,
  RefreshCw,
  XCircle,
  Package,
  AlertTriangle,
  Cpu,
  ImageIcon,
  ScanLine,
  Play,
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
import { Separator } from '@/components/ui/separator';

import pandaImg from '../../../assets/panda.png';
import monkeyImg from '../../../assets/monkey.png';

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

  const activeFile = files.find((f) => f.id === activeFileId);
  const working = globalStatus === 'working';
  const successCount = files.filter((f) => f.status === 'success').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const pendingCount = files.filter((f) => f.status === 'idle').length;

  const handleCleanFormat = () => {
    if (!activeFile?.resultText) return;
    updateFileResult(activeFile.id, cleanParagraphs(activeFile.resultText));
    toast.success('Párrafos ordenados');
  };

  const handleCopy = async () => {
    if (!activeFile?.resultText) return;
    try {
      await navigator.clipboard.writeText(activeFile.resultText);
      toast.success('Texto copiado');
    } catch {
      toast.error('No se pudo copiar al portapapeles');
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

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!activeFile) return;
    updateFileResult(activeFile.id, e.target.value);
  };

  const engineIcon =
    selectedEngine === 'gemini' ? (
      <Sparkles className="w-4 h-4 text-pink-500" aria-hidden />
    ) : (
      <Cpu className="w-4 h-4 text-indigo-500" aria-hidden />
    );

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
                <span className="flex items-center gap-2">
                  {engineIcon}
                  <SelectValue placeholder="Elegí el motor" />
                </span>
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

          <div
            className="flex items-center gap-1 bg-white p-1 rounded-full border-2 border-pink-100 shadow-sm"
            role="toolbar"
            aria-label="Acciones sobre el texto extraído"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCleanFormat}
                  disabled={!activeFile?.resultText}
                  aria-label="Ordenar párrafos"
                  className="btn-bounce p-2.5 rounded-full text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                >
                  <AlignLeft className="w-5 h-5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>Ordenar párrafos</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="h-6 bg-pink-100" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCopy}
                  disabled={!activeFile?.resultText}
                  aria-label="Copiar texto"
                  className="btn-bounce p-2.5 rounded-full text-zinc-400 hover:text-pink-500 hover:bg-pink-50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
                >
                  <Copy className="w-5 h-5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>Copiar al portapapeles</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="h-6 bg-pink-100" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSave}
                  disabled={!activeFile?.resultText}
                  aria-label="Guardar como TXT"
                  className="btn-bounce p-2.5 rounded-full text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                >
                  <Save className="w-5 h-5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>Guardar como .txt</TooltipContent>
            </Tooltip>
          </div>
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
                Procesando {files.filter((f) => f.status === 'processing').length || '—'} /{' '}
                {pendingCount + errorCount + files.filter((f) => f.status === 'processing').length}
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
          <aside
            className="w-full md:w-72 border-b-2 md:border-b-0 md:border-r-2 border-pink-100 bg-white/60 p-3 overflow-y-auto flex flex-col gap-2 max-h-56 md:max-h-none"
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
                      onClick={() => setActiveFile(file.id)}
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
                              onClick={() => processOne(file.id)}
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
                            onClick={() => removeFile(file.id)}
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

          <section
            className="flex-1 p-5 md:border-r-2 border-pink-100 bg-zinc-50 relative flex flex-col min-h-[280px]"
            aria-label="Vista previa de la imagen"
          >
            <Badge className="absolute top-4 left-4 z-10 bg-white text-pink-500 border-2 border-pink-100 shadow-sm rounded-full px-3 py-1 gap-1 hover:bg-white">
              <Camera className="w-3 h-3" aria-hidden /> Evidencia A
            </Badge>
            {activeFile ? (
              <div className="w-full h-full p-2 flex items-center justify-center">
                <img
                  src={activeFile.previewUrl}
                  alt={`Preview de ${activeFile.file.name}`}
                  className="max-w-full max-h-full object-contain drop-shadow-md rounded-xl"
                />
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-300 text-center gap-3">
                <ImageIcon className="w-16 h-16 text-pink-100" aria-hidden />
                <span className="font-bold text-pink-200 px-4">
                  En fin, la hipotenusa. Elegí algo.
                </span>
              </div>
            )}
          </section>

          <section
            className="flex-1 flex flex-col relative min-w-0 md:min-w-[40%] bg-pink-50 border-t-2 md:border-t-0 md:border-l border-pink-200 min-h-[280px]"
            aria-label="Texto extraído"
          >
            {activeFile?.status === 'processing' && (
              <div
                className="absolute inset-0 bg-white/90 z-20 flex flex-col items-center justify-center gap-4 p-6 text-center"
                role="status"
                aria-live="polite"
              >
                <CircleDashed
                  className="w-14 h-14 text-pink-400 motion-safe:animate-spin"
                  aria-hidden
                />
                <p className="font-extrabold text-pink-500 text-lg motion-safe:animate-pulse flex items-center gap-2">
                  Tranquila negra, procesando... <Coffee className="w-5 h-5" aria-hidden />
                </p>
                {activeFile.infoMessage && (
                  <p className="text-pink-400 font-bold text-sm bg-pink-50 px-4 py-2 rounded-2xl border border-pink-100 max-w-xs">
                    {activeFile.infoMessage}
                  </p>
                )}
              </div>
            )}

            {activeFile?.status === 'error' && activeFile.errorMessage && (
              <div
                role="alert"
                className="absolute top-4 right-4 z-10 bg-rose-100 text-rose-600 px-3 py-1.5 rounded-full text-xs font-bold border-2 border-rose-200 flex items-center gap-1 max-w-[80%]"
              >
                <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />
                <span className="truncate" title={activeFile.errorMessage}>
                  {activeFile.errorMessage}
                </span>
              </div>
            )}

            <div className="flex-1 h-full w-full relative">
              <Badge className="absolute top-4 left-[80px] z-10 bg-white/90 text-emerald-600 border-2 border-emerald-100 shadow-sm rounded-full px-3 py-1 gap-1 hover:bg-white">
                <FileText className="w-3 h-3" aria-hidden /> Texto extraído
              </Badge>
              {activeFile && activeFile.status !== 'success' && activeFile.status === 'idle' && (
                <Badge className="absolute top-4 right-4 z-10 bg-white/90 text-pink-500 border-2 border-pink-100 shadow-sm rounded-full px-3 py-1 gap-1 hover:bg-white">
                  <Play className="w-3 h-3" aria-hidden /> Pendiente
                </Badge>
              )}
              <label htmlFor="ocr-textarea" className="sr-only">
                Texto extraído editable
              </label>
              <textarea
                id="ocr-textarea"
                className="w-full h-full min-h-[280px] resize-none outline-none text-slate-800 font-medium text-[16px] custom-scrollbar placeholder:text-zinc-400 agenda-paper pl-[80px] pt-[60px] pr-5 focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-inset"
                value={
                  activeFile?.resultText ??
                  (activeFile?.status === 'idle'
                    ? "Mi ciela, acá va a aparecer todo tipeado como en los mismísimos renglones de tu agenda.\n\nPresioná '¡DALAAAA!' para que todo suceda."
                    : '')
                }
                onChange={handleTextareaChange}
                disabled={!activeFile || activeFile.status !== 'success'}
                placeholder="¡Acá va a aparecer la data!"
              />
            </div>
          </section>
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
