import React, { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useOcrStore } from '../../../store/useOcrStore';
import { ImagePlus, Images, Heart, Folder, UploadCloud, FileImage } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { KawaiiModal } from './KawaiiModal';

function partitionImages(files: FileList | File[]): { images: File[]; rejected: number } {
  const arr = Array.from(files);
  const images = arr.filter((f) => f.type.startsWith('image/'));
  return { images, rejected: arr.length - images.length };
}

function warnIfRejected(rejected: number) {
  if (rejected > 0) {
    toast.warning(`${rejected} archivo(s) ignorado(s) — sólo imágenes permitidas.`);
  }
}

export function OcrDropzone() {
  const addFiles = useOcrStore((state) => state.addFiles);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showFolderConfirm, setShowFolderConfirm] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files?.length) {
        const { images, rejected } = partitionImages(e.dataTransfer.files);
        warnIfRejected(rejected);
        if (images.length) addFiles(images);
      }
    },
    [addFiles]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const { images, rejected } = partitionImages(e.target.files);
      warnIfRejected(rejected);
      if (images.length) addFiles(images);
    }
    e.target.value = '';
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const { images, rejected } = partitionImages(e.target.files);
      warnIfRejected(rejected);
      if (images.length > 0) {
        setPendingFiles(images);
        setShowFolderConfirm(true);
      }
    }
    e.target.value = '';
  };

  const confirmFolderUpload = () => {
    addFiles(pendingFiles);
    setPendingFiles([]);
    setShowFolderConfirm(false);
  };

  const openFileDialog = () => fileInputRef.current?.click();

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFileDialog();
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-md w-full mx-auto mt-[4vh]">
      <div
        role="button"
        tabIndex={0}
        aria-label="Subir imágenes — arrastrá y soltá o presioná Enter para elegir archivos"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={openFileDialog}
        onKeyDown={handleKey}
        className={`paper-card flex flex-col items-center justify-center p-10 cursor-pointer group btn-bounce focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300 focus-visible:ring-offset-2
          ${
            isDragging
              ? 'border-pink-400 bg-pink-50 shadow-[0_4px_20px_rgba(244,114,182,0.3)]'
              : 'border-pink-200 hover:border-pink-300 hover:bg-pink-50/50 border-dashed border-[3px]'
          }`}
      >
        <div
          className={`p-4 rounded-3xl mb-4 transition-colors duration-200 ${
            isDragging
              ? 'bg-pink-200 text-pink-600'
              : 'bg-pink-100 text-pink-500 group-hover:bg-pink-200'
          }`}
        >
          {isDragging ? (
            <UploadCloud className="w-12 h-12 motion-safe:animate-bounce" aria-hidden />
          ) : (
            <ImagePlus className="w-12 h-12" aria-hidden />
          )}
        </div>

        <h2 className="text-xl font-extrabold text-foreground mb-2 text-center flex items-center gap-2">
          {isDragging ? (
            <>
              ¡Sueltalo negra!{' '}
              <Heart
                className="w-5 h-5 text-pink-500 fill-current motion-safe:animate-bounce"
                aria-hidden
              />
            </>
          ) : (
            'Toca para subir el chisme (tus hojas)'
          )}
        </h2>
        <p className="text-muted-foreground text-sm text-center font-bold max-w-[260px]">
          Arrastrá las fotos acá. Las cosas como son, nadie quiere tipear todo a mano.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4">
          <Badge className="bg-pink-50 text-pink-600 border border-pink-200 hover:bg-pink-50 gap-1 font-bold">
            <FileImage className="w-3 h-3" aria-hidden /> JPG
          </Badge>
          <Badge className="bg-pink-50 text-pink-600 border border-pink-200 hover:bg-pink-50 gap-1 font-bold">
            <FileImage className="w-3 h-3" aria-hidden /> PNG
          </Badge>
          <Badge className="bg-pink-50 text-pink-600 border border-pink-200 hover:bg-pink-50 gap-1 font-bold">
            <FileImage className="w-3 h-3" aria-hidden /> WEBP
          </Badge>
          <Badge className="bg-pink-50 text-pink-600 border border-pink-200 hover:bg-pink-50 gap-1 font-bold">
            HEIC
          </Badge>
          <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-50 font-bold">
            · hasta 5 MB c/u
          </Badge>
        </div>

        <input
          type="file"
          multiple
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          aria-hidden
          tabIndex={-1}
        />
      </div>

      <div className="flex items-center gap-3 py-2 px-4 opacity-80">
        <Separator className="flex-1 bg-pink-200 h-[2px] rounded-full" />
        <span className="text-[11px] text-pink-500 font-extrabold uppercase tracking-wider">
          O en su defecto
        </span>
        <Separator className="flex-1 bg-pink-200 h-[2px] rounded-full" />
      </div>

      <button
        onClick={() => folderInputRef.current?.click()}
        className="paper-card btn-bounce flex items-center justify-center gap-3 w-full py-4 border-none bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-extrabold shadow-sm text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
      >
        <Images className="w-6 h-6" aria-hidden />
        Dale nena, subí toda la carpeta <Folder className="w-5 h-5 fill-current" aria-hidden />
      </button>

      <input
        type="file"
        ref={folderInputRef}
        onChange={handleFolderSelect}
        className="hidden"
        aria-hidden
        tabIndex={-1}
        {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
      />

      <KawaiiModal
        isOpen={showFolderConfirm}
        onClose={() => {
          setShowFolderConfirm(false);
          setPendingFiles([]);
        }}
        onConfirm={confirmFolderUpload}
        title="¡Chisme detectado!"
        description={`Elegiste una carpeta con ${pendingFiles.length} imágenes. ¿Querés que las procese todas de una? Ojo que puede tardar un poquito.`}
        confirmText="¡Sí, mandale mecha!"
        cancelText="Pará, me arrepentí"
        mascotType="monkey"
      />
    </div>
  );
}
