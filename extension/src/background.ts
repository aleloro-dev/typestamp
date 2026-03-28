const API_URL = process.env.TYPESTAMP_API_URL as string;

async function getDeviceId(): Promise<string> {
  const result = await chrome.storage.local.get("device_id");
  if (result.device_id) return result.device_id;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ device_id: id });
  return id;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "apiPost") {
    getDeviceId().then((device_id) =>
      fetch(`${API_URL}${message.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...message.body, device_id }),
      })
    )
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        sendResponse({ ok: res.ok, status: res.status, data });
      })
      .catch(() => sendResponse({ ok: false, status: 0, data: {} }));
    return true; // keep channel open for async response
  }

  if (message?.type !== "setState") return;
  const tabId = sender.tab?.id;
  if (tabId == null) return;

  const { state, eligible, hasSavedSession } = message;

  if (state === "active" && eligible) {
    chrome.action.setBadgeText({ tabId, text: "●" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#22c55e" }); // green: can save
  } else if (state === "active") {
    chrome.action.setBadgeText({ tabId, text: "●" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#ef4444" }); // red: recording
  } else if (state === "paused") {
    chrome.action.setBadgeText({ tabId, text: "●" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#f59e0b" }); // yellow: paused
  } else if (hasSavedSession) {
    chrome.action.setBadgeText({ tabId, text: "●" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#9ca3af" }); // gray: suspended
  } else {
    chrome.action.setBadgeText({ tabId, text: "" });
  }
});
