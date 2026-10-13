const $ = id => document.getElementById(id);
const state = { snapshots: [], selectedId: null, search: '', filter: 'all', sort: 'newest' };
let toastTimer;

async function request(type, payload = {}) {
  const result = await chrome.runtime.sendMessage({ type, ...payload });
  if (!result?.ok) throw new Error(result?.error || 'The extension did not respond.');
  return result.data;
}

function showToast(message, error = false) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.toggle('toast-error', error);
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 4500);
}

function sessionTitle(snapshot) {
  return snapshot.name || `Session · ${new Date(snapshot.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function dateTime(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function filteredSnapshots() {
  return TabSaverCore.findSnapshots(state.snapshots, state.search, state.filter, state.sort);
}

function render() {
  $('stat-sessions').textContent = state.snapshots.length.toLocaleString();
  $('stat-tabs').textContent = state.snapshots.reduce((sum, snapshot) => sum + snapshot.tabs.length, 0).toLocaleString();
  $('stat-latest').textContent = state.snapshots.length
    ? new Date(state.snapshots[0].timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : 'Never';

  const visible = filteredSnapshots();
  $('result-count').textContent = `Showing ${visible.length} of ${state.snapshots.length} ${state.snapshots.length === 1 ? 'session' : 'sessions'}`;
  $('reset-filters').hidden = !state.search && state.filter === 'all' && state.sort === 'newest';
  if (!visible.some(snapshot => snapshot.id === state.selectedId)) {
    state.selectedId = visible[0]?.id || null;
  }
  const list = $('session-list');
  list.replaceChildren();
  $('list-empty').hidden = visible.length > 0;
  $('list-empty').querySelector('h3').textContent = state.snapshots.length ? 'No matching sessions' : 'No sessions here yet';
  $('list-empty').querySelector('p').textContent = state.snapshots.length
    ? 'Try another search or reset your filters.'
    : 'Capture your open tabs to start your library.';
  let lastMonth = '';
  for (const snapshot of visible) {
    const month = new Date(snapshot.timestamp).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (state.sort !== 'tabs' && month !== lastMonth) {
      list.append(make('div', 'month-label', month));
      lastMonth = month;
    }
    const card = make('button', 'session-card');
    card.type = 'button';
    card.setAttribute('aria-pressed', String(snapshot.id === state.selectedId));
    if (snapshot.id === state.selectedId) card.classList.add('selected');
    const icon = make('span', 'session-icon', snapshot.source === 'auto' ? '◷' : '◫');
    icon.setAttribute('aria-hidden', 'true');
    const copy = make('span', 'session-card-copy');
    copy.append(make('strong', '', sessionTitle(snapshot)));
    copy.append(make('small', '', `${dateTime(snapshot.timestamp)} · ${snapshot.tabs.length} ${snapshot.tabs.length === 1 ? 'tab' : 'tabs'}`));
    card.append(icon, copy, make('span', 'card-chevron', '›'));
    card.addEventListener('click', () => { state.selectedId = snapshot.id; render(); });
    list.append(card);
  }
  renderDetails();
}

function renderDetails() {
  const panel = $('detail-panel');
  const snapshot = state.snapshots.find(item => item.id === state.selectedId);
  if (!snapshot) {
    panel.innerHTML = '<div class="detail-placeholder"><div class="empty-icon" aria-hidden="true">◫</div><h3>Choose a session</h3><p>Select a saved session to see its tabs.</p></div>';
    return;
  }
  panel.innerHTML = '<div class="detail-header"><div><span class="detail-kicker">SESSION DETAILS</span><h2 id="detail-title"></h2><p id="detail-date"></p></div><span id="detail-source" class="source-badge"></span></div><div class="detail-actions"><button id="restore" class="button button-primary" type="button">↗ Open all tabs</button><button id="export" class="button button-secondary" type="button">↓ Export CSV</button></div><div class="detail-tools"><span id="tab-count"></span><div><button id="rename" class="text-button" type="button">Rename</button><button id="delete" class="text-button text-danger" type="button">Delete</button></div></div><div id="tab-list" class="tab-list"></div>';
  $('detail-title').textContent = sessionTitle(snapshot);
  $('detail-date').textContent = dateTime(snapshot.timestamp);
  $('detail-source').textContent = snapshot.source === 'auto' ? 'AUTOMATIC' : 'MANUAL';
  $('detail-source').classList.toggle('badge-auto', snapshot.source === 'auto');
  $('tab-count').textContent = `${snapshot.tabs.length} SAVED ${snapshot.tabs.length === 1 ? 'TAB' : 'TABS'}`;
  $('restore').disabled = !snapshot.tabs.some(tab => TabSaverCore.isRestorableUrl(tab.url));
  $('export').disabled = !snapshot.tabs.length;
  $('restore').addEventListener('click', () => act(async () => {
    const target = await chooseRestoreTarget();
    if (!target) return;
    const windowId = target === 'current' ? (await chrome.windows.getCurrent()).id : undefined;
    const result = await request('restore', { id: snapshot.id, target, windowId });
    showToast(`Opened ${result.opened} tabs in ${result.target === 'new' ? 'a new window' : 'the current window'}.`);
  }));
  $('export').addEventListener('click', () => {
    download(TabSaverCore.exportCsv(snapshot), 'text/csv;charset=utf-8', TabSaverCore.downloadName(snapshot, 'csv'));
    showToast('CSV exported. You can open it in Excel.');
  });
  $('rename').addEventListener('click', () => rename(snapshot));
  $('delete').addEventListener('click', () => removeSnapshot(snapshot));

  const tabs = $('tab-list');
  if (!snapshot.tabs.length) tabs.append(make('p', 'muted tab-empty', 'No restorable tabs in this session.'));
  snapshot.tabs.forEach((tab, index) => {
    const row = make('div', 'tab-row');
    row.append(make('span', 'tab-number', String(index + 1).padStart(2, '0')));
    const restorable = TabSaverCore.isRestorableUrl(tab.url);
    const link = make(restorable ? 'a' : 'div', 'tab-link');
    if (restorable) {
      link.href = tab.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    link.append(make('strong', '', tab.title || tab.url));
    let domain = tab.url;
    if (restorable) {
      try { domain = new URL(tab.url).hostname || 'Local file'; } catch { /* URL already validated */ }
    }
    link.append(make('small', '', restorable ? domain : `Cannot reopen · ${tab.url}`));
    row.append(link, make('span', 'tab-arrow', restorable ? '↗' : '—'));
    tabs.append(row);
  });
}

async function refresh() {
  state.snapshots = await request('list');
  render();
}

async function act(task) {
  try { await task(); } catch (error) { showToast(error.message, true); }
}

function download(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function confirmAction(title, copy) {
  $('confirm-title').textContent = title;
  $('confirm-copy').textContent = copy;
  const dialog = $('confirm-dialog');
  dialog.returnValue = 'cancel';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
}

async function chooseRestoreTarget() {
  const { restoreTarget } = await chrome.storage.sync.get('restoreTarget');
  if (restoreTarget === 'new' || restoreTarget === 'current') return restoreTarget;
  const dialog = $('restore-dialog');
  dialog.returnValue = 'cancel';
  dialog.querySelector('input[value="new"]').checked = true;
  $('remember-restore').checked = false;
  return new Promise((resolve, reject) => {
    dialog.addEventListener('close', async () => {
      if (dialog.returnValue !== 'restore') return resolve(null);
      const target = dialog.querySelector('input[name="restore-target"]:checked')?.value;
      if (target !== 'new' && target !== 'current') return resolve(null);
      try {
        if ($('remember-restore').checked) await chrome.storage.sync.set({ restoreTarget: target });
        resolve(target);
      } catch (error) { reject(error); }
    }, { once: true });
    dialog.showModal();
  });
}

function rename(snapshot) {
  const dialog = $('rename-dialog');
  dialog.returnValue = 'cancel';
  $('session-name').value = snapshot.name;
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'save') {
      act(async () => {
        await request('rename', { id: snapshot.id, name: $('session-name').value });
        await refresh();
        showToast('Session renamed.');
      });
    }
  }, { once: true });
  dialog.showModal();
  $('session-name').focus();
}

async function removeSnapshot(snapshot) {
  if (!await confirmAction('Delete this session?', 'Its saved tabs will be removed from this browser.')) return;
  await act(async () => {
    await request('delete', { id: snapshot.id });
    await refresh();
    showToast('Session deleted.');
  });
}

async function capture(scope) {
  const buttons = [$('capture-window'), $('capture-all')];
  buttons.forEach(button => button.disabled = true);
  await act(async () => {
    const result = await request('capture', { scope, name: $('capture-name').value.trim() });
    $('capture-name').value = '';
    state.selectedId = result.snapshot.id;
    state.search = '';
    $('search').value = '';
    state.filter = 'all';
    $('filter').value = 'all';
    state.sort = 'newest';
    $('sort').value = 'newest';
    await refresh();
    showToast(`Saved ${result.snapshot.name ? `“${result.snapshot.name}”` : 'session'} · ${result.snapshot.tabs.length} tabs${result.skipped ? ` · ${result.skipped} unavailable or private tabs skipped` : ''}.`);
  });
  buttons.forEach(button => button.disabled = false);
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get({ autoCaptureEnabled: false, autoCaptureInterval: 60, restoreTarget: '' });
  $('auto-enabled').checked = Boolean(settings.autoCaptureEnabled);
  $('auto-interval').value = String(settings.autoCaptureInterval);
  $('auto-interval').disabled = !$('auto-enabled').checked;
  $('restore-default').value = ['new', 'current'].includes(settings.restoreTarget) ? settings.restoreTarget : '';
}

async function saveSettings() {
  try {
    const interval = Number($('auto-interval').value);
    if (!Number.isInteger(interval) || interval < 1 || interval > 1440) {
      throw new Error('Choose an interval from 1 to 1440 minutes.');
    }
    await chrome.storage.sync.set({
      autoCaptureEnabled: $('auto-enabled').checked,
      autoCaptureInterval: interval,
      restoreTarget: $('restore-default').value
    });
    $('auto-interval').disabled = !$('auto-enabled').checked;
    showToast('Settings saved.');
  } catch (error) {
    await loadSettings().catch(() => {});
    showToast(error.message, true);
  }
}

function showView() {
  const settings = location.hash === '#settings';
  $('library-view').hidden = settings;
  $('settings-view').hidden = !settings;
  $('nav-library').classList.toggle('active', !settings);
  $('nav-settings').classList.toggle('active', settings);
  window.scrollTo(0, 0);
}

document.addEventListener('DOMContentLoaded', () => {
  const manifest = chrome.runtime.getManifest();
  $('sidebar-version').textContent = `v${manifest.version}`;
  $('creator-name').textContent = manifest.author || 'Open Tab Saver';
  showView();
  window.addEventListener('hashchange', showView);
  window.addEventListener('focus', () => act(refresh));
  $('capture-window').addEventListener('click', () => capture('window'));
  $('capture-all').addEventListener('click', () => capture('all'));
  $('capture-name').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); capture('window'); }
  });
  $('search').addEventListener('input', event => { state.search = event.target.value; render(); });
  $('filter').addEventListener('change', event => { state.filter = event.target.value; render(); });
  $('sort').addEventListener('change', event => { state.sort = event.target.value; render(); });
  $('reset-filters').addEventListener('click', () => {
    state.search = '';
    state.filter = 'all';
    state.sort = 'newest';
    $('search').value = '';
    $('filter').value = 'all';
    $('sort').value = 'newest';
    render();
  });
  $('auto-enabled').addEventListener('change', saveSettings);
  $('auto-interval').addEventListener('change', saveSettings);
  $('restore-default').addEventListener('change', saveSettings);
  $('session-name').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); $('rename-dialog').close('save'); }
  });
  $('backup').addEventListener('click', () => act(async () => {
    await refresh();
    download(JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), snapshots: state.snapshots }),
      'application/json', `open-tabs-backup-${new Date().toISOString().slice(0, 10)}.json`);
    showToast('Backup downloaded.');
  }));
  $('import-file').addEventListener('change', event => act(async () => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 16 * 1024 * 1024) throw new Error('Choose a backup smaller than 16 MB.');
      let data;
      try { data = JSON.parse(await file.text()); } catch { throw new Error('This file is not valid JSON.'); }
      const result = await request('import', { data });
      await refresh();
      showToast(`Imported ${result.imported} sessions${result.skipped ? ` · ${result.skipped} skipped` : ''}.`);
    } finally { event.target.value = ''; }
  }));
  $('clear-all').addEventListener('click', async () => {
    if (!state.snapshots.length) { showToast('Your library is already empty.'); return; }
    if (!await confirmAction('Delete all sessions?', `This will remove ${state.snapshots.length} saved sessions from this browser.`)) return;
    await act(async () => { await request('clear'); await refresh(); showToast('All sessions deleted.'); });
  });
  act(refresh);
  act(loadSettings);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.snapshots) {
    state.snapshots = TabSaverCore.normalizeSnapshots(changes.snapshots.newValue);
    render();
  }
  if (area === 'sync' && (changes.autoCaptureEnabled || changes.autoCaptureInterval || changes.restoreTarget)) {
    loadSettings().catch(error => showToast(error.message, true));
  }
});
