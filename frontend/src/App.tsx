import { lazy, Suspense, useEffect } from 'react';
import { ocrSelectors, useOcrStore } from './store/useOcrStore';
import { OcrDropzone } from './features/ocr/components/OcrDropzone';
import { Toaster } from 'sonner';
import { Heart } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { HeroHeader } from './components/HeroHeader';
import { CompactHeader } from './components/CompactHeader';

async function importWithRetry<T>(
  loader: () => Promise<T>,
  retries = 2,
  delayMs = 600,
): Promise<T> {
  try {
    return await loader();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise((r) => setTimeout(r, delayMs));
    return importWithRetry(loader, retries - 1, delayMs * 2);
  }
}

const OcrWorkspace = lazy(() =>
  importWithRetry(() => import('./features/ocr/components/OcrWorkspace')).then((m) => ({
    default: m.OcrWorkspace,
  })),
);

function WorkspaceFallback() {
  return (
    <div
      className="flex-1 w-full flex items-center justify-center text-pink-400 font-bold text-sm"
      role="status"
      aria-live="polite"
    >
      Cargando workspace...
    </div>
  );
}

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

        {hasFiles ? <CompactHeader /> : <HeroHeader />}

        <main
          className={`flex-1 w-full mx-auto px-4 md:px-6 flex flex-col relative ${
            hasFiles ? 'max-w-[1400px] pb-3' : 'max-w-[1200px] pb-12'
          }`}
        >
          <div className="relative z-10 w-full flex flex-col flex-1 h-full shadow-2xl rounded-3xl">
            {hasFiles ? (
              <Suspense fallback={<WorkspaceFallback />}>
                <OcrWorkspace />
              </Suspense>
            ) : (
              <OcrDropzone />
            )}
          </div>
        </main>

        <footer
          className={`w-full text-center text-xs font-bold text-pink-300 flex items-center justify-center gap-1 ${
            hasFiles ? 'py-1.5' : 'py-4'
          }`}
        >
          May we meet again <Heart className="w-3 h-3 fill-current" aria-hidden /> | OCR web app
        </footer>
      </div>
    </TooltipProvider>
  );
}
