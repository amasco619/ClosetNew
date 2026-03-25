# AuraCloset Backend — Garment Classification API

## Setup

### 1. Set the Google Cloud Vision API Key

In Replit, go to **Tools > Secrets** and add:

- **Key**: `GCV_API_KEY`
- **Value**: Your Google Cloud Vision API key (must have Label Detection enabled)

### 2. Start the Backend

The backend starts automatically via the **Start Backend** workflow, which runs `npm run server:dev`. It listens on port 5000.

---

## API: POST /api/classify-garment

Classifies a garment image using Google Cloud Vision Label Detection and maps the result to AuraCloset's internal schema.

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
  "userId": "string (optional — for logging/personalization)"
}
```

**Validation**: Exactly one of `imageBase64` or `imageUrl` must be provided. If both or neither are present, the endpoint returns `400`.

### Successful Response (200)

```json
{
  "garmentType": "zip_up_hoodie",
  "colorFamily": "grey",
  "description": "Grey zip-up hoodie",
  "modelConfidence": 0.94,
  "rawLabels": [
    { "description": "Hoodie", "score": 0.94 },
    { "description": "Jacket", "score": 0.91 },
    { "description": "Outerwear", "score": 0.89 },
    { "description": "Grey", "score": 0.85 },
    { "description": "Clothing", "score": 0.82 }
  ],
  "source": "gcv_label_detection"
}
```

#### Field descriptions

| Field | Type | Description |
|---|---|---|
| `garmentType` | string | Normalized AuraCloset type (e.g. `zip_up_hoodie`, `t_shirt`, `jeans`, `dress`) or `"unknown"` |
| `colorFamily` | string or null | Simple color bucket (`black`, `white`, `grey`, `blue`, etc.) or `null` |
| `description` | string | Human-readable summary combining color and garment type (e.g. `"Grey zip-up hoodie"`, `"Jacket"`) |
| `modelConfidence` | number | Score (0–1) of the label that produced `garmentType` |
| `rawLabels` | array | Top 5 raw labels from Google Vision (description + score) |
| `source` | string | Always `"gcv_label_detection"` |

#### Supported garment types

`zip_up_hoodie`, `sweatshirt`, `jacket`, `coat`, `shirt`, `t_shirt`, `blouse`, `jeans`, `trousers`, `skirt`, `dress`

#### Supported color families

`black`, `white`, `grey`, `blue`, `red`, `green`, `brown`, `beige`, `yellow`, `pink`, `purple`, `orange`

### Error Responses

| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "imageBase64 or imageUrl required" }` | Both or neither image fields provided |
| 500 | `{ "error": "missing_gcv_api_key" }` | GCV_API_KEY not set in environment |
| 500 | `{ "error": "classification_failed" }` | Google Vision API error or other server error |
