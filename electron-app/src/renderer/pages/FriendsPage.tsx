import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Trash2, AlertCircle, UserPlus, Send, X, CheckSquare, Square, Loader2 } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';

interface FriendCardProps {
  username: string;
  onRemove: (username: string) => void;
  sentToday: boolean;
  avatarUrl?: string;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}

const FriendCard: React.FC<FriendCardProps> = ({
  username, onRemove, sentToday, avatarUrl,
  selectable = false, selected = false, onToggle,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div
      className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
        selectable && selected
          ? 'border-blue-500/60'
          : 'border-gray-700/50 hover:border-gray-600'
      } ${selectable ? 'cursor-pointer' : ''}`}
      style={{ backgroundColor: 'var(--bg-secondary)' }}
      onClick={selectable ? onToggle : undefined}
    >
      <div className="flex items-center gap-3">
        {/* 复选框（选择模式） */}
        {selectable && (
          <div className="shrink-0">
            {selected ? (
              <CheckSquare size={22} className="text-blue-400" />
            ) : (
              <Square size={22} className="text-gray-500" />
            )}
          </div>
        )}

        {/* 头像 */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={username}
            className="w-10 h-10 rounded-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
            avatarUrl ? 'hidden' : ''
          }`}
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {username.charAt(0)}
        </div>
        <div>
          <p className="text-white font-medium">{username}</p>
          <p className={`text-xs ${sentToday ? 'text-green-500' : 'text-gray-500'}`}>
            {sentToday ? '已发送' : '等待发送'}
          </p>
        </div>
      </div>

      {/* 操作区 */}
      {!selectable && (
        <div className="relative">
          {showConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">确定删除？</span>
              <button
                className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                onClick={() => { onRemove(username); setShowConfirm(false); }}
              >
                确定
              </button>
              <button
                className="px-2 py-1 text-xs rounded bg-gray-600 text-white hover:bg-gray-700 transition-colors"
                onClick={() => setShowConfirm(false)}
              >
                取消
              </button>
            </div>
          ) : (
            <button
              className="p-2 text-gray-500 hover:text-red-400 transition-colors"
              onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
              title="删除好友"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const FriendsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isForceSendMode = searchParams.get('mode') === 'force-send';

  const [users, setUsers] = useState<string[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sentToday, setSentToday] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  // 加载好友列表
  const loadFriends = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.friendsList();
      if (result.success) {
        setUsers(result.users || []);
        // 默认全选
        if (isForceSendMode) {
          setSelectedUsers(new Set(result.users || []));
        }
      } else {
        setError('加载好友列表失败');
      }
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }, [isForceSendMode]);

  // 获取发送状态和头像
  const loadStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI.sparkStatus();
      setSentToday(result.sentToday === true);
      setAvatars(result.avatars || {});
    } catch {}
  }, []);

  useEffect(() => {
    loadFriends();
    loadStatus();
  }, [loadFriends, loadStatus]);

  // 好友变更时刷新
  useEffect(() => {
    const handleFriendsChanged = () => { loadFriends(); loadStatus(); };
    window.addEventListener('friends-changed', handleFriendsChanged);
    return () => window.removeEventListener('friends-changed', handleFriendsChanged);
  }, [loadFriends, loadStatus]);

  // 添加好友
  const handleAdd = useCallback(async () => {
    const name = newUsername.trim();
    if (!name) return;
    setAdding(true);
    setError(null);
    try {
      const result = await window.electronAPI.friendsAdd(name);
      if (result.success) {
        setNewUsername('');
        await loadFriends();
        window.dispatchEvent(new CustomEvent('friends-changed'));
      } else {
        setError(result.error || '添加失败');
      }
    } catch (err) {
      setError(String(err));
    }
    setAdding(false);
  }, [newUsername, loadFriends]);

  // 删除好友
  const handleRemove = useCallback(async (username: string) => {
    try {
      await window.electronAPI.friendsRemove(username);
      await loadFriends();
      window.dispatchEvent(new CustomEvent('friends-changed'));
    } catch (err) {
      setError(String(err));
    }
  }, [loadFriends]);

  // 切换选择
  const handleToggle = useCallback((username: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(username)) {
        next.delete(username);
      } else {
        next.add(username);
      }
      return next;
    });
  }, []);

  // 强制发送
  const handleForceSend = useCallback(async () => {
    setSending(true);
    // navigate 带 state，DashboardPage 挂载后读取 state 触发发送
    navigate('/', { state: { forceSendTriggered: true } });
  }, [navigate]);

  // 取消
  const handleCancel = useCallback(() => {
    navigate('/');
  }, [navigate]);

  // 回车键添加
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  };

  // 切换全选
  const handleToggleAll = useCallback(() => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(users));
    }
  }, [users, selectedUsers]);

  return (
    <div className="w-full space-y-6">
      {/* 强制发送模式顶部栏 */}
      {isForceSendMode ? (
        <div className="flex items-center gap-3 mb-4">
          <button
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700/30"
            onClick={handleCancel}
          >
            <X size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">选择发送对象</h1>
          </div>
          <button
            className={`px-5 py-2 rounded-lg text-white font-medium transition-all flex items-center gap-2 ${
              selectedUsers.size === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
            }`}
            style={{ backgroundColor: 'var(--accent)' }}
            onClick={handleForceSend}
            disabled={selectedUsers.size === 0 || sending}
          >
            {sending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            <span>强制发送（共{selectedUsers.size}人）</span>
          </button>
        </div>
      ) : (
        /* 普通模式标题 */
        <div className="flex items-center gap-3 mb-8">
          <Users size={24} style={{ color: 'var(--accent)' }} />
          <h1 className="text-2xl font-bold text-white">好友管理</h1>
          {!loading && (
            <span className="text-sm text-gray-500 ml-auto">
              {users.length} 个好友
            </span>
          )}
        </div>
      )}

      {/* 添加好友 - 仅在普通模式显示 */}
      {!isForceSendMode && (
        <div
          className="p-4 rounded-lg border border-gray-700/50"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <input
                type="text"
                className="w-full px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                placeholder="输入抖音用户名..."
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <button
              className="px-4 py-2 rounded-lg text-white font-medium transition-all hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              style={{ backgroundColor: 'var(--accent)' }}
              onClick={handleAdd}
              disabled={adding || !newUsername.trim()}
            >
              <UserPlus size={18} />
              <span>{adding ? '添加中...' : '添加'}</span>
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            请输入好友在抖音上的显示昵称
          </p>
        </div>
      )}

      {/* 全选（强制发送模式） */}
      {isForceSendMode && users.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <button
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
            onClick={handleToggleAll}
          >
            {selectedUsers.size === users.length ? (
              <CheckSquare size={16} className="text-blue-400" />
            ) : (
              <Square size={16} />
            )}
            {selectedUsers.size === users.length ? '取消全选' : '全选'}
          </button>
          <span className="text-xs text-gray-500">
            已选 {selectedUsers.size}/{users.length} 人
          </span>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="p-3 rounded-lg bg-red-900/30 border border-red-800/50 flex items-start gap-2">
          <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
          <span className="text-red-300 text-sm">{error}</span>
        </div>
      )}

      {/* 好友列表 */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">加载中...</p>
        </div>
      ) : users.length === 0 ? (
        <div
          className="p-12 rounded-lg border border-gray-700/50 text-center"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          <Users size={48} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400 mb-2">还没有添加好友</p>
          <p className="text-gray-500 text-sm">在上方输入好友昵称开始添加</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((username) => (
            <FriendCard
              key={username}
              username={username}
              onRemove={handleRemove}
              sentToday={sentToday}
              avatarUrl={avatars[username]}
              selectable={isForceSendMode}
              selected={selectedUsers.has(username)}
              onToggle={() => handleToggle(username)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default FriendsPage;
