import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

const LogPanel: React.FC = () => {
  const [collapsed, setCollapsed] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoExpanded = useRef(false);

  const fetchLogs = useCallback(async () => {
    try {
      const result = await window.electronAPI.logGet(100);
      if (result.success && result.data) {
        setLogs(result.data);
      }
    } catch {
      // 静默忽略
    }
  }, []);

  // 组件挂载时获取最近日志
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // 监听前端触发续火花的自动展开/收起
  useEffect(() => {
    const handleExpand = () => {
      autoExpanded.current = true;
      setCollapsed(false);
    };
    const handleCollapse = () => {
      if (autoExpanded.current) {
        setCollapsed(true);
        autoExpanded.current = false;
      }
    };
    window.addEventListener('log-panel:auto-expand', handleExpand);
    window.addEventListener('log-panel:auto-collapse', handleCollapse);
    return () => {
      window.removeEventListener('log-panel:auto-expand', handleExpand);
      window.removeEventListener('log-panel:auto-collapse', handleCollapse);
    };
  }, []);

  // 每 5 秒轮询最新日志（实时日志流）
  useEffect(() => {
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  // 展开或日志更新时自动滚动到最底部（最新日志）
  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [collapsed, logs]);

  // 清空日志
  const handleClear = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await window.electronAPI.logClear();
      setLogs([]);
    } catch {
      // 静默忽略
    }
  }, []);

  const getLevelColor = (level: string): string => {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return '#e94560';
      case 'WARN':
        return '#eab308';
      case 'INFO':
        return '#22c55e';
      default:
        return '#9ca3af';
    }
  };

  return (
    <div
      className="border-t border-gray-700/50"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      {/* 标题栏 */}
      <div
        className="flex items-center justify-between px-4 py-1 cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <Terminal size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-xs text-gray-400">日志面板</span>
          {logs.length > 0 && (
            <span className="text-xs text-gray-500">({logs.length})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="p-1 hover:bg-gray-700/30 rounded"
            title="清空日志"
          >
            <Trash2 size={12} className="text-gray-500" />
          </button>
          {collapsed ? (
            <ChevronUp size={14} className="text-gray-500" />
          ) : (
            <ChevronDown size={14} className="text-gray-500" />
          )}
        </div>
      </div>

      {/* 日志内容 */}
      {!collapsed && (
        <div
          ref={scrollRef}
          className="h-32 overflow-auto px-4 pb-2 font-mono text-xs"
        >
          {logs.length === 0 ? (
            <p className="text-gray-600 py-2">暂无日志</p>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="py-0.5">
                <span className="text-gray-500">{log.timestamp}</span>{' '}
                <span style={{ color: getLevelColor(log.level) }}>
                  [{log.level}]
                </span>{' '}
                <span className="text-gray-300">{log.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default LogPanel;
