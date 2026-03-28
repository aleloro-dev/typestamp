(() => {
  // src/background.ts
  var API_URL = "https://typestamp.com";
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "apiPost") {
      fetch(`${API_URL}${message.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message.body)
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        sendResponse({ ok: res.ok, status: res.status, data });
      }).catch(() => sendResponse({ ok: false, status: 0, data: {} }));
      return true;
    }
    if (message?.type !== "setState")
      return;
    const tabId = sender.tab?.id;
    if (tabId == null)
      return;
    const { state, eligible, hasSavedSession } = message;
    if (state === "active" && eligible) {
      chrome.action.setBadgeText({ tabId, text: "●" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#22c55e" });
    } else if (state === "active") {
      chrome.action.setBadgeText({ tabId, text: "●" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#ef4444" });
    } else if (state === "paused") {
      chrome.action.setBadgeText({ tabId, text: "●" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#f59e0b" });
    } else if (hasSavedSession) {
      chrome.action.setBadgeText({ tabId, text: "●" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#9ca3af" });
    } else {
      chrome.action.setBadgeText({ tabId, text: "" });
    }
  });
})();
