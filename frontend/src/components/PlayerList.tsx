import type { Player } from '../types';

interface Props {
  players: Player[];
  me: Player | null;
}

export default function PlayerList({ players, me }: Props) {
  if (players.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {players.map(p => (
        <div
          key={p.id}
          title={p.id === me?.id ? '（你）' : ''}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white shadow-sm transition-transform hover:scale-105"
          style={{ backgroundColor: p.color }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-white/50" />
          {p.name}
          {p.id === me?.id && <span className="text-white/60 font-normal">你</span>}
        </div>
      ))}
    </div>
  );
}
