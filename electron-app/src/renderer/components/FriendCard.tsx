import React from 'react';
import { Users, Trash2, Flame } from 'lucide-react';

interface FriendCardProps {
  username: string;
  sparkDays?: number;
  onRemove: (username: string) => void;
}

const FriendCard: React.FC<FriendCardProps> = ({ username, sparkDays, onRemove }) => {
  return (
    <div
      className="flex items-center justify-between p-4 rounded-lg border border-gray-700/50 transition-colors hover:border-gray-600"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {username.charAt(0)}
        </div>
        <div>
          <p className="text-white font-medium text-sm">{username}</p>
          {sparkDays !== undefined && (
            <div className="flex items-center gap-1 mt-0.5">
              <Flame size={12} style={{ color: 'var(--accent)' }} />
              <span className="text-xs" style={{ color: 'var(--accent)' }}>{sparkDays}</span>
              <span className="text-xs text-gray-500">天</span>
            </div>
          )}
        </div>
      </div>

      <button
        className="p-2 text-gray-500 hover:text-red-400 transition-colors"
        onClick={() => onRemove(username)}
        title="删除好友"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};

export default FriendCard;
