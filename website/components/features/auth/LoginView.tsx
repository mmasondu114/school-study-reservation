import { useState } from 'react';
import {
  MonitorSmartphone,
  LockKeyhole,
  Info,
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { Brand } from '../../common/Brand';
import { User } from '../../../lib/model';
import { Call } from '../../../lib/types';

interface LoginViewProps {
  local: boolean;
  ready: boolean;
  checked: boolean;
  api: Call;
  enter: (u: User) => void;
  demo: () => void;
  notify: (s: string) => void;
}

export function LoginView({
  local,
  ready,
  checked,
  api,
  enter,
  demo,
  notify,
}: LoginViewProps) {
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      const data = await api('webPasswordLogin', { username, password });
      setPassword('');
      enter(data.user);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-layout">
      {/* 视觉叙事侧 */}
      <section className="login-story">
        <Brand />
        <div className="story-copy">
          <span className="eyebrow">A LITTLE SPACE. A LOT OF POSSIBILITY.</span>
          <h1>
            留一个座位，
            <br />
            给专注的自己。
          </h1>
          <p>
            一本书，一束光，一段不被打扰的时光。
            <br />
            在这里，让每一份努力都有位置。
          </p>

          <div className="desk-scene" aria-hidden="true">
            <div className="scene-window">
              <i />
              <i />
            </div>
            <div className="scene-sun" />
            <div className="scene-desk" />
            <div className="scene-books" />
            <div className="scene-chair" />
            <div className="scene-plant" />
            <span>YOUR SPACE / 001</span>
          </div>
        </div>

        <div className="story-foot">
          <span>议事委员会 · 校园自习区</span>
          <span>安静 / 公平 / 自律</span>
        </div>
      </section>

      {/* 登录操作面板 */}
      <section className="login-panel">
        <div className="login-top">
          <span>
            <MonitorSmartphone size={15} />{' '}
            {local ? '本地账号登录 · 无需外部网络' : '学校统一账号认证'}
          </span>
          <span>校园自习空间</span>
        </div>

        <div className="login-box">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>欢迎来到自习之间</h2>
          <p className="muted">登录后，开启你的下一段专注之旅。</p>

          <div className="password-login-heading">
            <LockKeyhole size={17} /> 学校学工账号登录
          </div>

          {local && (
            <div className="connection-note">
              <Info size={17} />
              <span>本地自习区已就绪。支持测试学号与管理员快捷登录，数据保存在本机。</span>
            </div>
          )}

          {!ready && (
            <div className="connection-note">
              <Info size={17} />
              <span>
                {checked
                  ? '学校账号服务尚未接通。你可以先点击下方体验预约界面。'
                  : '正在检查服务连接…'}
              </span>
            </div>
          )}

          <form onSubmit={submit}>
            <label>
              学校学工号
              <input
                autoComplete="username"
                placeholder={local ? '例如 xjy900 或 test-student；快捷管理员可留空' : '例如 xjy900'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required={!local}
                maxLength={32}
                disabled={!ready}
              />
            </label>

            <label>
              账号密码
              <input
                autoComplete="current-password"
                type="password"
                placeholder="输入对应账号密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={100}
                disabled={!ready}
              />
            </label>

            <div className="login-helper">
              <span>使用学校原学工账号，无需二次注册</span>
              <button
                type="button"
                onClick={() => notify('学校账号密码由学校原系统管理，请联系管理员或教务处重置。')}
              >
                忘记密码？
              </button>
            </div>

            <button className="primary wide" disabled={!ready || busy}>
              {busy ? (
                <>
                  <Loader2 size={16} className="spin" /> 正在登录…
                </>
              ) : (
                <>
                  登录自习区 <ArrowRight size={18} />
                </>
              )}
            </button>

            <p className="form-hint">
              {local
                ? '提示：快捷管理员登录账号留空，直接输入管理员密码即可。'
                : '工作人员请使用管理员发放的账号密码登录。'}
            </p>
          </form>

          <div className="login-divider">
            <span>先熟悉一下这里</span>
          </div>

          <button className="secondary wide" onClick={demo}>
            免登录体验选座与自习 <ArrowUpRight size={17} />
          </button>

          <p className="privacy-note">
            <ShieldCheck size={14} /> 额度、预约与诚信记录归属于同一个学工账号
          </p>
        </div>

        <div className="login-bottom">
          STUDY COMMONS <span>每周 10 小时 · 30 分钟起约</span>
        </div>
      </section>
    </main>
  );
}
