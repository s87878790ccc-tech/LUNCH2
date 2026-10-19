const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");

const html = fs.readFileSync(
  path.join(__dirname, "../../docs/index.html"),
  "utf8",
);
const source = fs.readFileSync(
  path.join(__dirname, "../../docs/app.js"),
  "utf8",
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message = "client did not settle") {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (check()) return;
    await sleep(5);
  }
  assert.fail(message);
}

async function client(
  t,
  {
    role = "admin",
    loggedIn = true,
    orderItems = [],
    preItems = [],
    enabled = true,
    manualLocked = false,
  } = {},
) {
  const errors = [],
    calls = [],
    alerts = [];
  const console = new VirtualConsole();
  console.on("jsdomError", (error) => errors.push(error));
  const dom = new JSDOM(html, {
    url: "https://s87878790ccc-tech.github.io/LUNCH2/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: console,
  });
  t.after(() => dom.window.close());
  const w = dom.window,
    d = w.document;
  w.structuredClone = structuredClone;
  w.alert = (message) => alerts.push(message);
  w.confirm = () => true;
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  const empty = (seat) => ({
    seat,
    submitted: false,
    internalOnly: false,
    paid: false,
    items: [],
  });
  const model = {
    manualLocked,
    user:
      role === "admin"
        ? { id: 1, username: "admin", role }
        : { id: 2, username: "2", role },
    orders: new Map([
      [1, { ...empty(1), items: structuredClone(orderItems) }],
      [2, { ...empty(2), items: structuredClone(role === 'user' ? orderItems : []) }],
    ]),
    preorders: new Map([
      [
        "2026-10-20:2",
        { ...empty(2), date: "2026-10-20", items: structuredClone(preItems) },
      ],
    ]),
    menus: [
      {
        id: 1,
        name: "今日菜單",
        note: "",
        items: [{ id: 10, code: 1, name: "雞腿飯", price: 95 }],
      },
      {
        id: 2,
        name: "其他菜單",
        note: "",
        items: [{ id: 20, code: 1, name: "炒飯", price: 80 }],
      },
    ],
    activeMenuId: 1,
    preSettings: { enabled, dates: ["2026-10-20"] },
    failWrites: false,
    delay: null,
  };
  let nextItem = 100;
  w.fetch = async (url, options = {}) => {
    const route = url.replace("https://lunch2.onrender.com/api", ""),
      method = options.method || "GET";
    calls.push({ route, method, body: options.body });
    const body =
      typeof options.body === "string" ? JSON.parse(options.body) : {};
    if (route === "/slow") {
      await sleep(80);
      return Response.json({ message: "invalid token" }, { status: 401 });
    }
    if (model.delay) await model.delay(route, method);
    if (model.failWrites && method === "PUT")
      return Response.json({ message: "測試儲存失敗" }, { status: 500 });
    let data;
    if (route === "/auth/login") {
      if (body.password === "wrong")
        return Response.json(
          { message: "invalid credentials" },
          { status: 401 },
        );
      model.user =
        body.username === "admin"
          ? { id: 1, username: "admin", role: "admin" }
          : { id: 2, username: "2", role: "user" };
      data = { user: model.user, token: `token-${model.user.username}` };
    } else if (route === "/auth/logout") data = { ok: true };
    else if (route === "/auth/me") data = { user: model.user };
    else if (/^\/users\/\d+\/password$/.test(route) && method === "PUT")
      data = { ok: true };
    else if (route === "/open-status") data = { open: true };
    else if (route === "/settings/manual-order") {
      if (method === "PUT") model.manualLocked = body.locked;
      data = { locked: model.manualLocked };
    }
    else if (route === "/settings/preorder") {
      if (method === "PUT") model.preSettings = body;
      data = model.preSettings;
    } else if (route === "/menus")
      data = { menus: model.menus, activeMenuId: model.activeMenuId };
    else if (route === "/settings/active-menu") {
      model.activeMenuId = body.menuId;
      data = { ok: true };
    } else if (route === "/orders")
      data = {
        orders: Array.from(
          { length: 36 },
          (_, i) => model.orders.get(i + 1) || empty(i + 1),
        ),
      };
    else if (/^\/orders\/\d+(?:\/paid)?$/.test(route)) {
      const seat = Number(route.split("/")[2]);
      const order = model.orders.get(seat) || empty(seat);
      if (method === "PUT") {
        if (route.endsWith("/paid")) order.paid = body.paid;
        else
          Object.assign(order, structuredClone(body), {
            items: body.items.map((item) => ({ ...item, id: ++nextItem })),
            submitted: body.items.length > 0,
          });
        model.orders.set(seat, order);
      }
      data = order;
    } else if (/^\/preorders\/[^/]+\/\d+(?:\/paid)?$/.test(route)) {
      const [, , date, rawSeat] = route.split("/"),
        seat = Number(rawSeat),
        key = `${date}:${seat}`;
      const order = model.preorders.get(key) || { ...empty(seat), date };
      if (method === "PUT") {
        if (route.endsWith("/paid")) order.paid = body.paid;
        else
          Object.assign(order, structuredClone(body), {
            items: body.items.map((item) => ({ ...item, id: ++nextItem })),
          });
        model.preorders.set(key, order);
      }
      data = order;
    } else if (route === "/reports/aggregate")
      data = { items: [], classTotal: 0 };
    else if (route === "/reports/missing") data = { missing: [] };
    else if (route === "/reports/unpaid" || route.endsWith("/unpaid"))
      data = { list: [] };
    else if (route.startsWith("/users?")) data = { users: [], total: 0 };
    else if (route === "/logs") data = { logs: [] };
    else if (route === "/settings/open-window")
      data = { openDays: [1, 2], openStart: "07:00", openEnd: "12:00" };
    else
      return Response.json(
        { message: `Unmocked ${method} ${route}` },
        { status: 404 },
      );
    return Response.json(structuredClone(data));
  };
  if (loggedIn) w.sessionStorage.setItem("jwt", "initial-token");
  w.eval(source);
  if (loggedIn)
    await until(
      () => !d.getElementById("app").classList.contains("hidden"),
      "bootstrap failed: " + errors.map((e) => e.message).join(", "),
    );
  const set = (id, value) => {
    d.getElementById(id).value = String(value);
  };
  const change = (id, value) => {
    if (value !== undefined) set(id, value);
    d.getElementById(id).dispatchEvent(
      new w.Event("change", { bubbles: true }),
    );
  };
  const click = (id) => d.getElementById(id).click();
  const idle = () =>
    until(
      () => !d.querySelector("[data-busy]"),
      "an interaction remained busy",
    );
  async function login(username, password = "test-password") {
    set("loginUser", username);
    set("loginPass", password);
    const cancelled = !d
      .getElementById("loginForm")
      .dispatchEvent(
        new w.Event("submit", { bubbles: true, cancelable: true }),
      );
    assert.equal(
      cancelled,
      true,
      "native form navigation must be prevented synchronously",
    );
    await idle();
  }
  async function logout() {
    click("logoutBtn");
    await until(() => d.getElementById("app").classList.contains("hidden"), "logout did not clear the screen");
  }
  return {
    w,
    d,
    model,
    calls,
    alerts,
    errors,
    set,
    change,
    click,
    idle,
    login,
    logout,
  };
}

test("admin bootstrap has unique IDs and one batch request instead of 36 seat requests", async (t) => {
  const c = await client(t);
  const ids = [...c.d.querySelectorAll("[id]")].map((element) => element.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(c.calls.filter((call) => call.route === "/orders").length, 1);
  assert.equal(
    c.calls.filter((call) => /^\/orders\/\d+$/.test(call.route)).length,
    1,
  );
  assert.equal(c.d.querySelectorAll(".seat-card").length, 36);
  assert.equal(c.errors.length, 0);
});

test("login submits using the form; a wrong password remains recoverable", async (t) => {
  const c = await client(t, { loggedIn: false });
  await c.login("admin", "wrong");
  assert.match(c.d.getElementById("loginMsg").textContent, /帳號或密碼不正確/);
  assert.equal(c.d.getElementById("loginBtn").disabled, false);
  await c.login("admin");
  assert.equal(c.d.getElementById("app").classList.contains("hidden"), false);
});

test("editing another menu does not change the active ordering menu until explicitly activated", async (t) => {
  const c = await client(t);
  c.change("menuSelect", 2);
  assert.equal(c.d.getElementById("activeMenuName").textContent, "今日菜單");
  c.click("useMenu");
  await c.idle();
  assert.equal(c.d.getElementById("activeMenuName").textContent, "其他菜單");
});

test("preorder navigation, code add and paid toggle operate on the visible page", async (t) => {
  const c = await client(t);
  c.set("preDate", "2026-10-20");
  c.set("preSeatSelect", 2);
  c.click("tabPreorders");
  await until(() => c.d.querySelector("#preTable .empty-state"));
  c.set("preCodeInput", 1);
  c.set("preQtyInput", 2);
  c.click("preAddByCode");
  await c.idle();
  assert.equal(c.model.preorders.get("2026-10-20:2").items[0].qty, 2);
  assert.match(c.d.querySelector("#preTable tbody").textContent, /雞腿飯/);
  c.d.getElementById("prePaidCheckbox").checked = true;
  c.change("prePaidCheckbox");
  await c.idle();
  await until(() => c.model.preorders.get("2026-10-20:2").paid === true);
});

test("order and preorder names render as literal text rather than injected HTML", async (t) => {
  const name = '<img src=x onerror="window.attacked=1">';
  const item = { id: 1, name, unitPrice: 90, qty: 1 };
  const c = await client(t, { orderItems: [item], preItems: [item] });
  assert.match(c.d.querySelector("#orderTable tbody").textContent, /<img/);
  c.set("preDate", "2026-10-20");
  c.set("preSeatSelect", 2);
  c.click("tabPreorders");
  await until(() =>
    c.d.querySelector("#preTable tbody").textContent.includes("<img"),
  );
  assert.equal(
    c.d.querySelectorAll("#orderTable tbody img, #preTable tbody img").length,
    0,
  );
  assert.equal(c.w.attacked, undefined);
});

test("failed saves can be retried without mutating the stored order or duplicating an item", async (t) => {
  const c = await client(t);
  c.model.failWrites = true;
  c.set("manualName", "測試便當");
  c.set("manualPrice", 90);
  c.set("manualQty", 1);
  c.click("addManual");
  await c.idle();
  assert.equal(c.model.orders.get(1).items.length, 0);
  assert.match(c.d.getElementById("appNotice").textContent, /儲存失敗/);
  c.model.failWrites = false;
  c.click("addManual");
  await c.idle();
  assert.equal(c.model.orders.get(1).items.length, 1);
  assert.equal(c.model.orders.get(1).items[0].name, "測試便當");
});

test("different rapid add actions are serialized and a duplicate click is ignored", async (t) => {
  const c = await client(t);
  c.model.delay = async (_route, method) => {
    if (method === "PUT") await sleep(20);
  };
  c.set("manualName", "湯");
  c.set("manualPrice", 20);
  c.set("manualQty", 1);
  c.set("codeInput", 1);
  c.set("qtyInput", 1);
  c.click("addManual");
  c.click("addManual");
  c.click("addByCode");
  await c.idle();
  assert.equal(c.model.orders.get(1).items.length, 2);
  assert.deepEqual(
    c.model.orders.get(1).items.map((item) => item.name),
    ["湯", "雞腿飯"],
  );
});

test("typing a multi-digit quantity does not save or redraw until the change event", async (t) => {
  const c = await client(t, {
    orderItems: [{ id: 10, name: "便當", unitPrice: 90, qty: 1 }],
  });
  const input = c.d.querySelector("#orderTable .qtyInput");
  input.value = "12";
  input.dispatchEvent(new c.w.Event("input", { bubbles: true }));
  await sleep(20);
  assert.equal(c.calls.filter((call) => call.method === "PUT").length, 0);
  input.dispatchEvent(new c.w.Event("change", { bubbles: true }));
  await until(() => c.model.orders.get(1).items[0].qty === 12);
});

test("a slow old seat response cannot replace the last selected seat", async (t) => {
  const c = await client(t);
  c.model.orders.set(2, {
    seat: 2,
    items: [{ id: 2, name: "第二座", unitPrice: 90, qty: 1 }],
  });
  c.model.orders.set(3, {
    seat: 3,
    items: [{ id: 3, name: "第三座", unitPrice: 80, qty: 1 }],
  });
  c.model.delay = async (route) => {
    if (route === "/orders/2") await sleep(60);
  };
  c.change("seatSelect", 2);
  await sleep(5);
  c.change("seatSelect", 3);
  await sleep(90);
  assert.match(c.d.querySelector("#orderTable tbody").textContent, /第三座/);
  assert.doesNotMatch(
    c.d.querySelector("#orderTable tbody").textContent,
    /第二座/,
  );
});

test("a new account does not inherit admin visibility, seat cache or disabled preorder controls", async (t) => {
  const c = await client(t, {
    orderItems: [{ id: 1, name: "管理員訂單", unitPrice: 100, qty: 1 }],
  });
  await c.logout();
  await c.login("2");
  assert.equal(c.d.getElementById("seatSelect").value, "2");
  assert.equal(c.d.getElementById("seatSelect").disabled, true);
  assert.equal(
    c.d.getElementById("tabReports").classList.contains("hidden"),
    true,
  );
  assert.doesNotMatch(
    c.d.querySelector("#orderTable tbody").textContent,
    /管理員訂單/,
  );
  assert.equal(c.d.getElementById("preDate").value, "2026-10-20");
  assert.equal(c.d.getElementById("preSeatSelect").value, "2");
});

test("a 401 from an earlier session cannot log out a newly signed-in account", async (t) => {
  const c = await client(t);
  const pending = c.w.eval('api("/slow")').catch((error) => error.message);
  await c.logout();
  await c.login("2");
  await pending;
  assert.equal(c.w.sessionStorage.getItem("jwt"), "token-2");
  assert.equal(c.d.getElementById("app").classList.contains("hidden"), false);
});

test("concurrent deduplicated reads return independent objects", async (t) => {
  const c = await client(t);
  const count = c.calls.length;
  const [first, second] = await Promise.all([
    c.w.eval('api("/orders/2")'),
    c.w.eval('api("/orders/2")'),
  ]);
  first.items.push({ name: "draft" });
  assert.equal(second.items.length, 0);
  assert.equal(c.calls.length - count, 1);
});

test("preorders disabled for a normal user are hidden and cannot be opened through navigation", async (t) => {
  const c = await client(t, { role: "user", enabled: false });
  assert.equal(
    c.d.getElementById("tabPreorders").classList.contains("hidden"),
    true,
  );
  c.w.eval('switchTab("preorders")');
  assert.equal(
    c.d.getElementById("pagePreorders").classList.contains("hidden"),
    true,
  );
});

test("an order read started before a successful save cannot poison the newer cache", async (t) => {
  const c = await client(t);
  const fetch = c.w.fetch;
  let delayed = false;
  c.w.fetch = async (url, options) => {
    const response = await fetch(url, options);
    if (!delayed && url.endsWith("/orders/1") && options.method === "GET") {
      delayed = true;
      await sleep(80);
    }
    return response;
  };
  c.change("seatSelect", 1);
  await sleep(5);
  c.set("manualName", "新訂單");
  c.set("manualPrice", 90);
  c.set("manualQty", 1);
  c.click("addManual");
  await c.idle();
  await sleep(90);
  await c.w.eval("renderSeatOrder()");
  assert.match(c.d.querySelector("#orderTable tbody").textContent, /新訂單/);
});

test("logout removes the old account’s order data from the DOM as well as its caches", async (t) => {
  const c = await client(t, {
    orderItems: [{ id: 1, name: "私人訂單內容", unitPrice: 90, qty: 1 }],
  });
  assert.match(c.d.getElementById("app").textContent, /私人訂單內容/);
  await c.logout();
  assert.doesNotMatch(c.d.getElementById("app").textContent, /私人訂單內容/);
});

test("changing one's password clears the revoked login and returns to the login form", async t => {
  const c = await client(t, { role: 'user' });
  c.click('tabUsers');
  await until(() => c.d.getElementById('selfChangeBtn'));
  c.set('selfOldPwd', 'fixture-old-password');
  c.set('selfNewPwd', 'fixture-new-password');
  c.click('selfChangeBtn');
  await until(() => c.d.getElementById('app').classList.contains('hidden'));
  assert.equal(c.w.sessionStorage.getItem('jwt'), null);
  assert.match(c.d.getElementById('loginMsg').textContent, /密碼已更新/);
  assert.ok(c.calls.some(call => call.route === '/users/2/password' && call.method === 'PUT'));
  assert.equal(c.d.getElementById('selfOldPwd'), null);
});

test("manual ordering remains usable by a student while unlocked", async t => {
  const c = await client(t, { role: 'user', manualLocked: false });
  assert.equal(c.d.getElementById('addManual').disabled, false);
  c.set('manualName', '自行輸入便當'); c.set('manualPrice', 88); c.set('manualQty', 1);
  c.click('addManual'); await c.idle();
  assert.match(c.d.querySelector('#orderTable tbody').textContent, /自行輸入便當/);
});

test("the manual lock protects normal and preorder inputs while keeping catalogue ordering available", async t => {
  const manual = { id: 1, name: '自行輸入便當', unitPrice: 88, qty: 1 };
  const c = await client(t, { role: 'user', manualLocked: true, orderItems: [manual], preItems: [manual] });
  assert.equal(c.d.getElementById('addManual').disabled, true);
  assert.equal(c.d.getElementById('addByCode').disabled, false);
  assert.equal(c.d.querySelector('#orderTable .qtyInput').disabled, true);
  assert.equal(c.d.querySelector('#orderTable .delBtn'), null);
  c.click('tabPreorders'); await until(() => c.d.querySelector('#preTable .preQty'));
  assert.equal(c.d.getElementById('preAddManual').disabled, true);
  assert.equal(c.d.getElementById('preAddByCode').disabled, false);
  assert.equal(c.d.querySelector('#preTable .preQty').disabled, true);
  assert.equal(c.d.querySelector('#preTable .preDel'), null);
});

test("an administrator can change the manual lock and remains able to enter manual items", async t => {
  const c = await client(t, { manualLocked: false });
  c.d.getElementById('manualOrderLocked').checked = true;
  c.change('manualOrderLocked');
  await until(() => c.model.manualLocked && !c.d.getElementById('manualOrderLocked').disabled);
  assert.equal(c.d.getElementById('addManual').disabled, false);
  assert.match(c.d.getElementById('manualOrderHint').textContent, /已鎖定/);
});

test("session tokens do not remain in persistent storage and logout asks the server to revoke sessions", async t => {
  const c = await client(t);
  assert.equal(c.w.localStorage.getItem('jwt'), null);
  assert.equal(c.w.sessionStorage.getItem('jwt'), 'initial-token');
  await c.logout();
  assert.equal(c.w.sessionStorage.getItem('jwt'), null);
  assert.ok(c.calls.some(call => call.route === '/auth/logout' && call.method === 'POST'));
});

test("image HTML rejects active URLs, external tracking origins and attribute injection", async t => {
  const c = await client(t);
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'https://attacker.invalid/a.png', 'http://lunch2.onrender.com/a.png', '']) {
    assert.doesNotMatch(c.w.buildImageThumb(url, 'x'), /<img/);
  }
  const markup = c.w.buildImageThumb('https://lunch2.onrender.com/uploads/example.webp', '\" onerror=\"synthetic_canary()');
  const host = c.d.createElement('div'); host.innerHTML = markup;
  assert.equal(host.querySelector('img').hasAttribute('onerror'), false);
});

test("changing preorder dates during a slow request keeps the last chosen date on screen", async (t) => {
  const c = await client(t);
  c.model.preorders.set("2026-10-21:2", {
    seat: 2,
    date: "2026-10-21",
    items: [{ id: 2, name: "二十一日便當", unitPrice: 90, qty: 1 }],
  });
  c.model.delay = async (route) => {
    if (route === "/preorders/2026-10-20/2") await sleep(60);
  };
  c.set("preSeatSelect", 2);
  c.set("preDate", "2026-10-20");
  c.click("tabPreorders");
  await sleep(5);
  c.change("preDate", "2026-10-21");
  await sleep(90);
  assert.match(
    c.d.querySelector("#preTable tbody").textContent,
    /二十一日便當/,
  );
});
