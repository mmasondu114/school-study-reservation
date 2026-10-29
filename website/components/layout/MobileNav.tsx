import {
  LayoutDashboard,
  Armchair,
  CalendarDays,
  ShieldCheck,
  Users,
  Settings2,
} from 'lucide-react';
import { User } from '../../lib/model';
import { Page } from '../../lib/types';

interface MobileNavProps {
  page: Page;
  setPage: (p: Page) => void;
  user: User;
}

export function MobileNav({ page, setPage, user }: MobileNavProps) {
  const isStudent = user.role === 'student';
  const isAdmin = user.role === 'admin';

  return (
    <nav className="mobile-nav" aria-label="移动端底部导航">
      <button
        className={page === 'overview' ? 'mobile-nav-item active' : 'mobile-nav-item'}
        onClick={() => setPage('overview')}
        disabled={user.mustChangePassword}
      >
        <LayoutDashboard size={20} />
        <span>概览</span>
      </button>

      {isStudent && (
        <button
          className={page === 'reserve' ? 'mobile-nav-item active' : 'mobile-nav-item'}
          onClick={() => setPage('reserve')}
          disabled={user.mustChangePassword}
        >
          <Armchair size={20} />
          <span>选座</span>
        </button>
      )}

      {(isStudent || isAdmin) && (
        <button
          className={page === 'bookings' ? 'mobile-nav-item active' : 'mobile-nav-item'}
          onClick={() => setPage('bookings')}
          disabled={user.mustChangePassword}
        >
          <CalendarDays size={20} />
          <span>预约</span>
        </button>
      )}

      {!isStudent && (
        <button
          className={page === 'review' ? 'mobile-nav-item active' : 'mobile-nav-item'}
          onClick={() => setPage('review')}
          disabled={user.mustChangePassword}
        >
          <ShieldCheck size={20} />
          <span>审核</span>
        </button>
      )}

      {isAdmin && (
        <button
          className={page === 'admin' ? 'mobile-nav-item active' : 'mobile-nav-item'}
          onClick={() => setPage('admin')}
          disabled={user.mustChangePassword}
        >
          <Settings2 size={20} />
          <span>管理</span>
        </button>
      )}

      <button
        className={page === 'account' ? 'mobile-nav-item active' : 'mobile-nav-item'}
        onClick={() => setPage('account')}
      >
        <Users size={20} />
        <span>我的</span>
      </button>
    </nav>
  );
}
