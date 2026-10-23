import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CircleDashed,
  Coffee,
  Copy,
  Cpu,
  FileText,
  Leaf,
  Play,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { NO_HIGHLIGHT_SENTINEL } from '@ocr-web/shared';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MonkeyIcon } from './MascotIcons';
import type { OcrFile } from '../../../store/useOcrStore';

interface ExtractedEditorProps {
  activeFile: OcrFile | undefined;
  fontSize: number;
  working: boolean;
  onChange: (text: string) => void;
  onCopy: () => Promise<boolean> | boolean;
  onReadFullPage: (id: string) => void;
  onSwitchToLocalAndRetry: (id: string) => void;
}

export interface ExtractedEditorHandle {
  openSearch: () => void;
  focusTextarea: () => void;
}

export const ExtractedEditor = forwardRef<ExtractedEditorHandle, ExtractedEditorProps>(
  function ExtractedEditor(
    {
      activeFile,
      fontSize,
      working,
      onChange,
      onCopy,
      onReadFullPage,
      onSwitchToLocalAndRetry,
    },
    ref
  ) {
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

    const isSentinel = activeFile?.resultText?.trim() === NO_HIGHLIGHT_SENTINEL;
    const canCopy = !!activeFile?.resultText && !isSentinel;
    const isEditable = !!activeFile && activeFile.status !== 'processing';

    const stats = useMemo(() => {
      const txt = activeFile?.resultText?.trim() ?? '';
      if (!txt || txt === NO_HIGHLIGHT_SENTINEL) return { words: 0, chars: 0 };
      const words = txt.split(/\s+/).filter(Boolean).length;
      return { words, chars: txt.length };
    }, [activeFile?.resultText]);

    const performReplace = (replaceAll: boolean) => {
      if (!activeFile?.resultText || !findText) return;
      const flags = replaceAll ? 'gi' : 'i';
      const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, flags);
      const next = activeFile.resultText.replace(re, replaceText);
      if (next !== activeFile.resultText) onChange(next);
    };

    const isQuotaError =
      activeFile?.status === 'error' &&
      /cuota|saturado|límite/i.test(activeFile.errorMessage ?? '');

    return (
      <section
        className="flex-1 min-w-0 flex flex-col relative bg-pink-50/70 dark:bg-zinc-900 border-t-2 md:border-t-0 md:border-l border-pink-200 dark:border-pink-950/60 min-h-[220px] overflow-hidden"
        aria-label="Texto extraído"
      >
        {activeFile?.status === 'processing' && (
          <div
            className="absolute inset-0 bg-white/90 dark:bg-zinc-950/90 z-20 flex flex-col items-center justify-center gap-4 p-6 text-center"
            role="status"
            aria-live="polite"
          >
            <CircleDashed
              className="w-14 h-14 text-pink-400 motion-safe:animate-spin"
              aria-hidden
            />
            <p className="font-extrabold text-pink-500 dark:text-pink-300 text-lg motion-safe:animate-pulse flex items-center gap-2">
              Tranquila negra, leyendo hoja... <Coffee className="w-5 h-5" aria-hidden />
            </p>
            {activeFile.infoMessage && (
              <p className="text-pink-500 dark:text-pink-300 font-bold text-sm bg-pink-50 dark:bg-pink-950/60 px-4 py-2 rounded-2xl border border-pink-100 dark:border-pink-900 max-w-xs">
                {activeFile.infoMessage}
              </p>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 w-full relative flex flex-col">
          <div className="absolute top-2 left-3 z-10 flex items-center gap-1.5">
            <Badge className="bg-white/95 dark:bg-zinc-900/95 text-emerald-600 dark:text-emerald-400 border-2 border-emerald-100 dark:border-emerald-900/60 shadow-sm rounded-full px-2.5 py-0.5 text-[11px] gap-1 hover:bg-white">
              <FileText className="w-3 h-3" aria-hidden /> Texto extraído
            </Badge>
            {activeFile?.quotaSaved && (
              <Badge className="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-full px-2 py-0.5 text-[10px] gap-1">
                <Leaf className="w-2.5 h-2.5" aria-hidden /> Cuota ahorrada
              </Badge>
            )}
          </div>

          <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
            {activeFile && activeFile.status === 'idle' && (
              <Badge className="bg-white/95 dark:bg-zinc-900/95 text-pink-500 dark:text-pink-300 border-2 border-pink-100 dark:border-pink-900/60 shadow-sm rounded-full px-2.5 py-0.5 text-[11px] gap-1 hover:bg-white">
                <Play className="w-3 h-3" aria-hidden /> Pendiente
              </Badge>
            )}
            {activeFile?.status === 'error' && activeFile.errorMessage && (
              <div
                role="alert"
                className="bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 px-2.5 py-0.5 rounded-full text-[11px] font-bold border-2 border-rose-200 dark:border-rose-900 flex items-center gap-1 max-w-[230px]"
              >
                <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />
                <span className="truncate" title={activeFile.errorMessage}>
                  {activeFile.errorMessage}
                </span>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setSearchOpen((v) => !v)}
                  disabled={!canCopy}
                  aria-label="Buscar y reemplazar"
                  aria-pressed={searchOpen}
                  className="btn-bounce w-8 h-8 flex items-center justify-center rounded-full bg-white dark:bg-zinc-900 border-2 border-pink-200 dark:border-pink-900/60 text-pink-500 dark:text-pink-300 shadow-md hover:bg-pink-50 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
                >
                  <Search className="w-4 h-4" aria-hidden />
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
                  className="btn-bounce w-8 h-8 flex items-center justify-center rounded-full bg-white dark:bg-zinc-900 border-2 border-pink-200 dark:border-pink-900/60 text-pink-500 dark:text-pink-300 shadow-md hover:bg-pink-50 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
                >
                  {justCopied ? (
                    <MonkeyIcon className="w-5 h-5 motion-safe:animate-bounce" />
                  ) : (
                    <Copy className="w-4 h-4" aria-hidden />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>{justCopied ? '¡Copiado!' : 'Copiar al portapapeles'}</TooltipContent>
            </Tooltip>
          </div>

          {searchOpen && (
            <div className="absolute top-12 right-3 z-20 bg-white dark:bg-zinc-900 border-2 border-pink-200 dark:border-pink-900 rounded-2xl shadow-lg p-2.5 flex flex-col gap-2 w-[280px]">
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="text"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder="Buscar..."
                  className="flex-1 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-pink-200 dark:border-pink-900 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  aria-label="Cerrar buscador"
                  className="p-1 rounded-full hover:bg-pink-50 dark:hover:bg-zinc-800 text-pink-500"
                >
                  <X className="w-4 h-4" aria-hidden />
                </button>
              </div>
              <input
                type="text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="Reemplazar por..."
                className="w-full px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 border border-pink-200 dark:border-pink-900 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => performReplace(false)}
                  disabled={!findText || !canCopy}
                  className="px-2.5 py-1 rounded-full text-xs font-bold bg-pink-100 dark:bg-pink-950 text-pink-700 dark:text-pink-300 hover:bg-pink-200 disabled:opacity-40"
                >
                  Reemplazar
                </button>
                <button
                  onClick={() => performReplace(true)}
                  disabled={!findText || !canCopy}
                  className="px-2.5 py-1 rounded-full text-xs font-bold bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-40"
                >
                  Reemplazar todo
                </button>
              </div>
            </div>
          )}

          {activeFile && isSentinel && !working && (
            <div className="mx-3 mt-11 mb-1 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-200 dark:border-amber-900/60 flex items-center justify-between gap-3 flex-wrap z-10">
              <p className="text-xs font-bold text-amber-800 dark:text-amber-200">
                Esta hoja no tiene marcador resaltador detectado (no se incluirá al exportar Word/ZIP).
              </p>
              <button
                type="button"
                onClick={() => onReadFullPage(activeFile.id)}
                className="btn-bounce inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden />
                Leer página entera igual
              </button>
            </div>
          )}

          {activeFile && isQuotaError && !working && (
            <div className="mx-3 mt-11 mb-1 p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border-2 border-indigo-200 dark:border-indigo-900 flex items-center justify-between gap-3 flex-wrap z-10">
              <p className="text-xs font-bold text-indigo-800 dark:text-indigo-200">
                ¿Se acabó la cuota de IA? Podés seguir procesando gratis en tu navegador con PP-OCRv6.
              </p>
              <button
                type="button"
                onClick={() => onSwitchToLocalAndRetry(activeFile.id)}
                className="btn-bounce inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-extrabold shadow-sm"
              >
                <Cpu className="w-3.5 h-3.5" aria-hidden />
                Usar motor Local (sin cuota)
              </button>
            </div>
          )}

          <label htmlFor="ocr-textarea" className="sr-only">
            Texto extraído editable
          </label>
          <textarea
            ref={textareaRef}
            id="ocr-textarea"
            className={`paper-soft w-full h-full min-h-[180px] flex-1 resize-none outline-none font-medium custom-scrollbar placeholder:text-zinc-400 dark:placeholder:text-zinc-500 pl-4 pr-4 pb-8 focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-inset ${
              (activeFile && isSentinel && !working) || (activeFile && isQuotaError && !working)
                ? 'pt-3'
                : 'pt-11'
            }`}
            style={{ fontSize: `${fontSize}px` }}
            value={
              activeFile?.resultText ??
              (activeFile?.status === 'idle'
                ? "Mi ciela, acá va a aparecer todo tipeado prolijo y sin palabras cortadas.\n\nElegí arriba si querés 'Resaltado' o 'Página entera' y presioná '¡DALAAAA!' (o Ctrl+Enter)."
                : '')
            }
            onChange={(e) => activeFile && onChange(e.target.value)}
            disabled={!isEditable}
            placeholder="¡Acá va a aparecer la data!"
          />

          {stats.words > 0 && (
            <div
              className="absolute bottom-2 right-3 z-10 px-2.5 py-0.5 rounded-full bg-white/85 dark:bg-zinc-900/85 border border-pink-100 dark:border-zinc-800 text-[10px] font-bold text-zinc-500 dark:text-zinc-400 tabular-nums pointer-events-none"
              aria-live="polite"
            >
              {stats.words} palabras · {stats.chars} caract.
            </div>
          )}
        </div>
      </section>
    );
  }
);
