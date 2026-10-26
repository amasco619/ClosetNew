# Amodka — Outfit Ideas, Blueprint and Travel Audit

**Scope:** Read-only source and documentation audit. No application code,
configuration, database, or workflow was changed. The only workspace output is
this requested report. No secrets were accessed or printed.

## A. Outfit Ideas, Blueprint and Home overlap

### What each surface does

| Surface | What it shows | Data source | Images |
|---|---|---|---|
| Outfit Ideas (`app/outfit-ideas.tsx:235-247,363-420`) | Profile-style-goal recipe groups, completion counts, saved/renamed groups, reactions/wear controls, and a “Your next smart buy” card. These are authored blueprint recipes, not the full generated daily look pool. | `recommendationSlots` and profile from `AppContext`; `generateRecommendedOutfitGroups` resolves recipes authored in `constants/outfitGroupsCore.ts`. A slot is “owned” only when the active wardrobe matches its category, subtype and colour; the owned status is then reflected in the recipe group. | Bundled `slot.sampleImage` illustrations, including for owned slots (`app/outfit-ideas.tsx:33-58,374`). The screen does not show the user's garment photos in these recipe cards. |
| Wardrobe Blueprint (`app/blueprint.tsx:91-101,142-175`) | Profile-specific slot map grouped by category, total and category completion, “Owned”/“Needed” states, plus Premium close-match hints and a slot highlight when navigated to with a `highlight` parameter. | The same `recommendationSlots`. Slot catalogue is selected from one of six authored profile blueprints; the user's active wardrobe determines whether each slot is owned. Premium close-match hints inspect `activeWardrobeItems` (`app/blueprint.tsx:161-169`). | The same bundled blueprint sample images (`app/blueprint.tsx:64-65`), not user photos. |
| Home “Blueprint” action (`app/(tabs)/index.tsx:554-563`) | A navigation shortcut to `/blueprint`; it does not calculate a separate recommendation. | Route only. | Icon only. |
| Home “Starter Recommendations” (`app/(tabs)/index.tsx:566-594`) | The first needed slot per category, shown as a short horizontal list when wardrobe data is complete and at least one slot is needed. | `starterRecommendations` is `getFirstNeededByCategory(recommendationSlots)` in `AppContext`; it selects the first needed slot in slot order. | Bundled `sampleImage` illustrations (`app/(tabs)/index.tsx:574-584`). |
| Home “Wardrobe Intelligence” / `WardrobeGapCard` (`app/(tabs)/index.tsx:380-395`, `components/WardrobeGapCard.tsx:15-77`) | Static guidance for a possible cold, rain, or combined weather-capability gap, with examples such as a warm coat or waterproof layer. It has no item cards or garment images. | Current weather, the active wardrobe and whether the engine found a valid Today's Pick. `diagnoseWeatherGap` checks user item metadata, not photos: warmth band, weight, fabric and rain-protective subtype (`lib/wardrobeGapDiagnosis.ts:56-77,97-127`). | Weather icon plus text/example pills only (`components/WardrobeGapCard.tsx:15-37,43-68`). |

The blueprint catalogue and the Home gap card both suggest what might be missing,
but they answer different questions. Blueprint is a persistent, style-goal
catalogue of authored wardrobe slots and completion recipes; the gap card is a
conditional diagnosis of why today's engine produced no valid look under
current weather. `WardrobeGapCard` is gated on that empty engine result and
weather evidence; it is not shown from category counts alone
(`lib/wardrobeGapDiagnosis.ts:97-127`).

The largest overlap is between the Blueprint screen, Home Starter
Recommendations, and Outfit Ideas' next-smart-buy card: all can surface needed
slots from the same blueprint. Outfit Ideas adds group-completion leverage;
Home shows one first-needed slot per category; Blueprint is the full map.
Wardrobe Intelligence can recommend a similar type of purchase, but it is not
derived from blueprint slot completion.

### How `computeNextSmartBuy` chooses

`computeNextSmartBuy` first creates the curated groups and keeps incomplete
ones (`constants/outfitGroupsCore.ts:400-403`). It counts, for each needed slot,
how many incomplete groups contain it, and how many groups it would finish
immediately because it is the group's only missing slot (`:405-419`). It picks
the slot with the largest direct-unlock count when any direct unlock exists;
otherwise it picks the most frequently appearing missing slot (`:421-447`).
Ties go to lower slot priority, then lexicographically lower slot ID
(`:428-432`). It does not score shopping products, prices, the generated outfit
pool, weather or the user's photo.

## B. Can the generator count new looks offline?

**Yes, as a local comparison of generated candidate pools.** The engine is
called locally with wardrobe/profile inputs; it does not need a provider, a
database, or garment images. The current app builds the pool through
`projectWardrobeForStyling(...).v37Items` followed by
`generateOutfitPool(...)` (`contexts/AppContext.tsx:2389-2394`).

A bounded experiment would:

1. Copy the current canonical wardrobe and create a synthetic hypothetical item
   with a unique ID and the metadata the engine needs.
2. Run `generateOutfitPool` once on the copied current wardrobe and once on the
   copy plus hypothetical item, using the same profile, mood, reactions, wear
   history, affinity, weather and Premium flag.
3. For each scenario, compare stable signatures made from scenario plus sorted
   unique component garment IDs. Count newly surfaced signatures in the second
   pool, and separately count how many include the hypothetical item.

`generateOutfitPool` returns up to 30 candidates per scenario; it currently
iterates the 12 configured scenarios (`constants/outfitRotation.ts:30-37,203-213`).
Thus the comparison entails **two full generator calls, or 24 scenario passes**
at the current scenario count. The function applies candidate filters and
scoring, including `scoreOutfitCombo` and `generateRationale`, before producing
the capped pool (`constants/outfitRotation.ts:516-605`). The input objects can
be copied; no database write or server call is needed.

This measures *newly surfaced candidates under the current pool cap*, not every
mathematically possible outfit. Adding an item can change hero selection and
push other candidates out of the capped pool, so the result should report both
new signatures and candidates containing the hypothetical ID, not claim a
complete combinatorial count. `applyDailyRotation` would only be needed if the
question were “how many would the user see today?” rather than “what new
candidates did the generator produce?” (`constants/outfitRotation.ts:646+`).
`generateOutfitsForItem` is a different, new-item-anchored preview API capped at
three suggestions; it does not compare the old and new pools
(`constants/outfitGenerator.ts:195-205,271-275`).

**On-device time:** the repository has no measured handset timing for this
two-run experiment. The existing local synthetic engine audit reports 40- and
100-item runs across all scenarios but records no elapsed times
(`docs/reports/recommendation-engine-audit-20261025.md:107-112`). An honest
device millisecond estimate therefore cannot be derived from the repository.
The workload is two synchronous, CPU-bound pool builds; directly running them
on the React Native UI thread may block rendering. Measure on a representative
lower-end device with realistic wardrobe sizes before choosing when or where to
run it. No engine or frozen file needs to change to perform that measurement.

## C. Travel planner, helper, section 37 and report

### What exists now

- The Outfits tab mounts `TravelPlanner` from a separate “Plan a travel capsule”
  action (`app/(tabs)/outfits.tsx:890-895`).
- `components/TravelPlanner.tsx` owns a temporary React-state draft. It requires
  a signed-in non-guest Premium account, complete wardrobe loading and a fresh
  successful entitlement check (`:13-18,90-123`). The UI supports 1–7 ordinal
  days and up to 28 activity slots. It validates selected looks against current
  owned item IDs, supports explicit reuse, and builds a deduplicated packing
  checklist. Closing, tab blur, account changes or source revisions clear the
  temporary state (`:56-84,251-320`).
- `components/TravelPlannerView.tsx` renders a scrollable modal with activity
  slots, current look photos through `GarmentTile`, coverage, packing ticks and
  separate optional essentials (`:155-164,310-475,517-580`). It explicitly says
  there is no destination forecast, future-day guarantee or packing
  optimisation (`:250-255`).
- `lib/travelCapsule.ts` is pure orchestration: exact scenario/source matching,
  owned-ID validation, stable look identity, coordinated-set disclosures,
  checklist derivation and input revisions (`:6-18,29-99`). Generic candidates
  come only from the current public `outfitSets`; Traditional candidates come
  from the dedicated Traditional styling service. It neither reads a hidden
  pool nor generates additional looks (`components/TravelPlanner.tsx:133-165`;
  `TECHNICAL.md:3124-3132`).
- The plan is in component memory only. There is no trip table or travel
  persistence migration in `supabase/migrations/`; dismissal or session loss
  discards it (`TECHNICAL.md:3163-3176`; `reports/p14-travel-capsule.html:69-77,105-110`).

### Weather input

`generateOutfitPool` accepts one optional `WeatherSnapshot` per invocation
(`constants/outfitRotation.ts:203-213`). The snapshot carries current/high/low
temperatures and precipitation probability (`constants/types.ts:75-85`); the
generator uses those values for outerwear and rain gates. It does not accept a
day-indexed forecast map. A caller could invoke it separately for each day with
that day's normalized snapshot, but that is not how TravelPlanner currently
works: the planner filters already-generated current `outfitSets`, and its
revision includes the app's current weather (`components/TravelPlanner.tsx:30-41;
TECHNICAL.md:3171-3175`).

The shared generator also derives season from the current system date and
defaults its scoring date to today (`constants/outfitRotation.ts:208-225`;
`constants/outfitScoring.ts:660`). A per-day weather value alone would
therefore not make future-date season or wear-history semantics date-aware.
That constraint needs to be addressed in an outer adapter or separately
approved interface, not by modifying a frozen engine file.

### Testing, unfinished scope and dormant code

`__tests__/travelCapsule.test.ts` covers exact activity/scenario mapping,
generic-vs-Traditional source separation, ownership and stale IDs, stable
identity, confirmed-set disclosures, checklist deduplication, coverage, input
immutability, and the planner's no-generation/no-persistence boundary. The
mounted `__tests__/travelCapsuleUi.test.ts` covers access checks, assignment,
reuse, unsupported/empty slots, checklist and essentials, group-read failures
and retry, entitlement/account/wardrobe changes, stale responses, and
blur/remount cleanup. The P1.4 report records 57 strict checks and 48 group
reads for the corrected mounted suite, plus focused suites, typecheck, lint and
a historical 35/35 golden result (`reports/p14-travel-capsule.html:79-90`).
That report explicitly says the full project suite was not rerun for that
milestone and the planner was not verified in a signed-in device journey
(`:92-111`).

The omitted parts—trip destination/brief, calendar dates, destination forecasts,
per-day generation, capsule optimisation, persistence/resume and full-coverage
guarantees—are documented scope boundaries, not partially implemented
behaviour (`TECHNICAL.md:3171-3180`; `reports/p14-travel-capsule.html:63-70,
105-111`). I found no unused travel module or unreferenced travel helper in
the inspected call paths. One visibly dormant extension hook is the optional
`onShopGap` prop on `WardrobeGapCard`; it is explicitly reserved for future
commerce and is not invoked (`components/WardrobeGapCard.tsx:8-13,76`).

If a trip is to be saved, the current in-memory state needs a persistence
contract and a new migration. The smallest option is an owner-scoped
`travel_plans` table containing a trip brief and JSON plan state: days/slots,
activity and look identifiers, packed garment IDs and optional-essentials
ticks. Store garment IDs rather than duplicate photos. The migration would
need a `user_id` foreign key to `auth.users` with account-deletion cleanup,
`created_at`/`updated_at`, RLS enabled, and authenticated-only CRUD grants and
owner policies (`auth.uid() = user_id`). Reads must revalidate saved garment
IDs against the current wardrobe so removed items do not appear as owned.
No new image bucket is needed. If the plan is later normalised into child
tables, those tables also need parent-owner RLS checks and deletion semantics.
This is a proposal only; no SQL was run or written.

## D. Smallest staged plan

1. **Trip brief:** add destination and start/end dates (or an explicit
   date-range/time-zone contract) to the existing temporary draft. Keep it
   session-only; do not call a forecast provider yet.
2. **Per-day forecast:** add a separate forecast adapter that resolves the
   destination and requests daily values for the chosen dates. Normalize each
   day into the existing weather inputs; explicitly handle unavailable or
   out-of-range forecast days. Keep the existing engine frozen and do not
   silently substitute the user's current-location weather.
3. **Capsule optimisation:** run the existing candidate generator once per
   day using the day's snapshot, then use a new, separately tested orchestration
   layer to select coverage while minimising distinct owned garments. Make
   coverage and reuse explicit; do not imply a complete capsule when candidates
   are missing. Benchmark device time and preserve engine/golden checksums.
4. **Saved checklist:** after the brief and slot format stabilise, add the
   owner-scoped migration/RLS described above. Persist plan and checked IDs,
   revalidate against the current wardrobe on every load, and test ownership,
   account deletion, missing/removed garment IDs and migration replay.

## Deviations

None. No app, engine, test, schema, database, configuration, or workflow changes
were made. Only this requested audit report was written. No live data, secrets,
provider or device measurements were accessed.
