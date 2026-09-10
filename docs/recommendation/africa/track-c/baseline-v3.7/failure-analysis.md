# Failure Analysis

## Taxonomy

- **Engine failure:** runtime refusal, malformed response, or a clearly unsuitable top recommendation.
- **Taxonomy/representation gap:** culturally specific garment identity cannot be expressed by current categories/subtypes or guardrails.
- **Benchmark ambiguity:** reviewer judgement may be subjective or cannot map exactly to generated fingerprints. No case was removed or relabelled on this basis.

## Severity distribution

| Severity | Cases | Interpretation |
|---|---:|---|
| P0 | 6 | Classification unusable: no successful label |
| P1 | 11 | Clearly inappropriate ranking or materially wrong garment category |
| P2 | 23 | Material inferiority or culturally important identity loss |
| P3 | 15 | Lower-impact subtype/style disagreement |
| Pass | 45 | Semantic garment-type or top-1 ranking agreement |

Severity is case-reviewed using execution status, reviewer acceptability, utility regret, category correctness, and cultural meaning—not a score threshold alone.

## P0 classification failures

| Case | Severity | Recorded production response |
|---|---|---|
| GU-11 | P0 | This item appears to be a headwrap or accessory, which is not currently supported in our clothing categories. |
| GU-16 | P0 | This item appears to be a traditional head wrap (gele) or cultural headwear, which falls outside the standard clothing and accessory categories currently supported. |
| GU-17 | P0 | classification_failed |
| GU-29 | P0 | This image contains multiple clothing items (a blazer and pants set). Please photograph each garment individually. |
| GU-39 | P0 | This appears to be a textile strip or sash rather than a standard clothing item. Please photograph an actual garment such as a top, bottom, dress, or outerwear piece. |
| GU-40 | P0 | This item appears to be a headpiece or hat rather than a standard clothing item in our currently supported categories. |

## Highest-impact ranking misses

| Case | Severity | Engine top-1 | Gold preferred | Regret |
|---|---|---|---|---:|
| WX-01 | P1 | D: Navy wool coat over black trousers | A: Cotton Ankara kaftan with closed flats | 25 |
| WX-03 | P1 | D: Grey wool trousers with cotton blouse | B: White tunic with cream linen wide-leg trousers | 24 |
| WX-04 | P1 | D: Medium Ankara skirt, white blouse, camel blazer, closed flats | A: Medium Ankara skirt, white blouse, closed flats, structured bag | 24 |
| OC-06 | P1 | D: Royal-blue silk cocktail dress with nude heels, black mini-bag | A: Orange-teal Ankara kaftan with gold heels, gold clutch, statement earrings | 23 |
| OC-18 | P1 | D: Black crop-top with orange-teal Ankara skirt, gold heels, gold clutch | B: Royal-blue silk cocktail dress with nude heels, black bag, pearl earrings | 23 |
| OR-12 | P1 | D: Black crop-top with orange-teal Ankara skirt, gold heels, gold clutch | B: Royal-blue silk cocktail dress with nude heels, black bag, pearl earrings | 23 |
| OR-25 | P1 | B: White blouse, black trousers, gold heels, gold clutch, statement earrings, pearl earrings, camel blazer | A: Ankara kaftan with gold heels and gold clutch (minimal accessories) | 22 |
| OR-29 | P2 | D: Burgundy lace midi-dress with gold heels, gold clutch, statement earrings | C: Champagne lace gown with gold heels, gold clutch, pearl earrings | 21 |
| OC-10 | P1 | D: Black blouse with black trousers, black heels, black bag | A: White solid cotton kaftan with nude heels, white clutch | 19 |
| WX-09 | P1 | D: Jeans, white blouse, trainers | A: Ankara kaftan with navy wool coat and ankle boots | 19 |
| WX-06 | P2 | C: Royal-blue cocktail dress, no outer layer | B: Red Ankara midi with cream cardigan | 16 |
| OC-16 | P2 | B: Jeans with white crop-top, trainers, brown crossbody | C: Tan linen midi-skirt with dusty-rose blouse, flat sandals, brown crossbody | 14 |
| OR-10 | P2 | C: Jeans with black crop-top, trainers, brown crossbody | A: Small rust-cream Ankara skirt with white blouse, flat sandals, brown crossbody | 14 |
| OR-17 | P2 | C: White solid blouse with black trousers, gold heels, gold clutch | A: Matching green-gold Ankara blazer and trousers (identical fabric), gold heels, gold clutch | 14 |
| OR-22 | P2 | C: Jeans with black crop-top, trainers, brown crossbody | D: Sage cotton kaftan with flat sandals, brown crossbody | 14 |
| OR-28 | P2 | D: Camel blazer with black trousers, nude heels, gold clutch (no print) | A: Matching green-gold Ankara blazer and trousers (same print), nude heels, gold clutch | 14 |
| OC-13 | P2 | C: Royal-blue silk cocktail dress with nude heels, black mini-bag | A: Matching green-gold Ankara blazer and trousers, gold heels, gold clutch | 13 |
| OC-19 | P2 | C: Ivory lace gown with gold heels, gold clutch, statement earrings | A: Ivory grand ceremonial kaftan with gold-thread embroidery, gold heels, gold clutch, statement earrings | 13 |
| OR-01 | P2 | D: Ivory lace gown with gold heels, gold clutch, statement earrings | A: Orange-teal Ankara kaftan with gold heels, gold clutch, statement earrings | 13 |
| OR-03 | P2 | B: Royal-blue silk cocktail dress with nude heels, black bag, pearl earrings | A: Red-black Ankara midi-dress with gold heels, gold clutch, statement earrings | 13 |

## Main clusters

1. Weather-insensitive fixed ranking: WX-01, WX-03, WX-04, WX-06, WX-09.
2. Occasion mismatch: OC-06, OC-10, OC-18 and OR-12.
3. Cultural coordination underweighting: OR-01, OR-17, OR-28.
4. Accessory-count bias: OR-25.
5. Guardrail/taxonomy exclusions: gele, wrapper, co-ord, stole, headpiece.
