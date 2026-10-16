---
name: Native and web accessibility contract
description: Why mounted React Native prop assertions do not verify browser accessibility semantics.
---

Do not treat React Native host-mock accessibility assertions as evidence of the
rendered web accessibility contract.

**Why:** In this app, a visually selected radio had the correct native checked
state in mounted tests but no `aria-checked` in the actual browser. Dialog naming
and heading semantics also required a real DOM check.

**How to apply:** Keep appropriate native and explicit ARIA semantics together
for cross-platform UI, and verify selected/disabled states, dialog names,
headings and live regions in the rendered DOM when changing an important flow.
Browser attributes do not constitute a VoiceOver/TalkBack test.

**Device confirmation (2026-10-16):** The user tested downward swipes while
scrolled and again at the top on a physical phone, and confirmed both behaved
as expected. The operating system and screen-reader behavior were not specified.

**Why:** Gesture arbitration cannot be established from code or mounted tests
alone.

**How to apply:** Treat the current shared sheet's top-versus-scrolled gesture
behavior as device-confirmed, but re-test after gesture-handler changes and do
not infer iOS, Android, VoiceOver, or TalkBack coverage from this confirmation.
