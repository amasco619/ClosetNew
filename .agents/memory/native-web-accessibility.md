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
