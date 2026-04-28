# Shorts Lens

Shorts Lens is a lightweight Chrome extension that shows YouTube Shorts views and publish dates directly on the Shorts player, without opening the hidden Description panel.

It is built for creators, researchers, marketers, and everyday YouTube users who want faster access to basic YouTube Shorts metadata while browsing `youtube.com/shorts`.

## Features

- Shows the current Short's view count on the player.
- Shows the current Short's publish date in `YYYY-MM-DD` format.
- Formats large view counts as `K`, `M`, or `B`.
- Works with YouTube Shorts navigation, including scrolling between Shorts.
- Reads metadata already present in the current YouTube page.
- Unlocks a local Pro viral collector with a license key.
- Saves recent viral Shorts locally with configurable age and view thresholds.
- Exports the local viral Shorts library as CSV.
- Does not call external APIs or upload browsing data.

## Why Shorts Lens?

YouTube hides Shorts views and upload dates inside the Description panel. On desktop, checking those fields usually requires opening the menu, opening Description, then closing the panel again. Shorts Lens keeps the same information visible in a compact overlay while you watch or research Shorts.

Useful search terms this project covers:

- YouTube Shorts views Chrome extension
- YouTube Shorts publish date extension
- YouTube Shorts upload date viewer
- YouTube Shorts metadata overlay
- Show YouTube Shorts views without opening Description

## Installation

1. Download or clone this repository.
2. Open `chrome://extensions/` in Chrome.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the Shorts Lens project folder.
6. Open a YouTube Shorts page, for example `https://www.youtube.com/shorts/...`.

## How It Works

Shorts Lens runs as a Manifest V3 content script on YouTube pages. When the current URL is a Shorts page, it asynchronously reads metadata from the active Shorts page data that YouTube has already loaded, then injects a small overlay into the current Shorts player.

The extension reads from the Shorts page itself. For Shorts loaded by scrolling, it matches page data against the current video ID before rendering, so stale metadata from the previous Short is ignored.

## Privacy

Shorts Lens is local-only.

- It does not collect analytics.
- It does not send YouTube data to any server.
- It does not use external APIs.
- It only reads the active YouTube page in your browser.
- Pro collection records are stored in Chrome local extension storage on the user's device.
- Exported CSV files are generated locally from stored records.

## Pro Collector

The Pro collector is designed for creators who browse Shorts for references and want to automatically save recent viral examples.

When activated and enabled, Shorts Lens saves a Short if it matches the configured rule:

- Default recent window: `7` days
- Default minimum views: `1,000,000`

Saved CSV fields:

- Collected date
- Shorts URL
- Views
- Published date
- Video description, based on the page title

The current license implementation is local-only. It is suitable for early validation, but it is not a hardened payment or entitlement system.

## Permissions

Shorts Lens uses the minimum permissions needed for the current implementation:

- `https://www.youtube.com/*`: run on YouTube pages and detect Shorts.
- `scripting`: inject the content script into YouTube tabs that were already open when the extension starts.
- `storage`: save local license state, Pro settings, and collected Shorts records.
- `tabs`: find existing YouTube tabs for injection after install or browser startup.

## Limitations

YouTube changes its frontend frequently. Shorts Lens depends on metadata already present in the YouTube Shorts page, so future YouTube UI or data structure changes may require updates.

Some Shorts may briefly show no overlay while YouTube finishes loading the active Short's metadata. The extension retries in the background and renders only after matching data is found for the current video.

## Development

After editing the extension, reload it from `chrome://extensions/`, then refresh any open YouTube tabs.

Useful checks:

```sh
node --check content.js
node --check bridge.js
node --check popup.js
node --check license.js
node --check background.js
python3 -m json.tool manifest.json >/dev/null
```

Generate a local test license key:

```sh
node scripts/generate-license-key.js
```

## License

No license has been specified yet.
