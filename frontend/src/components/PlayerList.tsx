import type { Player } from '../types';

interface Props {
  players: Player[];
  me: Player | null;
}

export default function PlayerList({ players, me }: Props) {
  if (players.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {players.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium text-white shadow-sm"
          style={{ backgroundColor: p.color }}
          title={p.id === me?.id ? '（你）' : ''}
        >
          <span className="w-2 h-2 rounded-full bg-white/60 inline-block" />
          {p.name}
          {p.id === me?.id && <span className="text-white/70 text-xs">（你）</span>}
        </div>
      ))}
    </div>
  );
}
