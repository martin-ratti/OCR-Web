import { useEffect } from 'react';
import { ocrSelectors, useOcrStore } from './store/useOcrStore';
import { OcrDropzone } from './features/ocr/components/OcrDropzone';
import { OcrWorkspace } from './features/ocr/components/OcrWorkspace';
import { Toaster } from 'sonner';
import { Stethoscope, Sparkles, Heart } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function App() {
  const files = useOcrStore(ocrSelectors.files);
  const revokeAllPreviews = useOcrStore((s) => s.revokeAllPreviews);
  const hasFiles = files.length > 0;

  useEffect(() => {
    const onUnload = () => revokeAllPreviews();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      revokeAllPreviews();
    };
  }, [revokeAllPreviews]);

  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={120}>
      <div className="min-h-screen bg-background text-foreground flex flex-col relative font-sans bg-dot-pattern">
        <Toaster
          richColors
          position="top-center"
          toastOptions={{ className: 'paper-card font-bold' }}
        />

        <header className="w-full text-center space-y-3 pt-12 pb-8 relative z-20">
          <div className="inline-flex items-center justify-center px-4 py-1.5 mb-1 rounded-full bg-pink-100 text-pink-600 text-sm font-bold shadow-sm ring-2 ring-pink-200/50">
            <Stethoscope className="w-4 h-4 mr-2" aria-hidden />
            Es un hermoso día para salvar finales
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground pb-2 flex items-center justify-center gap-2">
            Sirviendo Apuntes <Sparkles className="w-8 h-8 text-primary animate-pulse" aria-hidden />
          </h1>
          <p className="text-muted-foreground text-sm md:text-base max-w-xl mx-auto px-4 font-bold flex items-center justify-center gap-1 flex-wrap">
            ¡Sube las fotos de tus libros y yo extraigo el texto! Esta data está literal para decir:
            QUEDAAA <Sparkles className="w-5 h-5 text-primary animate-pulse inline-block" aria-hidden />
          </p>
        </header>

        <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 md:px-6 pb-12 flex flex-col relative">
          <div className="relative z-10 w-full flex flex-col flex-1 h-full shadow-2xl rounded-3xl">
            {hasFiles ? <OcrWorkspace /> : <OcrDropzone />}
          </div>
        </main>

        <footer className="w-full text-center py-4 text-xs font-bold text-pink-300 flex items-center justify-center gap-1">
          May we meet again <Heart className="w-3 h-3 fill-current" aria-hidden /> | OCR web app
        </footer>
      </div>
    </TooltipProvider>
  );
}
