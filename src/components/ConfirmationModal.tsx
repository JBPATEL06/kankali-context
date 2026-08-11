import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isDestructive = true,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-zinc-900 rounded-2xl border border-white/10 max-w-md w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-center gap-3 text-red-400">
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="font-serif italic text-base text-white">
            {title}
          </h3>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed font-mono">
          {message}
        </p>

        <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-mono text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-black transition-colors ${
              isDestructive
                ? 'bg-red-500 hover:bg-red-400'
                : 'bg-amber-500 hover:bg-amber-400'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
