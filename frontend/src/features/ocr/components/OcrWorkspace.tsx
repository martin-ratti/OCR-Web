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
  Eraser,
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
} from 'lucide-react';

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
  } = useOcrStore();
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const activeFile = files.find((f) => f.id === activeFileId);
  const working = globalStatus === 'working';
  const successCount = files.filter((f) => f.status === 'success').length;

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

  return (
    <div className="relative w-full min-h-[calc(100vh-12rem)] mx-auto">
      <div className="absolute left-[-200px] top-[15%] z-0 pointer-events-none hidden lg:block animate-[bounce_5s_infinite]">
        <img
          src={pandaImg}
          alt=""
          aria-hidden
          className="w-60 h-auto drop-shadow-xl rotate-[-15deg]"
        />
      </div>
      <div className="absolute right-[-200px] top-[40%] z-0 pointer-events-none hidden lg:block animate-[bounce_6s_infinite]">
        <img
          src={monkeyImg}
          alt=""
          aria-hidden
          className="w-60 h-auto drop-shadow-xl rotate-[15deg] scale-x-[-1]"
        />
      </div>

      <div className="flex flex-col h-full w-full paper-card overflow-visible relative z-10 group">
        <div className="flex flex-wrap gap-3 justify-between items-center bg-pink-50 p-4 border-b-2 border-pink-100 rounded-t-3xl relative z-10">
          <div className="flex items-center gap-3 flex-wrap">
            {working ? (
              <button
                onClick={cancel}
                className="btn-bounce flex items-center gap-2 bg-rose-400 text-white px-5 py-2.5 rounded-full font-extrabold hover:bg-rose-500 shadow-md shadow-rose-200"
              >
                <XCircle className="w-5 h-5" />
                Cancelar
              </button>
            ) : (
              <button
                onClick={processAll}
                className="btn-bounce flex items-center gap-2 bg-pink-400 text-white px-5 py-2.5 rounded-full font-extrabold hover:bg-pink-500 shadow-md shadow-pink-200"
              >
                <HeartPulse className="w-5 h-5 animate-pulse" />
                ¡DALAAAA! <Sparkles className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => setShowConfirmClear(true)}
              disabled={working}
              className="btn-bounce flex items-center gap-2 bg-white text-rose-500 px-4 py-2.5 rounded-full font-bold hover:bg-rose-50 border-2 border-rose-100 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Sacá todo esto
            </button>

            <button
              onClick={handleExportAll}
              disabled={successCount === 0}
              className="btn-bounce flex items-center gap-2 bg-white text-indigo-500 px-4 py-2.5 rounded-full font-bold hover:bg-indigo-50 border-2 border-indigo-100 transition-colors disabled:opacity-50"
              title="Descargar todos los textos como ZIP"
            >
              <Package className="w-4 h-4" />
              Exportar todo ({successCount})
            </button>
          </div>

          <div className="flex items-center gap-2 bg-white p-1 rounded-full border-2 border-pink-100 shadow-sm">
            <button
              onClick={handleCleanFormat}
              disabled={!activeFile?.resultText}
              className="btn-bounce p-2.5 rounded-full text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 disabled:opacity-30 transition-colors"
              title="Ordenar Párrafos"
              aria-label="Ordenar párrafos"
            >
              <Eraser className="w-5 h-5" />
            </button>
            <button
              onClick={handleCopy}
              disabled={!activeFile?.resultText}
              className="btn-bounce p-2.5 rounded-full text-zinc-400 hover:text-pink-500 hover:bg-pink-50 disabled:opacity-30 transition-colors"
              title="Copiar Texto"
              aria-label="Copiar texto"
            >
              <Copy className="w-5 h-5" />
            </button>
            <button
              onClick={handleSave}
              disabled={!activeFile?.resultText}
              className="btn-bounce p-2.5 rounded-full text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 disabled:opacity-30 transition-colors"
              title="Guardar como TXT"
              aria-label="Guardar como TXT"
            >
              <Save className="w-5 h-5" />
            </button>
          </div>
        </div>

        {working && (
          <div className="bg-pink-50 border-b-2 border-pink-100 px-4 py-2">
            <div className="flex items-center justify-between text-xs font-extrabold text-pink-600 mb-1">
              <span>Procesando...</span>
              <span>{globalProgress}%</span>
            </div>
            <div className="h-2 bg-pink-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-pink-400 transition-all duration-300"
                style={{ width: `${globalProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row flex-1 min-h-0 bg-transparent">
          <div className="w-full md:w-72 border-b-2 md:border-b-0 md:border-r-2 border-pink-100 bg-white/60 p-3 overflow-y-auto flex flex-col gap-2 max-h-56 md:max-h-none">
            <div className="sticky top-0 pb-2 mb-2 border-b-2 border-pink-100 bg-white/90 z-10 font-black text-[12px] text-pink-400 uppercase flex items-center justify-between px-2">
              <span className="flex items-center gap-1">
                La data <Files className="w-3 h-3" />
              </span>
              <span className="bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full">
                {files.length}
              </span>
            </div>
            {files.map((file) => (
              <div
                key={file.id}
                className={`flex items-center gap-2 w-full text-left rounded-2xl transition-all ${
                  activeFileId === file.id
                    ? 'bg-pink-100 border-pink-300 border-2 shadow-sm'
                    : 'hover:bg-pink-50 border-2 border-transparent'
                }`}
              >
                <button
                  onClick={() => setActiveFile(file.id)}
                  className="flex items-center gap-3 flex-1 text-left p-3 btn-bounce min-w-0"
                >
                  <div className="shrink-0">
                    {file.status === 'success' ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    ) : file.status === 'processing' ? (
                      <CircleDashed className="w-6 h-6 text-pink-400 animate-spin" />
                    ) : file.status === 'error' ? (
                      <AlertTriangle className="w-6 h-6 text-rose-400" />
                    ) : (
                      <Camera
                        className={`w-5 h-5 ${
                          activeFileId === file.id ? 'text-pink-500' : 'text-zinc-300'
                        }`}
                      />
                    )}
                  </div>
                  <span
                    className={`truncate flex-1 text-sm font-bold ${
                      activeFileId === file.id
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
                    <button
                      onClick={() => processOne(file.id)}
                      disabled={working}
                      className="p-1.5 rounded-full text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 disabled:opacity-30"
                      title="Reintentar"
                      aria-label="Reintentar"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => removeFile(file.id)}
                    disabled={working}
                    className="p-1.5 rounded-full text-zinc-300 hover:text-rose-500 hover:bg-rose-50 disabled:opacity-30"
                    title="Eliminar"
                    aria-label="Eliminar archivo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex-1 p-5 md:border-r-2 border-pink-100 bg-zinc-50 relative flex flex-col min-h-[280px]">
            <div className="absolute top-4 left-4 z-10 bg-white px-4 py-1.5 rounded-full text-xs font-bold text-pink-400 shadow-sm border-2 border-pink-100 flex items-center gap-1">
              <Camera className="w-3 h-3" /> Evidencia A
            </div>
            {activeFile ? (
              <div className="w-full h-full p-2 flex items-center justify-center">
                <img
                  src={activeFile.previewUrl}
                  alt={`Preview de ${activeFile.file.name}`}
                  className="max-w-full max-h-full object-contain drop-shadow-md rounded-xl"
                />
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-300 text-center gap-2">
                <Camera className="w-16 h-16 text-pink-100" />
                <span className="font-bold text-pink-200 px-4">
                  En fin, la hipotenusa. Elegí algo.
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col relative min-w-0 md:min-w-[40%] bg-pink-50 border-t-2 md:border-t-0 md:border-l border-pink-200 min-h-[280px]">
            {activeFile?.status === 'processing' && (
              <div className="absolute inset-0 bg-white/90 z-20 flex flex-col items-center justify-center gap-4 p-6 text-center">
                <CircleDashed className="w-14 h-14 text-pink-400 animate-spin" />
                <p className="font-extrabold text-pink-500 text-lg animate-pulse flex items-center gap-2">
                  Tranquila negra, procesando... <Coffee className="w-5 h-5" />
                </p>
                {activeFile.infoMessage && (
                  <p className="text-pink-400 font-bold text-sm bg-pink-50 px-4 py-2 rounded-2xl border border-pink-100 max-w-xs">
                    {activeFile.infoMessage}
                  </p>
                )}
              </div>
            )}

            {activeFile?.status === 'error' && activeFile.errorMessage && (
              <div className="absolute top-4 right-4 z-10 bg-rose-100 text-rose-600 px-3 py-1.5 rounded-full text-xs font-bold border-2 border-rose-200 flex items-center gap-1 max-w-[80%]">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span className="truncate" title={activeFile.errorMessage}>
                  {activeFile.errorMessage}
                </span>
              </div>
            )}

            <div className="flex-1 h-full w-full relative">
              <div className="absolute top-4 left-[80px] z-10 bg-white/80 px-4 py-1.5 rounded-full text-xs font-bold text-emerald-500 shadow-sm border-2 border-emerald-100 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Texto Extraído
              </div>
              <textarea
                className="w-full h-full min-h-[280px] resize-none outline-none text-slate-800 font-medium text-[16px] custom-scrollbar placeholder:text-zinc-400 agenda-paper pl-[80px] pt-[60px] pr-5"
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
