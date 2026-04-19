import { Camera, ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { OcrFile } from '../../../store/useOcrStore';

interface OriginalViewerProps {
  activeFile: OcrFile | undefined;
}

export function OriginalViewer({ activeFile }: OriginalViewerProps) {
  return (
    <section
      className="flex-1 min-w-0 md:border-r-2 border-pink-100 bg-zinc-50 relative flex flex-col min-h-[280px] overflow-hidden"
      aria-label="Vista previa de la imagen"
    >
      <Badge className="absolute top-4 left-4 z-10 bg-white text-pink-500 border-2 border-pink-100 shadow-sm rounded-full px-3 py-1 gap-1 hover:bg-white">
        <Camera className="w-3 h-3" aria-hidden /> Evidencia A
      </Badge>
      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-5">
        {activeFile ? (
          <div className="w-full h-full p-2 flex items-center justify-center">
            <img
              src={activeFile.previewUrl}
              alt={`Preview de ${activeFile.file.name}`}
              className="max-w-full max-h-full object-contain drop-shadow-md rounded-xl"
            />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-300 text-center gap-3">
            <ImageIcon className="w-16 h-16 text-pink-100" aria-hidden />
            <span className="font-bold text-pink-200 px-4">
              En fin, la hipotenusa. Elegí algo.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
