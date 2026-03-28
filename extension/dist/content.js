(() => {
  // ../packages/tracker/src/index.ts
  class Tracker {
    el;
    storageKey;
    onChange;
    _events = [];
    _state = "idle";
    _accumulatedMs = 0;
    _intervalStart = null;
    _sessionId = null;
    _totalPasted = 0;
    _saveTimer = null;
    _onKeydown;
    _onBeforeInput;
    _onBeforeUnload;
    constructor(el, options = {}) {
      this.el = el;
      this.storageKey = options.storageKey ?? "typestamp:session";
      this.onChange = options.onChange;
      this._onKeydown = (e) => {
        if (this._state !== "active")
          return;
        this._events.push({
          type: "key",
          timestamp: Date.now(),
          key: e.key,
          ...this._snapshot(),
          ...e.isTrusted ? {} : { _t: true }
        });
        this._scheduleSave();
        this.onChange?.(this.getStats());
      };
      this._onBeforeInput = (e) => {
        if (this._state !== "active")
          return;
        const pasteTypes = [
          "insertFromPaste",
          "insertFromPasteAsQuotation",
          "insertFromDrop"
        ];
        if (pasteTypes.includes(e.inputType)) {
          const pastedLength = e.data?.length ?? 0;
          this._totalPasted += pastedLength;
          this._events.push({
            type: "paste",
            timestamp: Date.now(),
            pastedLength,
            ...this._snapshot(),
            ...e.isTrusted ? {} : { _t: true }
          });
          this._scheduleSave();
          this.onChange?.(this.getStats());
        }
      };
      this._onBeforeUnload = () => {
        if (!this._sessionId)
          return;
        if (this._state === "active") {
          const now = Date.now();
          this._accumulatedMs += now - this._intervalStart;
          this._intervalStart = null;
          this._state = "paused";
          this._events.push({ type: "suspend", timestamp: now, ...this._snapshot() });
        }
        this._persist();
      };
      el.addEventListener("keydown", this._onKeydown);
      el.addEventListener("beforeinput", this._onBeforeInput);
      window.addEventListener("beforeunload", this._onBeforeUnload);
    }
    _getContent() {
      const el = this.el;
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        return el.value;
      }
      return el.innerText ?? el.textContent ?? "";
    }
    _snapshot() {
      const length = this._getContent().length;
      return { length, typed: Math.max(0, length - this._totalPasted) };
    }
    _persist() {
      if (!this._sessionId)
        return;
      try {
        localStorage.setItem(this.storageKey, JSON.stringify({
          id: this._sessionId,
          events: this._events,
          content: this._getContent(),
          accumulatedMs: this.getElapsedMs()
        }));
      } catch {}
    }
    _scheduleSave() {
      if (this._saveTimer)
        clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this._persist(), 2000);
    }
    getElapsedMs() {
      if (this._state === "active") {
        return this._accumulatedMs + (Date.now() - this._intervalStart);
      }
      return this._accumulatedMs;
    }
    getStats() {
      const content = this._getContent();
      return {
        state: this._state,
        elapsedMs: this.getElapsedMs(),
        charCount: content.trim().length,
        wordCount: content.trim().split(/\s+/).filter(Boolean).length,
        keystrokeCount: this._events.filter((e) => e.type === "key").length
      };
    }
    getState() {
      return this._state;
    }
    getSavedSession() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (!raw)
          return null;
        const parsed = JSON.parse(raw);
        if (!parsed.events?.length)
          return null;
        return parsed;
      } catch {
        return null;
      }
    }
    clearSavedSession() {
      localStorage.removeItem(this.storageKey);
      this._sessionId = null;
    }
    start() {
      this._sessionId = crypto.randomUUID();
      this._state = "active";
      this._intervalStart = Date.now();
      this._events.push({
        type: "start",
        timestamp: this._intervalStart,
        ...this._snapshot()
      });
      this._persist();
      this.onChange?.(this.getStats());
    }
    pause() {
      if (this._state !== "active")
        return;
      const now = Date.now();
      this._accumulatedMs += now - this._intervalStart;
      this._intervalStart = null;
      this._events.push({ type: "pause", timestamp: now, ...this._snapshot() });
      this._state = "paused";
      this._persist();
      this.onChange?.(this.getStats());
    }
    resume() {
      if (this._state !== "paused")
        return;
      const now = Date.now();
      this._intervalStart = now;
      this._events.push({ type: "resume", timestamp: now, ...this._snapshot() });
      this._state = "active";
      this._persist();
      this.onChange?.(this.getStats());
    }
    restore(session) {
      this._sessionId = session.id;
      this._events = session.events;
      this._accumulatedMs = session.accumulatedMs;
      const el = this.el;
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        el.value = session.content;
      } else {
        el.textContent = session.content;
      }
      const now = Date.now();
      this._events.push({ type: "restore", timestamp: now, ...this._snapshot() });
      this._intervalStart = now;
      this._state = "active";
      this._persist();
      this.onChange?.(this.getStats());
    }
    finish() {
      const now = Date.now();
      if (this._state === "active") {
        this._accumulatedMs += now - this._intervalStart;
        this._intervalStart = null;
      }
      this._events.push({ type: "finish", timestamp: now, ...this._snapshot() });
      this._state = "paused";
      this.onChange?.(this.getStats());
      return { events: [...this._events], content: this._getContent() };
    }
    discard() {
      this.clearSavedSession();
      this._events = [];
      this._state = "idle";
      this._accumulatedMs = 0;
      this._intervalStart = null;
      this._totalPasted = 0;
      if (this._saveTimer) {
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
      }
      this.onChange?.(this.getStats());
    }
    destroy() {
      this.el.removeEventListener("keydown", this._onKeydown);
      this.el.removeEventListener("beforeinput", this._onBeforeInput);
      window.removeEventListener("beforeunload", this._onBeforeUnload);
      if (this._saveTimer)
        clearTimeout(this._saveTimer);
    }
  }

  // src/content.ts
  var API_URL = "https://typestamp.com";
  var storageKey = `typestamp:${location.hostname}`;
  var activeElement = null;
  var tracker = null;
  var sessionLocked = false;
  function isTrackable(el) {
    if (!(el instanceof HTMLElement))
      return false;
    if (el instanceof HTMLTextAreaElement)
      return true;
    if (el instanceof HTMLInputElement && el.type === "text")
      return true;
    if (el.isContentEditable)
      return true;
    return false;
  }
  function getElementLabel(el) {
    return el.getAttribute("aria-label") || el.placeholder || el.getAttribute("name") || el.id || el.tagName.toLowerCase();
  }
  function notifyState(stats) {
    const eligible = stats.state === "active" && stats.charCount >= 200 && stats.keystrokeCount > 0;
    const hasSavedSession = tracker?.getSavedSession() !== null;
    chrome.runtime.sendMessage({ type: "setState", state: stats.state, eligible, hasSavedSession });
  }
  function attachTracker(el) {
    if (el === activeElement)
      return;
    if (sessionLocked)
      return;
    tracker?.destroy();
    activeElement = el;
    tracker = new Tracker(el, { storageKey, onChange: notifyState });
    notifyState(tracker.getStats());
  }
  document.addEventListener("focus", (e) => {
    if (isTrackable(e.target))
      attachTracker(e.target);
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
        hasSavedSession: tracker.getSavedSession() !== null
      });
      return false;
    }
    if (message.type === "start") {
      if (!tracker) {
        sendResponse({ ok: false });
        return false;
      }
      const saved = tracker.getSavedSession();
      if (saved)
        tracker.restore(saved);
      else
        tracker.start();
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
      if (!tracker) {
        sendResponse({ ok: false });
        return false;
      }
      tracker.resume();
      sessionLocked = true;
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === "save") {
      if (!tracker) {
        sendResponse({ ok: false, error: "No tracker" });
        return false;
      }
      const { events, content } = tracker.finish();
      chrome.runtime.sendMessage({ type: "apiPost", path: "/api/proofs", body: { content, events, source_host: location.hostname } }, (res) => {
        if (!res?.ok) {
          if (res?.status === 429) {
            sendResponse({ ok: false, error: "You've sent too many typestamps recently. Wait a while to send more." });
          } else {
            sendResponse({ ok: false, error: res?.data?.error || `Error ${res?.status}` });
          }
          return;
        }
        tracker.clearSavedSession();
        tracker.destroy();
        tracker = null;
        sessionLocked = false;
        sendResponse({ ok: true, url: `${API_URL}/${res.data.slug}` });
      });
      return true;
    }
    if (message.type === "discard") {
      tracker?.discard();
      sessionLocked = false;
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });
})();
