import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function subscribe() {
  return () => {};
}

export function ThemeToggle() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const { setTheme, resolvedTheme } = useTheme();

  if (!mounted) {
    return (
      <div className="w-8 h-8 rounded-full border border-pink-200 dark:border-pink-900 opacity-40" aria-hidden />
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="btn-bounce inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-pink-200 dark:border-pink-800/60 bg-white/90 dark:bg-zinc-900/90 text-pink-500 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/40 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400 transition-transform" aria-hidden />
          ) : (
            <Moon className="w-4 h-4 text-pink-500 transition-transform" aria-hidden />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {isDark ? 'Modo claro' : 'Modo oscuro'}
      </TooltipContent>
    </Tooltip>
  );
}
