import { Sparkles, X } from 'lucide-react';
import { PandaIcon, MonkeyIcon } from './MascotIcons';

interface KawaiiModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'info';
  mascotType?: 'panda' | 'monkey';
}

export function KawaiiModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Sipi',
  cancelText = 'Nopi',
  variant = 'info',
  mascotType = 'panda'
}: KawaiiModalProps) {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const isDanger = variant === 'danger';

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div 
        className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl border-4 border-pink-100 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 ease-out-back will-change-transform"
      >
        {/* Header con botoncito de cerrar */}
        <div className="flex justify-end p-4 pb-0">
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-pink-50 text-pink-300 hover:text-pink-500 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Contenido */}
        <div className="px-8 pb-8 flex flex-col items-center text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 animate-bounce relative ${isDanger ? 'bg-rose-100' : 'bg-pink-100'}`}>
            {mascotType === 'panda' ? (
              <PandaIcon className={`w-14 h-14`} />
            ) : (
              <MonkeyIcon className={`w-14 h-14`} />
            )}
            <Sparkles className={`w-6 h-6 absolute -top-1 -right-1 ${isDanger ? 'text-rose-400' : 'text-pink-400'} animate-pulse`} />
          </div>
          
          <h3 className={`text-2xl font-black mb-3 ${isDanger ? 'text-rose-600' : 'text-pink-600'}`}>
            {title}
          </h3>
          
          <p className="text-zinc-500 font-bold px-4 leading-relaxed">
            {description}
          </p>

          {/* Botones */}
          <div className="flex flex-col w-full gap-3 mt-8">
            <button
              onClick={onConfirm}
              className={`w-full py-4 rounded-3xl font-black text-lg shadow-lg btn-bounce transition-all ${
                isDanger 
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-200' 
                  : 'bg-pink-400 hover:bg-pink-500 text-white shadow-pink-200'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                {confirmText}
                <Sparkles className="w-4 h-4 text-pink-100" />
              </div>
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-3xl font-extrabold text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 transition-all"
            >
              {cancelText}
            </button>
          </div>
        </div>

        {/* Adornito de abajo */}
        <div className={`h-3 w-full ${isDanger ? 'bg-rose-100' : 'bg-pink-100'}`} />
      </div>
    </div>
  );
}
