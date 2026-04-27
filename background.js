async function injectIntoYouTubeTabs() {
  const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" });

  for (const tab of tabs) {
    if (!tab.id) continue;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
      files: ["content.js"],
      world: "MAIN"
    }).catch(() => {
      // Some Chrome pages or discarded tabs reject injection. Ignore them.
    });
  }
}

function injectIntoTab(tabId, url) {
  if (!tabId || !url?.startsWith("https://www.youtube.com/")) return;

  chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
    world: "MAIN"
  }).catch(() => {
    // Some Chrome pages or discarded tabs reject injection. Ignore them.
  });
}

chrome.runtime.onInstalled.addListener(injectIntoYouTubeTabs);
chrome.runtime.onStartup.addListener(injectIntoYouTubeTabs);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    injectIntoTab(tabId, tab.url);
  }
});
