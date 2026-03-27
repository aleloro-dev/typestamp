export type ProofEvent = {
  type: string;
  timestamp: number;
  key?: string;
  length: number;
  typed: number;
  pastedLength?: number;
  _t?: true;
};

export type SessionState = "idle" | "active" | "paused";

export type SavedSession = {
  id: string;
  events: ProofEvent[];
  content: string;
  accumulatedMs: number;
};

export type TrackerStats = {
  state: SessionState;
  elapsedMs: number;
  charCount: number;
  wordCount: number;
  keystrokeCount: number;
};

export type TrackerOptions = {
  storageKey?: string;
  onChange?: (stats: TrackerStats) => void;
};

export class Tracker {
  private el: HTMLElement;
  private storageKey: string;
  private onChange?: (stats: TrackerStats) => void;

  private _events: ProofEvent[] = [];
  private _state: SessionState = "idle";
  private _accumulatedMs = 0;
  private _intervalStart: number | null = null;
  private _sessionId: string | null = null;
  private _totalPasted = 0;
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;

  private _onKeydown: (e: KeyboardEvent) => void;
  private _onBeforeInput: (e: InputEvent) => void;
  private _onBeforeUnload: () => void;

  constructor(el: HTMLElement, options: TrackerOptions = {}) {
    this.el = el;
    this.storageKey = options.storageKey ?? "typestamp:session";
    this.onChange = options.onChange;

    this._onKeydown = (e: KeyboardEvent) => {
      if (this._state !== "active") return;
      this._events.push({
        type: "key",
        timestamp: Date.now(),
        key: e.key,
        ...this._snapshot(),
        ...(e.isTrusted ? {} : { _t: true as const }),
      });
      this._scheduleSave();
      this.onChange?.(this.getStats());
    };

    this._onBeforeInput = (e: InputEvent) => {
      if (this._state !== "active") return;
      const pasteTypes = [
        "insertFromPaste",
        "insertFromPasteAsQuotation",
        "insertFromDrop",
      ];
      if (pasteTypes.includes(e.inputType)) {
        const pastedLength = e.data?.length ?? 0;
        this._totalPasted += pastedLength;
        this._events.push({
          type: "paste",
          timestamp: Date.now(),
          pastedLength,
          ...this._snapshot(),
          ...(e.isTrusted ? {} : { _t: true as const }),
        });
        this._scheduleSave();
        this.onChange?.(this.getStats());
      }
    };

    this._onBeforeUnload = () => {
      if (!this._sessionId) return;
      if (this._state === "active") {
        const now = Date.now();
        this._accumulatedMs += now - this._intervalStart!;
        this._intervalStart = null;
        this._state = "paused";
        this._events.push({ type: "suspend", timestamp: now, ...this._snapshot() });
      }
      this._persist();
    };

    el.addEventListener("keydown", this._onKeydown);
    el.addEventListener("beforeinput", this._onBeforeInput as EventListener);
    window.addEventListener("beforeunload", this._onBeforeUnload);
  }

  private _getContent(): string {
    const el = this.el;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      return el.value;
    }
    return (el as HTMLElement).innerText ?? el.textContent ?? "";
  }

  private _snapshot(): { length: number; typed: number } {
    const length = this._getContent().length;
    return { length, typed: Math.max(0, length - this._totalPasted) };
  }

  private _persist(): void {
    if (!this._sessionId) return;
    try {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify({
          id: this._sessionId,
          events: this._events,
          content: this._getContent(),
          accumulatedMs: this.getElapsedMs(),
        }),
      );
    } catch {}
  }

  private _scheduleSave(): void {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._persist(), 2000);
  }

  getElapsedMs(): number {
    if (this._state === "active") {
      return this._accumulatedMs + (Date.now() - this._intervalStart!);
    }
    return this._accumulatedMs;
  }

  getStats(): TrackerStats {
    const content = this._getContent();
    return {
      state: this._state,
      elapsedMs: this.getElapsedMs(),
      charCount: content.trim().length,
      wordCount: content.trim().split(/\s+/).filter(Boolean).length,
      keystrokeCount: this._events.filter((e) => e.type === "key").length,
    };
  }

  getState(): SessionState {
    return this._state;
  }

  getSavedSession(): SavedSession | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SavedSession;
      if (!parsed.events?.length) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  clearSavedSession(): void {
    localStorage.removeItem(this.storageKey);
    this._sessionId = null;
  }

  start(): void {
    this._sessionId = crypto.randomUUID();
    this._state = "active";
    this._intervalStart = Date.now();
    this._events.push({
      type: "start",
      timestamp: this._intervalStart,
      ...this._snapshot(),
    });
    this._persist();
    this.onChange?.(this.getStats());
  }

  pause(): void {
    if (this._state !== "active") return;
    const now = Date.now();
    this._accumulatedMs += now - this._intervalStart!;
    this._intervalStart = null;
    this._events.push({ type: "pause", timestamp: now, ...this._snapshot() });
    this._state = "paused";
    this._persist();
    this.onChange?.(this.getStats());
  }

  resume(): void {
    if (this._state !== "paused") return;
    const now = Date.now();
    this._intervalStart = now;
    this._events.push({ type: "resume", timestamp: now, ...this._snapshot() });
    this._state = "active";
    this._persist();
    this.onChange?.(this.getStats());
  }

  restore(session: SavedSession): void {
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

  finish(): { events: ProofEvent[]; content: string } {
    const now = Date.now();
    if (this._state === "active") {
      this._accumulatedMs += now - this._intervalStart!;
      this._intervalStart = null;
    }
    this._events.push({ type: "finish", timestamp: now, ...this._snapshot() });
    this._state = "paused";
    this.onChange?.(this.getStats());
    return { events: [...this._events], content: this._getContent() };
  }

  discard(): void {
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

  destroy(): void {
    this.el.removeEventListener("keydown", this._onKeydown);
    this.el.removeEventListener(
      "beforeinput",
      this._onBeforeInput as EventListener,
    );
    window.removeEventListener("beforeunload", this._onBeforeUnload);
    if (this._saveTimer) clearTimeout(this._saveTimer);
  }
}
