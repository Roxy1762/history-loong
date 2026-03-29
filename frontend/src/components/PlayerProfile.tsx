import { useEffect, useState } from 'react';

interface PlayerAchievement {
  id: string;
  badge_type: string;
  label: string;
  desc: string;
  earned_at: string;
}

interface PlayerProfile {
  id: string;
  name: string;
  avatar_color: string;
  total_submitted: number;
  total_accepted: number;
  acceptanceRate: number;
  games_played: number;
  created_at: string;
  achievements: PlayerAchievement[];
}

interface Props {
  playerId: string;
  onClose: () => void;
}

export function PlayerProfile({ playerId, onClose }: Props) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/profile/${playerId}`);
        if (!res.ok) throw new Error('玩家不存在');
        const data = await res.json();
        setProfile(data.profile);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [playerId]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-card rounded-lg p-8 max-w-md w-full mx-4">
          <div className="animate-spin rounded-full h-8 w-8 border-brand border-t-transparent mx-auto"></div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-card rounded-lg p-8 max-w-md w-full mx-4">
          <p className="text-red-500">{error || '加载失败'}</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-lg max-w-md w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div
          className="bg-gradient-to-r from-brand to-brand-light p-6 text-white flex items-start justify-between"
          style={{ backgroundColor: profile.avatar_color }}
        >
          <div>
            <h2 className="text-2xl font-bold">{profile.name}</h2>
            <p className="text-sm opacity-80">加入于 {new Date(profile.created_at).toLocaleDateString('zh-CN')}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition text-xl"
          >
            ✕
          </button>
        </div>

        {/* Stats Grid */}
        <div className="p-6 border-b border-border grid grid-cols-2 gap-4">
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted mb-1">
              <span className="text-lg">🎯</span>
              <span className="text-xs font-semibold">通过率</span>
            </div>
            <p className="text-2xl font-bold text-primary">{profile.acceptanceRate.toFixed(1)}%</p>
          </div>

          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted mb-1">
              <span className="text-lg">✓</span>
              <span className="text-xs font-semibold">通过数</span>
            </div>
            <p className="text-2xl font-bold text-primary">{profile.total_accepted}</p>
          </div>

          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted mb-1">
              <span className="text-lg">📝</span>
              <span className="text-xs font-semibold">提交数</span>
            </div>
            <p className="text-2xl font-bold text-primary">{profile.total_submitted}</p>
          </div>

          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted mb-1">
              <span className="text-lg">🎮</span>
              <span className="text-xs font-semibold">游戏数</span>
            </div>
            <p className="text-2xl font-bold text-primary">{profile.games_played}</p>
          </div>
        </div>

        {/* Achievements */}
        {profile.achievements && profile.achievements.length > 0 && (
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">🏆</span>
              <h3 className="font-semibold text-primary">成就徽章</h3>
              <span className="ml-auto text-xs bg-brand/20 text-brand px-2 py-1 rounded">
                {profile.achievements.length} 个
              </span>
            </div>
            <div className="space-y-2">
              {profile.achievements.map((badge) => (
                <div
                  key={badge.id}
                  className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800"
                >
                  <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded text-yellow-600 dark:text-yellow-300 flex-shrink-0 text-lg">
                    ⭐
                  </div>
                  <div className="flex-grow">
                    <p className="font-semibold text-primary">{badge.label}</p>
                    <p className="text-sm text-muted">{badge.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-muted text-primary rounded-lg hover:bg-muted/80 transition font-medium"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
