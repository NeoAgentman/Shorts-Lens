(function () {
  const SCRIPT_VERSION = "0.2.0";
  const EXTENSION_NAMESPACE = "__shortsLensBridge";

  if (window[EXTENSION_NAMESPACE]?.version === SCRIPT_VERSION) return;
  window[EXTENSION_NAMESPACE]?.cleanup?.();

  const STORAGE_KEYS = {
    license: "shortsLensLicense",
    settings: "shortsLensSettings",
    records: "shortsLensRecords"
  };

  const DEFAULT_SETTINGS = {
    collectorEnabled: false,
    maxAgeDays: 7,
    minViews: 1_000_000
  };

  function normalizeSettings(settings) {
    return {
      ...DEFAULT_SETTINGS,
      ...(settings || {}),
      maxAgeDays: Math.max(1, Number(settings?.maxAgeDays) || DEFAULT_SETTINGS.maxAgeDays),
      minViews: Math.max(1, Number(settings?.minViews) || DEFAULT_SETTINGS.minViews)
    };
  }

  function isActivated(license) {
    return Boolean(license?.valid && license?.key);
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isWithinDays(dateText, maxAgeDays) {
    const published = parseDate(dateText);
    if (!published) return false;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const ageMs = today.getTime() - published.getTime();
    return ageMs >= 0 && ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
  }

  function toRecord(detail) {
    const now = new Date().toISOString();
    return {
      videoId: detail.videoId,
      collectedAt: now,
      lastSeenAt: now,
      url: detail.url,
      views: detail.views,
      viewsNumber: detail.viewsNumber,
      published: detail.published,
      title: detail.title || ""
    };
  }

  async function maybeCollect(detail) {
    if (!detail?.videoId || !Number.isFinite(detail.viewsNumber)) return;

    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.license,
      STORAGE_KEYS.settings,
      STORAGE_KEYS.records
    ]);
    const license = stored[STORAGE_KEYS.license];
    const settings = normalizeSettings(stored[STORAGE_KEYS.settings]);

    if (!isActivated(license) || !settings.collectorEnabled) return;
    if (detail.viewsNumber < settings.minViews) return;
    if (!isWithinDays(detail.published, settings.maxAgeDays)) return;

    const records = Array.isArray(stored[STORAGE_KEYS.records]) ? stored[STORAGE_KEYS.records] : [];
    const existingIndex = records.findIndex((record) => record.videoId === detail.videoId);
    const nextRecord = toRecord(detail);

    if (existingIndex >= 0) {
      records[existingIndex] = {
        ...records[existingIndex],
        ...nextRecord,
        collectedAt: records[existingIndex].collectedAt || nextRecord.collectedAt
      };
    } else {
      records.unshift(nextRecord);
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.records]: records });
  }

  const onMetadata = (event) => {
    void maybeCollect(event.detail);
  };

  window.addEventListener("shorts-lens:metadata", onMetadata);
  window.dispatchEvent(new CustomEvent("shorts-lens:collector-ready"));

  window[EXTENSION_NAMESPACE] = {
    version: SCRIPT_VERSION,
    cleanup() {
      window.removeEventListener("shorts-lens:metadata", onMetadata);
      if (window[EXTENSION_NAMESPACE]?.version === SCRIPT_VERSION) delete window[EXTENSION_NAMESPACE];
    }
  };
})();
