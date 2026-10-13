# Open Tab Saver

A Manifest V3 Chrome extension for saving and reopening groups of browser tabs. Version 2 replaces the old history page with a quick capture popup and a searchable session library.

## What it does

- Capture the last focused window or all windows with an optional session name, timestamp, and tab order.
- Save automatic snapshots at a chosen interval. An unchanged set of tabs is not saved twice in a row.
- Search sessions by name, date, page title, or URL; filter by capture type, sort results, and rename or delete individual sessions.
- Choose whether to reopen a session in a new window or add its tabs to the current window. Once you set a default, restoring follows it immediately. Until then, the prompt can save your choice as the default. Current-window restores append tabs in the background and keep your active tab in place.
- Export a session as UTF-8 CSV with a timestamp column. The CSV opens in Excel and other spreadsheet apps.
- Download a JSON backup and merge a backup into the library later. Existing version 1 snapshots are migrated when opened.

New captures save `http:`, `https:`, and `file:` tabs. Browser internal pages such as `chrome://` cannot be reopened by extensions, and private windows are excluded; a capture reports the number skipped. Internal pages in old sessions remain visible and exportable after migration. Saved sessions stay in this browser's extension storage; they are not uploaded or synced. Automatic capture settings use Chrome Sync when available.

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Pin **Open Tab Saver** to the toolbar for quick captures.

## Use

Click the toolbar icon, optionally name the session, then capture tabs from the current window or every window. The name appears in the library and can be searched. Choose the green **Open session library** button to search, sort, rename, export, restore, or delete a session. If no restore destination has been set, the first restore asks where to open the tabs and offers **Make this my default**. The library's **Settings** page can change or clear that default, control automatic capture, and provide JSON backup/import.

## Development check

Run `node --test tests/*.test.js` to check capture, search, migration, CSV safety, import, settings, and restore behavior. There are no build tools or third-party runtime dependencies.

Chrome extension storage has a quota. If it fills up, a capture or import shows an error without replacing your saved sessions. Export a JSON backup before deleting old sessions.
