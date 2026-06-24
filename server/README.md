# AuraCloset Backend — Garment Classification API

## Setup

### 1. Set the Gemini API Key

In Replit, go to **Tools > Secrets** and add:

- **Key**: `GEMINI_API_KEY`
- **Value**: Your Google Gemini API key (must have access to `gemini-flash-lite-latest` and `gemini-2.5-flash`)

### 2. Start the Backend

The backend starts automatically via the **Start Backend** workflow, which runs `npm run server:dev`. It listens on port 5000.

---

## API: POST /api/classify-garment

Classifies a garment image using Google Gemini AI and maps the result to AuraCloset's internal schema.

**Model strategy:** The primary model is `gemini-flash-lite-latest`. If that model returns a 429 (quota exceeded), the request is automatically retried once against `gemini-2.5-flash`. Any non-429 error from the primary model surfaces immediately without a retry.

### Request

```
POST /api/classify-garment
Content-Type: application/json
```

#### Body

```json
{
  "imageBase64": "string (optional — base64 JPEG/PNG without data: prefix)",
  "imageUrl": "string (optional — HTTPS URL of the image)",
  "userId": "string (optional — for logging)"
}
```

**Validation**: Exactly one of `imageBase64` or `imageUrl` must be provided. If both or neither are present, the endpoint returns `400`.

**Body size limit**: 10 MB (to accommodate base64-encoded images).

### Successful Response (200)

```json
{
  "category": "top",
  "subType": "knit-top",
  "colorFamily": "cream",
  "accentColor": null,
  "description": "Cream knit top",
  "occasionTags": ["casual", "brunch"],
  "seasonTags": ["spring", "autumn"],
  "pattern": "solid",
  "patternScale": null,
  "fit": "regular",
  "neckline": "crew",
  "sleeveLength": "long",
  "rise": null,
  "warmthBand": "mild",
  "fabric": "knit",
  "weight": "medium",
  "dominantHsl": { "h": 45, "s": 0.18, "l": 0.91 },
  "dominantLab": { "L": 91.2, "a": -0.4, "b": 5.1 },
  "modelConfidence": 0.93,
  "source": "gemini"
}
```

#### Field descriptions

| Field | Type | Description |
|---|---|---|
| `category` | string | Top-level garment category: `top`, `bottom`, `dress`, `outerwear`, `shoes`, `bag`, or `jewelry` |
| `subType` | string or null | Specific garment subtype within the category (see Supported Subtypes below). `null` when Gemini cannot determine a valid subtype. |
| `colorFamily` | string or null | Dominant colour bucket (see Supported Colour Families below), or `null` |
| `accentColor` | string or undefined | Secondary accent colour from the same colour family list, when the item has a distinct two-tone palette. Omitted when not present. |
| `description` | string | Server-derived summary combining colour and display name (e.g. `"Cream knit top"`) |
| `occasionTags` | string[] | Occasion suitability tags derived from subtype: one or more of `casual`, `work`, `date`, `event`, `brunch`, `active`, `resort`, `night-out` |
| `seasonTags` | string[] | Season suitability derived from subtype and fabric: one or more of `spring`, `summer`, `autumn`, `winter` |
| `pattern` | string or null | Surface pattern: `solid`, `stripe`, `floral`, `check`, `print`, `color-block`, `geometric`, `animal` |
| `patternScale` | string or null | Scale of the pattern: `small`, `medium`, `large`, or `null` |
| `fit` | string or null | Silhouette: `slim`, `regular`, `loose`, `oversized`, `tailored`, or `null` |
| `neckline` | string or null | Neckline shape: `crew`, `v-neck`, `scoop`, `turtleneck`, `boat`, `square`, `halter`, `off-shoulder`, `collared`, or `null` |
| `sleeveLength` | string or null | Sleeve length: `sleeveless`, `short`, `three-quarter`, `long`, or `null` |
| `rise` | string or null | Waistband rise (bottoms only): `low`, `mid`, `high`, or `null` |
| `warmthBand` | string or null | Thermal weight band: `cold`, `cool`, `mild`, `warm`, `hot`, or `null` |
| `fabric` | string or null | Primary fabric: `cotton`, `linen`, `silk`, `chiffon`, `satin`, `wool`, `cashmere`, `knit`, `denim`, `leather`, `suede`, `velvet`, `corduroy`, `tweed`, `jersey`, `synthetic`, or `null` |
| `weight` | string or null | Thermal weight derived from fabric (`light`, `medium`, `heavy`), or `null` |
| `dominantHsl` | object or undefined | Perceptual HSL values `{ h, s, l }` derived from the representative RGB Gemini reported. Used by the outfit scoring engine for colour harmony. Omitted when no RGB is available. |
| `dominantLab` | object or undefined | Perceptual CIE Lab values `{ L, a, b }` derived from the same representative RGB. Used by the outfit scoring engine. Omitted when no RGB is available. |
| `modelConfidence` | number | Gemini's self-reported confidence for the classification (0–1) |
| `source` | string | Always `"gemini"` |

#### Supported categories and subtypes

| Category | Subtypes |
|---|---|
| `top` | `t-shirt`, `long-sleeve`, `polo-shirt`, `henley`, `rugby-shirt`, `tank-top`, `crop-top`, `shirt`, `button-down`, `blouse`, `sweater`, `cardigan`, `turtleneck`, `knit-top`, `camisole`, `hoodie`, `sweatshirt`, `sports-bra`, `sports-hoodie`, `rashguard`, `sequin-top`, `linen-set` |
| `bottom` | `jeans`, `trousers`, `chinos`, `wide-leg`, `joggers`, `shorts`, `leggings`, `mini-skirt`, `midi-skirt`, `maxi-skirt`, `pencil-skirt` |
| `dress` | `midi-dress`, `maxi-dress`, `mini-dress`, `wrap-dress`, `shirt-dress`, `cocktail-dress`, `knit-dress`, `bodycon-dress`, `slip-dress`, `gown`, `sundress`, `resort-dress`, `cover-up`, `kaftan` |
| `outerwear` | `blazer`, `coat`, `peacoat`, `trench`, `jacket`, `hoodie`, `bomber-jacket`, `leather-jacket`, `puffer`, `raincoat`, `vest`, `denim-jacket`, `windbreaker` |
| `shoes` | `sneakers`, `training-shoes`, `heels`, `pumps`, `stilettos`, `strappy-heels`, `block-heels`, `flats`, `boots`, `ankle-boots`, `sandals`, `espadrilles`, `loafers`, `mules` |
| `bag` | `tote`, `crossbody`, `clutch`, `backpack`, `shoulder-bag`, `mini-bag`, `gym-bag`, `wicker-bag`, `evening-bag`, `beach-bag` |
| `jewelry` | `necklace`, `earrings`, `bracelet`, `ring`, `watch`, `brooch`, `statement-earrings`, `sunglasses`, `sunhat` |

#### Supported colour families

`black`, `white`, `grey`, `cream`, `beige`, `camel`, `brown`, `red`, `burgundy`, `coral`, `orange`, `yellow`, `olive`, `green`, `blue`, `navy`, `lavender`, `pink`

### Content Guardrails

The endpoint rejects images that are not suitable for classification (e.g. selfies, blurry photos, non-clothing subjects). These return:

```
422 { "error": "content_guardrail" }
```

### Error Responses

| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "imageBase64 or imageUrl required" }` | Both or neither image fields provided |
| 422 | `{ "error": "content_guardrail" }` | Image rejected by Gemini content guardrails (selfie, blurry, non-clothing) |
| 429 | `{ "error": "rate_limited", "detail": "..." }` | Quota exceeded on both primary and fallback Gemini models |
| 500 | `{ "error": "missing_gemini_api_key" }` | `GEMINI_API_KEY` not set in environment |
| 500 | `{ "error": "classification_failed" }` | Gemini API error or other server error |

---

## Implementation

- **File**: `server/classify-garment.ts`
- **Registered in**: `server/routes.ts`
- **Rate limiting**: 10 requests per minute per IP (enforced by `server/middleware/rateLimiter.ts`)
- **HTTP client**: `axios` (for Gemini API calls)
