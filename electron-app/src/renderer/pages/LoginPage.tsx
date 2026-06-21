import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Key, ArrowLeft, AlertCircle, CheckCircle, ExternalLink, Loader2, XCircle } from 'lucide-react';
import type { LoginQrcodeResult, LoginPollResult } from '../types/electron';

type LoginMode = 'web' | 'import';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<LoginMode>('web');
  const [loginStatus, setLoginStatus] = useState<'idle' | 'loading' | 'pending' | 'success' | 'expired' | 'failed'>('idle');
  const [countdown, setCountdown] = useState(300);
  const [cookieText, setCookieText] = useState('');
  const [importing, setImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const loginActiveRef = useRef(false);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // 倒计时
  useEffect(() => {
    if (loginStatus !== 'pending') {
      setCountdown(300);
      return;
    }
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          setLoginStatus('expired');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [loginStatus]);

  // 轮询登录状态（pending 状态时检测登录成功/失败）
  useEffect(() => {
    if (loginStatus !== 'pending') return;
    const poll = setInterval(async () => {
      try {
        const result: LoginPollResult = await window.electronAPI.authPollQrcodeStatus();
        if (result.status === 'success') {
          setLoginStatus('success');
          const count = result.cookieCount || 0;
          if (count > 0) {
            setSuccessMsg(`登录成功！（${count} 条 Cookie）`);
          }
          clearInterval(poll);
          loginActiveRef.current = false;
          setTimeout(() => navigate('/'), 1500);
        } else if (result.status === 'failed' || result.status === 'expired') {
          setLoginStatus(result.status);
          clearInterval(poll);
          loginActiveRef.current = false;
        }
      } catch {
        // 忽略轮询错误
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [loginStatus, navigate]);

  // 轮询浏览器状态（loading 状态时检测浏览器是否已打开 → 切换到 pending）
  useEffect(() => {
    if (loginStatus !== 'loading') return;
    const poll = setInterval(async () => {
      try {
        const result: LoginPollResult = await window.electronAPI.authPollQrcodeStatus();
        if (result.status === 'pending') {
          setLoginStatus('pending');
          clearInterval(poll);
        } else if (result.status === 'success') {
          setLoginStatus('success');
          const count = result.cookieCount || 0;
          if (count > 0) {
            setSuccessMsg(`登录成功！（${count} 条 Cookie）`);
          }
          clearInterval(poll);
          loginActiveRef.current = false;
          setTimeout(() => navigate('/'), 1500);
        }
      } catch {
        // 忽略
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [loginStatus, navigate]);

  // 网页登录（打开浏览器等待用户登录，自动保存 Cookie）
  const handleWebLogin = useCallback(async () => {
    setLoginStatus('loading');
    loginActiveRef.current = true;
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const result: LoginQrcodeResult = await window.electronAPI.authStartQrcode();
      if (!mountedRef.current || !loginActiveRef.current) return;
      if (result.success) {
        // 登录成功，用 start_login 返回的实际 cookieCount
        loginActiveRef.current = false;
        // 先清除正在进行的轮询
        setSuccessMsg(`登录成功！（${result.cookieCount || 0} 条 Cookie）`);
        setLoginStatus('success');
        setTimeout(() => navigate('/'), 1500);
      } else {
        loginActiveRef.current = false;
        if (result.error?.includes('浏览器窗口已关闭')) {
          setLoginStatus('failed');
          setErrorMsg('浏览器窗口已关闭，登录已取消');
        } else if (result.error?.includes('超时')) {
          setLoginStatus('expired');
          setErrorMsg('登录超时（5 分钟未完成登录）');
        } else {
          setLoginStatus('failed');
          setErrorMsg(result.error || '登录失败');
        }
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg(String(err));
      setLoginStatus('failed');
      loginActiveRef.current = false;
    }
  }, [navigate]);

  // 取消登录（关闭浏览器）
  const handleCancelLogin = useCallback(async () => {
    try {
      await window.electronAPI.authLogout();
    } catch {
      // 忽略
    }
    setLoginStatus('idle');
    setErrorMsg('已取消登录');
  }, []);

  // 导入 Cookie
  const handleImportCookie = useCallback(async () => {
    if (!cookieText.trim()) {
      setErrorMsg('请输入 Cookie JSON');
      return;
    }
    setImporting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      // 验证 JSON 格式
      JSON.parse(cookieText);
    } catch {
      setErrorMsg('Cookie 格式无效，请确保是有效的 JSON');
      setImporting(false);
      return;
    }

    try {
      const result = await window.electronAPI.authImportCookie(cookieText);
      if (result.success) {
        setSuccessMsg(`Cookie 导入成功（${result.cookieCount || 0} 条）`);
        setTimeout(() => navigate('/'), 1500);
      } else {
        setErrorMsg(result.error || 'Cookie 导入失败');
      }
    } catch (err) {
      setErrorMsg(String(err));
    }
    setImporting(false);
  }, [cookieText, navigate]);

  // 格式化倒计时
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // 渲染网页登录模式
  const renderWebLoginMode = () => (
    <>
      <div className="mb-6">
        <Globe size={64} className="mx-auto" style={{ color: 'var(--accent)' }} />
      </div>

      <h2 className="text-xl font-bold text-white mb-2">网页登录抖音</h2>
      <p className="text-gray-400 text-sm mb-6">
        点击下方按钮，将弹出浏览器窗口<br />
        在窗口中登录你的抖音账号
      </p>

      {/* 等待状态 */}
      {loginStatus === 'loading' && (
        <div className="mb-6 p-4 rounded-lg border border-gray-700/50" style={{ backgroundColor: '#0f0f23' }}>
          <div className="flex items-center justify-center gap-2 mb-3">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span className="text-white text-sm font-medium">正在打开浏览器...</span>
          </div>
        </div>
      )}

      {loginStatus === 'pending' && (
        <div className="mb-6 p-4 rounded-lg border border-gray-700/50" style={{ backgroundColor: '#0f0f23' }}>
          {/* 浏览器图标 */}
          <div className="flex justify-center mb-3">
            <ExternalLink size={36} className="text-blue-400" />
          </div>
          <p className="text-white text-sm mb-2 font-medium">浏览器已打开</p>
          <p className="text-gray-400 text-xs mb-3">
            请在弹出的浏览器窗口中登录抖音<br />
            支持扫码登录 / 手机号登录 / 账号密码登录
          </p>
          {/* 进度条 */}
          <div className="w-full h-1.5 rounded-full bg-gray-700 mb-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${((300 - countdown) / 300) * 100}%`,
                backgroundColor: countdown < 60 ? '#ef4444' : 'var(--accent)',
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className={countdown < 60 ? 'text-red-400' : 'text-gray-500'}>
              等待登录... {formatTime(countdown)}
            </span>
            <span className="text-gray-500">登录后自动保存 Cookie</span>
          </div>
        </div>
      )}

      {loginStatus === 'success' && (
        <div className="mb-6 flex flex-col items-center gap-2">
          <CheckCircle size={40} className="text-green-400" />
          <span className="text-green-400 text-sm font-medium">{successMsg}</span>
          <span className="text-gray-500 text-xs">即将跳转...</span>
        </div>
      )}

      {loginStatus === 'expired' && (
        <div className="mb-6 flex flex-col items-center gap-2">
          <AlertCircle size={40} className="text-yellow-400" />
          <span className="text-yellow-400 text-sm font-medium">登录超时</span>
        </div>
      )}

      {loginStatus === 'failed' && (
        <div className="mb-6 flex flex-col items-center gap-2">
          <XCircle size={40} className="text-red-400" />
          <span className="text-red-400 text-sm font-medium">登录未完成</span>
        </div>
      )}

      {/* 按钮区 */}
      <div className="flex flex-col gap-3 items-center mt-2">
        {(loginStatus === 'idle' || loginStatus === 'failed' || loginStatus === 'expired') && (
          <button
            className="px-8 py-3 rounded-lg text-white font-medium transition-all hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            style={{ backgroundColor: 'var(--accent)' }}
            onClick={handleWebLogin}
          >
            <ExternalLink size={18} />
            网页登录
          </button>
        )}

        {loginStatus === 'loading' && (
          <button
            className="px-8 py-3 rounded-lg text-white font-medium transition-all hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            style={{ backgroundColor: 'var(--accent)' }}
            disabled
          >
            <Loader2 size={18} className="animate-spin" />
            正在打开浏览器...
          </button>
        )}

        {loginStatus === 'pending' && (
          <button
            className="px-6 py-2 rounded-lg text-gray-300 font-medium transition-all hover:bg-gray-700 border border-gray-600 flex items-center gap-2"
            onClick={handleCancelLogin}
          >
            <XCircle size={16} />
            取消登录
          </button>
        )}

        {(loginStatus === 'failed' || loginStatus === 'expired') && (
          <button
            className="px-6 py-2 rounded-lg text-gray-300 font-medium transition-all hover:bg-gray-700 border border-gray-600 flex items-center gap-2"
            onClick={() => setLoginStatus('idle')}
          >
            重新登录
          </button>
        )}
      </div>

      <div className="mt-6">
        <button
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1 mx-auto"
          onClick={() => { setMode('import'); setErrorMsg(null); setSuccessMsg(null); setLoginStatus('idle'); }}
        >
          <Key size={14} />
          手动导入 Cookie
        </button>
      </div>
    </>
  );

  // 渲染 Cookie 导入模式
  const renderImportMode = () => (
    <>
      <div className="mb-4 flex items-center gap-2">
        <button
          className="text-gray-400 hover:text-white transition-colors"
          onClick={() => { setMode('web'); setErrorMsg(null); setSuccessMsg(null); }}
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-bold text-white">导入 Cookie</h2>
      </div>

      <p className="text-gray-400 text-sm mb-4 text-left">
        使用 Cookie-Editor 扩展导出抖音 Cookie（JSON 格式），粘贴到下方文本框：
      </p>

      <textarea
        className="w-full h-48 p-3 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-sm font-mono resize-none focus:outline-none focus:border-blue-500"
        placeholder='粘贴 Cookie JSON...'
        value={cookieText}
        onChange={(e) => setCookieText(e.target.value)}
      />

      {successMsg && (
        <div className="mt-3 flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle size={14} />
          <span>{successMsg}</span>
        </div>
      )}

      <button
        className="mt-4 px-8 py-2 rounded-lg text-white font-medium transition-all hover:opacity-90 disabled:opacity-50 w-full"
        style={{ backgroundColor: 'var(--accent)' }}
        onClick={handleImportCookie}
        disabled={importing || !cookieText.trim()}
      >
        {importing ? '导入中...' : '导入 Cookie'}
      </button>
    </>
  );

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div
        className="p-8 rounded-lg border border-gray-700/50 text-center max-w-lg w-full"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800/50 flex items-start gap-2">
            <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
            <span className="text-red-300 text-sm text-left">{errorMsg}</span>
          </div>
        )}

        {mode === 'web' ? renderWebLoginMode() : renderImportMode()}
      </div>
    </div>
  );
};

export default LoginPage;
