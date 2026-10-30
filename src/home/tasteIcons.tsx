import { BookOpen, Clapperboard, Music, Trees, Tv, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { TasteOccasion } from '../../shared/taste';
import { personTint } from './homeView';

export const OCCASION_ICON: Record<TasteOccasion, LucideIcon> = {
  movie_night: Clapperboard,
  dinner_out: UtensilsCrossed,
  playlist: Music,
  tv_show: Tv,
  book_club: BookOpen,
  outing: Trees,
};

export function PersonDot({ name, size = 'h-8 w-8 text-sm', className = '' }: { name: string; size?: string; className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-medium text-ink ${size} ${className}`}
      style={{ backgroundColor: personTint(name) }}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
