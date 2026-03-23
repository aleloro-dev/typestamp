const FUNCTIONAL_KEYS = new Set([
  "Backspace", "Delete", "Enter", "Tab", "Escape", "CapsLock",
  "Shift", "Control", "Alt", "Meta",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
  "Home", "End", "PageUp", "PageDown",
]);

export type ProofEvent = {
  type: string;
  timestamp: number;
  key?: string;
  length: number;
  typed: number;
  pastedLength?: number;
};

export type AuditSignal = Omit<ProofEvent, "key"> & { key?: string };

export function extractAuditSignals(events: ProofEvent[]): AuditSignal[] {
  return events.map((e) => {
    if (e.type !== "key") return e;
    const { key, ...rest } = e;
    return key && FUNCTIONAL_KEYS.has(key) ? { ...rest, key } : rest;
  });
}
