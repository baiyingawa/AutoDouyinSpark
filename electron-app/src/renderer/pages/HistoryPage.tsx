import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { History, ChevronDown, Send, CheckCircle2, Clock3 } from 'lucide-react';
import SparkDaysChart from '../components/SparkDaysChart';
import ScreenshotGallery from '../components/ScreenshotGallery';

interface SparkDayRecord {
  date: string;
  days: Record<string, number>;
  prev_days?: Record<string, number>;
}

interface ScreenshotFile {
  name: string;
  size: number;
  mtime: string;
}

interface SendRecord {
  timestamp: string;
  date: string;
  users: string[];
  force: boolean;
  success: boolean;
}

type TimeRange = '7d' | '15d' | '30d' | '1y';

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '7d', label: '近一周' },
  { value: '15d', label: '近15天' },
  { value: '30d', label: '近一月' },
  { value: '1y', label: '近一年' },
];

function getCutoffDate(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '15d': return new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '1y': return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  }
}

function groupByMonth(records: SparkDayRecord[]): SparkDayRecord[] {
  const map = new Map<string, { days: Record<string, number>; lastDate: string }>();
  for (const r of records) {
    const month = r.date.substring(0, 7); // "2026-06"
    if (!map.has(month)) {
      map.set(month, { days: {}, lastDate: r.date });
    }
    const entry = map.get(month)!;
    entry.lastDate = r.date;
    for (const [user, days] of Object.entries(r.days)) {
      entry.days[user] = days; // take the latest value in that month
    }
  }
  return Array.from(map.entries())
    .map(([month, data]) => ({
      date: month,
      days: data.days,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const HistoryPage: React.FC = () => {
  const [records, setRecords] = useState<SparkDayRecord[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotFile[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [timeRange, setTimeRange] = useState<TimeRange>('15d');
  const [loading, setLoading] = useState(true);
  const [screenshotsLoading, setScreenshotsLoading] = useState(true);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [sendRecords, setSendRecords] = useState<SendRecord[]>([]);

  // 加载历史
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.historySparkDays();
      if (result.success) {
        setRecords(result.records || []);
        setSendRecords(result.sendRecords || []);
      }
    } catch {
      // 忽略
    }
    setLoading(false);
  }, []);

  // 加载截图
  const loadScreenshots = useCallback(async () => {
    setScreenshotsLoading(true);
    try {
      const result = await window.electronAPI.historyScreenshots();
      if (result.success) {
        setScreenshots(result.files || []);
      }
    } catch {
      // 忽略
    }
    setScreenshotsLoading(false);
  }, []);

  // 加载头像
  const loadAvatars = useCallback(async () => {
    try {
      const result = await window.electronAPI.sparkStatus();
      if (result.avatars) setAvatars(result.avatars);
    } catch {}
  }, []);

  useEffect(() => {
    loadHistory();
    loadScreenshots();
    loadAvatars();
  }, [loadHistory, loadScreenshots]);

  // 好友变更时实时刷新
  useEffect(() => {
    const handleFriendsChanged = () => { loadHistory(); loadScreenshots(); };
    window.addEventListener('friends-changed', handleFriendsChanged);
    return () => window.removeEventListener('friends-changed', handleFriendsChanged);
  }, [loadHistory, loadScreenshots]);

  // 按时间范围过滤记录
  const filteredRecords = useMemo(() => {
    const cutoff = getCutoffDate(timeRange);
    const filtered = records.filter((r) => new Date(r.date) >= cutoff);
    // 近一年按月聚合
    if (timeRange === '1y') {
      return groupByMonth(filtered);
    }
    return filtered;
  }, [records, timeRange]);

  // 获取所有用户名
  const allUsers = useMemo(() => {
    const userSet = new Set<string>();
    filteredRecords.forEach((r) => {
      Object.keys(r.days).forEach((u) => userSet.add(u));
    });
    return Array.from(userSet).sort();
  }, [filteredRecords]);

  // 构建图表数据
  const chartLabels = filteredRecords
    .filter((r) => selectedUser ? r.days[selectedUser] !== undefined : true)
    .map((r) => r.date);

  const chartDatasets = selectedUser
    ? [{
        label: selectedUser,
        data: filteredRecords
          .filter((r) => r.days[selectedUser] !== undefined)
          .map((r) => r.days[selectedUser]),
      }]
    : allUsers.map((user) => ({
        label: user,
        data: filteredRecords
          .filter((r) => r.days[user] !== undefined)
          .map((r) => r.days[user]),
      }));

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <History size={24} style={{ color: 'var(--accent)' }} />
        <h1 className="text-2xl font-bold text-white">发送历史</h1>
      </div>

      {/* 筛选栏 */}
      {allUsers.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {/* 好友选择器 */}
          <div className="relative inline-block">
            <select
              className="appearance-none px-4 py-2 pr-8 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
            >
              <option value="">全部好友</option>
              {allUsers.map((user) => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500"
            />
          </div>

          {/* 时间范围选择器 */}
          <div className="relative inline-block">
            <select
              className="appearance-none px-4 py-2 pr-8 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            >
              {TIME_RANGES.map((tr) => (
                <option key={tr.value} value={tr.value}>{tr.label}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500"
            />
          </div>
        </div>
      )}

      {/* 火花天数趋势图 */}
      <div
        className="p-6 rounded-2xl border border-pink-300/10 shadow-lg shadow-black/10"
        style={{ background: 'linear-gradient(135deg, rgba(233,69,96,0.10), var(--bg-secondary) 55%)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-pink-500/15 text-pink-300"><Send size={17} /></div>
            <div>
              <h2 className="text-lg font-semibold text-white">发送记录</h2>
              <p className="text-xs text-gray-500 mt-0.5">显示最近 100 条实际发送成功的好友</p>
            </div>
          </div>
          <span className="text-sm text-gray-500">{sendRecords.length} 条</span>
        </div>
        {sendRecords.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-black/15 py-6 text-center text-sm text-gray-500">
            暂无发送记录
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-auto pr-1">
            {[...sendRecords].reverse().slice(0, 20).map((record, index) => (
              <div key={`${record.timestamp}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/15 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={15} className={record.success ? 'text-green-400' : 'text-yellow-400'} />
                    <span className="text-sm text-white truncate">{record.users.join('、')}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                    <Clock3 size={12} />
                    <span>{new Date(record.timestamp).toLocaleString('zh-CN')}</span>
                    {record.force && <span className="rounded bg-pink-500/15 px-1.5 py-0.5 text-pink-300">强制</span>}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-green-400">已完成</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 火花天数趋势图 */}
      <div
        className="p-6 rounded-lg border border-gray-700/50"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <h2 className="text-lg font-semibold text-white mb-4">火花天数趋势</h2>
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-gray-500 text-sm">加载中...</p>
          </div>
        ) : (
          <SparkDaysChart
            labels={chartLabels}
            datasets={chartDatasets.length > 0 ? chartDatasets : [{ label: '暂无数据', data: [] }]}
            avatars={avatars}
          />
        )}
      </div>

      {/* 截图列表 */}
      <div
        className="p-6 rounded-lg border border-gray-700/50"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">火花截图</h2>
          {!screenshotsLoading && (
            <span className="text-sm text-gray-500">{screenshots.length} 张</span>
          )}
        </div>
        {screenshotsLoading ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">加载中...</p>
          </div>
        ) : (
          <ScreenshotGallery screenshots={screenshots} />
        )}
      </div>
    </div>
  );
};

export default HistoryPage;
