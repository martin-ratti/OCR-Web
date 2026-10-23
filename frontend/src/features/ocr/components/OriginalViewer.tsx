import { useRef, useState } from 'react';
import { Camera, Eye, EyeOff, ImageIcon, Minus, Plus, RotateCcw, RotateCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { OcrFile } from '../../../store/useOcrStore';

interface OriginalViewerProps {
  activeFile: OcrFile | undefined;
  onRotate?: (id: string) => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const SCALE_STEP = 0.25;

export function OriginalViewer({ activeFile, onRotate }: OriginalViewerProps) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showBoxes, setShowBoxes] = useState(true);
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
    setScale((s) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number((s + delta).toFixed(2))));
      if (next <= 1) {
        setTx(0);
        setTy(0);
      }
      return next;
    });
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!activeFile) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    zoomBy(delta);
  };

  const onDoubleClick = () => {
    if (!activeFile) return;
    if (scale > 1.05) {
      reset();
    } else {
      setScale(2);
    }
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
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const hasBoxes = Boolean(activeFile?.boxes && activeFile.boxes.length > 0);
  const rotationDeg = activeFile?.rotationDeg ?? 0;

  return (
    <section
      className="flex-1 min-w-0 md:border-r-2 border-pink-100 dark:border-pink-950/60 bg-zinc-50 dark:bg-zinc-950/80 relative flex flex-col min-h-0 overflow-hidden"
      aria-label="Vista previa de la imagen"
    >
      <Badge className="absolute top-2 left-3 z-10 bg-white/95 dark:bg-zinc-900/95 text-pink-500 dark:text-pink-300 border-2 border-pink-100 dark:border-pink-900/60 shadow-sm rounded-full px-2.5 py-0.5 text-[11px] gap-1 hover:bg-white">
        <Camera className="w-3 h-3" aria-hidden /> Hoja original
      </Badge>

      {activeFile && (
        <div
          className="absolute top-2.5 right-3 z-10 flex items-center gap-0.5 bg-white/95 dark:bg-zinc-900/95 border-2 border-pink-100 dark:border-pink-900/60 rounded-full p-0.5 shadow-sm"
          role="toolbar"
          aria-label="Controles de imagen"
        >
          {hasBoxes && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowBoxes((v) => !v)}
                  aria-label={showBoxes ? 'Ocultar regiones detectadas' : 'Mostrar regiones detectadas'}
                  aria-pressed={showBoxes}
                  className={`btn-bounce p-1.5 rounded-full transition-colors ${
                    showBoxes
                      ? 'text-pink-600 bg-pink-100 dark:bg-pink-950 dark:text-pink-300'
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-pink-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  {showBoxes ? <Eye className="w-4 h-4" aria-hidden /> : <EyeOff className="w-4 h-4" aria-hidden />}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {showBoxes ? 'Ocultar bloques detectados' : 'Ver bloques detectados por OCR'}
              </TooltipContent>
            </Tooltip>
          )}

          {onRotate && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onRotate(activeFile.id)}
                  aria-label="Girar imagen 90 grados"
                  className="btn-bounce p-1.5 rounded-full text-zinc-600 dark:text-zinc-300 hover:bg-pink-50 dark:hover:bg-zinc-800 hover:text-pink-500"
                >
                  <RotateCw className="w-4 h-4" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>Girar vista 90°</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => zoomBy(-SCALE_STEP)}
                disabled={scale <= MIN_SCALE}
                aria-label="Alejar"
                className="btn-bounce p-1.5 rounded-full text-zinc-600 dark:text-zinc-300 hover:bg-pink-50 dark:hover:bg-zinc-800 hover:text-pink-500 disabled:opacity-30"
              >
                <Minus className="w-4 h-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>Alejar (rueda abajo)</TooltipContent>
          </Tooltip>

          <span className="px-1 text-[11px] font-extrabold text-zinc-700 dark:text-zinc-300 tabular-nums select-none">
            {Math.round(scale * 100)}%
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => zoomBy(SCALE_STEP)}
                disabled={scale >= MAX_SCALE}
                aria-label="Acercar"
                className="btn-bounce p-1.5 rounded-full text-zinc-600 dark:text-zinc-300 hover:bg-pink-50 dark:hover:bg-zinc-800 hover:text-pink-500 disabled:opacity-30"
              >
                <Plus className="w-4 h-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>Acercar (rueda arriba / doble clic)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={reset}
                aria-label="Restablecer zoom"
                className="btn-bounce p-1.5 rounded-full text-zinc-600 dark:text-zinc-300 hover:bg-pink-50 dark:hover:bg-zinc-800 hover:text-pink-500"
              >
                <RotateCcw className="w-4 h-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>Restablecer vista</TooltipContent>
          </Tooltip>
        </div>
      )}

      <div
        className="flex-1 min-h-0 overflow-hidden p-3 flex items-center justify-center select-none"
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in' }}
      >
        {activeFile ? (
          <div
            className="relative inline-flex items-center justify-center max-w-full max-h-full will-change-transform"
            style={{
              transform: `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rotationDeg}deg)`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 90ms ease-out',
            }}
          >
            <img
              src={activeFile.previewUrl}
              alt={`Vista previa de ${activeFile.file.name}`}
              draggable={false}
              className="max-w-full max-h-[calc(100vh-12rem)] object-contain drop-shadow-md rounded-xl"
            />
            {showBoxes && hasBoxes && (
              <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
                {activeFile.boxes!.map((b, idx) => (
                  <div
                    key={idx}
                    title={b.text}
                    style={{
                      left: `${b.xmin * 100}%`,
                      top: `${b.ymin * 100}%`,
                      width: `${Math.max(0.5, (b.xmax - b.xmin) * 100)}%`,
                      height: `${Math.max(0.5, (b.ymax - b.ymin) * 100)}%`,
                    }}
                    className={`absolute rounded-sm border transition-opacity ${
                      b.highlighted
                        ? 'bg-pink-400/25 border-pink-500/80'
                        : 'bg-indigo-400/10 border-indigo-400/40'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 text-center gap-3">
            <ImageIcon className="w-16 h-16 text-pink-200 dark:text-pink-900" aria-hidden />
            <span className="font-bold text-pink-400 px-4">
              En fin, la hipotenusa. Elegí una hoja de la cola.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
