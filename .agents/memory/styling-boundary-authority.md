---
name: Styling boundary authority
description: Product constraints for canonical styling truth versus legacy interpretation and cultural context.
---

Keep canonical styling truth distinct from the frozen engine's interpretations.
Unknowns and African garment identifiers must not be replaced by Western aliases
or convenient inferred values in the semantic boundary.

**Why:** The user requires AI-independent canonical truth while preserving v3.7
behavior. A legacy fallback is an engine interpretation, not a confirmed fact.

**How to apply:** Preserve canonical input in future boundary work. Garment labels
or relationship membership alone do not establish cultural identity,
authenticity, aso-ebi participation, ceremony role, required headwear,
traditional-event requirements or African/Western intent. Those require separate
context/intent work, not inference added to this foundation.

Explicit Traditional selection authorizes African-first occasion guidance, not
claims about ceremony or identity. Do not work around frozen compatibility
limits by renaming an African garment or inventing canonical formality; show an
honest gap or an explained owned-wardrobe alternative instead.

**Why:** The user permits context-level suitability guidance but explicitly
protects canonical truth and v3.7 subtype precedence, even when they disagree.

**How to apply:** Keep context intent separate from item facts in future styling
work. A legacy rejection does not authorize reclassification or fabrication.

Coordinated membership comes from authoritative Phase A records, not matching
names, colours, prints or cultural association. Independently wearable set
members must not acquire a global all-or-none requirement merely because
Traditional needs coherent sets.

**Why:** The user distinguishes relationship truth from individual garment
truth, and explicitly permits independent wear outside contexts requiring a
complete set. Layered/multi-item links do not imply coordinated styling.

**How to apply:** Keep coherence constraints context-specific. Preserve all
relationship types without inventing compatibility, layer order or durable links.

Set integrity is strict in Traditional context and for sets explicitly marked
aso-ebi for an Event; set members remain independently wearable elsewhere.
Style headwear (gele, ichafu) is never added automatically and remains excluded
from Casual, blazer and jeans looks even when a covering preference is `always`.
Covering items (gyale, kallabi, mayafi, hijab, scarf, turban) use an optional
preference in existing profile constraints JSON: absent keeps the current
Traditional wrapper default; `always` applies in every context; `events` applies
to Event and Traditional; `never` excludes them. A missing owned covering item
must not be replaced with style headwear; mark the constraint unsatisfied and
surface a gap note. Aso-ebi set IDs are transient event intent, not profile data.

**Why:** The user narrowed set integrity to contexts where coordinated identity
is explicit, separated style headwear from covering items, and approved the
optional profile preference without a migration.

**How to apply:** Carry event-level aso-ebi intent by set ID. Do not infer it
from garment labels or coordinated membership. Keep head-covering preference
independent of textile identity and style-headwear choices. Do not let `always`
make gele or ichafu automatic or bypass their pairing exclusions.

Proposed textile identity values may be stored as suggestions, but only values
explicitly confirmed for `textileIdentity` may drive future styling rules.

**Why:** The user specified that unconfirmed textile classification must not
shape outfit decisions.

**How to apply:** Gate any textile-specific rule on `confirmedFields` containing
`textileIdentity`; absent or unconfirmed values stay neutral.

Manual-only covering subtypes (`gyale`, `kallabi`, `mayafi`, `hijab`) stay
separate from the classifier vocabulary. V1 also treats `scarf`, `head-scarf`,
`headwrap` and `turban` as covering items.

**Why:** The user approved manual correction for those four labels while
explicitly excluding them from classifier output.

**How to apply:** Offer these labels only in manual subtype editing until the
user separately approves classifier recognition. Keep the manual picker list
separate from any list used to validate classifier output.
