
import { useOcrStore } from './store/useOcrStore';
import { OcrDropzone } from './features/ocr/components/OcrDropzone';
import { OcrWorkspace } from './features/ocr/components/OcrWorkspace';
import { Toaster } from 'sonner';

export default function App() {
  const files = useOcrStore((state) => state.files);
  const hasFiles = files.length > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col pt-8">
      <Toaster richColors position="top-center" />
      
      <div className="w-full text-center space-y-2 mb-8">
         <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
           <span className="text-primary">OCR</span> Web <span className="text-secondary">✦</span>
         </h1>
         <p className="text-muted-foreground text-lg font-medium">EstacionAR Clean Architecture powered by Gemini Vision</p>
      </div>

      <main className="flex-1 w-full px-6 flex flex-col">
        {hasFiles ? (
          <OcrWorkspace />
        ) : (
          <OcrDropzone />
        )}
      </main>
    </div>
  );
}