import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  danger = false,
}) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="p-6 rounded-xl border border-gray-700/50 shadow-xl max-w-sm w-full mx-4"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div
            className={`p-2 rounded-full ${
              danger ? 'bg-red-900/30' : 'bg-gray-800'
            }`}
          >
            <AlertTriangle
              size={24}
              className={danger ? 'text-red-400' : 'text-yellow-400'}
            />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
            <p className="text-sm text-gray-400">{message}</p>
          </div>
          <button
            className="text-gray-500 hover:text-gray-300 transition-colors"
            onClick={onCancel}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            className="px-4 py-2 rounded-lg text-sm text-gray-300 border border-gray-700 hover:bg-gray-700 transition-colors"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            className={`px-4 py-2 rounded-lg text-sm text-white font-medium transition-colors ${
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'hover:opacity-90'
            }`}
            style={danger ? undefined : { backgroundColor: 'var(--accent)' }}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
