import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { BarChart3, ChevronDown, Send, CheckCircle2, Clock3, Users, Check, Image as ImageIcon } from 'lucide-react';
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

const DataPage: React.FC = () => {
  const [records, setRecords] = useState<SparkDayRecord[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotFile[]>([]);
  const [friends, setFriends] = useState<Array<{ name: string }>>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [showFriendSelector, setShowFriendSelector] = useState(false);
  const [showAvatars, setShowAvatars] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('15d');
  const [loading, setLoading] = useState(true);
  const [screenshotsLoading, setScreenshotsLoading] = useState(true);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [sendRecords, setSendRecords] = useState<SendRecord[]>([]);
  const selectionInitialized = useRef(false);

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

  const loadFriends = useCallback(async () => {
    try {
      const result = await window.electronAPI.friendsList();
      if (result.success) setFriends((result.users || []).map((friend) => ({ name: friend.name })));
    } catch {}
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
    loadFriends();
    loadScreenshots();
    loadAvatars();
  }, [loadHistory, loadScreenshots, loadFriends]);

  // 好友变更时实时刷新
  useEffect(() => {
    const handleFriendsChanged = () => { loadHistory(); loadFriends(); loadScreenshots(); };
    window.addEventListener('friends-changed', handleFriendsChanged);
    return () => window.removeEventListener('friends-changed', handleFriendsChanged);
  }, [loadHistory, loadFriends, loadScreenshots]);

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
    friends.forEach((friend) => userSet.add(friend.name));
    filteredRecords.forEach((r) => {
      Object.keys(r.days).forEach((u) => userSet.add(u));
    });
    const order = friends.map((friend) => friend.name);
    return [...Array.from(userSet)].sort((a, b) => {
      const ai = order.indexOf(a); const bi = order.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b);
    });
  }, [filteredRecords, friends]);

  useEffect(() => {
    if (!selectionInitialized.current && allUsers.length > 0) {
      setSelectedUsers(allUsers);
      selectionInitialized.current = true;
    }
  }, [allUsers]);

  // 构建图表数据
  const chartLabels = filteredRecords.map((record) => record.date);
  const chartDatasets = selectedUsers.map((user) => ({
    label: user,
    data: filteredRecords.map((record) => record.days[user] ?? null),
  }));

  const toggleUser = (user: string) => {
    setSelectedUsers((current) => current.includes(user)
      ? current.filter((item) => item !== user)
      : [...current, user]);
  };

  return (
    <div className="w-full max-w-6xl space-y-6">
      <div className="flex items-center gap-3 mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <BarChart3 size={24} style={{ color: 'var(--accent)' }} />
        <div>
          <h1 className="text-2xl font-bold text-white">数据中心</h1>
          <p className="mt-1 text-xs text-gray-500">续火趋势、发送记录与截图</p>
        </div>
      </div>

      {/* 筛选栏 */}
      {allUsers.length > 0 && (
        <div className="relative flex items-center gap-3 flex-wrap rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <button className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-sm text-gray-200 hover:bg-white/10" onClick={() => setShowFriendSelector((value) => !value)}>
            <Users size={16} /> 选择好友 <span className="text-xs text-gray-500">{selectedUsers.length}/{allUsers.length}</span><ChevronDown size={14} className={showFriendSelector ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={showAvatars} onChange={(event) => setShowAvatars(event.target.checked)} className="accent-pink-500" />
            <ImageIcon size={16} className="text-pink-300" /> 在图表中显示头像
          </label>
          {showFriendSelector && (
            <div className="absolute left-3 top-14 z-20 w-72 rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-500"><span>勾选顺序即图中堆叠层序</span><button className="text-pink-300 hover:text-pink-200" onClick={() => setSelectedUsers(allUsers)}>全选</button></div>
              <div className="max-h-64 space-y-1 overflow-auto">
                {allUsers.map((user) => <button key={user} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-gray-200 hover:bg-white/5" onClick={() => toggleUser(user)}>{selectedUsers.includes(user) ? <Check size={15} className="text-green-400" /> : <span className="h-[15px] w-[15px] rounded border border-gray-600" />}<span className="truncate">{user}</span></button>)}
              </div>
            </div>
          )}

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
        className="surface-card p-6 rounded-2xl"
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
            showAvatars={showAvatars}
          />
        )}
      </div>

      {/* 截图列表 */}
      <div
        className="surface-card p-6 rounded-2xl"
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

export default DataPage;
