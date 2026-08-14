# AMODKA — OPERATOR ACTIONS REQUIRED

**Phase 5B.1 | Date:** 2026-08-14  
**Prepared for:** Non-developer operator with Supabase dashboard access  
**Prepared by:** Amodka Engineering

---

## BEFORE YOU BEGIN

Read this page from start to finish before touching anything.

**You will need:**

- Your Supabase project open in a browser (go to [supabase.com](https://supabase.com) → sign in → open your Amodka project)
- Your Supabase **Service Role Key** — found at: Project Settings → API → "service_role" key. Keep this secret. Do not share it.
- Your Supabase **Project URL** — found at: Project Settings → API → "Project URL"
- Access to the Replit shell (left sidebar in Replit → Shell tab)

**You must do these actions in order.** Do not skip ahead. Each step depends on the previous one being correct. The one exception is Action 5 (tryon-photos) and Action 6 (permission string), which are independent and can be done at any time.

**A note on reversibility:** Most of these actions can be undone. The rollback instruction is included in every action. If something looks wrong, stop and reverse it rather than continuing.

---

## IMPORTANT: DO NOT set wardrobe-images to PRIVATE until ALL of the following are true

- [ ] Action 1 (dry-run migration) has been completed and shows **0 missing objects**
- [ ] Action 2 (live migration) has been completed successfully
- [ ] Action 3 (RLS security rules) has been applied in the database
- [ ] You have verified the app still shows wardrobe photos correctly after Action 3

Only then proceed to Action 4.

---

## ACTION 1 — Check Which Database Rows Need Updating (Dry Run)

### What to do

Run a read-only check that scans the database and reports which wardrobe image rows still contain old-style public URLs instead of the newer storage paths. This step makes zero changes — it only reads and reports.

### Where to do it

In the Replit shell. This is the terminal panel in Replit (look for a "Shell" tab in the bottom panel or left sidebar).

### What to click / type

1. Click into the Shell tab in Replit.
2. Type or paste the following command exactly, replacing the two placeholder values with your real Supabase credentials:

```
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co SUPABASE_SECRET_KEY=YOUR-SERVICE-ROLE-KEY npx ts-node --esm scripts/migrate-legacy-storage-urls.ts --dry-run
```

Replace `https://YOUR-PROJECT-REF.supabase.co` with your Project URL.  
Replace `YOUR-SERVICE-ROLE-KEY` with your service_role key.

3. Press Enter and wait for it to finish (usually under a minute).

### What value to enter

Your Supabase Project URL and service_role key (from Project Settings → API in your Supabase dashboard). The service_role key is the long key labelled "service_role" — not the "anon" key.

### What NOT to change

Do not remove the `--dry-run` flag from the end of the command. Without it the script will make changes to the database. This step is read-only — if you want to keep it that way, the `--dry-run` flag must be present.

### How to verify success

The script prints a report. You are looking for one line in particular:

```
Rows with missing objects: 0
```

If that number is **0**: you are clear to continue to Action 2.

If that number is **anything other than 0**: stop. Do not continue to Action 2. Copy the output and share it with the engineering team. There are database rows that reference images which no longer exist in Storage — those must be investigated before anything else is done.

### What could go wrong

- **"Command not found" error:** Make sure you are in the Replit shell and the project is open. Try running `ls` first to confirm you are in the project folder.
- **Authentication error / "Invalid API key":** Double-check that you copied the service_role key (not the anon key) and that you replaced the placeholder text exactly.
- **Connection timeout:** Your Supabase project may be paused. Go to your Supabase dashboard and check whether the project is active.

### Whether it is reversible

Yes — fully reversible. This step makes no changes whatsoever. It is read-only.

---

## ACTION 2 — Update the Database Rows (Live Run)

### What to do

Run the same script as Action 1, but this time without the `--dry-run` flag. This updates the database rows that were identified in the dry run — it converts old-style public image URLs to storage paths.

### Where to do it

In the Replit shell (same place as Action 1).

### What to click / type

1. Click into the Shell tab in Replit.
2. Type or paste the following command, replacing the two placeholder values with your real credentials:

```
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co SUPABASE_SECRET_KEY=YOUR-SERVICE-ROLE-KEY npx ts-node --esm scripts/migrate-legacy-storage-urls.ts
```

This is the same as Action 1 but with `--dry-run` removed from the end.

3. Press Enter and wait for it to finish.

### What value to enter

Same Supabase Project URL and service_role key as Action 1.

### What NOT to change

- Do not add `--dry-run` back (that would undo the live run behaviour)
- Do not close the terminal while the script is running
- Do not delete any files or objects from Supabase Storage — this script updates database rows only; the image files in Storage are untouched

### How to verify success

The script prints a report similar to the dry run. You are looking for:

```
Successfully resolved: N
Rows with missing objects: 0
```

Where N matches (or is close to) the "Requires migration" number from the dry run. If those two numbers match and missing objects is 0: success.

### What could go wrong

- **Script fails partway through:** Safe to re-run. The script is designed to skip rows it has already processed, so running it again will pick up from where it left off.
- **"Rows with missing objects" is greater than 0 again:** The same issue as in Action 1. Stop and investigate with the engineering team before proceeding.

### Whether it is reversible

Partially. The database rows have been updated. The old public URL values are gone from the database. However, the actual image files in Storage are unchanged and still exist — setting the bucket back to public (if needed) will make those images accessible again via public URLs. The database rows themselves cannot be automatically reverted, but the images are safe.

---

## ACTION 3 — Apply Security Rules to the Database

### What to do

Run a SQL script in the Supabase dashboard that enables Row-Level Security (RLS) on all application tables. This is the security measure that ensures one user cannot access another user's data.

### Where to do it

In the Supabase dashboard → SQL Editor.

### What to click

1. Go to [supabase.com](https://supabase.com) and open your Amodka project.
2. In the left sidebar, click **SQL Editor** (it looks like a terminal icon or is labelled "SQL").
3. At the top of the SQL Editor panel, click the **New query** button (usually a "+" icon or a button in the top right).
4. A blank text area will appear.

### What value to enter

1. In Replit, open the file `supabase/migrations/20260814000000_rls_all_tables.sql` (use the file tree on the left side of Replit to navigate to it).
2. Click inside the file, press **Ctrl+A** (Windows/Linux) or **Cmd+A** (Mac) to select all the text.
3. Press **Ctrl+C** (or **Cmd+C**) to copy.
4. Click inside the blank text area in the Supabase SQL Editor.
5. Press **Ctrl+V** (or **Cmd+V**) to paste.
6. Click the green **Run** button (or press **Ctrl+Enter**).

### What NOT to change

- Do not edit the SQL text before running it. Run it exactly as it appears in the file.
- Do not change any of the policy names — the script uses those exact names to avoid creating duplicates.
- Do not delete any existing tables or rows — this script only adds security policies; it does not touch any data.

### How to verify success

After the script runs, check that no red error messages appeared. Then verify:

1. In the Supabase left sidebar, click **Table Editor**.
2. Click on the `wardrobe_items` table.
3. Look for a **Policies** or **RLS** tab (the exact label depends on your Supabase version).
4. You should see "RLS Enabled" and a list of policies (there should be four: one for SELECT, one for INSERT, one for UPDATE, one for DELETE).
5. Repeat the same check for: `wear_logs`, `affinity_signals`, `rotation_cursors`, `slot_statuses`, `tryon_profiles`, `saved_looks`.
6. In the left sidebar, click **Storage**, then **Policies**, then click on `wardrobe-images`. You should see Storage policies listed there.

### What could go wrong

- **Error message mentioning a table that does not exist:** One of the tables in the script may not be present in your database. Note which table caused the error and share it with the engineering team. The other tables' policies likely still applied successfully.
- **Nothing happened / empty result:** The script may have run but found that all policies already exist (which is fine — the script is designed to skip duplicates). Check the policy list as described above to confirm.

### Whether it is reversible

Yes. Security policies can be removed (dropped) via SQL, and RLS can be disabled on any table via the Supabase dashboard. This will not delete any data.

---

## ACTION 4 — Set the Wardrobe Image Storage to Private

### ⚠️ ONLY do this AFTER Actions 1, 2, and 3 are complete and verified.

### What to do

Change the `wardrobe-images` storage bucket from Public to Private. Currently, anyone who has a storage URL can access any user's garment photos permanently. After this change, only the Amodka app (using short-lived signed URLs) can access those photos.

### Where to do it

In the Supabase dashboard → Storage.

### What to click

1. In your Supabase project, click **Storage** in the left sidebar.
2. You will see a list of buckets. Find **wardrobe-images** and click on it.
3. Look for one of the following options (the exact UI varies by Supabase version):
   - A **gear icon** or **three-dot menu (⋯)** next to the bucket name → click it → click **Edit bucket**
   - Or a settings/configuration panel that appears on the right when you click the bucket
4. Find the option labelled **Public bucket** (it will be toggled ON currently).
5. Click the toggle to turn it **OFF**.
6. Click **Save** or **Update** to confirm.

### What value to enter

No text value to enter. You are toggling a switch from ON to OFF.

### What NOT to change

- Do not delete the bucket
- Do not delete any objects (image files) inside the bucket
- Do not change the bucket name
- Do not change any other settings — only the Public/Private toggle

### How to verify success

**Step 1 — Confirm the bucket is private:**
In the Storage panel, the `wardrobe-images` bucket should now show a "Private" label or indicator instead of "Public".

**Step 2 — Test that public access is blocked:**
1. Find any old garment image URL. The format of a public URL is:
   `https://YOUR-PROJECT-REF.supabase.co/storage/v1/object/public/wardrobe-images/SOME-PATH`
2. Try opening that URL in your browser.
3. You should receive an error page (a "400 Bad Request" or "403 Forbidden" response). If you get an error, the bucket is correctly private.

**Step 3 — Test that the app still works:**
1. Open the Amodka app.
2. Navigate to the wardrobe screen.
3. Confirm that all garment photos still load and display correctly. They should — the app uses signed URLs, not public URLs.

### What could go wrong

- **Garment photos show as broken images in the app after switching to private:** This means some rows in the database still contain old public URLs and Action 2 was not fully completed. Immediately set the bucket back to Public (see rollback below), then re-run Action 2, then come back to Action 4.
- **The toggle or edit option is not visible:** Try refreshing the Supabase dashboard. If still not visible, contact Supabase support or engineering.

### Whether it is reversible

Yes. You can set the bucket back to Public at any time using the same steps (toggle ON instead of OFF). No data or images will be lost. Users' apps will show images again immediately after you switch back to Public.

**Rollback procedure if photos break:**

1. Go to Supabase → Storage → wardrobe-images → Edit bucket → toggle Public **ON** → Save.
2. Confirm the app shows photos again.
3. Re-run Action 2 from the Replit shell.
4. Confirm the dry run (Action 1) shows 0 missing objects.
5. Then repeat Action 4.

---

## ACTION 5 — Secure the Try-On Photo Storage (Independent)

### What to do

The `tryon-photos` storage bucket is currently public but is not used by any screen in the Amodka app. It should be set to private or removed to avoid leaving an unnecessary public storage area.

**Recommended: Set it to private.**

### Where to do it

In the Supabase dashboard → Storage.

### What to click

**Option A — Set to private (recommended if you want to preserve the bucket for future use):**

1. Supabase → Storage → click on **tryon-photos**.
2. Click the gear/three-dot menu → **Edit bucket**.
3. Toggle **Public bucket** to **OFF**.
4. Click **Save**.

**Option B — Delete the bucket (if you confirm it is empty and you do not need it):**

1. Supabase → Storage → click on **tryon-photos**.
2. First check: confirm the bucket shows 0 objects (no files inside it).
3. If empty: click the gear/three-dot menu → **Delete bucket** → confirm.

### What value to enter

No text value required — just a toggle (Option A) or a delete confirmation (Option B).

### What NOT to change

- If using Option B (delete), confirm the bucket is empty first. Do not delete a bucket containing files.
- If you delete the bucket, notify the engineering team — a one-line code change is needed in `server/routes.ts` to remove the cleanup reference to this bucket from the account deletion route.

### How to verify success

**Option A:** The bucket shows "Private" indicator. Test a public URL for the bucket — it should return an error.

**Option B:** The bucket no longer appears in the Storage bucket list.

### What could go wrong

- **Bucket has objects inside it (Option B):** Do not delete it. Switch to Option A (set to private) and notify the engineering team.

### Whether it is reversible

Option A (private): Yes — set back to public at any time.  
Option B (delete): No — a deleted bucket cannot be recovered. Only delete if empty.

---

## ACTION 6 — Remove Unused Location Permission (Before App Store Submission)

### What to do

Remove one line from the app configuration file (`app.json`) that declares a location permission the app does not actually use. Apple App Review may reject the app if it declares an always-on location permission without using it.

**Note:** This action is only needed before submitting to the Apple App Store. It does not affect the running app until a new build is submitted.

### Where to do it

In the Replit code editor.

### What to click

1. In Replit, open the file tree (left sidebar).
2. Click on the file `app.json` at the root of the project.
3. The file will open in the code editor.
4. Press **Ctrl+F** (Windows/Linux) or **Cmd+F** (Mac) to open the search bar.
5. Search for: `locationAlwaysAndWhenInUse`
6. Find the line that contains that text.
7. Delete the entire line (click at the beginning of the line, hold Shift and press the Down arrow key to select the whole line, then press Delete or Backspace).
8. Make sure there are no syntax errors — the JSON must remain valid. If the line you deleted had a comma at the end and it was the last item in a list, remove the comma from the line above it too.
9. Press **Ctrl+S** (or **Cmd+S**) to save.

### What value to enter

Nothing — you are deleting a line, not entering a value.

### What NOT to change

- Do not remove `NSLocationWhenInUseUsageDescription` — this is a different, required permission that must stay.
- Do not change any other lines in `app.json`.

### How to verify success

After saving `app.json`:
1. Search for `locationAlwaysAndWhenInUse` again.
2. It should show "No results found."
3. The line `NSLocationWhenInUseUsageDescription` should still be present.

### What could go wrong

- **The app fails to start after this change:** A JSON syntax error was introduced. Open `app.json` again, look for a missing or extra comma, and correct it. You can also undo the change by pressing **Ctrl+Z** (or **Cmd+Z**) multiple times until the line is restored.

### Whether it is reversible

Yes — the line can be added back at any time.

---

## SUMMARY CHECKLIST

Use this checklist to track your progress. Do not mark Action 4 complete until Actions 1, 2, and 3 are done.

| # | Action | Must be done before | Done? |
|---|---|---|---|
| 1 | Dry-run migration — confirm 0 missing objects | Action 2 | ☐ |
| 2 | Live migration — update database rows | Action 3 | ☐ |
| 3 | Apply RLS security rules in SQL Editor | Action 4 | ☐ |
| 4 | Set wardrobe-images bucket to PRIVATE | — | ☐ |
| 5 | Set tryon-photos to PRIVATE or delete (independent) | — | ☐ |
| 6 | Remove unused location permission from app.json (before App Store submission only) | App Store submission | ☐ |

---

## IF SOMETHING GOES WRONG

| Problem | Immediate action | Then |
|---|---|---|
| Wardrobe photos show as broken in the app after Action 4 | Set wardrobe-images bucket back to Public immediately | Re-run Action 2 from the shell, then repeat Action 4 |
| Action 1 shows missing objects > 0 | Stop. Do not continue. | Share the full output with the engineering team |
| SQL Editor shows errors after Action 3 | Note which table caused the error | Share with engineering team — other tables likely applied successfully |
| The app stops working entirely | Reverse the most recent action you completed | Share the error message with the engineering team |

---

## WHO TO CONTACT

If any action produces an unexpected result, contact the engineering team before continuing. Do not attempt to undo database changes without guidance if you are unsure of the impact.

---

*Operator Actions Required — Phase 5B.1 | 2026-08-14*
