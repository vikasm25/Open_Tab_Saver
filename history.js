// history.js

let snapshots = [];
let currentUrls = [];
let selectedIndex = null;
let showSN = true;
let showWebsite = true;
let groupBy = 'month';

// Listen for snapshot changes in storage to update the list in real time
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.snapshots) {
    snapshots = changes.snapshots.newValue || [];
    snapshots.sort((a, b) => b.timestamp - a.timestamp);
    renderSnapshotList();
  }
});

function renderSnapshotList() {
  const container = document.getElementById('snapshot-list');
  container.innerHTML = '';
  let lastGroup = '';
  snapshots.forEach((snap, idx) => {
    const date = new Date(snap.timestamp);
    // Group by month/day if configured
    if (groupBy !== 'none') {
      let groupKey, label;
      if (groupBy === 'month') {
        groupKey = `${date.getFullYear()}-${date.getMonth()}`;
        label = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      } else if (groupBy === 'day') {
        groupKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        label = date.toLocaleDateString();
      }
      if (groupKey !== lastGroup) {
        lastGroup = groupKey;
        const header = document.createElement('div');
        header.className = 'snapshot-group';
        header.textContent = label;
        container.appendChild(header);
      }
    }
    createSnapshotEntry(container, snap, idx);
  });
}

function createSnapshotEntry(container, snap, idx) {
  const el = document.createElement('div');
  // Display timestamp as human-readable string
  const date = new Date(snap.timestamp);
  el.textContent = date.toLocaleString();
  el.className = 'snapshot';
  if (idx === selectedIndex) el.classList.add('selected');
  el.dataset.index = idx;
  el.addEventListener('click', () => showDetails(idx));
  // delete button
  const del = document.createElement('span');
  del.className = 'delete-btn';
  del.textContent = '×';
  del.addEventListener('click', e => { e.stopPropagation(); deleteSnapshot(idx); });
  el.appendChild(del);
  container.appendChild(el);
}

function showDetails(index) {
  selectedIndex = index;
  const snap = snapshots[index];
  // Show header with human-readable date/time
  const date = new Date(snap.timestamp);
  const display = date.toLocaleString();
  document.getElementById('selected-time').textContent = display;
  // Render tabs in table
  const tbody = document.querySelector('#tab-table tbody');
  tbody.innerHTML = '';
  currentUrls = [];
  snap.tabs.forEach((tab, idx) => {
    const row = document.createElement('tr');
    const cell1 = document.createElement('td');
    cell1.textContent = idx + 1;
    const cell2 = document.createElement('td');
    const a = document.createElement('a');
    a.href = tab.url;
    a.textContent = tab.title;
    a.target = '_blank';
    cell2.appendChild(a);
    row.appendChild(cell1);
    row.appendChild(cell2);
    tbody.appendChild(row);
    currentUrls.push(tab.url);
  });
  const btn = document.getElementById('restore');
  btn.disabled = currentUrls.length === 0;
  btn.onclick = () => {
    chrome.runtime.sendMessage(
      { action: 'restore-tabs', urls: currentUrls },
      () => window.close()
    );
  };
  // Enable export
  const exp = document.getElementById('export');
  exp.disabled = currentUrls.length === 0;
  renderSnapshotList();
}

// Delete a snapshot by index
function deleteSnapshot(idx) {
  snapshots.splice(idx, 1);
  if (selectedIndex === idx) {
    // Clear details if deleted
    selectedIndex = null;
    document.getElementById('selected-time').textContent = 'Select a snapshot';
    document.querySelector('#tab-table tbody').innerHTML = '';
    document.getElementById('restore').disabled = true;
    document.getElementById('export').disabled = true;
  } else if (selectedIndex > idx) {
    selectedIndex--;
  }
  chrome.storage.local.set({ snapshots }, () => {
    renderSnapshotList();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Load display settings, then load and render snapshots
  chrome.storage.sync.get({ showSN: true, showWebsite: true, groupBy: 'month' }, settings => {
    showSN = settings.showSN;
    showWebsite = settings.showWebsite;
    groupBy = settings.groupBy;
    // apply column visibility classes
    document.body.classList.toggle('hide-sn', !showSN);
    document.body.classList.toggle('hide-website', !showWebsite);
    chrome.storage.local.get({ snapshots: [] }, result => {
      snapshots = result.snapshots || [];
      snapshots.sort((a, b) => b.timestamp - a.timestamp);
      renderSnapshotList();
    });
  });

  // Capture current tabs to new snapshot
  document.getElementById('capture').addEventListener('click', () => {
    chrome.tabs.query({}, (tabs) => {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = now.getFullYear();
      const HH = String(now.getHours()).padStart(2, '0');
      const MN = String(now.getMinutes()).padStart(2, '0');
      const formatted = `${dd}/${mm}/${yyyy} ${HH}:${MN}`;
      const snapshot = {
        timestamp: now.getTime(),
        tabs: tabs.map(tab => ({ title: tab.title || '', url: tab.url || '' }))
      };
      snapshots.push(snapshot);
      // Sort snapshots new to old
      snapshots.sort((a, b) => b.timestamp - a.timestamp);
      chrome.storage.local.set({ snapshots }, () => {
        renderSnapshotList();
        // Find new index of this snapshot
        const idx = snapshots.findIndex(s => s.timestamp === snapshot.timestamp);
        showDetails(idx);
      });
    });
  });

  // Export selected snapshot to CSV
  document.getElementById('export').addEventListener('click', () => {
    if (selectedIndex === null) return;
    const snap = snapshots[selectedIndex];
    const rows = ['S.No,Website,Link'];
    snap.tabs.forEach((tab, i) => {
      const title = (tab.title || '').replace(/"/g, '""');
      const url = tab.url;
      rows.push(`${i+1},"${title}","${url}"`);
    });
    const csvContent = rows.join('\n');
    const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
    // Fetch filename format from settings and apply
    chrome.storage.sync.get({ dateFormat: 'DDMMYYYY_HHmm', customDateFormat: '' }, cfg => {
      const d = new Date(snap.timestamp);
      let fmt = cfg.dateFormat;
      if (fmt === 'Custom') fmt = cfg.customDateFormat || 'DDMMYYYY_HHmm';
      const replacements = {
        'DD': String(d.getDate()).padStart(2, '0'),
        'MM': String(d.getMonth() + 1).padStart(2, '0'),
        'YYYY': d.getFullYear(),
        'HH': String(d.getHours()).padStart(2, '0'),
        'mm': String(d.getMinutes()).padStart(2, '0')
      };
      const filename = 'Active_Tab_' + fmt.replace(/DD|MM|YYYY|HH|mm/g, match => replacements[match]) + '.csv';
      chrome.downloads.download({ url: dataUrl, filename, saveAs: true, conflictAction: 'overwrite' });
    });
  });

  // About dialog
  document.getElementById('about').addEventListener('click', () => {
    const manifest = chrome.runtime.getManifest();
    const name = manifest.name || 'Unknown';
    const version = manifest.version || 'Unknown';
    const developer = manifest.author || 'Unknown';
    alert(`Extension: ${name}\nVersion: ${version}\nDeveloper: ${developer}`);
  });

  // Open settings page
  document.getElementById('settings').addEventListener('click', () => {
    // open settings in same tab
    window.location.href = 'settings.html';
  });
});

// React to changes in display settings
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.showSN) document.body.classList.toggle('hide-sn', !changes.showSN.newValue);
    if (changes.showWebsite) document.body.classList.toggle('hide-website', !changes.showWebsite.newValue);
    if (changes.groupBy) { groupBy = changes.groupBy.newValue; renderSnapshotList(); }
  }
}); 