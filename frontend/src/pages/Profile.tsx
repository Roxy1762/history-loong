import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import ThemeSwitcher from '../components/ThemeSwitcher';
import LoginModal from '../components/LoginModal';

const AVATAR_EMOJIS = [
  '🐉','🦁','🐯','🦊','🐼','🦋','🌊','⚔️','🏯','📜',
  '🎭','🌸','🌙','⭐','🔥','💎','🪷','🎋','🍵','🦅',
];

const AVATAR_COLORS = [
  '#6366f1', '#7c3aed', '#db2777', '#dc2626', '#ea580c',
  '#ca8a04', '#16a34a', '#0891b2', '#0284c7', '#374151',
];

export default function Profile() {
  const navigate = useNavigate();
  const { user, loading, updateProfile, changePassword, logout } = useAuthStore();

  const [nickname, setNickname] = useState(user?.nickname || user?.username || '');
  const [avatarColor, setAvatarColor] = useState(user?.avatar_color || '#6366f1');
  const [avatarEmoji, setAvatarEmoji] = useState(user?.avatar_emoji || '🐉');
  const [profileError, setProfileError] = useState('');
  const [profileOk, setProfileOk] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdOk, setPwdOk] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);

  const [showLogin, setShowLogin] = useState(false);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(''); setProfileOk(false); setProfileLoading(true);
    const res = await updateProfile({ nickname, avatar_color: avatarColor, avatar_emoji: avatarEmoji });
    setProfileLoading(false);
    if (res.error) { setProfileError(res.error); return; }
    setProfileOk(true);
    setTimeout(() => setProfileOk(false), 2500);
  }

  async function handleChangePwd(e: React.FormEvent) {
    e.preventDefault();
    setPwdError(''); setPwdOk(false); setPwdLoading(true);
    const res = await changePassword(curPwd, newPwd);
    setPwdLoading(false);
    if (res.error) { setPwdError(res.error); return; }
    setPwdOk(true);
    setCurPwd(''); setNewPwd('');
    setTimeout(() => setPwdOk(false), 2500);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-page)' }}>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>加载中…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-page)' }}>
          <div className="text-center space-y-4 max-w-sm">
            <div className="text-4xl font-heading" style={{ color: 'var(--text-muted)' }}>登</div>
            <p className="text-lg font-heading font-bold" style={{ color: 'var(--text-primary)' }}>请先登录</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>登录账号以查看个人主页</p>
            <button className="btn-primary px-6 py-2.5 font-heading" onClick={() => setShowLogin(true)}>登录 / 注册</button>
            <div>
              <Link to="/" className="text-sm" style={{ color: 'var(--text-muted)' }}>返回首页</Link>
            </div>
          </div>
        </div>
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      </>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      {/* Header */}
      <header className="shadow-sm" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-heading font-bold text-base" style={{ color: 'var(--text-primary)' }}>个人主页</span>
          <ThemeSwitcher />
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Avatar preview */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-md flex-shrink-0"
              style={{ background: avatarColor }}
            >{avatarEmoji}</div>
            <div>
              <div className="font-heading font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{nickname || user.username}</div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>@{user.username}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>注册于 {new Date(user.created_at).toLocaleDateString('zh-CN')}</div>
            </div>
          </div>
        </div>

        {/* Edit profile */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h2 className="font-heading font-bold mb-4" style={{ color: 'var(--text-primary)' }}>编辑资料</h2>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="text-xs mb-1.5 block font-medium" style={{ color: 'var(--text-muted)' }}>昵称</label>
              <input
                className="input w-full"
                placeholder={user.username}
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                maxLength={20}
              />
            </div>

            <div>
              <label className="text-xs mb-1.5 block font-medium" style={{ color: 'var(--text-muted)' }}>头像图案</label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_EMOJIS.map(em => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setAvatarEmoji(em)}
                    className="w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all"
                    style={{
                      background: avatarEmoji === em ? avatarColor : 'var(--bg-muted)',
                      border: avatarEmoji === em ? `2px solid ${avatarColor}` : '2px solid transparent',
                      transform: avatarEmoji === em ? 'scale(1.1)' : 'scale(1)',
                    }}
                  >{em}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs mb-1.5 block font-medium" style={{ color: 'var(--text-muted)' }}>头像颜色</label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAvatarColor(c)}
                    className="w-7 h-7 rounded-full transition-all"
                    style={{
                      background: c,
                      outline: avatarColor === c ? `3px solid ${c}` : '3px solid transparent',
                      outlineOffset: '2px',
                      transform: avatarColor === c ? 'scale(1.15)' : 'scale(1)',
                    }}
                  />
                ))}
              </div>
            </div>

            {profileError && (
              <p className="text-xs py-1.5 px-3 rounded-lg" style={{ color: 'var(--seal-red)', background: 'color-mix(in srgb, var(--seal-red) 10%, transparent)' }}>
                {profileError}
              </p>
            )}
            {profileOk && (
              <p className="text-xs py-1.5 px-3 rounded-lg" style={{ color: '#16a34a', background: 'color-mix(in srgb, #16a34a 10%, transparent)' }}>
                保存成功！
              </p>
            )}

            <button type="submit" disabled={profileLoading} className="btn-primary w-full py-2.5 font-heading disabled:opacity-60">
              {profileLoading ? '保存中…' : '保存修改'}
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h2 className="font-heading font-bold mb-4" style={{ color: 'var(--text-primary)' }}>修改密码</h2>
          <form onSubmit={handleChangePwd} className="space-y-3">
            <input
              className="input w-full"
              type="password"
              placeholder="当前密码"
              value={curPwd}
              onChange={e => setCurPwd(e.target.value)}
              autoComplete="current-password"
            />
            <input
              className="input w-full"
              type="password"
              placeholder="新密码（至少 6 位）"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              autoComplete="new-password"
            />
            {pwdError && (
              <p className="text-xs py-1.5 px-3 rounded-lg" style={{ color: 'var(--seal-red)', background: 'color-mix(in srgb, var(--seal-red) 10%, transparent)' }}>
                {pwdError}
              </p>
            )}
            {pwdOk && (
              <p className="text-xs py-1.5 px-3 rounded-lg" style={{ color: '#16a34a', background: 'color-mix(in srgb, #16a34a 10%, transparent)' }}>
                密码修改成功！
              </p>
            )}
            <button type="submit" disabled={pwdLoading} className="btn-secondary w-full py-2.5 font-heading disabled:opacity-60">
              {pwdLoading ? '修改中…' : '修改密码'}
            </button>
          </form>
        </div>

        {/* Logout */}
        <button
          onClick={() => { logout(); navigate('/'); }}
          className="w-full py-3 rounded-2xl font-heading font-medium text-sm transition-colors"
          style={{ color: 'var(--seal-red)', background: 'color-mix(in srgb, var(--seal-red) 8%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--seal-red) 20%, transparent)' }}
        >
          退出登录
        </button>
      </div>
    </div>
  );
}
