const STORAGE_KEYS = {
  settings: "shortsLensSettings",
  records: "shortsLensRecords"
};

const DEFAULT_SETTINGS = {
  collectorEnabled: false,
  deleteAfterExport: false,
  maxAgeDays: 7,
  minViews: 1_000_000
};

const elements = {
  collectorEnabled: document.getElementById("collectorEnabled"),
  deleteAfterExport: document.getElementById("deleteAfterExport"),
  maxAgeDays: document.getElementById("maxAgeDays"),
  minViews: document.getElementById("minViews"),
  recordCount: document.getElementById("recordCount"),
  newestRecords: document.getElementById("newestRecords"),
  emptyRecords: document.getElementById("emptyRecords"),
  openRecordsButton: document.getElementById("openRecordsButton")
};

let saveTimer = null;

function normalizeSettings(settings) {
  const maxAgeDays = Number(settings?.maxAgeDays);
  const minViews = Number(settings?.minViews);

  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    maxAgeDays: [0, 7, 30].includes(maxAgeDays) ? maxAgeDays : DEFAULT_SETTINGS.maxAgeDays,
    minViews: Math.max(0, Number.isFinite(minViews) ? minViews : DEFAULT_SETTINGS.minViews)
  };
}

async function loadState() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.records
  ]);
  const settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  const records = Array.isArray(stored[STORAGE_KEYS.records]) ? stored[STORAGE_KEYS.records] : [];

  renderSettings(settings);
  renderRecords(records);
}

function renderSettings(settings) {
  elements.collectorEnabled.checked = Boolean(settings.collectorEnabled);
  elements.deleteAfterExport.checked = Boolean(settings.deleteAfterExport);
  elements.maxAgeDays.value = String(settings.maxAgeDays);
  elements.minViews.value = formatMillionValue(settings.minViews);
}

function renderRecords(records) {
  elements.recordCount.textContent = String(records.length);
  elements.newestRecords.textContent = "";
  elements.emptyRecords.hidden = records.length > 0;

  const newestRecords = [...records]
    .sort((first, second) => {
      return (Date.parse(second.collectedAt || "") || 0) - (Date.parse(first.collectedAt || "") || 0);
    })
    .slice(0, 5);

  for (const record of newestRecords) {
    elements.newestRecords.appendChild(createRecordItem(record));
  }
}

function createRecordItem(record) {
  const item = document.createElement("li");

  const link = document.createElement("a");
  link.href = record.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = record.title || record.url || record.videoId || "未命名 Short";

  const meta = document.createElement("span");
  meta.textContent = `${formatViews(record)} · ${record.published || "-"}`;

  item.append(link, meta);
  return item;
}

function formatViews(record) {
  const number = Number(record.viewsNumber);
  if (!Number.isFinite(number)) return record.views || "-";
  if (number >= 1_000_000_000) return `${trimDecimal(number / 1_000_000_000)}B`;
  if (number >= 1_000_000) return `${trimDecimal(number / 1_000_000)}M`;
  if (number >= 1_000) return `${trimDecimal(number / 1_000)}K`;
  return String(number);
}

function trimDecimal(value) {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
}

function formatMillionValue(value) {
  const millionValue = Number(value) / 1_000_000;
  if (!Number.isFinite(millionValue)) return "1";
  return millionValue >= 10 ? String(Math.round(millionValue)) : millionValue.toFixed(1).replace(/\.0$/, "");
}

function parseMillionInput(value) {
  const millionValue = Number(value);
  if (!Number.isFinite(millionValue)) return DEFAULT_SETTINGS.minViews;
  return Math.max(0, Math.round(millionValue * 1_000_000));
}

function readSettingsFromForm() {
  return normalizeSettings({
    collectorEnabled: elements.collectorEnabled.checked,
    deleteAfterExport: elements.deleteAfterExport.checked,
    maxAgeDays: Number(elements.maxAgeDays.value),
    minViews: parseMillionInput(elements.minViews.value)
  });
}

function queueSaveSettings() {
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    saveTimer = null;
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: readSettingsFromForm() });
  }, 180);
}

elements.collectorEnabled.addEventListener("change", queueSaveSettings);
elements.deleteAfterExport.addEventListener("change", queueSaveSettings);
elements.maxAgeDays.addEventListener("change", queueSaveSettings);
elements.minViews.addEventListener("input", queueSaveSettings);
elements.openRecordsButton.addEventListener("click", () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL("records.html") });
});

void loadState();
