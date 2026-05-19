import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  isChunkError: boolean;
}

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Loading chunk \d+ failed/i,
  /Importing a module script failed/i,
  /ChunkLoadError/i,
];

function isChunkLoadError(error: Error): boolean {
  const msg = error.message || '';
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(msg));
}

const RELOAD_FLAG = 'ocr-chunk-reload-ts';
const RELOAD_COOLDOWN_MS = 10_000;

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, isChunkError: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary]', error, info);

    if (isChunkLoadError(error)) {
      const last = Number(sessionStorage.getItem(RELOAD_FLAG) || '0');
      const now = Date.now();
      if (now - last > RELOAD_COOLDOWN_MS) {
        sessionStorage.setItem(RELOAD_FLAG, String(now));
        window.location.reload();
      }
    }
  }

  private reset = () => {
    if (this.state.isChunkError) {
      window.location.reload();
      return;
    }
    this.setState({ error: null, isChunkError: false });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const { isChunkError, error } = this.state;
    const title = isChunkError ? 'Hay una versión nueva' : 'Ups, algo se rompió';
    const message = isChunkError
      ? 'Estamos actualizando la app. Recargá para usar la última versión.'
      : error.message || 'Error inesperado';
    const buttonText = isChunkError ? 'Recargar' : 'Reintentar';

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 bg-background">
        <div className="paper-card max-w-md w-full p-6 text-center">
          <h2 className="text-xl font-extrabold text-rose-500 mb-2">{title}</h2>
          <p className="text-sm text-zinc-500 font-bold mb-4 break-words">{message}</p>
          <button
            onClick={this.reset}
            className="bg-pink-400 hover:bg-pink-500 text-white font-extrabold px-6 py-2.5 rounded-full btn-bounce focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-offset-2"
          >
            {buttonText}
          </button>
        </div>
      </div>
    );
  }
}
