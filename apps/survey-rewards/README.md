# PointPilot — surveys & rewards

A complete, self-contained survey-and-rewards app: browse surveys, answer them
question by question, earn points instantly, keep a streak, unlock achievements,
and redeem points for cash, gift cards, vouchers or a donation.

It runs on plain Node.js with **zero dependencies** — no build step, no install,
no database server. The UI is a hand-written vanilla ES-module front end; state
lives in a local JSON file.

```bash
cd apps/survey-rewards
npm start          # http://localhost:4317
npm test           # 14 store/domain tests (node:test)
```

`PORT` and `HOST` are respected (`PORT=8080 npm start`). Set `SURVEY_DB` to
point at a different data file.

> This app is intentionally independent of the OmniRoute Next.js dashboard — it
> is a standalone product demo that can be lifted out of the repo as-is.

---

## What's inside

| Area | Details |
| --- | --- |
| **Surveys** | 10 seeded surveys across 8 categories, 4 question types (single choice, multi-select, 1–5 scale, star rating, free text), optional questions, autosaved progress, resume support |
| **Earning** | Instant point payouts, daily streak bonus (grows with the streak), level system (Newcomer → Luminary), 8 achievements |
| **Rewards** | 9 rewards across cash / gift card / voucher / donation, balance-aware states, confirmation modal, issued reward codes, redemption history with copy-to-clipboard |
| **Insights** | Balance card, level progress, lifetime earnings, category coverage, activity feed, leaderboard, achievements |
| **Profile** | Display name + avatar picker, dark/light theme (persisted), reset demo data |
| **UX** | Responsive desktop sidebar + mobile bottom nav, hash routing, toasts, confetti, skeleton loaders, empty states, reduced-motion support, keyboard-accessible survey flow |

Everything is demo data: points, payouts and codes are simulated. Every 100
points is presented as ≈ $1.

---

## Project layout

```
apps/survey-rewards/
├── server/
│   ├── index.js     # HTTP server: JSON API + static file host (no deps)
│   ├── store.js     # domain logic + JSON persistence (atomic writes)
│   └── seed.js      # survey, category and reward catalog
├── public/
│   ├── index.html   # app shell (sidebar, topbar, bottom nav, modal/toast roots)
│   ├── styles.css   # design system, light + dark themes, responsive layout
│   ├── app.js       # client: router, views, survey runner, rewards, profile
│   └── favicon.svg
├── tests/
│   └── store.test.js
└── package.json
```

Data is written to `data/db.json` (git-ignored). Each browser gets a random
client ID in `localStorage`, sent as the `x-client-id` header; the server keys
all users off it. Writes go through a temp file + rename so a crash cannot
corrupt the database.

---

## API

All endpoints are JSON. Identify the caller with an `x-client-id` header
(the browser client does this automatically).

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/bootstrap` | Full app state: user, level, stats, surveys, categories, rewards, achievements, leaderboard, activity |
| `GET` | `/api/surveys/:id` | Survey detail including questions, saved answers and resume index |
| `POST` | `/api/surveys/:id/start` | Mark a survey as started |
| `POST` | `/api/surveys/:id/progress` | Save `{ answers, currentQuestion }` |
| `POST` | `/api/surveys/:id/complete` | Validate + award points, returns updated state |
| `POST` | `/api/daily-bonus` | Claim the once-per-day streak bonus |
| `POST` | `/api/rewards/:id/redeem` | Spend points, issue a reward code |
| `POST` | `/api/profile` | Update `{ name, emoji }` |
| `POST` | `/api/reset` | Clear this user's data |
| `GET` | `/api/meta` | Catalog metadata |
| `GET` | `/api/health` | Liveness probe |

Server-side validation is authoritative: required questions must be answered
with valid values, double submissions return `409`, and redemptions check the
balance before deducting.

---

## Customising the catalog

Everything lives in `server/seed.js`. Add a survey by appending an object with
`id`, `title`, `brand`, `emoji`, `category`, `reward` (points), `minutes`,
`description` and a `questions` array. Question shapes:

```js
{ id: "q1", type: "single", prompt: "…", options: ["A", "B"], required: true }
{ id: "q2", type: "multi",  prompt: "…", options: ["A", "B"], required: true }
{ id: "q3", type: "scale",  prompt: "…", low: "Never", high: "Always", required: true }
{ id: "q4", type: "rating", prompt: "…", required: true }
{ id: "q5", type: "text",   prompt: "…", placeholder: "…", maxLength: 280, required: false }
```

Rewards use `{ id, title, subtitle, type, cost, value, emoji, accent }` with
`type` one of `cash`, `giftcard`, `voucher`, `donation`.

---

## Tests

`npm test` covers the domain layer: catalogue exposure, required-answer
validation, payouts, duplicate submission protection, progress save/restore,
redemption rules and code generation, daily-bonus limits, achievement unlocks,
profile sanitisation, disk persistence, per-user isolation and reset.

The UI has also been exercised end-to-end (onboarding, filtering, all four
question types, submission, daily bonus, redemption and every route) against the
running server using a headless DOM harness.
