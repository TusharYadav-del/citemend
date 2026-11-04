# CiteMend design system

CiteMend uses a dark, evidence-first workspace with a neon emerald action color. The system is defined in `app/globals.css` and `lib/design-tokens.ts`; use these values for every new screen and component.

## Visual foundations

| Token | Value | Use |
| --- | --- | --- |
| Background | `#07090E` | Main application canvas |
| Surface | `#0D1119` | Secondary panels and nav |
| Raised surface | `#101722` | Cards, dialogs, and grouped content |
| Accent | `#37F5A0` | Primary actions and positive states |
| Cyan | `#39D9FF` | Supporting highlights |
| Danger | `#FF6482` | Confirmed failures and destructive actions |
| Warning | `#F4BD68` | Unknown or review-required states |
| Primary text | `#F5F7FA` | Titles and important values |
| Secondary text | `#929CAA` | Explanations and supporting content |

Inter is the UI font. JetBrains Mono is reserved for paths, hostnames, HTTP results, similarity values, and code. The global styles define panel radii, border opacity, shadows, spacing, easing, motion duration, and overlay layers as CSS custom properties. The typed mirror is `designTokens` in `lib/design-tokens.ts`.

## Motion and accessibility

Use short opacity and transform transitions with `--ease-standard`; avoid layout animation for large lists. Use SVG or CSS for lightweight diagrams. Every animation must honor `prefers-reduced-motion`. Keep a visible focus ring, semantic landmarks, readable contrast, and keyboard reachable horizontal tables. Never communicate health using color alone.

## Evidence language

Use `confirmed` only for a completed HTTP check. Use `unknown` for network failures or incomplete data. The four engine comparison profiles use shared search grounding and are modeled synthesis, not native requests to the named answer engines. Do not invent metrics, live states, logos, or customer proof.

## Permanent Future Feature Rule

Every future feature must reuse `components/ui/` primitives and `lib/design-tokens.ts`. Add a new primitive there when an interaction is repeated. Keep application-specific data, authorization, persistence, and route behavior in their existing modules; UI restyling must never replace a real API result with a demo value.

## Page composition

Use the route template in `FEATURE_PAGE_TEMPLATE.md`. Marketing sections can use the light evidence workspace surface for forms and report previews, while navigation, product explanation, and the signed-in command center remain on the dark foundation.
