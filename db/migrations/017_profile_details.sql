-- 017: staff fill in their own details when they accept an invite.
alter table profiles
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists emergency_contact text;
