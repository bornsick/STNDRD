# STNDRD

A personal operating system built on one rule: **progress is shipped, not tracked.**

One implementation at a time. Full integration before expansion. The SHIP state
only appears once something is truly integrated — operational, stable, embodied,
reliable under normal conditions. Not perfect.

## What's here

- **[`index.html`](index.html)** — **SHIP**, the austere core (v0). A single
  self-contained file: open it on your phone, no install, no server, no PC tether.
  Deploy one implementation, work its bottleneck, wait out the mandatory
  stabilization dwell, and ship through the gate. Every ship increments your
  version and writes an immutable line to the changelog.
- **[`STNDRD_Philosophy.md`](STNDRD_Philosophy.md)** — the *why*: what STNDRD
  is and isn't, the principles, the vocabulary.
- **[`STNDRD_Data_Contract.md`](STNDRD_Data_Contract.md)** — the *how*: the
  three-app architecture (SHIP · Field Manual · Scoreboard) and the wall between
  them.

## Running SHIP

It's one HTML file — there's no build step.

- **On your phone now:** open `index.html` in any browser. Your data is saved
  on-device (browser storage). To keep it one tap away, use *Add to Home Screen*.
- **From anywhere (recommended):** enable **GitHub Pages** for this repo
  (Settings → Pages → deploy from the `main` branch, root). Your SHIP app will
  live at `https://<user>.github.io/STNDRD/`.

## The core loop (v0)

1. **Deploy** — name the single *focus* and the current *bottleneck*; set a
   bounded *window* and a mandatory *stabilization* dwell (days).
2. **Stabilize** — the gate stays locked until the dwell has fully elapsed.
   There is no fake-shipping by design.
3. **Ship** — when the gate opens, *you* press SHIP. It's permanent: the
   version increments and the changelog gains a line.
4. Edit the bottleneck any time (the main act of working). A window can be
   **extended** (with a reason) or **aborted** (with a reason).

The first thing SHIP ships is SHIP.
