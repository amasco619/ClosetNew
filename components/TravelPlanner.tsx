import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { getGarmentGroups } from '@/lib/database';
import type { OutfitSet } from '@/constants/types';
import {
  travelChoices, travelChecklist, travelGroupRevision, travelWardrobeRevision,
  type TravelAccess, type TravelActivity, type TravelLook, type TravelSlot,
} from '@/lib/travelCapsule';
import TravelPlannerView from './TravelPlannerView';

export default function TravelPlanner({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const owner = app.isAuthenticated && !app.profile.isGuest ? app.authenticatedUserId : null;
  const complete = app.appReady && !app.isLoading && !app.wardrobeHasMore &&
    app.wardrobeItems.length >= app.wardrobeTotalCount;
  const failed = app.startupError || app.dataUnavailable;
  const revision = JSON.stringify([owner, travelWardrobeRevision(app.activeWardrobeItems),
    app.outfitSets, app.profile, app.weather]);
  const [days, setDays] = useState(1);
  const [slots, setSlots] = useState<TravelSlot[]>([{ id: 'slot-1', day: 1, activity: 'casual' }]);
  const [selected, setSelected] = useState<string | null>('slot-1');
  const [access, setAccess] = useState<TravelAccess>('checking');
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [choices, setChoices] = useState<TravelLook[]>([]);
  const [packed, setPacked] = useState<string[]>([]);
  const [essentials, setEssentials] = useState<string[]>([]);
  const sequence = useRef(1);
  const request = useRef(0);
  const groupRevision = useRef<string | null>(null);
  const verifiedRevision = useRef<string | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const latest = useRef({ app, owner, revision, complete, failed, slots, selected });
  latest.current = { app, owner, revision, complete, failed, slots, selected };
  const identity = useRef(revision);
  if (identity.current !== revision) {
    identity.current = revision;
    request.current++;
    verifiedRevision.current = null;
    busy.current = false;
  }

  const clearProtected = useCallback(() => {
    setSlots(current => current.map(({ look, ...slot }) => slot));
    setPacked([]);
    setEssentials([]);
    setChoices([]);
    setNotice(null);
    verifiedRevision.current = null;
  }, []);
  const resetDraft = useCallback(() => {
    clearProtected();
    setDays(1);
    setSlots([{ id: 'slot-1', day: 1, activity: 'casual' }]);
    setSelected('slot-1');
  }, [clearProtected]);
  const close = useCallback(() => {
    request.current++;
    mounted.current = false;
    clearProtected();
    onClose();
  }, [clearProtected, onClose]);
  useFocusEffect(useCallback(() => () => { close(); }, [close]));
  useEffect(() => () => { mounted.current = false; request.current++; }, []);
  useEffect(() => {
    clearProtected();
    groupRevision.current = null;
    setAccess(owner ? 'checking' : 'sign-in');
  }, [revision, owner, clearProtected]);
  useEffect(() => {
    resetDraft();
  }, [owner, resetDraft]);

  // The ref guard hides protected output immediately, before effect cleanup.
  const allowed = !!owner && complete && !failed && app.isPremium && !app.entitlementUnavailable &&
    verifiedRevision.current === revision;

  async function verify(pick?: { key: string; reuse: boolean; slotId: string }) {
    if (busy.current) return;
    const start = latest.current;
    const version = ++request.current;
    const current = () => mounted.current && request.current === version &&
      latest.current.owner === start.owner && latest.current.revision === start.revision &&
      latest.current.complete && !latest.current.failed;
    if (!start.owner) { clearProtected(); setAccess('sign-in'); return; }
    if (start.failed) { clearProtected(); setAccess('failure'); setMessage('Your wardrobe could not be loaded. This is not a wardrobe gap.'); return; }
    if (!start.complete) { clearProtected(); setAccess('loading'); return; }
    busy.current = true;
    setAccess('checking');
    setMessage(null);
    try {
      const approved = await start.app.refreshPremiumEntitlement(true);
      if (!current()) return;
      if (!approved) {
        resetDraft();
        setAccess('not-entitled');
        return;
      }
      let groups;
      try {
        groups = await getGarmentGroups(start.owner);
      } catch {
        if (current()) { setAccess('failure'); setMessage('Could not verify garment-group membership. Retry before choosing or packing.'); }
        return;
      }
      if (!current()) return;
      const nextGroups = travelGroupRevision(groups);
      const changed = groupRevision.current !== null && groupRevision.current !== nextGroups;
      groupRevision.current = nextGroups;
      if (changed) {
        clearProtected();
        setMessage('Garment-group membership changed. Previous choices were cleared; please choose again.');
      }
      const slot = start.slots.find(s => s.id === (pick?.slotId ?? start.selected));
      let traditional: OutfitSet[] = [];
      let traditionalNotice: string | null = null;
      if (slot?.activity === 'traditional-event') {
        const result = await start.app.getStylingRecommendations('traditional');
        if (!current()) return;
        // Service reads its own groups; reconcile both read snapshots before exposing results.
        const after = await getGarmentGroups(start.owner);
        if (!current()) return;
        if (travelGroupRevision(after) !== nextGroups) {
          clearProtected();
          groupRevision.current = travelGroupRevision(after);
          setAccess('failure');
          setMessage('Garment-group membership changed during styling. Please retry.');
          return;
        }
        traditional = result.outfits;
        traditionalNotice = result.notice ?? null;
      }
      if (!current()) return;
      const available = slot ? travelChoices(slot.activity, latest.current.app.outfitSets,
        traditional, latest.current.app.activeWardrobeItems, groups, start.owner).map(look =>
        look.source === 'traditional' ? { ...look, notice: traditionalNotice ?? undefined } : look) : [];
      setChoices(available);
      setNotice(traditionalNotice);
      verifiedRevision.current = start.revision;
      setAccess('ready');
      if (pick && !changed) {
        const chosen = available.find(look => look.key === pick.key);
        if (!chosen) { setMessage('This look is no longer available. The slot remains unfilled.'); return; }
        const usedElsewhere = latest.current.slots.some(s => s.id !== pick.slotId && s.look?.key === chosen.key);
        if (usedElsewhere && !pick.reuse) { setMessage('Choose “Reuse this look” to use an assigned look again.'); return; }
        setSlots(existing => existing.map(s => s.id === pick.slotId ? { ...s, look: chosen } : s));
        setPacked([]); // checklist composition changed; do not retain stale tick marks
      }
    } catch {
      if (current()) {
        setAccess('unavailable');
        setMessage('Verification or styling is unavailable. Your draft is paused; please retry.');
      }
    } finally {
      if (request.current === version) busy.current = false;
    }
  }
  const verifyRef = useRef(verify);
  verifyRef.current = verify;
  const activity = slots.find(s => s.id === selected)?.activity;
  useEffect(() => {
    request.current++;
    busy.current = false;
    setChoices([]);
    setNotice(null);
    void verifyRef.current();
  }, [revision, complete, failed, selected, activity]);
  const hadPremium = useRef(app.isPremium);
  useEffect(() => {
    if (!owner) { clearProtected(); setAccess('sign-in'); return; }
    if (!app.isPremium && !app.entitlementUnavailable && hadPremium.current) {
      request.current++;
      busy.current = false;
      resetDraft();
      setAccess('not-entitled');
    }
    // An outage must not erase the fact that a protected draft was granted.
    if (!app.entitlementUnavailable) hadPremium.current = app.isPremium;
  }, [owner, app.isPremium, app.entitlementUnavailable, clearProtected, resetDraft]);
  useEffect(() => {
    // Bounded read-only freshness path for edits in another screen/session.
    const timer = setInterval(() => {
      const start = latest.current;
      const version = request.current;
      if (!start.owner || !start.complete || busy.current) return;
      void getGarmentGroups(start.owner).then(groups => {
        if (!mounted.current || version !== request.current || latest.current.revision !== start.revision) return;
        const next = travelGroupRevision(groups);
        if (groupRevision.current !== null && groupRevision.current !== next) {
          request.current++;
          clearProtected();
          groupRevision.current = next;
          setAccess('failure');
          setMessage('Garment-group membership changed. Previous choices were cleared; please retry.');
        }
      }).catch(() => {
        if (!mounted.current || version !== request.current || latest.current.revision !== start.revision) return;
        request.current++;
        verifiedRevision.current = null;
        setAccess('failure');
        setMessage('Could not verify garment-group membership. Please retry.');
      });
    }, 30000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        request.current++;
        busy.current = false;
        verifiedRevision.current = null;
        void verifyRef.current();
      }
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [clearProtected]);

  function edit(action: () => void) {
    if (!allowed || access !== 'ready') return;
    request.current++;
    busy.current = false;
    action();
  }
  const visibleAccess: TravelAccess = !owner ? 'sign-in' : failed || access === 'failure' ? 'failure' : !complete ? 'loading'
    : access === 'ready' && !allowed ? 'checking' : access;
  return <TravelPlannerView
    access={visibleAccess} message={message} notice={allowed ? notice : null}
    days={days} slots={allowed && access === 'ready' ? slots : []} selectedSlotId={selected}
    choices={allowed && access === 'ready' ? choices : []}
    checklist={allowed && access === 'ready' ? travelChecklist(slots, app.activeWardrobeItems) : []}
    packedIds={allowed ? packed : []} essentials={allowed ? essentials : []}
    onDays={value => edit(() => {
      if (!Number.isInteger(value) || value < 1 || value > 7) return;
      setDays(value);
      setSlots(existing => existing.filter(slot => slot.day <= value));
      setSelected(null);
      setChoices([]);
      setPacked([]);
    })}
    onAddSlot={(day: number, nextActivity: TravelActivity) => edit(() => {
      if (slots.length >= 28 || day < 1 || day > days) return;
      const id = `slot-${++sequence.current}`;
      setSlots(existing => [...existing, { id, day, activity: nextActivity }]);
      setSelected(id);
    })}
    onSelectSlot={id => edit(() => { setSelected(id); })}
    onRemoveSlot={id => edit(() => {
      setSlots(existing => existing.filter(slot => slot.id !== id));
      if (selected === id) { setSelected(null); setChoices([]); }
      setPacked([]);
    })}
    onAssign={(key, reuse) => {
      if (allowed && access === 'ready' && selected) void verify({ key, reuse, slotId: selected });
    }}
    onClearSlot={id => edit(() => {
      setSlots(existing => existing.map(({ look, ...slot }) => slot.id === id ? slot : { ...slot, look }));
      setPacked([]);
    })}
    onTogglePacked={id => edit(() => {
      if (travelChecklist(slots, app.activeWardrobeItems).some(item => item.id === id)) {
        setPacked(values => values.includes(id) ? values.filter(value => value !== id) : [...values, id]);
      }
    })}
    onToggleEssential={value => edit(() => setEssentials(values =>
      values.includes(value) ? values.filter(v => v !== value) : [...values, value]))}
    onRetry={() => {
      if (failed) app.retryInitialization();
      if (!complete) void app.loadAllWardrobeItems().catch(() => {
        if (mounted.current) { setAccess('failure'); setMessage('Could not load the full wardrobe. Please retry.'); }
      });
      void verifyRef.current();
    }}
    onClose={close}
    onSignIn={() => { close(); router.push('/sign-in'); }}
    onUpgrade={() => { close(); router.push('/premium'); }}
  />;
}
