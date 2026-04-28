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
  recordsBody: document.getElementById("recordsBody"),
  emptyState: document.getElementById("emptyState"),
  searchInput: document.getElementById("searchInput"),
  sortSelect: document.getElementById("sortSelect"),
  selectVisible: document.getElementById("selectVisible"),
  selectedCount: document.getElementById("selectedCount"),
  visibleCount: document.getElementById("visibleCount"),
  totalCount: document.getElementById("totalCount"),
  refreshButton: document.getElementById("refreshButton"),
  exportButton: document.getElementById("exportButton"),
  clearButton: document.getElementById("clearButton")
};

let records = [];
let settings = DEFAULT_SETTINGS;
const selectedVideoIds = new Set();

async function loadRecords() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.records
  ]);
  settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  const storedRecords = Array.isArray(stored[STORAGE_KEYS.records]) ? stored[STORAGE_KEYS.records] : [];
  records = dedupeRecords(storedRecords);
  if (records.length !== storedRecords.length) {
    await chrome.storage.local.set({ [STORAGE_KEYS.records]: records });
  }
  pruneSelection();
  render();
}

function normalizeSettings(value) {
  return {
    ...DEFAULT_SETTINGS,
    ...(value || {}),
    maxAgeDays: Math.max(1, Number(value?.maxAgeDays) || DEFAULT_SETTINGS.maxAgeDays),
    minViews: Math.max(1, Number(value?.minViews) || DEFAULT_SETTINGS.minViews)
  };
}

function dedupeRecords(items) {
  const byVideoId = new Map();

  for (const item of items) {
    const key = item?.videoId || item?.url;
    if (!key) continue;

    const existing = byVideoId.get(key);
    if (!existing) {
      byVideoId.set(key, { ...item });
      continue;
    }

    byVideoId.set(key, {
      ...existing,
      ...item,
      collectedAt: existing.collectedAt || item.collectedAt,
      lastSeenAt: getNewestDate(existing.lastSeenAt, item.lastSeenAt)
    });
  }

  return Array.from(byVideoId.values());
}

function getNewestDate(firstValue, secondValue) {
  const firstTime = Date.parse(firstValue || "");
  const secondTime = Date.parse(secondValue || "");
  if (!Number.isFinite(firstTime)) return secondValue || firstValue;
  if (!Number.isFinite(secondTime)) return firstValue || secondValue;
  return firstTime >= secondTime ? firstValue : secondValue;
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function getFilteredRecords() {
  const query = normalizeText(elements.searchInput.value).trim();
  const filtered = query
    ? records.filter((record) => {
        return [
          record.title,
          record.url,
          record.published,
          record.collectedAt
        ].some((value) => normalizeText(value).includes(query));
      })
    : [...records];

  return sortRecords(filtered, elements.sortSelect.value);
}

function sortRecords(items, mode) {
  const [field, direction] = mode.split("-");
  const multiplier = direction === "asc" ? 1 : -1;

  return items.sort((first, second) => {
    const firstValue = getSortValue(first, field);
    const secondValue = getSortValue(second, field);

    if (firstValue > secondValue) return multiplier;
    if (firstValue < secondValue) return -multiplier;
    return 0;
  });
}

function getSortValue(record, field) {
  if (field === "viewsNumber") return Number(record.viewsNumber) || 0;
  if (field === "title") return normalizeText(record.title);
  if (field === "published") return Date.parse(record.published || "") || 0;
  return Date.parse(record.collectedAt || "") || 0;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatViews(record) {
  const number = Number(record.viewsNumber);
  if (!Number.isFinite(number)) return record.views || "-";
  return number.toLocaleString();
}

function render() {
  const visibleRecords = getFilteredRecords();
  elements.recordsBody.textContent = "";
  elements.selectedCount.textContent = String(selectedVideoIds.size);
  elements.visibleCount.textContent = String(visibleRecords.length);
  elements.totalCount.textContent = String(records.length);
  elements.emptyState.hidden = visibleRecords.length > 0;
  syncSelectVisibleState(visibleRecords);

  for (const record of visibleRecords) {
    const row = document.createElement("tr");
    row.append(
      createSelectCell(record),
      createCell(formatDateTime(record.collectedAt)),
      createCell(formatViews(record)),
      createCell(record.published || "-"),
      createTitleCell(record.title),
      createLinkCell(record.url)
    );
    elements.recordsBody.appendChild(row);
  }
}

function createSelectCell(record) {
  const cell = document.createElement("td");
  cell.className = "select-col";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = selectedVideoIds.has(record.videoId);
  checkbox.setAttribute("aria-label", `选择 ${record.title || record.url || record.videoId}`);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      selectedVideoIds.add(record.videoId);
    } else {
      selectedVideoIds.delete(record.videoId);
    }
    render();
  });

  cell.appendChild(checkbox);
  return cell;
}

function createCell(text) {
  const cell = document.createElement("td");
  cell.textContent = text || "-";
  return cell;
}

function createTitleCell(text) {
  const cell = createCell(text || "-");
  cell.className = "title-cell";
  return cell;
}

function createLinkCell(url) {
  const cell = document.createElement("td");
  if (!url) {
    cell.textContent = "-";
    return cell;
  }

  const link = document.createElement("a");
  link.className = "link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "打开";
  cell.appendChild(link);
  return cell;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function recordsToCsv(items) {
  const header = ["收集时间", "Shorts 链接", "播放量", "发布日期", "视频描述"];
  const rows = items.map((record) => [
    record.collectedAt,
    record.url,
    record.viewsNumber || record.views,
    record.published,
    record.title
  ]);

  return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

async function exportCsv() {
  const exportRecords = getExportRecords();
  if (exportRecords.length === 0) return;

  const csv = recordsToCsv(exportRecords);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `shorts-lens-viral-shorts-${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  if (settings.deleteAfterExport) {
    await deleteRecords(exportRecords);
  }
}

function getExportRecords() {
  if (selectedVideoIds.size === 0) return getFilteredRecords();
  return records.filter((record) => selectedVideoIds.has(record.videoId));
}

async function deleteRecords(items) {
  const exportedIds = new Set(items.map((record) => record.videoId));
  records = records.filter((record) => !exportedIds.has(record.videoId));
  for (const videoId of exportedIds) selectedVideoIds.delete(videoId);
  await chrome.storage.local.set({ [STORAGE_KEYS.records]: records });
  render();
}

async function clearRecords() {
  await chrome.storage.local.set({ [STORAGE_KEYS.records]: [] });
  records = [];
  selectedVideoIds.clear();
  render();
}

function pruneSelection() {
  const availableIds = new Set(records.map((record) => record.videoId));
  for (const videoId of selectedVideoIds) {
    if (!availableIds.has(videoId)) selectedVideoIds.delete(videoId);
  }
}

function syncSelectVisibleState(visibleRecords) {
  const visibleIds = visibleRecords.map((record) => record.videoId).filter(Boolean);
  const selectedVisibleCount = visibleIds.filter((videoId) => selectedVideoIds.has(videoId)).length;

  elements.selectVisible.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  elements.selectVisible.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
}

function toggleVisibleSelection() {
  const visibleRecords = getFilteredRecords();
  const visibleIds = visibleRecords.map((record) => record.videoId).filter(Boolean);
  const shouldSelect = visibleIds.some((videoId) => !selectedVideoIds.has(videoId));

  for (const videoId of visibleIds) {
    if (shouldSelect) selectedVideoIds.add(videoId);
    else selectedVideoIds.delete(videoId);
  }

  render();
}

elements.searchInput.addEventListener("input", render);
elements.sortSelect.addEventListener("change", render);
elements.selectVisible.addEventListener("change", toggleVisibleSelection);
elements.refreshButton.addEventListener("click", () => {
  void loadRecords();
});
elements.exportButton.addEventListener("click", () => {
  void exportCsv();
});
elements.clearButton.addEventListener("click", () => {
  void clearRecords();
});

void loadRecords();
