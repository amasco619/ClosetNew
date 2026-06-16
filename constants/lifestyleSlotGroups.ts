/**
 * Asset-free module for lifestyle-gated slot group logic.
 *
 * Extracted here so it can be imported directly in Node/tsx test files
 * without triggering the PNG asset require() calls in wardrobeBlueprint.ts.
 *
 * wardrobeBlueprint.ts re-exports getLifestyleGatedSlots with the full
 * WardrobeSlot type via a thin wrapper.
 *
 * Group → profile field mapping
 *   active    → lifestyleActive  (slots with ID pattern *-act-*)
 *   brunch    → lifestyleBrunch  (slots with ID pattern *-brn-*)
 *   resort    → lifestyleEvents  (slots with ID pattern *-rsr-*)
 *   night-out → lifestyleEvents  (slots with ID pattern *-ngt-*)
 *
 * Resort and night-out are social/events occasions and therefore share the
 * lifestyleEvents threshold — there are no separate profile fields for them.
 */

export interface SlotLike {
  id: string;
  status: 'needed' | 'owned';
}

export interface LifestyleSlotGroupBase {
  lifestyle: 'active' | 'brunch' | 'resort' | 'night-out';
  label: string;
  slots: SlotLike[];
  isComplete: boolean;
}

export const LIFESTYLE_THRESHOLD = 30;

export function getLifestyleGatedSlots(
  slots: SlotLike[],
  lifestyleActive: number,
  lifestyleBrunch: number,
  lifestyleEvents: number,
): LifestyleSlotGroupBase[] {
  const groups: LifestyleSlotGroupBase[] = [];

  function addGroup(
    idFragment: string,
    lifestyle: LifestyleSlotGroupBase['lifestyle'],
    label: string,
  ): void {
    const all    = slots.filter(s => s.id.includes(idFragment));
    const needed = all.filter(s => s.status === 'needed');
    if (all.length === 0) return;
    if (needed.length > 0) {
      groups.push({ lifestyle, label, slots: needed.slice(0, 3), isComplete: false });
    } else {
      groups.push({ lifestyle, label, slots: [], isComplete: true });
    }
  }

  if (lifestyleActive >= LIFESTYLE_THRESHOLD) {
    addGroup('-act-', 'active', 'Active essentials');
  }

  if (lifestyleBrunch >= LIFESTYLE_THRESHOLD) {
    addGroup('-brn-', 'brunch', 'Brunch essentials');
  }

  if (lifestyleEvents >= LIFESTYLE_THRESHOLD) {
    addGroup('-rsr-', 'resort',    'Resort essentials');
    addGroup('-ngt-', 'night-out', 'Night-out essentials');
  }

  return groups;
}
