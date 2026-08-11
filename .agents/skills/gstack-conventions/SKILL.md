---
name: gstack-conventions
description: Planning and review conventions extracted from the gstack agent framework. Use when planning features, reviewing specs, or preparing tasks to ensure completeness, adversarial review, and shipping discipline. Does NOT require the gstack CLI — these are the portable conceptual patterns only.
source: https://github.com/garrytan/gstack
---

# GStack Conventions (Portable Patterns)

These are the planning and review principles from the gstack agent framework,
extracted for use without the gstack CLI binaries.

> Note: The full gstack framework requires its own CLI toolchain (`gstack-*` binaries).
> This skill captures only the conventions applicable in any environment.

## Planning: Before You Build

1. **Question the framing before accepting it.** "Build X" is a statement about solution, not problem. Surface the real need first.
2. **Challenge scope.** For any feature request: what is the narrowest wedge that delivers real value tomorrow? Ship that first.
3. **Explicit decision log.** When making a non-obvious tradeoff, write it down: what was considered, what was chosen, and why. Future work needs this context.

## Spec / Task Discipline

Before starting implementation, be clear on:
- **What done looks like** — concrete acceptance criteria, not vague outcomes.
- **What the change touches** — read the code paths end to end before editing.
- **What can break** — name the regressions that would matter.

A weak spec ("make it work") blocks independent execution. A strong spec lets you loop to completion without returning for clarification.

## Review: Adversarial Lens

After building, run an internal adversarial review:
- What is the most likely way this fails in production?
- What did I assume that might not be true?
- What edge case exists that the happy-path test won't catch?
- Is there a security boundary this crosses or relies on?

Flag findings explicitly rather than silently patching around them.

## Shipping Discipline

- **Test coverage before merge.** Every change that can break should have a test that would catch the break.
- **Changelog entry.** Summarize what changed and why in one sentence. Helps future debugging.
- **No scope creep in the diff.** The PR/commit should contain exactly the task and nothing else. Drive-by improvements go in a follow-up.

## Design Review Lens

- Does the UI hierarchy match what users need first?
- Is any interaction more than one tap/click away from where a user naturally is?
- Does the design hold up in error, empty, and loading states — not just the happy path?

## Proactive Suggestions

When completing a task, consider:
- What related thing is most likely to break next?
- What follow-on work would compound the value of this change?
- Is there a simpler design that serves the same need?

Surface these as explicit follow-up proposals rather than silently expanding scope.
