import { useEffect, useState } from 'react';
import { Star, Trophy, Medal, Zap } from 'lucide-react';

interface LeaderboardEntry {
  id: string;
  name: string;
  total_accepted: number;
  total_submitted: number;
  acceptance_rate: number;
  games_played: number;
  rank: number;
  achievements: Array<{
    badge_type: string;
    label: string;
    desc: string;
  }>;
}

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/profile');
        const data = await res.json();
        setEntries(data.leaderboard || []);
      } catch (err) {
        console.error('Failed to load leaderboard:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-brand border-t-transparent"></div>
      </div>
    );
  }

  const getBadgeIcon = (type: string) => {
    switch (type) {
      case 'first_concept':
        return <Zap className="w-4 h-4" />;
      case 'century_accepted':
        return <Star className="w-4 h-4" />;
      case 'five_games':
        return <Medal className="w-4 h-4" />;
      default:
        return <Trophy className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-2 text-primary">排行榜</h1>
        <p className="text-muted mb-8">全球玩家贡献排名</p>

        <div className="space-y-4">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-card border border-border rounded-lg p-4 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center gap-4">
                {/* Rank Badge */}
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand to-brand-light flex items-center justify-center text-white font-bold">
                    #{entry.rank}
                  </div>
                </div>

                {/* Name & Stats */}
                <div className="flex-grow">
                  <h3 className="text-lg font-semibold text-primary">{entry.name}</h3>
                  <div className="flex flex-wrap gap-6 mt-2 text-sm text-secondary">
                    <div>
                      <span className="font-semibold text-primary">{entry.total_accepted}</span>
                      <span className="text-muted"> 个通过</span>
                    </div>
                    <div>
                      <span className="font-semibold text-primary">{entry.acceptance_rate.toFixed(1)}%</span>
                      <span className="text-muted"> 通过率</span>
                    </div>
                    <div>
                      <span className="font-semibold text-primary">{entry.games_played}</span>
                      <span className="text-muted"> 场游戏</span>
                    </div>
                  </div>
                </div>

                {/* Achievements */}
                {entry.achievements && entry.achievements.length > 0 && (
                  <div className="flex-shrink-0 flex gap-2">
                    {entry.achievements.slice(0, 3).map((badge, idx) => (
                      <div
                        key={idx}
                        title={`${badge.label}: ${badge.desc}`}
                        className="p-2 rounded-full bg-yellow-100 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-300"
                      >
                        {getBadgeIcon(badge.badge_type)}
                      </div>
                    ))}
                    {entry.achievements.length > 3 && (
                      <div className="p-2 rounded-full bg-muted text-muted text-sm font-semibold">
                        +{entry.achievements.length - 3}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {entries.length === 0 && (
          <div className="text-center py-12">
            <Trophy className="w-16 h-16 mx-auto text-muted opacity-50 mb-4" />
            <p className="text-muted">暂无排行榜数据</p>
          </div>
        )}
      </div>
    </div>
  );
}
