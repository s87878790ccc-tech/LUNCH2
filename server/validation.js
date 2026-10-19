"use strict";

const MAX_PRICE = 1_000_000;
const MAX_QTY = 999;
const MAX_ITEMS = 100;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function integer(value, min, max) {
  if (typeof value !== "number" && typeof value !== "string") return false;
  if (typeof value === "string" && !/^\d+$/.test(value)) return false;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= "1900-01-01" &&
    value <= "9999-12-31"
    ? value
    : null;
}

function booleanField(body, key, fallback = false) {
  if (body[key] === undefined) return fallback;
  if (typeof body[key] !== "boolean") throw badRequest(`${key} 必須是布林值`);
  return body[key];
}

function orderItems(body) {
  if (!Array.isArray(body.items) || body.items.length > MAX_ITEMS) {
    throw badRequest(`餐點清單必須是陣列，最多 ${MAX_ITEMS} 項`);
  }
  if (booleanField(body, "internalOnly"))
    return [{ name: "內訂", unitPrice: 0, qty: 1 }];
  let total = 0;
  return body.items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw badRequest("餐點格式不正確");
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name || name.length > 100) throw badRequest("品名需為 1～100 字");
    if (!integer(item.unitPrice, 0, MAX_PRICE))
      throw badRequest(`單價需為 0～${MAX_PRICE} 的整數`);
    if (!integer(item.qty, 1, MAX_QTY))
      throw badRequest(`數量需為 1～${MAX_QTY} 的整數`);
    const unitPrice = Number(item.unitPrice);
    const qty = Number(item.qty);
    total += unitPrice * qty;
    if (total > 2_147_483_647) throw badRequest("訂單總額超出上限");
    return { name, unitPrice, qty };
  });
}

// An overnight window belongs to the day on which it starts.
function inOpenWindow(settings, { day, hhmm }) {
  const days = (settings?.open_days ?? [1, 2, 3, 4, 5]).map(Number);
  const start = settings?.open_start || "07:00";
  const end = settings?.open_end || "12:00";
  if (start <= end) return days.includes(day) && start <= hhmm && hhmm <= end;
  return (
    (days.includes(day) && hhmm >= start) ||
    (days.includes((day + 6) % 7) && hhmm <= end)
  );
}

module.exports = {
  MAX_PRICE,
  MAX_QTY,
  badRequest,
  integer,
  validDate,
  booleanField,
  orderItems,
  inOpenWindow,
};
