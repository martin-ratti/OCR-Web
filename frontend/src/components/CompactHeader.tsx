import { Sparkles } from 'lucide-react';

export function CompactHeader() {
  return (
    <header className="w-full text-center relative z-20 pt-3 pb-2 space-y-0">
      <h1 className="font-extrabold tracking-tight text-foreground flex items-center justify-center gap-2 text-xl md:text-2xl">
        Sirviendo Apuntes
        <Sparkles className="text-primary animate-pulse w-5 h-5" aria-hidden />
      </h1>
    </header>
  );
}
