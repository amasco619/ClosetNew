---
name: Expo EXPO_PUBLIC_ env vars and .env files
description: Why creating a .env file with placeholder values breaks Supabase and how to avoid it
---

Expo inlines `EXPO_PUBLIC_*` variables at **bundle time** by reading `.env` files via its own `@expo/env` loader. If a `.env` file exists with `placeholder` or any wrong value, it overrides the real Replit secrets that are available in `process.env`.

**Why:** Replit secrets appear in `process.env` at runtime. But Expo's bundler reads `.env` files first and embeds those values into the bundle, before OS env vars can win. Even if the Replit secret is set, a `.env` file with a wrong value silently wins.

**How to apply:** Never create a `.env` file for `EXPO_PUBLIC_*` variables in this project. Set them exclusively as Replit secrets. If a `.env` file is accidentally created with placeholders, delete it immediately with `rm .env` (the `write` tool blocks `.env` edits, so use bash).
