import React, { useEffect, useState } from 'react';
import { Power, X } from 'lucide-react';

interface AutoStartPromptProps {
  onClose: () => void;
}

const AutoStartPrompt: React.FC<AutoStartPromptProps> = ({ onClose }) => {
  const [visible, setVisible] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDecline();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleAccept = async () => {
    setProcessing(true);
    try {
      await window.electronAPI.settingsPromptAutoStart(true);
    } catch {
      // 忽略
    }
    setVisible(false);
    onClose();
  };

  const handleDecline = async () => {
    setProcessing(true);
    try {
      await window.electronAPI.settingsPromptAutoStart(false);
    } catch {
      // 忽略
    }
    setVisible(false);
    onClose();
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
    >
      <div
        className="p-6 rounded-xl border border-gray-700/50 shadow-xl max-w-md w-full mx-4"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-start gap-4">
          <div
            className="p-2.5 rounded-full shrink-0"
            style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)' }}
          >
            <Power size={24} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-white mb-1">
              开启开机自启
            </h3>
            <p className="text-sm leading-relaxed text-gray-400">
              为了自动续火花功能正常运作，AutoDouyinSpark 需要在您登录电脑时自动启动。
            </p>
            <div
              className="mt-4 p-3 rounded-lg text-sm leading-relaxed"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)' }}
            >
              <p className="text-gray-300 font-medium mb-1">开启后：</p>
              <ul className="text-gray-400 space-y-1 pl-4 list-disc">
                <li>每次登录电脑时应用在后台自动运行</li>
                <li>确保续火花任务按时执行，无需手动启动</li>
                <li>您随时可以在「设置」页面中关闭此功能</li>
              </ul>
            </div>
          </div>
          <button
            className="text-gray-500 hover:text-gray-300 transition-colors shrink-0"
            onClick={handleDecline}
            disabled={processing}
          >
            <X size={18} />
          </button>
        </div>

        {/* 按钮 */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            className="px-4 py-2 rounded-lg text-sm text-gray-300 border border-gray-700 hover:bg-gray-700 transition-colors disabled:opacity-50"
            onClick={handleDecline}
            disabled={processing}
          >
            暂不设置
          </button>
          <button
            className="px-5 py-2 rounded-lg text-sm text-white font-medium transition-all hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            style={{ backgroundColor: 'var(--accent)' }}
            onClick={handleAccept}
            disabled={processing}
          >
            {processing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                处理中...
              </>
            ) : (
              <>
                <Power size={16} />
                同意开启
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AutoStartPrompt;
