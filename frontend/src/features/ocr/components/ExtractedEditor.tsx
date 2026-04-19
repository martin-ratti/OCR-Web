import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  AlertTriangle,
  CircleDashed,
  Coffee,
  Copy,
  FileText,
  Play,
  Search,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MonkeyIcon } from './MascotIcons';
import type { OcrFile } from '../../../store/useOcrStore';

interface ExtractedEditorProps {
  activeFile: OcrFile | undefined;
  fontSize: number;
  onChange: (text: string) => void;
  onCopy: () => Promise<boolean> | boolean;
}

export interface ExtractedEditorHandle {
  openSearch: () => void;
  focusTextarea: () => void;
}

export const ExtractedEditor = forwardRef<ExtractedEditorHandle, ExtractedEditorProps>(
  function ExtractedEditor({ activeFile, fontSize, onChange, onCopy }, ref) {
    const [justCopied, setJustCopied] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [findText, setFindText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const timeoutRef = useRef<number | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useImperativeHandle(ref, () => ({
      openSearch: () => setSearchOpen(true),
      focusTextarea: () => textareaRef.current?.focus(),
    }));

    useEffect(() => {
      return () => {
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      };
    }, []);

    const handleFloatingCopy = async () => {
      const ok = await onCopy();
      if (!ok) return;
      setJustCopied(true);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setJustCopied(false), 1100);
    };

    const canCopy = !!activeFile?.resultText;
    const isEditable = !!activeFile && activeFile.status !== 'processing';

    const performReplace = (replaceAll: boolean) => {
      if (!activeFile?.resultText || !findText) return;
      const flags = replaceAll ? 'gi' : 'i';
      const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, flags);
      const next = activeFile.resultText.replace(re, replaceText);
      if (next !== activeFile.resultText) onChange(next);
    };

    return (
      <section
        className="flex-1 min-w-0 flex flex-col relative bg-pink-50 border-t-2 md:border-t-0 md:border-l border-pink-200 min-h-[280px] overflow-hidden"
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
            className="absolute top-4 right-16 z-10 bg-rose-100 text-rose-600 px-3 py-1.5 rounded-full text-xs font-bold border-2 border-rose-200 flex items-center gap-1 max-w-[60%]"
          >
            <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />
            <span className="truncate" title={activeFile.errorMessage}>
              {activeFile.errorMessage}
            </span>
          </div>
        )}

        <div className="flex-1 min-h-0 w-full relative flex flex-col">
          <Badge className="absolute top-4 left-4 z-10 bg-white/90 text-emerald-600 border-2 border-emerald-100 shadow-sm rounded-full px-3 py-1 gap-1 hover:bg-white">
            <FileText className="w-3 h-3" aria-hidden /> Texto extraído
          </Badge>

          {activeFile && activeFile.status === 'idle' && (
            <Badge className="absolute top-4 right-28 z-10 bg-white/90 text-pink-500 border-2 border-pink-100 shadow-sm rounded-full px-3 py-1 gap-1 hover:bg-white">
              <Play className="w-3 h-3" aria-hidden /> Pendiente
            </Badge>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSearchOpen((v) => !v)}
                disabled={!canCopy}
                aria-label="Buscar y reemplazar"
                aria-pressed={searchOpen}
                className="btn-bounce absolute top-3 right-16 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white border-2 border-pink-200 text-pink-500 shadow-md hover:bg-pink-50 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
              >
                <Search className="w-5 h-5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>Buscar / Reemplazar (Ctrl+F)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleFloatingCopy}
                disabled={!canCopy}
                aria-label={justCopied ? 'Copiado' : 'Copiar texto extraído'}
                className="btn-bounce absolute top-3 right-3 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white border-2 border-pink-200 text-pink-500 shadow-md hover:bg-pink-50 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
              >
                {justCopied ? (
                  <MonkeyIcon className="w-7 h-7 motion-safe:animate-bounce" />
                ) : (
                  <Copy className="w-5 h-5" aria-hidden />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>{justCopied ? '¡Copiado!' : 'Copiar al portapapeles'}</TooltipContent>
          </Tooltip>

          {searchOpen && (
            <div className="absolute top-16 right-3 z-20 bg-white border-2 border-pink-200 rounded-2xl shadow-lg p-2 flex flex-col gap-2 w-[280px]">
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="text"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder="Buscar..."
                  className="flex-1 px-2 py-1 rounded-lg border border-pink-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  aria-label="Cerrar buscador"
                  className="p-1 rounded-full hover:bg-pink-50 text-pink-500"
                >
                  <X className="w-4 h-4" aria-hidden />
                </button>
              </div>
              <input
                type="text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="Reemplazar por..."
                className="w-full px-2 py-1 rounded-lg border border-pink-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => performReplace(false)}
                  disabled={!findText || !canCopy}
                  className="px-2 py-1 rounded-full text-xs font-bold bg-pink-100 text-pink-700 hover:bg-pink-200 disabled:opacity-40"
                >
                  Reemplazar
                </button>
                <button
                  onClick={() => performReplace(true)}
                  disabled={!findText || !canCopy}
                  className="px-2 py-1 rounded-full text-xs font-bold bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-40"
                >
                  Reemplazar todo
                </button>
              </div>
            </div>
          )}

          <label htmlFor="ocr-textarea" className="sr-only">
            Texto extraído editable
          </label>
          <textarea
            ref={textareaRef}
            id="ocr-textarea"
            className="paper-soft w-full h-full min-h-[280px] flex-1 resize-none outline-none font-medium custom-scrollbar placeholder:text-zinc-400 pl-6 pt-16 pr-6 pb-6 focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-inset"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.7 }}
            value={
              activeFile?.resultText ??
              (activeFile?.status === 'idle'
                ? "Mi ciela, acá va a aparecer todo tipeado como en los mismísimos renglones de tu agenda.\n\nPodés tomar notas mientras esperás. Presioná '¡DALAAAA!' para procesar."
                : '')
            }
            onChange={(e) => activeFile && onChange(e.target.value)}
            disabled={!isEditable}
            placeholder="¡Acá va a aparecer la data!"
          />
        </div>
      </section>
    );
  },
);
