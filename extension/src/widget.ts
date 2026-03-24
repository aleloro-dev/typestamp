import { Tracker } from "@typestamp/tracker";

const WIDGET_CSS = `
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

function getCaretPageCoords(el: HTMLTextAreaElement): { x: number; y: number } {
  const position = el.selectionEnd ?? el.value.length;
  const computed = window.getComputedStyle(el);
  const elRect = el.getBoundingClientRect();

  const mirror = document.createElement("div");
  const props = [
    "boxSizing", "width", "overflowX", "overflowY",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "fontStyle", "fontVariant", "fontWeight", "fontSize", "lineHeight",
    "fontFamily", "textAlign", "textTransform", "textIndent", "letterSpacing",
    "wordSpacing", "tabSize",
  ];

  Object.assign(mirror.style, {
    position: "absolute",
    visibility: "hidden",
    pointerEvents: "none",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
    left: `${elRect.left + window.scrollX}px`,
    top: `${elRect.top + window.scrollY}px`,
    width: `${elRect.width}px`,
  });

  for (const prop of props) {
    (mirror.style as CSSStyleDeclaration & Record<string, string>)[prop] =
      computed[prop as keyof CSSStyleDeclaration] as string;
  }

  document.body.appendChild(mirror);

  mirror.textContent = el.value.substring(0, position);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.appendChild(marker);
  mirror.scrollTop = el.scrollTop;

  const markerRect = marker.getBoundingClientRect();
  document.body.removeChild(mirror);

  return {
    x: markerRect.left + window.scrollX,
    y: markerRect.bottom + window.scrollY,
  };
}

export function createWidget(
  el: HTMLElement,
  apiUrl: string,
): { destroy: () => void; isActive: () => boolean; isDismissed: () => boolean } {
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

  const elementId =
    el.id ||
    el.getAttribute("name") ||
    `el-${Array.from(
      document.querySelectorAll("textarea, input, [contenteditable]"),
    ).indexOf(el)}`;
  const storageKey = `typestamp:${location.hostname}:${elementId}`;

  let durationTimer: ReturnType<typeof setInterval> | null = null;
  let proofUrl: string | null = null;

  const tracker = new Tracker(el, {
    storageKey,
    onChange: () => {
      reposition();
      updateWidget();
    },
  });

  // --- Stable DOM nodes ---
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

  // --- Event listeners ---
  actionBtn.addEventListener("click", () => {
    const state = tracker.getState();
    if (state === "idle") {
      const saved = tracker.getSavedSession();
      if (saved) tracker.restore(saved);
      else tracker.start();
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
        body: JSON.stringify({ content, events, source_host: location.hostname }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }
      const { slug } = await res.json();
      tracker.clearSavedSession();
      proofUrl = `${apiUrl}/proofs/${slug}`;
      updateWidget();
    } catch (err: unknown) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save proof";
      charsEl.textContent = err instanceof Error ? err.message : "Failed to save";
      charsEl.style.color = "red";
    }
  });

  discardBtn.addEventListener("click", () => {
    if (!confirm("Discard this session?")) return;
    tracker.discard();
    stopTimer();
    proofUrl = null;
    repositionToElement();
    updateWidget();
  });

  closeBtn.addEventListener("click", () => {
    _dismissed = true;
    if (tracker.getState() === "active") tracker.pause();
    destroy();
  });

  // --- Update in place ---
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
      if (saved) actionsEl.appendChild(discardBtn);
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
    if (durationTimer) return;
    durationTimer = setInterval(() => updateWidget(), 1000);
  }

  function stopTimer() {
    if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
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
    destroy,
  };
}
