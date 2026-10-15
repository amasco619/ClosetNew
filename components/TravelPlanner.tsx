import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  // An outage changes AppContext's tier projection, not the underlying wardrobe.
  // Retain only the last authorized projection; it never bypasses the access gate.
  const catalogue = JSON.stringify([travelWardrobeRevision(app.activeWardrobeItems), app.outfitSets]);
  const [authorizedCatalogue, setAuthorizedCatalogue] = useState({ owner, catalogue });
  useEffect(() => {
    if (authorizedCatalogue.owner !== owner || (app.isPremium && !app.entitlementUnavailable)) {
      // Keep the last confirmed premium projection through an entitlement outage.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- This preserves an authorized snapshot while AppContext temporarily projects the free tier.
      setAuthorizedCatalogue({ owner, catalogue });
    }
  }, [authorizedCatalogue.owner, owner, catalogue, app.isPremium, app.entitlementUnavailable]);
  const revision = JSON.stringify([owner, travelWardrobeRevision(app.wardrobeItems),
    authorizedCatalogue.catalogue, app.profile, app.weather]);
  const [days, setDays] = useState(1);
  const [slots, setSlots] = useState<TravelSlot[]>([{ id: 'slot-1', day: 1, activity: 'casual' }]);
  const [selected, setSelected] = useState<string | null>('slot-1');
  const [access, setAccess] = useState<TravelAccess>('checking');
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [choices, setChoices] = useState<TravelLook[]>([]);
  const [packed, setPacked] = useState<string[]>([]);
  const [essentials, setEssentials] = useState<string[]>([]);
  const [verifiedRevision, setVerifiedRevision] = useState<string | null>(null);
  const sequence = useRef(1);
  const request = useRef(0);
  const groupRevision = useRef<string | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const latest = useRef({ app, owner, revision, complete, failed, slots, selected });
  useLayoutEffect(() => {
    latest.current = { app, owner, revision, complete, failed, slots, selected };
  }, [app, owner, revision, complete, failed, slots, selected]);
  useLayoutEffect(() => {
    request.current++;
    busy.current = false;
  }, [revision]);

  const clearProtected = useCallback(() => {
    setSlots(current => current.map(({ look, ...slot }) => slot));
    setPacked([]);
    setEssentials([]);
    setChoices([]);
    setNotice(null);
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
    // Clear the protected draft when its source data or owner changes; the
    // authorization check below hides it in the render that sees the change.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- This clears sensitive derived draft state after source identity changes.
    clearProtected();
    groupRevision.current = null;
    setAccess(owner ? 'checking' : 'sign-in');
  }, [revision, owner, clearProtected]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A draft must not survive switching account owners.
    resetDraft();
  }, [owner, resetDraft]);

  // The revision and access gates hide protected output before effects run.
  const allowed = !!owner && complete && !failed && app.isPremium && !app.entitlementUnavailable &&
    access === 'ready' && verifiedRevision === revision;

  const verify = useCallback(async (pick?: { key: string; reuse: boolean; slotId: string }) => {
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
      // The authority promise can resolve before React commits the restored
      // Premium projection. Its context update will restart this verification.
      if (!latest.current.app.isPremium || latest.current.app.entitlementUnavailable) return;
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
      if (slot?.activity === 'traditional-event' || start.slots.some(s => s.look?.source === 'traditional')) {
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
      const choicesFor = (activity: TravelActivity) => travelChoices(activity, latest.current.app.outfitSets,
        traditional, latest.current.app.activeWardrobeItems, groups, start.owner!).map(look =>
        look.source === 'traditional' ? { ...look, notice: traditionalNotice ?? undefined } : look);
      const available = slot ? choicesFor(slot.activity) : [];
      // Before reopening protected review, reconcile EVERY assignment with fresh
      // owned IDs, selected public candidates and authoritative relationships.
      const revalidated = new Map(start.slots.filter(s => s.look).map(s =>
        [s.id, choicesFor(s.activity).find(look => look.key === s.look!.key)]));
      setSlots(existing => existing.map(({ look, ...s }) => look ? { ...s, look: revalidated.get(s.id) } : s));
      if ([...revalidated.values()].some(look => !look)) setPacked([]);
      setChoices(available);
      setNotice(traditionalNotice);
      setVerifiedRevision(start.revision);
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
  }, [clearProtected, resetDraft]);
  const activity = slots.find(s => s.id === selected)?.activity;
  const hadPremium = useRef(app.isPremium);
  useEffect(() => {
    request.current++;
    busy.current = false;
    if (app.entitlementUnavailable) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Invalidate the last verified entitlement so restored access always triggers a new check.
      setVerifiedRevision(null);
      return;
    }
    // Let the confirmed-loss effect reset the draft; do not immediately
    // supersede that revocation with an automatic recovery request.
    if (!app.isPremium && hadPremium.current) return;
    void verify();
  }, [revision, complete, failed, selected, activity, app.isPremium, app.entitlementUnavailable, verify]);
  useEffect(() => {
    if (!owner) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Remove prior-owner data immediately after the account identity changes.
      clearProtected();
      return;
    }
    if (!app.isPremium && !app.entitlementUnavailable && hadPremium.current) {
      request.current++;
      busy.current = false;
      resetDraft();
      setAccess('not-entitled');
    }
  }, [owner, app.isPremium, app.entitlementUnavailable, clearProtected, resetDraft]);
  useEffect(() => {
    // An outage must not erase the fact that a protected draft was granted.
    if (!app.entitlementUnavailable) {
      hadPremium.current = app.isPremium;
    }
  }, [app.isPremium, app.entitlementUnavailable]);
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
        setAccess('failure');
        setMessage('Could not verify garment-group membership. Please retry.');
      });
    }, 30000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        request.current++;
        busy.current = false;
      void verify();
      }
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [clearProtected, verify]);

  function edit(action: () => void) {
    if (!allowed || access !== 'ready') return;
    request.current++;
    busy.current = false;
    action();
  }
  const visibleAccess: TravelAccess = !owner ? 'sign-in' : app.entitlementUnavailable ? 'unavailable' :
    failed || access === 'failure' ? 'failure' : !complete ? 'loading'
    : access === 'ready' && !allowed ? 'checking' : access;
  const visibleMessage = app.entitlementUnavailable
    ? 'Verification or styling is unavailable. Your draft is paused; please retry.'
    : message;
  return <TravelPlannerView
    access={visibleAccess} message={visibleMessage} notice={allowed ? notice : null}
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
      const start = latest.current;
      const version = ++request.current;
      const current = () => mounted.current && request.current === version &&
        latest.current.owner === start.owner && latest.current.revision === start.revision;
      busy.current = false;
      if (failed) app.retryInitialization();
      if (!complete) {
        setAccess('loading');
        void app.loadAllWardrobeItems().then(() => {
          if (current()) void verify();
        }).catch(() => {
          if (current()) { setAccess('failure'); setMessage('Could not load the full wardrobe. Please retry.'); }
        });
      } else {
        void verify();
      }
    }}
    onClose={close}
    onSignIn={() => { close(); router.push('/sign-in'); }}
    onUpgrade={() => { close(); router.push('/premium'); }}
  />;
}
