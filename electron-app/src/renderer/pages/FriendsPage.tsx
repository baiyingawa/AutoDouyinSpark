import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Trash2, AlertCircle, UserPlus, Send, X, CheckSquare, Square,
  Loader2, Pencil, ScanSearch, AtSign,
} from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';

interface Friend {
  name: string;
  douyin_id?: string;
  avatar_file?: string;
}

interface FriendCardProps {
  friend: Friend;
  onRemove: (name: string) => void;
  onEdit: (friend: Friend) => void;
  onIdentify: (friend: Friend) => void;
  identifying: boolean;
  sentToday: boolean;
  avatarUrl?: string;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}

const FriendCard: React.FC<FriendCardProps> = ({
  friend, onRemove, onEdit, onIdentify, identifying,
  sentToday, avatarUrl, selectable = false, selected = false, onToggle,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div
      className={'flex items-center justify-between p-4 rounded-lg border transition-colors ' +
        (selectable && selected
          ? 'border-blue-500/60'
          : 'border-gray-700/50 hover:border-gray-600') +
        (selectable ? ' cursor-pointer' : '')}
      style={{ backgroundColor: 'var(--bg-secondary)' }}
      onClick={selectable ? onToggle : undefined}
    >
      <div className="flex items-center gap-3 min-w-0">
        {selectable && (
          <div className="shrink-0">
            {selected ? (
              <CheckSquare size={22} className="text-blue-400" />
            ) : (
              <Square size={22} className="text-gray-500" />
            )}
          </div>
        )}

        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={friend.name}
            className="w-10 h-10 rounded-full object-cover shrink-0"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {friend.name.charAt(0)}
          </div>
        )}

        <div className="min-w-0">
          <p className="text-white font-medium truncate">{friend.name}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className={'text-xs ' + (sentToday ? 'text-green-500' : 'text-gray-500')}>
              {sentToday ? '已发送' : '等待发送'}
            </p>
            {friend.douyin_id ? (
              <span className="flex items-center gap-1 text-xs text-blue-400">
                <AtSign size={11} />
                {friend.douyin_id}
              </span>
            ) : (
              <span className="text-xs text-yellow-500">未识别抖音号</span>
            )}
          </div>
        </div>
      </div>

      {!selectable && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="p-2 text-gray-500 hover:text-blue-400 transition-colors"
            title="识别抖音号与头像"
            onClick={(e) => { e.stopPropagation(); onIdentify(friend); }}
            disabled={identifying}
          >
            {identifying ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <ScanSearch size={18} />
            )}
          </button>
          <button
            className="p-2 text-gray-500 hover:text-white transition-colors"
            title="编辑名字 / 抖音号"
            onClick={(e) => { e.stopPropagation(); onEdit(friend); }}
          >
            <Pencil size={18} />
          </button>
          {showConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">确定删除？</span>
              <button
                className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                onClick={(e) => { e.stopPropagation(); onRemove(friend.name); setShowConfirm(false); }}
              >
                确定
              </button>
              <button
                className="px-2 py-1 text-xs rounded bg-gray-600 text-white hover:bg-gray-700 transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowConfirm(false); }}
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

interface EditDialogProps {
  friend: Friend | null;
  saving: boolean;
  onSave: (payload: { name: string; newName: string; douyin_id: string }) => void;
  onClose: () => void;
}

const EditDialog: React.FC<EditDialogProps> = ({ friend, saving, onSave, onClose }) => {
  const [newName, setNewName] = useState('');
  const [douyinId, setDouyinId] = useState('');

  useEffect(() => {
    if (friend) {
      setNewName(friend.name);
      setDouyinId(friend.douyin_id || '');
    }
  }, [friend]);

  if (!friend) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md p-6 rounded-lg border border-gray-700 bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">编辑好友</h2>
          <button className="p-1 text-gray-400 hover:text-white" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <label className="block text-xs text-gray-400 mb-1">备注名 / 昵称</label>
        <input
          type="text"
          className="w-full px-3 py-2 mb-4 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <label className="block text-xs text-gray-400 mb-1">抖音号</label>
        <input
          type="text"
          className="w-full px-3 py-2 mb-5 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
          placeholder="可留空，点击卡片上的识别按钮自动获取"
          value={douyinId}
          onChange={(e) => setDouyinId(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-700 text-sm"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="px-4 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
            disabled={saving || !newName.trim()}
            onClick={() => onSave({ name: friend.name, newName: newName.trim(), douyin_id: douyinId.trim() })}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

const FriendsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isForceSendMode = searchParams.get('mode') === 'force-send';

  const [users, setUsers] = useState<Friend[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sentToday, setSentToday] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [identifying, setIdentifying] = useState<string | null>(null);
  const [editing, setEditing] = useState<Friend | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const loadFriends = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.friendsList();
      if (result.success) {
        setUsers(result.users || []);
        if (isForceSendMode) {
          setSelectedUsers(new Set((result.users || []).map((u) => u.name)));
        }
      } else {
        setError('加载好友列表失败');
      }
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }, [isForceSendMode]);

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

  useEffect(() => {
    const handleFriendsChanged = () => { loadFriends(); loadStatus(); };
    window.addEventListener('friends-changed', handleFriendsChanged);
    return () => window.removeEventListener('friends-changed', handleFriendsChanged);
  }, [loadFriends, loadStatus]);

  const handleAdd = useCallback(async () => {
    const name = newUsername.trim();
    if (!name) return;
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      const result = await window.electronAPI.friendsAdd(name);
      if (result.success) {
        setNewUsername('');
        await loadFriends();
        window.dispatchEvent(new CustomEvent('friends-changed'));
        // 首次添加时自动识别抖音号与头像
        setIdentifying(name);
        try {
          const ident = await window.electronAPI.friendsIdentify(name);
          if (ident.success) {
            setNotice('已自动识别「' + (ident.name || name) + '」' + (ident.douyin_id ? '，抖音号 ' + ident.douyin_id : ''));
          } else {
            setNotice('好友已添加；抖音号自动识别未完成：' + (ident.error || '未匹配到'));
          }
          await loadFriends();
          window.dispatchEvent(new CustomEvent('friends-changed'));
        } finally {
          setIdentifying(null);
        }
      } else {
        setError(result.error || '添加失败');
      }
    } catch (err) {
      setError(String(err));
    }
    setAdding(false);
  }, [newUsername, loadFriends]);

  const handleRemove = useCallback(async (name: string) => {
    try {
      await window.electronAPI.friendsRemove(name);
      await loadFriends();
      window.dispatchEvent(new CustomEvent('friends-changed'));
    } catch (err) {
      setError(String(err));
    }
  }, [loadFriends]);

  const handleIdentify = useCallback(async (friend: Friend) => {
    if (identifying) return;
    setIdentifying(friend.name);
    setError(null);
    setNotice(null);
    try {
      const result = await window.electronAPI.friendsIdentify(friend.name);
      if (result.success) {
        setNotice(
          '识别成功' +
          (result.douyin_id ? '：抖音号 ' + result.douyin_id : '') +
          (result.name && result.name !== friend.name ? '，新昵称「' + result.name + '」' : ''),
        );
      } else {
        setError(result.error || '识别失败');
      }
      await loadFriends();
      await loadStatus();
      window.dispatchEvent(new CustomEvent('friends-changed'));
    } catch (err) {
      setError(String(err));
    } finally {
      setIdentifying(null);
    }
  }, [identifying, loadFriends, loadStatus]);

  const handleSaveEdit = useCallback(async (payload: { name: string; newName: string; douyin_id: string }) => {
    setSavingEdit(true);
    try {
      const result = await window.electronAPI.friendsUpdate({
        name: payload.name,
        newName: payload.newName,
        douyin_id: payload.douyin_id,
      });
      if (result.success) {
        setEditing(null);
        await loadFriends();
        window.dispatchEvent(new CustomEvent('friends-changed'));
      } else {
        setError(result.error || '保存失败');
      }
    } catch (err) {
      setError(String(err));
    }
    setSavingEdit(false);
  }, [loadFriends]);

  const handleToggle = useCallback((name: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const handleForceSend = useCallback(() => {
    setSending(true);
    navigate('/', { state: { forceSendTriggered: true } });
  }, [navigate]);

  const handleCancel = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  };

  const handleToggleAll = useCallback(() => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(users.map((u) => u.name)));
    }
  }, [users, selectedUsers]);

  return (
    <div className="w-full space-y-6">
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
            className={'px-5 py-2 rounded-lg text-white font-medium transition-all flex items-center gap-2 ' +
              (selectedUsers.size === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90')}
            style={{ backgroundColor: 'var(--accent)' }}
            onClick={handleForceSend}
            disabled={selectedUsers.size === 0 || sending}
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            <span>强制发送（共{selectedUsers.size}人）</span>
          </button>
        </div>
      ) : (
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
                placeholder="输入好友备注名 / 昵称..."
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
              <span>{adding ? '添加中...' : '添加并识别'}</span>
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            添加后会自动打开浏览器识别该好友的抖音号与头像
          </p>
        </div>
      )}

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

      {error && (
        <div className="p-3 rounded-lg bg-red-900/30 border border-red-800/50 flex items-start gap-2">
          <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
          <span className="text-red-300 text-sm">{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-3 rounded-lg bg-green-900/30 border border-green-800/50 flex items-start gap-2">
          <CheckSquare size={16} className="text-green-400 mt-0.5 shrink-0" />
          <span className="text-green-300 text-sm">{notice}</span>
        </div>
      )}

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
          {users.map((friend) => (
            <FriendCard
              key={friend.name}
              friend={friend}
              onRemove={handleRemove}
              onEdit={setEditing}
              onIdentify={handleIdentify}
              identifying={identifying === friend.name}
              sentToday={sentToday}
              avatarUrl={avatars[friend.name]}
              selectable={isForceSendMode}
              selected={selectedUsers.has(friend.name)}
              onToggle={() => handleToggle(friend.name)}
            />
          ))}
        </div>
      )}

      <EditDialog
        friend={editing}
        saving={savingEdit}
        onSave={handleSaveEdit}
        onClose={() => setEditing(null)}
      />
    </div>
  );
};

export default FriendsPage;
