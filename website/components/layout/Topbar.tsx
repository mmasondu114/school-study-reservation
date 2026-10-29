import {
  ChevronRight,
  RefreshCw,
  LogOut,
  MessageSquare,
} from 'lucide-react';
import { User, stamp } from '../../lib/model';
import { Page } from '../../lib/types';
import { navigationItems } from './Sidebar';
import { ThemeToggle } from '../common/ThemeToggle';

interface TopbarProps {
  page: Page;
  setPage: (p: Page) => void;
  user: User;
  syncing: boolean;
  lastSync: number;
  demo: boolean;
  local: boolean;
  updated: () => void;
  logout: () => void;
}

const roleNames = { student: '学生', reviewer: '审核员', admin: '管理员' };

export function Topbar({
  page,
  setPage,
  user,
  syncing,
  lastSync,
  demo,
  local,
  updated,
  logout,
}: TopbarProps) {
  const currentNav = navigationItems.find((n) => n.id === page);
  const pageTitle = page === 'feedback' ? '问题反馈' : currentNav?.label || '';

  return (
    <header className="topbar">
      <div className="breadcrumb">
        校园自习区 <ChevronRight size={14} />
        <strong>{pageTitle}</strong>
      </div>

      <div className="topbar-right">
        {/* 深色模式护眼切换 */}
        <ThemeToggle />

        {/* 问题反馈按钮 */}
        <button
          className="feedback-button"
          onClick={() => setPage('feedback')}
          disabled={user.mustChangePassword}
        >
          <MessageSquare size={15} />
          <span>问题反馈</span>
        </button>

        {/* 数据刷新 */}
        <button
          className="sync-button"
          onClick={updated}
          title={lastSync ? '上次更新 ' + stamp(lastSync) : '刷新'}
        >
          <RefreshCw size={14} className={syncing ? 'spin' : ''} />
          <span>{demo ? '本地演示' : local ? '本机数据' : '刷新数据'}</span>
        </button>

        {/* 个人头像与角色 */}
        <button className="avatar-button" onClick={() => setPage('account')}>
          <span className="avatar">{user.name.slice(-2)}</span>
          <span>
            {user.name}
            <small>{roleNames[user.role]}</small>
          </span>
        </button>

        {/* 登出 */}
        <button className="icon-button" onClick={logout} aria-label="退出登录" title="退出登录">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
