import { useState } from 'react';
import { hours, stamp } from '../../../lib/model';
import { CommonProps } from '../../../lib/types';
import { ShieldCheck, Scale, ArrowRight, Loader2 } from 'lucide-react';

const roleNames = { student: '学生', reviewer: '审核员', admin: '管理员' };

export function AccountView(
  p: CommonProps & { logout: () => void; onOpenAppeal?: () => void },
) {
  const [busy, setBusy] = useState(false);

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get('new') !== f.get('confirm')) {
      return p.notify('两次输入的新密码不一致，请重新输入');
    }
    setBusy(true);
    try {
      await p.api('changePassword', {
        oldPassword: f.get('old'),
        newPassword: f.get('new'),
      });
      p.notify('密码修改成功，请使用新密码重新登录');
      p.logout();
    } catch (e) {
      p.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const penalty = p.user.penalty;
  const isBanned = penalty?.banned;

  return (
    <>
      <div className="heading">
        <div>
          <span className="eyebrow">MY ACCOUNT</span>
          <h1>我的账号信息</h1>
          <p className="muted">身份、额度与使用规则，一目了然。</p>
        </div>
      </div>

      <div className="account-grid">
        {/* 基本资料与配额 */}
        <section className="panel">
          <div className="profile-header">
            <span className="avatar large">{p.user.name.slice(-2)}</span>
            <div>
              <h2>{p.user.name}</h2>
              <p className="muted">
                {p.user.id} · {roleNames[p.user.role]}
              </p>
            </div>
          </div>

          <dl className="summary-dl">
            <div>
              <dt>账号认证来源</dt>
              <dd>{p.user.authSource === 'school' ? '学校已有学工号' : '工作人员账号'}</dd>
            </div>
            <div>
              <dt>本周剩余可用额度</dt>
              <dd>
                <b>{hours(p.user.quota.remaining)}</b> / 10 小时
              </dd>
            </div>
            <div>
              <dt>已预约 / 使用时长</dt>
              <dd>{hours(p.user.quota.used)} 小时</dd>
            </div>
            <div>
              <dt>处罚扣除时长</dt>
              <dd className={p.user.quota.deducted > 0 ? 'text-danger' : ''}>
                {hours(p.user.quota.deducted)} 小时
              </dd>
            </div>
            <div>
              <dt>下周剩余初始额度</dt>
              <dd>{hours(p.user.nextQuota.remaining)} 小时</dd>
            </div>
          </dl>

          <div className="small-notice">
            使用学校原学工账号及原密码认证。所有时长扣费与诚信档案直接归属于该学工账号。
          </div>
        </section>

        {/* 预约权限与处罚规则 */}
        <section className="panel">
          <div className="panel-heading">
            <h3>预约权限与诚信档案</h3>
            <span className={'pill ' + (isBanned ? 'pill-red' : 'pill-green')}>
              {penalty?.permanent ? '永久封禁' : isBanned ? '封禁中' : '诚信正常'}
            </span>
          </div>

          {isBanned && (
            <div className="penalty-alert-box">
              <ShieldCheck size={20} className="text-danger" />
              <div>
                <b>
                  {penalty?.permanent
                    ? '已永久封禁预约权限'
                    : `恢复时间：${stamp(penalty.until)}`}
                </b>
                {penalty?.reason && <p className="muted">最近处罚原因：{penalty.reason}</p>}
                {p.user.role === 'student' && p.onOpenAppeal && (
                  <button className="text-button appeal-link-btn" onClick={p.onOpenAppeal}>
                    <Scale size={13} /> 对处罚有异议？发起违规申诉
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="rule-list">
            {[
              ['0级 · 首次警告', '封禁1天，扣当周5小时（终生仅1次）'],
              ['1级', '封禁3天，扣当周6小时；解封满7天降回基础'],
              ['2级', '封禁7天，扣当周10小时及下周5小时；解封满30天降至1级'],
              ['3级', '永久封禁预约权限，不可自动降级'],
            ].map(([a, b]) => (
              <div key={a} className="rule-item">
                <b>{a}</b>
                <span>{b}</span>
              </div>
            ))}
          </div>

          <p className="form-hint">
            处罚发生时先自动取消未来所有未开始预约并退还额度，再执行扣时。如遇误判可在“违规申诉”申请人工复查。
          </p>
        </section>

        {/* 修改密码（工作人员） */}
        {p.user.authSource !== 'school' && (
          <form className="panel" onSubmit={changePassword}>
            <h3>修改工作人员密码</h3>
            {p.user.mustChangePassword && (
              <div className="warning">
                安全提示：首次登录须先修改初始密码以解锁完整功能。
              </div>
            )}
            <label>
              原密码
              <input type="password" name="old" autoComplete="current-password" required />
            </label>
            <label>
              新密码
              <input
                type="password"
                name="new"
                minLength={10}
                maxLength={100}
                autoComplete="new-password"
                required
                placeholder="至少10位，必须包含字母和数字"
              />
            </label>
            <label>
              确认新密码
              <input
                type="password"
                name="confirm"
                autoComplete="new-password"
                required
                placeholder="再次输入新密码"
              />
            </label>
            <button className="primary" disabled={busy || p.demo}>
              {busy ? (
                <>
                  <Loader2 size={16} className="spin" /> 正在保存…
                </>
              ) : (
                <>
                  保存新密码并重新登录 <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
