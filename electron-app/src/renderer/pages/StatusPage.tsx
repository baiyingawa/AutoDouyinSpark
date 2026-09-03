import React, { useCallback, useEffect, useState } from 'react';
import { Activity, CalendarClock, RefreshCw } from 'lucide-react';

interface StatusData {
  success: boolean;
  running: boolean;
  currentWindow: string | null;
  lastCheck: string | null;
  nextAction: string | null;
  task: {
    exists: boolean;
    state: string | null;
    enabled: boolean;
    nextRunTime: string | null;
    lastRunTime: string | null;
    lastResult: string | null;
  };
}

const format = (value: string | null) => value || '暂无';

const StatusPage: React.FC = () => {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await window.electronAPI.sparkSchedulerStatus();
      setData(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const task = data?.task;
  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={24} style={{ color: 'var(--accent)' }} />
          <h1 className="text-2xl font-bold text-white">运行状态</h1>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white" title="刷新">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <section className="p-6 rounded-lg border border-gray-700/50" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex items-center gap-2 mb-5">
            <Activity size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="text-lg font-semibold text-white">应用调度器</h2>
          </div>
          <div className="space-y-4 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">进程状态</span><span className={data?.running ? 'text-green-400' : 'text-gray-500'}>{data?.running ? '运行中' : '已停止'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">当前时间窗口</span><span className="text-white">{format(data?.currentWindow || null)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">上次检查</span><span className="text-white">{format(data?.lastCheck || null)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">下一步</span><span className="text-white">{format(data?.nextAction || null)}</span></div>
          </div>
        </section>

        <section className="p-6 rounded-lg border border-gray-700/50" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex items-center gap-2 mb-5">
            <CalendarClock size={18} style={{ color: '#60a5fa' }} />
            <h2 className="text-lg font-semibold text-white">Windows 计划程序</h2>
          </div>
          <div className="space-y-4 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">任务</span><span className={task?.exists ? 'text-green-400' : 'text-red-400'}>{task?.exists ? '已注册' : '未注册'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">启用状态</span><span className={task?.enabled ? 'text-green-400' : 'text-yellow-400'}>{task?.enabled ? '已启用' : '已停用'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">计划状态</span><span className="text-white">{format(task?.state || null)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">下次运行</span><span className="text-white">{format(task?.nextRunTime || null)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">上次结果</span><span className="text-white">{format(task?.lastResult || null)}</span></div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default StatusPage;
