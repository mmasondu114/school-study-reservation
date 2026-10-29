'use client';

import { useCallback, useEffect, useState } from 'react';
import { Info, X, MonitorSmartphone, ArrowUpRight } from 'lucide-react';
import { Settings, User } from '@/lib/model';
import { demoCall, demoSettings } from '@/lib/demo';
import { Call, CommonProps, Page } from '@/lib/types';

import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { MobileNav } from '@/components/layout/MobileNav';

import { LoginView } from '@/components/features/auth/LoginView';
import { OverviewView } from '@/components/features/overview/OverviewView';
import { ReserveView } from '@/components/features/reserve/ReserveView';
import { BookingsView } from '@/components/features/bookings/BookingsView';
import { ReportView } from '@/components/features/report/ReportView';
import { AppealListView } from '@/components/features/appeal/AppealListView';
import { ReviewView } from '@/components/features/review/ReviewView';
import { AdminView } from '@/components/features/admin/AdminView';
import { AccountView } from '@/components/features/account/AccountView';
import { FeedbackView } from '@/components/features/feedback/FeedbackView';

export default function Home() {
  const [local, setLocal] = useState(false);
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [demo, setDemo] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Settings>(demoSettings);
  const [page, setPage] = useState<Page>('overview');
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(0);

  const notify = useCallback((message: string) => setToast(message), []);

  const api = useCallback<Call>(
    async (action, input = {}) => {
      if (demo) return demoCall(action, input);
      const r = await fetch('/api/study', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, input }),
      });
      const result = (await r.json()) as { ok: boolean; message: string; data: any };
      if (!result.ok) {
        if (/请先登录|重新登录/.test(result.message)) setUser(null);
        throw new Error(result.message || '操作失败，请重试');
      }
      return result.data;
    },
    [demo],
  );

  useEffect(() => {
    let alive = true;
    fetch('/api/study')
      .then((r) => r.json() as Promise<{ ready: boolean; mode?: string }>)
      .then(async (c) => {
        if (!alive) return;
        setReady(c.ready);
        setLocal(c.mode === 'local');
        if (c.ready) {
          try {
            const me = await api('me');
            if (alive) {
              setUser(me.user);
              setSettings(me.settings);
              setPage(me.user.mustChangePassword ? 'account' : 'overview');
              setLastSync(Date.now());
            }
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setChecked(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const me = await api('me');
      setUser(me.user);
      setSettings(me.settings);
      setLastSync(Date.now());
      if (me.user.mustChangePassword) setPage('account');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }, [api, !user, notify]);

  useEffect(() => {
    refresh();
    if (!user) return;
    const t = setInterval(() => {
      if (!document.hidden) {
        refresh();
        setRevision((r) => r + 1);
      }
    }, 20000);
    return () => clearInterval(t);
  }, [refresh]);

  const updated = () => {
    setRevision((r) => r + 1);
    refresh();
  };

  const enterDemo = async () => {
    const me = (await demoCall('me')) as { user: User; settings: Settings };
    setDemo(true);
    setUser(me.user);
    setSettings(me.settings);
    setPage('overview');
    setLastSync(Date.now());
  };

  const enter = useCallback((u: User) => {
    setDemo(false);
    setUser(u);
    setPage(u.mustChangePassword ? 'account' : 'overview');
    setRevision((r) => r + 1);
  }, []);

  const logout = async () => {
    try {
      await api('logout');
    } catch {}
    setUser(null);
    setDemo(false);
    setPage('overview');
  };

  if (!user) {
    return (
      <>
        <LoginView
          local={local}
          ready={ready}
          checked={checked}
          api={api}
          enter={enter}
          demo={enterDemo}
          notify={notify}
        />
        {toast && (
          <div className="toast" role="status">
            <Info size={18} />
            {toast}
            <button onClick={() => setToast('')} aria-label="关闭提示">
              <X size={16} />
            </button>
          </div>
        )}
      </>
    );
  }

  const commonProps: CommonProps = {
    api,
    notify,
    updated,
    demo,
    user,
    settings,
    revision,
  };

  return (
    <div className="application">
      {/* 桌面端侧边栏 */}
      <Sidebar page={page} setPage={setPage} user={user} />

      {/* 工作区容器 */}
      <div className="workspace">
        <Topbar
          page={page}
          setPage={setPage}
          user={user}
          syncing={syncing}
          lastSync={lastSync}
          demo={demo}
          local={local}
          updated={updated}
          logout={logout}
        />

        {local && !demo && (
          <div className="demo-banner">
            <MonitorSmartphone size={16} />
            <span>本地环境已就绪 · 账号与预约保存在这台电脑，支持免外网运行。</span>
          </div>
        )}

        {demo && (
          <div className="demo-banner">
            <MonitorSmartphone size={16} />
            <span>你正在体验网站 · 预约仅保存在此浏览器，不会产生真实预约。</span>
            <button onClick={logout}>
              返回真实登录 <ArrowUpRight size={13} />
            </button>
          </div>
        )}

        <main className="content">
          {page === 'overview' && <OverviewView {...commonProps} go={setPage} />}
          {page === 'reserve' && <ReserveView {...commonProps} go={setPage} />}
          {page === 'bookings' && <BookingsView {...commonProps} />}
          {page === 'report' && <ReportView {...commonProps} />}
          {page === 'appeal' && <AppealListView {...commonProps} />}
          {page === 'review' && <ReviewView {...commonProps} />}
          {page === 'admin' && <AdminView {...commonProps} />}
          {page === 'feedback' && <FeedbackView {...commonProps} />}
          {page === 'account' && (
            <AccountView {...commonProps} logout={logout} onOpenAppeal={() => setPage('appeal')} />
          )}

          <footer className="page-footer">
            <span>自习之间 · 校园自习区议事委员会</span>
            <span>留一个座位，给专注的自己。</span>
          </footer>
        </main>
      </div>

      {/* 移动端底部悬浮导航 TabBar */}
      <MobileNav page={page} setPage={setPage} user={user} />

      {/* 全局 Toast 通知 */}
      {toast && (
        <div className="toast" role="status">
          <Info size={18} />
          {toast}
          <button onClick={() => setToast('')} aria-label="关闭提示">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
