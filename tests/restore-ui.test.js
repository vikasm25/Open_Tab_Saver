const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page(file) {
  let preference;
  let closeDialog;
  let shown = 0;
  let closed = 0;
  const messages = [];
  const radios = { new: { value: 'new', checked: false }, current: { value: 'current', checked: false } };
  const elements = {
    'remember-restore': { checked: false },
    'restore-default': { value: '' },
    'auto-enabled': { checked: false },
    'auto-interval': { value: '60' },
    toast: { classList: { toggle() {}, add() {}, remove() {} } },
    'capture-name': { value: '' },
    'session-count': {},
    'latest-content': {
      children: [], replaceChildren() { this.children = []; },
      append(...children) { this.children.push(...children); }
    },
    'restore-dialog': {
      returnValue: '',
      querySelector(selector) {
        if (selector.includes('value="new"')) return radios.new;
        if (selector.includes('value="current"')) return radios.current;
        return Object.values(radios).find(radio => radio.checked);
      },
      addEventListener(type, listener) { if (type === 'close') closeDialog = listener; },
      showModal() { shown++; }
    }
  };
  const document = {
    getElementById(id) { return elements[id]; },
    addEventListener() {},
    createElement() { return { listeners: {}, addEventListener(type, listener) { this.listeners[type] = listener; } }; }
  };
  const chrome = {
    storage: {
      sync: {
        async get(defaults) {
          const stored = preference === undefined ? {} : { restoreTarget: preference };
          if (typeof defaults === 'string') return defaults in stored ? { [defaults]: stored[defaults] } : {};
          return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) =>
            [key, key in stored ? stored[key] : fallback]));
        },
        async set(value) { preference = value.restoreTarget; }
      },
      onChanged: { addListener() {} }
    },
    windows: { async getCurrent() { return { id: 42 }; } },
    runtime: { async sendMessage(message) {
      messages.push(message);
      return { ok: true, data: message.type === 'list' ? [{
        id: 'session-1', name: 'Named session', timestamp: 1700000000000,
        tabs: [{ url: 'https://example.com' }]
      }] : { opened: 1, target: message.target } };
    } }
  };
  const context = vm.createContext({ document, chrome, clearTimeout() {}, setTimeout() {},
    window: { close() { closed++; } },
    TabSaverCore: { isRestorableUrl: () => true } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  return { context, elements, radios, messages,
    setPreference(value) { preference = value; },
    getPreference() { return preference; },
    shown() { return shown; },
    closed() { return closed; },
    close(value, target, remember) {
      elements['restore-dialog'].returnValue = value;
      radios.new.checked = target === 'new';
      radios.current.checked = target === 'current';
      elements['remember-restore'].checked = remember;
      closeDialog();
    }
  };
}

for (const file of ['popup.js', 'history.js']) {
  test(`${file} restores immediately with a default and prompts only without one`, async () => {
    const ui = page(file);
    ui.setPreference('current');
    assert.equal(await ui.context.chooseRestoreTarget(), 'current');
    assert.equal(ui.shown(), 0);

    ui.setPreference(undefined);
    const oneTime = ui.context.chooseRestoreTarget();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.shown(), 1);
    ui.close('restore', 'new', false);
    assert.equal(await oneTime, 'new');
    assert.equal(ui.getPreference(), undefined);

    const saved = ui.context.chooseRestoreTarget();
    await new Promise(resolve => setImmediate(resolve));
    ui.close('restore', 'current', true);
    assert.equal(await saved, 'current');
    assert.equal(ui.getPreference(), 'current');
    assert.equal(await ui.context.chooseRestoreTarget(), 'current');
    assert.equal(ui.shown(), 2);
  });
}

test('popup sends the active browser window for a current-window restore', async () => {
  const ui = page('popup.js');
  ui.setPreference('current');
  await ui.context.loadLatest();
  assert.equal(ui.elements['latest-content'].children[0].textContent, 'Named session');
  await ui.elements['latest-content'].children[2].listeners.click();
  assert.deepEqual(JSON.parse(JSON.stringify(ui.messages.at(-1))), {
    type: 'restore', id: 'session-1', target: 'current', windowId: 42
  });
  assert.equal(ui.closed(), 1);
});

test('settings show an unset default and save the selected destination', async () => {
  const ui = page('history.js');
  ui.setPreference('current');
  await ui.context.loadSettings();
  assert.equal(ui.elements['restore-default'].value, 'current');
  ui.elements['restore-default'].value = '';
  await ui.context.saveSettings();
  assert.equal(ui.getPreference(), '');
  await ui.context.loadSettings();
  assert.equal(ui.elements['restore-default'].value, '');
  const asked = ui.context.chooseRestoreTarget();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.shown(), 1);
  ui.close('cancel', 'new', false);
  assert.equal(await asked, null);
  ui.elements['restore-default'].value = 'current';
  await ui.context.saveSettings();
  assert.equal(ui.getPreference(), 'current');
  await ui.context.loadSettings();
  assert.equal(ui.elements['restore-default'].value, 'current');
});
