import { useEffect, useState } from 'react';
import { ShieldCheck, Eye, ArrowRight, Loader2, Scale } from 'lucide-react';
import { Report, reportStatus, seatLabel, time } from '../../../lib/model';
import { CommonProps } from '../../../lib/types';
import { Empty } from '../../common/Empty';
import { Loading } from '../../common/Loading';
import { Lightbox } from '../../common/Lightbox';
import { AppealListView } from '../appeal/AppealListView';

export function ReviewView(p: CommonProps) {
  const [subTab, setSubTab] = useState<'reports' | 'appeals'>('reports');
  const [items, setItems] = useState<Report[]>([]);
  const [pending, setPending] = useState(true);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [more, setMore] = useState(false);

  async function loadReports(reset = true) {
    setLoading(true);
    try {
      const d = await p.api('reports', { pending, offset: reset ? 0 : items.length });
      setItems((old) => (reset ? d.items : [...old, ...d.items]));
      setMore(d.items.length === 30);
    } catch (e) {
      p.notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (subTab === 'reports') loadReports(true);
  }, [pending, subTab, p.revision]);

  async function viewPhotos(r: Report) {
    try {
      const d = await p.api('evidenceUrls', { id: r.id });
      if (d.urls && d.urls.length > 0) {
        setLightboxImages(d.urls);
      } else {
        p.notify('未读取到照片凭证');
      }
    } catch (e) {
      p.notify((e as Error).message);
    }
  }

  async function decide(r: Report, decision: 'approve' | 'reject') {
    if (busy) return;
    const note = notes[r.id] || '';
    if (note.trim().length < 5) {
      return p.notify('请填写至少5字的审核意见');
    }

    setBusy(r.id);
    try {
      let confirmMsg = '确认驳回此举报？';
      if (decision === 'approve') {
        const preview = await p.api('previewPenalty', { reportId: r.id });
        confirmMsg = preview.message + '\n\n确认举报属实并执行处罚？';
      }
      if (!window.confirm(confirmMsg)) {
        setBusy('');
        return;
      }

      await p.api('review', { id: r.id, decision, note: note.trim() });
      p.notify('审核完成，处罚与额度已实时生效');
      p.updated();
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
          <span className="eyebrow">COMMITTEE / REVIEW</span>
          <h1>自习区审核工作台</h1>
          <p className="muted">先核对照片存证、时间段与当事人，再作出公正判断。</p>
        </div>
      </div>

      <div className="section-tabs main-tabs" role="tablist" aria-label="切换举报审核与申诉复核">
        <button
          role="tab"
          aria-selected={subTab === 'reports'}
          className={subTab === 'reports' ? 'active' : ''}
          onClick={() => setSubTab('reports')}
        >
          <ShieldCheck size={16} /> 举报审核
        </button>
        <button
          role="tab"
          aria-selected={subTab === 'appeals'}
          className={subTab === 'appeals' ? 'active' : ''}
          onClick={() => setSubTab('appeals')}
        >
          <Scale size={16} /> 违规申诉复核
        </button>
      </div>

      {subTab === 'appeals' ? (
        <AppealListView {...p} />
      ) : (
        <>
          <div className="section-tabs sub-tabs" role="tablist" aria-label="筛选待处理与全部记录">
            <button
              role="tab"
              aria-selected={pending}
              className={pending ? 'active' : ''}
              onClick={() => setPending(true)}
            >
              待处理举报
            </button>
            <button
              role="tab"
              aria-selected={!pending}
              className={!pending ? 'active' : ''}
              onClick={() => setPending(false)}
            >
              全部举报记录
            </button>
          </div>

          {loading && !items.length ? (
            <Loading text="正在读取待审核举报…" />
          ) : !items.length ? (
            <div className="panel">
              <Empty>暂时没有待处理的举报案件</Empty>
            </div>
          ) : (
            <div className="report-list">
              {items.map((r) => (
                <section className="panel" key={r.id}>
                  <div className="panel-heading">
                    <h3>{seatLabel(r.seat)} 号座位</h3>
                    <span className="pill">{reportStatus[r.status] || r.status}</span>
                  </div>

                  <p className="muted">
                    {r.date} · {time(r.start)} — {time(r.end)}
                    <br />
                    被举报学生：<b>{r.targetId}</b> · 举报学生：{r.ownerId}
                  </p>

                  <div className="reason-content">
                    <b>举报说明：</b> {r.reason}
                  </div>

                  <div className="evidence-action-row">
                    <button
                      type="button"
                      className="secondary small"
                      onClick={() => viewPhotos(r)}
                    >
                      <Eye size={14} /> 查看现场照片凭证
                    </button>
                  </div>

                  {r.status === 'pending' ? (
                    <div className="review-action-panel">
                      <label>
                        审核处理意见 <em>*</em>
                        <textarea
                          value={notes[r.id] || ''}
                          maxLength={300}
                          onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                          placeholder="客观记录核实依据（例如：照片核实有人占座离场、时间属实，至少5字）"
                        />
                      </label>
                      <div className="actions">
                        <button
                          type="button"
                          className="secondary"
                          disabled={!!busy}
                          onClick={() => decide(r, 'reject')}
                        >
                          驳回举报
                        </button>
                        <button
                          type="button"
                          className="primary"
                          disabled={!!busy}
                          onClick={() => decide(r, 'approve')}
                        >
                          {busy === r.id ? (
                            <Loader2 size={15} className="spin" />
                          ) : (
                            <>
                              确认成立并处罚 <ArrowRight size={15} />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    r.reviewNote && <div className="small-notice">审核意见：{r.reviewNote}</div>
                  )}
                </section>
              ))}
            </div>
          )}

          {more && (
            <button
              className="secondary load-more"
              disabled={loading}
              onClick={() => loadReports(false)}
            >
              加载更多
            </button>
          )}

          {/* Lightbox 照片全屏预览 */}
          {lightboxImages.length > 0 && (
            <Lightbox images={lightboxImages} onClose={() => setLightboxImages([])} />
          )}
        </>
      )}
    </>
  );
}
