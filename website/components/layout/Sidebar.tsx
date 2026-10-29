import {
  LayoutDashboard,
  Armchair,
  CalendarDays,
  MessageSquareWarning,
  ShieldCheck,
  Settings2,
  Users,
  Leaf,
  Scale,
} from 'lucide-react';
import { Brand } from '../common/Brand';
import { User } from '../../lib/model';
import { Page } from '../../lib/types';

interface SidebarProps {
  page: Page;
  setPage: (p: Page) => void;
  user: User;
}

export const navigationItems = [
  { id: 'overview' as const, label: '自习区概览', icon: LayoutDashboard },
  { id: 'reserve' as const, label: '预约座位', icon: Armchair },
  { id: 'bookings' as const, label: '我的预约', icon: CalendarDays },
  { id: 'report' as const, label: '违规举报', icon: MessageSquareWarning },
  { id: 'appeal' as const, label: '违规申诉', icon: Scale },
  { id: 'review' as const, label: '审核工作台', icon: ShieldCheck },
  { id: 'admin' as const, label: '管理工作台', icon: Settings2 },
  { id: 'account' as const, label: '我的账号', icon: Users },
];

export function Sidebar({ page, setPage, user }: SidebarProps) {
  const visibleItems = navigationItems.filter((n) => {
    if (user.role === 'student') {
      return !['review', 'admin'].includes(n.id);
    }
    if (user.role === 'reviewer') {
      return ['overview', 'review', 'account'].includes(n.id);
    }
    // admin
    return ['overview', 'bookings', 'review', 'admin', 'account'].includes(n.id);
  });

  return (
    <aside className="sidebar">
      <Brand />
      <div className="sidebar-label">校园自习区</div>
      <nav>
        {visibleItems.map((n) => {
          const isActive = page === n.id;
          const isDisabled = user.mustChangePassword && n.id !== 'account';
          const label = n.id === 'bookings' && user.role === 'admin' ? '全部预约' : n.label;
          return (
            <button
              className={isActive ? 'nav-item active' : 'nav-item'}
              key={n.id}
              onClick={() => setPage(n.id)}
              disabled={isDisabled}
            >
              <n.icon size={19} />
              <span>{label}</span>
              {n.id === 'appeal' && user.penalty?.banned && (
                <span className="nav-badge" title="当前账号存在违规，可发起申诉">
                  !
                </span>
              )}
              {isActive && <span className="nav-dot" />}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-note">
        <Leaf size={20} />
        <b>把时间，留给专注。</b>
        <p>
          安静 · 公平 · 自律
          <br />
          共同守护每一份专注
        </p>
      </div>

      <div className="sidebar-bottom">
        <span className="tiny-logo">议</span>
        <div>
          议事委员会<small>校园自习区管理</small>
        </div>
      </div>
    </aside>
  );
}
