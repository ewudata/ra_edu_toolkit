create extension if not exists pgcrypto;

create table if not exists public.user_datasets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    database_name text not null,
    source_type text not null default 'user' check (source_type in ('default', 'user')),
    bucket_name text not null default 'ra-user-datasets',
    object_prefix text not null default '',
    is_default boolean not null default false,
    hidden boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, database_name)
);

alter table public.user_datasets add column if not exists source_type text;
alter table public.user_datasets add column if not exists bucket_name text;
alter table public.user_datasets add column if not exists object_prefix text;
alter table public.user_datasets add column if not exists hidden boolean not null default false;
alter table public.user_datasets alter column source_type set default 'user';
alter table public.user_datasets alter column bucket_name set default 'ra-user-datasets';
alter table public.user_datasets alter column object_prefix set default '';

update public.user_datasets
set source_type = case when is_default then 'default' else 'user' end
where source_type is null;

update public.user_datasets
set bucket_name = 'ra-user-datasets'
where bucket_name is null or bucket_name = '';

update public.user_datasets
set object_prefix = user_id::text || '/' || database_name
where object_prefix is null or object_prefix = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_datasets_source_type_check'
  ) then
    alter table public.user_datasets
      add constraint user_datasets_source_type_check
      check (source_type in ('default', 'user'));
  end if;
end $$;

create table if not exists public.default_datasets (
    id uuid primary key default gen_random_uuid(),
    dataset_name text not null unique,
    bucket_name text not null,
    object_prefix text not null,
    enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists user_datasets_user_idx
    on public.user_datasets (user_id, database_name);

create index if not exists user_datasets_lookup_idx
    on public.user_datasets (user_id, source_type, hidden);

create index if not exists default_datasets_enabled_idx
    on public.default_datasets (enabled, dataset_name);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_datasets_updated_at on public.user_datasets;
create trigger trg_user_datasets_updated_at
before update on public.user_datasets
for each row execute function public.set_updated_at();

drop trigger if exists trg_default_datasets_updated_at on public.default_datasets;
create trigger trg_default_datasets_updated_at
before update on public.default_datasets
for each row execute function public.set_updated_at();

alter table public.user_datasets enable row level security;
alter table public.default_datasets enable row level security;

drop policy if exists "user_datasets_select_own" on public.user_datasets;
create policy "user_datasets_select_own"
on public.user_datasets
for select
using (auth.uid() = user_id);

drop policy if exists "user_datasets_insert_own" on public.user_datasets;
create policy "user_datasets_insert_own"
on public.user_datasets
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_datasets_update_own" on public.user_datasets;
create policy "user_datasets_update_own"
on public.user_datasets
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_datasets_delete_own" on public.user_datasets;
create policy "user_datasets_delete_own"
on public.user_datasets
for delete
using (auth.uid() = user_id);

drop policy if exists "default_datasets_read_auth" on public.default_datasets;
create policy "default_datasets_read_auth"
on public.default_datasets
for select
to authenticated
using (enabled = true);
