'use strict';
// Synthetic credentials and intercepted fetches only; never contacts a server.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '../../docs/index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../../docs/app.js'), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(check) {
  for (let n = 0; n < 150; n++) { if (check()) return; await tick(); }
  assert.fail('synthetic credential UI did not settle');
}
function fixture(t, { restricted = false, role = 'user', loggedIn = true } = {}) {
  const errors = [], calls = [], timers = [];
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, { url: 'https://lunch2.onrender.com/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  w.structuredClone = structuredClone; w.alert = () => {}; w.confirm = () => true; w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.setInterval = callback => { timers.push(callback); return timers.length; };
  const user = { id: role === 'admin' ? 1 : 2, username: role === 'admin' ? 'synthetic-admin' : '2', role, mustChangePassword: restricted };
  const users = [{ id: 1, username: 'synthetic-admin', role: 'admin', status: 'active' }, { id: 2, username: '2', role: 'user', status: 'active' }];
  const temporary = 'synthetic-only-one-time-credential';
  const empty = seat => ({ orderId: null, version: 0, seat, date: '2026-10-20', batch: 'synthetic-batch', items: [], submitted: false, paid: false, internalOnly: false });
  w.fetch = async (url, options = {}) => {
    const route = url.replace('https://lunch2.onrender.com/api', ''), method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ route, method, body });
    if (route === '/auth/me') return Response.json({ user });
    if (route === '/auth/login') return Response.json({ token: 'synthetic-only-session', user });
    if (route === '/auth/logout') return Response.json({ ok: true });
    if (method === 'POST' && route === '/users') {
      const created = { id: 37, username: body.username, role: body.role, status: 'active', mustChangePassword: true };
      users.push(created); return Response.json({ ...created, initialPassword: temporary });
    }
    if (route.startsWith('/users?')) return Response.json({ users, total: users.length });
    if (method === 'PUT' && /\/users\/\d+\/password$/.test(route)) return Response.json(body.resetTemporary ? { ok: true, initialPassword: temporary, mustChangePassword: true } : { ok: true });
    if (method === 'PATCH' && /\/users\/\d+\/role$/.test(route)) { users.find(u => u.id === Number(route.split('/')[2])).role = body.role; return Response.json({ ok: true }); }
    if (route === '/seats') return Response.json({ seats: [1, 2, 37] });
    if (route === '/orders') return Response.json({ date: '2026-10-20', batch: 'synthetic-batch', orders: [1, 2, 37].map(empty) });
    if (/^\/orders\/\d+$/.test(route)) return Response.json(empty(Number(route.split('/')[2])));
    if (route === '/settings/preorder') return Response.json({ enabled: false, dates: [] });
    if (route === '/open-status') return Response.json({ open: true });
    if (route === '/menus') return Response.json({ menus: [], activeMenuId: null });
    if (route === '/settings/manual-order') return Response.json({ locked: true });
    if (route.startsWith('/reports/')) return Response.json({ rows: [], missing: [], list: [], classTotal: 0 });
    throw new Error('Unexpected synthetic route: ' + method + ' ' + route);
  };
  if (loggedIn) w.sessionStorage.setItem('jwt', 'synthetic-only-session');
  w.eval(source + `\nwindow.credentialTest = { closeCredentialDialog, openCredentialAction, showInitialCredential, loadUsers, refreshVisibleView, snapshot: () => JSON.stringify(usersView), startAdmin: () => { token = 'synthetic-only-session'; onLoginUser({id:1,username:'synthetic-admin',role:'admin'}); }, startUser: () => { token = 'synthetic-only-session'; onLoginUser({id:2,username:'2',role:'user'}); } };`);
  return { w, d, calls, errors, user, users, timers, temporary, dom };
}
function submit(w, form) { form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); }

test('restricted stored session and timer refresh never load business data before personal password setup', async t => {
  const f = fixture(t, { restricted: true });
  await until(() => !f.d.getElementById('passwordChangeLayer').classList.contains('hidden'));
  assert.deepEqual(f.calls.map(c => c.route), ['/auth/me']);
  assert.equal(f.d.getElementById('app').classList.contains('hidden'), true);
  assert.equal(f.d.getElementById('app').inert, true);
  for (const callback of f.timers) callback();
  await tick(); assert.deepEqual(f.calls.map(c => c.route), ['/auth/me']);
  f.d.getElementById('initialOldPassword').value = 'synthetic-only-temporary';
  f.d.getElementById('initialNewPassword').value = 'abcde';
  f.d.getElementById('initialConfirmPassword').value = 'abcde';
  submit(f.w, f.d.getElementById('initialPasswordForm'));
  await until(() => f.d.getElementById('initialPasswordStatus').textContent.includes('6 個字元'));
  assert.equal(f.calls.some(c => c.method === 'PUT'), false);
  f.d.getElementById('initialNewPassword').value = 'uvwxyz';
  f.d.getElementById('initialConfirmPassword').value = 'uvwxyz';
  submit(f.w, f.d.getElementById('initialPasswordForm'));
  await until(() => f.d.getElementById('loginMsg').textContent.includes('個人密碼已設定'));
  const change = f.calls.find(c => c.method === 'PUT');
  assert.equal(change.route, '/users/2/password');
  assert.equal(Object.hasOwn(change.body, 'oldPassword'), true);
  assert.equal(change.body.newPassword.length, 6);
  assert.equal(f.w.sessionStorage.getItem('jwt'), null);
  for (const id of ['initialOldPassword', 'initialNewPassword', 'initialConfirmPassword', 'loginPass']) assert.equal(f.d.getElementById(id).value, '');
  assert.deepEqual(f.errors, []);
});

test('fresh temporary login clears login password and gates before any ordering API', async t => {
  const f = fixture(t, { restricted: true, loggedIn: false });
  f.d.getElementById('loginUser').value = '2'; f.d.getElementById('loginPass').value = 'synthetic-only-temporary';
  submit(f.w, f.d.getElementById('loginForm'));
  await until(() => !f.d.getElementById('passwordChangeLayer').classList.contains('hidden'));
  assert.deepEqual(f.calls.map(c => c.route), ['/auth/login']);
  assert.equal(f.d.getElementById('loginPass').value, '');
  f.d.getElementById('initialPasswordLogout').click();
  await until(() => f.w.sessionStorage.getItem('jwt') === null);
  assert.equal(f.d.getElementById('passwordChangeLayer').classList.contains('hidden'), true);
});

test('new account sends no chosen password and temporary credential is masked once without client-state persistence', async t => {
  const f = fixture(t, { role: 'admin', loggedIn: false });
  f.w.credentialTest.startAdmin();
  f.d.getElementById('newUserName').value = '37';
  f.d.getElementById('createUserBtn').click();
  await until(() => f.d.getElementById('initialCredentialValue').value.length > 0);
  await until(() => !f.d.getElementById('createUserBtn').disabled);
  const created = f.calls.find(c => c.method === 'POST' && c.route === '/users');
  assert.deepEqual(Object.keys(created.body).sort(), ['role', 'username']);
  assert.equal(f.d.getElementById('initialCredentialValue').type, 'password');
  assert.equal(f.d.getElementById('initialCredentialValue').value, f.temporary);
  assert.equal(f.d.getElementById('initialCredentialValue').getAttribute('value'), null);
  assert.equal(f.w.credentialTest.snapshot().includes(f.temporary), false);
  assert.equal(JSON.stringify(f.w.sessionStorage).includes(f.temporary), false);
  assert.equal(JSON.stringify(f.w.localStorage).includes(f.temporary), false);
  assert.equal(f.w.location.href.includes(f.temporary), false);
  f.d.getElementById('credentialReveal').click(); await until(() => f.d.getElementById('initialCredentialValue').type === 'text');
  f.d.getElementById('credentialClose').click();
  await until(() => !f.d.getElementById('credentialDialog').open);
  assert.equal(f.d.getElementById('initialCredentialValue').value, '');
  assert.equal(f.d.getElementById('initialCredentialValue').type, 'password');
  assert.equal(f.d.getElementById('credentialDialog').open, false);
  assert.deepEqual(f.errors, []);
});

test('administrator reset requests independent temporary credentials and clears actor password from form', async t => {
  const f = fixture(t, { role: 'admin', loggedIn: false });
  f.w.credentialTest.startAdmin();
  await f.w.credentialTest.loadUsers();
  f.d.querySelector('.resetPwd[data-id="2"]').click();
  await until(() => f.d.getElementById('credentialDialog').open);
  f.d.getElementById('credentialActorPassword').value = 'synthetic-only-actor-password';
  submit(f.w, f.d.getElementById('credentialActionForm'));
  await until(() => f.d.getElementById('initialCredentialValue').value.length > 0);
  const reset = f.calls.find(c => c.method === 'PUT');
  assert.equal(reset.body.resetTemporary, true); assert.equal(Object.hasOwn(reset.body, 'newPassword'), false);
  assert.equal(f.d.getElementById('credentialActorPassword').value, '');
  f.w.eval('clearSession();');
  assert.equal(f.d.getElementById('initialCredentialValue').value, '');
  assert.equal(f.d.getElementById('credentialDialog').open, false);
});

test('promotion UI requires actor reauthentication and new admin policy without changing ordinary six-character policy', async t => {
  const f = fixture(t, { role: 'admin', loggedIn: false });
  f.w.credentialTest.startAdmin();
  await f.w.credentialTest.loadUsers();
  f.d.querySelector('.changeRole[data-id="2"]').click();
  await until(() => f.d.getElementById('credentialDialog').open);
  f.d.getElementById('credentialActorPassword').value = 'synthetic-only-actor-password';
  f.d.getElementById('credentialNewPassword').value = 'abcdef'; f.d.getElementById('credentialConfirmPassword').value = 'abcdef';
  submit(f.w, f.d.getElementById('credentialActionForm'));
  await until(() => f.d.getElementById('credentialDialogStatus').textContent.includes('12 個字元'));
  assert.equal(f.calls.some(c => c.method === 'PATCH'), false);
  f.d.getElementById('credentialNewPassword').value = 'synthetic-only-new-admin';
  f.d.getElementById('credentialConfirmPassword').value = 'synthetic-only-new-admin';
  submit(f.w, f.d.getElementById('credentialActionForm'));
  await until(() => f.calls.some(c => c.method === 'PATCH'));
  await until(() => !f.d.getElementById('credentialDialog').open);
  const promotion = f.calls.find(c => c.method === 'PATCH');
  assert.deepEqual(Object.keys(promotion.body).sort(), ['actorPassword', 'newPassword', 'role']);
  assert.equal(promotion.body.role, 'admin');
  assert.equal(f.w.eval("accountPasswordError('abcdef','user')"), '');
  assert.equal(f.d.getElementById('credentialActorPassword').value, '');
  assert.equal(f.d.getElementById('credentialNewPassword').value, '');
  assert.deepEqual(f.errors, []);
});


test('existing ordinary user can voluntarily change a six-character password from the account bar', async t => {
  const f = fixture(t, { loggedIn: false });
  f.w.credentialTest.startUser();
  assert.equal(f.d.getElementById('changeMyPasswordBtn').classList.contains('hidden'), false);
  f.d.getElementById('changeMyPasswordBtn').click();
  await until(() => f.d.getElementById('credentialDialog').open);
  f.d.getElementById('credentialActorPassword').value = 'synthetic-only-current';
  f.d.getElementById('credentialNewPassword').value = 'uvwxyz';
  f.d.getElementById('credentialConfirmPassword').value = 'uvwxyz';
  submit(f.w, f.d.getElementById('credentialActionForm'));
  await until(() => f.d.getElementById('loginMsg').textContent.includes('密碼已更新'));
  const change = f.calls.find(c => c.method === 'PUT');
  assert.equal(change.route, '/users/2/password');
  assert.equal(change.body.newPassword.length, 6);
  assert.equal(Object.hasOwn(change.body, 'oldPassword'), true);
  assert.equal(f.calls.some(c => c.route.startsWith('/users?') || c.method === 'PATCH'), false);
  assert.equal(f.w.sessionStorage.getItem('jwt'), null);
  assert.equal(f.d.getElementById('credentialActorPassword').value, '');
  assert.equal(f.d.getElementById('credentialNewPassword').value, '');
  assert.deepEqual(f.errors, []);
});


test('creating an administrator requires current administrator reauthentication and never sends a chosen initial password', async t => {
  const f = fixture(t, { role: 'admin', loggedIn: false });
  f.w.credentialTest.startAdmin();
  f.d.getElementById('newUserName').value = 'synthetic-new-admin';
  f.d.getElementById('newUserRole').value = 'admin';
  f.d.getElementById('newUserRole').dispatchEvent(new f.w.Event('change', { bubbles: true }));
  assert.equal(f.d.getElementById('newAdminActorPasswordFields').classList.contains('hidden'), false);
  assert.equal(f.d.getElementById('newAdminActorPassword').required, true);
  f.d.getElementById('createUserBtn').click();
  await until(() => f.d.getElementById('createUserStatus').textContent.includes('目前管理員密碼'));
  assert.equal(f.calls.some(c => c.method === 'POST' && c.route === '/users'), false);
  f.d.getElementById('newAdminActorPassword').value = 'synthetic-only-actor-password';
  f.d.getElementById('createUserBtn').click();
  await until(() => f.d.getElementById('initialCredentialValue').value.length > 0);
  await until(() => !f.d.getElementById('createUserBtn').disabled);
  const created = f.calls.find(c => c.method === 'POST' && c.route === '/users');
  assert.deepEqual(Object.keys(created.body).sort(), ['actorPassword', 'role', 'username']);
  assert.equal(created.body.role, 'admin');
  assert.equal(Object.hasOwn(created.body, 'password'), false);
  assert.equal(f.d.getElementById('newAdminActorPassword').value, '');
  f.d.getElementById('credentialClose').click();
  await until(() => !f.d.getElementById('credentialDialog').open);
  f.d.getElementById('newAdminActorPassword').value = 'synthetic-only-unsent-draft';
  f.d.getElementById('newUserRole').value = 'user';
  f.d.getElementById('newUserRole').dispatchEvent(new f.w.Event('change', { bubbles: true }));
  assert.equal(f.d.getElementById('newAdminActorPassword').value, '');
  assert.equal(f.d.getElementById('newAdminActorPassword').required, false);
  assert.equal(f.d.getElementById('newAdminActorPasswordFields').classList.contains('hidden'), true);
  assert.deepEqual(f.errors, []);
});
