import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, Send, RefreshCw, Flame, Users, Clock, CheckCircle, XCircle, AlertCircle, Info, X, Loader2 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

import type { SparkSendResult } from '../types/electron';
import UpdateBanner from '../components/UpdateBanner';

interface SparkStatus {
  success: boolean;
  sentToday: boolean;
  streak: number;
  days: Record<string, number>;
  cookieValid: boolean;
  cookieTotal?: number;
  cookieValidCount?: number;
  cookieNames?: string[];
  avatars?: Record<string, string>;
  lastSend: string | null;
  schedulerRunning: boolean | null;
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<SparkStatus | null>(null);
  const [sending, setSending] = useState(false);
  const [forceSendMsg, setForceSendMsg] = useState<string | null>(null); // "发送中" 或结果
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCookieInfo, setShowCookieInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [lastSendResult, setLastSendResult] = useState<SparkSendResult | null>(null);
  // 彩蛋：灰色按钮解锁（用 ref 避免闭包问题）
  const clickCountRef = useRef(0);
  const mouseMovedRef = useRef(false);
  const [unlockText, setUnlockText] = useState('');

  // 加载状态
  const loadStatus = useCallback(async () => {
    try {
      const result: SparkStatus = await window.electronAPI.sparkStatus();
      setStatus(result);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStatus();

    const handleFriendsChanged = () => loadStatus();
    window.addEventListener('friends-changed', handleFriendsChanged);

    return () => {
      window.removeEventListener('friends-changed', handleFriendsChanged);
    };
  }, [loadStatus]);

  // 监听来自好友页的强制发送请求（通过 navigate state）
  useEffect(() => {
    const state = location.state as { forceSendTriggered?: boolean } | null;
    if (state?.forceSendTriggered) {
      // 清除 state，防止刷新重复触发
      navigate('/', { state: {}, replace: true });

      setForceSendMsg('发送中...');
      setSending(true);
      window.dispatchEvent(new CustomEvent('log-panel:auto-expand'));

      window.electronAPI.sparkSend(true).then(async (result) => {
        if (result.success) {
          setForceSendMsg(`✅ 强制发送成功！(${result.sentCount} 条)`);
        } else {
          setForceSendMsg(`❌ 强制发送失败${result.error ? `：${result.error}` : ''}`);
        }
        setLastSendResult(result);
        await loadStatus();
        setTimeout(() => {
          setForceSendMsg(null);
          window.dispatchEvent(new CustomEvent('log-panel:auto-collapse'));
        }, 4000);
      }).catch((err) => {
        setForceSendMsg(`❌ 强制发送异常：${String(err)}`);
        setTimeout(() => setForceSendMsg(null), 4000);
      }).finally(() => {
        setSending(false);
      });
    }
  }, [location.state, navigate, loadStatus]);

  // 发送
  const handleSend = useCallback(async (force = false) => {
    setSending(true);
    setSendResult(null);
    setError(null);
    // 展开日志
    window.dispatchEvent(new CustomEvent('log-panel:auto-expand'));
    try {
      const result: SparkSendResult = await window.electronAPI.sparkSend(force);
      if (result.success) {
        setSendResult(`发送成功！(${result.sentCount} 条)${
          result.failCount > 0 ? `，${result.failCount} 条失败` : ''
        }`);
        if (result.failCount === 0) {
          clickCountRef.current = 0;
          setUnlockText('');
        }
      } else {
        setSendResult(`发送失败${result.error ? `：${result.error}` : ''}`);
      }
      setLastSendResult(result);
      await loadStatus();
      // 发送完成 → 自动收起日志
      setTimeout(() => window.dispatchEvent(new CustomEvent('log-panel:auto-collapse')), 2000);
    } catch (err) {
      setError(String(err));
    }
    setSending(false);
  }, [loadStatus]);

  // 灰色按钮点击（彩蛋解锁，使用 ref 避免 React 状态闭包问题）
  const handleGrayClick = useCallback(() => {
    if (mouseMovedRef.current) {
      clickCountRef.current = 0;
      mouseMovedRef.current = false;
      setUnlockText('');
      return;
    }
    clickCountRef.current += 1;
    const cnt = clickCountRef.current;
    if (cnt <= 5) {
      // 前 5 次：安静计数
      setUnlockText('');
    } else if (cnt <= 10) {
      // 显示倒计时：11-cnt
      setUnlockText(`点击${11 - cnt}次后解锁`);
    } else {
      // >10: 已解锁 → 跳转好友页选择强制发送对象
      clickCountRef.current = 0;
      setUnlockText('');
      navigate('/friends?mode=force-send');
    }
  }, [navigate]);

  // 刷新天数
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    window.dispatchEvent(new CustomEvent('log-panel:auto-expand'));
    try {
      await window.electronAPI.sparkRefreshDays(true);
      await loadStatus();
      setTimeout(() => window.dispatchEvent(new CustomEvent('log-panel:auto-collapse')), 2000);
    } catch (err) {
      setError(String(err));
    }
    setRefreshing(false);
  }, [loadStatus]);

  // 好友数量
  const friendCount = status?.days ? Object.keys(status.days).length : 0;

  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <div className="w-full space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Sparkles size={28} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-2xl font-bold text-white">AutoDouyinSpark</h1>
            <p className="text-sm text-gray-500">{today}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">加载中...</p>
        </div>
      ) : (
        <>
          {/* 自动更新提示 */}
          <UpdateBanner />

          {/* 错误提示 */}
          {error && (
            <div className="p-3 rounded-lg bg-red-900/30 border border-red-800/50 flex items-start gap-2 mb-4">
              <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <span className="text-red-300 text-sm">{error}</span>
            </div>
          )}

          {/* 发送结果提示 */}
          {sendResult && (
            <div className={`p-3 rounded-lg flex items-start gap-2 mb-4 ${
              sendResult.includes('成功')
                ? 'bg-green-900/30 border border-green-800/50'
                : 'bg-red-900/30 border border-red-800/50'
            }`}>
              {sendResult.includes('成功') ? (
                <CheckCircle size={16} className="text-green-400 mt-0.5 shrink-0" />
              ) : (
                <XCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
              )}
              <span className={sendResult.includes('成功') ? 'text-green-300 text-sm' : 'text-red-300 text-sm'}>
                {sendResult}
              </span>
            </div>
          )}

          {/* 强制发送提示条（非弹窗，不需要关闭） */}
          {forceSendMsg && (
            <div className={`p-3 rounded-lg flex items-center gap-3 mb-4 ${
              forceSendMsg.startsWith('✅')
                ? 'bg-green-900/30 border border-green-800/50'
                : forceSendMsg.startsWith('❌')
                ? 'bg-red-900/30 border border-red-800/50'
                : 'bg-blue-900/30 border border-blue-800/50'
            }`}>
              {forceSendMsg.startsWith('发送') ? (
                <Loader2 size={18} className="animate-spin text-blue-400 shrink-0" />
              ) : forceSendMsg.startsWith('✅') ? (
                <CheckCircle size={18} className="text-green-400 shrink-0" />
              ) : (
                <XCircle size={18} className="text-red-400 shrink-0" />
              )}
              <span className={`text-sm font-medium ${
                forceSendMsg.startsWith('✅') ? 'text-green-300'
                : forceSendMsg.startsWith('❌') ? 'text-red-300'
                : 'text-blue-300'
              }`}>
                {forceSendMsg}
              </span>
            </div>
          )}

          {/* 2x2 网格布局 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 左上：今日状态 */}
            <div
              className="p-6 rounded-lg border border-gray-700/50"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">今日状态</h2>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    status?.sentToday ? 'bg-green-400' : 'bg-yellow-400'
                  }`} />
                  <span className={`text-sm ${
                    status?.sentToday ? 'text-green-400' : 'text-yellow-400'
                  }`}>
                    {status?.sentToday ? '已发送' : '未发送'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg" style={{ backgroundColor: '#1a1a2e' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Flame size={16} style={{ color: 'var(--accent)' }} />
                    <span className="text-sm text-gray-400">本工具连续续火</span>
                  </div>
                  <span className="text-3xl font-bold text-white">
                    {status?.streak ?? 0}
                  </span>
                  <span className="text-sm text-gray-500 ml-1">天</span>
                </div>

                <div className="p-4 rounded-lg" style={{ backgroundColor: '#1a1a2e' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Users size={16} style={{ color: '#60a5fa' }} />
                    <span className="text-sm text-gray-400">追踪好友</span>
                  </div>
                  <span className="text-3xl font-bold text-white">
                    {friendCount}
                  </span>
                  <span className="text-sm text-gray-500 ml-1">人</span>
                </div>
              </div>

              {status?.lastSend && (
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                  <Clock size={14} />
                  <span>上次发送: {status.lastSend}</span>
                </div>
              )}
            </div>

            {/* 右上：火花天数 */}
            {status?.days && Object.keys(status.days).length > 0 && (
              <div
                className="p-6 rounded-lg border border-gray-700/50"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <h2 className="text-lg font-semibold text-white mb-4">火花天数</h2>
                <div className="space-y-3">
                  {Object.entries(status.days).map(([username, days]) => (
                    <div
                      key={username}
                      className="flex items-center justify-between p-3 rounded-lg"
                      style={{ backgroundColor: '#1a1a2e' }}
                    >
                      <div className="flex items-center gap-3">
                        {status?.avatars?.[username] ? (
                          <img
                            src={status.avatars[username]}
                            alt={username}
                            className="w-8 h-8 rounded-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${
                            status?.avatars?.[username] ? 'hidden' : ''
                          }`}
                          style={{ backgroundColor: 'var(--accent)' }}
                        >
                          {username.charAt(0)}
                        </div>
                        <span className="text-white text-sm">{username}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Flame size={14} style={{ color: 'var(--accent)' }} />
                        <span className="text-white font-bold">{days}</span>
                        <span className="text-gray-500 text-xs">天</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 左下：Cookie 状态 */}
            <div
              className="p-6 rounded-lg border border-gray-700/50 relative"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full ${
                    status?.cookieValid ? 'bg-green-400' : 'bg-red-400'
                  }`} />
                  <span className="text-gray-300 text-base font-medium">
                    Cookie {status?.cookieValid ? '有效' : '无效'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!status?.cookieValid && (
                    <button
                      className="text-xs px-3 py-1 rounded text-white hover:opacity-90"
                      style={{ backgroundColor: 'var(--accent)' }}
                      onClick={() => navigate('/login')}
                    >
                      重新登录
                    </button>
                  )}
                  <button
                    className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700/30 transition-colors border border-gray-600"
                    style={{ position: 'absolute', top: '20px', right: '20px' }}
                    onClick={() => setShowCookieInfo(true)}
                    title="查看 Cookie 详情"
                  >
                    <Info size={14} />
                  </button>
                </div>
              </div>
              {status && (
                <div className="mt-3 text-xs text-gray-500">
                  共 {status?.cookieTotal ?? '?'} 条 cookie，{status?.cookieValidCount ?? '?'} 条有效
                </div>
              )}

              {/* Cookie 详情弹窗 */}
              {showCookieInfo && status?.cookieNames && (
                <div
                  className="fixed inset-0 z-50"
                  onClick={() => setShowCookieInfo(false)}
                >
                  <div
                    className="absolute p-4 rounded-lg border border-gray-700/50 w-72 max-h-64 flex flex-col shadow-lg"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      left: '20px',
                      bottom: '20px',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-white font-semibold text-xs">Cookie 列表</h3>
                      <button
                        className="p-0.5 rounded hover:bg-gray-700/30 text-gray-400 hover:text-white transition-colors"
                        onClick={() => setShowCookieInfo(false)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className="overflow-auto space-y-0.5 flex-1">
                      {status.cookieNames.map((name, i) => (
                        <div key={i} className="text-[11px] text-gray-400 py-0.5 px-1.5 rounded hover:bg-gray-800/50 font-mono">
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 右下：操作按钮 */}
            <div
              className="p-6 rounded-lg border border-gray-700/50 flex items-center gap-4"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <button
                className="flex-1 px-6 py-3 rounded-lg text-white font-medium transition-all duration-300 flex items-center justify-center gap-2"
                style={{
                  backgroundColor: status?.sentToday
                    ? unlockText ? 'var(--accent)' : 'rgba(100, 100, 100, 0.5)'
                    : 'var(--accent)',
                  opacity: sending ? 0.5 : 1,
                  cursor: sending ? 'not-allowed' : 'pointer',
                }}
                onClick={sending ? undefined : (
                  status?.sentToday ? handleGrayClick
                  : () => handleSend(true)
                )}
                disabled={sending}
                onMouseMove={() => { mouseMovedRef.current = true; }}
              >
                {sending ? (
                  <RefreshCw size={18} className="animate-spin" />
                ) : (
                  <Send size={18} />
                )}
                <span>
                  {sending ? '发送中...'
                    : unlockText || (lastSendResult?.failCount
                      ? `重试失败(${lastSendResult.failCount})`
                      : '立即发送')}
                </span>
              </button>

              <button
                className="flex-1 px-6 py-3 rounded-lg text-gray-300 font-medium border border-gray-700 transition-all hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                <span>{refreshing ? '刷新中...' : '刷新天数'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPage;
