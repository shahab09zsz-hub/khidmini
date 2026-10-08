-- Khidmini database schema for Supabase
-- Run this file in Supabase SQL Editor on a new project.
create extension if not exists pgcrypto;

create type public.account_role as enum ('customer', 'provider', 'admin');
create type public.request_status as enum ('pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.account_role not null default 'customer',
  city text,
  phone text,
  avatar_url text,
  provider_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id text primary key,
  name text not null unique,
  icon text not null default 'tools',
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.provider_services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  category_id text not null references public.categories(id),
  title text not null check (char_length(title) between 2 and 100),
  description text not null check (char_length(description) between 5 and 1200),
  city text not null,
  price_text text not null default 'حسب الاتفاق',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  provider_id uuid not null references public.profiles(id) on delete restrict,
  service_id uuid not null references public.provider_services(id) on delete restrict,
  details text not null check (char_length(details) between 3 and 1200),
  city text not null,
  preferred_date date,
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint different_customer_provider check (customer_id <> provider_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.service_requests(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 800),
  created_at timestamptz not null default now()
);

create table public.favorites (
  customer_id uuid not null references public.profiles(id) on delete cascade,
  provider_service_id uuid not null references public.provider_services(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, provider_service_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid references public.provider_services(id) on delete set null,
  request_id uuid references public.service_requests(id) on delete set null,
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  plan_name text not null default 'free',
  status text not null default 'inactive' check (status in ('inactive','pending','active','expired','cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  payment_reference text,
  created_at timestamptz not null default now()
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid references public.provider_services(id) on delete cascade,
  title text not null,
  status text not null default 'pending' check (status in ('pending','active','rejected','expired')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index provider_services_category_idx on public.provider_services(category_id);
create index provider_services_provider_idx on public.provider_services(provider_id);
create index provider_services_city_idx on public.provider_services(city);
create index service_requests_customer_idx on public.service_requests(customer_id, created_at desc);
create index service_requests_provider_idx on public.service_requests(provider_id, created_at desc);
create index reviews_provider_idx on public.reviews(provider_id);

-- Profile creation. Users can never choose their own role through client metadata;
-- all new accounts start as customers. Provider status must be changed through a trusted admin process.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, city, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'customer',
    nullif(new.raw_user_meta_data ->> 'city', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function public.is_approved_provider()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'provider' and p.provider_approved = true);
$$;

-- Keep role and approval fields protected from self-escalation.
create or replace function public.protect_profile_privileges()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if auth.uid() = old.id and not public.is_admin() then
    if new.role is distinct from old.role or new.provider_approved is distinct from old.provider_approved then
      raise exception 'Role and provider approval can only be changed by an administrator';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger protect_profile_privileges_trigger
before update on public.profiles
for each row execute procedure public.protect_profile_privileges();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.provider_services enable row level security;
alter table public.service_requests enable row level security;
alter table public.reviews enable row level security;
alter table public.favorites enable row level security;
alter table public.reports enable row level security;
alter table public.subscriptions enable row level security;
alter table public.promotions enable row level security;

create policy "profiles visible to signed in users" on public.profiles
for select to authenticated using (true);
create policy "users update own safe profile" on public.profiles
for update to authenticated using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy "categories readable by everyone" on public.categories
for select to anon, authenticated using (true);
create policy "admins manage categories" on public.categories
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "active services public" on public.provider_services
for select to anon, authenticated using (is_active = true or provider_id = auth.uid() or public.is_admin());
create policy "approved providers insert own services" on public.provider_services
for insert to authenticated with check (provider_id = auth.uid() and public.is_approved_provider());
create policy "providers update own services" on public.provider_services
for update to authenticated using (provider_id = auth.uid() or public.is_admin())
with check (provider_id = auth.uid() or public.is_admin());
create policy "providers delete own services" on public.provider_services
for delete to authenticated using (provider_id = auth.uid() or public.is_admin());

create policy "customer and provider read related requests" on public.service_requests
for select to authenticated using (customer_id = auth.uid() or provider_id = auth.uid() or public.is_admin());
create policy "customers create own requests" on public.service_requests
for insert to authenticated with check (
  customer_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'customer')
  and exists (select 1 from public.provider_services s where s.id = service_id and s.provider_id = provider_id and s.is_active = true)
);
create policy "related users update requests" on public.service_requests
for update to authenticated using (customer_id = auth.uid() or provider_id = auth.uid() or public.is_admin())
with check (customer_id = auth.uid() or provider_id = auth.uid() or public.is_admin());

create policy "reviews publicly readable" on public.reviews
for select to anon, authenticated using (true);
create policy "customer reviews own completed request" on public.reviews
for insert to authenticated with check (
  customer_id = auth.uid()
  and exists (
    select 1 from public.service_requests r
    where r.id = request_id and r.customer_id = auth.uid()
      and r.provider_id = reviews.provider_id and r.status = 'completed'
  )
);
create policy "reviewer or admin delete review" on public.reviews
for delete to authenticated using (customer_id = auth.uid() or public.is_admin());

create policy "users manage own favorites" on public.favorites
for all to authenticated using (customer_id = auth.uid() or public.is_admin())
with check (customer_id = auth.uid() or public.is_admin());

create policy "users create own reports and admins manage" on public.reports
for insert to authenticated with check (reporter_id = auth.uid());
create policy "reporter and admins read reports" on public.reports
for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy "admins update reports" on public.reports
for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "provider reads own subscriptions" on public.subscriptions
for select to authenticated using (provider_id = auth.uid() or public.is_admin());
create policy "admin manages subscriptions" on public.subscriptions
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "promotions active public" on public.promotions
for select to anon, authenticated using (status = 'active' or provider_id = auth.uid() or public.is_admin());
create policy "provider requests promotion" on public.promotions
for insert to authenticated with check (provider_id = auth.uid() and public.is_approved_provider());
create policy "admins manage promotions" on public.promotions
for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.categories (id, name, icon, slug) values
('computer','صيانة الكمبيوتر','laptop','computer'),
('mobile','صيانة الجوالات','mobile','mobile'),
('home','خدمات المنازل','tools','home'),
('design','التصميم','palette','design'),
('education','التدريس','book','education'),
('photo','التصوير','camera','photo'),
('other','خدمات أخرى','sparkles','other')
on conflict (id) do update set name = excluded.name, icon = excluded.icon, slug = excluded.slug;

-- Admin setup:
-- Create a normal user through Supabase Auth first, then run:
-- update public.profiles set role = 'admin' where id = 'USER-UUID-HERE';
-- Provider approval after reviewing the person:
-- update public.profiles set role = 'provider', provider_approved = true where id = 'PROVIDER-UUID-HERE';
-- Do these actions only in the trusted SQL editor, never from the client app.
