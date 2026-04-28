async function injectIntoYouTubeTabs() {
  const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" });

  for (const tab of tabs) {
    if (!tab.id) continue;
    void injectIntoTab(tab.id, tab.url);
  }
}

async function injectIntoTab(tabId, url) {
  if (!tabId || !url?.startsWith("https://www.youtube.com/")) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["bridge.js"]
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
      world: "MAIN"
    });
  } catch (error) {
    // Some Chrome pages or discarded tabs reject injection. Ignore them.
  }
}

chrome.runtime.onInstalled.addListener(injectIntoYouTubeTabs);
chrome.runtime.onStartup.addListener(injectIntoYouTubeTabs);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    void injectIntoTab(tabId, tab.url);
  }
});
