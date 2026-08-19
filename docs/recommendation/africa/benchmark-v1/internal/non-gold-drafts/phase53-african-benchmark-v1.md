# Phase 5C.3 African-Fashion Gold-Standard Benchmark v1

**Status:** Pre-engine-run, externally scored-label protocol.  
**Integrity:** The expected ranking below is authored independently of engine output. A Nigerian-fashion stylist must sign/date the labels before execution. Do not alter a label after seeing a result.

## Dataset shape

Each row is one scenario. Garments are abbreviated as `category/subtype; color; pattern/scale; fabric; formality`. `>` is the independent expected ranking. Mapped scenario uses the current frozen `OccasionTag`; it does **not** imply the mapping is culturally complete.

| IDs | Count | Garment/attribute cases | Cultural context | Mapped scenario | Weather | Expected compatibility/ranking | Rationale |
|---|---:|---|---|---|---|---|---|
| GU-01–05 | 5 | Ankara top; wax-print/large; cotton; F4 + neutral trouser | contemporary fusion | work, casual, brunch, date-casual, event | hot/dry | neutral ground > competing print | one print is the visual hero |
| GU-06–10 | 5 | Ankara bottom; wax-print/large; cotton; F4 + solid blouse | contemporary fusion | casual, brunch, date-dressy, work, event | hot/humid | solid blouse > large stripe | preserve visual hierarchy |
| GU-11–15 | 5 | Ankara dress/blazer/skirt/two-piece/kaftan | mixed modern and ceremony | event, wedding, brunch, work, traditional-event | hot/humid | context-appropriate African item > generic equivalent when tags match | origin must not be penalised |
| GU-16–20 | 5 | Lace gown, lace blouse, aso-ebi dress, aso-oke wrapper, brocade kaftan | ceremony | traditional-event, wedding, event | warm evening | ceremony-appropriate item > casual item | representation and formal context |
| GU-21–25 | 5 | iro wrapper, buba top, boubou, senator/native set, agbada proxy | cultural ceremony | traditional-event, event, work, casual, wedding | hot/dry | direct/closest proxy must remain visible; agbada is expected representation miss | separate taxonomy from scoring |
| GU-26–30 | 5 | gele proxy, beaded lace, embroidered buba, matching two-piece, three-piece set | ceremony | traditional-event, wedding, event, brunch, date-dressy | warm | matching set > visual conflict | exposes missing accessory/co-ord fields |
| GU-31–35 | 5 | wax-print small, medium, large, tonal, multicolour | visual-weight study | casual, brunch, event, work, traditional-event | hot | scale-aware neutral pairing > competing print | identifies scale-free wax-print risk |
| GU-36–40 | 5 | African-Western blazer, denim pairing, neutral accessories, black ground, white ground | contemporary styling | work, casual, date-dressy, brunch, event | hot/humid | balanced fusion > origin-pure default | tests Western-default bias |
| OC-01–05 | 5 | Ankara skirt + solid blouse vs. striped blouse; shared shoes/bag | wedding guest / dinner | wedding, event, date-dressy, traditional-event, night-out | warm | hero + solid > hero + competing bold | pattern overload adversary |
| OC-06–10 | 5 | Ankara top + tailored trouser vs. matching loud bottom; shared accessories | creative office / brunch | work, brunch, casual, date-casual, event | hot/humid | contemporary fusion > all-pattern look | valid print must not be suppressed |
| OC-11–15 | 5 | lace gown or kaftan vs. casual dress vs. Western cocktail dress | wedding / reception | traditional-event, wedding, event, date-dressy, night-out | warm evening | occasion-tagged best > merely luxurious item | cultural context vs material |
| OC-16–20 | 5 | wrapper+buba, matching set, plain trousers+shirt, accessories | church / naming / family event | traditional-event, event, brunch, work, casual | hot | context-fit candidate > highest completeness alone | cultural appropriateness |
| OC-21–25 | 5 | African blazer + trouser, Western blazer + trouser, wax skirt + top | business creative / office | work, interview, event, casual, brunch | indoor AC | relevant formality > traditional-only assumption | professional variation |
| OC-26–30 | 5 | mixed print, tonal wax print, denim, neutral shoes/bag | casual / date | casual, date-casual, date-dressy, brunch, night-out | hot | tonal or one-hero outfit > three-pattern outfit | pairwise ranking test |
| OA-01–05 | 5 | kaftan, lace dress, Ankara dress, suit-like separates, casual outfit | traditional wedding, formal reception, aso-ebi, contemporary guest, black-tie | traditional-event, wedding, wedding, event, event | warm | separate expected order per dress code | current mapping may flatten these |
| OA-06–10 | 5 | buba+wrapper, Ankara blazer, lace dress, shirt+trouser, denim | Sunday church, church celebration, naming ceremony, birthday, family event | event, traditional-event, traditional-event, event, casual | hot | modest/context-tagged look > generic formality | church/naming context audit |
| OA-11–15 | 5 | tailored African fusion, Western business, ceremony wear, casual, evening set | office, meeting, corporate event, smart casual, business creative | work, work, event, casual, work | indoor AC | business-compatible outfit > agbada/ceremony wear | cultural mismatch adversary |
| OA-16–20 | 5 | Ankara casual, lace formal, kaftan, jeans/linen, date outfit | weekend, brunch, outing, date, everyday | casual, brunch, casual, date-casual, casual | hot | contextual casual/fusion > over-formal look | over-formalisation audit |
| WX-01–02 | 2 | light Ankara/lace/linen vs. jacket/coat; closed shoes | Lagos hot/humid; Abuja hot/dry | casual, work | 32–38°C, dry | light complete look; no outerwear | heat behavior |
| WX-03–04 | 2 | wax-print dress + sandals/loafers + wicker/structured bag | Lagos heavy rain; rainy season | event, casual | 27–29°C, 85–90% rain | closed shoes + structured bag > rain-averse items | rain hard gate |
| WX-05–06 | 2 | kaftan/lace with light layer alternatives | cooler evening; indoor AC | event, work | 20°C / 21°C | light layer optional, not fabricated heavy coat | outerwear threshold audit |
| WX-07–08 | 2 | breathable buba/wrapper and formal set | harmattan; Kano dry heat | casual, traditional-event | 25–30°C, dry | breathable context-fit look > winter proxy | regional climate limit |
| WX-09–10 | 2 | ceremony outfit + weather-appropriate shoes/bag | rainy wedding; humid reception | wedding, traditional-event | 28°C, 80% rain | weather-safe ceremony look > unsafe high-formality look | hard constraint vs occasion |

## Required result fields

For every expanded case, record:

1. scenario ID and benchmark block;
2. exact wardrobe fixture and expected candidate fingerprints;
3. independently assigned rank/utility and label author/date;
4. engine top-1/top-3, observed confidence score, hero ID, generation path, and fallback state;
5. top-1, top-3, pairwise accuracy, mean/median/max regret, Kendall’s τ where three or more labelled candidates were generated;
6. hard-constraint violations and missing-candidate/fallback counts;
7. diagnosis A–G only after the observed result is compared with the signed gold label.

This is an additive benchmark. `__tests__/recommendation-golden-set.ts` remains the immutable v3.7 regression suite and must run unchanged alongside any future benchmark runner.