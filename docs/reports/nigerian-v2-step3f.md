# Nigerian Styling V2 — Step 3f

No gold labels or ratings were accessed. The 100 fixture files remain unchanged.
The comparison below runs only the adapter and checks V1 mapping and vocabulary
membership; it does not evaluate rules or produce verdicts.

## A. Fixture impact, before the coverage rerun

Compared with the committed Step 3e adapter:

- **V1 unknown → eligible (16):** S01-D (`ipele`); S03-A, S03-B, S04-B,
  S08-B and S16-B (`double-wrapper`); S06-A (`ipele`); S08-C, S09-A,
  S10-A, S10-B, S10-C, S10-D, S17-A, S17-B and S25-D (`head-tie`).
- **V1 mapping reason resolved, but still unknown (1):** S14-A (`head-tie`
  now maps as a covering item; `skirt-suit` remains one aggregate garment that
  V1 cannot accept as a single base).
- **Key vocabulary unknown → recognised (22):** S02-D (`jacket`); S03-A,
  S03-B, S04-B, S08-B and S16-B (`double-wrapper`); S09-C, S14-A and S19-A
  (`skirt-suit`); S11-C and S25-C (`suit`); S12-C, S14-C, S16-D, S18-C and
  S22-C (`jumpsuit`); S12-D (`co-ord`); S13-C (`two-piece-set`); S16-C
  (`set`); S20-C and S23-D (`jacket`); S21-D (`shorts`); S24-C
  (`trouser-suit`).

The counts overlap; for example double-wrapper fixtures change both V1 and
vocabulary status. Head-tie is canonicalised to the approved `headwrap` alias,
with the requested low/unsculpted facts. Ipele remains one V2 non-key item and
maps to a V1 layer. Double-wrapper remains one V2 key item and maps to one
V1 wrapper bottom.

Suit, skirt-suit, trouser-suit, co-ord, two-piece-set and set are recognised
as one key item. No components are fabricated. V1 remains unknown for those
aggregate subtypes it cannot accept, with an item-specific mapping gap. Jacket,
jumpsuit and shorts use their existing V1 categories. Dashiki, bare `wrap` and
`unknown` remain unmapped.

## Files and scope

Production changes are limited to `lib/nigerianStyling/v2/blindAdapter.ts` and
the `KEY_VOCABULARY` list in `lib/nigerianStyling/v2/rules.ts`. No rule condition,
V1 code, or frozen fixture changed. `__tests__/nigerianStylingV2BlindAdapter.test.ts`
contains synthetic tests only.

Pre-run fixture-set manifest SHA-256:
`e1e72cc776bf107f5f9cf7385814daecef8b526b1b8e35f21baffb6dca882775`.

Adapter and evaluator checksums are published in the conversation immediately
before the count-only rerun. Results are appended after it.

Deviations: none. No accuracy calculation, per-fixture verdict, or rule result
is produced in this report.
