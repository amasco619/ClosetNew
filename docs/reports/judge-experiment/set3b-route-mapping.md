# Set 3B route-field mapping

Input: `attached_assets/looks3b_enriched_1794268431653.json` (SHA-256 `34198b778b56c8f382bf6daecc84a546ef9ee9afce03291ba674e849003eceb7`).
No Supabase writes or look-specific application changes. The two group fixtures are in-memory only.

| Look | Context before → after | Route selection occasion | Role before → after | Denomination | Announced colours before → after | Assigned set before → after | Profile preference | Item category mappings |
|---|---|---|---|---|---|---|---|---|
| V01-A | — | — | — | — | — | — | default → omitted | — |
| V01-B | — | — | — | — | — | — | default → omitted | — |
| V01-C | — | — | — | — | — | — | default → omitted | — |
| V01-D | — | church → event | — | — | — | — | default → omitted | — |
| V01-E | dinner → event | dinner → event | — | — | — | — | default → omitted | — |
| V02-A | — | — | — | — | — | — | default → omitted | — |
| V02-B | — | church → event | — | — | — | — | default → omitted | — |
| V02-C | — | — | "guest" → dropped (general wedding brief has no role field) | "catholic" → dropped (general wedding brief has no denomination field) | — | — | default → omitted | — |
| V02-D | — | date → date-dressy | — | — | — | — | default → omitted | — |
| V02-E | — | — | — | — | — | — | default → omitted | — |
| V03-A | — | — | "guest" → dropped (general wedding brief has no role field) | — | — | — | — | Emerald hijab [accessory/hijab] → jewelry/hijab |
| V03-B | — | — | — | — | — | — | — | Olive hijab [accessory/hijab] → jewelry/hijab |
| V03-C | religious_festival → event | religious_festival → event | — | — | — | — | — | Cream hijab [accessory/hijab] → jewelry/hijab |
| V03-D | dinner → event | dinner → event | — | — | — | — | — | — |
| V03-E | — | — | — | — | — | — | — | — |
| V04-A | — | church → event | — | — | — | — | default → omitted | Wine ichafu [accessory/ichafu] → jewelry/ichafu |
| V04-B | — | funeral → event | — | — | "black and white" → black, white | — | default → omitted | White head tie [accessory/head tie] → jewelry/head-tie |
| V04-C | traditional_wedding → traditional-wedding | traditional_wedding → traditional-event | — | — | — | null → none | default → omitted | Wine ichafu [accessory/ichafu] → jewelry/ichafu; Coral beads, several strands [accessory/necklace] → jewelry/necklace |
| V04-D | — | — | — | — | — | — | default → omitted | — |
| V04-E | traditional_wedding → traditional-wedding | traditional_wedding → traditional-event | — | — | "coral red and wine" → dropped (traditional-event brief has no announced-colours field) | null → none | default → omitted | Coral red ichafu [accessory/ichafu] → jewelry/ichafu |
| V05-A | — | — | — | — | — | — | default → omitted | — |
| V05-B | — | owambe → traditional-event | — | — | — | confirmed_assigned_set → synthetic confirmed wardrobe group | default → omitted | Royal blue lace iro and buba (aso-ebi) [set/iro and buba] → dress/iro-and-buba; Royal blue gele (aso-ebi) [accessory/gele] → jewelry/gele |
| V05-C | — | date → date-dressy | — | — | — | — | default → omitted | — |
| V05-D | — | church → event | — | — | — | — | default → omitted | — |
| V05-E | — | church → event | — | null → not-sure | — | — | default → omitted | — |
| V06-A | naming_ceremony → naming-ceremony | naming_ceremony → traditional-event | — | — | — | null → none | default → omitted | Lilac Swiss voile iro and buba [set/iro and buba] → dress/iro-and-buba; Lilac gele [accessory/gele] → jewelry/gele |
| V06-B | — | church → event | — | — | — | — | default → omitted | — |
| V06-C | — | funeral → event | — | — | "ash and white" → grey, white | — | default → omitted | Ash head tie [accessory/head tie] → jewelry/head-tie |
| V06-D | — | — | — | — | — | — | default → omitted | — |
| V06-E | traditional_wedding → traditional-wedding | traditional_wedding → traditional-event | mother_of_the_bride → family | — | — | confirmed_assigned_set → synthetic confirmed wardrobe group | default → omitted | Gold gele [accessory/gele] → jewelry/gele; Synthetic non-selected group item "wine and gold lace aso-ebi" → dress/aso-ebi |

## Dropped or lossy fields

- V02-C: role "guest" is not accepted for the route's general wedding brief
- V02-C: denomination "catholic" is not accepted for the route's general wedding brief
- V03-A: role "guest" is not accepted for the route's general wedding brief
- V04-E: announced_colours "coral red and wine" dropped: the route accepts announced colours only for funerals
- All source persona text and source item display names are excluded by the production exporter.
- The exporter does not emit fit, neckline, formality, or occasionTags. sleeveLength is null for all supplied items.
- Non-allowlisted item colour "blue and orange" becomes unknown in the export: V01-B (Ankara shift dress)
- Non-allowlisted item colour "champagne" becomes unknown in the export: V01-C (Silk camisole)
- Non-allowlisted item colour "nude" becomes unknown in the export: V01-D (Nude block heels), V05-D (Nude flats), V05-E (Nude block heels)
- Non-allowlisted item colour "emerald" becomes unknown in the export: V01-E (Slip dress), V03-A (Lace abaya), V03-A (Emerald hijab)
- Non-allowlisted item colour "ivory" becomes unknown in the export: V02-A (Ivory silk blouse), V02-C (Ivory lace midi dress)
- Non-allowlisted item colour "stone" becomes unknown in the export: V02-A (Stone trench coat)
- Non-allowlisted item colour "tan" becomes unknown in the export: V02-E (Tan leather sandals), V03-C (Tan flats)
- Non-allowlisted item colour "wine" becomes unknown in the export: V04-A (Wine George wrapper), V04-A (Wine ichafu), V04-C (Wine George wrapper), V04-C (Wine ichafu)
- Non-allowlisted item colour "green and yellow" becomes unknown in the export: V04-D (Ankara midi skirt)
- Non-allowlisted item colour "coral red" becomes unknown in the export: V04-E (Coral red lace gown), V04-E (Coral red ichafu)
- Non-allowlisted item colour "royal blue" becomes unknown in the export: V05-B (Royal blue lace iro and buba (aso-ebi)), V05-B (Royal blue gele (aso-ebi))
- Non-allowlisted item colour "lilac" becomes unknown in the export: V05-E (Sleeveless midi dress), V06-A (Lilac Swiss voile iro and buba), V06-A (Lilac gele)
- Non-allowlisted item colour "ash" becomes unknown in the export: V06-C (Ash lace wrapper), V06-C (Ash head tie)
- Fabric "polyester blend" is outside ALL_FABRICS and is omitted: V01-A (Navy tailored trousers), V01-B (Black blazer), V05-A (Navy skirt suit)
- Fabric "wool blend" is outside ALL_FABRICS and is omitted: V01-A (Navy blazer), V02-B (Burgundy knit dress), V02-C (Camel coat)
- Fabric "sequin" is outside ALL_FABRICS and is omitted: V02-D (Black sequin top), V03-E (Sequin mini dress)
- Fabric "crepe" is outside ALL_FABRICS and is omitted: V02-D (Black tailored trousers), V03-D (Sleeveless midi dress), V04-B (Black skirt), V05-E (Sleeveless midi dress), V06-B (Navy midi skirt)
- Fabric "George" is outside ALL_FABRICS and is omitted: V04-A (Wine George wrapper), V04-C (Wine George wrapper)
- Fabric "Swiss voile" is outside ALL_FABRICS and is omitted: V06-A (Lilac Swiss voile iro and buba)
- Subtype "block sandals" is not emitted verbatim by the safe subtype allowlist: V01-E (Gold block sandals → shoes), V03-D (Gold block sandals → shoes)
- Subtype "trench coat" is not emitted verbatim by the safe subtype allowlist: V02-A (Stone trench coat → outerwear)
- Subtype "abaya" is not emitted verbatim by the safe subtype allowlist: V03-A (Lace abaya → dress), V03-C (Cream abaya → dress)
- Subtype "kimono jacket" is not emitted verbatim by the safe subtype allowlist: V03-D (Long cream kimono jacket → outerwear)
- Subtype "low heels" is not emitted verbatim by the safe subtype allowlist: V04-A (Gold low heels → shoes), V04-C (Gold low heels → shoes), V06-B (Navy low heels → shoes)
- Subtype "head tie" is not emitted verbatim by the safe subtype allowlist: V04-B (White head tie → jewelry), V06-C (Ash head tie → jewelry)
- Subtype "flat sandals" is not emitted verbatim by the safe subtype allowlist: V04-B (Black flat sandals → shoes), V06-C (Grey flat sandals → shoes)
- Subtype "t-shirt" is not emitted verbatim by the safe subtype allowlist: V04-D (White cotton top → top), V05-C (Cropped white tee → top)
- Subtype "skirt suit" is not emitted verbatim by the safe subtype allowlist: V05-A (Navy skirt suit → dress)
- Subtype "shorts" is not emitted verbatim by the safe subtype allowlist: V05-C (Denim shorts → bottom)
- Subtype "trainers" is not emitted verbatim by the safe subtype allowlist: V05-C (White trainers → shoes)

## Synthetic assigned groups

- V05-B: confirmed group contains the selected iro-and-buba set garment and selected royal-blue gele, as instructed.
- V06-E: confirmed group contains one non-selected synthetic dress/aso-ebi garment with lace fabric and unknown colour from the stated wine-and-gold description. It is included in the wardrobe/group context but not in the selected-item list.

No gold labels were supplied or edited. The approved normalisations alter the model input payload, but do not alter any gold label.
