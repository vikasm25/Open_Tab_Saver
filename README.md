# OpenTab Saver

OpenTab Saver is a Chrome extension that captures and stores your open browser tabs for later retrieval. It provides an interactive history view, grouped by date, and lets you restore or export snapshots of tabs as CSV files.

## Features

- Manual and scheduled (auto) capture of all open tabs
- History page with grouped snapshots (by month or day)
- Restore saved snapshots in one click
- Export snapshots as CSV with customizable filename formats
- JSON backup & restore of all snapshots
- Clear all saved snapshots
- Light color theme with crisp, modern UI

## Installation

1. Clone or download the repository.
2. Place your `icon.png` (170 × 196 px) in the extension root.
3. Open Chrome and navigate to `chrome://extensions/`.
4. Enable **Developer mode** and click **Load unpacked**.
5. Select this project's folder.

## Usage

- Click the **Capture** button on the history page to save your current tabs.  
- Switch to the **Settings** tab to configure auto-capture interval, filename format, display options, and backups.  
- Use **Export** to download the selected snapshot as a CSV, or **Restore All** to reopen tabs.

## Icon

Add an `icon.png` file (170×196 pixels) in the root directory. The manifest will automatically use it at 16×16, 48×48, and 128×128 resolutions.

## Developer

- **Name:** Vikas Kumar Meena
- **Version:** 1.0

Enjoy managing your tabs with OpenTab Saver! Feel free to open issues or contribute enhancements. 