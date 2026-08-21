/**
 * Log Colorizer - background script.
 *
 * The extension reacts on a toolbar button click only: it injects the
 * colorizer content script into the active tab. Clicking again toggles
 * the page back to its original content (handled inside colorize.js).
 *
 * The `chrome.*` namespace is used because it is available in both
 * Chrome and Firefox (Firefox aliases it to `browser.*`).
 */
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) {
    return;
  }
  chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      files: ['colorize.js'],
    })
    .catch((error) => {
      // Typically: restricted pages (chrome://, about:, addons store) or
      // file:// URLs without "Allow access to file URLs" enabled in Chrome.
      console.warn('[Log Colorizer] Could not inject into this page:', error.message);
    });
});
