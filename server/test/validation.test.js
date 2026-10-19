const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  validDate,
  integer,
  orderItems,
  inOpenWindow,
} = require("../validation");

test("calendar dates reject impossible days, while leap days remain valid", () => {
  for (const date of [
    "2026-02-29",
    "2026-02-31",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
    "2026-1-01",
    "NaN",
    {},
    null,
  ])
    assert.equal(validDate(date), null);
  for (const date of ["2024-02-29", "2026-10-19", "2026-12-31"])
    assert.equal(validDate(date), date);
});

test("integer validation does not coerce empty strings, objects, booleans or scientific notation", () => {
  for (const value of [
    "",
    "1.5",
    "1e3",
    " 2 ",
    [],
    {},
    true,
    null,
    NaN,
    Infinity,
    -1,
    37,
  ])
    assert.equal(integer(value, 1, 36), false);
  assert.equal(integer("36", 1, 36), true);
  assert.equal(integer(1, 1, 36), true);
});

test("invalid order rows are rejected as a whole rather than silently dropping existing items", () => {
  const item = { name: "便當", unitPrice: 90, qty: 2 };
  for (const patch of [
    { qty: 0 },
    { qty: -1 },
    { qty: 1.5 },
    { qty: 1000 },
    { unitPrice: -1 },
    { unitPrice: Infinity },
    { unitPrice: null },
    { name: "" },
    { name: "a".repeat(101) },
  ]) {
    assert.throws(() => orderItems({ items: [item, { ...item, ...patch }] }), {
      status: 400,
    });
  }
  assert.throws(() => orderItems({ items: [null] }), { status: 400 });
  assert.throws(() => orderItems({ items: Array(101).fill(item) }), {
    status: 400,
  });
  assert.throws(
    () =>
      orderItems({
        items: Array(3).fill({ ...item, unitPrice: 1_000_000, qty: 999 }),
      }),
    { status: 400 },
  );
  assert.deepEqual(orderItems({ items: [{ ...item, name: " 便當 " }] }), [
    item,
  ]);
});

test("internal orders have one canonical zero-price line and booleans are type checked", () => {
  assert.deepEqual(orderItems({ internalOnly: true, items: [] }), [
    { name: "內訂", unitPrice: 0, qty: 1 },
  ]);
  assert.throws(() => orderItems({ internalOnly: "false", items: [] }), {
    status: 400,
  });
});

test("business hours include their boundaries and overnight hours belong to the starting weekday", () => {
  const normal = { open_days: [1], open_start: "07:00", open_end: "12:00" };
  assert.equal(inOpenWindow(normal, { day: 1, hhmm: "07:00" }), true);
  assert.equal(inOpenWindow(normal, { day: 1, hhmm: "12:00" }), true);
  assert.equal(inOpenWindow(normal, { day: 1, hhmm: "12:01" }), false);
  assert.equal(inOpenWindow(normal, { day: 2, hhmm: "08:00" }), false);
  const overnight = { open_days: [1], open_start: "22:00", open_end: "02:00" };
  for (const time of [
    { day: 1, hhmm: "23:59" },
    { day: 2, hhmm: "00:30" },
    { day: 2, hhmm: "02:00" },
  ])
    assert.equal(inOpenWindow(overnight, time), true);
  for (const time of [
    { day: 1, hhmm: "01:00" },
    { day: 2, hhmm: "02:01" },
    { day: 2, hhmm: "23:00" },
  ])
    assert.equal(inOpenWindow(overnight, time), false);
});
