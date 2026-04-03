import type { Player } from '../types';
import AvatarDisplay from './AvatarDisplay';

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
          title={p.id === me?.id ? `${p.name}（你）` : p.name}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold text-white shadow-sm transition-transform hover:scale-105"
          style={{ backgroundColor: p.color || '#6366f1' }}
        >
          <AvatarDisplay
            type="player"
            color={p.color || '#6366f1'}
            name={p.name}
            size={16}
            className="rounded-full opacity-90"
          />
          <span>{p.name}</span>
          {typeof p.lives === 'number' && (
            <span className={`text-[10px] px-1 py-0.5 rounded-full ${p.lives > 1 ? 'bg-white/20' : 'bg-red-500/70'}`}>
              ❤️ {p.lives}
            </span>
          )}
          {p.id === me?.id && <span className="text-white/70 font-normal text-[10px]">你</span>}
        </div>
      ))}
    </div>
  );
}
