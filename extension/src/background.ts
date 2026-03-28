const API_URL = process.env.TYPESTAMP_API_URL as string;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "apiPost") {
    fetch(`${API_URL}${message.path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.body),
    })
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
