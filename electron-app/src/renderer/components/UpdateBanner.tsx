import React, { useState, useEffect, useCallback } from 'react';
import { Download, X, ExternalLink, Loader2 } from 'lucide-react';

interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  downloadUrl: string | null;
  releaseNotes: string | null;
  releaseUrl: string | null;
}

const UpdateBanner: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  // 启动时检查更新
  useEffect(() => {
    const check = async () => {
      try {
        const info = await window.electronAPI.updateCheck();
        setUpdateInfo(info);
      } catch {
        // 静默忽略
      }
    };
    // 延迟 5 秒检查，避免启动时网络请求阻塞
    const timer = setTimeout(check, 5000);
    return () => clearTimeout(timer);
  }, []);

  // 监听下载进度（通过 IPC 推送）
  useEffect(() => {
    const handler = (_event: any, data: { progress: number; status: string; error?: string }) => {
      setProgress(data.progress);
      if (data.status === 'downloading') {
        setDownloading(true);
      } else if (data.status === 'done') {
        setDownloading(false);
      } else if (data.status === 'error') {
        setDownloading(false);
      }
    };
    window.addEventListener('update:download-progress', handler as any);
    return () => window.removeEventListener('update:download-progress', handler as any);
  }, []);

  const handleUpdate = useCallback(async () => {
    if (!updateInfo?.downloadUrl) return;
    setDownloading(true);
    setProgress(0);
    try {
      await window.electronAPI.updateDownload(updateInfo.downloadUrl);
    } catch {
      setDownloading(false);
    }
  }, [updateInfo]);

  if (!updateInfo?.hasUpdate || dismissed) return null;

  return (
    <div
      className="p-4 rounded-lg border border-blue-700/50 flex items-start gap-3"
      style={{ backgroundColor: 'rgba(37, 99, 235, 0.1)' }}
    >
      <Download size={20} className="text-blue-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-blue-300 font-medium">
          新版本 v{updateInfo.latestVersion} 可用
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          当前版本 v{updateInfo.currentVersion}
        </p>
        {updateInfo.releaseNotes && (
          <p className="text-xs text-gray-400 mt-1 line-clamp-2">
            {updateInfo.releaseNotes}
          </p>
        )}

        {downloading ? (
          <div className="mt-2 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin text-blue-400" />
            <span className="text-xs text-blue-400">
              下载中... {progress}%
            </span>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <button
              className="px-3 py-1 text-xs rounded text-white font-medium hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#2563eb' }}
              onClick={handleUpdate}
              disabled={!updateInfo.downloadUrl}
            >
              立即更新
            </button>
            {updateInfo.releaseUrl && (
              <a
                href={updateInfo.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1"
              >
                <ExternalLink size={10} />
                查看详情
              </a>
            )}
          </div>
        )}
      </div>
      <button
        className="p-1 rounded hover:bg-gray-700/30 text-gray-400 hover:text-white transition-colors shrink-0"
        onClick={() => setDismissed(true)}
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default UpdateBanner;
