import { Tracker } from "@typestamp/tracker";
import type { TrackerStats } from "@typestamp/tracker";

const API_URL = process.env.TYPESTAMP_API_URL as string;
const storageKey = `typestamp:${location.hostname}`;

let activeElement: HTMLElement | null = null;
let tracker: Tracker | null = null;
let sessionLocked = false;

function isTrackable(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement && el.type === "text") return true;
  if (el.isContentEditable) return true;
  return false;
}

function getElementLabel(el: HTMLElement): string {
  return (
    el.getAttribute("aria-label") ||
    (el as HTMLInputElement).placeholder ||
    el.getAttribute("name") ||
    el.id ||
    el.tagName.toLowerCase()
  );
}

function notifyState(stats: TrackerStats) {
  const eligible = stats.state === "active" && stats.charCount >= 200 && stats.keystrokeCount > 0;
  const hasSavedSession = tracker?.getSavedSession() !== null;
  chrome.runtime.sendMessage({ type: "setState", state: stats.state, eligible, hasSavedSession });
}

function attachTracker(el: HTMLElement) {
  if (el === activeElement) return;
  if (sessionLocked) return;

  tracker?.destroy();
  activeElement = el;
  tracker = new Tracker(el, { storageKey, onChange: notifyState });
  notifyState(tracker.getStats());
}

document.addEventListener("focus", (e) => {
  if (isTrackable(e.target)) attachTracker(e.target);
}, true);

if (isTrackable(document.activeElement)) {
  attachTracker(document.activeElement);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "getState") {
    if (!tracker || !activeElement) {
      sendResponse({ state: "idle", stats: null, hasElement: false, elementLabel: "", hasSavedSession: false });
      return false;
    }
    sendResponse({
      state: tracker.getState(),
      stats: tracker.getStats(),
      hasElement: true,
      elementLabel: getElementLabel(activeElement),
      hasSavedSession: tracker.getSavedSession() !== null,
    });
    return false;
  }

  if (message.type === "start") {
    if (!tracker) { sendResponse({ ok: false }); return false; }
    const saved = tracker.getSavedSession();
    if (saved) tracker.restore(saved);
    else tracker.start();
    sessionLocked = true;
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "pause") {
    tracker?.pause();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "resume") {
    if (!tracker) { sendResponse({ ok: false }); return false; }
    tracker.resume();
    sessionLocked = true;
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "save") {
    if (!tracker) { sendResponse({ ok: false, error: "No tracker" }); return false; }
    const { events, content } = tracker.finish();
    chrome.runtime.sendMessage(
      { type: "apiPost", path: "/api/proofs", body: { content, events, source_host: location.hostname } },
      (res: { ok: boolean; status: number; data: { slug?: string; error?: string } }) => {
        if (!res?.ok) {
          if (res?.status === 429) {
            sendResponse({ ok: false, error: "You've sent too many typestamps recently. Wait a while to send more." });
          } else {
            sendResponse({ ok: false, error: res?.data?.error || `Error ${res?.status}` });
          }
          return;
        }
        tracker!.clearSavedSession();
        tracker!.destroy();
        tracker = null;
        sessionLocked = false;
        sendResponse({ ok: true, url: `${API_URL}/${res.data.slug}` });
      }
    );
    return true; // keep channel open for async response
  }

  if (message.type === "discard") {
    tracker?.discard();
    sessionLocked = false;
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
