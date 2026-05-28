# STNDRD — Three-App Data Contract

## Part I — The Concept

### The three apps and their jobs

STNDRD is one core app and two supporting layers. Each app answers exactly one question, and the value of the whole system comes from never letting those questions blur together.

**SHIP — the austere core.** Answers: *what is in flight, and is it integrated?* One implementation at a time, a window, a stabilization gate, an append-only changelog, a version number. No dopamine by design. This is the front door.

**FIELD MANUAL — Obsidian.** Answers: *how do I run an implementation?* Methodology, handbooks, reference, the philosophy itself. Static knowledge you own as plaintext. It does not hold live state.

**SCOREBOARD — the dopamine app.** Answers: *am I being consistent?* Ranks, stats, streaks, the satisfying number-go-up, auto-fed from your other tracking apps so it runs without your input. It is allowed to be a dopamine machine because that is its only job.

### The one rule that protects everything

**Data flows one direction: SCOREBOARD → SHIP. Never the reverse.**

SHIP may read the Scoreboard as evidence. The Scoreboard may never write to SHIP. It cannot auto-ship anything, cannot increment your version, cannot mark an implementation as integrated. Activity is measured by sensors; integration is judged by you, at the gate.

This is the wall. Everything else is detail.

### Why the wall matters

The load-bearing idea in STNDRD is that "shipped" means integrated and held under normal conditions. The moment a dopamine metric can decide what counts as shipped, the gate becomes hollow and the whole system rots into "a tracker with a shipping feature." The wall keeps the gate honest: passive data can inform the ship decision, but a human still makes it.

### What each app may and may not do

- The Scoreboard ingests raw activity from external tracking apps and gamifies it (ranks, streaks, decay).
- SHIP reads the Scoreboard's signals — never its ranks — as evidence that an implementation's underlying behavior has held.
- The Field Manual is referenced by both but written to by neither programmatically; it is your hand-authored knowledge base.
- The biggest dopamine hit fires on SHIP, not on activity. When something ships, the Scoreboard does its loudest celebration and marks it permanently. The most satisfying moment in the system stays the moment that matters most.

### The front-door rule

SHIP is the app you open by default. The Scoreboard is somewhere you visit, not where you live. If the Scoreboard becomes the home you check every morning, the gravitational center has moved and the system has quietly inverted. Decide this now and design for it.

## Part II — The Schemas

These are conceptual schemas — shapes and fields, not a database migration. They define the contract between apps. Types are indicative.

### SCOREBOARD — internal

The Scoreboard owns activity and gamification. None of this is visible to SHIP except through the Signal (below).

```
Metric {
  id: string            // "sleep_consistency"
  label: string         // "Sleep Consistency"
  source: string        // "apple_health" | "whoop" | "manual" | ...
  unit: string          // "hours" | "count" | "bool" | ...
  readings: Reading[]   // raw ingested activity
  rank: Rank            // gamified, dopamine-facing
  streak: int           // consecutive qualifying days
}

Reading {
  metric_id: string
  value: number
  timestamp: ISO8601
  source: string
}

Rank {
  tier: string          // e.g. "Bronze" | "Silver" | "Gold"
  points: int
  decay_rate: number    // gentle; framed as "current reading", never failure
}
```

### THE SIGNAL — the one-way valve (SCOREBOARD → SHIP)

This is the only thing SHIP is allowed to read from the Scoreboard. It deliberately exposes no ranks, no points, no streaks — only a factual statement about whether a behavior has held.

The valve is one-directional by construction: SHIP imports `Signal`; the Scoreboard never imports anything from SHIP. SHIP cannot mutate a Signal, and a Signal cannot mutate SHIP — it can only unlock a gate that a human then chooses to pass through.

```
Signal {
  metric_id: string         // which behavior this attests to
  held: bool                // has it met threshold continuously?
  held_since: ISO8601       // start of the current qualifying run
  consecutive_days: int     // how long it has held
  threshold: string         // human-readable: ">= 7h sleep, >= 6 of 7 days"
  // NOTE: no rank, no points, no streak count exposed. Evidence only.
}
```

### SHIP — the core

```
Implementation {
  id: string
  focus: string             // the single thing being integrated
  bottleneck: string        // the one current blocker (editable; the main act of working)
  window: Window
  stabilization: Stabilization
  linked_signal: string | null  // optional: a Scoreboard metric_id used as evidence
  state: "deploying" | "stabilizing" | "shipped" | "aborted"
}

Window {
  opened_at: ISO8601
  closes_at: ISO8601        // bounded; forces resolution (ship, abort, or explicit extend)
  extended: Extension[]     // each extension requires a reason
}

Stabilization {
  required_days: int        // mandatory dwell under normal conditions before SHIP unlocks
  began_at: ISO8601 | null
  gate_open: bool           // computed; see rule below
}

ShipRecord {                // written to the changelog on SHIP — immutable
  implementation_id: string
  focus: string
  shipped_at: ISO8601
  version: string           // increments the self, e.g. "1.4.0"
  evidence: Signal | null   // snapshot of the Signal at ship time, if any
  unlocked_reward: string | null  // hub item this milestone granted, if any
}

Version {
  current: string           // "1.4.0"
  // increments on each ShipRecord; append-only history lives in the changelog
}
```

### The gate rule (where the contract is enforced)

`Stabilization.gate_open` becomes true only when both hold:

1. The stabilization dwell has elapsed (`now - began_at >= required_days`), and
2. If `linked_signal` is set, the corresponding `Signal.held == true` for at least `required_days`.

When the gate is open, a human presses SHIP. The system never presses it. This is the single line of enforcement that makes the whole architecture honest: evidence opens the gate; a person walks through it.

### Patch and Deprecate (decay, inside the metaphor)

```
Patch {
  ship_record_id: string    // the shipped implementation that degraded
  bottleneck: string        // what regressed
  // a small, targeted re-deployment — not a failure, just maintenance
}

Deprecate {
  ship_record_id: string    // a system you've intentionally retired
  reason: string
}
```

A shipped implementation that degrades is detected by its linked Signal flipping `held` to false. That does not rewrite history or mark failure — it surfaces a patch opportunity. Decay stays inside the OS metaphor and never becomes shame infrastructure.

### Milestones & Rewards (permission, on the SHIP side)

Rewards live entirely inside SHIP. The Scoreboard cannot unlock anything — only a shipped milestone can. This is the same wall as before: the dopamine app shows consistency; the act of integration grants permission.

```
HubItem {
  id: string
  label: string             // something you want — "new headphones", "weekend trip"
  unlocked: bool            // false until a milestone grants it
  unlocked_by: string | null  // the ShipRecord that granted it
  unlocked_at: ISO8601 | null
}

Milestone {
  id: string
  // A milestone IS an Implementation that, on SHIP, grants a HubItem.
  implementation: string    // the implementation whose ship unlocks the reward
  grants: string            // HubItem id this milestone unlocks
}

RecoveryMilestone {         // the down-week answer
  id: string
  // Always available. Shipping it = getting back on your feet after a lapse.
  // Grants permission precisely when a fluctuating balance would withhold it.
  grants: string            // HubItem id
}
```

Three rules keep this clean:

1. **Permission is granted at SHIP, then unconditional.** When a milestone ships, its HubItem flips to `unlocked: true` and stays unlocked. No spending-down, no expiry, no revocation on a later bad week. A shipped thing stays shipped, so the permission it granted stays granted. The moment a reward can be taken back, you have reinvented the fluctuating balance and reimported the guilt.
2. **The hub is a wishlist, not a store.** HubItems carry no point-price. You do not grind a balance toward them. Conquering a milestone simply opens a door. Same items as a store, opposite psychology.
3. **Recovery is always reachable.** A RecoveryMilestone is never locked behind a streak. On a low stretch, shipping it is how you get back on your feet — and it grants permission rather than withholding it. The worst weeks become a thing you can ship your way out of, not a thing that denies you care.

Nothing here crosses the wall. The Scoreboard still only emits `Signal`; rewards are unlocked solely by `ShipRecord`s written inside SHIP.

## Summary

| App              | Question it answers                  | Writes to           | Reads from                    |
| ---------------- | ------------------------------------ | ------------------- | ----------------------------- |
| **SHIP**         | What's in flight, is it integrated?  | Changelog (own)     | Scoreboard Signal (read-only) |
| **Field Manual** | How do I run this?                   | Itself (you author) | —                             |
| **Scoreboard**   | Am I consistent?                     | Itself (own)        | External tracking apps        |

**One rule above all:** Scoreboard → SHIP, never the reverse. Evidence opens the gate; a human walks through it.
