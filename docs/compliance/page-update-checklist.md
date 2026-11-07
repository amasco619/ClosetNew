# Public Privacy and Terms Page Update Checklist

These pages are draft product disclosures, not approved legal documents. Review the page copy and this checklist whenever the relevant data flow or provider changes. Keep the in-app and public pages in sync.

| Data flow | Current status and source of truth | Update the pages when |
|---|---|---|
| Garment classification | Live. Authenticated classification routes call the configured classifier and require recorded AI-processing permission. Sources: `server/routes.ts`, `server/classify-garment.ts`, `server/classify-multi-item.ts`. | The image, prompt, metadata, provider, identity fields, permission requirement, storage, or retention changes. |
| PhotoRoom background removal | Live as an optional processing path. The server receives a garment image and calls PhotoRoom; the route requires recorded AI-processing permission. Sources: `server/routes.ts`, `server/remove-background.ts`. | The provider, inputs, outputs, optional/automatic behaviour, storage, or retention changes. |
| Gemini wardrobe-text judge | **NOT YET LIVE.** Current Check my look uses local rules and scoring; no wardrobe-text judge request is active. Source: `lib/checkLook.ts`; confirm server routes before changing this status. | Before enabling any model-based judge, update and obtain legal review of the exact wardrobe text sent, provider, purpose, retention and user controls. |
| Weather and location | Live. The app tries foreground GPS, may fall back to IP-based approximate location, requests Open-Meteo forecast data, and caches the snapshot on-device for six hours. Source: `constants/weather.ts`. | The permission, fallback, provider, fields sent, cache/retention period, or server transmission changes. |
| Account deletion | Live. The server removes the defined account-owned records and storage objects before deleting the auth user; the client clears local app data after confirmed server deletion. Sources: `server/accountDeletionInventory.ts`, `server/routes.ts`, `app/(tabs)/profile.tsx`. | Any new account-owned table, bucket, provider-side data, retained record, deletion stage, failure behaviour, or local key is introduced or changed. |

## Release review

- [ ] Confirm every statement against the current code and provider configuration.
- [ ] Resolve the legal identity, contact, retention, provider-contract and transfer details marked for review in the source documents.
- [ ] Obtain legal review of the final Privacy Policy and Terms of Service.
- [ ] Update the version, effective date and change log in `constants/complianceDocumentMeta.ts`.
- [ ] Confirm both public URLs and the in-app pages show the same version and document text.
- [ ] Remove the visible draft banner only after the final text is approved for publication.
