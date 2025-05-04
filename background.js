// background.js

// Capture snapshot of all tabs (auto-capture)
function captureSnapshot() {
  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error('Error querying tabs for auto-capture:', chrome.runtime.lastError);
      return;
    }
    const now = new Date();
    const extensionBaseUrl = chrome.runtime.getURL('');
    const filteredTabs = tabs.filter(tab => !tab.url.startsWith(extensionBaseUrl));
    const snapshot = {
      timestamp: now.getTime(),
      // display format is handled in UI
      formatted: '',
      tabs: filteredTabs.map(tab => ({ title: tab.title || '', url: tab.url || '' }))
    };
    // Save to storage
    chrome.storage.local.get({ snapshots: [] }, result => {
      const snaps = result.snapshots;
      snaps.push(snapshot);
      // optional: sort by timestamp
      snaps.sort((a, b) => b.timestamp - a.timestamp);
      chrome.storage.local.set({ snapshots: snaps });
    });
  });
}

// Setup auto-capture alarm based on settings
function setupAlarm() {
  chrome.storage.sync.get({ autoCaptureEnabled: false, autoCaptureInterval: 30 }, settings => {
    chrome.alarms.clear('autoCapture', () => {
      if (settings.autoCaptureEnabled) {
        chrome.alarms.create('autoCapture', { periodInMinutes: settings.autoCaptureInterval });
      }
    });
  });
}

// When the extension icon is clicked, open the history page only
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
});

// Listen for restore-tabs, export-tabs and reschedule-alarm messages from the history page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Export CSV file via downloads API
  if (message.action === 'export-tabs' && message.dataUrl && message.filename) {
    chrome.downloads.download({
      url: message.dataUrl,
      filename: message.filename,
      saveAs: true,
      conflictAction: 'overwrite'
    });
    sendResponse({ success: true });
    return;
  }
  if (message.action === 'restore-tabs' && Array.isArray(message.urls)) {
    message.urls.forEach(url => {
      chrome.tabs.create({ url });
    });
    sendResponse({ success: true });
  }
  if (message.action === 'reschedule-alarm') {
    setupAlarm();
    sendResponse({ success: true });
    return;
  }
});

// Alarm handler for auto-capture
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'autoCapture') {
    captureSnapshot();
  }
});

// React to settings changes to reschedule alarm
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.autoCaptureEnabled || changes.autoCaptureInterval)) {
    setupAlarm();
  }
});

// Initialize alarms on startup
chrome.runtime.onInstalled.addListener(setupAlarm);
chrome.runtime.onStartup.addListener(setupAlarm);
// Also schedule on service worker load
setupAlarm(); 
