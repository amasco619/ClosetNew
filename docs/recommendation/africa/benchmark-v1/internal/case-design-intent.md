# Case-Design Intent — INTERNAL, post-lock only

**Audience:** Benchmark author / Track C evaluation. NOT for reviewer distribution.  
**Purpose:** Records what each case was designed to probe, including expected engine
behaviour under the frozen v3.7 rules. This material was deliberately removed from the
reviewer-facing case files so reviewer labels stay independent. Use it only after gold
labels are locked, when classifying Track C findings.

> Nothing here is a gold label. Expected behaviour describes what the *engine* is
> predicted to do — not what the correct answer is.

---

## Engine weather-gate reference (v3.7 — unchanged)

| Rule | Threshold |
|---|---|
| Outerwear **required** | `lowC < 12` |
| Outerwear optional / system default | `12 ≤ lowC ≤ 18` |
| Outerwear **suppressed** | `lowC > 18` AND `highC > 24` |
| Rain filter active | `precipitationPct ≥ 50` |
| Rain filter blocks | sandals, espadrilles, flip-flops, wicker-bag, open-weave bags |
| `neededWarmth` bands | cold < 5°C ≤ cool < 12°C ≤ mild < 18°C ≤ warm < 25°C ≤ hot |

## WX cases — design intent and expected engine behaviour

| Case | Design intent | Expected engine behaviour |
|---|---|---|
| WX-01 | Hot/humid baseline | Outerwear suppressed (26/33). Rain filter inactive. Cold/mild-band candidates (B, D) penalised; warm-band (A, C) preferred |
| WX-02 | Rain filter at a traditional event | Rain filter active (85%): blocks strappy sandals (B), wicker bag (C), espadrilles (D). A is the only fully rain-safe candidate |
| WX-03 | Extreme dry heat, business | Outerwear suppressed (28/38). Wool trousers (D) cold-band penalty; blazer candidate (C) has mild-band outerwear in heat |
| WX-04 | Rain filter, casual | Rain filter active (70%): blocks B (sandals), C (wicker). Outerwear suppressed, so blazer in D may not surface |
| WX-05 | Extreme heat + modesty probe | Engine has **no modesty signal** — B (short sundress) passes the heat test; reviewer may rank it down for Kano modesty norms. Divergence here is a cultural-signal finding, not a weather bug |
| WX-06 | 20°C evening — Track A edge case | lowC 20 → outerwear suppressed is NOT triggered (needs highC > 24 too — here highC 32, so suppression applies). Verify no candidate is blocked for lacking outerwear |
| WX-07 | Harmattan; 18°C low boundary | lowC 18 is inside the optional band boundary. Wool coat (C) likely over-layered but not blocked. Harmattan dust/skin concerns have **no engine signal** |
| WX-08 | Indoor AC gap | Engine scores outdoor weather only (27/32 → outerwear suppressed) and will prefer no-layer candidates; a Nigerian stylist may prefer a light layer for cold interiors. Divergence = known AC-modelling gap |
| WX-09 | UK winter, outerwear required | lowC 5 < 12 → outerwear **required**: B and D should be heavily penalised/killed. Rain filter active (55%) |
| WX-10 | Rain + formal | Rain filter active (80%): blocks B (strappy heels), D (wicker). A vs C is the culturally interesting comparison |

**Known engine limitations probed by WX:** outerwear gate at Nigerian cool evenings
(WX-06), no indoor-AC context (WX-08), Northern-Hemisphere season inference (all),
no modesty signal (WX-05), no harmattan representation (WX-07).

## OR cases — design intent

| Case | Design intent |
|---|---|
| OR-01…05 | Nigerian wedding/ceremony tier: aso-ebi coordination, ceremony-vs-reception formality, church, naming ceremony |
| OR-06…09 | Business: fusion vs Western, conservative interview, rain gate on work day |
| OR-10…12 | Casual/social calibration |
| OR-13 | Hero pattern + grounds. Predicted v3.7 patternSafety: A ≈ +3 (hero+solid), B ≈ +3, C ≈ −3 (two large patterns) |
| OR-14 | Two large patterns (floral / stripe) vs solid control. Floral and stripe are both in the engine's bold set at large scale |
| OR-15 | **wax-print bold-check gap probe:** medium-scale wax-print is NOT treated as bold by isBoldPattern (checks scale==='large' or animal/floral). If the reviewer treats medium Ankara as carrying hero weight, C (medium print on medium print) may be ranked lower by the reviewer than the engine expects |
| OR-16 | Same gap at small scale: small wax-print + medium wax-print combination |
| OR-17 | Co-ord identity: engine has no set concept; same-print A vs same-print-different-garment B vs no-print C |
| OR-18 | Two unrelated Ankara prints: engine sees pattern:wax-print twice but has no print-identity signal — cannot distinguish A (clash) from C (match) except via colour harmony |
| OR-19 | Three patterns: patternSafety should penalise A hard |
| OR-20 | Hero elevation with maximal neutral ground (reviewer-facing title: "Large Ankara kaftan — accessory choices") |
| OR-21 | Formality-6 gown at the office: scenario-affinity + formality should kill A |
| OR-22 | Over-formalisation at a market |
| OR-23 | Western-default bias probe: does the engine prefer B (Western cocktail) over culturally invested A/C? |
| OR-24 | Fabric formality vs occasion: silk camisole (night-out tag, formality 5) at casual brunch |
| OR-25 | Completeness dominance: B has 7 items — completeness bonus must not outrank stronger base outfits |
| OR-26 | Heat mismatch: cold/mild-band layers at 35°C |
| OR-27 | Rain filter within ranking |
| OR-28 | Full co-ord comparison (same print / different print / print+solid / no print) |
| OR-29 | African vs Western formal at equal formality — cultural preference probe |
| OR-30 | Diaspora cold-climate: outerwear required at 10°C |

## OC cases — design intent

The OC set probes occasion distinctions that Amodka's OccasionTag collapses:

| Distinction | Cases | Amodka tags collapsed |
|---|---|---|
| Traditional vs white wedding | OC-01 vs OC-02 | `traditional-event` vs `wedding` (exists but coarse) |
| Ceremony vs reception | OC-02 vs OC-03 | both `wedding`/`event` |
| Aso-ebi outside weddings | OC-04 | no aso-ebi concept |
| Regular Sunday vs thanksgiving vs choir | OC-05/06/07 | all map to `traditional-event`; no church tag |
| Naming ceremony | OC-08 | `traditional-event` |
| Milestone birthday | OC-09 | `event` |
| Funeral (white-dress Yoruba Christian) | OC-10 | no funeral tag; colour semantics (white vs black mourning) absent |
| Family àríyá | OC-11 | `casual`/`event` |
| Networking vs launch vs government | OC-12/13/14 | `event`/`work`/`interview` |
| Brunch/casual/date tiers | OC-15…18 | existing tags — calibration |
| Chieftaincy/festival | OC-19 | `traditional-event` |
| Diaspora | OC-20 | no location/diaspora signal |

Provisional Amodka occasion-tag assignments for the Track C runner are in
`../benchmark-execution-protocol.md` §3.1 (the runner assigns the closest tag; the
assignment itself is part of what is being evaluated and must be recorded per case in
`benchmark-input/`).

## Fixture notes

- F45/F46 exist so OR-17/OR-18 can distinguish same-print vs unrelated-print Ankara tops.
- F41–F44 provide top-garment patterns at controlled scales for the OR-13…16 series.
- OC-F10/F11/F12 form the blue-gold aso-ebi fabric family for OC-04.
- OC-F13/OC-F14 provide the white funeral candidates for OC-10.
- OC-F16 is the grand embroidered kaftan for OC-19 (embellishment described in case text
  because the schema has no embellishment field — itself a GU-20 finding).
