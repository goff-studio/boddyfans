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

Submitting now writes to Firestore — see **Admin panel and per-booking chat**
below. The single-file preview build still stops at the confirmation, since it
has no backend to write to.

**No amount is shown anywhere**, because no price was given. A transfer screen
without a figure is hard to act on: this needs either per-track pricing or a
line telling the payer what to send.

## SEO and share cards

Set the domain first — nothing absolute works without it:

```bash
cp .env.example .env    # then edit VITE_SITE_URL
```

If it is unset the build warns, omits `canonical`/`og:url` rather than emitting
a wrong one, and falls back to `https://example.invalid` (a reserved TLD, so it
can never resolve or point at somebody else's site).

`vite.config.ts` resolves this through Vite's `loadEnv`, not `process.env`.
That distinction matters: Vite loads `.env` for the app's `import.meta.env` but
never copies it onto `process.env`, so a config that reads `process.env` alone
silently ignores `.env` — which is exactly what shipped `example.invalid` from
local builds for a while.

**Per-route HTML, not just runtime tags.** `src/seo.ts` holds the metadata for
all six routes; the Vite plugin in `vite.config.ts` bakes a real `<head>` into
one HTML file per route (`dist/train/index.html` and so on), and `src/useSeo.ts`
keeps the head in step during client-side navigation. Both exist because they
serve different readers: Google executes JavaScript, but Facebook, LinkedIn,
WhatsApp and Slack do not — a link shared to any of those reads only the HTML
it is served, so per-route cards need the static files.

Descriptions are the pages' own body copy rather than written-for-crawlers
filler. Titles run 46–57 characters, descriptions 98–153.

Also emitted: `sitemap.xml` (set `BUILD_DATE=$(date +%F)` to include `lastmod`),
`robots.txt`, and `Physiotherapy` schema.org JSON-LD on the hub with the five
tracks as `Offer`/`Service` entries.

**Share cards** are generated, not hand-exported — 1200×630, in the site's own
design language, one per track plus a default:

```bash
python3 scripts/prep-og-fonts.py && python3 scripts/build-og.py
```

The first script converts the shipped Inter woff2 files into static TTFs
(fontconfig cannot read woff2, and the variable axis needs pinning); the second
composes the cards with PIL, which loads those TTFs directly so the real brand
faces are used. Re-run both after changing a photo, a headline or the city, and
commit the PNGs in `public/og/`.

### What would move the needle next

- **A real street address, phone number and opening hours.** The JSON-LD
  carries only `addressLocality: Bologna` because that is all we actually know.
  For a local practice these are the highest-value additions, plus a Google
  Business Profile pointing at the same domain.
- **Italian-language pages.** The copy is English while the practice is in
  Bologna; most local search will be in Italian (`fisioterapista Bologna`).
  That needs `hreflang` and translated routes, not just keywords.
- `<meta name="keywords">` is included because it was asked for, but no major
  search engine has used it for ranking in well over a decade. The work that
  counts is above it.

## Admin panel and per-booking chat

Anna signs in, reviews bookings, approves one, and that opens a private chat
with the client. Firebase project `body-fans`, **Spark (free) plan — no Cloud
Functions**, which is what shapes the design below.

```bash
cp .env.example .env      # fill in the VITE_FIREBASE_* values
npm run emulators         # auth + firestore, locally
npm run seed              # creates Anna and her admins/ document (emulator only)
npm test                  # crypto (17) + firestore rules (25)
```

The emulators and the test suite need **no Firebase login** — they run entirely
locally against `firestore.rules`, so you can develop and verify rule changes
without console or CLI access to the project.

Set `VITE_USE_EMULATORS=1` in `.env` to point the app at the local emulators.
It ships as `0`, so an unconfigured checkout talks to the real project rather
than silently appearing broken.

### The flow

1. A visitor books from any track page. That writes `bookings/{id}` as
   `pending`, unauthenticated, plus the receipt in a subcollection.
2. Anna opens `/login`, then `/admin`, and sees pending bookings first.
3. She opens one, checks the transfer receipt, and hits **Approve & create
   access**. That mints the client's account and opens the conversation.
4. The password is shown **once** and never stored. She passes it on; if it is
   lost she issues a new one.
5. The client signs in at `/login` with their username and lands on `/chat`.

### Security model — read this before changing rules

Public sign-up **cannot be disabled** without the Admin SDK, which Spark does
not provide. Anyone holding the web config can create an auth account. So the
rules are written on one principle:

> **Being signed in grants nothing.**

Access requires an `admins/{uid}` document or a `users/{uid}` profile, and only
an admin can write either. A self-registered account has neither and can read
nothing. `src/chat/rules.test.ts` pins this down — the test named *a
merely-authenticated account can read nothing* is the one that justifies leaving
sign-up open. If it ever goes red, the project is open.

Two related notes:

- **The `apiKey` is not a secret.** Every Firebase web app ships it; it names
  the project and authorises nothing. Rotating it protects nothing. The rules
  are the boundary.
- **Sent messages are immutable**, for Anna too. A transcript that can be edited
  is not evidence of anything.

### Spark-plan trade-offs

| Constraint | What we do instead | Proper fix |
| --- | --- | --- |
| No Admin SDK | Accounts created client-side via a throwaway secondary Firebase app, which leaves Anna's session intact (`createAccountOutOfBand`) | Callable Function; then sign-up can be disabled outright |
| No custom claims | Admin is an `admins/{uid}` document, checked with `exists()` in rules | Custom claim on the token |
| Cloud Storage needs Blaze | Receipts are downscaled to JPEG and stored as base64 in a subcollection, capped at 900KB (`src/chat/receipt.ts`) | Cloud Storage; only `prepareReceipt` changes |
| Open create rule on `bookings` | Payload is pinned field-by-field: an anonymous caller cannot set `status`, `clientUid` or `conversationId`, so nobody can self-approve | App Check for rate limiting |

### Encryption

Messages are stored in **plaintext**, by decision. `src/chat/crypto.ts` holds a
tested AES-256-GCM implementation (17 tests, including AAD binding so a
ciphertext cannot be moved between conversations) for when that reverses. The
two call sites are marked `ENCRYPTION SEAM` in `src/chat/client.ts`, and `text`
in `firestore.rules` would widen to the sealed shape.

The conversation document deliberately stores no message preview — that would be
message text living outside the messages collection, defeating encryption the
day it comes back.

### Bundle

The marketing entry must not pay for Firebase. It is loaded through
`src/PanelRoutes.tsx`, imported lazily behind a build-time constant, so:

- marketing entry: **121.8KB gzipped**, zero Firebase
- Firebase chunk: 162KB gzipped, fetched only on the panel or a booking submit
- the single-file preview build excludes it entirely — it has no network under
  the artifact CSP, and the API key stays out of a shareable file

If you add a Firebase import to anything on the marketing path, check
`dist/assets` afterwards.

### Deploying — Vercel builds from the repo

Firebase Hosting needs the CLI, so the site is hosted on Vercel at
**body-fans.com**. `vercel.json` pins the framework, build command, output
directory and the SPA rewrite; Vercel needs no other configuration.

**Set the environment variables in the Vercel dashboard.** `.env` is gitignored,
so the repo carries no config — and Vite inlines `VITE_*` values at build time,
meaning a variable missing at build time is missing from the shipped app.

**The build now refuses to run without them.** It used to succeed and ship a
dead panel, which is how a broken build reached production once already. If the
Firebase keys are absent the build fails and names them. For a deliberate
config-less build, set `ALLOW_UNCONFIGURED_BUILD=1` (the embedded preview build
is exempt automatically).

Project → Settings → Environment Variables, for Production *and* Preview:

```
VITE_FIREBASE_API_KEY             AIza…
VITE_FIREBASE_AUTH_DOMAIN         body-fans.firebaseapp.com
VITE_FIREBASE_PROJECT_ID          body-fans
VITE_FIREBASE_STORAGE_BUCKET      body-fans.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID 23622028814
VITE_FIREBASE_APP_ID              1:23622028814:web:…
VITE_CLIENT_EMAIL_DOMAIN          clients.body-fans.com
VITE_SITE_URL                     https://www.body-fans.com
VITE_USE_EMULATORS                0
```

Symptoms of a missing variable:

| Missing | What you see |
| --- | --- |
| any `VITE_FIREBASE_*` | Marketing pages keep working. `/admin` and `/chat` show "Not configured", and sign-in says so explicitly. This used to blank the entire site — see below |
| `VITE_SITE_URL` | Build warns; `sitemap.xml` and `og:image` point at `example.invalid`, no canonical tags |
| `VITE_USE_EMULATORS` left at `1` | The deployed app tries to reach `127.0.0.1` and every read hangs |

**A missing config must not take the site down.** `AuthProvider` wraps the
marketing routes as well as the panel, and `getAuthClient()` throws when the
`VITE_FIREBASE_*` values are absent. A throw inside an effect unmounts the whole
tree, so one missing variable blanked every page, marketing included. Two guards
now prevent that, and both are load-bearing:

- `AuthProvider` checks `isFirebaseConfigured()` and returns before touching
  Firebase at all.
- `PanelBoundary` is an error boundary around the panel tree, so any *other*
  runtime failure there degrades to a message instead of a blank document.

If you add code that reaches for Firebase outside the panel routes, rebuild with
no `VITE_FIREBASE_*` set and confirm `/` still renders. That is the regression
this pair exists to stop.

**Why the blanket rewrite is safe.** `vercel.json` rewrites `/(.*)` to
`/index.html`, but Vercel checks the filesystem first — so `/train` still serves
the pre-built `dist/train/index.html` with its own `<head>` and share card, and
only the pathless routes (`/login`, `/admin/*`, `/chat`) fall through to the SPA.
Verify after a deploy by viewing source on `/train`: you should see
`train without injuries` in the `<title>`, not the hub's.

**Preview deployments hit the same Firestore.** A `*.vercel.app` preview shares
the one project, so test bookings made there land in production data. There is no
staging project.

**Use the host you actually serve.** The site resolves to
`www.body-fans.com`, so `VITE_SITE_URL` is the `www` form — a canonical tag
pointing at a host that only redirects is worse than none. If you flip the
primary domain to the apex, change this to match.

After the first deploy, add `www.body-fans.com` under Authentication → Settings →
Authorized domains. Email/password sign-in generally works without it, but it is
required the moment Google sign-in or email links are added.

**Testing online writes to the real database.** Test bookings become real
documents and approving one creates a real auth account. To clean up: delete the
`bookings` document, the user under Authentication, and its
`usernames/{username}` document — miss that last one and the username stays
reserved.

**The booking form is publicly writable by design** — that is what lets visitors
book without an account. Once the site is live, anyone can post bookings. The
rules cap each one's shape and size, but rate limiting needs App Check. Watch the
`bookings` collection after launch.

### One-time setup on the real project — console only, no CLI

Everything below is done at <https://console.firebase.google.com> → project
`body-fans`. **No Firebase CLI login is needed**, which matters if you only have
web access to the account. The emulator equivalents are scripted in
`npm run seed`; on the real project they are manual, because Spark has no
Admin SDK.

1. **Enable password sign-in.**
   Authentication → Sign-in method → Email/Password → Enable → Save.
   Leave "Email link" off.

2. **Create Anna's account.**
   Authentication → Users → Add user. Copy the **User UID** from the row — you
   need it next.

   Anna signs in with an **email address**, not a username: `toLoginEmail()`
   passes anything containing `@` through unchanged, and only bare usernames get
   mapped to the client domain. Whatever address you enter here is her login.

   Use a **real inbox** she controls — `anna@body-fans.com` if that domain takes
   mail, otherwise her personal address. Clients get synthetic
   `@clients.body-fans.com` addresses with no inbox and cannot self-reset;
   Anna on a real address can. Do **not** give her an
   `@clients.body-fans.com` address: a client later choosing the username
   `anna` would collide with her login.

   Her admin rights are keyed to her UID, not her email, so changing the
   address later does not break the panel.

3. **Grant her admin.** This is the step that actually gives access; nothing
   else does.
   Firestore Database → Start collection → Collection ID `admins` → Document ID
   = *the UID you just copied* → add one field `createdAt` of type `timestamp`
   → Save.

   The document only has to exist. Its contents are never read.

4. **Publish the rules.**
   Firestore Database → **Rules** tab → select all → paste the entire contents
   of `firestore.rules` from this repo → **Publish**.

   Firestore ships with rules that deny everything (or, on a test database,
   allow everything for 30 days). Neither is what you want, so do not skip this.
   You can re-paste any time the file changes; publishing is instant and
   versioned, and the console keeps a history you can roll back.

5. **Point the app at the project.** Copy the six values from Project settings →
   Your apps → SDK setup and configuration into `.env` as `VITE_FIREBASE_*`,
   and leave `VITE_USE_EMULATORS=0`.

No indexes to create: the admin list uses a single `orderBy` and filters by
status in memory, precisely so there is no console step that a query silently
depends on.

**To check it worked:** open `/login`, sign in as Anna, and you should land on
`/admin`. If you get "No access", step 3's document ID does not match her UID.
If the list shows "Could not load bookings", the rules from step 4 are not
published — the browser console carries the underlying Firestore error.

### Images in chat

Anna can attach an image; clients cannot. There is no Cloud Storage, so images
live inside the message document as base64 — which sets a hard ceiling, because
a Firestore document is capped at 1 MiB *including* field names and base64
inflates bytes by 4/3.

`src/chat/images.ts` owns that arithmetic and is shared with receipts. Anything
picked is downscaled and re-encoded as JPEG, stepping quality down until it
fits; anything that still will not fit is refused with a reason, never
truncated. Verified with a 13.2MB PNG: it lands at 455KB raw / 607K base64
characters.

Budgets, which must stay in step with the caps in `firestore.rules`:

| | Max edge | Raw bytes | base64 chars |
| --- | --- | --- | --- |
| Chat image | 1200px | 600,000 | 800,000 |
| Receipt | 1400px | 700,000 | 933,336 |

A message carries **exactly one** of `text` or `image` — never both, never
neither. A caption would need a third case in the rules and in the rendering.

To let clients send images too, drop the `isAdmin()` term from
`validImageMessage()` in `firestore.rules` and pass `canSendImages` to their
`ChatPane`. Nothing else changes.

> An earlier receipt cap of 900,000 raw bytes was arithmetically impossible:
> it encodes to 1.2M characters, past the 1 MiB document limit. It only ever
> passed testing because the fixture was a 1×1 pixel.

### Closing a chat, and returning clients

Email is **required** on a booking, because it is the identity key that
reconnects a returning client. `clientsByEmail/{email}` maps a lowercased
address to its client; it is admin-only, since the keys are personal data and an
open read would let anyone test whether an address is a client.

The cycle:

1. Anna closes a chat when the sessions are done. The client can still **read**
   the history but not write. Anna still can, so she can leave a closing note.
2. The client books and pays again.
3. Anna approves. The email matches, so the client is **reconnected**: same
   account, same conversation, reopened — and *no new credentials*, because
   their existing login still works. Rotating it silently would lock them out of
   a chat they can already see. The approve screen says so instead of showing a
   password.

Enforcement is in the rules, not the UI: a client's message create requires the
conversation's `status` to be `open`. A missing status reads as open, so
conversations created before this existed keep working.

The client's chat is found through `users/{uid}.conversationId` rather than a
query over bookings — a returning client has several bookings, so picking the
newest would need a composite index it does not otherwise need.

### Reissuing a client's login

There is no password reset: a username has no inbox, and changing another
account's password needs the Admin SDK, which Spark does not have.

So an approved booking has a **Reissue login** control instead. It provisions a
new account and moves the booking and conversation onto it. Two consequences,
both stated in the UI:

- the **username changes** — the old email already exists and cannot be reused
- the **old login stops working**, because it is no longer a conversation
  participant

Chat history survives: the conversation document is reused, only its
`participants` change. Verified end to end — after a reissue the old credentials
still authenticate but get `permission-denied` on the transcript, while the new
ones read it in full.

### Known gaps

- **No notifications.** Anna only learns a message arrived by opening the panel.
- **No password reset.** Synthetic username emails have no inbox, so Anna
  reissues passwords. An optional real email is stored on the booking for when
  that changes.
- **A failed approval can orphan an auth account.** The account is created
  before the batch (it is the one step that cannot be rolled back client-side).
  An orphan has no `users/` profile, so it can read nothing — harmless, but it
  holds the username's email address.

## Deviations from the designs

- **Menu overlay is an addition.** The set has no menu frame, but the burger
  appears in every header and is the only chrome on the desktop hub. Rather
  than ship a dead control, `src/components/Menu.tsx` builds a panel from the
  existing tokens and track list. Replace it when a real frame exists.
- **The practice is in Bologna, the exports say Milan.** Changed on instruction
  after the exports were made: the hub headline reads "bolognese", and both
  footers read BOLOGNA. A visual diff against `designs/exports/` will flag
  this — it is intentional, not drift. The Revolut branch address in
  `payment.ts` stays Milano because that is the bank's address, not Anna's.
- **Desktop hub has no header or footer**, matching the export — the columns
  are the whole page. The wordmark, intro copy and footer appear at ≤900px,
  also as drawn.
- Three supplied photos are unused and parked in `designs/spare-photos/` so
  they do not ship in `public/`.
- `prefers-reduced-motion` is wired throughout but was not runtime-verified —
  the preference cannot be emulated from this environment.
