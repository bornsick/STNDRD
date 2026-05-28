/* ═══════════════════════════════════════════════════════════════════════
   SHIP — the austere core of STNDRD.

   Answers one question: what is in flight, and is it integrated?

   Rules enforced here (and nowhere else):
     · One implementation in flight at a time. No queue, no backlog.
     · The window is bounded; it forces resolution (ship, abort, or extend).
     · Stabilization is a mandatory dwell. The gate is COMPUTED, never set.
     · SHIP is gated. Evidence opens the gate; a human presses the button.
     · The changelog is append-only and immutable. A shipped thing stays shipped.
     · Data only ever flows Scoreboard → SHIP, via a read-only Signal. Never back.

   Persistence is local (this device). The first implementation SHIP ships is
   SHIP itself: running standalone on a phone, no PC tether.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const STORE_KEY = "stndrd.ship.v0";
  const DAY_MS = 24 * 60 * 60 * 1000;

  /* ───────────────── State ───────────────── */
  /** @typedef {"deploying"|"stabilizing"|"shipped"|"aborted"} ImplState */

  const defaultState = () => ({
    version: { current: "0.0.0" },
    active: null, // the single in-flight Implementation, or null
    changelog: [], // append-only: ShipRecord | AbortRecord
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      // Shallow-merge against defaults so older saves stay loadable.
      return Object.assign(defaultState(), parsed);
    } catch (e) {
      console.warn("SHIP: could not load state, starting fresh.", e);
      return defaultState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("SHIP: could not persist state.", e);
    }
  }

  /* ───────────────── Time helpers ───────────────── */
  const now = () => new Date();
  const iso = (d) => d.toISOString();

  function daysBetween(fromIso, toDate) {
    return (toDate.getTime() - new Date(fromIso).getTime()) / DAY_MS;
  }
  function fmtDate(isoStr) {
    if (!isoStr) return "—";
    const d = new Date(isoStr);
    return d
      .toLocaleDateString(undefined, { year: "2-digit", month: "short", day: "2-digit" })
      .toUpperCase();
  }
  function fmtDaysLeft(closesAtIso) {
    const left = daysBetween(iso(now()), new Date(closesAtIso));
    // Negative => overdue.
    if (left >= 0) return `${Math.ceil(left)}D LEFT`;
    return `${Math.abs(Math.floor(left))}D OVERDUE`;
  }

  /* ───────────────── Version increment ─────────────────
     Shipping a normal implementation bumps the minor.
     The major is reserved for the user to bump deliberately
     (a new era of the self); v0 ships keep us in 0.x. */
  function nextVersion(current) {
    const [maj, min] = current.split(".").map((n) => parseInt(n, 10) || 0);
    return `${maj}.${min + 1}.0`;
  }

  /* ───────────────── Signal — the one-way valve ─────────────────
     SHIP may READ a Signal as evidence. It may never write one, and the
     Scoreboard never imports anything from SHIP. In v0 the Scoreboard does
     not exist yet, so an unlinked implementation has no Signal and the gate
     depends on dwell alone. A linked_signal with no live Scoreboard simply
     reads as "no evidence yet" and keeps the gate honestly closed. */
  function readSignal(metricId) {
    if (!metricId) return null;
    try {
      const raw = localStorage.getItem("stndrd.scoreboard.signals");
      if (!raw) return null;
      const signals = JSON.parse(raw);
      return signals[metricId] || null; // { held, held_since, consecutive_days, threshold }
    } catch {
      return null;
    }
  }

  /* ───────────────── The gate rule ─────────────────
     gate_open becomes true only when BOTH hold:
       1. dwell elapsed: now - began_at >= required_days
       2. if linked_signal set: Signal.held && consecutive_days >= required_days
     This is the single line of enforcement that keeps the architecture honest. */
  function evaluateGate(impl) {
    const required = impl.stabilization.required_days;
    const began = impl.stabilization.began_at;

    const dwellMet = !!began && daysBetween(began, now()) >= required;
    const dwellDays = began ? Math.max(0, Math.floor(daysBetween(began, now()))) : 0;

    let signalMet = true; // vacuously true when no signal is linked
    let signal = null;
    if (impl.linked_signal) {
      signal = readSignal(impl.linked_signal);
      signalMet = !!signal && signal.held === true && signal.consecutive_days >= required;
    }

    return {
      open: impl.state === "stabilizing" && dwellMet && signalMet,
      dwellMet,
      dwellDays,
      required,
      signalRequired: !!impl.linked_signal,
      signalMet,
      signal,
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
     ACTIONS — every mutation lives here, each one followed by save+render
     ═══════════════════════════════════════════════════════════════════ */

  function deploy({ focus, bottleneck, windowDays, requiredDays, linkedSignal }) {
    if (state.active) return; // one at a time — enforced
    const opened = now();
    const closes = new Date(opened.getTime() + windowDays * DAY_MS);
    state.active = {
      id: "impl_" + opened.getTime(),
      focus: focus.trim(),
      bottleneck: bottleneck.trim(),
      window: { opened_at: iso(opened), closes_at: iso(closes), extended: [] },
      stabilization: { required_days: requiredDays, began_at: null },
      linked_signal: linkedSignal ? linkedSignal.trim() : null,
      state: "deploying",
    };
    save();
    render();
  }

  function editBottleneck(text) {
    if (!state.active) return;
    const t = text.trim();
    if (!t) return;
    state.active.bottleneck = t;
    save();
    render();
  }

  function beginStabilization() {
    const impl = state.active;
    if (!impl || impl.state !== "deploying") return;
    impl.state = "stabilizing";
    impl.stabilization.began_at = iso(now());
    save();
    render();
  }

  function extendWindow(reason) {
    const impl = state.active;
    if (!impl) return;
    const r = reason.trim();
    if (!r) return;
    // Each extension requires a reason; default +7 days of breathing room.
    const ext = { at: iso(now()), reason: r, days: 7 };
    impl.window.extended.push(ext);
    const newClose = new Date(new Date(impl.window.closes_at).getTime() + ext.days * DAY_MS);
    impl.window.closes_at = iso(newClose);
    save();
    render();
  }

  function ship() {
    const impl = state.active;
    if (!impl) return;
    const gate = evaluateGate(impl);
    if (!gate.open) return; // the system never presses SHIP for you

    const version = nextVersion(state.version.current);
    const record = {
      kind: "ship",
      implementation_id: impl.id,
      focus: impl.focus,
      shipped_at: iso(now()),
      version,
      evidence: gate.signal
        ? {
            metric_id: impl.linked_signal,
            held: gate.signal.held,
            consecutive_days: gate.signal.consecutive_days,
            threshold: gate.signal.threshold || null,
          }
        : null,
    };
    state.changelog.unshift(record); // newest first; append-only (never edited/removed)
    state.version.current = version;
    state.active = null; // slot freed for the next single implementation
    save();
    render();
    shipFlash(version, impl.focus);
  }

  function abort(reason) {
    const impl = state.active;
    if (!impl) return;
    const r = reason.trim();
    if (!r) return;
    state.changelog.unshift({
      kind: "abort",
      implementation_id: impl.id,
      focus: impl.focus,
      aborted_at: iso(now()),
      reason: r,
    });
    // Aborting does NOT increment the version. Nothing shipped.
    state.active = null;
    save();
    render();
  }

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════ */

  const $app = document.getElementById("app");
  const $version = document.getElementById("version-display");

  function render() {
    $version.textContent = "v" + state.version.current;
    $app.innerHTML = "";
    $app.appendChild(state.active ? renderImplementation(state.active) : renderStandby());
    $app.appendChild(renderChangelog());
  }

  function el(tag, opts = {}, children = []) {
    const node = document.createElement(tag);
    if (opts.class) node.className = opts.class;
    if (opts.text != null) node.textContent = opts.text;
    if (opts.html != null) node.innerHTML = opts.html;
    if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
    if (opts.on) for (const [k, v] of Object.entries(opts.on)) node.addEventListener(k, v);
    for (const c of [].concat(children)) if (c) node.appendChild(c);
    return node;
  }

  function renderStandby() {
    const wrap = el("section", { class: "section" });
    wrap.appendChild(
      el("div", { class: "section__head" }, [
        el("h2", { class: "section__title", text: "IN FLIGHT" }),
        el("span", { class: "section__meta", text: "NONE" }),
      ])
    );
    const box = el("div", { class: "standby" });
    box.appendChild(el("div", { class: "standby__glyph", text: "▢" }));
    box.appendChild(el("div", { class: "standby__line", text: "NOTHING IN FLIGHT" }));
    box.appendChild(
      el("div", {
        class: "standby__sub",
        text: "Deploy one implementation. Integrate it fully before the next.",
      })
    );
    box.appendChild(
      el("button", {
        class: "btn btn--solid btn--block",
        text: "DEPLOY IMPLEMENTATION",
        on: { click: openDeployModal },
      })
    );
    wrap.appendChild(box);
    return wrap;
  }

  function renderImplementation(impl) {
    const gate = evaluateGate(impl);
    const wrap = el("section", { class: "section" });

    wrap.appendChild(
      el("div", { class: "section__head" }, [
        el("h2", { class: "section__title", text: "IN FLIGHT" }),
        el("span", { class: "section__meta", text: "1 / 1" }),
      ])
    );

    const card = el("div", { class: "impl" });

    // State bar
    card.appendChild(
      el("div", { class: "impl__bar" }, [
        el("span", { class: "impl__state", text: impl.state.toUpperCase() }),
        el("span", { text: fmtDaysLeft(impl.window.closes_at) }),
      ])
    );

    const body = el("div", { class: "impl__body" });

    // Focus
    body.appendChild(
      el("div", {}, [
        el("span", { class: "impl__focus-label", text: "FOCUS" }),
        el("div", { class: "impl__focus", text: impl.focus }),
      ])
    );

    // Bottleneck — editable; editing it is the work
    body.appendChild(renderBottleneck(impl));

    // Telemetry
    body.appendChild(renderTelemetry(impl, gate));

    // Dwell / stabilization progress
    if (impl.state === "stabilizing") body.appendChild(renderDwell(gate));

    // Gate
    body.appendChild(renderGate(impl, gate));

    // Actions
    body.appendChild(renderActions(impl, gate));

    card.appendChild(body);
    wrap.appendChild(card);
    return wrap;
  }

  function renderBottleneck(impl) {
    const block = el("div", {});
    block.appendChild(el("span", { class: "impl__field-label", text: "BOTTLENECK — THE ONE BLOCKER" }));
    const row = el("div", { class: "bottleneck" });
    const text = el("span", { class: "bottleneck__text", text: impl.bottleneck });
    const editBtn = el("button", { class: "icon-btn", text: "EDIT" });

    editBtn.addEventListener("click", () => {
      const input = el("input", {
        class: "bottleneck__edit",
        attrs: { type: "text", value: impl.bottleneck, maxlength: "160" },
      });
      const save = el("button", { class: "icon-btn", text: "SET" });
      const commit = () => editBottleneck(input.value);
      save.addEventListener("click", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") render();
      });
      row.replaceChildren(input, save);
      input.focus();
      input.select();
    });

    row.appendChild(text);
    row.appendChild(editBtn);
    block.appendChild(row);
    return block;
  }

  function renderTelemetry(impl, gate) {
    const cells = [
      ["OPENED", fmtDate(impl.window.opened_at), false],
      ["WINDOW CLOSES", fmtDate(impl.window.closes_at), gate && daysBetween(iso(now()), new Date(impl.window.closes_at)) < 0],
      ["STABILIZATION", impl.stabilization.began_at ? fmtDate(impl.stabilization.began_at) : "NOT STARTED", false],
      ["DWELL REQUIRED", impl.stabilization.required_days + "D", false],
      ["EXTENSIONS", String(impl.window.extended.length), impl.window.extended.length > 0],
      ["LINKED SIGNAL", impl.linked_signal || "NONE", false],
    ];
    const grid = el("div", { class: "telemetry" });
    for (const [k, v, warn] of cells) {
      grid.appendChild(
        el("div", { class: "telemetry__cell" }, [
          el("span", { class: "telemetry__k", text: k }),
          el("span", { class: "telemetry__v" + (warn ? " telemetry__v--warn" : ""), text: v }),
        ])
      );
    }
    return grid;
  }

  function renderDwell(gate) {
    const pct = Math.min(100, Math.round((gate.dwellDays / gate.required) * 100));
    const wrap = el("div", { class: "dwell" });
    const track = el("div", { class: "dwell__track" });
    const fill = el("div", { class: "dwell__fill" });
    fill.style.width = pct + "%";
    track.appendChild(fill);
    wrap.appendChild(track);
    wrap.appendChild(
      el("div", { class: "dwell__legend" }, [
        el("span", { text: "DWELL " + gate.dwellDays + "/" + gate.required + "D" }),
        el("span", { text: pct + "%" }),
      ])
    );
    return wrap;
  }

  function renderGate(impl, gate) {
    const wrap = el("div", { class: "gate" + (gate.open ? " gate--open" : "") });
    wrap.appendChild(
      el("div", {
        class: "gate__status",
        text: gate.open ? "▣ GATE OPEN — READY TO SHIP" : "□ GATE CLOSED",
      })
    );

    const reasons = el("ul", { class: "gate__reasons" });
    // Reason 1: deploying must move to stabilizing first
    if (impl.state === "deploying") {
      reasons.appendChild(el("li", { text: "Stabilization not yet begun" }));
    } else {
      const dwellLi = el("li", {
        class: gate.dwellMet ? "met" : "",
        text: `Dwell ${gate.dwellDays}/${gate.required} days under normal conditions`,
      });
      reasons.appendChild(dwellLi);
      if (gate.signalRequired) {
        const sig = gate.signal;
        const txt = sig
          ? `Signal "${impl.linked_signal}" held ${sig.consecutive_days}/${gate.required}d`
          : `Signal "${impl.linked_signal}" — no evidence yet`;
        reasons.appendChild(el("li", { class: gate.signalMet ? "met" : "", text: txt }));
      }
    }
    wrap.appendChild(reasons);
    return wrap;
  }

  function renderActions(impl, gate) {
    const wrap = el("div", { class: "impl__actions" });

    if (impl.state === "deploying") {
      wrap.appendChild(
        el("button", {
          class: "btn btn--solid btn--block",
          text: "BEGIN STABILIZATION",
          on: { click: beginStabilization },
        })
      );
    }

    // SHIP — always shown while stabilizing, but gated
    if (impl.state === "stabilizing") {
      const shipBtn = el("button", {
        class: "btn btn--ship",
        text: "▮ SHIP",
        attrs: gate.open ? {} : { disabled: "disabled" },
        on: { click: ship },
      });
      wrap.appendChild(shipBtn);
    }

    // Extend (requires reason)
    wrap.appendChild(
      el("button", {
        class: "btn btn--ghost",
        text: "EXTEND WINDOW",
        on: {
          click: () =>
            openPrompt({
              title: "EXTEND WINDOW",
              note: "Every extension is recorded with a reason. +7 days.",
              label: "REASON",
              confirm: "EXTEND +7D",
              onConfirm: extendWindow,
            }),
        },
      })
    );

    // Abort (requires reason)
    wrap.appendChild(
      el("button", {
        class: "btn btn--ghost",
        text: "ABORT",
        on: {
          click: () =>
            openPrompt({
              title: "ABORT IMPLEMENTATION",
              note: "This frees the slot without shipping. The version does not increment. Recorded in the changelog.",
              label: "REASON",
              confirm: "ABORT",
              onConfirm: abort,
            }),
        },
      })
    );

    return wrap;
  }

  function renderChangelog() {
    const wrap = el("section", { class: "section" });
    wrap.appendChild(
      el("div", { class: "section__head" }, [
        el("h2", { class: "section__title", text: "CHANGELOG" }),
        el("span", { class: "section__meta", text: "APPEND-ONLY · IMMUTABLE" }),
      ])
    );

    if (state.changelog.length === 0) {
      wrap.appendChild(
        el("div", { class: "changelog__empty", text: "No history yet. The first ship writes the first line." })
      );
      return wrap;
    }

    const list = el("div", { class: "changelog" });
    for (const rec of state.changelog) {
      list.appendChild(rec.kind === "abort" ? renderAbortEntry(rec) : renderShipEntry(rec));
    }
    wrap.appendChild(list);
    return wrap;
  }

  function renderShipEntry(rec) {
    const entry = el("div", { class: "entry" });
    entry.appendChild(el("div", { class: "entry__ver", text: "v" + rec.version }));
    const right = el("div", {});
    right.appendChild(el("div", { class: "entry__focus", text: rec.focus }));
    right.appendChild(el("div", { class: "entry__line", text: "SHIPPED · " + fmtDate(rec.shipped_at) }));
    if (rec.evidence) {
      right.appendChild(
        el("div", {
          class: "entry__evidence",
          text:
            "EVIDENCE: " +
            rec.evidence.metric_id +
            " held " +
            rec.evidence.consecutive_days +
            "d" +
            (rec.evidence.threshold ? " · " + rec.evidence.threshold : ""),
        })
      );
    }
    entry.appendChild(right);
    return entry;
  }

  function renderAbortEntry(rec) {
    const entry = el("div", { class: "entry" });
    entry.appendChild(el("div", { class: "entry__ver entry__ver--abort", text: "—" }));
    const right = el("div", {});
    right.appendChild(el("div", { class: "entry__focus", text: rec.focus }));
    right.appendChild(el("div", { class: "entry__line", text: "ABORTED · " + fmtDate(rec.aborted_at) }));
    right.appendChild(el("div", { class: "entry__evidence", text: "REASON: " + rec.reason }));
    entry.appendChild(right);
    return entry;
  }

  /* ═══════════════════════════════════════════════════════════════════
     MODALS
     ═══════════════════════════════════════════════════════════════════ */

  const deployModal = document.getElementById("deploy-modal");
  const deployForm = document.getElementById("deploy-form");
  const promptModal = document.getElementById("prompt-modal");
  const promptForm = document.getElementById("prompt-form");

  function openDeployModal() {
    deployForm.reset();
    deployModal.hidden = false;
    deployForm.querySelector('[name="focus"]').focus();
  }

  deployForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(deployForm);
    deploy({
      focus: data.get("focus"),
      bottleneck: data.get("bottleneck"),
      windowDays: parseInt(data.get("window_days"), 10),
      requiredDays: parseInt(data.get("required_days"), 10),
      linkedSignal: data.get("linked_signal"),
    });
    deployModal.hidden = true;
  });

  let promptHandler = null;
  function openPrompt({ title, note, label, confirm, onConfirm }) {
    document.getElementById("prompt-title").textContent = title;
    document.getElementById("prompt-note").textContent = note || "";
    document.getElementById("prompt-label").textContent = label || "REASON";
    document.getElementById("prompt-confirm").textContent = confirm || "CONFIRM";
    const input = document.getElementById("prompt-input");
    input.value = "";
    promptHandler = onConfirm;
    promptModal.hidden = false;
    input.focus();
  }

  promptForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = document.getElementById("prompt-input").value;
    if (promptHandler && value.trim()) promptHandler(value);
    promptModal.hidden = true;
    promptHandler = null;
  });

  // Close behaviors
  document.querySelectorAll("[data-close-modal]").forEach((btn) =>
    btn.addEventListener("click", () => {
      deployModal.hidden = true;
      promptModal.hidden = true;
      promptHandler = null;
    })
  );
  [deployModal, promptModal].forEach((m) =>
    m.addEventListener("click", (e) => {
      if (e.target === m) {
        m.hidden = true;
        promptHandler = null;
      }
    })
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      deployModal.hidden = true;
      promptModal.hidden = true;
      promptHandler = null;
    }
  });

  /* ───────────────── SHIP flash — the one allowed celebration ───────────────── */
  function shipFlash(version, focus) {
    const flash = el("div", { class: "flash" }, [
      el("div", { class: "flash__word", text: "SHIPPED" }),
      el("div", { class: "flash__sub", text: focus.toUpperCase() }),
      el("div", { class: "flash__ver", text: "v" + version }),
    ]);
    document.body.appendChild(flash);
    const dismiss = () => flash.remove();
    flash.addEventListener("click", dismiss);
    setTimeout(dismiss, 2600);
  }

  /* ───────────────── Boot ───────────────── */
  render();

  // Re-evaluate the gate when the app regains focus (dwell time may have elapsed).
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.active) render();
  });

  // Service worker — makes SHIP installable and usable offline (standalone on phone).
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        /* offline support is best-effort; SHIP still runs without it */
      });
    });
  }
})();
