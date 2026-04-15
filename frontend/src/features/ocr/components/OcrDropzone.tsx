import React, { useCallback, useRef, useState } from 'react';
import { useOcrStore } from '../../../store/useOcrStore';
import { ImagePlus, Images, Heart, Folder } from 'lucide-react';

export function OcrDropzone() {
  const addFiles = useOcrStore((state) => state.addFiles);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
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
    <div className="flex flex-col gap-5 max-w-md w-full mx-auto mt-[4vh]">
      <div 
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`paper-card flex flex-col items-center justify-center p-10 cursor-pointer group btn-bounce
          ${isDragging 
            ? 'border-pink-400 bg-pink-50 shadow-[0_4px_20px_rgba(244,114,182,0.3)]' 
            : 'border-pink-200 hover:border-pink-300 hover:bg-pink-50/50 border-dashed border-[3px]'
          }`}
      >
        <div className={`p-4 rounded-3xl mb-4 transition-colors duration-200 ${isDragging ? 'bg-pink-200 text-pink-600' : 'bg-pink-100 text-pink-500 group-hover:bg-pink-200'}`}>
          <ImagePlus className="w-12 h-12" />
        </div>
        
        <h2 className="text-xl font-extrabold text-foreground mb-2 text-center flex items-center gap-2">
          {isDragging ? (
            <>¡Sueltalo negra! <Heart className="w-5 h-5 text-pink-500 fill-current animate-bounce" /></>
          ) : 'Toca para subir el chisme (tus hojas)'}
        </h2>
        <p className="text-muted-foreground text-sm text-center font-bold max-w-[250px]">
          Arrastrá las fotos acá. Las cosas como son, nadie quiere tipear todo a mano.
        </p>
        
        <input 
          type="file" 
          multiple 
          accept="image/*" 
          ref={fileInputRef} 
          onChange={handleFileSelect}
          className="hidden" 
        />
      </div>

      <div className="flex items-center gap-3 py-2 px-4 opacity-70">
        <div className="h-[2px] bg-pink-200 flex-1 rounded-full"></div>
        <span className="text-[11px] text-pink-500 font-extrabold uppercase tracking-wider">O en su defecto</span>
        <div className="h-[2px] bg-pink-200 flex-1 rounded-full"></div>
      </div>

      <button 
        onClick={() => folderInputRef.current?.click()}
        className="paper-card btn-bounce flex items-center justify-center gap-3 w-full py-4 border-none bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-extrabold shadow-sm text-[15px]"
      >
        <Images className="w-6 h-6" />
        Dale nena, subí toda la carpeta <Folder className="w-5 h-5 fill-current" />
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
