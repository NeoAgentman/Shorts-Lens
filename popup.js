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

const elements = {
  statusText: document.getElementById("statusText"),
  statusBadge: document.getElementById("statusBadge"),
  licenseKey: document.getElementById("licenseKey"),
  activateButton: document.getElementById("activateButton"),
  licenseMessage: document.getElementById("licenseMessage"),
  collectorEnabled: document.getElementById("collectorEnabled"),
  maxAgeDays: document.getElementById("maxAgeDays"),
  minViews: document.getElementById("minViews"),
  recordCount: document.getElementById("recordCount"),
  exportButton: document.getElementById("exportButton"),
  clearButton: document.getElementById("clearButton"),
  proSection: document.querySelector(".pro-section")
};

let activated = false;
let saveTimer = null;

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

async function loadState() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.license,
    STORAGE_KEYS.settings,
    STORAGE_KEYS.records
  ]);
  const license = stored[STORAGE_KEYS.license];
  const settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  const records = Array.isArray(stored[STORAGE_KEYS.records]) ? stored[STORAGE_KEYS.records] : [];

  activated = isActivated(license);
  renderLicense(license);
  renderSettings(settings);
  renderRecords(records);
}

function renderLicense(license) {
  elements.statusBadge.textContent = activated ? "Pro" : "Free";
  elements.statusBadge.classList.toggle("active", activated);
  elements.statusText.textContent = activated ? "Viral collector unlocked" : "Free mode";
  elements.licenseKey.value = license?.formattedKey || license?.key || "";
  elements.licenseMessage.textContent = activated ? "License activated on this browser." : "Activate Pro to enable viral collection.";

  elements.proSection.classList.toggle("pro-locked", !activated);
  elements.collectorEnabled.disabled = !activated;
  elements.maxAgeDays.disabled = !activated;
  elements.minViews.disabled = !activated;
  elements.exportButton.disabled = !activated;
  elements.clearButton.disabled = !activated;
}

function renderSettings(settings) {
  elements.collectorEnabled.checked = Boolean(settings.collectorEnabled);
  elements.maxAgeDays.value = settings.maxAgeDays;
  elements.minViews.value = settings.minViews;
}

function renderRecords(records) {
  elements.recordCount.textContent = String(records.length);
}

function readSettingsFromForm() {
  return normalizeSettings({
    collectorEnabled: elements.collectorEnabled.checked,
    maxAgeDays: elements.maxAgeDays.value,
    minViews: elements.minViews.value
  });
}

function queueSaveSettings() {
  if (!activated) return;
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    saveTimer = null;
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: readSettingsFromForm() });
  }, 180);
}

async function activateLicense() {
  elements.activateButton.disabled = true;
  elements.licenseMessage.textContent = "Checking license...";

  try {
    const result = await ShortsLensLicense.validateKey(elements.licenseKey.value);
    if (!result.valid) {
      await chrome.storage.local.remove(STORAGE_KEYS.license);
      activated = false;
      elements.licenseMessage.textContent = "Invalid license key.";
      await loadState();
      return;
    }

    const license = {
      valid: true,
      key: result.normalizedKey,
      formattedKey: result.formattedKey,
      activatedAt: new Date().toISOString()
    };

    await chrome.storage.local.set({ [STORAGE_KEYS.license]: license });
    activated = true;
    await loadState();
  } finally {
    elements.activateButton.disabled = false;
  }
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function recordsToCsv(records) {
  const header = ["Collected At", "Shorts URL", "Views", "Published", "Video Description"];
  const rows = records.map((record) => [
    record.collectedAt,
    record.url,
    record.viewsNumber || record.views,
    record.published,
    record.title
  ]);

  return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

async function exportCsv() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.records);
  const records = Array.isArray(stored[STORAGE_KEYS.records]) ? stored[STORAGE_KEYS.records] : [];
  const csv = recordsToCsv(records);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `shorts-lens-viral-shorts-${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function clearRecords() {
  await chrome.storage.local.set({ [STORAGE_KEYS.records]: [] });
  renderRecords([]);
}

elements.activateButton.addEventListener("click", () => {
  void activateLicense();
});
elements.licenseKey.addEventListener("keydown", (event) => {
  if (event.key === "Enter") void activateLicense();
});
elements.collectorEnabled.addEventListener("change", queueSaveSettings);
elements.maxAgeDays.addEventListener("input", queueSaveSettings);
elements.minViews.addEventListener("input", queueSaveSettings);
elements.exportButton.addEventListener("click", () => {
  void exportCsv();
});
elements.clearButton.addEventListener("click", () => {
  void clearRecords();
});

void loadState();
