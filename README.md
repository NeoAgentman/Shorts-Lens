# Shorts Lens

Chrome extension for showing YouTube Shorts publish date and view count without opening the Description panel.

## Install

1. Open `chrome://extensions/`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the extension project folder.

## How It Works

On `https://www.youtube.com/shorts/*`, the content script reads metadata already present in the current Shorts page. It parses current-page script data such as `ytInitialPlayerResponse` and `ytInitialData`, then injects a small metadata card into the Shorts UI.

Fields used:

- `videoDetails.viewCount`
- `microformat.playerMicroformatRenderer.publishDate`
- `factoidRenderer` entries inside `ytInitialData`

## Notes

This is a DOM-based prototype. YouTube changes its frontend often, so the insertion point may need adjustment over time.
