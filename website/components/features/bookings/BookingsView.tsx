import { useCallback, useEffect, useState } from 'react';
import { Armchair, CalendarDays } from 'lucide-react';
import { Booking, hours, seatLabel, status, time } from '../../../lib/model';
import { CommonProps } from '../../../lib/types';
import { Empty } from '../../common/Empty';
import { Loading } from '../../common/Loading';

export function BookingsView(p: CommonProps) {
  const [items, setItems] = useState<Booking[]>([]);
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState('');
  const [cancelling, setCancelling] = useState<Booking | null>(null);

  const load = useCallback(
    async (reset = true) => {
      setLoading(true);
      try {
        const data = await p.api('bookings', {
          date,
          all: p.user.role === 'admin',
          offset: reset ? 0 : items.length,
        });
        setItems((old) => (reset ? data.items : [...old, ...data.items]));
        setMore(data.items.length === 30);
      } catch (e) {
        p.notify((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [p.api, date, p.user.role, items.length, p.notify],
  );

  useEffect(() => {
    load(true);
  }, [date, p.api, p.revision]);

  async function cancel(b: Booking) {
    if (busy) return;
    setBusy(b.id);
    try {
      await p.api('cancel', { id: b.id });
      setCancelling(null);
      p.updated();
      p.notify('预约已成功取消，额度已实时退回');
    } catch (e) {
      p.notify((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <div className="heading">
        <div>
          <span className="eyebrow">YOUR FOCUS, PLANNED</span>
          <h1>{p.user.role === 'admin' ? '全校自习预约记录' : '我的自习日程'}</h1>
          <p className="muted">每一段认真规划的时间，都在这里。</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h3>预约记录</h3>
          <div className="inline-controls">
            <input
              aria-label="筛选预约日期"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {date && (
              <button className="text-button" onClick={() => setDate('')}>
                清除
              </button>
            )}
          </div>
        </div>

        {!items.length && !loading ? (
          <Empty>还没有预约记录，去选一个喜欢的位置吧。</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>座位</th>
                  <th>日期 / 时间</th>
                  {p.user.role === 'admin' && <th>预约人</th>}
                  <th>时长</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span className="table-seat">
                        <Armchair size={18} />
                        {seatLabel(b.seat)}
                      </span>
                    </td>
                    <td>
                      {b.date}
                      <small>
                        {time(b.start)} — {time(b.end)}
                      </small>
                    </td>
                    {p.user.role === 'admin' && (
                      <td>
                        {b.ownerName}
                        <small>{b.ownerId}</small>
                      </td>
                    )}
                    <td>{hours(b.minutes)} h</td>
                    <td>
                      <span className={'pill ' + (b.status === 'cancelled' ? 'neutral' : '')}>
                        {status(b)}
                      </span>
                      {b.cancelReason && <small>{b.cancelReason}</small>}
                    </td>
                    <td>
                      {b.status === 'active' && b.startAt > Date.now() ? (
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={() => setCancelling(b)}
                        >
                          {busy === b.id ? '取消中…' : '取消预约'}
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {loading && <Loading />}

        {more && (
          <button className="secondary load-more" disabled={loading} onClick={() => load(false)}>
            加载更多
          </button>
        )}
      </div>

      {cancelling && (
        <div className="modal-backdrop" onClick={() => setCancelling(null)}>
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
            onClick={(e) => e.stopPropagation()}
          >
            <CalendarDays size={26} />
            <h2 id="cancel-title">取消这次自习预约？</h2>
            <p>
              {seatLabel(cancelling.seat)} 号座位 · {cancelling.date}
              <br />
              {time(cancelling.start)} — {time(cancelling.end)}
              <br />
              取消后将释放座位，时长退回预约所属周额度。
            </p>
            <div className="actions">
              <button
                className="secondary"
                disabled={!!busy}
                onClick={() => setCancelling(null)}
                autoFocus
              >
                保留预约
              </button>
              <button className="primary" disabled={!!busy} onClick={() => cancel(cancelling)}>
                {busy ? '正在取消…' : '确认取消'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
