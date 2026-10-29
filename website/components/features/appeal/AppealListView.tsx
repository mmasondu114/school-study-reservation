import { useEffect, useState, useCallback } from 'react';
import { Scale, CheckCircle2, XCircle, Clock, Plus, ShieldCheck, Eye } from 'lucide-react';
import { Appeal, appealStatus, stamp } from '../../../lib/model';
import { CommonProps } from '../../../lib/types';
import { AppealModal } from './AppealModal';
import { Lightbox } from '../../common/Lightbox';
import { Empty } from '../../common/Empty';
import { Loading } from '../../common/Loading';

export function AppealListView(p: CommonProps) {
  const [items, setItems] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  const isStaff = p.user.role === 'admin' || p.user.role === 'reviewer';

  const load = useCallback(
    async (reset = true) => {
      setLoading(true);
      try {
        const data = await p.api('appeals', {
          pending: isStaff ? pendingOnly : false,
          offset: reset ? 0 : items.length,
        });
        setItems(reset ? data.items : [...items, ...data.items]);
      } catch (e) {
        p.notify((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [p.api, isStaff, pendingOnly, items.length, p.notify],
  );

  useEffect(() => {
    load();
  }, [pendingOnly, p.revision]);

  async function viewEvidence(appeal: Appeal) {
    try {
      const res = await p.api('evidenceUrls', { id: appeal.id });
      if (res.urls && res.urls.length > 0) {
        setLightboxImages(res.urls);
      } else {
        p.notify('该申诉未附带照片材料');
      }
    } catch (e) {
      p.notify((e as Error).message);
    }
  }

  async function decide(appeal: Appeal, decision: 'approve' | 'reject') {
    if (busy) return;
    const note = notes[appeal.id] || '';
    if (note.trim().length < 5) {
      p.notify('请填写至少5字的审核复核意见');
      return;
    }

    const actionText = decision === 'approve' ? '确认申诉成立，撤销该违规处罚并返还学时？' : '确认驳回该学生的申诉？';
    if (!window.confirm(actionText)) return;

    setBusy(appeal.id);
    try {
      await p.api('reviewAppeal', {
        id: appeal.id,
        decision,
        note: note.trim(),
      });
      p.notify(decision === 'approve' ? '申诉已通过，违规处罚已撤销' : '申诉已驳回');
      p.updated();
    } catch (e) {
      p.notify((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const hasActivePenalty = p.user.penalty && (p.user.penalty.banned || p.user.penalty.level >= 0);

  return (
    <>
      <div className="heading">
        <div>
          <span className="eyebrow">DISPUTE RESOLUTION</span>
          <h1>{isStaff ? '违规申诉复核' : '我的违规申诉'}</h1>
          <p className="muted">
            {isStaff
              ? '核查学生申诉理由与证明材料，公正复核处理'
              : '对不符合事实的处罚提出异议，保障自习公平'}
          </p>
        </div>

        {!isStaff && hasActivePenalty && (
          <button className="primary" onClick={() => setModalOpen(true)}>
            <Plus size={16} /> 提出新申诉
          </button>
        )}
      </div>

      {isStaff && (
        <div className="section-tabs" role="tablist" aria-label="筛选待处理与全部申诉">
          <button
            role="tab"
            aria-selected={pendingOnly}
            className={pendingOnly ? 'active' : ''}
            onClick={() => setPendingOnly(true)}
          >
            待复核申诉
          </button>
          <button
            role="tab"
            aria-selected={!pendingOnly}
            className={!pendingOnly ? 'active' : ''}
            onClick={() => setPendingOnly(false)}
          >
            全部申诉记录
          </button>
        </div>
      )}

      {!isStaff && !hasActivePenalty && (
        <div className="panel account-notice">
          <ShieldCheck size={22} className="text-green" />
          <div>
            <b>当前账号信用良好</b>
            <p>没有正在生效的违规处罚。若后续产生争议处罚，可在此提交复核申诉。</p>
          </div>
        </div>
      )}

      {loading && !items.length ? (
        <Loading text="正在读取申诉记录…" />
      ) : !items.length ? (
        <div className="panel">
          <Empty>暂无相关申诉记录</Empty>
        </div>
      ) : (
        <div className="appeal-list">
          {items.map((item) => (
            <section className="panel appeal-card" key={item.id}>
              <div className="panel-heading">
                <div className="appeal-header-left">
                  <span className="appeal-user">
                    <b>{item.ownerName}</b> <small>{item.ownerId}</small>
                  </span>
                  <span className="appeal-time muted">{stamp(item.createdAt)} 提出</span>
                </div>
                <span
                  className={`pill ${
                    item.status === 'approved'
                      ? 'pill-green'
                      : item.status === 'rejected'
                      ? 'pill-red'
                      : 'pill-ochre'
                  }`}
                >
                  {item.status === 'approved' && <CheckCircle2 size={13} />}
                  {item.status === 'rejected' && <XCircle size={13} />}
                  {item.status === 'pending' && <Clock size={13} />}
                  {appealStatus[item.status] || item.status}
                </span>
              </div>

              {/* 关联的处罚信息 */}
              <div className="appeal-penalty-info">
                <span>
                  针对处罚：<b>{item.penalty?.reason || '自习违规处罚'}</b>
                </span>
                {item.penalty?.level !== undefined && (
                  <span className="penalty-tag">{item.penalty.level}级处罚</span>
                )}
              </div>

              {/* 申诉事实陈述 */}
              <div className="appeal-reason-box">
                <b>申诉事实陈述：</b>
                <p>{item.reason}</p>
              </div>

              {/* 证明材料图片入口 */}
              {item.photos && item.photos.length > 0 && (
                <div className="appeal-photos-action">
                  <button
                    type="button"
                    className="secondary small"
                    onClick={() => viewEvidence(item)}
                  >
                    <Eye size={14} /> 查看学生证明材料 ({item.photos.length}张)
                  </button>
                </div>
              )}

              {/* 审核结果或审核操作 */}
              {item.status === 'pending' && isStaff ? (
                <div className="staff-review-box">
                  <label>
                    复核意见 <em>*</em>
                    <textarea
                      value={notes[item.id] || ''}
                      onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })}
                      placeholder="填写核查事实与复核结果（至少5字）"
                      maxLength={300}
                    />
                  </label>
                  <div className="actions">
                    <button
                      className="danger"
                      disabled={!!busy}
                      onClick={() => decide(item, 'reject')}
                    >
                      驳回申诉
                    </button>
                    <button
                      className="primary"
                      disabled={!!busy}
                      onClick={() => decide(item, 'approve')}
                    >
                      确认属实 · 撤销处罚
                    </button>
                  </div>
                </div>
              ) : (
                item.reviewNote && (
                  <div className="review-result-note">
                    <b>复核意见：</b>
                    <span>{item.reviewNote}</span>
                    {item.reviewedAt && (
                      <small className="muted">（{stamp(item.reviewedAt)}）</small>
                    )}
                  </div>
                )
              )}
            </section>
          ))}
        </div>
      )}

      {/* 发起申诉弹窗 */}
      {modalOpen && (
        <AppealModal
          common={p}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            setModalOpen(false);
            load(true);
          }}
        />
      )}

      {/* 照片 Lightbox 放大预览 */}
      {lightboxImages.length > 0 && (
        <Lightbox images={lightboxImages} onClose={() => setLightboxImages([])} />
      )}
    </>
  );
}
