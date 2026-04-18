import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary]', error, info);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 bg-background">
        <div className="paper-card max-w-md w-full p-6 text-center">
          <h2 className="text-xl font-extrabold text-rose-500 mb-2">Ups, algo se rompió</h2>
          <p className="text-sm text-zinc-500 font-bold mb-4 break-words">
            {this.state.error.message || 'Error inesperado'}
          </p>
          <button
            onClick={this.reset}
            className="bg-pink-400 hover:bg-pink-500 text-white font-extrabold px-6 py-2.5 rounded-full btn-bounce"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }
}
