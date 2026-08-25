# INTERNAL — Post-Lock Package (NOT for reviewer distribution)

**Access rule:** Nothing in this directory may be shared with the independent reviewer
before their gold labels are signed and locked (`../governance.md` §5). It contains
developer analysis, current-system mappings, expected system behaviour, and case-design
intent — all of which would contaminate reviewer independence.

## Contents

| File | Purpose | When it may be used |
|---|---|---|
| `runner-fixtures.md` | Fully typed runner catalog: author-assigned occasion tags, numeric formality, and warmth per item. Row-for-row identical to `../fixtures.md` on descriptive columns (validator-enforced) | Track C runner input only — after labels are locked |
| `gu-taxonomy-analysis.md` | Developer-authored Amodka-mapping artifact, keyed by case ID and kept separate from gold labels, plus suspected representation gaps | After labels are locked — finalized against locked labels for Track C gap analysis; never written into signed label files |
| `case-design-intent.md` | What each case was designed to probe, including expected engine behaviour and known engine limitations | After labels are locked — for Track C evaluation and finding classification |
| `non-gold-drafts/` | Quarantined pre-governance draft rankings (never signed, never gold) | Historical reference only — see its README |
| `future-v2-mens-fashion/` | Original GU-33–GU-40 men's classification descriptions, excluded from v1 | Future v2 planning only; never v1 evidence |

**Integrity check:** `node scripts/validate-benchmark-fixtures.mjs` (repo root) verifies
catalog consistency, the reviewer/runner boundary, all case fixture references, and all
outfit fingerprints. Run it after any edit to the package.

## Reviewer package boundary

The reviewer receives ONLY:

- `../reviewer-instructions.md`
- `../scoring-rubric.md`
- `../fixtures.md`
- `../classification-cases.md`
- `../outfit-ranking-cases.md`
- `../occasion-cases.md`
- `../weather-cases.md`
- The label forms from `../gold-label-schema.md` §3.2 and §4.2 (all fields are
  reviewer-owned; developer taxonomy analysis lives only in this directory and is never
  merged into signed label files)
- Sourced images per `../image-provenance.md`

The reviewer must NOT receive: this directory, `../scenarios.md` (its adversarial/capability
flags reveal case-design intent), `../benchmark-execution-protocol.md`,
`../results-template.md`, `../governance.md` (contains data-stage design), or any engine
output.
