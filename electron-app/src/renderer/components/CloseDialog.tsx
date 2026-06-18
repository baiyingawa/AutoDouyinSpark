import React from 'react';
import { X, Minus, LogOut } from 'lucide-react';

interface CloseDialogProps {
  onChoice: (action: 'tray' | 'quit' | 'cancel') => void;
}

const CloseDialog: React.FC<CloseDialogProps> = ({ onChoice }) => {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
    >
      <div
        className="p-6 rounded-xl border border-gray-700/50 w-80 shadow-2xl"
        style={{ backgroundColor: '#1a1a2e' }}
      >
        <h3 className="text-white font-semibold text-base mb-2">
          关闭 AutoDouyinSpark
        </h3>
        <p className="text-gray-400 text-xs mb-5 leading-relaxed">
          退出程序不会影响自动续火花任务
          <br />
          （每小时自动执行）
        </p>
        <div className="space-y-2">
          <button
            className="w-full px-4 py-2.5 rounded-lg text-white text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: 'var(--accent)' }}
            onClick={() => onChoice('tray')}
          >
            <Minus size={16} />
            最小化到托盘
          </button>
          <button
            className="w-full px-4 py-2.5 rounded-lg text-gray-300 text-sm font-medium flex items-center justify-center gap-2 border border-gray-600 hover:bg-gray-800/50 transition-colors"
            onClick={() => onChoice('quit')}
          >
            <LogOut size={16} />
            退出程序
          </button>
          <button
            className="w-full px-4 py-2.5 rounded-lg text-gray-400 text-sm hover:bg-gray-800/30 transition-colors"
            onClick={() => onChoice('cancel')}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};

export default CloseDialog;
