import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SparkStatus {
  success: boolean;
  sentToday: boolean;
  streak: number;
  days: Record<string, number>;
  cookieValid: boolean;
  lastSend: string | null;
  schedulerRunning: boolean | null;
}

const StatusBar: React.FC = () => {
  const [status, setStatus] = useState<SparkStatus | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const result: SparkStatus = await window.electronAPI.sparkStatus();
        setStatus(result);
      } catch {
        // 忽略错误
      }
    };
    loadStatus();
    // 每 30 秒刷新一次
    const timer = setInterval(loadStatus, 30000);

    // 监听登录过期事件，强制跳转登录页
    const cleanupExpired = window.electronAPI.onLoginExpired(() => {
      setStatus((prev) => prev ? { ...prev, cookieValid: false } : null);
      navigate('/login', { replace: true });
    });

    return () => {
      clearInterval(timer);
      cleanupExpired();
    };
  }, [navigate]);

  const isLoggedIn = status?.cookieValid === true;

  return (
    <div
      className="h-8 px-4 flex items-center justify-between text-xs border-t border-gray-700/50"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      <div className="flex items-center gap-4">
        {/* 发送状态 */}
        <div className="flex items-center gap-1 text-gray-400">
          <span className={`w-2 h-2 rounded-full ${
            status?.schedulerRunning ? 'bg-green-400' : 'bg-gray-600'
          }`} />
          <span>{status?.schedulerRunning ? '运行中' : '空闲'}</span>
        </div>

        {/* 登录状态 */}
        <div className="flex items-center gap-1 text-gray-500">
          {isLoggedIn ? (
            <Wifi size={12} className="text-green-400" />
          ) : (
            <WifiOff size={12} className="text-red-400" />
          )}
          <span className={isLoggedIn ? 'text-green-400' : 'text-red-400'}>
            {isLoggedIn ? '已登录' : '未登录'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 text-gray-500">
        <User size={12} />
        <span className={isLoggedIn ? 'text-green-400' : ''}>
          {isLoggedIn ? '已登录' : '未登录'}
        </span>
      </div>
    </div>
  );
};

export default StatusBar;
