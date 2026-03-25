(() => {
  // src/background.ts
  chrome.runtime.onMessage.addListener((message, sender) => {
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
