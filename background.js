importScripts('core.js');

const { isRestorableUrl, normalizeSnapshot, normalizeSnapshots } = TabSaverCore;
let operations = Promise.resolve();

function runInOrder(task) {
  const result = operations.then(task);
  operations = result.catch(() => {});
  return result;
}

async function getSnapshots() {
  const { snapshots = [] } = await chrome.storage.local.get('snapshots');
  const clean = normalizeSnapshots(snapshots);
  if (JSON.stringify(clean) !== JSON.stringify(snapshots)) {
    await chrome.storage.local.set({ snapshots: clean });
  }
  return clean;
}

async function capture(scope = 'window', source = 'manual', windowId, name = '') {
  if (typeof name !== 'string' || name.trim().length > 80) {
    throw new Error('Session names must be 80 characters or fewer.');
  }
  const tabs = await chrome.tabs.query(scope === 'all' ? {} :
    Number.isInteger(windowId) ? { windowId } : { lastFocusedWindow: true });
  const restorable = tabs
    .filter(tab => !tab.incognito && isRestorableUrl(tab.url))
    .sort((a, b) => (a.windowId - b.windowId) || (a.index - b.index))
    .map(tab => ({ title: String(tab.title || '').slice(0, 500), url: tab.url }));

  if (!restorable.length) throw new Error('No restorable tabs were found.');

  const snapshots = await getSnapshots();
  if (source === 'auto' && snapshots[0] &&
      snapshots[0].tabs.map(tab => tab.url).join('\n') === restorable.map(tab => tab.url).join('\n')) {
    return { duplicate: true, skipped: tabs.length - restorable.length };
  }

  const snapshot = {
    id: crypto.randomUUID(), timestamp: Date.now(), name: name.trim(), source, tabs: restorable
  };
  await chrome.storage.local.set({ snapshots: [snapshot, ...snapshots] });
  return { snapshot, skipped: tabs.length - restorable.length };
}

async function changeSnapshot(type, message) {
  const snapshots = await getSnapshots();
  const index = snapshots.findIndex(snapshot => snapshot.id === message.id);
  if (index < 0) throw new Error('Session not found. Refresh the library and try again.');
  if (type === 'rename') {
    const name = String(message.name || '').trim();
    if (name.length > 80) throw new Error('Session names must be 80 characters or fewer.');
    snapshots[index] = { ...snapshots[index], name };
  } else {
    snapshots.splice(index, 1);
  }
  await chrome.storage.local.set({ snapshots });
  return snapshots;
}

async function importSnapshots(data) {
  const rows = Array.isArray(data) ? data : data?.snapshots;
  if (!Array.isArray(rows)) throw new Error('This is not a supported backup.');
  const current = await getSnapshots();
  const fingerprints = new Set(current.map(snapshot =>
    `${snapshot.timestamp}|${snapshot.tabs.map(tab => tab.url).join('\n')}`));
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const snapshot = normalizeSnapshot(row);
    if (!snapshot || !snapshot.tabs.length) {
      skipped++;
      continue;
    }
    const fingerprint = `${snapshot.timestamp}|${snapshot.tabs.map(tab => tab.url).join('\n')}`;
    if (fingerprints.has(fingerprint)) {
      skipped++;
      continue;
    }
    snapshot.id = crypto.randomUUID();
    current.push(snapshot);
    fingerprints.add(fingerprint);
    imported++;
  }
  if (imported) {
    current.sort((a, b) => b.timestamp - a.timestamp);
    await chrome.storage.local.set({ snapshots: current });
  }
  return { imported, skipped };
}

async function restore(id, target, senderWindowId) {
  const snapshot = (await getSnapshots()).find(item => item.id === id);
  if (!snapshot) throw new Error('Session not found.');
  const urls = snapshot.tabs.map(tab => tab.url).filter(isRestorableUrl);
  if (!urls.length) throw new Error('This session has no restorable tabs.');
  let destination = target;
  if (!destination) {
    const settings = await chrome.storage.sync.get('restoreTarget');
    destination = settings.restoreTarget;
  }
  if (destination === 'new') {
    await chrome.windows.create({ url: urls, focused: true });
  } else if (destination === 'current') {
    let windowId = senderWindowId;
    if (!Number.isInteger(windowId)) {
      windowId = (await chrome.windows.getLastFocused({ windowTypes: ['normal'] })).id;
    }
    if (!Number.isInteger(windowId)) throw new Error('No current browser window is available.');
    const startIndex = (await chrome.tabs.query({ windowId })).length;
    let opened = 0;
    try {
      for (const url of urls) {
        await chrome.tabs.create({ windowId, url, index: startIndex + opened, active: false });
        opened++;
      }
    } catch (error) {
      throw new Error(`Opened ${opened} of ${urls.length} tabs. ${error.message}`);
    }
  } else {
    throw new Error('Choose a restore destination first.');
  }
  return { opened: urls.length, target: destination };
}

async function setAlarm() {
  const { autoCaptureEnabled = false, autoCaptureInterval = 60 } =
    await chrome.storage.sync.get(['autoCaptureEnabled', 'autoCaptureInterval']);
  await chrome.alarms.clear('autoCapture');
  if (autoCaptureEnabled) {
    const interval = Number(autoCaptureInterval);
    await chrome.alarms.create('autoCapture', {
      periodInMinutes: Number.isFinite(interval) ? Math.max(1, Math.min(1440, interval)) : 60
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const task = async () => {
    switch (message?.type) {
      case 'list': return getSnapshots();
      case 'capture': return capture(message.scope === 'all' ? 'all' : 'window', 'manual', sender.tab?.windowId, message.name || '');
      case 'rename': return changeSnapshot('rename', message);
      case 'delete': return changeSnapshot('delete', message);
      case 'restore': return restore(message.id, message.target, sender.tab?.windowId ?? message.windowId);
      case 'import': return importSnapshots(message.data);
      case 'clear':
        await chrome.storage.local.set({ snapshots: [] });
        return [];
      default: throw new Error('Unknown action.');
    }
  };
  runInOrder(task).then(
    data => respond({ ok: true, data }),
    error => respond({ ok: false, error: error.message || 'Something went wrong.' })
  );
  return true;
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'autoCapture') {
    runInOrder(() => capture('all', 'auto')).catch(error => console.error('Automatic capture failed:', error));
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.autoCaptureEnabled || changes.autoCaptureInterval)) {
    setAlarm().catch(console.error);
  }
});
chrome.runtime.onInstalled.addListener(() => setAlarm().catch(console.error));
chrome.runtime.onStartup.addListener(() => setAlarm().catch(console.error));
