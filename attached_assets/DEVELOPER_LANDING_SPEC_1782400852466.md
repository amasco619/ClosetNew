# AuraCloset — Developer Technical Specification: Luxury Landing & Auth Redesign

**Target Audience:** React Native / Expo Mobile Developers  
**Document Reference:** Authoritative UI/UX Blueprint (§2, §4, §12 of `TECHNICAL.md`)  
**Deliverable Status:** Production Implementation Guide  

---

## 1. Executive Summary & Aesthetic Vision

To achieve the immediate user perception—*"This feels like the Tesla of wardrobe apps"*—the onboarding entry point must transition from a standard form-driven login into an **immersive editorial experience**. 

Currently, the landing and sign-in screens rely on flat off-white (`#F5F3F0`) backgrounds with dark navy text. While clean, this presentation communicates "utility software" rather than "quiet luxury." By integrating `closet.jpg` as an atmospheric background canvas across both **Screen 1 (Welcome)** and **Screen 2 (Auth)**, we establish immediate emotional resonance: warm recessed lighting, bespoke wooden cabinetry, and bespoke wardrobe curation.

---

## 2. Logo & Brand Typography Assessment

### Q: Does the logo need to change, or will the present one do?
**Verdict: Keep the typography wordmark ("AuraCloset" in Inter Bold), but revolutionize its hierarchy and optical presentation.**

* **Why the font works:** Pure typographic wordmarks without illustrative icons are the absolute standard for ultra-luxury houses (Celine, Saint Laurent, Bottega Veneta, Apple). Adding a hanger or wardrobe icon would immediately downgrade the brand to a utility tool.
* **Why the current execution fails:** Dark navy text on a flat grey/white background lacks depth and sensuality.
* **Required Modifications for Developer:**
  1. **Optical Inversion:** Render `AuraCloset` in pure off-white (`#FFFFFF`) against the dark gradient scrim.
  2. **The Atelier Micro-Header:** Immediately above the main wordmark, inject an uppercase micro-label in Champagne Gold (`#D0B892`), `Inter_500Medium`, 10pt size, with extreme tracking (`letterSpacing: 4.5pt`). Example: `A U R A C L O S E T   A T E L I E R` or `T H E   P O C K E T   S T Y L I S T`.
  3. **Hairline Subtitle:** Render the tagline (*"Your quiet-luxury stylist in your pocket."*) in `Inter_400Regular`, 14pt, `#F5F3F0` at `85%` opacity, with `-0.2pt` letter spacing.

---

## 3. Screen 1: Welcome / Landing Specification (`app/welcome.tsx`)

### 3.1 Visual Canvas Architecture
```
┌──────────────────────────────────────────────────────────┐
│ BACKGROUND: closet.jpg (14s Reanimated Ken Burns Motion) │
├──────────────────────────────────────────────────────────┤
│ SCRIM LAYER: LinearGradient (35% Top ──► 98% Navy Bottom)│
├──────────────────────────────────────────────────────────┤
│ FOREGROUND CONTENT (Safe Area Bottom Inset + 24pt)       │
│                                                          │
│   [ Micro-Header: A U R A C L O S E T ]                  │
│   [ Title: Your quiet-luxury stylist... ]                │
│                                                          │
│   ┌──────────────────────────────────────────────────┐   │
│   │ GET STARTED (Primary Gold Glass Glow Card)       │   │
│   └──────────────────────────────────────────────────┘   │
│   ┌──────────────────────────────────────────────────┐   │
│   │ I ALREADY HAVE AN ACCOUNT (Translucent Glass Pill)│  │
│   └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Technical Implementation Rules
* **Background Ken Burns:** Use `react-native-reanimated` `useSharedValue(1)` looping `withRepeat(withTiming(1.06, { duration: 14000 }), -1, true)`. Never allow static unmoving photos.
* **Contrast Scrim:** Overlay `LinearGradient` with colors `['rgba(16,24,38,0.35)', 'rgba(16,24,38,0.75)', 'rgba(16,24,38,0.98)']` at locations `[0, 0.52, 0.88]`. This preserves the ambient ceiling lighting of the photograph while rendering bottom action buttons with 100% WCAG AAA contrast.
* **"Get Started" CTA:** 
  * Frosted glass card: `BlurView intensity={25} tint="dark"`.
  * Background fill: `rgba(208, 184, 146, 0.16)` (Champagne Gold tint).
  * Hairline Rim Border: `borderWidth: 1, borderColor: 'rgba(208, 184, 146, 0.45)'`.
  * Tactile Physics: On press, depress to `scale: 0.97`, `opacity: 0.85` + trigger `Haptics.impactAsync(Medium)`.
* **"I already have an account" CTA:**
  * Secondary frosted pill: `background: rgba(255,255,255,0.08)`, `borderColor: rgba(255,255,255,0.18)`.
  * Text: `Inter_600SemiBold`, 15pt, pure white.

---

## 4. Screen 2: Sign-in / Sign-up Specification (`app/sign-in.tsx`)

### 4.1 Transition & Background Continuity
When navigating from Screen 1 to Screen 2, the background image `closet.jpg` **must not reload or cut sharply**.
* **Continuity Mechanics:** Maintain the exact same background photo and Ken Burns zoom state.
* **Dynamic Focus Scrim:** As Screen 2 mounts, animate a secondary `BlurView` overlay (`intensity={40}`) or deepen the navy scrim opacity from `0.75` to `0.92` across the mid-section. This creates optical separation, ensuring user focus locks entirely onto input form fields.

### 4.2 Form Layout & Glassmorphism Inputs
* **Top Navigation Bar:**
  * Back Arrow `<`: `hitSlop={12}`, `Ionicons name="chevron-back" size={24} color="#FFFFFF"`.
* **Social Auth Cards:**
  * "Continue with Google" & "Continue with Apple" structured as horizontal frosted glass pills (`height: 52pt`, `borderRadius: 16pt`).
  * Apple card carries subtle Champagne Gold border accent (`#D0B892`).
* **Tab Switcher (`Sign in` vs `Create account`):**
  * Active Tab: `Inter_700Bold`, 18pt, `#FFFFFF`, underlined with a `2pt` solid Champagne Gold indicator bar.
  * Inactive Tab: `Inter_500Medium`, 18pt, `rgba(255,255,255,0.45)`, no underline.
* **Form Input Fields:**
  * Replaces standard flat white boxes with **Translucent Glass Inputs**.
  * Container: `height: 54pt`, `borderRadius: 16pt`, `backgroundColor: 'rgba(255,255,255,0.07)'`, `borderWidth: 1`, `borderColor: 'rgba(255,255,255,0.15)'`.
  * Text & Placeholder: `color: '#FFFFFF'`, placeholderTextColor: `'rgba(255,255,255,0.4)'`.
  * Active Focus State: Animate border color to `Colors.secondary` (`#D0B892`) + subtle glow shadow.
* **Primary Submit CTA ("Sign In"):**
  * Solid Navy fill (`#101826`) or Champagne Gold accent fill (`#D0B892`) with dark navy text.

---

## 5. Choreography & Animation Matrix

Conforming strictly to §12 of `TECHNICAL.md` (All animations < 300ms):

| Element | Entering Animation | Duration | Stagger Delay | Spring Damping / Stiffness |
| :--- | :--- | :--- | :--- | :--- |
| **Header Wordmark** | `FadeInDown` | 280ms | 40ms | Damping: 18, Stiffness: 280 |
| **Social Pills** | `FadeInDown` | 280ms | 100ms | Damping: 18, Stiffness: 280 |
| **Auth Tab Bar** | `FadeIn` | 240ms | 160ms | Linear Timing |
| **Input Fields** | `FadeInDown` | 280ms | 200ms | Damping: 18, Stiffness: 280 |
| **Submit Button** | `FadeInUp` | 280ms | 260ms | Damping: 18, Stiffness: 280 |

### Keyboard Avoidance Engineering
Mandatory integration of `react-native-keyboard-controller` or `KeyboardAvoidingView` with `behavior="padding"`. When input fields receive focus, the form container must slide upward smoothly (synchronized with iOS native keyboard spring curve), ensuring the Submit button and active input remain 24pt above the keyboard top edge.

---

## 6. Developer Acceptance Checklist

- [ ] `closet.jpg` asset placed in `assets/images/closet.jpg`.
- [ ] No emojis used anywhere in micro-copy or placeholders.
- [ ] Inter font loaded explicitly via `app/_layout.tsx`.
- [ ] All touchable targets confirm $\ge 44 	imes 44	ext{ pt}$.
- [ ] Reanimated spring physics verified on physical iOS/Android test devices.
- [ ] Rate limit error handling (`authLimiter`) gracefully displays styled toast banners.
