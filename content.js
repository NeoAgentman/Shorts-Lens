(function () {
  const SCRIPT_VERSION = "0.2.0";
  const EXTENSION_NAMESPACE = "__shortsLens";
  const LEGACY_NAMESPACE = "__ytShortsMeta";
  const CARD_ID = "shorts-lens-card";
  const LEGACY_CARD_ID = "yt-shorts-meta-card";

  if (window[EXTENSION_NAMESPACE]?.version === SCRIPT_VERSION) return;
  window[EXTENSION_NAMESPACE]?.cleanup?.();
  if (window[LEGACY_NAMESPACE] !== window[EXTENSION_NAMESPACE]) {
    window[LEGACY_NAMESPACE]?.cleanup?.();
  }

  const RETRY_DELAYS = [300, 800, 1500, 2500, 4000, 6500];
  let currentVideoId = null;
  let currentState = null;
  let retryTimer = null;
  let retryAttempt = 0;
  let lastSeenUrl = location.href;
  let activeJobId = 0;
  let updateTimer = null;
  const disposers = [];

  function getShortsVideoId() {
    const match = location.pathname.match(/^\/shorts\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  function formatNumber(value) {
    const number = parseViewCount(value);
    if (!Number.isFinite(number)) return value || "-";
    if (number >= 1_000_000_000) return `${trimDecimal(number / 1_000_000_000)}B`;
    if (number >= 1_000_000) return `${trimDecimal(number / 1_000_000)}M`;
    if (number >= 1_000) return `${trimDecimal(number / 1_000)}K`;
    return String(number);
  }

  function trimDecimal(value) {
    return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
  }

  function parseViewCount(value) {
    if (typeof value === "number") return value;
    if (!value) return Number.NaN;

    const text = String(value);
    const compactMatch = text.match(/([\d,.]+)\s*([KMB])\b/i);
    if (compactMatch) {
      const number = Number(compactMatch[1].replace(/,/g, ""));
      const unit = compactMatch[2].toUpperCase();
      const multiplier = unit === "B" ? 1_000_000_000 : unit === "M" ? 1_000_000 : 1_000;
      return number * multiplier;
    }

    const digits = text.replace(/[^\d]/g, "");
    return digits ? Number(digits) : Number.NaN;
  }

  function formatDate(value) {
    value = normalizeText(value);
    if (!value) return "-";
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function normalizeText(value) {
    if (!value) return value;
    if (typeof value === "string" || typeof value === "number") return value;
    if (value.simpleText) return value.simpleText;
    if (Array.isArray(value.runs)) return value.runs.map((run) => run.text || "").join("");
    return value;
  }

  function extractJsonAssignment(html, variableName) {
    const marker = `${variableName} = `;
    const start = html.indexOf(marker);
    if (start === -1) return null;

    const jsonStart = html.indexOf("{", start + marker.length);
    if (jsonStart === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = jsonStart; index < html.length; index += 1) {
      const char = html[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return html.slice(jsonStart, index + 1);
        }
      }
    }

    return null;
  }

  function getCurrentPageMeta(videoId) {
    const activeData = getActiveReelData(videoId);
    const appData = document.querySelector("ytd-app")?.__data;
    const windowPlayer = window.ytInitialPlayerResponse;
    const scriptPlayer = parseCurrentPageJson("ytInitialPlayerResponse", videoId);
    const scriptInitialData = parseCurrentPageJson("ytInitialData", videoId);
    const matchedAppData = sourceMatchesVideoId(appData, videoId) ? appData : null;
    const matchedWindowInitialData = sourceMatchesVideoId(window.ytInitialData, videoId) ? window.ytInitialData : null;
    const matchedWindowPlayer = sourceMatchesVideoId(windowPlayer, videoId) ? windowPlayer : null;

    const directMeta = mergeMeta([
      extractKnownMeta(activeData),
      extractKnownMeta(matchedAppData),
      extractKnownMeta(matchedWindowInitialData),
      extractKnownMeta(scriptInitialData)
    ]);
    const sources = [
      activeData,
      matchedAppData,
      matchedWindowInitialData,
      scriptInitialData
    ];
    const pageMeta = mergeMeta(sources.map(extractMetaFromInitialData));
    const playerMeta = mergePlayerMeta([
      activeData?.playerData,
      activeData?.data?.playerResponse,
      matchedAppData?.data?.playerResponse,
      matchedWindowPlayer,
      scriptPlayer
    ]);
    const viewCount = directMeta.viewCount || playerMeta.viewCount || pageMeta.viewCount;
    const publishDate = directMeta.publishDate || playerMeta.publishDate || pageMeta.publishDate;

    if (!viewCount && !publishDate) throw new Error("No metadata found");

    return {
      videoId,
      url: `https://www.youtube.com/shorts/${videoId}`,
      title: getCleanPageTitle(),
      viewCount: formatNumber(viewCount),
      publishDate: formatDate(publishDate),
      viewCountNumber: parseViewCount(viewCount),
      rawViewCount: viewCount,
      rawPublishDate: publishDate
    };
  }

  function getCleanPageTitle() {
    return document.title.replace(/\s+-\s+YouTube$/, "").trim();
  }

  function extractKnownMeta(source) {
    const meta = {
      viewCount: null,
      publishDate: null
    };

    const player =
      source?.playerData ||
      source?.data?.playerResponse ||
      source?.playerResponse ||
      source?.endpoint?.reelWatchEndpoint?.unserializedPrefetchData?.playerResponse ||
      source?.data?.endpoint?.reelWatchEndpoint?.unserializedPrefetchData?.playerResponse;

    const microformat = player?.microformat?.playerMicroformatRenderer || {};

    const panels =
      source?.data?.engagementPanels ||
      source?.data?.response?.engagementPanels ||
      source?.response?.engagementPanels ||
      source?.engagementPanels ||
      [];

    const header = findVideoDescriptionHeader(panels);
    const headerViewCount = extractViewCountFromHeader(header);
    const headerPublishDate = normalizeText(header?.publishDate);

    meta.viewCount = headerViewCount || player?.videoDetails?.viewCount || microformat.viewCount || null;
    meta.publishDate = headerPublishDate || microformat.publishDate || microformat.uploadDate || null;

    return meta;
  }

  function findVideoDescriptionHeader(value) {
    if (!value || typeof value !== "object") return null;

    if (value.videoDescriptionHeaderRenderer) {
      return value.videoDescriptionHeaderRenderer;
    }

    const children = Array.isArray(value) ? value : Object.values(value);
    for (const child of children) {
      const header = findVideoDescriptionHeader(child);
      if (header) return header;
    }

    return null;
  }

  function extractViewCountFromHeader(header) {
    if (!header) return null;

    const factoids = Array.isArray(header.factoid) ? header.factoid : [];
    for (const item of factoids) {
      const factoid =
        item.viewCountFactoidRenderer?.factoid?.factoidRenderer ||
        item.factoidRenderer;

      if (factoid?.label?.simpleText === "Views") {
        return factoid.accessibilityText || factoid.value?.simpleText || null;
      }
    }

    return null;
  }

  function getActiveReelData(videoId) {
    const activeReel = document.querySelector("ytd-reel-video-renderer[is-active]");
    const activeData = activeReel?.__dataHost?.__data;
    if (sourceMatchesVideoId(activeData, videoId)) return activeData;

    for (const reel of document.querySelectorAll("ytd-reel-video-renderer")) {
      const data = reel.__dataHost?.__data;
      if (sourceMatchesVideoId(data, videoId)) return data;
    }

    return null;
  }

  function sourceMatchesVideoId(source, videoId) {
    if (!source || !videoId) return false;
    if (source.videoId === videoId) return true;
    if (source.playerData?.videoDetails?.videoId === videoId) return true;
    if (source.data?.endpoint?.reelWatchEndpoint?.videoId === videoId) return true;
    if (source.endpoint?.reelWatchEndpoint?.videoId === videoId) return true;

    let found = false;
    let count = 0;
    walk(source, (node) => {
      count += 1;
      if (
        node.videoId === videoId ||
        node.watchEndpoint?.videoId === videoId ||
        node.reelWatchEndpoint?.videoId === videoId
      ) {
        found = true;
        return true;
      }

      return count > 15000;
    }, 15000);

    return found;
  }

  function mergePlayerMeta(players) {
    const meta = {
      viewCount: null,
      publishDate: null
    };

    for (const player of players) {
      const microformat = player?.microformat?.playerMicroformatRenderer || {};
      meta.viewCount ||= player?.videoDetails?.viewCount || microformat.viewCount;
      meta.publishDate ||= microformat.publishDate || microformat.uploadDate;
      if (meta.viewCount && meta.publishDate) break;
    }

    return meta;
  }

  function mergeMeta(items) {
    const meta = {
      viewCount: null,
      publishDate: null
    };

    for (const item of items) {
      meta.viewCount ||= item?.viewCount;
      meta.publishDate ||= item?.publishDate;
      if (meta.viewCount && meta.publishDate) break;
    }

    return meta;
  }

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    if (updateTimer) clearTimeout(updateTimer);
    retryTimer = null;
    updateTimer = null;
    retryAttempt = 0;
  }

  function scheduleRetry(videoId) {
    if (retryTimer || retryAttempt >= RETRY_DELAYS.length) return;

    const delay = RETRY_DELAYS[retryAttempt];
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      queueUpdate({ expectedVideoId: videoId });
    }, delay);
  }

  function parseCurrentPageJson(variableName, videoId) {
    for (const script of document.scripts) {
      const text = script.textContent || "";
      if (!text.includes(variableName)) continue;

      const jsonText = extractJsonAssignment(text, variableName);
      if (!jsonText) continue;
      if (videoId && !jsonText.includes(videoId)) continue;

      try {
        return JSON.parse(jsonText);
      } catch (error) {
        console.warn(`[Shorts Lens] Failed to parse ${variableName}`, error);
      }
    }

    return null;
  }

  function extractMetaFromInitialData(initialData) {
    const meta = {
      viewCount: null,
      publishDate: null
    };

    walk(initialData, (node) => {
      if (meta.viewCount && meta.publishDate) return true;

      const videoViewCount = node.videoViewCountRenderer;
      if (!meta.viewCount && videoViewCount) {
        meta.viewCount =
          videoViewCount.shortViewCount?.simpleText ||
          videoViewCount.viewCount?.simpleText ||
          videoViewCount.originalViewCount;
      }

      if (!meta.publishDate && node.dateText?.simpleText) {
        meta.publishDate = node.dateText.simpleText;
      }

      if (!meta.publishDate && node.publishDate) {
        meta.publishDate = normalizeText(node.publishDate);
      }

      const factoid = node.factoidRenderer;
      if (factoid?.label?.simpleText === "Views" && !meta.viewCount) {
        meta.viewCount = factoid.accessibilityText || factoid.value?.simpleText;
      }

      if (!meta.publishDate && factoid?.label?.simpleText && /^\d{4}$/.test(factoid.label.simpleText)) {
        meta.publishDate = factoid.accessibilityText || `${factoid.value?.simpleText}, ${factoid.label.simpleText}`;
      }

      if (!meta.publishDate && factoid?.accessibilityText && /\b\d{4}\b/.test(factoid.accessibilityText)) {
        meta.publishDate = factoid.accessibilityText;
      }

      return Boolean(meta.viewCount && meta.publishDate);
    });

    return meta;
  }

  function walk(value, visit, maxNodes = 60000) {
    const seen = new WeakSet();
    let count = 0;

    function step(node) {
      if (!node || typeof node !== "object" || seen.has(node) || count > maxNodes) return false;
      seen.add(node);
      count += 1;

      if (visit(node) === true) return true;

      const children = Array.isArray(node) ? node : Object.values(node);
      for (const child of children) {
        if (typeof child !== "function" && step(child)) return true;
      }

      return false;
    }

    step(value);
  }

  function ensureCard() {
    document.getElementById(LEGACY_CARD_ID)?.remove();

    let card = document.getElementById(CARD_ID);
    if (card) return card;

    card = document.createElement("div");
    card.id = CARD_ID;
    card.style.cssText = [
      "position:absolute",
      "top:88px",
      "right:12px",
      "display:flex",
      "flex-direction:column",
      "align-items:flex-start",
      "gap:4px",
      "min-width:126px",
      "padding:7px 9px",
      "border-radius:8px",
      "background:rgba(15,15,15,.58)",
      "color:#fff",
      "font:500 12px/1.25 Roboto, Arial, sans-serif",
      "box-shadow:0 2px 10px rgba(0,0,0,.18)",
      "z-index:999999",
      "pointer-events:auto",
      "backdrop-filter:blur(3px)"
    ].join(";");

    const container = findVideoContainer();
    if (container) {
      const position = getComputedStyle(container).position;
      if (position === "static") container.style.position = "relative";
      container.appendChild(card);
    } else {
      card.style.cssText += [
        "position:fixed",
        "right:calc(50vw - 250px)",
        "top:160px"
      ].join(";");
      document.documentElement.appendChild(card);
    }

    return card;
  }

  function findVideoContainer() {
    const activeReel =
      document.querySelector("ytd-reel-video-renderer[is-active]") ||
      document.querySelector("ytd-reel-video-renderer");

    const video = activeReel?.querySelector("video");
    const candidates = [
      video?.parentElement,
      video?.parentElement?.parentElement,
      activeReel?.querySelector("#player-container"),
      activeReel?.querySelector("#reel-video-renderer"),
      activeReel?.querySelector("ytd-reel-player-overlay-renderer")
    ].filter(Boolean);

    return candidates.find((node) => {
      const rect = node.getBoundingClientRect();
      const videoRect = video?.getBoundingClientRect();
      if (!videoRect) return rect.width > 200 && rect.height > 300;

      const closeToVideo =
        Math.abs(rect.left - videoRect.left) < 8 &&
        Math.abs(rect.top - videoRect.top) < 8 &&
        Math.abs(rect.width - videoRect.width) < 16 &&
        Math.abs(rect.height - videoRect.height) < 16;

      return closeToVideo || (rect.width > 200 && rect.height > 300 && rect.right <= videoRect.right + 8);
    }) || null;
  }

  function renderCard(state) {
    currentState = state;

    if (state.status !== "ready") return;

    const card = ensureCard();
    card.textContent = "";

    const items = [
      { label: "Views", value: state.viewCount || "-" },
      { label: "Published", value: state.publishDate || "-" }
    ];

    for (const item of items) {
      const block = document.createElement("div");
      block.style.cssText = [
        "display:flex",
        "flex-direction:row",
        "align-items:center",
        "justify-content:space-between",
        "gap:10px",
        "width:100%",
        "white-space:nowrap"
      ].join(";");

      const value = document.createElement("strong");
      value.textContent = item.value;
      value.style.cssText = [
        "font-size:13px",
        "font-weight:700",
        "line-height:16px",
        "color:inherit"
      ].join(";");

      const label = document.createElement("span");
      label.textContent = item.label;
      label.style.cssText = [
        "font-size:11px",
        "font-weight:500",
        "line-height:14px",
        "color:rgba(255,255,255,.72)"
      ].join(";");

      block.append(label, value);
      card.appendChild(block);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "收集";
    button.style.cssText = [
      "width:100%",
      "margin-top:2px",
      "border:0",
      "border-radius:6px",
      "padding:5px 7px",
      "background:rgba(255,255,255,.18)",
      "color:#fff",
      "font:700 12px/16px Roboto, Arial, sans-serif",
      "cursor:pointer"
    ].join(";");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      notifyMetadataReady(state, { manual: true });
      showManualCollectFeedback(button);
    });
    card.appendChild(button);
  }

  function showManualCollectFeedback(button) {
    button.textContent = "已收集";
    button.disabled = true;
    button.style.cursor = "default";
    button.style.background = "rgba(255,255,255,.28)";

    setTimeout(() => {
      button.textContent = "收集";
      button.disabled = false;
      button.style.cursor = "pointer";
      button.style.background = "rgba(255,255,255,.18)";
    }, 1400);
  }

  function queueUpdate(options = {}) {
    const videoId = getShortsVideoId();
    if (!videoId) {
      activeJobId += 1;
      document.getElementById(CARD_ID)?.remove();
      document.getElementById(LEGACY_CARD_ID)?.remove();
      currentVideoId = null;
      currentState = null;
      clearRetry();
      return;
    }

    if (options.expectedVideoId && options.expectedVideoId !== videoId) return;

    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      updateTimer = null;
      void runUpdate({ ...options, videoId });
    }, options.delay ?? 80);
  }

  async function runUpdate(options = {}) {
    const videoId = getShortsVideoId();
    if (!videoId) {
      activeJobId += 1;
      document.getElementById(CARD_ID)?.remove();
      document.getElementById(LEGACY_CARD_ID)?.remove();
      currentVideoId = null;
      currentState = null;
      clearRetry();
      return;
    }

    if (options.expectedVideoId && options.expectedVideoId !== videoId) return;

    if (videoId === currentVideoId && currentState?.status === "ready") {
      if (!document.getElementById(CARD_ID) && currentState) renderCard(currentState);
      return;
    }

    if (videoId !== currentVideoId) {
      clearRetry();
      activeJobId += 1;
      currentVideoId = videoId;
      currentState = { status: "loading" };
      document.getElementById(CARD_ID)?.remove();
      document.getElementById(LEGACY_CARD_ID)?.remove();
    } else if (!document.getElementById(CARD_ID) && currentState) {
      renderCard(currentState);
    }

    const jobId = activeJobId;

    try {
      const meta = await readMetaAsync(videoId);
      if (jobId === activeJobId && videoId === currentVideoId) {
        clearRetry();
        const readyState = { status: "ready", ...meta };
        renderCard(readyState);
        notifyMetadataReady(readyState);
      }
    } catch (error) {
      console.warn("[Shorts Lens] Failed to load metadata", error);
      if (videoId !== currentVideoId) return;

      if (retryAttempt < RETRY_DELAYS.length) {
        currentState = { status: "loading" };
        scheduleRetry(videoId);
      } else {
        currentState = { status: "missing" };
        document.getElementById(CARD_ID)?.remove();
        document.getElementById(LEGACY_CARD_ID)?.remove();
      }
    }
  }

  function readMetaAsync(videoId) {
    return new Promise((resolve, reject) => {
      const run = () => {
        try {
          resolve(getCurrentPageMeta(videoId));
        } catch (error) {
          reject(error);
        }
      };

      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(run, { timeout: 700 });
      } else {
        setTimeout(run, 0);
      }
    });
  }

  function notifyMetadataReady(state, options = {}) {
    window.dispatchEvent(new CustomEvent("shorts-lens:metadata", {
      detail: {
        videoId: state.videoId,
        url: state.url,
        title: state.title,
        views: state.viewCount,
        viewsNumber: state.viewCountNumber,
        published: state.publishDate,
        manual: Boolean(options.manual)
      }
    }));
  }

  function watchUrlChanges() {
    if (location.href !== lastSeenUrl) {
      lastSeenUrl = location.href;
      queueUpdate();
    } else if (currentState && !document.getElementById(CARD_ID)) {
      renderCard(currentState);
    }
  }

  const intervalId = setInterval(watchUrlChanges, 1000);
  const onNavigateFinish = () => queueUpdate();
  const onPageDataUpdated = () => queueUpdate({ delay: 120 });
  const onPopState = () => queueUpdate();
  const onCollectorReady = () => {
    if (currentState?.status === "ready") notifyMetadataReady(currentState);
  };

  window.addEventListener("yt-navigate-finish", onNavigateFinish);
  window.addEventListener("yt-page-data-updated", onPageDataUpdated);
  window.addEventListener("popstate", onPopState);
  window.addEventListener("shorts-lens:collector-ready", onCollectorReady);

  disposers.push(() => clearInterval(intervalId));
  disposers.push(() => window.removeEventListener("yt-navigate-finish", onNavigateFinish));
  disposers.push(() => window.removeEventListener("yt-page-data-updated", onPageDataUpdated));
  disposers.push(() => window.removeEventListener("popstate", onPopState));
  disposers.push(() => window.removeEventListener("shorts-lens:collector-ready", onCollectorReady));

  const api = {
    version: SCRIPT_VERSION,
    cleanup() {
      clearRetry();
      document.getElementById(CARD_ID)?.remove();
      document.getElementById(LEGACY_CARD_ID)?.remove();
      for (const dispose of disposers) dispose();
      if (window[EXTENSION_NAMESPACE] === api) delete window[EXTENSION_NAMESPACE];
      if (window[LEGACY_NAMESPACE] === api) delete window[LEGACY_NAMESPACE];
    }
  };

  window[EXTENSION_NAMESPACE] = api;
  window[LEGACY_NAMESPACE] = api;

  queueUpdate({ delay: 120 });
})();
