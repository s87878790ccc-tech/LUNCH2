-- Additive only. Existing users retain passwords, roles, authentication
-- versions and access until an operator explicitly rotates one account.
-- New accounts are marked true by the authenticated application API.
alter table public.users
  add column if not exists must_change_password boolean not null default false;

comment on column public.users.must_change_password is
  'Application-enforced credential setup gate; false preserves existing accounts; no plaintext credentials are stored';

-- No policies, grants, functions or existing credential values are changed.
