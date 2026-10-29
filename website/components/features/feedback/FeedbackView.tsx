import { useEffect, useState, useRef, useId } from 'react';
import { Check, Star, ArrowRight, Loader2, MessageSquare } from 'lucide-react';
import { id, stamp } from '../../../lib/model';
import { CommonProps } from '../../../lib/types';
import { Empty } from '../../common/Empty';
import { Loading } from '../../common/Loading';

const ratingLabels = ['请选择评分', '很不满意', '不太满意', '一般', '满意', '非常满意'];

export type FeedbackItem = {
  id: string;
  ownerId: string;
  ownerName: string;
  rating: number;
  comment: string;
  createdAt: number;
};

export function FeedbackView(p: CommonProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(id());
  const commentTextareaId = useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!rating) {
      setError('请先选择1～5星评分');
      return;
    }
    if (p.demo) return;

    setBusy(true);
    setError('');
    try {
      await p.api('submitFeedback', {
        rating,
        comment,
        requestId: requestId.current,
      });
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="heading">
        <div>
          <span className="eyebrow">YOUR VOICE MATTERS</span>
          <h1>问题反馈与建议</h1>
          <p className="muted">这一次使用还顺利吗？你的感受会帮助我们持续改进自习空间。</p>
        </div>
      </div>

      {sent ? (
        <section className="panel feedback-success" role="status">
          <Check size={36} className="text-green" />
          <h2>谢谢，反馈已送达</h2>
          <p>你的评分和留言已妥善保存，管理员可在后台查阅并跟进改进。</p>
          <button
            className="secondary"
            onClick={() => {
              setSent(false);
              setRating(0);
              setComment('');
              requestId.current = id();
            }}
          >
            再写一条反馈
          </button>
        </section>
      ) : (
        <form className="panel feedback-form" onSubmit={submit}>
          <div className="panel-heading">
            <h3>为自习区体验打个分</h3>
            <span className="pill">1～5 星</span>
          </div>
          <p className="muted">选一个最符合你感受的星级，具体问题和改进建议可在下方选填。</p>

          <fieldset className="rating-field" disabled={busy || p.demo}>
            <legend>
              使用体验 <span>（必选）</span>
            </legend>
            <div className="rating-stars" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="rating-option" onMouseEnter={() => setHover(n)}>
                  <input
                    type="radio"
                    name="experience-rating"
                    value={n}
                    checked={rating === n}
                    onChange={() => {
                      setRating(n);
                      setError('');
                    }}
                    aria-label={`${n}星 · ${ratingLabels[n]}`}
                  />
                  <Star
                    size={38}
                    aria-hidden="true"
                    className={(hover || rating) >= n ? 'filled' : ''}
                  />
                </label>
              ))}
            </div>
            <p className="rating-caption" aria-live="polite">
              {ratingLabels[hover || rating]}
              {(hover || rating) > 0 && <span> · {hover || rating} / 5</span>}
            </p>
          </fieldset>

          <label htmlFor={commentTextareaId}>
            问题描述 / 体验建议 <span className="muted">（选填）</span>
          </label>
          <textarea
            id={commentTextareaId}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={5}
            placeholder="遇到问题或有改善自习室的想法？例如桌椅配置、插座损坏、网络稳定性、安静秩序等（最多1000字）"
            disabled={busy || p.demo}
          />
          <div className="feedback-meta">
            <span>提交后直接同步至自习室管理后台</span>
            <span>{comment.length} / 1000</span>
          </div>

          {error && <div className="warning">{error}</div>}

          <button className="primary feedback-submit" disabled={busy || p.demo}>
            {busy ? (
              <>
                <Loader2 size={16} className="spin" /> 正在提交…
              </>
            ) : (
              <>
                提交反馈 <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      )}
    </>
  );
}

export function FeedbackInbox(p: CommonProps) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);

  async function load(reset = true) {
    setLoading(true);
    try {
      const data = await p.api('feedbackList', { offset: reset ? 0 : items.length });
      setItems((old) => (reset ? data.items : [...old, ...data.items]));
      setMore(data.items.length === 30);
    } catch (e) {
      p.notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
  }, [p.revision]);

  return (
    <div className="feedback-inbox">
      <div className="panel-heading">
        <div>
          <h2>学生与读者反馈</h2>
          <p className="muted">按提交时间倒序呈现自习室体验评分与具体意见。</p>
        </div>
      </div>

      {loading && !items.length ? (
        <Loading text="正在拉取反馈列表…" />
      ) : !items.length ? (
        <div className="panel">
          <Empty>目前还没有用户提交反馈记录</Empty>
        </div>
      ) : (
        <div className="feedback-list">
          {items.map((fb) => (
            <article className="panel feedback-card" key={fb.id}>
              <div className="panel-heading">
                <h3>
                  {fb.ownerName} <small>{fb.ownerId}</small>
                </h3>
                <time>{stamp(fb.createdAt)}</time>
              </div>
              <div className="feedback-score">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    size={16}
                    aria-hidden="true"
                    className={i < fb.rating ? 'filled' : ''}
                  />
                ))}
                <b>{fb.rating} 星</b>
                <span>{ratingLabels[fb.rating]}</span>
              </div>
              {fb.comment && <div className="feedback-comment">{fb.comment}</div>}
            </article>
          ))}
        </div>
      )}

      {more && (
        <button className="secondary load-more" disabled={loading} onClick={() => load(false)}>
          加载更多反馈
        </button>
      )}
    </div>
  );
}
