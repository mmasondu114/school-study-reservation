import { useEffect, useState } from 'react';
import {
  CalendarDays,
  RefreshCw,
  Armchair,
  Clock3,
  ShieldCheck,
  MessageSquareWarning,
  ArrowRight,
  ArrowUpRight,
  Leaf,
  Scale,
} from 'lucide-react';
import { Booking, day, hours, seatLabel, stamp, time } from '../../../lib/model';
import { CommonProps, Page } from '../../../lib/types';

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

export function OverviewView(p: CommonProps & { go: (page: Page) => void }) {
  const [next, setNext] = useState<Booking | null>(null);

  useEffect(() => {
    let alive = true;
    p.api('bookings')
      .then((r) => {
        if (alive) {
          const upcoming = r.items
            .filter((b: Booking) => b.status === 'active' && b.endAt > Date.now())
            .sort((a: Booking, b: Booking) => a.startAt - b.startAt)[0] || null;
          setNext(upcoming);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [p.api, p.revision]);

  const quotaRatio = Math.min(100, Math.max(0, (p.user.quota.remaining / 600) * 100));

  return (
    <>
      <div className="heading">
        <div>
          <span className="eyebrow">A PLACE TO FOCUS</span>
          <h1>你好，{p.user.name}。</h1>
          <p className="muted">把忙碌留在门外，把时间留给自己。</p>
        </div>
        <div className="today-card">
          <CalendarDays size={20} />
          <span>
            {day().replaceAll('-', ' / ')}
            <small>星期{weekdays[new Date(Date.now() + 28800000).getUTCDay()]}</small>
          </span>
        </div>
      </div>

      <div className="summary-grid">
        {/* 周额度进度卡片 */}
        <section className="quota-summary">
          <div className="card-top">
            <span>本周可预约时长</span>
            <span>
              <RefreshCw size={12} /> 每周一更新
            </span>
          </div>
          <div className="quota-number">
            {hours(p.user.quota.remaining)}
            <span>/ 10 小时</span>
          </div>
          <div className="quota-track">
            <span style={{ width: `${quotaRatio}%` }} />
          </div>
          <div className="quota-meta">
            <span>
              已预约 {hours(p.user.quota.used)}h · 违规扣除 {hours(p.user.quota.deducted)}h
            </span>
            <button onClick={() => p.go('account')}>
              查看详情 <ArrowUpRight size={13} />
            </button>
          </div>
        </section>

        {/* 自习区座位 */}
        <section className="stat-card">
          <div className="stat-icon">
            <Armchair size={22} />
          </div>
          <span>自习区座位</span>
          <b>
            {p.settings.seatCount}
            <small> 个</small>
          </b>
          <p>配备独立电源与护眼台灯</p>
        </section>

        {/* 今日开放时间 */}
        <section className="stat-card">
          <div className="stat-icon ochre">
            <Clock3 size={22} />
          </div>
          <span>今日开放时段</span>
          <b className="opening-hours">
            {time(p.settings.openSlot)}
            <small> — {time(p.settings.closeSlot)}</small>
          </b>
          <p>30分钟为单位 · 最多提前7天</p>
        </section>
      </div>

      {/* 处罚警示横幅 */}
      {p.user.penalty?.banned && (
        <div className="warning">
          <ShieldCheck size={18} />
          <span>
            {p.user.penalty.permanent
              ? '当前账号已永久封禁自习预约权限。'
              : `预约权限封禁至 ${stamp(p.user.penalty.until)}。`}
            若有异议，你可以
          </span>
          <button className="text-button inline-appeal-btn" onClick={() => p.go('appeal')}>
            <Scale size={13} /> 发起违规申诉
          </button>
        </div>
      )}

      <div className="section-label">
        <h2>{p.user.role === 'student' ? '开始你的专注时光' : '委员会工作台'}</h2>
        <span>每一段时间，都值得认真对待</span>
      </div>

      {p.user.role === 'student' ? (
        <div className="home-actions">
          <div className="left-actions">
            <button className="action-tile" onClick={() => p.go('bookings')}>
              <span className="tile-icon">
                <CalendarDays size={24} />
              </span>
              <ArrowUpRight className="tile-arrow" size={19} />
              <h3>查看预约</h3>
              <p>查看安排，管理你的自习时间</p>
              <span className="tile-footer">
                我的自习日程 <ArrowRight size={16} />
              </span>
            </button>

            <button className="action-tile sand" onClick={() => p.go('report')}>
              <span className="tile-icon">
                <MessageSquareWarning size={24} />
              </span>
              <ArrowUpRight className="tile-arrow" size={19} />
              <h3>违规举报</h3>
              <p>提交照片与时段，维护秩序</p>
              <span className="tile-footer">
                让专注不被打扰 <ArrowRight size={16} />
              </span>
            </button>
          </div>

          <button className="reserve-feature" onClick={() => p.go('reserve')}>
            <span className="feature-top">
              FIND YOUR FAVORITE SPOT <ArrowUpRight size={22} />
            </span>
            <div className="feature-chair" aria-hidden="true">
              <span />
              <i />
              <b />
            </div>
            <div className="feature-copy">
              <small>平面图自由选位 · 时间轴直观选时</small>
              <h2>预约我的座位</h2>
              <p>选择一个喜欢的角落，安静地向前一点。</p>
              <span>
                去选座 <ArrowRight size={18} />
              </span>
            </div>
            <div className="feature-bottom">
              <span>平面图</span>
              <i />
              <span>30分钟起</span>
              <i />
              <span>实时可用</span>
            </div>
          </button>
        </div>
      ) : (
        <div className="staff-actions">
          <button className="action-tile" onClick={() => p.go('review')}>
            <ShieldCheck size={28} />
            <h3>举报与申诉审核</h3>
            <p>核实证据、公正处理、维护秩序与救济</p>
            <ArrowUpRight size={20} />
          </button>
          {p.user.role === 'admin' && (
            <button className="action-tile sand" onClick={() => p.go('admin')}>
              <Armchair size={28} />
              <h3>管理自习区</h3>
              <p>空间配置、开放时段、账号与违规管理</p>
              <ArrowUpRight size={20} />
            </button>
          )}
        </div>
      )}

      <div className="home-bottom">
        <section className="panel announcement">
          <div className="panel-heading">
            <h3>
              <Leaf size={18} />
              自习区公告
            </h3>
            <span className="pill">温馨提示</span>
          </div>
          <p>{p.settings.notice}</p>
        </section>

        <section className="panel next-session">
          <div className="panel-heading">
            <h3>下一段专注</h3>
            <button className="text-button" onClick={() => p.go('bookings')}>
              全部 <ArrowRight size={14} />
            </button>
          </div>
          {next ? (
            <div className="next-booking">
              <b>
                {seatLabel(next.seat)}
                <small>号座位</small>
              </b>
              <span>
                {next.date}
                <strong>
                  {time(next.start)} — {time(next.end)}
                </strong>
              </span>
            </div>
          ) : (
            <div className="next-empty">
              <CalendarDays size={23} />
              <span>暂时没有即将开始的预约</span>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
