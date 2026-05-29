# STNDRD — SHIP (v0)

> One implementation at a time. Evidence opens the gate; a person walks through it.

**SHIP** is the austere core of STNDRD — a personal operating system. It answers
exactly one question: **what is in flight, and is it integrated?**

This is `v0`: the first implementation SHIP ships is SHIP itself — a single,
offline, installable web app that runs **standalone on a phone, no PC tether**.
No backend, no accounts, no network. State lives locally on the device.

## What it does

The whole app is one honest loop:

1. **DEPLOY** a single implementation — a focus, a bottleneck, a bounded window,
   and a mandatory stabilization dwell. Only one can be in flight at a time. No
   queue, no backlog (that's the point — the power is subtractive).
2. **Work the bottleneck.** Editing the one current blocker is the act of
   working. It's the only thing you change day to day.
3. **BEGIN STABILIZATION** when the implementation is operationally in place.
   This starts the mandatory dwell — time held under normal conditions.
4. The **gate is computed, never set.** It opens only when the dwell has elapsed
   (and, if a Signal is linked, when that evidence has held long enough).
5. **SHIP** — gated. When the gate is open, *you* press the button. The system
   never presses it for you. Shipping writes an immutable line to the changelog
   and increments your version.

A window is bounded and forces resolution: **ship**, **abort** (recorded, no
version bump), or **extend** (always with a reason).

## The wall

STNDRD is three layers with one rule: **data flows Scoreboard → SHIP, never the
reverse.** SHIP may *read* a `Signal` (a factual "has this behavior held?") as
evidence to open a gate — it exposes no ranks, points, or streaks. SHIP never
writes to the Scoreboard, and the Scoreboard can never ship anything for you.

In `v0` the Scoreboard doesn't exist yet. An implementation with no linked
Signal gates on its dwell alone. A linked Signal with no live Scoreboard reads
as "no evidence yet" and keeps the gate honestly closed — see
`readSignal()` / `evaluateGate()` in `app.js` for the one-way valve.

See [`Data Contract`](./Data%20Contract) for the full architecture and
[`Philosophy Brainstorm`](./Philosophy%20Brainstorm) for the why.

## Run it

It's a static app — no build step.

```sh
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000 (a server is needed for the service worker)
```

On a phone: serve it (or host the folder anywhere static) and **Add to Home
Screen**. It installs as `SHIP` and runs standalone, offline.

## Files

| File                   | Role                                                        |
|------------------------|-------------------------------------------------------------|
| `index.html`           | Structure + modals                                          |
| `styles.css`           | Black/white, monospace, industrial; the SHIP flash          |
| `app.js`               | State, lifecycle, the gate rule, persistence, rendering     |
| `sw.js`                | Offline shell (standalone-on-phone)                         |
| `manifest.webmanifest` | PWA manifest                                                 |
| `icon.svg`             | The SHIP mark                                                |

## Design constraints (held deliberately)

- Black and white, monospace, low stimulation. No dopamine in SHIP by design —
  the one allowed celebration is the SHIP flash, because shipping is the moment
  that matters most.
- No editing the changelog. A shipped thing stays shipped.
- No second slot. One implementation at a time is enforced, not encouraged.
