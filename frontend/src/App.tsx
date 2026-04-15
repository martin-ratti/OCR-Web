import React, { useCallback, useRef, useState } from 'react';
import { useOcrStore } from './store/ocrStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Toaster, toast } from 'sonner';
import { UploadCloud, FileText, Copy, Loader2, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function App() {
  const { processImage, isProcessing, extractedText, error } = useOcrStore();
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, sube un archivo de imagen válido.');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    processImage(file).catch(() => toast.error('Error al procesar la imagen'));
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(extractedText);
    toast.success('¡Texto copiado al portapapeles!');
  };

  return (
    <div className="min-h-screen bg-green-50/30 flex items-center justify-center p-6">
      <Toaster richColors position="top-center" />
      
      <div className="max-w-4xl w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
            <span className="text-primary">OCR</span> Web <span className="text-secondary">✦</span>
          </h1>
          <p className="text-slate-500 text-lg">Inteligencia Artificial para extraer únicamente lo que importa.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Zona de Carga */}
          <Card className="shadow-lg border-green-100 h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-secondary" /> Cargar Documento
              </CardTitle>
              <CardDescription>Sube una foto de tu texto resaltado.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ease-in-out cursor-pointer",
                  dragActive ? "border-primary bg-green-50" : "border-slate-200 hover:bg-slate-50 hover:border-slate-300",
                  isProcessing && "opacity-50 pointer-events-none"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
              >
                <input 
                  ref={inputRef} type="file" accept="image/*" className="hidden" 
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} 
                />
                
                {previewUrl ? (
                  <div className="relative rounded-lg overflow-hidden h-48 w-full group">
                     <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                     <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-white font-medium flex items-center gap-2"><UploadCloud className="w-5 h-5"/> Cambiar Imagen</span>
                     </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <div className="p-4 bg-pink-50 rounded-full">
                      <UploadCloud className="w-8 h-8 text-secondary" />
                    </div>
                    <p className="text-slate-600 font-medium">Arrastra tu imagen aquí</p>
                    <p className="text-sm text-slate-400">o haz clic para buscar</p>
                  </div>
                )}
              </div>
            </CardContent>
            {isProcessing && (
              <CardFooter className="bg-slate-50 border-t justify-center py-4">
                <p className="flex items-center gap-2 text-primary font-medium">
                  <Loader2 className="w-5 h-5 animate-spin" /> Procesando con Gemini Vision...
                </p>
              </CardFooter>
            )}
            {error && (
              <CardFooter className="bg-red-50 border-t border-red-100 justify-center py-4">
                <p className="text-red-600 text-sm font-medium">{error}</p>
              </CardFooter>
            )}
          </Card>

          {/* Zona de Resultados */}
          <Card className="shadow-lg border-pink-100 flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" /> Resultado OCR
                </div>
                {extractedText && (
                  <Button variant="outline" size="sm" onClick={copyToClipboard} className="text-slate-600 hover:text-secondary border-slate-200">
                    <Copy className="w-4 h-4 mr-2" /> Copiar
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 relative min-h-[300px]">
              {extractedText ? (
                <div className="absolute inset-0 p-6 overflow-auto bg-slate-50 mx-6 mb-6 rounded-xl border border-slate-100 shadow-inner">
                  <pre className="whitespace-pre-wrap font-sans text-slate-700 leading-relaxed">
                    {extractedText}
                  </pre>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 p-6 text-center">
                  El texto extraído de tus zonas resaltadas aparecerá aquí.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}