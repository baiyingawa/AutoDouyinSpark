import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} className="text-green-400" />,
  error: <XCircle size={18} className="text-red-400" />,
  info: <AlertCircle size={18} className="text-blue-400" />,
};

const bgColors: Record<ToastType, string> = {
  success: 'bg-green-900/40 border-green-800/50',
  error: 'bg-red-900/40 border-red-800/50',
  info: 'bg-blue-900/40 border-blue-800/50',
};

const Toast: React.FC<ToastProps> = ({ message, type = 'info', duration = 3000, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg transition-all duration-300 ${
        bgColors[type]
      } ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}
    >
      {icons[type]}
      <span className="text-sm text-gray-200">{message}</span>
      <button
        className="ml-2 text-gray-500 hover:text-gray-300 transition-colors"
        onClick={() => { setVisible(false); setTimeout(onClose, 300); }}
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default Toast;
