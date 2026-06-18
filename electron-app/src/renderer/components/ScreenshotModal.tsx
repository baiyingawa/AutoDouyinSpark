import React, { useEffect, useState } from 'react';
import { X, Loader, Image } from 'lucide-react';

interface ScreenshotModalProps {
  filename: string;
  imageUrl: string | null;
  onClose: () => void;
  onLoad: (filename: string) => Promise<string | null>;
}

const ScreenshotModal: React.FC<ScreenshotModalProps> = ({ filename, imageUrl, onClose, onLoad }) => {
  const [loading, setLoading] = useState(!imageUrl);
  const [url, setUrl] = useState<string | null>(imageUrl);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setLoading(true);
      setError(null);
      onLoad(filename).then((result) => {
        if (result) {
          setUrl(result);
        } else {
          setError('加载失败');
        }
        setLoading(false);
      });
    }
  }, [filename, imageUrl, onLoad]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[90vh] mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部栏 */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/60 to-transparent">
          <span className="text-white text-sm truncate">{filename}</span>
          <button
            className="p-1 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* 图片 */}
        {loading ? (
          <div className="w-96 h-64 flex items-center justify-center" style={{ backgroundColor: '#1a1a2e' }}>
            <Loader size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : error ? (
          <div className="w-96 h-64 flex flex-col items-center justify-center" style={{ backgroundColor: '#1a1a2e' }}>
            <Image size={32} className="mb-2 text-gray-600" />
            <p className="text-gray-500 text-sm">{error}</p>
          </div>
        ) : url ? (
          <img
            src={url}
            alt={filename}
            className="max-w-full max-h-[85vh] rounded-lg object-contain"
          />
        ) : null}
      </div>
    </div>
  );
};

export default ScreenshotModal;
