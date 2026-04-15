
import { useOcrStore } from '../../../store/useOcrStore';
import { Sparkles, Save, Copy, FileText, CheckCircle2, CircleDashed, Eraser } from 'lucide-react';

export function OcrWorkspace() {
  const { files, activeFileId, globalStatus, updateFileResult, setActiveFile, processAll, clearAll } = useOcrStore();

  const activeFile = files.find(f => f.id === activeFileId);

  const handleCleanFormat = () => {
    if (!activeFile?.resultText) return;
    // Replicar la logica de Python GUI:
    // Reemplaza multiples saltos por un tag, un salto p/espacio, luego restaura multiples saltos.
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
    a.download = `OCR_${activeFile.file.name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] w-full max-w-7xl mx-auto border-2 border-primary/20 rounded-xl overflow-hidden bg-background">
      
      {/* Top Toolbar */}
      <div className="flex justify-between items-center bg-card p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button 
            onClick={processAll} 
            disabled={globalStatus === 'working'}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-bold hover:bg-primary/90 disabled:opacity-50 transition"
          >
            <Sparkles className="w-5 h-5" />
            Extraer Todo
          </button>
          
          <button 
            onClick={clearAll} 
            className="flex items-center gap-2 border border-destructive text-destructive px-4 py-2 rounded-lg font-bold hover:bg-destructive/10 transition"
          >
            Limpiar Lista
          </button>
        </div>

        <div className="flex items-center gap-2">
           <button 
             onClick={handleCleanFormat} 
             disabled={!activeFile?.resultText}
             className="p-2 rounded-lg text-secondary hover:bg-secondary/10 disabled:opacity-50 transition"
             title="Limpiar Formato"
           >
             <Eraser className="w-5 h-5" />
           </button>
           <button 
             onClick={handleCopy} 
             disabled={!activeFile?.resultText}
             className="p-2 rounded-lg text-secondary hover:bg-secondary/10 disabled:opacity-50 transition"
             title="Copiar Texto"
           >
             <Copy className="w-5 h-5" />
           </button>
           <button 
             onClick={handleSave} 
             disabled={!activeFile?.resultText}
             className="p-2 rounded-lg text-primary hover:bg-primary/10 disabled:opacity-50 transition"
             title="Guardar TXT"
           >
             <Save className="w-5 h-5" />
           </button>
        </div>
      </div>

      <div className="flex h-full min-h-0">
        
        {/* Panel Izquierdo: Lista de Archivos */}
        <div className="w-64 border-r border-border bg-card p-2 overflow-y-auto flex flex-col gap-1">
          {files.map(file => (
            <button
              key={file.id}
              onClick={() => setActiveFile(file.id)}
              className={`flex items-center gap-2 w-full text-left p-3 rounded-lg transition ${activeFileId === file.id ? 'bg-primary/10 border border-primary/20 shadow-sm' : 'hover:bg-muted'}`}
            >
              {file.status === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              ) : file.status === 'processing' ? (
                <CircleDashed className="w-4 h-4 text-secondary animate-spin shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <span className="truncate flex-1 text-sm font-medium" style={{ color: file.status === 'success' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>
                {file.file.name}
              </span>
            </button>
          ))}
        </div>

        {/* Panel Central: Imagen */}
        <div className="flex-1 bg-muted/30 p-4 border-r border-border overflow-hidden">
          {activeFile ? (
            <img 
              src={activeFile.previewUrl} 
              alt="Preview preview" 
              className="w-full h-full object-contain drop-shadow-md rounded border border-border"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              Ninguna imagen seleccionada
            </div>
          )}
        </div>

        {/* Panel Derecho: Texto Resultado */}
        <div className="flex-1 p-4 bg-white relative">
           {activeFile?.status === 'processing' && (
             <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
                <CircleDashed className="w-12 h-12 text-secondary animate-spin" />
                <p className="font-bold text-secondary">La IA de Gemini está analizando...</p>
             </div>
           )}
           
           <textarea 
             className="w-full h-full resize-none outline-none text-foreground bg-transparent p-2"
             value={activeFile?.resultText || activeFile?.errorMessage || (activeFile?.status === 'idle' ? "Pendiente a procesar..." : "")}
             readOnly
             placeholder="El texto extraído aparecerá aquí."
           />
        </div>

      </div>
    </div>
  );
}
