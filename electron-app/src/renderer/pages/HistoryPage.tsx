import React, { useState, useEffect, useCallback } from 'react';
import { History, ChevronDown } from 'lucide-react';
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

const HistoryPage: React.FC = () => {
  const [records, setRecords] = useState<SparkDayRecord[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotFile[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [screenshotsLoading, setScreenshotsLoading] = useState(true);

  // 获取所有用户名
  const allUsers = React.useMemo(() => {
    const userSet = new Set<string>();
    records.forEach((r) => {
      Object.keys(r.days).forEach((u) => userSet.add(u));
    });
    return Array.from(userSet).sort();
  }, [records]);

  // 自动选择第一个（默认显示全部好友）
  // useEffect(() => {
  //   if (allUsers.length > 0 && !selectedUser) {
  //     setSelectedUser(allUsers[0]);
  //   }
  // }, [allUsers, selectedUser]);

  // 加载历史
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.historySparkDays();
      if (result.success) {
        setRecords(result.records || []);
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

  useEffect(() => {
    loadHistory();
    loadScreenshots();
  }, [loadHistory, loadScreenshots]);

  // 好友变更时实时刷新
  useEffect(() => {
    const handleFriendsChanged = () => { loadHistory(); loadScreenshots(); };
    window.addEventListener('friends-changed', handleFriendsChanged);
    return () => window.removeEventListener('friends-changed', handleFriendsChanged);
  }, [loadHistory, loadScreenshots]);

  // 构建图表数据
  const chartLabels = records
    .filter((r) => selectedUser ? r.days[selectedUser] !== undefined : true)
    .map((r) => r.date);

  // 每个用户一条线
  const chartDatasets = selectedUser
    ? [{
        label: selectedUser,
        data: records
          .filter((r) => r.days[selectedUser] !== undefined)
          .map((r) => r.days[selectedUser]),
      }]
    : allUsers.map((user) => ({
        label: user,
        data: records
          .filter((r) => r.days[user] !== undefined)
          .map((r) => r.days[user]),
      }));

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <History size={24} style={{ color: 'var(--accent)' }} />
        <h1 className="text-2xl font-bold text-white">发送历史</h1>
      </div>

      {/* 好友选择器 */}
      {allUsers.length > 0 && (
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
      )}

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
