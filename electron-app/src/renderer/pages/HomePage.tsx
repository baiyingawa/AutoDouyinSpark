import React from 'react';
import { Sparkles, Play, Clock, CheckCircle } from 'lucide-react';

const HomePage: React.FC = () => {
  const stats = [
    { icon: Play, label: '今日发送', value: '0', color: '#e94560' },
    { icon: CheckCircle, label: '成功', value: '0', color: '#22c55e' },
    { icon: Clock, label: '等待中', value: '0', color: '#eab308' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <Sparkles size={28} style={{ color: 'var(--accent)' }} />
        <h1 className="text-2xl font-bold text-white">AutoDouyinSpark</h1>
      </div>

      {/* 统计数据 */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="p-4 rounded-lg border border-gray-700/50"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={16} style={{ color: stat.color }} />
              <span className="text-sm text-gray-400">{stat.label}</span>
            </div>
            <span className="text-3xl font-bold text-white">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* 状态面板 */}
      <div
        className="p-6 rounded-lg border border-gray-700/50"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <h2 className="text-lg font-semibold text-white mb-4">系统状态</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Python 环境</span>
            <span className="text-yellow-400">未检测</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">登录状态</span>
            <span className="text-gray-500">未登录</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">队列任务</span>
            <span className="text-white">0</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
