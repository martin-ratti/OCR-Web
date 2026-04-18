import { Sparkles } from 'lucide-react';
import { PandaIcon, MonkeyIcon } from './MascotIcons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../components/ui/dialog';

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
  mascotType = 'panda',
}: KawaiiModalProps) {
  const isDanger = variant === 'danger';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl border-4 border-pink-100 overflow-hidden p-0 duration-300">
        <div className="px-8 pt-12 pb-8 flex flex-col items-center text-center">
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 animate-bounce relative ${
              isDanger ? 'bg-rose-100' : 'bg-pink-100'
            }`}
          >
            {mascotType === 'panda' ? (
              <PandaIcon className="w-14 h-14" />
            ) : (
              <MonkeyIcon className="w-14 h-14" />
            )}
            <Sparkles
              className={`w-6 h-6 absolute -top-1 -right-1 ${
                isDanger ? 'text-rose-400' : 'text-pink-400'
              } animate-pulse`}
            />
          </div>

          <DialogTitle
            className={`text-2xl font-black mb-3 ${isDanger ? 'text-rose-600' : 'text-pink-600'}`}
          >
            {title}
          </DialogTitle>

          <DialogDescription className="px-4 leading-relaxed">{description}</DialogDescription>

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

        <div className={`h-3 w-full ${isDanger ? 'bg-rose-100' : 'bg-pink-100'}`} />
      </DialogContent>
    </Dialog>
  );
}
