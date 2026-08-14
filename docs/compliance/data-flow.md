# Amodka — Data Flow Map

**Phase 5B | Date:** 2026-08-14  
**Status:** Verified against source code. No flows invented.

---

## 1. Authentication

```
User (email + password)
    │
    ├──[HTTPS POST /api/auth/sign-in]──► Amodka Express server
    │         (validated: format, length)
    │                  │
    │         supabaseAuth.signInWithPassword(email, password)
    │                  │
    │               Supabase Auth
    │                  │
    │         ◄── JWT access token + refresh token
    │                  │
    │         ◄── returned to client in JSON response
    │
    └── Client stores tokens in Expo SecureStore (native) / sessionStorage (web)
         Auto-refresh handled by @supabase/supabase-js on SIGNED_IN event
```

**What Supabase Auth receives:** email (hashed for storage), cleartext password (over HTTPS, hashed by Supabase).  
**What leaves Amodka's infrastructure:** email and password go to Supabase. Supabase is the processor.  
**Data minimisation:** the sign-in proxy strips and validates input; no session tokens are logged.

---

## 2. Wardrobe Image Upload

```
User (photo from camera / photo library)
    │
    │ [Client: app/add-item.tsx or app/bulk-review.tsx]
    │
    ├──[1. Optional: HTTPS POST /api/remove-background]──► Amodka server
    │         Payload: {imageBase64: string}
    │         Auth: Bearer JWT
    │                  │
    │         PhotoRoom SDK (/v1/segment)
    │                  │  Receives: image bytes (JPEG, named "garment.jpg")
    │                  │  Returns: background-removed PNG
    │                  │
    │         Server returns: {cleanBase64: string}
    │         (original not returned or stored server-side beyond the request)
    │
    ├──[2. HTTPS POST /api/classify-garment]──► Amodka server
    │         Payload: {imageBase64: string} (original OR PhotoRoom output)
    │         Auth: Bearer JWT
    │                  │
    │         Google Gemini API (/v1beta/models/gemini-*/generateContent)
    │                  │  Receives: image base64 + text prompt
    │                  │  Returns: structured JSON (category, colour, fabric, …)
    │                  │  No user identity or profile metadata sent to Gemini
    │                  │
    │         Server sanitises / derives fields, returns classification
    │
    ├──[3. Supabase Storage upload]──► supabase.storage.from('wardrobe-images').upload(…)
    │         Client uploads directly to Supabase Storage using anon client + JWT
    │         Path: {userId}/{itemId}.{jpg|png}
    │         Bucket: wardrobe-images (currently PUBLIC — must be set PRIVATE)
    │         Returns: storage path (new items) used to generate signed URL for display
    │
    └──[4. Supabase DB insert]──► supabase.from('wardrobe_items').insert(…)
              Fields: id, user_id, garment_type, sub_type, color_family, description,
                      occasion, image_url (storage path), cleaned_image_url (storage path)
              Auth: anon client with JWT; RLS enforces ownership
```

**PhotoRoom receives:** image bytes only. No user ID, no account, no name.  
**Gemini receives:** image base64 + structured text prompt. No user ID, name, or profile data.  
**Supabase Storage receives:** image bytes + JWT (user identified by path prefix).

---

## 3. Profile / Preferences

```
User (onboarding / profile edit)
    │
    supabase.from('user_profiles').upsert({id: userId, name, body_type, …})
    │
    Supabase DB
    │
    Also persisted locally: AsyncStorage STORAGE_KEYS.profile (JSON)
```

**Note:** `premium` field is explicitly absent from the client upsert. Only the server-side `/api/user/upgrade-premium` endpoint can write `premium`.

---

## 4. Recommendation Request

```
User (opens Home tab or requests outfit)
    │
    Client reads from AppContext:
      - wardrobeItems (from Supabase + AsyncStorage)
      - userProfile (from Supabase + AsyncStorage)
      - weather (from AsyncStorage cache or fresh fetch — see §5)
    │
    Deterministic recommendation engine (client-side, no network call)
      - All logic in constants/outfitRotation.ts, outfitScoring.ts, etc.
      - Engine v3.7 FROZEN — not modified in Phase 5B
    │
    lib/telemetry.ts emits structured JSON to server stdout:
      event, timestamp, engine_version, user_id (opaque UUID),
      occasion, wardrobe_size, weather_context, body_type, style_goal
    │
    No recommendation data sent to external services
    No external AI called for recommendations
```

---

## 5. Weather

```
User (device)
    │
    ├──[A. GPS path — if location permission granted]
    │     Expo Location API (foreground permission)
    │     Coordinates → Open-Meteo /v1/forecast
    │       Sends: latitude, longitude, parameters (temperature, precipitation)
    │       No API key required; no user identity sent
    │     Response: temperature, precipitation probability
    │
    └──[B. IP geolocation fallback]
          fetch('https://ipapi.co/json/')
            Sends: HTTP request (IP address implicit in all HTTPS connections)
            Returns: lat, lon, city label
          → Open-Meteo (as above)

Cached in AsyncStorage @amodka_weather_v1 for 6 hours.
Not transmitted to Amodka backend.
```

**ipapi.co:** receives device IP address. No account, no API key in current implementation. Privacy policy: https://ipapi.co/privacy/ — REQUIRES BUSINESS/LEGAL VERIFICATION before production use.  
**Open-Meteo:** receives IP address + coordinates. Free service with no account. Privacy policy: https://open-meteo.com/en/terms — REQUIRES BUSINESS/LEGAL VERIFICATION.

---

## 6. Telemetry

```
App events (recommendation_requested, recommendation_generated, recommendation_empty, user_reaction)
    │
    lib/telemetry.ts → console.log (structured JSON)
    │
    Server stdout

NO external analytics SDK.
NO third-party telemetry endpoint.
Logs are environment-local (Replit container) — no persistence beyond container lifetime unless a log aggregator is piped to stdout (not currently configured).
```

---

## 7. Account Deletion

```
User confirms delete in profile.tsx
    │
    DELETE /api/user/delete-account (Bearer JWT, {userId})
    │
    Server (after Phase 5B fix):
      1. List + delete wardrobe-images/{userId}/* from Storage
      2. List + delete tryon-photos/{userId}/* from Storage
      3. DELETE FROM affinity_signals WHERE user_id = userId
      4. DELETE FROM pair_affinity_signals WHERE user_id = userId
      5. DELETE FROM rotation_cursors WHERE user_id = userId
      6. DELETE FROM wear_logs WHERE user_id = userId
      7. DELETE FROM slot_statuses WHERE user_id = userId
      8. DELETE FROM tryon_profiles WHERE user_id = userId
      9. DELETE FROM saved_looks WHERE user_id = userId
     10. DELETE FROM wardrobe_items WHERE user_id = userId
     11. DELETE FROM user_profiles WHERE id = userId
     12. supabaseAdmin.auth.admin.deleteUser(userId)
    │
    Client: signOut() + router.replace('/sign-in')
    (SIGNED_OUT event in AppContext clears all in-memory state)

Local AsyncStorage: NOT explicitly cleared on deletion in current implementation.
Cleared implicitly when user signs back in (data is overwritten).
OUTSTANDING: Explicit AsyncStorage.multiRemove([all keys]) on delete should be added — PRE-LAUNCH.
```

---

## 8. External Processor Summary

| Processor | What they receive | Purpose | Account required | Data retained by processor | DPA required |
|---|---|---|---|---|---|
| **Supabase** | All user data (auth, DB, storage) | Infrastructure | Yes (project-level) | Yes — persistent storage | Yes — REQUIRES CONTRACT VERIFICATION |
| **Google Gemini** | Garment images (base64) | Image classification | Yes (API key) | REQUIRES VERIFICATION — see Track H | Yes — REQUIRES CONTRACT VERIFICATION |
| **PhotoRoom** | Garment images (bytes) | Background removal | Yes (API key) | REQUIRES VERIFICATION — see Track H | Yes — REQUIRES CONTRACT VERIFICATION |
| **Open-Meteo** | Lat/lon, IP (implicit) | Weather lookup | No (free, keyless) | Unknown — REQUIRES VERIFICATION | REQUIRES VERIFICATION |
| **ipapi.co** | IP address (implicit) | Approximate geolocation fallback | No (free, keyless) | Unknown — REQUIRES VERIFICATION | REQUIRES VERIFICATION |
| **Apple** | App binary; in-app payment (Phase 5C) | App distribution | Yes | Subject to App Store T&Cs | Subject to Apple Developer Agreement |
| **Google Play** | App binary; in-app payment (Phase 5C) | App distribution | Yes | Subject to Play Store T&Cs | Subject to Google Play Developer Distribution Agreement |
