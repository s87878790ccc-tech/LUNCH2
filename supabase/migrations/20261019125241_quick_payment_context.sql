-- Existing rows stay in the initial batch, with their IDs, items and paid flags
-- intact. Later dates / rounds create new rows instead of erasing old records.
alter table public.settings
  add column if not exists order_date date not null default ((now() at time zone 'Asia/Taipei')::date),
  add column if not exists order_batch text not null default 'legacy';

alter table public.orders
  add column if not exists order_date date not null default ((now() at time zone 'Asia/Taipei')::date),
  add column if not exists order_batch text not null default 'legacy',
  add column if not exists revision integer not null default 0,
  add column if not exists payment_updated_at timestamptz,
  add column if not exists payment_updated_by integer references public.users(id) on delete set null;

create unique index if not exists orders_context_seat_key on public.orders(order_date, order_batch, seat);
alter table public.orders drop constraint if exists orders_seat_key;

alter table public.preorders
  add column if not exists revision integer not null default 0,
  add column if not exists payment_updated_at timestamptz,
  add column if not exists payment_updated_by integer references public.users(id) on delete set null;

-- Existing RLS and grants are preserved. Application access remains through the
-- authenticated Express API; no client policies or privileges are added.
