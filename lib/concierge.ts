import type { OccasionTag } from '../constants/types';

export const CONCIERGE_OCCASIONS = [
  { id: 'work', label: 'Work', detail: 'An everyday work occasion, using your current style preferences.' },
  { id: 'date-dressy', label: 'Dressy date', detail: 'An elevated date look from pieces you own.' },
  { id: 'event', label: 'Event', detail: 'A dressed-up event or celebration today.' },
  { id: 'wedding', label: 'Wedding', detail: 'An occasion-ready look; no ceremony role is assumed.' },
  { id: 'traditional-event', label: 'Traditional occasion', detail: 'Explicit African-first guidance with confirmed coordinated sets where viable.' },
] as const satisfies readonly { id: OccasionTag; label: string; detail: string }[];

export type ConciergeOccasion = typeof CONCIERGE_OCCASIONS[number]['id'];
export interface ConciergeIntent { occasion: ConciergeOccasion }

export function parseConciergeIntent(value: unknown): ConciergeIntent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const occasion = (value as Partial<ConciergeIntent>).occasion;
  return CONCIERGE_OCCASIONS.some(option => option.id === occasion) ? { occasion: occasion! } : null;
}

export type ConciergeReadiness = 'loading' | 'failure' | 'insufficient' | 'empty' | 'ready';
export function conciergeReadiness(input: {
  failed: boolean;
  wardrobeComplete: boolean;
  loading: boolean;
  stylingComplete: boolean;
  itemCount: number;
  resultCount: number;
}): ConciergeReadiness {
  if (input.failed) return 'failure';
  if (input.loading || !input.wardrobeComplete || !input.stylingComplete) return 'loading';
  if (!input.itemCount) return 'insufficient';
  return input.resultCount ? 'ready' : 'empty';
}
