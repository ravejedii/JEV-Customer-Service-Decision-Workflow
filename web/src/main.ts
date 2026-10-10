import { fetchSamples, runTriage, type Samples, type TriageResult } from "./api";
import "./style.css";

type ScenarioId = "stripe" | "billingA" | "billingB";

type StepId = "customer" | "jev" | "route" | "write" | "check";

type StepState = "idle" | "running" | "done" | "skipped";

type StepDef = {
  id: StepId;
  number: string;
  actor: "customer" | "jev" | "code" | "writer" | "split";
  actorLabel: string;
  title: string;
  waiting: string;
};

const STEPS: StepDef[] = [
  {
    id: "customer",
    number: "1",
    actor: "customer",
    actorLabel: "Input",
    title: "Customer message lands",
    waiting: "Waiting for a ticket…",
  },
  {
    id: "jev",
    number: "2",
    actor: "jev",
    actorLabel: "Jev",
    title: "Jev makes three decisions",
    waiting: "Department · frustration · urgency",
  },
  {
    id: "route",
    number: "3",
    actor: "code",
    actorLabel: "Code",
    title: "Code picks the route",
    waiting: "Thresholds decide person vs auto reply",
  },
  {
    id: "write",
    number: "4",
    actor: "writer",
    actorLabel: "Open model",
    title: "Open model writes from that decision",
    waiting: "Handoff note or customer reply",
  },
  {
    id: "check",
    number: "5",
    actor: "split",
    actorLabel: "Outcome",
    title: "Final gate",
    waiting: "Jev draft check vs human in the loop",
  },
];

const WAIT_MESSAGES = [
  "Calling Jev for department, frustration, and urgency…",
  "Jev is usually quick — open model write should land in a few seconds…",
  "Code will route as soon as answers arrive…",
  "Still waiting on NVIDIA chat…",
];

const SCENARIO_STATUS: Record<ScenarioId, string> = {
  stripe:
    "Stripe Integration Failure loaded — expect high urgency → human in the loop.",
  billingA:
    "Billing Question A loaded — calm tone → auto reply → Jev checks the draft.",
  billingB:
    "Billing Question B loaded — angry tone should score urgency/frustration up → human in the loop.",
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("#app missing");
}

app.innerHTML = `
  <section class="hero">
    <p class="eyebrow">Support triage</p>
    <h1>Jev decides.<br /><em>The open model writes.</em></h1>
    <p class="hero-copy">
      One ticket, five steps. Jev returns typed judgments. Application code applies
      the route. An open model writes only the text that route allows.
    </p>
    <div class="legend">
      <span class="pill"><span class="dot jev"></span> Jev = decide</span>
      <span class="pill"><span class="dot code"></span> Code = route</span>
      <span class="pill"><span class="dot writer"></span> Open model = write</span>
    </div>
  </section>

  <div class="stage">
    <aside class="control">
      <h2>1. Pick a scenario</h2>
      <div class="scenarios">
        <button type="button" class="scenario active" data-scenario="stripe" id="stripe">
          <strong>Stripe Integration Failure</strong>
          <span>Failing payments integration + ASAP tone → expect high urgency → human in the loop</span>
        </button>
        <button type="button" class="scenario" data-scenario="billingA" id="billingA">
          <strong>Billing Question A</strong>
          <span>Calm invoice ask → low urgency/frustration scores → auto reply → Jev checks the draft</span>
        </button>
        <button type="button" class="scenario" data-scenario="billingB" id="billingB">
          <strong>Billing Question B</strong>
          <span>Same topic, angry tone — Jev should score urgency/frustration higher → human in the loop</span>
        </button>
      </div>

      <div class="message-box">
        <label for="message">Or paste your own message</label>
        <textarea id="message" placeholder="Customer support message…"></textarea>
      </div>

      <div class="play-row">
        <button type="button" class="play" id="run">Play the pipeline</button>
        <p class="status" id="status" role="status" aria-live="polite">Choose a scenario, then press play.</p>
      </div>
    </aside>

    <section class="timeline-shell">
      <div class="pipeline-header">
        <h2>2. Watch the timeline</h2>
        <div class="runtime" id="runtime" aria-live="polite">Idle</div>
      </div>
      <p class="empty" id="empty-hint">
        Nothing has run yet. Hit <strong>Play the pipeline</strong> and each step will light up in order.
      </p>
      <div class="timeline" id="timeline" hidden></div>
    </section>
  </div>
  <p class="footnote">
    Local demo. The API binds to 127.0.0.1. The chat model never chooses the department or the route.
  </p>
`;

const messageEl = document.querySelector<HTMLTextAreaElement>("#message")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const runtimeEl = document.querySelector<HTMLElement>("#runtime")!;
const timelineEl = document.querySelector<HTMLElement>("#timeline")!;
const emptyHintEl = document.querySelector<HTMLElement>("#empty-hint")!;
const runBtn = document.querySelector<HTMLButtonElement>("#run")!;
const scenarioButtons = [
  ...document.querySelectorAll<HTMLButtonElement>(".scenario"),
];

let samples: Samples = {
  stripe:
    "Hi, I've been trying to connect my Stripe account for 3 days and the integration keeps failing. I'm losing sales. Please help ASAP.",
  billingA: "Where can I download my March invoice?",
  billingB:
    "This is ridiculous. You charged my card TWICE for March and now my account is locked. I've already emailed three times. Fix the billing charge TODAY or I'm canceling and disputing everything with my bank.",
};

let selected: ScenarioId = "stripe";
let messageDirty = false;
messageEl.value = samples.stripe;
let activeController: AbortController | null = null;

messageEl.addEventListener("input", () => {
  messageDirty = true;
});

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function distribution(
  title: string,
  probabilities: Record<string, number>,
  legend?: Record<string, string>,
): string {
  const rows = Object.entries(probabilities);
  if (rows.length === 0) return "";
  const body = rows
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => {
      const width = Math.max(0, Math.min(100, (Number.isFinite(value) ? value : 0) * 100));
      const label = legend?.[key] ?? key;
      return `<div class="bar-row">
        <span class="bar-label">${escapeHtml(label)}</span>
        <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${width.toFixed(0)}%"></span></span>
        <strong>${pct(Number.isFinite(value) ? value : 0)}</strong>
      </div>`;
    })
    .join("");
  return `<div class="dist"><p class="dist-title">${escapeHtml(title)}</p>${body}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stateLabel(state: StepState): string {
  if (state === "running") return "running";
  if (state === "done") return "done";
  if (state === "skipped") return "skipped";
  return "waiting";
}

function outcomePills(mode: "waiting" | "person" | "auto"): string {
  if (mode === "waiting") {
    return `
      <span class="outcome waiting">Jev checks the draft · …</span>
      <span class="outcome waiting">Human in the loop · …</span>
    `;
  }

  if (mode === "person") {
    return `
      <span class="outcome na">Jev checks the draft · N/A</span>
      <span class="outcome human">Human in the loop</span>
    `;
  }

  return `
    <span class="outcome jev-active">Jev checks the draft</span>
    <span class="outcome na">Human in the loop · N/A</span>
  `;
}

function ensureTimelineSkeleton(): void {
  emptyHintEl.hidden = true;
  timelineEl.hidden = false;
  timelineEl.innerHTML = STEPS.map((step) => {
    const pills =
      step.id === "check"
        ? `<div class="outcome-row" data-outcomes>${outcomePills("waiting")}</div>`
        : `<span class="actor ${step.actor}">${step.actorLabel}</span>`;

    return `
    <article class="step" data-step="${step.id}" data-actor="${step.actor}" id="step-${step.id}">
      <div class="marker">${step.number}</div>
      <div class="step-body">
        <div class="step-top">
          <h3 class="step-title">${step.title}</h3>
          ${pills}
          <span class="state" data-state>waiting</span>
        </div>
        <p class="step-copy" data-copy>${step.waiting}</p>
        <div data-extra></div>
      </div>
    </article>
  `;
  }).join("");
}

function setStepState(id: StepId, state: StepState): void {
  const el = document.querySelector<HTMLElement>(`#step-${id}`);
  if (!el) return;
  el.classList.add("visible");
  el.classList.toggle("active", state === "running");
  el.classList.toggle("done", state === "done" || state === "skipped");
  const stateEl = el.querySelector<HTMLElement>("[data-state]");
  if (stateEl) {
    stateEl.className = `state ${state === "idle" ? "" : state}`.trim();
    stateEl.textContent = stateLabel(state);
  }
}

function fillStep(id: StepId, copyHtml: string, extraHtml = ""): void {
  const el = document.querySelector<HTMLElement>(`#step-${id}`);
  if (!el) return;
  const copy = el.querySelector<HTMLElement>("[data-copy]");
  const extra = el.querySelector<HTMLElement>("[data-extra]");
  if (copy) copy.innerHTML = copyHtml;
  if (extra) extra.innerHTML = extraHtml;
}

function setCheckOutcomes(mode: "waiting" | "person" | "auto"): void {
  const row = document.querySelector<HTMLElement>("#step-check [data-outcomes]");
  if (row) row.innerHTML = outcomePills(mode);
}

function showCustomerStep(message: string): void {
  setStepState("customer", "running");
  fillStep(
    "customer",
    "Ticket received. Live calls start next — the timeline will keep moving while they run.",
    `<div class="quote">${escapeHtml(message)}</div>`,
  );
  setStepState("customer", "done");
}

function showWaitingOnApis(): void {
  setStepState("jev", "running");
  fillStep(
    "jev",
    "Live call in flight: Jev decides first, then the open model writes. Usually a few seconds.",
  );
  setStepState("route", "idle");
  setStepState("write", "idle");
  setStepState("check", "idle");
  setCheckOutcomes("waiting");
  for (const id of ["route", "write", "check"] as StepId[]) {
    document.querySelector<HTMLElement>(`#step-${id}`)?.classList.add("visible");
  }
}

async function revealResults(result: TriageResult): Promise<void> {
  fillStep(
    "jev",
    `Model <strong>${escapeHtml(result.triage.model)}</strong> scores the customer's tone and intent — not a chat reply.`,
    `<div class="metrics">
      <div class="metric"><span>Department</span><strong>${escapeHtml(result.triage.department.choice)}</strong></div>
      <div class="metric"><span>Confidence</span><strong>${pct(result.triage.department.confidence)}</strong></div>
      <div class="metric"><span>Frustration</span><strong>${result.triage.frustration.score.toFixed(2)} / 2</strong></div>
      <div class="metric"><span>Urgency</span><strong>${pct(result.triage.isUrgent)}</strong></div>
    </div>
    ${distribution("Department", result.triage.department.probabilities)}
    ${distribution("Frustration", result.triage.frustration.probabilities, result.triage.frustration.legend)}`,
  );
  setStepState("jev", "done");
  await sleep(450);

  setStepState("route", "running");
  statusEl.textContent = "Code is applying the thresholds…";
  await sleep(400);
  const badge =
    result.route.kind === "person"
      ? `<span class="badge person">send to a person</span>`
      : `<span class="badge auto">auto reply</span>`;
  fillStep(
    "route",
    `${badge} <strong>${escapeHtml(result.route.reason)}</strong>`,
    `<p class="step-copy" style="margin-top:0.7rem">Rule in code: a person gets the ticket if urgency ≥ ${pct(result.route.policy.urgencyThreshold)} or frustration ≥ ${result.route.policy.frustrationThreshold}. Jev does not choose the handler.</p>`,
  );
  setStepState("route", "done");
  await sleep(450);

  setStepState("write", "running");
  statusEl.textContent = "Opening the generated text…";
  await sleep(400);
  const held =
    result.overPromiseCheck?.heldForReview === true
      ? ` <span class="badge held">held for review</span>`
      : "";
  fillStep(
    "write",
    `<strong>${escapeHtml(result.generated.label)}</strong>${held} · writer <strong>${escapeHtml(result.generated.model)}</strong>`,
    `<div class="quote">${escapeHtml(result.generated.text)}</div>`,
  );
  setStepState("write", "done");
  await sleep(400);

  setStepState("check", "running");
  if (!result.overPromiseCheck) {
    await sleep(300);
    setCheckOutcomes("person");
    fillStep(
      "check",
      "No customer draft to police — a person owns the next reply.",
      `<p class="step-copy" style="margin-top:0.55rem">Because code routed to a human, <strong>Jev checks the draft</strong> is N/A and <strong>Human in the loop</strong> is on.</p>`,
    );
    setStepState("check", "done");
  } else {
    statusEl.textContent = "Jev checked whether the draft over-promises…";
    await sleep(400);
    const check = result.overPromiseCheck;
    setCheckOutcomes("auto");
    fillStep(
      "check",
      check.heldForReview
        ? `<span class="badge held">held for review</span> Over-promise probability <strong>${pct(check.probability)}</strong> is at least ${pct(result.route.policy.overPromiseThreshold)}.`
        : `Cleared. Over-promise probability <strong>${pct(check.probability)}</strong> stays under ${pct(result.route.policy.overPromiseThreshold)}.`,
      `<p class="step-copy" style="margin-top:0.55rem"><strong>Jev checks the draft</strong> is on. <strong>Human in the loop</strong> is N/A because code stayed on auto reply.</p>`,
    );
    setStepState("check", "done");
  }
}

function selectScenario(id: ScenarioId): void {
  selected = id;
  for (const button of scenarioButtons) {
    button.classList.toggle("active", button.dataset.scenario === id);
  }
  messageEl.value = samples[id];
  messageDirty = false;
  statusEl.className = "status";
  statusEl.textContent = SCENARIO_STATUS[id];
}

async function onRun(): Promise<void> {
  const message = messageEl.value.trim();
  if (!message) {
    statusEl.className = "status error";
    statusEl.textContent = "Enter a customer message first.";
    return;
  }

  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  const timeout = window.setTimeout(() => controller.abort(), 90_000);

  runBtn.disabled = true;
  for (const button of scenarioButtons) button.disabled = true;
  statusEl.className = "status";
  statusEl.textContent = WAIT_MESSAGES[0];
  runtimeEl.textContent = "0.0s";

  ensureTimelineSkeleton();
  showCustomerStep(message);
  showWaitingOnApis();

  const started = performance.now();
  let waitIndex = 0;
  const tick = window.setInterval(() => {
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    runtimeEl.textContent = `${seconds}s · waiting on APIs`;
    waitIndex = (waitIndex + 1) % WAIT_MESSAGES.length;
    if (!statusEl.classList.contains("error")) {
      statusEl.textContent = WAIT_MESSAGES[waitIndex];
    }
  }, 2500);

  try {
    const result = await runTriage(message, { signal: controller.signal });
    window.clearInterval(tick);
    statusEl.textContent = "Answers arrived — filling the timeline…";
    await revealResults(result);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    runtimeEl.textContent = `Finished in ${seconds}s`;
    statusEl.textContent =
      result.route.kind === "person"
        ? "Pipeline complete — human in the loop."
        : "Pipeline complete — Jev checked the auto-reply draft.";
  } catch (error) {
    window.clearInterval(tick);
    const aborted =
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError");
    statusEl.className = "status error";
    statusEl.textContent = aborted
      ? "Timed out after 90s waiting on Jev/NVIDIA. Try Play again."
      : error instanceof Error
        ? error.message
        : "Pipeline failed.";
    runtimeEl.textContent = "Failed";
    fillStep(
      "jev",
      aborted
        ? "The live API call timed out. Backend may be busy or NVIDIA is slow — press Play again."
        : `Live call failed: ${escapeHtml(
            error instanceof Error ? error.message : "unknown error",
          )}`,
    );
    setStepState("jev", "idle");
    const jevEl = document.querySelector<HTMLElement>("#step-jev");
    jevEl?.classList.add("visible");
    const stateEl = jevEl?.querySelector<HTMLElement>("[data-state]");
    if (stateEl) {
      stateEl.className = "state";
      stateEl.textContent = "failed";
    }
  } finally {
    window.clearTimeout(timeout);
    window.clearInterval(tick);
    if (activeController === controller) activeController = null;
    runBtn.disabled = false;
    for (const button of scenarioButtons) button.disabled = false;
  }
}

for (const button of scenarioButtons) {
  button.addEventListener("click", () => {
    const id = button.dataset.scenario as ScenarioId;
    selectScenario(id);
  });
}

runBtn.addEventListener("click", () => {
  void onRun();
});

selectScenario("stripe");

void fetchSamples()
  .then((loaded) => {
    const previousDefault = samples[selected];
    samples = loaded;
    if (!messageDirty && messageEl.value === previousDefault) {
      messageEl.value = samples[selected];
    }
  })
  .catch(() => {
    /* keep local defaults when the API is still starting */
  });
