/**
 * AvatarDisplay — unified avatar renderer for users and players.
 * Handles: image (avatar_url), emoji, text (initials from name), color-circle
 */

interface UserAvatarProps {
  type: 'user';
  avatarType?: string | null;   // 'image' | 'emoji' | 'text'
  avatarUrl?: string | null;
  avatarEmoji?: string | null;
  avatarColor?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

interface PlayerAvatarProps {
  type: 'player';
  color: string;
  name: string;
  size?: number;
  className?: string;
}

type AvatarProps = UserAvatarProps | PlayerAvatarProps;

function initials(name: string): string {
  const s = name.trim();
  if (!s) return '?';
  // Chinese: take first char; Latin: first letter of first two words
  if (/[\u4e00-\u9fa5]/.test(s[0])) return s[0];
  const words = s.split(/\s+/);
  return words.length > 1
    ? (words[0][0] + words[1][0]).toUpperCase()
    : s[0].toUpperCase();
}

export default function AvatarDisplay(props: AvatarProps) {
  const size = props.size ?? 32;
  const cls = props.className ?? '';
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: size * 0.28,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    fontSize: size * 0.48,
    fontWeight: 700,
    lineHeight: 1,
    userSelect: 'none',
  };

  if (props.type === 'player') {
    // Game-level player: colored initials
    return (
      <div
        className={cls}
        style={{
          ...style,
          background: props.color || '#6366f1',
          color: '#fff',
        }}
        title={props.name}
      >
        {initials(props.name)}
      </div>
    );
  }

  // User account avatar
  const { avatarType, avatarUrl, avatarEmoji, avatarColor, name } = props;
  const bgColor = avatarColor || '#6366f1';

  if (avatarType === 'image' && avatarUrl) {
    return (
      <div className={cls} style={style}>
        <img
          src={avatarUrl}
          alt={name || ''}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => {
            // Fallback to emoji on image load failure
            const el = e.currentTarget.parentElement;
            if (el) {
              el.innerHTML = `<span>${avatarEmoji || '🐉'}</span>`;
              (el as HTMLElement).style.background = bgColor;
            }
          }}
        />
      </div>
    );
  }

  if (avatarType === 'emoji') {
    return (
      <div
        className={cls}
        style={{ ...style, background: bgColor, color: '#fff' }}
        title={name || undefined}
      >
        <span style={{ fontSize: size * 0.55, lineHeight: 1 }}>{avatarEmoji || '🐉'}</span>
      </div>
    );
  }

  // 'text' or default: colored initials
  return (
    <div
      className={cls}
      style={{ ...style, background: bgColor, color: '#fff' }}
      title={name || undefined}
    >
      {initials(name || avatarEmoji || '?')}
    </div>
  );
}
