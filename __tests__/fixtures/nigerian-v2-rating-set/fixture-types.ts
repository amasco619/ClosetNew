import type { EventBrief, ItemFacts, LookFacts } from '../../../lib/nigerianStyling/v2/types';

/** Null is an unknown observation, never a default false/empty/eligible value. */
type Observed<T> = { [K in keyof T]-?: Exclude<T[K], undefined> | null };

export type BlindLookFacts = Omit<Observed<LookFacts>, 'items' | 'brief' | 'v1'> & {
  items: Observed<ItemFacts>[];
  brief: Observed<EventBrief>;
  v1: LookFacts['v1'] | null;
};

export interface Citation {
  source: string;
  quote: string;
}

export interface BlindFixture {
  schemaVersion: 1;
  id: string;
  source: {
    document: string;
    sha256: string;
    passages: Record<string, string>;
  };
  lookFacts: BlindLookFacts;
  /** JSON-pointer paths to every non-null domain fact; IDs are scaffolding. */
  evidence: Record<string, Citation[]>;
  gaps: { path: string; reason: string; blocksRules: string[] }[];
}
