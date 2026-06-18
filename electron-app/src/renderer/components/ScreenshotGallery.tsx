import React, { useState, useEffect } from 'react';
import { Image, ChevronDown } from 'lucide-react';
import ScreenshotModal from './ScreenshotModal';

interface ScreenshotFile {
  name: string;
  size: number;
  mtime: string;
}

interface ScreenshotGalleryProps {
  screenshots: ScreenshotFile[];
}

const BATCH_SIZE = 20;

const ScreenshotGallery: React.FC<ScreenshotGalleryProps> = ({ screenshots }) => {
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  // 组件挂载时自动加载第一批缩略图预览
  useEffect(() => {
    const preload = async () => {
      const toLoad = screenshots.slice(0, BATCH_SIZE);
      const cache: Record<string, string> = {};
      for (const s of toLoad) {
        try {
          const result = await window.electronAPI.historyScreenshotData(s.name);
          if (result.success && result.data) {
            cache[s.name] = `data:image/png;base64,${result.data}`;
          }
        } catch {}
      }
      setImageCache(cache);
      setVisibleCount(BATCH_SIZE);
    };
    preload();
  }, [screenshots]);

  // 展开更多
  const handleLoadMore = async () => {
    setLoadingMore(true);
    const nextBatch = screenshots.slice(visibleCount, visibleCount + BATCH_SIZE);
    const newCache: Record<string, string> = {};
    for (const s of nextBatch) {
      try {
        if (!imageCache[s.name]) {
          const result = await window.electronAPI.historyScreenshotData(s.name);
          if (result.success && result.data) {
            newCache[s.name] = `data:image/png;base64,${result.data}`;
          }
        }
      } catch {}
    }
    setImageCache((prev) => ({ ...prev, ...newCache }));
    setVisibleCount((prev) => prev + BATCH_SIZE);
    setLoadingMore(false);
  };

  const visibleScreenshots = screenshots.slice(0, visibleCount);
  const hasMore = visibleCount < screenshots.length;

  const handleClick = async (filename: string) => {
    try {
      if (!imageCache[filename]) {
        const result = await window.electronAPI.historyScreenshotData(filename);
        if (result.success && result.data) {
          setImageCache((prev) => ({ ...prev, [filename]: `data:image/png;base64,${result.data}` }));
        }
      }
      setSelectedScreenshot(filename);
    } catch {
      // 忽略错误
    }
  };

  if (screenshots.length === 0) {
    return (
      <div className="text-center py-8">
        <Image size={32} className="mx-auto mb-2 text-gray-600" />
        <p className="text-gray-500 text-sm">暂无截图</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {visibleScreenshots.map((s) => (
          <button
            key={s.name}
            className="aspect-video rounded-lg overflow-hidden border border-gray-700/50 hover:border-gray-500 transition-colors relative group"
            onClick={() => handleClick(s.name)}
          >
            {imageCache[s.name] ? (
              <img
                src={imageCache[s.name]}
                alt={s.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a2e' }}>
                <Image size={20} className="text-gray-600" />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="text-white text-xs truncate">{s.name}</p>
            </div>
          </button>
        ))}
      </div>

      {/* 展开更多按钮 */}
      {hasMore && (
        <div className="text-center mt-4">
          <button
            className="px-6 py-2 rounded-lg text-gray-300 font-medium border border-gray-700 transition-all hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            <ChevronDown size={18} className={loadingMore ? 'animate-pulse' : ''} />
            <span>{loadingMore ? '加载中...' : `展开更多（${screenshots.length - visibleCount} 张）`}</span>
          </button>
        </div>
      )}

      {selectedScreenshot && (
        <ScreenshotModal
          filename={selectedScreenshot}
          imageUrl={imageCache[selectedScreenshot] || null}
          onClose={() => setSelectedScreenshot(null)}
          onLoad={async (fn) => {
            if (!imageCache[fn]) {
              const result = await window.electronAPI.historyScreenshotData(fn);
              if (result.success && result.data) {
                const url = `data:image/png;base64,${result.data}`;
                setImageCache((prev) => ({ ...prev, [fn]: url }));
                return url;
              }
            }
            return imageCache[fn] || null;
          }}
        />
      )}
    </>
  );
};

export default ScreenshotGallery;
