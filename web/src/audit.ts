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

export type AuditSignal = Omit<ProofEvent, "type" | "key"> & {
  type: "key_char" | "key_func" | "paste" | "start" | "finish" | "pause" | "resume" | "suspend" | "restore";
  key?: string;
};

export function extractAuditSignals(events: ProofEvent[]): AuditSignal[] {
  return events.map((e) => {
    if (e.type !== "key") return e as AuditSignal;
    const { key, ...rest } = e;
    return key && FUNCTIONAL_KEYS.has(key)
      ? { ...rest, type: "key_func" as const, key }
      : { ...rest, type: "key_char" as const };
  });
}
