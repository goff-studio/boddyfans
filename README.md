# Anna Nefedova — Atelier

Six screens from Figma, built in React: a hub of five atelier tracks plus a
detail screen for each, at desktop and mobile.

```bash
npm install
npm run dev          # local dev server
npm run build        # production build into dist/
npm run build:artifact   # single self-contained HTML into dist-artifact/
```

`build:artifact` inlines the stylesheet, script, Latin font faces and all five
photographs (recompressed at q70) into one file with no external requests. It
emits two variants: `atelier.html` for a host that supplies its own document
shell, and `atelier-standalone.html` as a complete document you can open from
disk or send to someone. That build switches to `HashRouter`, because a file
served without rewrites has nothing to resolve deep links against.

| Route | Screen | Figma node |
| --- | --- | --- |
| `/` | Hub — five track columns | `13:757` |
| `/train` | 01 Train without injuries | `13:783` |
| `/build` | 02 Build the body you want | `13:659` |
| `/perform` | 03 Perform better as you age | `13:809` |
| `/recover` | 04 Strong through injuries | `13:835` |
| `/connect` | 05 1-on-1 chat | `13:861` |

Stack: Vite, React 19, TypeScript, React Router 7, Framer Motion 13,
self-hosted Inter / Inter Tight.

## Where the numbers came from

The Figma file could not be read directly from this environment, so every
value was sampled from the PNG exports (kept in `designs/exports/` for future
diffs) rather than estimated by eye:

- **Palette** — page `#faf7f2`, ink `#0a0a0a`, body `#3a3938`, meta `#9a9895`,
  rules `#e2dfda`, coral `#ff5f38`, number watermark `#faeee7`.
- **Layout** — 96px header and 82px footer, 50/50 panel split, 80px gutter,
  490px copy column, 188×46 CTA pill.
- **Hub columns** — the photos sit under a ~90% wash that warms left to right.
  Each column's tint is fitted against its own source photo
  (`design = 0.09·src + C`) and stored per column in `TINTS`, not interpolated
  between the ends: columns 4 and 5 do not sit on the line the others suggest,
  and extrapolating column 5 put it 28 too blue. Every column now renders
  within 1/255 of the export.
- **Hub words** — cap height is constant at 65px; the export varies *letter
  pitch* (90px at five glyphs or fewer, 81px beyond). Upright vertical text
  advances by the font's own vertical metric — 1.207em for Inter Tight — so
  that target becomes a negative letter-spacing. Re-derive 1.207 if the
  display face changes.
- **Type** — sizes were solved from rendered string widths, not ink heights.
  Reading ink height is what made the body look like 21px when it is really
  18px/29px: the sample string has descenders. Headline is 77px/68px, which
  reproduces all three line widths within 2%.

## Motion

One tier per interaction, all from `src/motion/tokens.ts`:

- **Hub ↔ track** — a 320ms directional push on `cubic-bezier(0.32, 0.72, 0, 1)`.
  The incoming screen travels a full width; the outgoing one moves a third in
  the same direction and dims, so it reads as a layer being covered. Exit
  mirrors entry, which is what makes the `← BACK` affordance legible.
  Direction comes from movement along `FLOW`.
- **In-screen content** — 50ms stagger, 220ms rises, held until the push has
  mostly settled. The headline is a nested stagger so its lines cascade.
- **Photos** — a 700ms contained scale-down, so the image comes to rest behind
  its frame instead of sliding the layout around.
- **Interactive** — 140ms press, 180ms hover nudges, all under 300ms.
- `transform`/`opacity` only, written as full transform strings so they stay
  hardware-accelerated. Hover is gated behind `@media (hover: hover) and
  (pointer: fine)`, and every animated component reads `useReducedMotion()`,
  which drops travel while keeping opacity.

Two React details worth keeping: direction and menu-dismissal are derived
during render rather than stored in refs or effects — under StrictMode's
double render a ref is already stale on the second pass, which inverts the
back transition. And the screen variants are *functions* of `custom`, because
AnimatePresence feeds `custom` to the exiting child; static objects would
freeze it with the previous direction and send the outgoing screen out the way
it came in.

## Booking (manual payments)

`BOOK A SESSION` opens a three-step flow in `src/components/BookingSheet.tsx`:

1. **Your session** — what to call you (one informal name, not first/last) and a
   preferred date and time.
2. **Transfer** — the bank details for that track, every row copyable.
3. **Receipt** — drag-drop or file-pick a screenshot or PDF, then send.

Payment is split by track in `src/data/payment.ts`: the 1-on-1 chat (`connect`)
is billed to the Revolut account, every other track to the practice account.
Both IBANs were checked against the mod-97 checksum and the Italian
27-character layout before being entered, and IBAN 1's decomposition matches
the supplied CIN/ABI/CAB exactly. **Re-run that check if either account is
edited** — the helper is three lines and a wrong digit moves real money.

Each booking generates a transfer reference (`TRAIN · GIULIA`) shown first and
copyable. Manual reconciliation depends on it: without a reference in the
description, matching payments to bookings is done by eye against amounts.

**This is front end only.** Nothing is transmitted or stored — no backend, no
upload target, no email. The confirmation step is presentation, not proof of
delivery, and `onSubmit` in `BookingSheet` is where a real submission would go.
Do not put it in front of a paying client in this state.

Two things still need a decision:

- **No amount is shown**, because no price was given. A transfer screen without
  a figure is hard to act on, so this needs either per-track pricing or a line
  telling the payer what to send.
- **Receipts are bank documents.** Once there is somewhere to upload them, they
  become sensitive personal data with the retention and access questions that
  implies — worth settling before the backend, not after.

## Deviations from the designs

- **Menu overlay is an addition.** The set has no menu frame, but the burger
  appears in every header and is the only chrome on the desktop hub. Rather
  than ship a dead control, `src/components/Menu.tsx` builds a panel from the
  existing tokens and track list. Replace it when a real frame exists.
- **Desktop hub has no header or footer**, matching the export — the columns
  are the whole page. The wordmark, intro copy and footer appear at ≤900px,
  also as drawn.
- Three supplied photos are unused and parked in `designs/spare-photos/` so
  they do not ship in `public/`.
- `prefers-reduced-motion` is wired throughout but was not runtime-verified —
  the preference cannot be emulated from this environment.
