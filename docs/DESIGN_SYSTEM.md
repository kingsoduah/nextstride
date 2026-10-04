# NextStride Design System (from attached UI reference)

Authoritative for all frontend work. Follow the reference unless functionality,
responsiveness, accessibility, or feasibility forces a documented deviation.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#fafafa` | App + sidebar background |
| `--surface` | `#ffffff` | Cards, composer |
| `--surface-2` | `#f5f5f4` | Hover, pills, rec blocks |
| `--border` | `#e8e8e8` | Card borders |
| `--border-strong` | `#d6d6d6` | Inputs, buttons |
| `--ink` | `#171717` | Headings, primary buttons |
| `--ink-2` | `#404040` | Nav items |
| `--muted` | `#737373` | Subtitles, placeholders |
| `--radius / --radius-lg` | `8px / 12px` | Controls / cards |
| `--sidebar-w` | `260px` | Fixed left nav (hidden < 860px) |
| `--content-w` | `720px` | Centered column |

Typography: system stack; welcome H1 24px/600; card H2 18–20px; body 15px; captions 12–13px.

## Components

- **Sidebar:** brand → Priority Hub → New situation → Recent (≤10) → user + logout. Active item tinted.
- **Composer:** surface card, border, 12px radius; textarea borderless; footer row (hint left, circular ↑ submit right). Used for hub input and reassessment.
- **ExampleCards:** 3-column grid (stacked on mobile); each card has glyph, title, 2-line description; click fills + submits.
- **UnderstandingCard:** responsibilities (category pill + time pill + flags), conflicts, uncertainties; Confirm (primary) / Edit (secondary); edit swaps in textarea + Save & Re-analyze.
- **RecommendationCard:** 5 blocks — priority, why, next action, others, reassess-if — plus uncertainty note and version tag.
- **VersionTimeline:** one-line `v1 → v2` note under the latest card (full per-version view deferred).
- **FeedbackRow:** 👍/👎 + optional note input; success message replaces buttons.
- **States:** skeleton loaders; error text (`--danger`); AI failure copy: "We couldn't analyze that just now. Your text is saved — try again."

## Copy (fixed)

- Hub: "Welcome to NextStride" / "What's competing for your attention?"
- Understanding: "Here's what I understand" / "Confirm — Get Recommendation"
- Recommendation: "Your NextStride" / "Recommended next step" / "Do this now" / "Reassess if"
- Footer hint: "AI recommends · you decide"

## Accessibility

Landmarks (`aside`, `main`), labeled inputs, visible focus ring, keyboard-operable cards
(buttons, not divs), `aria-live` on async result regions (to be added with polish pass),
contrast ≥ 4.5:1 for body text.
