/* Shared, dependency-free data and export rules. */
const TabSaverCore = (() => {
  function isRestorableUrl(value) {
    if (typeof value !== 'string') return false;
    try {
      return ['http:', 'https:', 'file:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }

  function isBrowserInternalUrl(value) {
    try {
      return ['chrome:', 'about:', 'edge:', 'chrome-extension:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }

  function normalizeSnapshot(raw, preserveUnsupported = false) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tabs) ||
        !Number.isFinite(raw.timestamp) || raw.timestamp <= 0 || raw.timestamp > 8.64e15) return null;
    const tabs = raw.tabs
      .filter(tab => tab && typeof tab.url === 'string' && tab.url.trim() &&
        (preserveUnsupported || isRestorableUrl(tab.url) || isBrowserInternalUrl(tab.url)))
      .map(tab => ({ title: String(tab.title || '').slice(0, 500), url: tab.url }));
    return {
      id: typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 80 ? raw.id : crypto.randomUUID(),
      timestamp: raw.timestamp,
      name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : '',
      source: raw.source === 'auto' ? 'auto' : 'manual',
      tabs
    };
  }

  function normalizeSnapshots(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(row => normalizeSnapshot(row, true)).filter(Boolean).sort((a, b) => b.timestamp - a.timestamp);
  }

  function findSnapshots(snapshots, search = '', source = 'all', sort = 'newest') {
    const query = search.trim().toLocaleLowerCase();
    return snapshots.filter(snapshot => {
      if (source !== 'all' && snapshot.source !== source) return false;
      if (!query) return true;
      const details = `${snapshot.name} ${snapshot.source} ${new Date(snapshot.timestamp).toLocaleString()}`.toLocaleLowerCase();
      return details.includes(query) || snapshot.tabs.some(tab =>
        `${tab.title} ${tab.url}`.toLocaleLowerCase().includes(query));
    }).sort((a, b) => sort === 'oldest' ? a.timestamp - b.timestamp :
      sort === 'tabs' ? b.tabs.length - a.tabs.length || b.timestamp - a.timestamp :
        b.timestamp - a.timestamp);
  }

  function csvCell(value) {
    const text = String(value ?? '');
    const safe = /^[\s\uFEFF]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  }

  function exportCsv(snapshot) {
    const date = new Date(snapshot.timestamp).toISOString();
    const rows = [['Captured at', 'Title', 'URL']];
    for (const tab of snapshot.tabs) rows.push([date, tab.title, tab.url]);
    return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  function downloadName(snapshot, extension) {
    const date = new Date(snapshot.timestamp);
    const stamp = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')].join('-');
    const time = [String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0')].join('-');
    return `open-tabs-${stamp}_${time}.${extension}`;
  }

  if (typeof module !== 'undefined') module.exports = {
    isRestorableUrl, normalizeSnapshot, normalizeSnapshots, findSnapshots, exportCsv, downloadName
  };
  return { isRestorableUrl, normalizeSnapshot, normalizeSnapshots, findSnapshots, exportCsv, downloadName };
})();
