const popup = id => document.getElementById(id);

async function send(type, payload = {}) {
  const result = await chrome.runtime.sendMessage({ type, ...payload });
  if (!result?.ok) throw new Error(result?.error || 'The extension did not respond.');
  return result.data;
}

async function chooseRestoreTarget() {
  const { restoreTarget } = await chrome.storage.sync.get('restoreTarget');
  if (restoreTarget === 'new' || restoreTarget === 'current') return restoreTarget;
  const dialog = popup('restore-dialog');
  dialog.returnValue = 'cancel';
  dialog.querySelector('input[value="new"]').checked = true;
  popup('remember-restore').checked = false;
  return new Promise((resolve, reject) => {
    dialog.addEventListener('close', async () => {
      if (dialog.returnValue !== 'restore') return resolve(null);
      const target = dialog.querySelector('input[name="restore-target"]:checked')?.value;
      if (target !== 'new' && target !== 'current') return resolve(null);
      try {
        if (popup('remember-restore').checked) await chrome.storage.sync.set({ restoreTarget: target });
        resolve(target);
      } catch (error) { reject(error); }
    }, { once: true });
    dialog.showModal();
  });
}

function status(message, error = false) {
  const line = popup('popup-status');
  line.textContent = message;
  line.classList.toggle('error', error);
}

async function loadLatest() {
  const snapshots = await send('list');
  popup('session-count').textContent = `${snapshots.length} saved`;
  const container = popup('latest-content');
  container.replaceChildren();
  const latest = snapshots[0];
  if (!latest) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Nothing saved yet. Your first capture is one click away.';
    container.append(empty);
    return;
  }
  const title = document.createElement('strong');
  title.textContent = latest.name || 'Untitled session';
  const meta = document.createElement('p');
  meta.textContent = `${latest.tabs.length} ${latest.tabs.length === 1 ? 'tab' : 'tabs'} · ${new Date(latest.timestamp).toLocaleString()}`;
  const restore = document.createElement('button');
  restore.className = 'latest-restore';
  restore.type = 'button';
  restore.textContent = 'Open all tabs ↗';
  restore.disabled = !latest.tabs.some(tab => TabSaverCore.isRestorableUrl(tab.url));
  restore.addEventListener('click', async () => {
    try {
      const target = await chooseRestoreTarget();
      if (!target) return;
      const windowId = target === 'current' ? (await chrome.windows.getCurrent()).id : undefined;
      await send('restore', { id: latest.id, target, windowId });
      window.close();
    }
    catch (error) { status(error.message, true); }
  });
  container.append(title, meta, restore);
}

async function capture(scope) {
  const buttons = [popup('capture-window'), popup('capture-all')];
  buttons.forEach(button => button.disabled = true);
  try {
    const result = await send('capture', { scope, name: popup('capture-name').value.trim() });
    popup('capture-name').value = '';
    status(`Saved ${result.snapshot.name ? `“${result.snapshot.name}”` : 'session'} · ${result.snapshot.tabs.length} tabs${result.skipped ? ` · ${result.skipped} skipped` : ''}.`);
    await loadLatest();
  } catch (error) {
    status(error.message, true);
  } finally {
    buttons.forEach(button => button.disabled = false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  popup('popup-version').textContent = `v${chrome.runtime.getManifest().version}`;
  popup('capture-window').addEventListener('click', () => capture('window'));
  popup('capture-all').addEventListener('click', () => capture('all'));
  popup('capture-name').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); capture('window'); }
  });
  popup('open-library').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('history.html') }));
  loadLatest().catch(error => status(error.message, true));
});
