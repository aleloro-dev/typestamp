import { createWidget } from "./widget";

const API_URL = process.env.TYPESTAMP_API_URL as string;

const attached = new WeakMap<HTMLElement, { destroy: () => void; isDismissed: () => boolean }>();
const dismissed = new WeakSet<HTMLElement>();

function isTrackable(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement && el.type === "text") return true;
  if (el.isContentEditable) return true;
  return false;
}

document.addEventListener(
  "focus",
  (e) => {
    const el = e.target;
    if (!isTrackable(el)) return;
    if (attached.has(el)) return;
    if (dismissed.has(el)) return;

    const widget = createWidget(el, API_URL);
    attached.set(el, widget);

    el.addEventListener(
      "blur",
      () => {
        // Small delay to allow clicks inside the widget
        setTimeout(() => {
          const w = attached.get(el);
          if (w && !w.isActive()) {
            if (w.isDismissed()) dismissed.add(el);
            w.destroy();
            attached.delete(el);
          }
        }, 200);
      },
      { once: true },
    );
  },
  true,
);
