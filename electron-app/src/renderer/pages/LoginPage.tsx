import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Globe, Key, ArrowLeft, AlertCircle, CheckCircle, ExternalLink, Loader2, XCircle, UserRound, Plus, Pencil, Trash2, Download, Save, Pause, Play } from 'lucide-react';
import type { LocalProfile, LoginQrcodeResult, LoginPollResult } from '../types/electron';

type LoginMode = 'web' | 'import';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<LoginMode>('web');
  const [loginStatus, setLoginStatus] = useState<'idle' | 'loading' | 'pending' | 'success' | 'expired' | 'failed'>('idle');
  const [countdown, setCountdown] = useState(300);
  const [cookieText, setCookieText] = useState('');
  const [importing, setImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const loginActiveRef = useRef(false);
  const [profiles, setProfiles] = useState<LocalProfile[]>([]);
  const [profileName, setProfileName] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editProfileName, setEditProfileName] = useState('');
  const [editProfileNote, setEditProfileNote] = useState('');
  const switchingAccount = searchParams.get('switch') === '1';

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const loadProfiles = useCallback(async () => {
    try {
      const result = await window.electronAPI.profilesList();
      if (result.success) setProfiles(result.profiles || []);
    } catch {}
  }, []);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  const handleSwitchProfile = useCallback(async (id: string) => {
    setProfileBusy(true);
    setErrorMsg(null);
    loginActiveRef.current = false;
    setLoginStatus('idle');
    const result = await window.electronAPI.profilesSwitch(id);
    if (result.success) {
      window.location.reload();
      return;
    }
    setErrorMsg(result.error || '切换账户失败');
    setProfileBusy(false);
  }, []);

  const handleCreateProfile = useCallback(async () => {
    setProfileBusy(true);
    setErrorMsg(null);
    const result = await window.electronAPI.profilesCreate(profileName.trim());
    if (result.success) {
      window.location.reload();
      return;
    }
    setErrorMsg(result.error || '创建账户失败');
    setProfileBusy(false);
  }, [profileName]);

  const handleEditProfile = useCallback((profile: LocalProfile) => {
    setEditingProfileId(profile.id);
    setEditProfileName(profile.name);
    setEditProfileNote(profile.note || '');
  }, []);

  const handleUpdateProfile = useCallback(async () => {
    if (!editingProfileId) return;
    setProfileBusy(true);
    const result = await window.electronAPI.profilesUpdate(editingProfileId, editProfileName, editProfileNote);
    if (result.success) {
      setEditingProfileId(null);
      await loadProfiles();
    } else setErrorMsg(result.error || '更新账户失败');
    setProfileBusy(false);
  }, [editingProfileId, editProfileName, editProfileNote, loadProfiles]);

  const handleDeleteProfile = useCallback(async (profile: LocalProfile) => {
    if (profiles.length <= 1) { setErrorMsg('至少保留一个账户'); return; }
    if (!window.confirm(`隐藏账户“${profile.name}”？Cookie 会被删除，好友、历史和火花数据会保留。`)) return;
    setProfileBusy(true);
    const result = await window.electronAPI.profilesDelete(profile.id);
    if (result.success) window.location.reload();
    else { setErrorMsg(result.error || '删除账户失败'); setProfileBusy(false); }
  }, [profiles.length]);

  const handleExportProfile = useCallback(async (profile: LocalProfile) => {
    setProfileBusy(true);
    const result = await window.electronAPI.profilesExport(profile.id);
    if (!result.success) setErrorMsg(result.error || '导出账户失败');
    else if (result.path) setSuccessMsg(`账户已导出：${result.path}`);
    setProfileBusy(false);
  }, []);

  const handlePauseProfile = useCallback(async (profile: LocalProfile) => {
    setProfileBusy(true);
    const result = await window.electronAPI.profilesPause(profile.id, !profile.paused);
    if (result.success) await loadProfiles();
    else setErrorMsg(result.error || '更新账户状态失败');
    setProfileBusy(false);
  }, [loadProfiles]);

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
    if (loginActiveRef.current) return;
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
        setTimeout(() => navigate('/', { replace: true }), 800);
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
        className="p-8 rounded-2xl border border-white/10 text-center max-w-lg w-full shadow-2xl"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="mb-7 rounded-2xl border border-white/10 bg-black/15 p-4 text-left">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><UserRound size={17} className="text-pink-300" /><span className="text-sm font-semibold text-white">账户</span></div>
            {switchingAccount && <span className="text-xs text-pink-300">切换账户</span>}
          </div>
          <div className="space-y-2">
            {profiles.map((profile) => (
              <div key={profile.id} className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
                {editingProfileId === profile.id ? (
                  <div className="space-y-2">
                    <input className="w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-gray-200 focus:outline-none" value={editProfileName} onChange={(event) => setEditProfileName(event.target.value)} placeholder="账户名称" />
                    <input className="w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-gray-300 focus:outline-none" value={editProfileNote} onChange={(event) => setEditProfileNote(event.target.value)} placeholder="备注" />
                    <div className="flex justify-end gap-2"><button className="flex items-center gap-1 rounded-lg bg-green-500/20 px-2 py-1 text-xs text-green-200" onClick={handleUpdateProfile} disabled={profileBusy}><Save size={13} />保存</button><button className="rounded-lg px-2 py-1 text-xs text-gray-400" onClick={() => setEditingProfileId(null)}>取消</button></div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <button disabled={profileBusy || profile.active} onClick={() => handleSwitchProfile(profile.id)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm text-gray-200">{profile.name}</span><span className="block truncate text-[11px] text-gray-500">{profile.note || (profile.douyinId ? `抖音号：${profile.douyinId}` : '') || (profile.hasCookie ? '已保存登录状态' : '待登录')}</span></button>
                    <div className="flex shrink-0 items-center gap-1"><span className={profile.paused ? 'mr-1 text-xs text-yellow-300' : profile.active ? 'mr-1 text-xs text-green-400' : 'mr-1 text-xs text-blue-300'}>{profile.paused ? '已暂停' : profile.active ? '当前' : '切换'}</span><button title={profile.paused ? '恢复' : '暂停'} className="rounded p-1 text-gray-500 hover:text-yellow-200" onClick={() => handlePauseProfile(profile)} disabled={profileBusy}>{profile.paused ? <Play size={14} /> : <Pause size={14} />}</button><button title="编辑" className="rounded p-1 text-gray-500 hover:text-white" onClick={() => handleEditProfile(profile)} disabled={profileBusy}><Pencil size={14} /></button><button title="导出" className="rounded p-1 text-gray-500 hover:text-white" onClick={() => handleExportProfile(profile)} disabled={profileBusy}><Download size={14} /></button><button title="删除" className="rounded p-1 text-gray-500 hover:text-red-300" onClick={() => handleDeleteProfile(profile)} disabled={profileBusy}><Trash2 size={14} /></button></div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-pink-400 focus:outline-none" value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="新账户名称（可选）" disabled={profileBusy} />
            <button className="flex items-center gap-1 rounded-xl bg-pink-500/20 px-3 py-2 text-xs text-pink-100 hover:bg-pink-500/30 disabled:opacity-50" onClick={handleCreateProfile} disabled={profileBusy}><Plus size={14} />新增</button>
          </div>
          <p className="mt-2 text-[11px] text-gray-600">每个账户分别保存 Cookie、好友、历史和火花数据；删除只隐藏账户并清除 Cookie，重新登录同一抖音号可恢复。</p>
        </div>
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
