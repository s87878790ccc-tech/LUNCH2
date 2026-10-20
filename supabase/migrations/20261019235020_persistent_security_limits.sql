-- Additive: no change to accounts, orders, or payment data.
create schema if not exists lunch_security;
revoke all on schema lunch_security from public, anon, authenticated;
create table lunch_security.rate_limits (
  bucket text primary key,
  hits integer not null check (hits >= 0),
  expires_at timestamptz not null
);
create index rate_limits_expiry_idx on lunch_security.rate_limits(expires_at);
alter table lunch_security.rate_limits enable row level security;
revoke all on lunch_security.rate_limits from public, anon, authenticated;
comment on table lunch_security.rate_limits is 'Server-only HMAC rate counters; bounded expiry cleanup; no raw identities';

-- Future application-owned public tables/sequences must be explicitly granted. Existing
-- privileges and Supabase-managed owners are unchanged; no new allow policies.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
-- Future application RPC functions must explicitly revoke PUBLIC EXECUTE;
-- per-schema defaults cannot override PostgreSQL global function defaults.
