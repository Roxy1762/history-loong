import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import ThemeSwitcher from '../components/ThemeSwitcher';
import LoginModal from '../components/LoginModal';
import { authUploadAvatar, authDeleteAvatar, getAuthSettings } from '../services/api';

const QUICK_EMOJIS = [
  '🐉','🦁','🐯','🦊','🐼','🦋','🌊','⚔️','🏯','📜',
  '🎭','🌸','🌙','⭐','🔥','💎','🪷','🎋','🍵','🦅',
];

const AVATAR_COLORS = [
  '#6366f1', '#7c3aed', '#db2777', '#dc2626', '#ea580c',
  '#ca8a04', '#16a34a', '#0891b2', '#0284c7', '#374151',
];

function daysUntilUsernameChange(changedAt: string | null, cooldownDays: number): number {
  if (!changedAt || cooldownDays <= 0) return 0;
  const ms = cooldownDays * 24 * 60 * 60 * 1000;
  const diff = ms - (Date.now() - new Date(changedAt).getTime());
  return diff > 0 ? Math.ceil(diff / (24 * 60 * 60 * 1000)) : 0;
}

/** Render an avatar consistently across the profile page */
function AvatarDisplay({
  user,
  size = 64,
  color,
  emoji,
  avatarType,
  previewUrl,
}: {
  user: { nickname: string | null; username: string; avatar_color: string; avatar_emoji: string; avatar_type: string; avatar_url?: string | null };
  size?: number;
  color?: string;
  emoji?: string;
  avatarType?: string;
  previewUrl?: string | null;
}) {
  const bg = color ?? user.avatar_color;
  const em = emoji ?? user.avatar_emoji;
  const type = avatarType ?? user.avatar_type ?? 'text';
  const url = previewUrl !== undefined ? previewUrl : user.avatar_url;
  const label = (user.nickname || user.username || '?')[0].toUpperCase();

  const style: React.CSSProperties = {
    width: size, height: size,
    borderRadius: Math.round(size * 0.25),
    background: bg,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: type === 'text' ? Math.round(size * 0.44) : Math.round(size * 0.52),
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  };

  if (type === 'image' && url) {
    return (
      <div style={style}>
        <img src={url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  if (type === 'emoji') {
    return <div style={style}>{em}</div>;
  }
  // 'text' — default
  return <div style={{ ...style, fontFamily: 'var(--font-heading, serif)' }}>{label}</div>;
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, token, loading, updateProfile, changePassword, logout, setUser } = useAuthStore();

  // Profile form state
  const [nickname, setNickname] = useState(user?.nickname || user?.username || '');
  const [avatarColor, setAvatarColor] = useState(user?.avatar_color || '#6366f1');
  const [avatarEmoji, setAvatarEmoji] = useState(user?.avatar_emoji || '🐉');
  const [avatarType, setAvatarType] = useState<'text' | 'emoji' | 'image'>(
    (user?.avatar_type as 'text' | 'emoji' | 'image') || 'text'
  );
  const [emojiInput, setEmojiInput] = useState(user?.avatar_emoji || '🐉');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [profileError, setProfileError] = useState('');
  const [profileOk, setProfileOk] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  // Password form
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdOk, setPwdOk] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);

  const [showLogin, setShowLogin] = useState(false);
  const [cooldownDays, setCooldownDays] = useState(30);

  useEffect(() => {
    getAuthSettings().then(s => setCooldownDays(s.cooldownDays)).catch(() => {});
  }, []);

  // Sync local state when user changes
  useEffect(() => {
    if (user) {
      setNickname(user.nickname || user.username || '');
      setAvatarColor(user.avatar_color);
      setAvatarEmoji(user.avatar_emoji);
      setEmojiInput(user.avatar_emoji);
      setAvatarType((user.avatar_type as 'text' | 'emoji' | 'image') || 'text');
      setPreviewUrl(null);
      setSelectedFile(null);
    }
  }, [user?.id]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(''); setProfileOk(false); setProfileLoading(true);

    // If image type and a new file is selected, upload first
    if (avatarType === 'image' && selectedFile && token) {
      const res = await authUploadAvatar(token, selectedFile);
      if ('error' in res) {
        setProfileError(res.error);
        setProfileLoading(false);
        return;
      }
      setUser(res.user);
      setSelectedFile(null);
      setPreviewUrl(null);
    } else if (avatarType !== 'image') {
      // If switching away from image, delete the stored avatar
      if (user?.avatar_type === 'image' && user.avatar_url && token) {
        await authDeleteAvatar(token);
      }
    }

    const finalEmoji = avatarType === 'emoji' ? emojiInput.trim() || '🐉' : avatarEmoji;
    const res = await updateProfile({
      nickname,
      avatar_color: avatarColor,
      avatar_emoji: finalEmoji,
      avatar_type: avatarType,
    });
    setProfileLoading(false);
    if (res.error) { setProfileError(res.error); return; }
    if (avatarType === 'emoji') setAvatarEmoji(finalEmoji);
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setAvatarType('image');
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

  const daysLeft = daysUntilUsernameChange(user.username_changed_at, cooldownDays);

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

        {/* Identity card */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-4">
            <AvatarDisplay
              user={user}
              size={64}
              color={avatarColor}
              emoji={avatarType === 'emoji' ? emojiInput || avatarEmoji : avatarEmoji}
              avatarType={avatarType}
              previewUrl={previewUrl !== null ? previewUrl : (avatarType === 'image' ? user.avatar_url : null)}
            />
            <div className="min-w-0">
              <div className="font-heading font-bold text-lg truncate" style={{ color: 'var(--text-primary)' }}>
                {nickname || user.username}
              </div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>@{user.username}</div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {user.uid != null && (
                  <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                    UID {user.uid}
                  </span>
                )}
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  注册于 {new Date(user.created_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            {user.last_login_at && (
              <div className="rounded-xl px-3 py-2" style={{ background: 'var(--bg-muted)' }}>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>上次登录</div>
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {new Date(user.last_login_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )}
            <div className="rounded-xl px-3 py-2" style={{ background: 'var(--bg-muted)' }}>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>累计登录</div>
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{user.login_count ?? 0} 次</div>
            </div>
          </div>
        </div>

        {/* Edit profile */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h2 className="font-heading font-bold mb-4" style={{ color: 'var(--text-primary)' }}>编辑资料</h2>
          <form onSubmit={handleSaveProfile} className="space-y-4">

            {/* Nickname */}
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

            {/* Avatar type selector */}
            <div>
              <label className="text-xs mb-1.5 block font-medium" style={{ color: 'var(--text-muted)' }}>头像类型</label>
              <div className="flex gap-2">
                {(['text', 'emoji', 'image'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAvatarType(t)}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                    style={{
                      background: avatarType === t ? 'var(--brand)' : 'var(--bg-muted)',
                      color: avatarType === t ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {t === 'text' ? '文字' : t === 'emoji' ? 'Emoji' : '图片'}
                  </button>
                ))}
              </div>
            </div>

            {/* Text avatar preview */}
            {avatarType === 'text' && (
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-muted)' }}>
                <AvatarDisplay user={user} size={48} color={avatarColor} avatarType="text" />
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>文字头像</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    自动取昵称首字，搭配下方颜色
                  </div>
                </div>
              </div>
            )}

            {/* Emoji picker */}
            {avatarType === 'emoji' && (
              <div className="space-y-2">
                <label className="text-xs font-medium block" style={{ color: 'var(--text-muted)' }}>Emoji 头像图案</label>
                {/* Free input */}
                <div className="flex items-center gap-2">
                  <input
                    className="input flex-1 text-xl"
                    placeholder="输入任意 Emoji"
                    value={emojiInput}
                    onChange={e => setEmojiInput(e.target.value)}
                    maxLength={8}
                  />
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: avatarColor }}
                  >{emojiInput || '?'}</div>
                </div>
                {/* Quick pick */}
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_EMOJIS.map(em => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setEmojiInput(em)}
                      className="w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all"
                      style={{
                        background: emojiInput === em ? avatarColor : 'var(--bg-muted)',
                        border: emojiInput === em ? `2px solid ${avatarColor}` : '2px solid transparent',
                        transform: emojiInput === em ? 'scale(1.1)' : 'scale(1)',
                      }}
                    >{em}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Image upload */}
            {avatarType === 'image' && (
              <div className="space-y-2">
                <label className="text-xs font-medium block" style={{ color: 'var(--text-muted)' }}>头像图片（JPG / PNG / GIF / WebP，最大 2 MB）</label>
                <div className="flex items-center gap-3">
                  <AvatarDisplay
                    user={user}
                    size={56}
                    avatarType="image"
                    previewUrl={previewUrl ?? user.avatar_url}
                  />
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="btn-secondary px-3 py-1.5 text-sm"
                    >
                      选择图片
                    </button>
                    {(previewUrl || user.avatar_url) && (
                      <button
                        type="button"
                        onClick={() => { setPreviewUrl(null); setSelectedFile(null); setAvatarType('emoji'); }}
                        className="text-xs px-2 py-1 rounded-lg transition-colors"
                        style={{ color: 'var(--seal-red)', background: 'color-mix(in srgb, var(--seal-red) 8%, var(--bg-muted))' }}
                      >
                        移除图片
                      </button>
                    )}
                  </div>
                  {selectedFile && (
                    <span className="text-xs truncate max-w-[120px]" style={{ color: 'var(--text-muted)' }}>{selectedFile.name}</span>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            )}

            {/* Color picker (for text and emoji) */}
            {avatarType !== 'image' && (
              <div>
                <label className="text-xs mb-1.5 block font-medium" style={{ color: 'var(--text-muted)' }}>头像背景色</label>
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
            )}

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

        {/* Username change (with cooldown) */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h2 className="font-heading font-bold mb-1" style={{ color: 'var(--text-primary)' }}>用户名</h2>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            {cooldownDays > 0
              ? `每 ${cooldownDays} 天可修改一次用户名。`
              : '用户名修改不限次数。'
            }
            当前：<span className="font-medium" style={{ color: 'var(--text-primary)' }}>@{user.username}</span>
          </p>
          {daysLeft > 0 ? (
            <div className="py-2 px-3 rounded-xl text-sm" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
              距下次可修改还有 <strong>{daysLeft}</strong> 天
            </div>
          ) : (
            <UsernameChangeForm cooldownDays={cooldownDays} />
          )}
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

// ── Username change form (self-service, with cooldown) ────────────────────────

function UsernameChangeForm({ cooldownDays }: { cooldownDays: number }) {
  const { token } = useAuthStore();
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, setUser } = useAuthStore();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setErr(''); setOk(false); setLoading(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: trimmed }),
      });
      const data = await res.json();
      if (data.error) { setErr(data.error); setLoading(false); return; }
      if (data.user) setUser(data.user);
      setOk(true);
      setValue('');
      setTimeout(() => setOk(false), 2500);
    } catch {
      setErr('修改失败，请重试');
    }
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        className="input flex-1"
        placeholder={`新用户名（2–30 字符）`}
        value={value}
        onChange={e => setValue(e.target.value)}
        maxLength={30}
      />
      <button type="submit" disabled={loading || !value.trim()} className="btn-secondary px-4 font-heading disabled:opacity-50">
        {loading ? '…' : '修改'}
      </button>
      {err && <p className="absolute text-xs mt-9" style={{ color: 'var(--seal-red)' }}>{err}</p>}
      {ok && <p className="absolute text-xs mt-9" style={{ color: '#16a34a' }}>修改成功！</p>}
    </form>
  );
}
