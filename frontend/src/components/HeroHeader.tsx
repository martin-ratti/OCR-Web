import { Stethoscope, Sparkles } from 'lucide-react';

export function HeroHeader() {
  return (
    <header className="w-full text-center relative z-20 pt-12 pb-8 space-y-3">
      <div className="inline-flex items-center justify-center px-4 py-1.5 mb-1 rounded-full bg-pink-100 text-pink-600 text-sm font-bold shadow-sm ring-2 ring-pink-200/50">
        <Stethoscope className="w-4 h-4 mr-2" aria-hidden />
        Es un hermoso día para salvar finales
      </div>
      <h1 className="font-extrabold tracking-tight text-foreground flex items-center justify-center gap-2 text-4xl md:text-5xl pb-2">
        Sirviendo Apuntes
        <Sparkles className="text-primary animate-pulse w-8 h-8" aria-hidden />
      </h1>
      <p className="text-muted-foreground text-sm md:text-base max-w-xl mx-auto px-4 font-bold flex items-center justify-center gap-1 flex-wrap">
        ¡Sube las fotos de tus libros y yo extraigo el texto! Esta data está literal para decir:
        QUEDAAA <Sparkles className="w-5 h-5 text-primary animate-pulse inline-block" aria-hidden />
      </p>
    </header>
  );
}
