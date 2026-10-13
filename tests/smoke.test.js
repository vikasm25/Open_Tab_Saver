const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');

test('migration, safe CSV, ordered writes, import, and restore', async () => {
  let messageListener;
  let alarmListener;
  let saved = [{ timestamp: 1700000000000, tabs: [
    { title: '=SUM(1,1)', url: 'https://example.com/a' },
    { title: 'Browser page', url: 'chrome://settings' }
  ] }];
  let opened;
  let restoreDefault;
  const created = [];
  const createdWindows = [];

  global.TabSaverCore = core;
  global.importScripts = () => {};
  global.chrome = {
    storage: {
      local: {
        async get() { return { snapshots: saved }; },
        async set(value) { await new Promise(resolve => setTimeout(resolve, 2)); saved = value.snapshots; }
      },
      sync: { async get(key) { return restoreDefault ? { restoreTarget: restoreDefault } :
        (typeof key === 'string' ? {} : { ...key }); } },
      onChanged: { addListener() {} }
    },
    tabs: { async query(query) {
      if (query.active) return [{ windowId: 7, index: 0 }];
      if (query.windowId) return [{ index: 0 }, { index: 1 }];
      return [
      { title: 'First', url: 'https://example.org', windowId: 1, index: 0 },
      { title: 'Internal', url: 'chrome://extensions', windowId: 1, index: 1 },
      { title: 'Private', url: 'https://private.example', windowId: 1, index: 2, incognito: true }
      ];
    }, async create(value) { created.push(value); return value; } },
    windows: {
      async create(value) { createdWindows.push(value); opened = value.url; },
      async getLastFocused() { return { id: 7 }; }
    },
    alarms: { onAlarm: { addListener(listener) { alarmListener = listener; } }, async clear() {}, async create() {} },
    runtime: {
      onMessage: { addListener(listener) { messageListener = listener; } },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} }
    }
  };
  require('../background.js');
  const send = (message, sender = {}) => new Promise(resolve => messageListener(message, sender, resolve));

  const migrated = await send({ type: 'list' });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.data[0].tabs.length, 2);
  assert.ok(migrated.data[0].id);
  const csv = core.exportCsv(migrated.data[0]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"'=SUM\(1,1\)"/);

  const [first, second] = await Promise.all([
    send({ type: 'capture', scope: 'window', name: 'Research tabs' }),
    send({ type: 'capture', scope: 'window' })
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.data.snapshot.name, 'Research tabs');
  const namedSessions = (await send({ type: 'list' })).data;
  assert.equal(namedSessions.length, 3);
  assert.equal(namedSessions.find(item => item.id === first.data.snapshot.id).name, 'Research tabs');
  assert.deepEqual(core.findSnapshots(namedSessions, 'research tabs').map(item => item.id), [first.data.snapshot.id]);
  assert.equal(first.data.skipped, 2);
  assert.equal((await send({ type: 'capture', name: 'x'.repeat(81) })).ok, false);

  alarmListener({ name: 'autoCapture' });
  assert.equal((await send({ type: 'list' })).data.length, 3);

  assert.equal((await send({ type: 'restore', id: first.data.snapshot.id })).ok, false);
  const restored = await send({ type: 'restore', id: first.data.snapshot.id, target: 'new' });
  assert.equal(restored.data.opened, 1);
  assert.equal(restored.data.target, 'new');
  assert.deepEqual(opened, ['https://example.org']);

  const imported = await send({ type: 'import', data: [
    { timestamp: first.data.snapshot.timestamp, tabs: [{ title: 'duplicate', url: 'https://example.org' }] },
    { timestamp: 1700000000001, tabs: [{ title: 'bad', url: 'javascript:alert(1)' }] },
    { timestamp: 1700000000002, tabs: [{ title: 'good', url: 'https://openai.com' }] }
  ] });
  assert.equal(imported.data.imported, 1);
  assert.equal(imported.data.skipped, 2);
  assert.equal((await send({ type: 'list' })).data.length, 4);

  const legacyBackup = await send({ type: 'import', data: [{
    timestamp: 1700000000003,
    tabs: [
      { title: 'Settings', url: 'chrome://settings' },
      { title: 'Website', url: 'https://example.net' },
      { title: 'Second website', url: 'https://example.org/extra' }
    ]
  }] });
  assert.equal(legacyBackup.data.imported, 1);
  const savedLegacy = (await send({ type: 'list' })).data.find(item => item.timestamp === 1700000000003);
  assert.equal(savedLegacy.tabs.length, 3);
  await send({ type: 'restore', id: savedLegacy.id, target: 'new' });
  assert.deepEqual(opened, ['https://example.net', 'https://example.org/extra']);

  const current = await send({ type: 'restore', id: savedLegacy.id, target: 'current' }, { tab: { windowId: 42 } });
  assert.equal(current.data.target, 'current');
  assert.equal(createdWindows.length, 2);
  assert.deepEqual(created[0], { windowId: 42, url: 'https://example.net', index: 2, active: false });
  assert.deepEqual(created[1], { windowId: 42, url: 'https://example.org/extra', index: 3, active: false });

  const popupRestore = await send({ type: 'restore', id: first.data.snapshot.id, target: 'current', windowId: 52 });
  assert.equal(popupRestore.data.target, 'current');
  assert.equal(createdWindows.length, 2);
  assert.deepEqual(created[2], { windowId: 52, url: 'https://example.org', index: 2, active: false });

  restoreDefault = 'current';
  const defaultChoice = await send({ type: 'restore', id: first.data.snapshot.id });
  assert.equal(defaultChoice.data.target, 'current');
  assert.equal(createdWindows.length, 2);
  assert.deepEqual(created[3], { windowId: 7, url: 'https://example.org', index: 2, active: false });
  assert.equal((await send({ type: 'restore', id: first.data.snapshot.id, target: 'invalid' })).ok, false);
});

test('library search, source filter, and sort options', () => {
  const snapshots = [
    { id: 'new', timestamp: 200, name: 'Design work', source: 'manual', tabs: [{ title: 'Mockups', url: 'https://design.example' }] },
    { id: 'old', timestamp: 100, name: 'Research', source: 'auto', tabs: [
      { title: 'Docs', url: 'https://docs.example' }, { title: 'Notes', url: 'https://notes.example' }
    ] }
  ];
  assert.deepEqual(core.findSnapshots(snapshots, 'design').map(item => item.id), ['new']);
  assert.deepEqual(core.findSnapshots(snapshots, 'docs.example').map(item => item.id), ['old']);
  assert.deepEqual(core.findSnapshots(snapshots, '', 'auto').map(item => item.id), ['old']);
  assert.deepEqual(core.findSnapshots(snapshots, '', 'all', 'oldest').map(item => item.id), ['old', 'new']);
  assert.deepEqual(core.findSnapshots(snapshots, '', 'all', 'tabs').map(item => item.id), ['old', 'new']);
});
