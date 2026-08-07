/**
 * Print-shop panel-width / delta templates (localStorage).
 */

const KEY = "leaflet-fold-sim:shop-templates:v1";

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   deltaMm: number,
 *   notes: string,
 *   sizeId?: string|null,
 *   foldId?: string|null,
 *   updatedAt: string
 * }} ShopTemplate
 */

/** @returns {ShopTemplate[]} */
export function listTemplates() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveAll(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/**
 * @param {Omit<ShopTemplate,'id'|'updatedAt'> & { id?: string }} data
 */
export function upsertTemplate(data) {
  const list = listTemplates();
  const now = new Date().toISOString();
  const id = data.id || `tpl_${Date.now().toString(36)}`;
  const existing = list.findIndex((t) => t.id === id);
  const row = {
    id,
    name: (data.name || "이름 없음").trim(),
    deltaMm: Number(data.deltaMm) || 2,
    notes: data.notes || "",
    sizeId: data.sizeId ?? null,
    foldId: data.foldId ?? null,
    updatedAt: now,
  };
  if (existing >= 0) list[existing] = row;
  else list.push(row);
  saveAll(list);
  return row;
}

export function deleteTemplate(id) {
  saveAll(listTemplates().filter((t) => t.id !== id));
}

export function getTemplate(id) {
  return listTemplates().find((t) => t.id === id) || null;
}

/**
 * Export all templates as downloadable JSON payload.
 */
export function exportTemplatesPayload() {
  return {
    format: "leaflet-fold-sim-shop-templates",
    version: 1,
    exportedAt: new Date().toISOString(),
    templates: listTemplates(),
  };
}

/**
 * Import templates from parsed JSON.
 * @param {object} payload
 * @param {"merge"|"replace"} mode
 * @returns {{ imported: number, total: number }}
 */
export function importTemplatesPayload(payload, mode = "merge") {
  if (!payload || payload.format !== "leaflet-fold-sim-shop-templates") {
    throw new Error("형식이 맞지 않습니다 (leaflet-fold-sim-shop-templates).");
  }
  const incoming = Array.isArray(payload.templates) ? payload.templates : [];
  if (!incoming.length) throw new Error("가져올 템플릿이 없습니다.");

  let list = mode === "replace" ? [] : listTemplates();
  const byId = new Map(list.map((t) => [t.id, t]));

  for (const raw of incoming) {
    const id = raw.id || `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const row = {
      id,
      name: String(raw.name || "이름 없음").trim(),
      deltaMm: Number(raw.deltaMm) || 2,
      notes: raw.notes || "",
      sizeId: raw.sizeId ?? null,
      foldId: raw.foldId ?? null,
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
    byId.set(id, row);
  }
  list = [...byId.values()];
  saveAll(list);
  return { imported: incoming.length, total: list.length };
}

export function downloadTemplatesJson(filename = "shop-templates.json") {
  const payload = exportTemplatesPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/**
 * @param {File} file
 * @param {"merge"|"replace"} mode
 */
export async function importTemplatesFromFile(file, mode = "merge") {
  const text = await file.text();
  const data = JSON.parse(text);
  return importTemplatesPayload(data, mode);
}
