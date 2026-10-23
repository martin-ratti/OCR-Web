import React, { useCallback, useRef, useState } from 'react';
import { ocrSelectors, useOcrStore } from '../../../store/useOcrStore';
import { reportAddFilesResult } from '../../../lib/addFilesFeedback';
import {
  Cpu,
  FileImage,
  FileText,
  Folder,
  Heart,
  Highlighter,
  ImagePlus,
  Images,
  Sparkles,
  UploadCloud,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { KawaiiModal } from './KawaiiModal';
import type { OcrEngine } from '@ocr-web/shared';

function partitionImages(files: FileList | File[]): { images: File[]; rejected: number } {
  const arr = Array.from(files);
  const images = arr.filter((f) => f.type.startsWith('image/'));
  return { images, rejected: arr.length - images.length };
}

const ENGINE_OPTIONS: { id: OcrEngine; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    id: 'gemini',
    label: 'Gemini IA',
    hint: 'Máxima precisión',
    icon: <Sparkles className="w-3.5 h-3.5 text-pink-500" aria-hidden />,
  },
  {
    id: 'groq',
    label: 'Groq IA',
    hint: 'Rápido en lotes',
    icon: <Zap className="w-3.5 h-3.5 text-amber-500" aria-hidden />,
  },
  {
    id: 'paddle',
    label: 'Local WebGPU',
    hint: 'Sin cuota · Offline',
    icon: <Cpu className="w-3.5 h-3.5 text-indigo-500" aria-hidden />,
  },
];

export function OcrDropzone() {
  const addFiles = useOcrStore((state) => state.addFiles);
  const selectedEngine = useOcrStore(ocrSelectors.selectedEngine);
  const extractionMode = useOcrStore(ocrSelectors.extractionMode);
  const setSelectedEngine = useOcrStore((state) => state.setSelectedEngine);
  const setExtractionMode = useOcrStore((state) => state.setExtractionMode);

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
        if (images.length) {
          const result = addFiles(images);
          reportAddFilesResult(result, rejected);
        } else if (rejected > 0) {
          reportAddFilesResult(
            { acceptedCount: 0, duplicates: [], oversized: [], capExceeded: 0 },
            rejected,
          );
        }
      }
    },
    [addFiles]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const { images, rejected } = partitionImages(e.target.files);
      if (images.length) {
        const result = addFiles(images);
        reportAddFilesResult(result, rejected);
      } else if (rejected > 0) {
        reportAddFilesResult(
          { acceptedCount: 0, duplicates: [], oversized: [], capExceeded: 0 },
          rejected,
        );
      }
    }
    e.target.value = '';
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const { images, rejected } = partitionImages(e.target.files);
      if (rejected > 0) {
        reportAddFilesResult(
          { acceptedCount: 0, duplicates: [], oversized: [], capExceeded: 0 },
          rejected,
        );
      }
      if (images.length > 0) {
        setPendingFiles(images);
        setShowFolderConfirm(true);
      }
    }
    e.target.value = '';
  };

  const confirmFolderUpload = () => {
    const result = addFiles(pendingFiles);
    reportAddFilesResult(result);
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
    <div className="flex flex-col gap-4 max-w-lg w-full mx-auto mt-[2vh]">
      <div className="paper-card p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-pink-500 dark:text-pink-300">
            ¿Qué querés transcribir?
          </span>
          <div
            role="radiogroup"
            aria-label="Modo de extracción"
            className="inline-flex items-center p-0.5 rounded-full bg-pink-50 dark:bg-zinc-950 border border-pink-200 dark:border-pink-900/70"
          >
            <button
              type="button"
              role="radio"
              aria-checked={extractionMode === 'highlight'}
              onClick={() => setExtractionMode('highlight')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold transition-colors ${
                extractionMode === 'highlight'
                  ? 'bg-pink-400 text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-pink-500'
              }`}
            >
              <Highlighter className="w-3.5 h-3.5" aria-hidden />
              Solo resaltador
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={extractionMode === 'full'}
              onClick={() => setExtractionMode('full')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold transition-colors ${
                extractionMode === 'full'
                  ? 'bg-pink-400 text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-pink-500'
              }`}
            >
              <FileText className="w-3.5 h-3.5" aria-hidden />
              Página entera
            </button>
          </div>
        </div>

        <div
          role="radiogroup"
          aria-label="Motor de reconocimiento"
          className="grid grid-cols-3 gap-1.5"
        >
          {ENGINE_OPTIONS.map((opt) => {
            const active = selectedEngine === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelectedEngine(opt.id)}
                className={`flex flex-col items-center justify-center py-2 px-2 rounded-xl border-2 text-center transition-all btn-bounce ${
                  active
                    ? 'border-pink-400 dark:border-pink-500 bg-pink-50/90 dark:bg-pink-950/50 text-pink-700 dark:text-pink-200 shadow-sm'
                    : 'border-pink-100 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/60 text-zinc-600 dark:text-zinc-400 hover:border-pink-200'
                }`}
              >
                <span className="inline-flex items-center gap-1 text-xs font-extrabold">
                  {opt.icon}
                  {opt.label}
                </span>
                <span className="text-[10px] font-bold opacity-75">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Subir imágenes — arrastrá y soltá o presioná Enter para elegir archivos"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={openFileDialog}
        onKeyDown={handleKey}
        className={`paper-card flex flex-col items-center justify-center p-9 cursor-pointer group btn-bounce focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-300 focus-visible:ring-offset-2
          ${
            isDragging
              ? 'border-pink-400 bg-pink-50 dark:bg-pink-950/40 shadow-[0_4px_20px_rgba(244,114,182,0.3)]'
              : 'border-pink-200 dark:border-pink-900/60 hover:border-pink-300 dark:hover:border-pink-700 hover:bg-pink-50/50 dark:hover:bg-pink-950/20 border-dashed border-[3px]'
          }`}
      >
        <div
          className={`p-4 rounded-3xl mb-4 transition-colors duration-200 ${
            isDragging
              ? 'bg-pink-200 dark:bg-pink-900 text-pink-600 dark:text-pink-200'
              : 'bg-pink-100 dark:bg-pink-950/80 text-pink-500 dark:text-pink-300 group-hover:bg-pink-200 dark:group-hover:bg-pink-900/80'
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
        <p className="text-muted-foreground text-sm text-center font-bold max-w-[280px]">
          Arrastrá las fotos acá. Las cosas como son, nadie quiere tipear todo a mano.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4">
          <Badge className="bg-pink-50 dark:bg-pink-950/70 text-pink-600 dark:text-pink-300 border border-pink-200 dark:border-pink-900 hover:bg-pink-50 gap-1 font-bold">
            <FileImage className="w-3 h-3" aria-hidden /> JPG
          </Badge>
          <Badge className="bg-pink-50 dark:bg-pink-950/70 text-pink-600 dark:text-pink-300 border border-pink-200 dark:border-pink-900 hover:bg-pink-50 gap-1 font-bold">
            <FileImage className="w-3 h-3" aria-hidden /> PNG
          </Badge>
          <Badge className="bg-pink-50 dark:bg-pink-950/70 text-pink-600 dark:text-pink-300 border border-pink-200 dark:border-pink-900 hover:bg-pink-50 gap-1 font-bold">
            <FileImage className="w-3 h-3" aria-hidden /> WEBP
          </Badge>
          <Badge className="bg-pink-50 dark:bg-pink-950/70 text-pink-600 dark:text-pink-300 border border-pink-200 dark:border-pink-900 hover:bg-pink-50 font-bold">
            HEIC
          </Badge>
          <Badge className="bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 font-bold">
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

      <div className="flex items-center gap-3 py-1 px-4 opacity-80">
        <Separator className="flex-1 bg-pink-200 dark:bg-pink-900/60 h-[2px] rounded-full" />
        <span className="text-[11px] text-pink-500 dark:text-pink-300 font-extrabold uppercase tracking-wider">
          O en su defecto
        </span>
        <Separator className="flex-1 bg-pink-200 dark:bg-pink-900/60 h-[2px] rounded-full" />
      </div>

      <button
        onClick={() => folderInputRef.current?.click()}
        className="paper-card btn-bounce flex items-center justify-center gap-3 w-full py-4 border-none bg-emerald-100 dark:bg-emerald-950/80 hover:bg-emerald-200 dark:hover:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300 font-extrabold shadow-sm text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
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
        description={`Elegiste una carpeta con ${pendingFiles.length} imágenes. ¿Querés cargarlas todas en la cola?`}
        confirmText="¡Sí, mandale mecha!"
        cancelText="Pará, me arrepentí"
        mascotType="monkey"
      />
    </div>
  );
}
