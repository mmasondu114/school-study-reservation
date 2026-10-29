import { useEffect, useState } from 'react';
import { Armchair, ArrowRight, Clock3, DoorOpen, ShieldCheck } from 'lucide-react';
import { day, hours, seatLabel, time } from '../../../lib/model';
import { CommonProps, Page } from '../../../lib/types';
import { SeatCanvas, SeatItem } from './SeatCanvas';
import { TimelinePicker } from './TimelinePicker';
import { Loading } from '../../common/Loading';
import { Empty } from '../../common/Empty';

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

export function ReserveView(p: CommonProps & { go: (p: Page) => void }) {
  const [date, setDate] = useState(day());
  const [start, setStart] = useState(16);
  const [end, setEnd] = useState(18);
  const [selected, setSelected] = useState(0);
  const [seats, setSeats] = useState<SeatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // 初始化时段
  useEffect(() => {
    const nowSlot = Math.floor(((Date.now() + 28800000) % 86400000) / 1800000) + 1;
    const first = Math.max(p.settings.openSlot, nowSlot);
    if (first >= p.settings.closeSlot) {
      setDate(day(Date.now() + 86400000));
      setStart(p.settings.openSlot);
      setEnd(Math.min(p.settings.openSlot + 2, p.settings.closeSlot));
    } else {
      setStart(first);
      setEnd(Math.min(first + 2, p.settings.closeSlot));
    }
  }, [p.settings.openSlot, p.settings.closeSlot]);

  // 日期或时间变化时重置选中
  useEffect(() => setSelected(0), [date, start, end]);

  // 拉取座位可用性
  useEffect(() => {
    let alive = true;
    setLoading(true);
    p.api('availability', { date, start, end })
      .then((r) => {
        if (alive) {
          setSeats(r.seats);
          setSelected((old) =>
            r.seats.some((s: SeatItem) => s.number === old && !s.unavailable) ? old : 0,
          );
        }
      })
      .catch((e) => {
        if (alive) {
          setSeats([]);
          p.notify(e.message);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [date, start, end, p.api, p.revision, p.notify]);

  // 未来 7 天
  const days = Array.from({ length: 7 }, (_, i) => ({
    value: day(Date.now() + i * 86400000),
    label: i === 0 ? '今天' : i === 1 ? '明天' : day(Date.now() + i * 86400000).slice(5),
    weekday: weekdays[new Date(Date.now() + i * 86400000 + 28800000).getUTCDay()],
  }));

  const remaining =
    date >= day(Date.parse(p.user.quota.key + 'T00:00:00+08:00') + 7 * 86400000)
      ? p.user.nextQuota.remaining
      : p.user.quota.remaining;

  async function book() {
    if (busy || !selected) return;
    setBusy(true);
    try {
      await p.api('book', { date, start, end, seat: selected });
      p.notify(p.demo ? '演示预约成功，仅保存在本浏览器' : '预约成功，已为你保留座位');
      p.updated();
      p.go('bookings');
    } catch (e) {
      p.notify((e as Error).message);
      p.updated();
    } finally {
      setBusy(false);
    }
  }

  const durationMinutes = (end - start) * 30;
  const isQuotaInsufficient = remaining < durationMinutes;

  return (
    <>
      <div className="heading">
        <div>
          <span className="eyebrow">FIND YOUR PLACE</span>
          <h1>选一个喜欢的位置</h1>
          <p className="muted">可视化自习室平面图与时间轴 · 支持提前7天预约</p>
        </div>
      </div>

      <div className="reserve-layout">
        <section className="panel seat-panel">
          {/* 日期选择横向滑动条 */}
          <div className="date-tabs" role="tablist" aria-label="选择预约日期">
            {days.map((d) => (
              <button
                key={d.value}
                role="tab"
                aria-selected={date === d.value}
                className={date === d.value ? 'selected' : ''}
                onClick={() => setDate(d.value)}
              >
                <span>周{d.weekday}</span>
                <b>{d.label}</b>
              </button>
            ))}
          </div>

          {/* 交互式时间轴甘特组件 */}
          <TimelinePicker
            openSlot={p.settings.openSlot}
            closeSlot={p.settings.closeSlot}
            start={start}
            end={end}
            onChange={(s, e) => {
              setStart(s);
              setEnd(e);
            }}
            disabled={busy}
          />

          <div className="seat-heading">
            <h3>
              自习室平面图 <span>{seats.filter((s) => !s.unavailable).length} 席可约</span>
            </h3>
            <div className="legend">
              <span>
                <i className="available-legend" /> 可预约
              </span>
              <span>
                <i className="taken" /> 已被占用
              </span>
              <span>
                <i className="chosen" /> 当前选中
              </span>
            </div>
          </div>

          {/* 可视化自习室画布 */}
          {loading ? (
            <Loading text="正在同步座位实时占用状态…" />
          ) : !seats.length ? (
            <Empty>自习室暂未开放座位，请联系管理员配置</Empty>
          ) : (
            <SeatCanvas
              seats={seats}
              selectedSeat={selected}
              onSelectSeat={setSelected}
              disabled={busy}
            />
          )}

          <p className="form-hint text-center">
            💡 点击自习室桌椅即可快速选定 · 提交时将自动执行事务锁校验防并发超卖
          </p>
        </section>

        {/* 预约确认侧边卡片（移动端自适应为底部抽屉卡片） */}
        <aside className="reservation-summary booking-summary panel">
          <span className="eyebrow">YOUR NEXT FOCUS</span>
          <h2>预约确认</h2>

          <div className="selected-seat">
            <Armchair size={36} className={selected ? 'seat-chosen-glow' : ''} />
            <b>{selected ? seatLabel(selected) : '— — —'}</b>
            <span>{selected ? '号座位已选定' : '请点击左侧平面图选择座位'}</span>
          </div>

          <dl className="summary-dl">
            <div>
              <dt>自习日期</dt>
              <dd>{date}</dd>
            </div>
            <div>
              <dt>使用时段</dt>
              <dd>
                {time(start)} — {time(end)}
              </dd>
            </div>
            <div>
              <dt>计划时长</dt>
              <dd>
                <b>{(end - start) / 2}</b> 小时
              </dd>
            </div>
            <div>
              <dt>该周可用额度</dt>
              <dd className={isQuotaInsufficient ? 'text-danger' : ''}>
                {hours(remaining)} 小时
              </dd>
            </div>
          </dl>

          {isQuotaInsufficient && (
            <div className="small-warning">
              当前周剩余时长不足，本次预约需要 {hours(durationMinutes)} 小时。
            </div>
          )}

          {p.user.penalty.banned && (
            <div className="small-warning">
              账号当前处于违规封禁中，无法发起新预约。
            </div>
          )}

          <button
            className="primary wide reserve-confirm-btn"
            onClick={book}
            disabled={
              !selected ||
              busy ||
              loading ||
              p.user.penalty.banned ||
              isQuotaInsufficient
            }
          >
            {busy ? (
              '正在提交锁定…'
            ) : p.user.penalty.banned ? (
              '封禁期间不可预约'
            ) : isQuotaInsufficient ? (
              '额度不足'
            ) : (
              <>
                确认预约座位 <ArrowRight size={17} />
              </>
            )}
          </button>

          <p className="form-hint">
            未到开始时间前可在“我的预约”随时免费取消，时长全额返还。请自觉维护安静环境。
          </p>
        </aside>
      </div>
    </>
  );
}
