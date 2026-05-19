import { useRef, useState } from 'react';
import { Camera, ImageIcon, Minus, Plus, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { OcrFile } from '../../../store/useOcrStore';

interface OriginalViewerProps {
  activeFile: OcrFile | undefined;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const SCALE_STEP = 0.2;

export function OriginalViewer({ activeFile }: OriginalViewerProps) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [prevId, setPrevId] = useState(activeFile?.id);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  if (activeFile?.id !== prevId) {
    setPrevId(activeFile?.id);
    setScale(1);
    setTx(0);
    setTy(0);
    setIsDragging(false);
  }

  const reset = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };

  const zoomBy = (delta: number) => {
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + delta)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
    setIsDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setTx(dragRef.current.tx + (e.clientX - dragRef.current.x));
    setTy(dragRef.current.ty + (e.clientY - dragRef.current.y));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    setIsDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <section
      className="flex-1 min-w-0 md:border-r-2 border-pink-100 bg-zinc-50 relative flex flex-col min-h-[220px] overflow-hidden"
      aria-label="Vista previa de la imagen"
    >
      <Badge className="absolute top-2 left-3 z-10 bg-white text-pink-500 border-2 border-pink-100 shadow-sm rounded-full px-2.5 py-0.5 text-[11px] gap-1 hover:bg-white">
        <Camera className="w-3 h-3" aria-hidden /> Evidencia A
      </Badge>

      {activeFile && (
        <div
          className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-white/90 border-2 border-pink-100 rounded-full p-0.5 shadow-sm"
          role="toolbar"
          aria-label="Zoom imagen"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => zoomBy(-SCALE_STEP)}
                disabled={scale <= MIN_SCALE}
                aria-label="Alejar"
                className="btn-bounce p-1.5 rounded-full text-zinc-600 hover:bg-pink-50 hover:text-pink-500 disabled:opacity-30"
              >
                <Minus className="w-4 h-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>Alejar</TooltipContent>
          </Tooltip>
          <span className="px-1 text-[11px] font-extrabold text-zinc-700 tabular-nums select-none">
            {Math.round(scale * 100)}%
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => zoomBy(SCALE_STEP)}
                disabled={scale >= MAX_SCALE}
                aria-label="Acercar"
                className="btn-bounce p-1.5 rounded-full text-zinc-600 hover:bg-pink-50 hover:text-pink-500 disabled:opacity-30"
              >
                <Plus className="w-4 h-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>Acercar</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={reset}
                aria-label="Restablecer zoom"
                className="btn-bounce p-1.5 rounded-full text-zinc-600 hover:bg-pink-50 hover:text-pink-500"
              >
                <RotateCcw className="w-4 h-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>Restablecer</TooltipContent>
          </Tooltip>
        </div>
      )}

      <div
        className="flex-1 min-h-0 overflow-hidden p-3 flex items-center justify-center select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {activeFile ? (
          <img
            src={activeFile.previewUrl}
            alt={`Preview de ${activeFile.file.name}`}
            draggable={false}
            className="max-w-full max-h-full object-contain drop-shadow-md rounded-xl will-change-transform"
            style={{
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 60ms linear',
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 text-center gap-3">
            <ImageIcon className="w-16 h-16 text-pink-200" aria-hidden />
            <span className="font-bold text-pink-400 px-4">
              En fin, la hipotenusa. Elegí algo.
            </span>
          </div>
        )}
      </div>

    </section>
  );
}
