# Privacy Policy

## Information used by Amodka

The app uses account details such as an email address and display name, style-profile preferences, wardrobe photos and garment details, and activity such as saved looks, wear logs and reactions.

## Garment photos

When an authenticated user chooses to process a garment photo, the app may send the image to PhotoRoom for optional background removal and to Google Gemini for garment classification. The image-processing routes require an account session and the user’s recorded AI-processing permission. The classification request does not include the user’s name or profile.

## Storage

Account, profile and wardrobe records are stored with Supabase. Wardrobe photos are stored in Supabase Storage. The app also keeps some wardrobe and preference data on the device for app operation.

## Weather and location

Weather-aware outfit suggestions can use foreground device location when permission is available. If it is not available, the app can use an approximate location from the device’s internet connection. The app requests a forecast from Open-Meteo and keeps a weather snapshot on the device for up to six hours.

## Check my look

The current Check my look feature uses local rules and scoring. The planned model-based wardrobe-text judge is not live; the app does not currently send a wardrobe text block to that judge.

## Account deletion

Account deletion is available from Profile. After the server confirms deletion, the app clears the account’s defined cloud records and stored wardrobe images, removes the authentication account, and clears local app data as part of the deletion flow.

## Details still to confirm

The operator’s legal identity and contact details, provider contract and retention details, hosting region, and applicable transfer arrangements still need business or legal review before this draft is used as a final policy.

<!-- Evidence: docs/compliance/privacy-policy-source.md §§1-5, 8; docs/compliance/data-inventory.md §§2-7; server/routes.ts AI routes and account deletion; server/accountDeletionInventory.ts; app/(tabs)/profile.tsx; constants/weather.ts; lib/checkLook.ts. -->
