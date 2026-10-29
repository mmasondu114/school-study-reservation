import { useEffect, useState, useId } from 'react';
import {
  ImagePlus,
  ShieldCheck,
  ArrowRight,
  X,
  Loader2,
} from 'lucide-react';
import { Report, day, reportStatus, seatLabel, time } from '../../../lib/model';
import { CommonProps } from '../../../lib/types';
import { encodePhoto } from '../../../lib/photo';
import { Empty } from '../../common/Empty';
import { Loading } from '../../common/Loading';

export function ReportView(p: CommonProps) {
  const [tab, setTab] = useState<'new' | 'history'>('new');
  const [items, setItems] = useState<Report[]>([]);
  const [more, setMore] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const seatInputId = useId();
  const dateInputId = useId();
  const startSelectId = useId();
  const endSelectId = useId();
  const reasonTextareaId = useId();

  const nowSlot = Math.floor(((Date.now() + 28800000) % 86400000) / 1800000);

  async function loadHistory(reset = true) {
    setLoading(true);
    try {
      const data = await p.api('reports', { offset: reset ? 0 : items.length });
      setItems((old) => (reset ? data.items : [...old, ...data.items]));
      setMore(data.items.length === 30);
    } catch (e) {
      p.notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'history') loadHistory(true);
  }, [tab, p.revision]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!files.length) {
      p.notify('请至少上传一张现场照片作为核实凭证');
      return;
    }
    if (p.demo) {
      p.notify('演示模式不提交举报，请连接学校后台后使用');
      return;
    }

    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const photos: string[] = [];
      for (const file of files) {
        const base64 = await encodePhoto(file);
        const uploaded = await p.api('uploadEvidence', { base64 });
        photos.push(uploaded.id);
      }

      await p.api('report', {
        seat: Number(form.get('seat')),
        date: form.get('date'),
        start: Number(form.get('start')),
        end: Number(form.get('end')),
        reason: form.get('reason'),
        photos,
      });

      setFiles([]);
      setTab('history');
      p.notify('已提交给审核员，处理结果可在“我的举报”中查看');
      p.updated();
    } catch (e) {
      p.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="heading">
        <div>
          <span className="eyebrow">CARE FOR OUR COMMON SPACE</span>
          <h1>共同维护自习秩序</h1>
          <p className="muted">提交真实、客观的现场违规存证，由工作人员核实处理。</p>
        </div>
      </div>

      <div className="section-tabs" role="tablist" aria-label="切换提交举报与我的举报">
        <button
          role="tab"
          aria-selected={tab === 'new'}
          className={tab === 'new' ? 'active' : ''}
          onClick={() => setTab('new')}
        >
          提交违规举报
        </button>
        <button
          role="tab"
          aria-selected={tab === 'history'}
          className={tab === 'history' ? 'active' : ''}
          onClick={() => setTab('history')}
        >
          我的举报记录
        </button>
      </div>

      {tab === 'new' ? (
        <div className="report-layout">
          <form className="panel report-form" onSubmit={submit}>
            <h3>发生了什么？</h3>
            <div className="form-grid">
              <label htmlFor={seatInputId}>
                座位号 <em>*</em>
                <input
                  id={seatInputId}
                  name="seat"
                  placeholder="例如 001"
                  type="number"
                  min="1"
                  max={p.settings.seatCount || 999}
                  required
                />
              </label>

              <label htmlFor={dateInputId}>
                发生日期 <em>*</em>
                <input
                  id={dateInputId}
                  name="date"
                  type="date"
                  defaultValue={day()}
                  min={day(Date.now() - 6 * 86400000)}
                  max={day()}
                  required
                />
              </label>

              <label htmlFor={startSelectId}>
                开始时间 <em>*</em>
                <select id={startSelectId} name="start" defaultValue={nowSlot}>
                  {Array.from({ length: 48 }, (_, n) => (
                    <option key={n} value={n}>
                      {time(n)}
                    </option>
                  ))}
                </select>
              </label>

              <label htmlFor={endSelectId}>
                结束时间 <em>*</em>
                <select id={endSelectId} name="end" defaultValue={nowSlot + 1}>
                  {Array.from({ length: 48 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {time(n)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label htmlFor={reasonTextareaId}>
              情况说明 <em>*</em>
              <textarea
                id={reasonTextareaId}
                name="reason"
                placeholder="请客观描述占座、喧哗等具体情况（至少5个字）"
                minLength={5}
                maxLength={300}
                required
              />
            </label>

            <label>
              现场照片 <em>*</em> <span className="muted">{files.length} / 3</span>
              <span className="photo-upload">
                <ImagePlus size={25} />
                <b>选择现场照片凭证</b>
                <small>JPG / PNG · 最多3张 · 自动压缩至合规大小</small>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  multiple
                  aria-label="选择现场照片"
                  onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 3))}
                />
              </span>
            </label>

            {files.map((file, i) => (
              <div className="file-row" key={i}>
                <span>{file.name}</span>
                <button
                  type="button"
                  aria-label={'移除' + file.name}
                  onClick={() => setFiles(files.filter((_, n) => n !== i))}
                >
                  <X size={15} />
                </button>
              </div>
            ))}

            <button className="primary" disabled={busy || p.demo}>
              {busy ? (
                <>
                  <Loader2 size={16} className="spin" /> 正在压缩上传…
                </>
              ) : (
                <>
                  提交给审核员 <ArrowRight size={17} />
                </>
              )}
            </button>
            {p.demo && <p className="form-hint">演示模式不上传照片、不产生真实举报。</p>}
          </form>

          <aside className="report-guidance">
            <ShieldCheck size={26} />
            <h3>有据可查，公正处理</h3>
            <ol>
              <li>
                <b>选准座位和时段</b>
                <p>系统将自动定位该时段的预约记录，普通学生无法查看其他学生身份。</p>
              </li>
              <li>
                <b>提供真实现场照片</b>
                <p>尽量拍摄违规占座物件或现场情况，照片仅供审核员核查用。</p>
              </li>
              <li>
                <b>审核复核机制</b>
                <p>审核员核实身份与事实后处理。若学生被误判，可通过“违规申诉”申请复核。</p>
              </li>
            </ol>
            <div className="small-notice">
              同一预约的多次举报只处罚一次。如无预约记录的现场违规，可通知值班管理员现场处理。
            </div>
          </aside>
        </div>
      ) : (
        <div className="report-list">
          {loading && !items.length ? (
            <Loading text="正在读取我的举报…" />
          ) : !items.length ? (
            <div className="panel">
              <Empty>暂无举报记录</Empty>
            </div>
          ) : (
            items.map((r) => (
              <div className="panel" key={r.id}>
                <div className="panel-heading">
                  <h3>{seatLabel(r.seat)} 号座位</h3>
                  <span className="pill">{reportStatus[r.status] || r.status}</span>
                </div>
                <p className="muted">
                  {r.date} · {time(r.start)} — {time(r.end)}
                </p>
                <p>{r.reason}</p>
                {r.reviewNote && <div className="small-notice">审核意见：{r.reviewNote}</div>}
              </div>
            ))
          )}
          {more && (
            <button className="secondary load-more" onClick={() => loadHistory(false)}>
              加载更多
            </button>
          )}
        </div>
      )}
    </>
  );
}
