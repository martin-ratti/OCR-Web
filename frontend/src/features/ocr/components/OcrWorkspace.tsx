import { useState } from 'react';
import { useOcrStore } from '../../../store/useOcrStore';
import { KawaiiModal } from './KawaiiModal';
import { Save, Copy, CheckCircle2, CircleDashed, Eraser, Trash2, Camera, HeartPulse, Sparkles, Coffee, FileText, Files } from 'lucide-react';

import pandaImg from '../../../assets/panda.png';
import monkeyImg from '../../../assets/monkey.png';

export function OcrWorkspace() {
  const { files, activeFileId, globalStatus, updateFileResult, setActiveFile, processAll, clearAll } = useOcrStore();
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const activeFile = files.find(f => f.id === activeFileId);

  const handleCleanFormat = () => {
    if (!activeFile?.resultText) return;
    let text = activeFile.resultText.replace(/\n\n/g, '___PARAGRAPH_BREAK___');
    text = text.replace(/\n/g, ' ');
    text = text.replace(/___PARAGRAPH_BREAK___/g, '\n\n');
    updateFileResult(activeFile.id, text);
  };

  const handleCopy = async () => {
    if (!activeFile?.resultText) return;
    await navigator.clipboard.writeText(activeFile.resultText);
  };

  const handleSave = () => {
    if (!activeFile?.resultText) return;
    const blob = new Blob([activeFile.resultText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Apunte_${activeFile.file.name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative w-full h-[calc(100vh-12rem)] mx-auto">
      {/* Mascotas Tiernas asomándose desde atrás (fuera del card para que no las tape el fondo) */}
      <div className="absolute left-[-200px] top-[15%] z-0 pointer-events-none hidden lg:block animate-[bounce_5s_infinite]">
        <img src={pandaImg} alt="Panda" className="w-60 h-auto drop-shadow-xl rotate-[-15deg]" />
      </div>
      <div className="absolute right-[-200px] top-[40%] z-0 pointer-events-none hidden lg:block animate-[bounce_6s_infinite]">
        <img src={monkeyImg} alt="Monkey" className="w-60 h-auto drop-shadow-xl rotate-[15deg] scale-x-[-1]" />
      </div>

      <div className="flex flex-col h-full w-full paper-card overflow-visible relative z-10 group">
        
        {/* Top Toolbar */}
        <div className="flex justify-between items-center bg-pink-50 p-4 border-b-2 border-pink-100 rounded-t-3xl relative z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={processAll} 
            disabled={globalStatus === 'working'}
            className="btn-bounce flex items-center gap-2 bg-pink-400 text-white px-5 py-2.5 rounded-full font-extrabold hover:bg-pink-500 disabled:opacity-50 shadow-md shadow-pink-200"
          >
            {globalStatus === 'working' ? (
               <CircleDashed className="w-5 h-5 animate-spin" />
            ) : (
               <HeartPulse className="w-5 h-5 animate-pulse" />
            )}
            ¡DALAAAA! <Sparkles className="w-4 h-4" />
          </button>
          
          <button 
            onClick={() => setShowConfirmClear(true)} 
            className="btn-bounce flex items-center gap-2 bg-white text-rose-500 px-4 py-2.5 rounded-full font-bold hover:bg-rose-50 border-2 border-rose-100 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Sacá todo esto
          </button>
        </div>

        <div className="flex items-center gap-2 bg-white p-1 rounded-full border-2 border-pink-100 shadow-sm">
           <button 
             onClick={handleCleanFormat} 
             disabled={!activeFile?.resultText}
             className="btn-bounce p-2.5 rounded-full text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 disabled:opacity-30 transition-colors"
             title="Ordenar Párrafos"
           >
             <Eraser className="w-5 h-5" />
           </button>
           <button 
             onClick={handleCopy} 
             disabled={!activeFile?.resultText}
             className="btn-bounce p-2.5 rounded-full text-zinc-400 hover:text-pink-500 hover:bg-pink-50 disabled:opacity-30 transition-colors"
             title="Copiar Texto"
           >
             <Copy className="w-5 h-5" />
           </button>
           <button 
             onClick={handleSave} 
             disabled={!activeFile?.resultText}
             className="btn-bounce p-2.5 rounded-full text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 disabled:opacity-30 transition-colors"
             title="Guardar como TXT"
           >
             <Save className="w-5 h-5" />
           </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 bg-transparent">
        
        {/* Panel Izquierdo: Lista de Archivos */}
        <div className="w-72 border-r-2 border-pink-100 bg-white/60 p-3 overflow-y-auto flex flex-col gap-2">
          <div className="sticky top-0 pb-2 mb-2 border-b-2 border-pink-100 bg-white/90 z-10 font-black text-[12px] text-pink-400 uppercase flex items-center justify-between px-2">
            <span className="flex items-center gap-1">La data <Files className="w-3 h-3" /></span>
            <span className="bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full">{files.length}</span>
          </div>
          {files.map(file => (
            <button
               key={file.id}
               onClick={() => setActiveFile(file.id)}
               className={`flex items-center gap-3 w-full text-left p-3 rounded-2xl transition-all btn-bounce ${activeFileId === file.id ? 'bg-pink-100 border-pink-300 border-2 shadow-sm' : 'hover:bg-pink-50 border-2 border-transparent'}`}
            >
              <div className="mr-1 shrink-0">
                {file.status === 'success' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                ) : file.status === 'processing' ? (
                  <CircleDashed className="w-6 h-6 text-pink-400 animate-spin" />
                ) : (
                  <Camera className={`w-5 h-5 ${activeFileId === file.id ? 'text-pink-500' : 'text-zinc-300'}`} />
                )}
              </div>
              <span className={`truncate flex-1 text-sm font-bold ${activeFileId === file.id ? 'text-pink-600' : (file.status === 'success' ? 'text-zinc-700' : 'text-zinc-400')}`}>
                {file.file.name}
              </span>
            </button>
          ))}
        </div>

        {/* Panel Central: Imagen */}
        <div className="flex-1 p-5 border-r-2 border-pink-100 bg-zinc-50 relative flex flex-col">
          <div className="absolute top-4 left-4 z-10 bg-white px-4 py-1.5 rounded-full text-xs font-bold text-pink-400 shadow-sm border-2 border-pink-100 flex items-center gap-1">
             <Camera className="w-3 h-3" /> Evidencia A
          </div>
          {activeFile ? (
            <div className="w-full h-full p-2 flex items-center justify-center">
              <img 
                src={activeFile.previewUrl} 
                alt="Preview" 
                className="max-w-full max-h-full object-contain drop-shadow-md rounded-xl"
              />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-300 text-center gap-2">
              <Camera className="w-16 h-16 text-pink-100" />
              <span className="font-bold text-pink-200 px-4">En fin, la hipotenusa. Elegí algo.</span>
            </div>
          )}
        </div>

        {/* Panel Derecho: Texto extraído (HOJA DE AGENDA CON RENGLONES) */}
        <div className="flex-1 flex flex-col relative min-w-[40%] bg-pink-50 border-l border-pink-200">
           {activeFile?.status === 'processing' && (
             <div className="absolute inset-0 bg-white/90 z-20 flex flex-col items-center justify-center gap-4 p-6 text-center">
                <CircleDashed className="w-14 h-14 text-pink-400 animate-spin" />
                <p className="font-extrabold text-pink-500 text-lg animate-pulse flex items-center gap-2">
                  Tranquila negra, procesando... <Coffee className="w-5 h-5" />
                </p>
                {activeFile.errorMessage && (
                  <p className="text-pink-400 font-bold text-sm bg-pink-50 px-4 py-2 rounded-2xl border border-pink-100 max-w-xs">
                    {activeFile.errorMessage}
                  </p>
                )}
             </div>
           )}
           
           <div className="flex-1 h-full w-full relative">
             <div className="absolute top-4 left-[80px] z-10 bg-white/80 px-4 py-1.5 rounded-full text-xs font-bold text-emerald-500 shadow-sm border-2 border-emerald-100 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Texto Extraído
             </div>
             <textarea 
               className="w-full h-full resize-none outline-none text-slate-800 font-medium text-[16px] custom-scrollbar placeholder:text-zinc-400 agenda-paper pl-[80px] pt-[60px] pr-5"
               value={activeFile?.resultText || activeFile?.errorMessage || (activeFile?.status === 'idle' ? "Mi ciela, acá va a aparecer todo tipeado como en los mismísimos renglones de tu agenda.\n\nPresioná '¡DALAAAA!' para que todo suceda." : "")}
               readOnly
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
