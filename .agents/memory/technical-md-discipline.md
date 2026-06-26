---
name: TECHNICAL.md update discipline
description: User requires TECHNICAL.md to be updated for every merged feature or fix — task agents don't do this automatically, main agent must catch it.
---

# TECHNICAL.md update discipline

## The rule
After every task merge (or when implementing changes directly), TECHNICAL.md must be updated in the same session. The user has explicitly said they should not have to double-check this.

**Why:** Task agents run in isolation and do not update TECHNICAL.md. Main agent is the only one who can be relied upon to keep it current. Letting it drift means the next developer (or agent) onboards blind.

## How to apply
- When a task merges (visible in `<automatic_updates>`), immediately check whether the change affects any section of TECHNICAL.md (§4 Architecture, §5 Folder Structure, §8 Scripts, §9 Features, §10 Pending, §11 Testing, §12 Conventions).
- If it does, update TECHNICAL.md before or alongside any other work in that session.
- Sections most commonly affected by task merges:
  - §4 Architecture — auth flow, data flow, new patterns
  - §5 Folder Structure — new files or directories
  - §8 Development Setup — script count changes
  - §9 Implemented Features — any new user-facing feature or significant internal mechanism
  - §11 Testing — new test suites (update count + table row)
- Test suite count appears in three places — keep all three in sync:
  1. `__tests__/` comment in §5 Folder Structure
  2. `npm test` row description in §8 Development Setup
  3. "Test Suites (N total)" heading in §11 Testing & Quality
