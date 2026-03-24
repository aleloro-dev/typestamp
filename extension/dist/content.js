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
          ...this._snapshot()
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
            ...this._snapshot()
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

  // src/widget.ts
  var WIDGET_CSS = `
  :host {
    pointer-events: none;
  }
  .widget {
    pointer-events: auto;
    display: inline-flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.1);
    padding: 4px 8px;
    white-space: nowrap;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12px;
    cursor: default;
    user-select: none;
  }
  .widget:hover {
    padding: 8px 12px;
  }
  .brand {
    display: none;
    font-weight: 600;
    color: #111;
    font-size: 12px;
    margin-bottom: 4px;
  }
  .widget:hover .brand { display: block; }
  .row1 {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ccc;
    flex-shrink: 0;
  }
  .dot.active { background: #22c55e; }
  .dot.paused { background: #f59e0b; }
  .chars { color: #555; }
  .duration { color: #aaa; }
  .actions {
    display: none;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
  }
  .widget:hover .actions { display: flex; }
  button {
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }
  .btn-primary { background: #222; color: #fff; }
  .btn-primary:hover { background: #444; }
  .btn-primary:disabled { background: #999; cursor: default; }
  .btn-secondary { background: #f0f0f0; color: #333; }
  .btn-secondary:hover { background: #e0e0e0; }
  .btn-close {
    background: none;
    color: #aaa;
    padding: 0 4px;
    font-size: 16px;
    line-height: 1;
  }
  .btn-close:hover { color: #333; background: #f0f0f0; }
  .proof-link {
    color: #111;
    text-decoration: none;
    border-bottom: 1px solid #ccc;
  }
  .proof-link:hover { border-color: #111; }
`;
  function getCaretPageCoords(el) {
    const position = el.selectionEnd ?? el.value.length;
    const computed = window.getComputedStyle(el);
    const elRect = el.getBoundingClientRect();
    const mirror = document.createElement("div");
    const props = [
      "boxSizing",
      "width",
      "overflowX",
      "overflowY",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "fontStyle",
      "fontVariant",
      "fontWeight",
      "fontSize",
      "lineHeight",
      "fontFamily",
      "textAlign",
      "textTransform",
      "textIndent",
      "letterSpacing",
      "wordSpacing",
      "tabSize"
    ];
    Object.assign(mirror.style, {
      position: "absolute",
      visibility: "hidden",
      pointerEvents: "none",
      whiteSpace: "pre-wrap",
      wordWrap: "break-word",
      left: `${elRect.left + window.scrollX}px`,
      top: `${elRect.top + window.scrollY}px`,
      width: `${elRect.width}px`
    });
    for (const prop of props) {
      mirror.style[prop] = computed[prop];
    }
    document.body.appendChild(mirror);
    mirror.textContent = el.value.substring(0, position);
    const marker = document.createElement("span");
    marker.textContent = "​";
    mirror.appendChild(marker);
    mirror.scrollTop = el.scrollTop;
    const markerRect = marker.getBoundingClientRect();
    document.body.removeChild(mirror);
    return {
      x: markerRect.left + window.scrollX,
      y: markerRect.bottom + window.scrollY
    };
  }
  function createWidget(el, apiUrl) {
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;z-index:2147483647;";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = WIDGET_CSS;
    shadow.appendChild(style);
    const widgetEl = document.createElement("div");
    widgetEl.className = "widget";
    shadow.appendChild(widgetEl);
    function repositionToElement() {
      const rect = el.getBoundingClientRect();
      host.style.top = `${rect.bottom + window.scrollY + 6}px`;
      host.style.left = `${rect.right + window.scrollX}px`;
      host.style.transform = "translateX(-100%)";
    }
    function reposition() {
      if (tracker.getState() === "active" && el instanceof HTMLTextAreaElement) {
        try {
          const { x, y } = getCaretPageCoords(el);
          host.style.top = `${y + 6}px`;
          host.style.left = `${x}px`;
          host.style.transform = "none";
          return;
        } catch {}
      }
      repositionToElement();
    }
    repositionToElement();
    const elementId = el.id || el.getAttribute("name") || `el-${Array.from(document.querySelectorAll("textarea, input, [contenteditable]")).indexOf(el)}`;
    const storageKey = `typestamp:${location.hostname}:${elementId}`;
    let durationTimer = null;
    let proofUrl = null;
    const tracker = new Tracker(el, {
      storageKey,
      onChange: () => {
        reposition();
        updateWidget();
      }
    });
    const brandEl = document.createElement("div");
    brandEl.className = "brand";
    brandEl.textContent = "Typestamp";
    const row1 = document.createElement("div");
    row1.className = "row1";
    const dot = document.createElement("span");
    dot.className = "dot";
    const charsEl = document.createElement("span");
    charsEl.className = "chars";
    const durationEl = document.createElement("span");
    durationEl.className = "duration";
    row1.appendChild(dot);
    row1.appendChild(charsEl);
    row1.appendChild(durationEl);
    const actionsEl = document.createElement("div");
    actionsEl.className = "actions";
    const actionBtn = document.createElement("button");
    actionBtn.className = "btn-secondary";
    const saveBtn = document.createElement("button");
    saveBtn.className = "btn-primary";
    saveBtn.textContent = "Save proof";
    const discardBtn = document.createElement("button");
    discardBtn.className = "btn-secondary";
    discardBtn.textContent = "Discard";
    const closeBtn = document.createElement("button");
    closeBtn.className = "btn-close";
    closeBtn.textContent = "×";
    const proofLink = document.createElement("a");
    proofLink.className = "proof-link";
    proofLink.target = "_blank";
    proofLink.rel = "noopener noreferrer";
    proofLink.textContent = "View proof →";
    widgetEl.appendChild(brandEl);
    widgetEl.appendChild(row1);
    widgetEl.appendChild(actionsEl);
    actionBtn.addEventListener("click", () => {
      const state = tracker.getState();
      if (state === "idle") {
        const saved = tracker.getSavedSession();
        if (saved)
          tracker.restore(saved);
        else
          tracker.start();
        startTimer();
        el.focus();
      } else if (state === "active") {
        tracker.pause();
        stopTimer();
      } else {
        tracker.resume();
        startTimer();
        el.focus();
      }
    });
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      stopTimer();
      const { events, content } = tracker.finish();
      try {
        const res = await fetch(`${apiUrl}/api/proofs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, events, source_host: location.hostname })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Error ${res.status}`);
        }
        const { slug } = await res.json();
        tracker.clearSavedSession();
        proofUrl = `${apiUrl}/proofs/${slug}`;
        updateWidget();
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save proof";
        charsEl.textContent = err instanceof Error ? err.message : "Failed to save";
        charsEl.style.color = "red";
      }
    });
    discardBtn.addEventListener("click", () => {
      if (!confirm("Discard this session?"))
        return;
      tracker.discard();
      stopTimer();
      proofUrl = null;
      repositionToElement();
      updateWidget();
    });
    closeBtn.addEventListener("click", () => {
      _dismissed = true;
      if (tracker.getState() === "active")
        tracker.pause();
      destroy();
    });
    function updateWidget() {
      if (proofUrl) {
        dot.className = "dot";
        charsEl.style.color = "";
        charsEl.textContent = "Proof saved";
        durationEl.textContent = "";
        actionsEl.innerHTML = "";
        proofLink.href = proofUrl;
        actionsEl.appendChild(proofLink);
        actionsEl.appendChild(closeBtn);
        return;
      }
      const stats = tracker.getStats();
      dot.className = `dot ${stats.state}`;
      charsEl.style.color = "";
      charsEl.textContent = `${stats.charCount} chars`;
      durationEl.textContent = stats.state !== "idle" ? formatDuration(stats.elapsedMs) : "";
      actionsEl.innerHTML = "";
      if (stats.state === "idle") {
        const saved = tracker.getSavedSession();
        actionBtn.textContent = saved ? "Resume" : "Start session";
        actionsEl.appendChild(actionBtn);
        if (saved)
          actionsEl.appendChild(discardBtn);
      } else {
        actionBtn.textContent = stats.state === "active" ? "Pause" : "Resume";
        actionsEl.appendChild(actionBtn);
        if (stats.charCount >= 200 && stats.keystrokeCount > 0) {
          actionsEl.appendChild(saveBtn);
        }
        actionsEl.appendChild(discardBtn);
      }
      actionsEl.appendChild(closeBtn);
    }
    function startTimer() {
      if (durationTimer)
        return;
      durationTimer = setInterval(() => updateWidget(), 1000);
    }
    function stopTimer() {
      if (durationTimer) {
        clearInterval(durationTimer);
        durationTimer = null;
      }
    }
    let _destroyed = false;
    let _dismissed = false;
    function destroy() {
      tracker.destroy();
      stopTimer();
      window.removeEventListener("scroll", reposition);
      window.removeEventListener("resize", repositionToElement);
      host.remove();
      _destroyed = true;
    }
    window.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", repositionToElement, { passive: true });
    updateWidget();
    return {
      isActive: () => !_destroyed && tracker.getState() !== "idle",
      isDismissed: () => _dismissed,
      destroy
    };
  }

  // src/content.ts
  var API_URL = "http://localhost:3000";
  var attached = new WeakMap;
  var dismissed = new WeakSet;
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
  document.addEventListener("focus", (e) => {
    const el = e.target;
    if (!isTrackable(el))
      return;
    if (attached.has(el))
      return;
    if (dismissed.has(el))
      return;
    const widget = createWidget(el, API_URL);
    attached.set(el, widget);
    el.addEventListener("blur", () => {
      setTimeout(() => {
        const w = attached.get(el);
        if (w && !w.isActive()) {
          if (w.isDismissed())
            dismissed.add(el);
          w.destroy();
          attached.delete(el);
        }
      }, 200);
    }, { once: true });
  }, true);
})();
