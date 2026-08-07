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
