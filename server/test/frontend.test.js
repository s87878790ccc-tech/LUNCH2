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
    username = null,
    users = null,
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
    orderId: seat, version: 0, date: '2026-10-19', batch: 'test-batch',
    submitted: false,
    internalOnly: false,
    paid: false,
    items: [],
  });
  const model = {
    manualLocked,
    users: users || [{ id: 1, username: "admin", role: "admin", status: "active" }, { id: 2, username: "2", role: "user", status: "active" }],
    user:
      role === "admin"
        ? { id: 1, username: "admin", role }
        : { id: 2, username: username || "2", role },
    orders: new Map([
      [1, { ...empty(1), submitted: orderItems.length > 0, items: structuredClone(orderItems) }],
      [2, { ...empty(2), submitted: role === 'user' && orderItems.length > 0, items: structuredClone(role === 'user' ? orderItems : []) }],
    ]),
    preorders: new Map([
      [
        "2026-10-20:2",
        { ...empty(2), batch: null, date: "2026-10-20", submitted: preItems.length > 0, items: structuredClone(preItems) },
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
    failNetwork: false,
    failReads: false,
    paymentConflict: false,
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
    if (model.failNetwork && method === 'PUT') throw new TypeError('offline fixture');
    if (model.failReads && method === 'GET') throw new TypeError('offline fixture');
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
    else if (route === "/seats") data = { seats: [...new Set([...Array.from({ length: 36 }, (_, i) => i+1), ...model.users.map(u => Number(u.username)).filter(n => Number.isSafeInteger(n) && n > 0)])] };
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
        date: '2026-10-19', batch: 'test-batch',
        orders: Array.from(
          { length: Math.max(36, ...model.users.map(u => /^\d+$/.test(u.username) ? Number(u.username) : 0)) },
          (_, i) => model.orders.get(i + 1) || empty(i + 1),
        ),
      };
    else if (/^\/orders\/\d+(?:\/paid)?$/.test(route)) {
      const seat = Number(route.split("/")[2]);
      const order = model.orders.get(seat) || empty(seat);
      if (method === "PUT") {
        if (route.endsWith("/paid")) {
          if (model.paymentConflict || body.version !== order.version || body.orderId !== order.orderId || body.batch !== order.batch || body.date !== order.date)
            return Response.json({ message: '訂單或付款狀態已變更' }, { status: 409 });
          order.paid = body.paid; order.version++;
        }
        else
          Object.assign(order, structuredClone(body), {
            items: body.items.map((item) => ({ ...item, id: ++nextItem })),
            submitted: body.items.length > 0,
          });
        model.orders.set(seat, order);
      }
      data = route.endsWith('/paid') && method === 'PUT' ? { ok: true, order } : order;
    } else if (/^\/preorders\/[^/]+\/\d+(?:\/paid)?$/.test(route)) {
      const [, , date, rawSeat] = route.split("/"),
        seat = Number(rawSeat),
        key = `${date}:${seat}`;
      const order = model.preorders.get(key) || { ...empty(seat), date };
      if (method === "PUT") {
        if (route.endsWith("/paid")) { order.paid = body.paid; order.version++; }
        else
          Object.assign(order, structuredClone(body), {
            items: body.items.map((item) => ({ ...item, id: ++nextItem })),
          });
        model.preorders.set(key, order);
      }
      data = route.endsWith('/paid') && method === 'PUT' ? { ok: true, order } : order;
    } else if (route === "/reports/aggregate")
      data = { items: [], classTotal: 0 };
    else if (route === "/reports/missing") data = { missing: [] };
    else if (route === "/reports/unpaid" || route.endsWith("/unpaid"))
      data = { list: [] };
    else if (route.startsWith("/users?")) {
      if (model.usersResponse) return model.usersResponse(route);
      const params = new URLSearchParams(route.split('?')[1]);
      const page = Number(params.get('page') || 1), afterId = Number(params.get('afterId') || 0);
      data = { users: params.has('afterId') ? model.users.filter(u => u.id > afterId).slice(0,100) : model.users.slice((page-1)*100,page*100), total: model.users.length };
    } else if (route === '/users' && method === 'POST') {
      if (model.userCreateError) return Response.json({ message: '測試新增失敗' }, { status: 500 });
      if (model.users.some(u => u.username === body.username)) return Response.json({ message: '此帳號已存在' }, { status: 409 });
      data = { id: Math.max(...model.users.map(u => u.id),0)+1, username: body.username, role: body.role, status: 'active' };
      model.users.push(data);
      if (model.userCreateLostResponse) throw new TypeError('lost response');
    }
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

const lunchItem = { id: 10, name: '雞腿飯', unitPrice: 95, qty: 2 };
const paidControl = (c, seat = 1) => c.d.getElementById(`seat-paid-${seat}`);
const togglePayment = (c, value, seat = 1) => {
  const input = paidControl(c, seat);
  input.checked = value;
  input.dispatchEvent(new c.w.Event('change', { bubbles: true }));
};

test('overview checkboxes persist payment, reverse it, update totals and survive a new read', async t => {
  const c = await client(t, { orderItems: [lunchItem] });
  assert.equal(paidControl(c, 2).disabled, true);
  assert.match(paidControl(c, 2).closest('label').textContent, /未訂餐/);
  togglePayment(c, true);
  await until(() => c.model.orders.get(1).paid && !paidControl(c).disabled);
  assert.equal(paidControl(c).checked, true);
  assert.match(c.d.getElementById('paymentSummary').textContent, /NT\$ 190/);
  assert.equal(c.calls.filter(call => call.route === '/orders/1/paid' && call.method === 'PUT').length, 1);
  c.click('refreshAllSeats'); await c.idle();
  assert.equal(paidControl(c).checked, true);
  togglePayment(c, false);
  await until(() => !c.model.orders.get(1).paid && !paidControl(c).disabled);
  assert.equal(paidControl(c).checked, false);
  assert.match(paidControl(c).closest('label').textContent, /未付款/);
});

test('a failed payment save rolls back the checkbox and displays the server state', async t => {
  const c = await client(t, { orderItems: [lunchItem] });
  c.model.failWrites = true;
  togglePayment(c, true);
  await until(() => /已載入伺服器最新狀態/.test(c.d.getElementById('appNotice').textContent));
  assert.equal(c.model.orders.get(1).paid, false);
  assert.equal(paidControl(c).checked, false);
  assert.equal(paidControl(c).disabled, false);
  assert.ok(c.d.getElementById('appNotice').classList.contains('error'));
});

test('offline payment results stay blocked until a successful refresh', async t => {
  const c = await client(t, { orderItems: [lunchItem] });
  c.model.failNetwork = true; c.model.failReads = true;
  togglePayment(c, true);
  await until(() => /儲存結果未確認/.test(c.d.getElementById('appNotice').textContent));
  assert.equal(paidControl(c).checked, false);
  assert.equal(paidControl(c).disabled, true);
  c.model.failNetwork = false; c.model.failReads = false;
  c.click('refreshAllSeats'); await c.idle();
  assert.equal(paidControl(c).disabled, false);
});

test('a lost response after commit is reconciled without sending another payment write', async t => {
  const c = await client(t, { orderItems: [lunchItem] });
  const base = c.w.fetch;
  c.w.fetch = async (url, options = {}) => {
    const response = await base(url, options);
    if (url.endsWith('/orders/1/paid') && options.method === 'PUT') throw new TypeError('fixture response lost');
    return response;
  };
  togglePayment(c, true);
  await until(() => /已載入伺服器最新狀態/.test(c.d.getElementById('appNotice').textContent));
  assert.equal(paidControl(c).checked, true);
  assert.equal(c.calls.filter(call => call.route === '/orders/1/paid' && call.method === 'PUT').length, 1);
});

test('rapid repeated changes send one write and keep other seats independently usable', async t => {
  const c = await client(t, { orderItems: [lunchItem] });
  c.model.orders.set(2, { ...c.model.orders.get(1), seat: 2, orderId: 2 });
  c.click('refreshAllSeats'); await c.idle();
  c.model.delay = async (route, method) => { if (route.endsWith('/paid') && method === 'PUT') await sleep(60); };
  togglePayment(c, true);
  await until(() => paidControl(c).disabled);
  assert.match(paidControl(c).closest('label').textContent, /儲存中/);
  togglePayment(c, false);
  togglePayment(c, true, 2);
  await until(() => c.model.orders.get(1).paid && c.model.orders.get(2).paid && !paidControl(c).disabled && !paidControl(c, 2).disabled);
  assert.equal(c.calls.filter(call => call.route === '/orders/1/paid' && call.method === 'PUT').length, 1);
});

test('a stale administrator sees the current payment state after a conflict', async t => {
  const c = await client(t, { orderItems: [lunchItem] });
  c.model.orders.get(1).paid = true; c.model.orders.get(1).version++;
  togglePayment(c, true);
  await until(() => /已載入伺服器最新狀態/.test(c.d.getElementById('appNotice').textContent));
  assert.equal(paidControl(c).checked, true);
  assert.ok(c.d.getElementById('appNotice').classList.contains('error'));
});

test('students have no overview payment controls', async t => {
  const c = await client(t, { role: 'user', orderItems: [lunchItem] });
  assert.ok(c.d.getElementById('adminAllSeats').classList.contains('hidden'));
  assert.equal(c.d.querySelectorAll('.payment-control input').length, 0);
});

async function openUsers(c) {
  c.click('tabUsers');
  await until(() => /已同步/.test(c.d.getElementById('usersLoadStatus').textContent));
}
function enterUser(c, username = '37', password = 'abcdef', role = 'user') {
  c.set('newUserName', username); c.set('newUserPass', password); c.change('newUserRole', role);
}

test('creating a six-character account immediately refreshes the real list, count and seat selectors', async t => {
  const c = await client(t); await openUsers(c);
  enterUser(c); c.click('createUserBtn'); c.click('createUserBtn'); await c.idle();
  assert.equal(c.calls.filter(x => x.route === '/users' && x.method === 'POST').length, 1);
  assert.equal(c.model.users.filter(u => u.username === '37').length, 1);
  assert.match(c.d.getElementById('usersListTitle').textContent, /共 3 筆/);
  assert.match(c.d.getElementById('createUserStatus').textContent, /已建立.*37.*下方清單/);
  assert.ok([...c.d.getElementById('usersTableBody').rows].some(row => row.textContent.includes('37')));
  assert.ok([...c.d.getElementById('seatSelect').options].some(o => o.value === '37'));
  assert.ok([...c.d.getElementById('preSeatSelect').options].some(o => o.value === '37'));
  assert.ok(c.d.getElementById('seat-card-37'));
  c.click('tabOrders'); c.click('tabUsers'); await until(() => /已同步/.test(c.d.getElementById('usersLoadStatus').textContent));
  assert.match(c.d.getElementById('usersTableBody').textContent, /37/);
});

test('creation respects existing filters and tells the administrator where the new account is', async t => {
  const c = await client(t); await openUsers(c);
  c.change('userRoleFilter', 'admin'); c.set('userSearch', 'admin');
  c.d.getElementById('userSearch').dispatchEvent(new c.w.Event('input', { bubbles: true }));
  enterUser(c); c.click('createUserBtn'); await c.idle();
  assert.equal(c.d.getElementById('userRoleFilter').value, 'admin');
  assert.equal(c.d.getElementById('userSearch').value, 'admin');
  assert.match(c.d.getElementById('createUserStatus').textContent, /目前篩選條件未包含/);
  assert.match(c.d.getElementById('usersListTitle').textContent, /顯示 1.*共 3/);
  c.set('userSearch', '37'); c.change('userRoleFilter', 'user');
  assert.match(c.d.getElementById('usersTableBody').textContent, /37/);
});

test('a delayed old list response cannot overwrite the post-create list', async t => {
  const c = await client(t);
  let release, requested = false, reads = 0;
  const gate = new Promise(resolve => { release = resolve; });
  c.model.usersResponse = async () => {
    const snapshot = structuredClone(c.model.users);
    if (++reads === 1) { requested = true; await gate; }
    return Response.json({ users: snapshot, total: snapshot.length });
  };
  c.click('tabUsers'); await until(() => requested);
  enterUser(c); c.click('createUserBtn'); await c.idle();
  assert.match(c.d.getElementById('usersTableBody').textContent, /37/);
  release(); await sleep(30);
  assert.match(c.d.getElementById('usersTableBody').textContent, /37/);
  assert.match(c.d.getElementById('usersListTitle').textContent, /共 3/);
});

test('a committed creation with a failed list refresh is identified separately and can be refreshed', async t => {
  const c = await client(t); await openUsers(c);
  c.model.usersResponse = () => { throw new TypeError('list unavailable'); };
  enterUser(c); c.click('createUserBtn'); await c.idle();
  assert.equal(c.model.users.length, 3);
  assert.match(c.d.getElementById('createUserStatus').textContent, /已建立，但清單尚未同步/);
  assert.doesNotMatch(c.d.getElementById('createUserStatus').textContent, /建立失敗/);
  c.model.usersResponse = null; c.click('refreshUsers'); await c.idle();
  assert.match(c.d.getElementById('usersTableBody').textContent, /37/);
});

test('failed and lost create responses preserve form values and never invent a successful row', async t => {
  const c = await client(t); await openUsers(c);
  c.model.userCreateError = true;
  enterUser(c); c.click('createUserBtn'); await c.idle();
  assert.equal(c.model.users.length, 2);
  assert.equal(c.d.getElementById('newUserName').value, '37');
  assert.equal(c.d.getElementById('newUserPass').value, 'abcdef');
  assert.match(c.d.getElementById('createUserStatus').textContent, /結果尚未確認/);
  assert.equal(c.d.querySelectorAll('.user-created').length, 0);
  c.model.userCreateError = false; c.model.userCreateLostResponse = true;
  c.click('createUserBtn'); await c.idle();
  assert.equal(c.model.users.length, 3);
  assert.match(c.d.getElementById('createUserStatus').textContent, /結果尚未確認/);
  assert.match(c.d.getElementById('usersTableBody').textContent, /37/);
});

test('the full list spans more than one page and keeps disabled accounts visible under their filter', async t => {
  const users = Array.from({ length: 105 }, (_, n) => ({ id: n+1, username: `account-${n}`, role: n === 0 ? 'admin' : 'user', status: n % 2 ? 'disabled' : 'active' }));
  const c = await client(t, { users }); await openUsers(c);
  assert.match(c.d.getElementById('usersListTitle').textContent, /共 105/);
  assert.equal(c.d.getElementById('usersTableBody').rows.length, 105);
  c.change('userStatusFilter', 'disabled');
  assert.equal(c.d.getElementById('usersTableBody').rows.length, 52);
});

test('password prompts and validation agree for ordinary and administrator accounts', async t => {
  const c = await client(t); await openUsers(c);
  enterUser(c, '37', 'abcde'); c.click('createUserBtn'); await c.idle();
  assert.match(c.d.getElementById('createUserStatus').textContent, /6 個字元/);
  assert.equal(c.calls.filter(x => x.route === '/users' && x.method === 'POST').length, 0);
  c.change('newUserRole', 'admin');
  assert.match(c.d.getElementById('newUserPasswordHint').textContent, /管理員.*12 個字元/);
  enterUser(c, 'other-admin', 'abcdef', 'admin'); c.click('createUserBtn'); await c.idle();
  assert.match(c.d.getElementById('createUserStatus').textContent, /12 個字元/);
  assert.equal(c.d.getElementById('reset_2').minLength, 6);
  assert.equal(c.d.getElementById('reset_1').minLength, 12);
});

test('new numeric users can use their own dynamic seat without choosing another seat', async t => {
  const c = await client(t, { role: 'user', username: '37', users: [{ id: 1, username: 'admin', role: 'admin', status: 'active' }, { id: 2, username: '37', role: 'user', status: 'active' }] });
  assert.equal(c.d.getElementById('seatSelect').value, '37');
  assert.equal(c.d.getElementById('seatSelect').disabled, true);
  assert.equal(c.d.getElementById('preSeatSelect').value, '37');
  c.set('codeInput', 1); c.click('addByCode'); await c.idle();
  assert.ok(c.calls.some(call => call.route === '/orders/37' && call.method === 'PUT'));
});
