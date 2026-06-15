export type LifestyleKey = 'work' | 'casual' | 'events' | 'active' | 'brunch';

export const LIFESTYLE_OPTIONS: { label: string; value: number }[] = [
  { label: 'None', value: 0 },
  { label: 'Some', value: 20 },
  { label: 'Often', value: 40 },
  { label: 'Mostly', value: 60 },
];

export const LIFESTYLE_SCENARIOS: { key: LifestyleKey; label: string; desc: string }[] = [
  { key: 'work',   label: 'Work & Office',       desc: 'Professional and business settings' },
  { key: 'casual', label: 'Everyday Casual',     desc: 'Day-to-day errands and relaxed outings' },
  { key: 'events', label: 'Events & Nights Out', desc: 'Celebrations, dinners, and formal occasions' },
  { key: 'active', label: 'Active & Gym',         desc: 'Workouts, sport, and active days' },
  { key: 'brunch', label: 'Brunch & Social',      desc: 'Weekend brunches and social gatherings' },
];
