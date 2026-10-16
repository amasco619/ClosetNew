# Amodka — luxury garment image presentation

## Step 0: image-pipeline findings

| Flow | Stage | Before this change |
|---|---|---|
| Single add | PhotoRoom result | Transparent PNG |
| Single add | Preview | Re-encoded JPEG; alpha was lost and could appear black |
| Single add | Gemini | Re-encoded JPEG where available; alpha/background was not preserved |
| Single add | Signed-in storage | Clean transparent PNG at a `.png` path |
| Single add | Guest copy | Flattened JPEG could be copied to a `.png` filename |
| Bulk review | PhotoRoom result | Transparent PNG |
| Bulk review | Preview | Re-encoded JPEG rather than the cutout |
| Bulk review | Gemini | JPEG payload; the PNG MIME type was not carried through |
| Bulk review | Signed-in storage | Clean transparent PNG at a `.png` path |
| Bulk review | Guest copy | No dedicated durable copy of the PNG; the picker URI was retained |

The UI also used different surfaces: Add and bulk previews could appear black,
while wardrobe list rows used the garment colour family as the image surface.
The grid and other owned-garment renderers did not share one presentation
component. `outfit-ideas` and `blueprint` use bundled sample art, not user-owned
garment photos.

## Implemented pipeline

| Flow | Stage | Current behavior |
|---|---|---|
| Single add | PhotoRoom result | Alpha bounds are trimmed with an even margin; the transparent PNG is written to a cache `.png` and displayed by file URI |
| Single add | Gemini | Sends PNG bytes with `image/png`; the server composites them onto `#E9E4DC` before calling Gemini |
| Single add | Signed-in storage | Uploads the transparent PNG unchanged with a `.png` path; non-cutout images remain JPEG |
| Single add | Guest copy | Copies the transparent `.png` file; non-cutout images use `.jpg` |
| Bulk review | PhotoRoom result | Same trimming and PNG cache-file path; only the URI is retained in item state |
| Bulk review | Gemini | Sends PNG bytes with `image/png`; server applies the same neutral matte |
| Bulk review | Signed-in storage | Uploads the clean PNG with a `.png` path; non-cutout images remain JPEG |
| Bulk review | Guest copy | Writes the clean PNG to a local `.png` file; non-cutout images use `.jpg` |

The scan found no persisted cutout flag in the current application model. Display
detection therefore uses the persisted storage path when present, otherwise the
image URI extension (including signed URLs with query strings). No database
migration was added.

## Shared presentation

`GarmentTile` is used for single-add preview, bulk-review cards and edit panel,
wardrobe list and grid, item detail, Home's owned-garment card, outfit results,
the free-wardrobe chooser, wear log, OOTD, the travel checklist and travel-look
components, and multi-item review. It uses warm neutral gradients, a deeper
stone variant for white/cream/beige, a hairline frame, a low-opacity floor
ellipse, and `expo-image` `contain` for cutouts / `cover` for original photos.
Transitions are 300 ms unless reduced motion is enabled. Bulk images use
recycling keys. The bulk remove button remains a separate control outside the
image tile.

Bundled sample images in `app/outfit-ideas.tsx`, `app/blueprint.tsx`, and Home's
sample-only cards were not changed.

## Classification matte decision

The neutral matte stayed in place. Unit tests verify alpha compositing and
provider MIME handling with transparent, semi-transparent, black, white and
bright synthetic pixels. No live Gemini-label comparison was performed, so
whether the matte changes real-world color labels remains unverified.

## Visual verification matrix

No physical-device or signed-in visual inspection was performed. Each cell is
therefore marked **Not verified** rather than inferred from code or unit tests.

| Garment case | Single Add | Bulk review | Wardrobe list | Wardrobe grid |
|---|---|---|---|---|
| Black item | Not verified | Not verified | Not verified | Not verified |
| White item | Not verified | Not verified | Not verified | Not verified |
| Cream item | Not verified | Not verified | Not verified | Not verified |
| Bright item | Not verified | Not verified | Not verified | Not verified |
| Tall dress | Not verified | Not verified | Not verified | Not verified |
| Wide bag | Not verified | Not verified | Not verified | Not verified |
| Shoes | Not verified | Not verified | Not verified | Not verified |
| Item with no cutout | Not verified | Not verified | Not verified | Not verified |

The bulk remove-button contrast on a real device is also not visually verified.

## Scope and validation

No taxonomy, classification prompt, recommendation logic, quota, auth, schema,
or PhotoRoom cache-key behavior was intentionally changed. `pngjs` is the only
added direct runtime dependency; no native dependency or migration was added.

Automated verification:

- `npm test` — 95 passed, 0 failed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `git diff --check` — passed.
- Backend workflow restarted and served on port 5000; frontend Metro restarted
  and reported `packager-status:running` on port 8081.
- The browser preview displayed the Expo Go QR handoff page, not the signed-in
  app screens; its browser log reported one 404 resource that was not traced.

Physical iOS/Android appearance, signed-in screen rendering, and real Gemini
label quality remain unverified.
