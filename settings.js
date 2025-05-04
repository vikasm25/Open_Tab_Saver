// settings.js

const defaultSettings = {
  autoCaptureEnabled: false,
  autoCaptureInterval: 30,
  dateFormat: 'DDMMYYYY_HHmm',
  customDateFormat: '',
  showSN: true,
  showWebsite: true,
  groupBy: 'month'
};

// Show a temporary toast message
function showToast(message = 'Settings saved') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

// Load settings into form
function loadSettings() {
  chrome.storage.sync.get(defaultSettings, settings => {
    document.getElementById('autoCaptureEnabled').checked = settings.autoCaptureEnabled;
    document.getElementById('autoCaptureInterval').value = settings.autoCaptureInterval;
    document.getElementById('dateFormat').value = settings.dateFormat;
    document.getElementById('customDateFormat').value = settings.customDateFormat;
    document.getElementById('customDateFormat').disabled = settings.dateFormat !== 'Custom';
    document.getElementById('showSN').checked = settings.showSN;
    document.getElementById('showWebsite').checked = settings.showWebsite;
    document.getElementById('groupBy').value = settings.groupBy;
    // Enable/disable interval input
    document.getElementById('autoCaptureInterval').disabled = !settings.autoCaptureEnabled;
  });
}

// Save settings when form changes
function saveSettings() {
  const autoCaptureEnabled = document.getElementById('autoCaptureEnabled').checked;
  const autoCaptureInterval = Number(document.getElementById('autoCaptureInterval').value);
  const dateFormat = document.getElementById('dateFormat').value;
  const customDateFormat = document.getElementById('customDateFormat').value;
  const showSN = document.getElementById('showSN').checked;
  const showWebsite = document.getElementById('showWebsite').checked;
  const groupBy = document.getElementById('groupBy').value;

  chrome.storage.sync.set({
    autoCaptureEnabled,
    autoCaptureInterval,
    dateFormat,
    customDateFormat,
    showSN,
    showWebsite,
    groupBy
  }, () => {
    showToast();
    document.getElementById('autoCaptureInterval').disabled = !autoCaptureEnabled;
  });
}

// Export all snapshots as JSON
function exportData() {
  chrome.storage.local.get({ snapshots: [] }, result => {
    const blob = new Blob([JSON.stringify(result.snapshots, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const fname = `snapshots_${now.getTime()}.json`;
    chrome.downloads.download({ url, filename: fname, saveAs: true }, () => {
      URL.revokeObjectURL(url);
    });
  });
}

// Import snapshots from JSON file
function importDataHandler() {
  const fileInput = document.getElementById('importFile');
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data)) {
        chrome.storage.local.set({ snapshots: data }, () => {
          alert('Imported snapshots successfully');
        });
      } else {
        alert('Invalid JSON format');
      }
    } catch (err) {
      alert('Error parsing JSON');
    }
  };
  reader.readAsText(file);
}

// Clear all snapshots
function clearAll() {
  if (confirm('Are you sure you want to delete all snapshots?')) {
    chrome.storage.local.set({ snapshots: [] }, () => {
      alert('All snapshots cleared');
    });
  }
}

// Handle date format change
function dateFormatHandler(e) {
  const custom = document.getElementById('customDateFormat');
  custom.disabled = e.target.value !== 'Custom';
  showToast();
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  // Attach save listener
  document.querySelectorAll('input, select').forEach(elem => {
    elem.addEventListener('change', saveSettings);
  });
  // Export/import/clear
  document.getElementById('exportData').addEventListener('click', exportData);
  document.getElementById('importData').addEventListener('click', importDataHandler);
  document.getElementById('dateFormat').addEventListener('change', dateFormatHandler);
  document.getElementById('clearAll').addEventListener('click', clearAll);
  // Back button navigation
  document.getElementById('back').addEventListener('click', () => {
    // Navigate back to history page
    window.history.back();
  });
});

// Listen for manual settings page form save
chrome.storage.onChanged.addListener(loadSettings); 