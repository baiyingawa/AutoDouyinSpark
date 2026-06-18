import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Sparkles } from 'lucide-react';
import CloseDialog from './CloseDialog';

const TitleBar: React.FC = () => {
  const [maximized, setMaximized] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  useEffect(() => {
    window.electronAPI.windowIsMaximized().then((r) => setMaximized(r.maximized));
    const handler = (_event: any, data: { maximized: boolean }) => setMaximized(data.maximized);
    window.addEventListener('window:state-changed', handler as any);
    return () => window.removeEventListener('window:state-changed', handler as any);
  }, []);

  const handleMinimize = () => window.electronAPI.windowMinimize();
  const handleMaximize = () => window.electronAPI.windowMaximize().then((r) => setMaximized(r.maximized));
  const handleClose = () => setShowCloseDialog(true);

  const handleCloseChoice = async (action: 'tray' | 'quit' | 'cancel') => {
    setShowCloseDialog(false);
    if (action === 'tray') {
      await window.electronAPI.windowMinimize();
    } else if (action === 'quit') {
      await window.electronAPI.appQuit();
    }
  };

  return (
    <>
      <div
        className="flex items-center justify-between w-full h-9 flex-shrink-0 select-none"
        style={{
          backgroundColor: '#0f0f23',
          borderBottom: '1px solid rgba(55, 65, 81, 0.5)',
          WebkitAppRegion: 'drag',
        } as any}
      >
        {/* 左侧标题 */}
        <div className="flex items-center gap-2 pl-3">
          <Sparkles size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-xs text-gray-400 font-medium">AutoDouyinSpark</span>
        </div>

        {/* 右侧窗口控制按钮（禁止拖拽） */}
        <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            className="w-11 h-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
            onClick={handleMinimize}
            title="最小化"
          >
            <Minus size={14} />
          </button>
          <button
            className="w-11 h-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
            onClick={handleMaximize}
            title={maximized ? '还原' : '最大化'}
          >
            {maximized ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
                <rect x="2" y="4" width="8" height="8" rx="1" />
                <path d="M4 4V2h8v8h-2" />
              </svg>
            ) : (
              <Square size={12} />
            )}
          </button>
          <button
            className="w-11 h-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-600 transition-colors"
            onClick={handleClose}
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {showCloseDialog && (
        <CloseDialog onChoice={handleCloseChoice} />
      )}
    </>
  );
};

export default TitleBar;
