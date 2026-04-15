import React, { useCallback, useRef } from 'react';
import { useOcrStore } from '../../../store/useOcrStore';
import { UploadCloud, FolderUp } from 'lucide-react';

export function OcrDropzone() {
  const addFiles = useOcrStore((state) => state.addFiles);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const validFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      addFiles(validFiles);
    }
  }, [addFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const validFiles = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
      addFiles(validFiles);
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-sm w-full mx-auto mt-[10vh]">
      <div 
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-primary rounded-xl bg-card hover:bg-green-50 transition cursor-pointer group"
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadCloud className="w-16 h-16 text-primary mb-4 group-hover:scale-110 transition-transform" />
        <h2 className="text-xl font-bold text-primary mb-2 text-center">Arrastra tus imágenes aquí</h2>
        <p className="text-muted-foreground text-center">o haz clic para seleccionar archivos</p>
        
        <input 
          type="file" 
          multiple 
          accept="image/*" 
          ref={fileInputRef} 
          onChange={handleFileSelect}
          className="hidden" 
        />
      </div>

      {/* Botón clásico de python gui: "Procesar Carpeta" */}
      <button 
        onClick={() => folderInputRef.current?.click()}
        className="flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-secondary hover:bg-secondary/90 text-white font-bold transition shadow-sm"
      >
        <FolderUp className="w-5 h-5" />
        Procesar Carpeta Entera
      </button>

      {/* Evitamos error TS forzando los props non-standard de webkitdirectory */}
      <input 
        type="file" 
        ref={folderInputRef} 
        onChange={handleFileSelect}
        className="hidden" 
        {...({ webkitdirectory: "", directory: "" } as any)}
      />
    </div>
  );
}
