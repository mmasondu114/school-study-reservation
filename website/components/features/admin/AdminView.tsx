import { useEffect, useRef, useState, useId } from 'react';
import { Search, Plus, Settings2, Users, MessageSquare, ClipboardList, Loader2 } from 'lucide-react';
import { User, hours, id, stamp, time } from '../../../lib/model';
import { CommonProps } from '../../../lib/types';
import { Empty } from '../../common/Empty';
import { FeedbackInbox } from '../feedback/FeedbackView';

const roleNames = { student: '学生', reviewer: '审核员', admin: '管理员' };
const actionNames: Record<string, string> = {
  penalty: '违规处罚',
  settings: '空间设置',
  createUser: '录入账号',
  cancel: '取消预约',
  role: '调整权限',
  resetPassword: '重置密码',
  appeal_approved: '申诉通过（撤销处罚）',
  appeal_rejected: '申诉驳回',
};

export function AdminView(p: CommonProps) {
  const [tab, setTab] = useState<'space' | 'users' | 'feedback' | 'audit'>('space');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [more, setMore] = useState(false);
  const addSeatsInputId = useId();
  const openSlotSelectId = useId();
  const closeSlotSelectId = useId();
  const noticeTextareaId = useId();

  const settingsId = useRef(id());
  const banIds = useRef<Record<string, string>>({});

  async function execute(action: string, input: any, message: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await p.api(action, input);
      p.notify(message);
      p.updated();
      return r;
    } catch (e) {
      p.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function searchUsers(reset = true) {
    try {
      const r = await p.api('users', { username: query, offset: reset ? 0 : users.length });
      setUsers((old) => (reset ? r.items : [...old, ...r.items]));
      setMore(!query && r.items.length === 30);
    } catch (e) {
      p.notify((e as Error).message);
    }
  }

  async function loadAudit(reset = true) {
    try {
      const r = await p.api('audit', { offset: reset ? 0 : logs.length });
      setLogs((old) => (reset ? r.items : [...old, ...r.items]));
      setMore(r.items.length === 30);
    } catch (e) {
      p.notify((e as Error).message);
    }
  }

  useEffect(() => {
    setMore(false);
    if (tab === 'users') searchUsers(true);
    if (tab === 'audit') loadAudit(true);
  }, [tab, p.revision]);

  async function saveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!window.confirm('确认保存自习室空间设置？新增座位将自 001 起连续编号，既有预约保持不变。')) {
      return;
    }
    const r = await execute(
      'settings',
      {
        addSeats: Number(f.get('addSeats')),
        openSlot: Number(f.get('openSlot')),
        closeSlot: Number(f.get('closeSlot')),
        notice: f.get('notice'),
        requestId: settingsId.current,
      },
      '自习室空间设置已更新并生效',
    );
    if (r) settingsId.current = id();
  }

  async function createUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await execute('createUser', Object.fromEntries(f), '新账号已保存并生效');
    if (r) form.reset();
  }

  async function toggleRole(u: User) {
    if (
      !window.confirm(
        `确认调整 ${u.name}(${u.id}) 的角色权限？提升为审核员将自动取消其未开始的自习预约。`,
      )
    ) {
      return;
    }
    await execute(
      'role',
      { username: u.id, role: u.role === 'student' ? 'reviewer' : 'student' },
      '权限已更新',
    );
  }

  async function resetStaffPassword(u: User) {
    const pwd = window.prompt(
      '请设置新的工作人员初始密码（至少10位，须包含字母和数字）。该账号下次登录须强制修改密码：',
    );
    if (!pwd) return;
    await execute('resetPassword', { username: u.id, password: pwd }, '工作人员密码已重置，原有会话已全部注销');
  }

  async function manualBan(u: User) {
    const reason = window.prompt(
      '请填写独立现场违规的事实与处理依据（至少5字）。已有举报案件请在审核台处理：',
    );
    if (!reason) return;
    try {
      const preview = await p.api('previewPenalty', { username: u.id });
      if (!window.confirm(preview.message + '\n\n确认登记并执行该违规处罚？')) return;
      const reqId = banIds.current[u.id] || (banIds.current[u.id] = id());
      const r = await execute('ban', { username: u.id, reason, requestId: reqId }, '现场违规处罚已执行并同步');
      if (r) delete banIds.current[u.id];
    } catch (e) {
      p.notify((e as Error).message);
    }
  }

  return (
    <>
      <div className="heading">
        <div>
          <span className="eyebrow">COMMITTEE / ADMINISTRATION</span>
          <h1>自习区管理工作台</h1>
          <p className="muted">统筹自习空间资源配置、账号权限与审计记录。</p>
        </div>
      </div>

      <div className="section-tabs" role="tablist" aria-label="管理工作台功能标签">
        {[
          ['space', '空间与座位设置'],
          ['users', '账号与权限管理'],
          ['feedback', '读者反馈'],
          ['audit', '操作审计日志'],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key as any)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'space' && (
        <form
          className="panel narrow-panel"
          key={p.settings.seatCount + '-' + p.settings.notice}
          onSubmit={saveSettings}
        >
          <div className="panel-heading">
            <h3>座位数量与开放时间</h3>
            <span className="pill">当前已有 {p.settings.seatCount} 席</span>
          </div>

          <label htmlFor={addSeatsInputId}>
            新增座位数量
            <input
              id={addSeatsInputId}
              name="addSeats"
              type="number"
              min="0"
              max="200"
              defaultValue="0"
              required
            />
          </label>
          <p className="form-hint">
            座位从 001 开始连续递增编号，单次最多增扩 200 席，总数上限 999 席。
          </p>

          <div className="form-grid">
            <label htmlFor={openSlotSelectId}>
              每日开放时间
              <select
                id={openSlotSelectId}
                name="openSlot"
                defaultValue={p.settings.openSlot}
              >
                {Array.from({ length: 48 }, (_, i) => (
                  <option key={i} value={i}>
                    {time(i)}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor={closeSlotSelectId}>
              每日结束时间
              <select
                id={closeSlotSelectId}
                name="closeSlot"
                defaultValue={p.settings.closeSlot}
              >
                {Array.from({ length: 48 }, (_, i) => i + 1).map((i) => (
                  <option key={i} value={i}>
                    {time(i)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label htmlFor={noticeTextareaId}>
            首页自习区公告
            <textarea
              id={noticeTextareaId}
              name="notice"
              defaultValue={p.settings.notice}
              maxLength={300}
              required
            />
          </label>

          <button className="primary" disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : '保存并实时同步'}
          </button>
        </form>
      )}

      {tab === 'feedback' && <FeedbackInbox {...p} />}

      {tab === 'users' && (
        <div className="admin-grid">
          <section>
            <form
              className="search-form"
              onSubmit={(e) => {
                e.preventDefault();
                searchUsers(true);
              }}
            >
              <Search size={18} />
              <input
                aria-label="搜索学生账号"
                placeholder="输入完整学工账号（例如 xjy900）"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button className="primary">查找</button>
            </form>

            {users.map((u) => (
              <div className="panel user-card" key={u.id}>
                <div className="panel-heading">
                  <h3>
                    {u.name} <small>{u.id}</small>
                  </h3>
                  <span className="pill">{roleNames[u.role] || u.role}</span>
                </div>
                <p className="muted">
                  本周剩余可用：{hours(u.quota.remaining)}h ·{' '}
                  {u.penalty?.banned ? '预约封禁中' : '权限正常'}
                </p>
                {u.role !== 'admin' && (
                  <div className="actions wrap">
                    <button
                      type="button"
                      className="secondary small"
                      disabled={busy}
                      onClick={() => toggleRole(u)}
                    >
                      {u.role === 'student' ? '授予审核员权限' : '撤销为普通学生'}
                    </button>
                    {u.authSource !== 'school' && (
                      <button
                        type="button"
                        className="secondary small"
                        disabled={busy}
                        onClick={() => resetStaffPassword(u)}
                      >
                        重置密码
                      </button>
                    )}
                    {u.role === 'student' && !u.penalty?.permanent && (
                      <button
                        type="button"
                        className="danger small"
                        disabled={busy}
                        onClick={() => manualBan(u)}
                      >
                        登记现场违规
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {!users.length && (
              <div className="panel">
                <Empty>未检索到匹配的账号</Empty>
              </div>
            )}

            {more && (
              <button className="secondary load-more" onClick={() => searchUsers(false)}>
                加载更多
              </button>
            )}
          </section>

          {/* 发放 / 录入账号 */}
          <form className="panel" onSubmit={createUser}>
            <h3>录入 / 发放账号</h3>
            <label>
              学工号 / 登录名
              <input name="username" maxLength={32} required placeholder="例如 student01" />
            </label>
            <label>
              真实姓名
              <input name="name" maxLength={30} required placeholder="例如 张同学" />
            </label>
            <label>
              角色权限
              <select name="role">
                <option value="reviewer">审核员（工作人员）</option>
                <option value="student">学生（测试学生）</option>
              </select>
            </label>
            <label>
              初始密码
              <input
                name="password"
                type="password"
                minLength={10}
                maxLength={100}
                autoComplete="new-password"
                required
                placeholder="至少10位，包含字母和数字"
              />
            </label>
            <p className="form-hint">
              真实学校账号等待接入统一身份认证。此处可用于添加审核工作人员或测试学生账号。
            </p>
            <button className="primary" disabled={busy}>
              {busy ? <Loader2 size={15} className="spin" /> : '保存账号'} <Plus size={16} />
            </button>
          </form>
        </div>
      )}

      {tab === 'audit' && (
        <div className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>操作类型</th>
                  <th>目标对象</th>
                  <th>经办人员</th>
                  <th>时间 / 处理说明</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <span className="pill neutral">{actionNames[l.action] || l.action}</span>
                    </td>
                    <td>{l.targetId || '—'}</td>
                    <td>{l.actorId}</td>
                    <td>
                      {stamp(l.createdAt)}
                      <small>{l.reason || l.penalty?.reason || l.note}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!logs.length && <Empty>暂无管理审计记录</Empty>}
          </div>

          {more && (
            <button className="secondary load-more" onClick={() => loadAudit(false)}>
              加载更多
            </button>
          )}
        </div>
      )}
    </>
  );
}
