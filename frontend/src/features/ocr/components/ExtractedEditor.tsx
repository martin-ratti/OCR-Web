import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CircleDashed,
  Coffee,
  Copy,
  FileText,
  Play,
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

export function ExtractedEditor({
  activeFile,
  fontSize,
  onChange,
  onCopy,
}: ExtractedEditorProps) {
  const [justCopied, setJustCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

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

      <div className="flex-1 min-h-0 w-full relative">
        <Badge className="absolute top-4 left-4 z-10 bg-white/90 text-emerald-600 border-2 border-emerald-100 shadow-sm rounded-full px-3 py-1 gap-1 hover:bg-white">
          <FileText className="w-3 h-3" aria-hidden /> Texto extraído
        </Badge>

        {activeFile && activeFile.status === 'idle' && (
          <Badge className="absolute top-4 right-16 z-10 bg-white/90 text-pink-500 border-2 border-pink-100 shadow-sm rounded-full px-3 py-1 gap-1 hover:bg-white">
            <Play className="w-3 h-3" aria-hidden /> Pendiente
          </Badge>
        )}

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

        <label htmlFor="ocr-textarea" className="sr-only">
          Texto extraído editable
        </label>
        <textarea
          id="ocr-textarea"
          className="paper-soft w-full h-full min-h-[280px] resize-none outline-none font-medium custom-scrollbar placeholder:text-zinc-400 pl-6 pt-16 pr-6 pb-6 focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-inset"
          style={{ fontSize: `${fontSize}px`, lineHeight: 1.7 }}
          value={
            activeFile?.resultText ??
            (activeFile?.status === 'idle'
              ? "Mi ciela, acá va a aparecer todo tipeado como en los mismísimos renglones de tu agenda.\n\nPresioná '¡DALAAAA!' para que todo suceda."
              : '')
          }
          onChange={(e) => activeFile && onChange(e.target.value)}
          disabled={!activeFile || activeFile.status !== 'success'}
          placeholder="¡Acá va a aparecer la data!"
        />
      </div>
    </section>
  );
}
