import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Home,
  Users,
  History,
  Settings,
  LogIn,
  Sparkles,
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react';

export interface SidebarNavItem {
  to: string;
  icon: LucideIcon;
  label: string;
}

const defaultNavItems: SidebarNavItem[] = [
  { to: '/', icon: Home, label: '首页' },
  { to: '/friends', icon: Users, label: '好友' },
  { to: '/history', icon: History, label: '历史' },
  { to: '/settings', icon: Settings, label: '设置' },
  { to: '/login', icon: LogIn, label: '登录' },
];

interface SidebarProps {
  navItems?: SidebarNavItem[];
}

const Sidebar: React.FC<SidebarProps> = ({ navItems = defaultNavItems }) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <nav
      className={`flex flex-col items-center border-r border-gray-700/50 transition-all duration-200 flex-shrink-0 ${
        expanded ? 'w-32 py-4 gap-2' : 'w-16 py-4 gap-2'
      }`}
      style={{ backgroundColor: 'var(--bg-secondary)', height: '100%' }}
    >
      {/* Logo + 标题 */}
      <div className={`flex flex-col items-center ${expanded ? 'mb-3 px-2' : 'mb-4 p-2'}`} style={{ color: 'var(--accent)' }}>
        <Sparkles size={expanded ? 36 : 24} />
        {expanded && (
          <>
            <span className="text-base font-bold text-white mt-1">火花助手</span>
            <span className="text-[10px] text-gray-500 mt-0.5 text-center leading-tight">
              抖音自动续火花助手<br />
              <span className="text-gray-600">by uu</span>
            </span>
          </>
        )}
      </div>

      {/* 导航项 */}
      <div className="flex-1 flex flex-col items-center gap-0.5 w-full px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center rounded-lg transition-colors duration-200 w-full ${
                expanded ? 'px-2 py-1.5 gap-2' : 'p-2 justify-center'
              } ${
                isActive
                  ? 'text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/30'
              }`
            }
            style={({ isActive }) =>
              isActive ? { backgroundColor: 'var(--accent)' } : {}
            }
            title={item.label}
          >
            <item.icon size={expanded ? 24 : 18} />
            {expanded && (
              <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
            )}
          </NavLink>
        ))}
      </div>

      {/* 展开/折叠按钮 */}
      <div className="w-full px-2">
        <button
          className="flex items-center rounded-lg transition-colors duration-200 w-full text-gray-400 hover:text-white hover:bg-gray-700/30"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? '折叠侧栏' : '展开侧栏'}
        >
          <div className={`flex items-center w-full ${expanded ? 'px-2 py-1.5 gap-2' : 'p-2 justify-center'}`}>
            {expanded ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            {expanded && (
              <span className="text-xs font-medium whitespace-nowrap">收起侧栏</span>
            )}
          </div>
        </button>
      </div>
    </nav>
  );
};

export default Sidebar;
