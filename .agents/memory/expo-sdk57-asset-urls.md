---
name: Expo SDK 57 asset URLs
description: When upgrading Replit Expo projects, verify whether HTTPS development asset URL handling is already provided upstream.
---

Expo SDK 57's asset resolver derives the development-server URL scheme from the manifest base URL, including HTTPS. The older Replit-specific change from hard-coded HTTP to the manifest scheme is already included upstream.

**Why:** The obsolete patch stopped applying after the SDK upgrade; keeping it would make dependency installation fail without adding behavior.

**How to apply:** Before carrying an Expo asset patch across an SDK upgrade, inspect the installed SDK implementation and retain the patch only if equivalent HTTPS handling is absent.
