'use strict';

const { randomUUID } = require('node:crypto');
const { badRequest, validDate } = require('./validation');

function businessDate(timeZone = 'Asia/Taipei', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const conflict = () => Object.assign(new Error('訂單或付款狀態已變更，已重新載入，請確認後再操作。'), { status: 409 });

// Call inside a transaction before locking an order. A shared settings lock
// allows different seats to save concurrently, while a new batch waits for them.
async function currentContext(client, timeZone = 'Asia/Taipei') {
  const date = businessDate(timeZone);
  await client.query('update settings set order_date=$1, order_batch=$2 where id=1 and order_date<>$1', [date, randomUUID()]);
  const { rows } = await client.query('select order_date::text as date, order_batch as batch from settings where id=1 for share');
  if (!rows[0]) throw new Error('Missing order context');
  return rows[0];
}

function orderJSON(order, items, seat, context) {
  return {
    orderId: order?.id ?? null, version: order?.revision ?? 0,
    date: context.date, batch: context.batch ?? null, seat,
    submitted: !!order?.submitted, internalOnly: !!order?.internal_only,
    paid: !!order?.paid && items.length > 0,
    paymentUpdatedAt: order?.payment_updated_at ? new Date(order.payment_updated_at).toISOString() : null,
    paymentUpdatedBy: order?.payment_updated_by ?? null,
    items: items.map(item => ({
      id: item.id, name: item.name, unitPrice: item.unit_price, qty: item.qty,
      updatedAt: item.updated_at ? new Date(item.updated_at).toISOString() : null,
    })),
  };
}

// Join reads keep versions, paid flags and amounts in one database snapshot.
function joinedOrders(rows) {
  const result = new Map();
  for (const row of rows) {
    if (!result.has(row.seat)) result.set(row.seat, { order: row, items: [] });
    if (row.line_id != null) result.get(row.seat).items.push({
      id: row.line_id, name: row.line_name, unit_price: row.line_price, qty: row.line_qty, updated_at: row.line_updated_at,
    });
  }
  return result;
}

function assertReference(body, order, context, required = true) {
  if (!required && body.version === undefined && body.orderId === undefined && body.batch === undefined) return;
  if (!Number.isInteger(body.version) || body.version < 0 || !validDate(body.date) ||
      (body.orderId !== null && (!Number.isInteger(body.orderId) || body.orderId < 1))) {
    throw badRequest('缺少有效的訂單版本，請重新載入後操作。');
  }
  if (body.orderId !== (order?.id ?? null) || body.version !== (order?.revision ?? 0) ||
      body.date !== context.date || (body.batch ?? null) !== (context.batch ?? null)) throw conflict();
}

function contentChanged(order, previous, items, internalOnly) {
  const lines = rows => rows.map(row => JSON.stringify([row.name, Number(row.unitPrice ?? row.unit_price), Number(row.qty)])).sort();
  return !!order.internal_only !== internalOnly || JSON.stringify(lines(previous)) !== JSON.stringify(lines(items));
}

async function updatePayment(client, { order, items, context, body, userId, preorder = false }) {
  if (typeof body.paid !== 'boolean') throw badRequest('paid 必須是布林值');
  if (!order || !order.submitted || !items.length) {
    throw Object.assign(new Error('此座號未訂餐，無法標記付款。'), { status: 409 });
  }
  assertReference(body, order, context);
  const table = preorder ? 'preorders' : 'orders';
  const { rows } = await client.query(
    `update ${table} set paid=$1, revision=revision+1, payment_updated_at=now(), payment_updated_by=$2, updated_at=now()
     where id=$3 and revision=$4 returning *`,
    [body.paid, userId, order.id, body.version],
  );
  if (!rows[0]) throw conflict();
  return orderJSON(rows[0], items, order.seat, context);
}

module.exports = { businessDate, currentContext, orderJSON, joinedOrders, assertReference, contentChanged, updatePayment, conflict };
