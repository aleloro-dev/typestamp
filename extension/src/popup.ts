type SessionState = "idle" | "active" | "paused";

interface TrackerStats {
  state: SessionState;
  elapsedMs: number;
  charCount: number;
  wordCount: number;
  keystrokeCount: number;
}

interface ContentState {
  state: SessionState;
  stats: TrackerStats | null;
  hasElement: boolean;
  elementLabel: string;
  hasSavedSession: boolean;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s % 60}s`;
}

function make(tag: string, className?: string): HTMLElement {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function btn(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = className;
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

async function getTabId(): Promise<number | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]?.id ?? null);
    });
  });
}

async function send<T>(message: object): Promise<T | null> {
  const tabId = await getTabId();
  if (tabId == null) return null;
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) { resolve(null); return; }
      resolve(response as T);
    });
  });
}

const root = document.getElementById("root")!;
let proofUrl: string | null = null;
let saveError: string | null = null;
let isSaving = false;
let confirmingDiscard = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;

function render(body: HTMLElement | null) {
  root.innerHTML = "";
  const wrapper = make("div");

  const header = make("div", "header");
  const brand = make("span", "brand");
  brand.textContent = "Typestamp";
  header.appendChild(brand);
  wrapper.appendChild(header);

  if (body) wrapper.appendChild(body);
  root.appendChild(wrapper);
}

async function handleSave() {
  isSaving = true;
  saveError = null;
  await refresh();

  const res = await send<{ ok: boolean; url?: string; error?: string }>({ type: "save" });
  isSaving = false;

  if (!res?.ok) {
    saveError = res?.error ?? "Failed to save. Please try again.";
  } else {
    proofUrl = res.url ?? null;
  }
  await refresh();
}

function handleDiscard() {
  confirmingDiscard = true;
  refresh();
}

async function confirmDiscard() {
  await send({ type: "discard" });
  proofUrl = null;
  saveError = null;
  isSaving = false;
  confirmingDiscard = false;
  await refresh();
}

function cancelDiscard() {
  confirmingDiscard = false;
  refresh();
}

async function refresh() {
  if (proofUrl) {
    const body = make("div");
    const box = make("div", "proof-box");
    const label = make("div", "proof-label");
    label.textContent = "Typestamp saved";
    const link = document.createElement("a");
    link.className = "proof-link";
    link.href = proofUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View typestamp →";
    box.appendChild(label);
    box.appendChild(link);
    body.appendChild(box);
    body.appendChild(btn("New session", "btn-secondary", () => {
      proofUrl = null;
      refresh();
    }));
    render(body);
    return;
  }

  const state = await send<ContentState>({ type: "getState" });

  if (state === null) {
    const body = make("div");
    const msg = make("p", "message");
    msg.textContent = "Typestamp is not available on this page.";
    body.appendChild(msg);
    render(body);
    return;
  }

  if (!state.hasElement) {
    const body = make("div");
    const msg = make("p", "message");
    msg.textContent = "No text editor detected.";
    const hint = make("p", "hint");
    hint.textContent = "Click into a text field first.";
    body.appendChild(msg);
    body.appendChild(hint);
    render(body);
    return;
  }

  const { stats, elementLabel, hasSavedSession } = state;

  if (state.state === "idle") {
    const body = make("div");
    if (hasSavedSession) {
      const actions = make("div", "actions");
      const row = make("div", "actions-row");
      row.appendChild(btn("Resume session", "btn-primary", async () => {
        await send({ type: "start" });
        refresh();
      }));
      actions.appendChild(row);
      if (confirmingDiscard) {
        const confirm = make("div", "confirm");
        const msg = make("span", "confirm-msg");
        msg.textContent = "Discard this session?";
        confirm.appendChild(msg);
        const confirmRow = make("div", "actions-row");
        confirmRow.appendChild(btn("Yes, discard", "btn-danger", confirmDiscard));
        confirmRow.appendChild(btn("Cancel", "btn-secondary", cancelDiscard));
        confirm.appendChild(confirmRow);
        actions.appendChild(confirm);
      } else {
        actions.appendChild(btn("Discard", "btn-secondary", handleDiscard));
      }
      body.appendChild(actions);
    } else {
      body.appendChild(btn("Start session", "btn-primary", async () => {
        await send({ type: "start" });
        refresh();
      }));
    }
    render(body);
    return;
  }

  if (!stats) { render(null); return; }

  const isActive = state.state === "active";
  const isEligible = stats.charCount >= 200 && stats.keystrokeCount > 0;

  const body = make("div");

  const statsBox = make("div", "stats");
  const statsRow = make("div", "stats-row");
  const dotClass = state.state === "active" ? (isEligible ? "saveable" : "recording") : state.state;
  const dot = make("span", `dot ${dotClass}`);
  const charsEl = make("span", "stat-chars");
  charsEl.textContent = `${stats.charCount} chars`;
  const durEl = make("span", "stat-duration");
  durEl.textContent = formatDuration(stats.elapsedMs);
  statsRow.appendChild(dot);
  statsRow.appendChild(charsEl);
  statsRow.appendChild(durEl);
  if (elementLabel) {
    const lbl = make("span", "element-label");
    lbl.textContent = elementLabel;
    statsRow.appendChild(lbl);
  }
  statsBox.appendChild(statsRow);
  body.appendChild(statsBox);

  const actions = make("div", "actions");
  const topRow = make("div", "actions-row");

  const toggleBtn = btn(
    isActive ? "Pause" : "Resume",
    "btn-secondary",
    async () => {
      await send({ type: isActive ? "pause" : "resume" });
      refresh();
    },
  );
  topRow.appendChild(toggleBtn);

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn-primary";
  saveBtn.textContent = isSaving ? "Saving…" : "Save typestamp";
  if (!isEligible || isSaving) saveBtn.disabled = true;
  saveBtn.addEventListener("click", handleSave);
  topRow.appendChild(saveBtn);

  actions.appendChild(topRow);

  if (confirmingDiscard) {
    const confirm = make("div", "confirm");
    const msg = make("span", "confirm-msg");
    msg.textContent = "Discard this session?";
    confirm.appendChild(msg);
    const confirmRow = make("div", "actions-row");
    confirmRow.appendChild(btn("Yes, discard", "btn-danger", confirmDiscard));
    confirmRow.appendChild(btn("Cancel", "btn-secondary", cancelDiscard));
    confirm.appendChild(confirmRow);
    actions.appendChild(confirm);
  } else {
    actions.appendChild(btn("Discard", "btn-secondary", handleDiscard));
  }

  if (saveError) {
    const err = make("p", "error");
    err.textContent = saveError;
    actions.appendChild(err);
  }

  body.appendChild(actions);
  render(body);
}

document.addEventListener("DOMContentLoaded", () => {
  refresh();
  pollInterval = setInterval(refresh, 1000);
});

window.addEventListener("unload", () => {
  if (pollInterval) clearInterval(pollInterval);
});
