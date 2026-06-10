---
name: AuraCloset UI/UX Design System
description: Durable design rules derived from three reference repos — animation timing, press feedback, typography, spacing, shadows, empty states. All rules also documented in replit.md under "UI/UX Design System".
---

## Rules

**Animation**: FadeInDown at 280 ms (never 400–500 ms). Stagger delays start at 60 ms, increment ~40–60 ms per layer, cap at ~480 ms total. Use `FadeInUp` for pop-in banners.

**Press feedback**: `({ pressed }) => [base, pressed && cardPressed]`. `cardPressed = { opacity: 0.85, transform: [{ scale: 0.97 }] }`. Haptics (`Haptics.selectionAsync()`) on stat card, filter chip, and action button taps.

**Touch targets**: 44 × 44 pt minimum via `minHeight: 44` or `hitSlop={8}`.

**Typography**: Screen title = Inter_700Bold 30 px letterSpacing -0.8. Uppercase section sub-label goes *above* the main title (11–12 px, Inter_400Regular, letterSpacing +0.8). Section heading = Inter_600SemiBold 15–16 px.

**Shadows**: Standard card: `shadowColor: Colors.primary, shadowOpacity: 0.04–0.06, shadowRadius: 8–12, shadowOffset: {0, 2–4}, elevation: 1–2`. CTA button: `shadowOpacity: 0.25–0.30`. All cards also have `borderWidth: 1, borderColor: Colors.border`.

**Empty states**: icon container (80×80, borderRadius 24, `Colors.secondary + '12'` bg) + title + subtitle + primary CTA button with shadow.

**Accent details**: tip cards have `borderLeftWidth: 3, borderLeftColor: Colors.secondary + '60'`. Worn badge has filled `Colors.success + '12'` background.

**Why**: applied after reviewing emilkowalski/skill (spring/ease-out principles), redf0x1/ui-ux-pro-mcp (RN HIG, Reanimated 3), nextlevelbuilder/ui-ux-pro-max-skill (design tokens).

**How to apply**: any new screen or card component must follow these specs. Check replit.md "UI/UX Design System" section for the full table before building new UI.
