# Image Provenance Register — African/Nigerian Fashion Benchmark v1

**Phase:** 5C.3 Track B  
**Version:** 1.0  
**Date:** 2026-08-19  

---

## 1. Governing principles

1. **Do not download random internet images** into this repository without establishing
   usage rights.
2. **Do not commit copyrighted third-party images** to production source control.
3. **Do not use real users' personal wardrobe photographs** without explicit written
   consent for benchmark use.
4. **Do not upload benchmark images to third-party AI services** to generate gold labels.
   The gold-label process must remain independent.
5. **If images cannot legally be stored in the repository**, use a secure external
   private dataset reference (see §4) and store only the reference ID here.

---

## 2. Preferred image sources (in priority order)

| Priority | Source type | Notes |
|---|---|---|
| 1 | **Purpose-created / synthetic images** | Generated specifically for this benchmark; no copyright issues; no real person's data. Preferred for classification cases. |
| 2 | **Explicitly consented images** | User or subject has given written permission for benchmark use. Must record consent reference. |
| 3 | **Licensed stock photography** | Creative Commons (CC0, CC BY), Unsplash, Pexels, or commercial licence. Must verify licence permits internal testing use. |
| 4 | **Commercially licensed fashion imagery** | Must verify licence explicitly permits internal AI evaluation use (not just editorial). |
| 5 | **Screenshots / captures from licensed products** | Manufacturer product photography — check ToS for AI training / internal testing permissions. |

---

## 3. Required fields per image record

| Field | Required? | Description |
|---|---|---|
| `image_id` | ✅ | Stable identifier referenced from case files (e.g. `IMG-GU-01`) |
| `case_ids` | ✅ | Which benchmark cases reference this image |
| `description` | ✅ | Text description of the garment / outfit shown |
| `source_type` | ✅ | One of: `synthetic`, `consented`, `cc0`, `cc-by`, `commercial-stock`, `manufacturer`, `unknown` |
| `source_url_or_ref` | ✅ | URL, stock library reference, or consent document reference |
| `licence_name` | ✅ | e.g. CC0, CC BY 4.0, Unsplash Licence, Pexels Licence, commercial licence ID |
| `licence_permits_internal_testing` | ✅ | `yes` / `no` / `unverified` |
| `can_commit_to_repo` | ✅ | `yes` / `no` / `pending-verification` |
| `can_share_with_reviewer` | ✅ | `yes` / `no` / `pending-verification` |
| `personally_identifiable` | ✅ | `yes` — face/identifying info visible; `no`; `partial` |
| `consent_reference` | If PII | Reference to consent document (stored externally, not in repo) |
| `date_verified` | ✅ | Date provenance was checked |
| `verified_by` | ✅ | Who checked (role, not name) |
| `notes` | — | Any limitations, restrictions, or warnings |

---

## 4. External private dataset mechanism

Where images cannot be committed to this repository (copyright, PII, unverified licence),
use the following reference mechanism:

- Store images in a **private, access-controlled external storage location** agreed with
  the Product Owner (e.g. a private Google Drive folder, a password-protected cloud store,
  or a secure internal file server).
- Record only the `image_id` and external reference ID in this file.
- The reviewer receives images via the agreed secure external channel (not via this repo).
- No image is reconstructible from this file alone.

**Private dataset external reference format:**

```
EXTERNAL_REF: AFBM-v1/<image_id>
Location: [Product Owner to specify — not recorded here]
Access: Independent reviewer only, via Product Owner
```

---

## 5. Current image status

> **Current status (2026-08-19):** No images have been sourced yet.
> All cases are fully specified in text form. Images are required before the reviewer
> package can be considered complete.

The table below records the image status for each case. Product Owner is responsible
for sourcing and entering provenance records.

### 5.1 Classification cases (GU-01 to GU-40)

| Image ID | Case | Description | Source type | Repo-committable | Reviewer-shareable | Status |
|---|---|---|---|---|---|---|
| IMG-GU-01 | GU-01 | Ankara maxi skirt — large orange/teal wax-print | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-02 | GU-02 | Ankara blouse — small olive/cream wax-print | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-03 | GU-03 | Ankara midi skirt — medium muted earth tones | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-04 | GU-04 | Ankara midi/maxi dress — large vivid contrasting print | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-05 | GU-05 | Ankara fitted blouse — large wax-print | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-06 | GU-06 | Ankara wide-leg trousers — large wax-print | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-07 | GU-07 | Ankara blazer — large wax-print | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-08 | GU-08 | Ankara matching two-piece (top + skirt, same print) | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-09 | GU-09 | Ankara two-piece — same print structure, different colourways | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-10 | GU-10 | Ankara dress + Western denim jacket overlay | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-11 | GU-11 | Ankara wax-print gele / head tie | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-12 | GU-12 | Ivory French lace A-line floor-length gown | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-13 | GU-13 | Patterned lace midi dress — deep wine geometric lace | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-14 | GU-14 | Lace blouse, short-sleeve, aso-ebi style | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-15 | GU-15 | Lace midi skirt — guipure lace, heavy texture | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-16 | GU-16 | Aso-oke gele — gold/orange hand-woven head tie | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-17 | GU-17 | Aso-oke wrapper skirt — hand-woven, wrapped style | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-18 | GU-18 | Gold brocade evening skirt — stiff metallic-woven | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-19 | GU-19 | Embellished lace blouse — beaded neckline, crystal embroidery | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-20 | GU-20 | Heavily embroidered kaftan — gold thread on ivory cotton | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-21 | GU-21 | Buba blouse — loose short-sleeved, solid indigo cotton | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-22 | GU-22 | Buba in aso-oke fabric — same silhouette, woven fabric | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-23 | GU-23 | Iro (wrapper) — large bold Ankara print, wrapped as skirt | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-24 | GU-24 | Three-piece buba/iro/ipele — complete Yoruba outfit as a set | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-25 | GU-25 | Casual home kaftan — lightweight cotton, dusty rose | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-26 | GU-26 | Grand boubou — floor-length embroidered damask, gold | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-27 | GU-27 | Lace kaftan — mid-length, lace overlay on satin lining | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-28 | GU-28 | Contemporary Ankara midi dress — structured Western silhouette | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-29 | GU-29 | African-print co-ord blazer + wide-leg trousers (Ankara) | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-30 | GU-30 | Ankara crop top + high-waisted solid midi skirt | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-31 | GU-31 | Adire/tie-dye blouse — indigo hand-dyed, organic pattern | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-32 | GU-32 | Kente-pattern woven stole — colourful strip-cloth accessory | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-33 | GU-33 | Women's aso-oke buba — indigo-and-gold hand-woven blouse | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-34 | GU-34 | Women's aso-oke iro wrapper — hand-woven traditional skirt | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-35 | GU-35 | Women's embellished lace blouse — beaded, crystal embroidered | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-36 | GU-36 | Women's embroidered ivory kaftan — heavy gold-thread embroidery | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-37 | GU-37 | Women's grand boubou — embroidered floor-length damask | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-38 | GU-38 | Women's adire wrap skirt — indigo hand-dyed resist pattern | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-39 | GU-39 | Women's kente stole — colourful hand-woven strip-cloth accessory | PENDING | PENDING | PENDING | ⏳ Not sourced |
| IMG-GU-40 | GU-40 | Women's aso-oke gele — structured gold/orange/teal hand-woven head tie | PENDING | PENDING | PENDING | ⏳ Not sourced |

### 5.2 Outfit-ranking, occasion, and weather cases (OR / OC / WX)

Images for outfit-ranking, occasion, and weather cases are **optional** — the cases are
fully specified in text with item descriptions. Images of individual garments (from the
GU series) may be reused where the same item appears. If the reviewer requests images
for specific OR/OC/WX cases, source them under the same provenance requirements above.

---

## 6. Synthetic image guidance

Where synthetic (AI-generated) images are used:

- The generation prompt must not reference real people, real brands, or copyrighted designs.
- The generated image must show a garment, not a person's face or identifying features.
- Record the generation tool and prompt in the notes field.
- Synthetic images are preferred for cases where accuracy of garment representation
  matters more than photorealism.

---

## 7. Provenance review checklist (Product Owner)

Before handing the reviewer package to the independent reviewer:

- [ ] All 40 GU images sourced or confirmed as text-only
- [ ] Each image has a completed provenance record in §5.1
- [ ] No image with `can_share_with_reviewer: no` is in the reviewer package
- [ ] No image with `personally_identifiable: yes` is included without consent reference
- [ ] External private dataset mechanism (§4) is set up and accessible to reviewer
- [ ] Reviewer has been told how to access images (via Product Owner, not via this repo)
