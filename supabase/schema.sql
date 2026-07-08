-- ============================================================
-- BayPinned combined schema — board + map + Vendor Hub + pins
-- ============================================================
-- Run this once, in full, in the Supabase SQL Editor for a fresh
-- project (Dashboard -> SQL Editor -> New query -> paste -> Run).
-- Safe to re-run on a fresh project only — it does not use
-- "create table if not exists", so re-running against a project that
-- already has these tables will error rather than silently skip.
--
-- Design notes:
--   * IDs are text, not uuid, for the reference/lookup tables (cities,
--     neighborhoods, categories) so the existing string ids already
--     baked into both apps (e.g. "sj", "downtown", "market") keep
--     working with zero renaming on the client side.
--   * events merges Baypinned3's evts (board flyers) and
--     Baypinnedmap1's PLACES (map pins) into one table — they were
--     always describing the same real-world things (a farmers market
--     is one row, shown on both the board and the map).
--   * pins is a single shared table for BOTH admin-managed map
--     pins/zones and public vendor self-check-in pins, distinguished
--     by `source`. Whichever page (map, /pins/, or both) ends up
--     showing them, they read/write the same rows.
--   * RLS: public can read everything and can INSERT vendor-generated
--     content (matches the site's current no-account model). Only an
--     authenticated user (the one admin account you'll create) can
--     UPDATE/DELETE moderation-sensitive rows.
-- ============================================================

create extension if not exists pgcrypto;

-- ── Reference tables ──────────────────────────────────────────

create table cities (
  id text primary key,
  label text not null
);

create table neighborhoods (
  id text primary key,
  city_id text not null references cities(id) on delete cascade,
  label text not null,
  lat double precision,
  lng double precision,
  zoom int
);

create table categories (
  id text primary key,
  label text not null,
  color text,
  icon text
);

-- ── Events (board flyers + map places, unified) ─────────────────

create table events (
  id text primary key default gen_random_uuid()::text,
  cat_id text references categories(id),
  city_id text not null default 'sj' references cities(id),
  hood_id text references neighborhoods(id),
  title text not null,
  short_label text,
  when_text text,
  recurrence text,              -- 'daily' | 'today' | 'monthly' | 'mon'..'sun' | ISO date
  start_hour numeric,           -- e.g. 9    (board's sh / promo hour range start)
  end_hour numeric,             -- e.g. 13.5 (board's eh / promo hour range end)
  address text,
  lat double precision,
  lng double precision,
  phone text,
  website text,
  description text,
  tags text[] default '{}',
  end_date date,
  photo_url text,
  parking_note text,
  transit_note text,
  access_note text,
  family_note text,
  zone jsonb,                   -- [[lat,lng], ...] polygon for street-closure footprints
  is_expired boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index events_city_hood_idx on events(city_id, hood_id);
create index events_cat_idx on events(cat_id);

-- ── Vendors ───────────────────────────────────────────────────

create table vendors (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  cat_id text references categories(id),
  description text,
  menu text,
  address text,
  lat double precision,
  lng double precision,
  phone text,
  email text,
  website text,
  social jsonb not null default '{}',
  hours jsonb not null default '{}',
  logo_url text,
  cover_url text,
  city_id text not null default 'sj' references cities(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  owner_device_id text,          -- until real vendor accounts exist
  created_at timestamptz not null default now()
);
create index vendors_city_idx on vendors(city_id);

create table vendor_events (
  vendor_id text not null references vendors(id) on delete cascade,
  event_id text not null references events(id) on delete cascade,
  primary key (vendor_id, event_id)
);

-- ── Vendor Hub promotions ────────────────────────────────────

create table promo_pricing (
  id int primary key default 1,
  boost_price numeric not null default 15,
  featured_price numeric not null default 30,
  check (id = 1)
);
insert into promo_pricing (id, boost_price, featured_price) values (1, 15, 30);

create table promo_bookings (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('boost','featured')),
  event_id text not null references events(id) on delete cascade,
  vendor_id text not null references vendors(id) on delete cascade,
  booking_date date not null,     -- resolved calendar occurrence, not just an hour-of-day
  hour int not null,
  slots int[] not null,           -- boost: two 10-min indexes 0-5; featured: one 30-min index 0-1
  amount numeric not null,
  status text not null default 'paid' check (status in ('paid','cancelled')),
  purchased_at timestamptz not null default now()
);
create index promo_bookings_event_date_hour_idx on promo_bookings(event_id, booking_date, hour, type);

create table event_closed_hours (
  event_id text not null references events(id) on delete cascade,
  hour int not null,
  primary key (event_id, hour)
);

-- ── Pins (admin map pins/zones + public vendor check-ins, shared) ──

create table pins (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'vendor' check (source in ('admin','vendor')),
  event_id text references events(id) on delete set null,
  cat_id text references categories(id),
  owner_name text,
  title text,
  description text,
  lat double precision not null,
  lng double precision not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  event_date date,               -- which day this pin is for (recurring events)
  expires_at timestamptz,        -- auto-hide after this (e.g. day after the event)
  created_at timestamptz not null default now()
);
create index pins_event_idx on pins(event_id);
create index pins_status_idx on pins(status);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table cities enable row level security;
alter table neighborhoods enable row level security;
alter table categories enable row level security;
alter table events enable row level security;
alter table vendors enable row level security;
alter table vendor_events enable row level security;
alter table promo_pricing enable row level security;
alter table promo_bookings enable row level security;
alter table event_closed_hours enable row level security;
alter table pins enable row level security;

-- Public read on everything - this is a public community board/map.
create policy "public read cities" on cities for select using (true);
create policy "public read neighborhoods" on neighborhoods for select using (true);
create policy "public read categories" on categories for select using (true);
create policy "public read events" on events for select using (true);
create policy "public read vendors" on vendors for select using (true);
create policy "public read vendor_events" on vendor_events for select using (true);
create policy "public read promo_pricing" on promo_pricing for select using (true);
create policy "public read promo_bookings" on promo_bookings for select using (true);
create policy "public read event_closed_hours" on event_closed_hours for select using (true);
create policy "public read pins" on pins for select using (true);

-- Public insert for vendor-generated content - no accounts exist yet,
-- matches every form on the site today (anyone can post a flyer, add a
-- business, book a promo slot, or submit a pin).
create policy "anyone can add an event/flyer" on events for insert with check (true);
create policy "anyone can add a vendor listing" on vendors for insert with check (true);
create policy "anyone can link a vendor to an event" on vendor_events for insert with check (true);
create policy "anyone can book a promo slot" on promo_bookings for insert with check (true);
create policy "anyone can submit a pin" on pins for insert with check (true);

-- Admin-only writes - requires being signed in on the private /admin/
-- site (Supabase Auth). One admin user is enough for now; see
-- supabase/README.md for how to create it.
create policy "admin manages events" on events for update using (auth.role() = 'authenticated');
create policy "admin deletes events" on events for delete using (auth.role() = 'authenticated');
create policy "admin moderates vendors" on vendors for update using (auth.role() = 'authenticated');
create policy "admin deletes vendors" on vendors for delete using (auth.role() = 'authenticated');
create policy "admin cancels bookings" on promo_bookings for update using (auth.role() = 'authenticated');
create policy "admin sets pricing" on promo_pricing for update using (auth.role() = 'authenticated');
create policy "admin manages closed hours" on event_closed_hours for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin moderates pins" on pins for update using (auth.role() = 'authenticated');
create policy "admin deletes pins" on pins for delete using (auth.role() = 'authenticated');
create policy "admin manages reference data" on cities for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin manages neighborhoods" on neighborhoods for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin manages categories" on categories for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- Seed reference data (cities, San Jose neighborhoods, categories)
-- Matches what's already hardcoded in both apps today, so migrating
-- to Supabase-backed data won't change anything visible at first.
-- ============================================================

insert into cities (id, label) values
  ('sj','San Jose'), ('sc','Santa Clara'), ('sv','Sunnyvale'),
  ('mv','Mountain View'), ('camp','Campbell');

insert into neighborhoods (id, city_id, label, lat, lng, zoom) values
  ('downtown','sj','Downtown San Jose',37.3382,-121.8863,15),
  ('japantown','sj','Japantown',37.3497,-121.8917,16),
  ('santana','sj','Santana Row & Valley Fair',37.3199,-121.9492,15),
  ('willow','sj','Willow Glen',37.3066,-121.8897,15),
  ('alum','sj','Alum Rock',37.3563,-121.8248,15),
  ('east','sj','East San Jose',37.3444,-121.8394,14),
  ('sc-downtown','sc','Downtown Santa Clara',37.3541,-121.9552,15),
  ('sc-rivermark','sc','Rivermark',37.3853,-121.9645,15),
  ('sv-downtown','sv','Downtown Sunnyvale',37.3688,-122.0363,15),
  ('sv-moffett','sv','Moffett Park',37.4085,-122.0525,14),
  ('mv-downtown','mv','Downtown Mountain View',37.3894,-122.0832,15),
  ('mv-shoreline','mv','Shoreline',37.4048,-122.0784,14),
  ('camp-downtown','camp','Downtown Campbell',37.2872,-121.9500,15),
  ('camp-pruneyard','camp','Pruneyard',37.2932,-121.9447,15);

insert into categories (id, label, color, icon) values
  ('market','Markets','#3d6b42','leaf'),
  ('foodhall','Food Hall','#b8860b','fork'),
  ('bars','Bars & Restaurants','#6b1e3c','cup'),
  ('artwalk','Art Walk','#2c5f8a','palette'),
  ('cityart','City Art','#6a4e7a','art'),
  ('parks','Parks','#5a8c3a','leaf'),
  ('venue','Theaters','#7a5230','mask'),
  ('holiday','Holiday','#8B0000','star'),
  ('shop','Shops','#c0392b','bag'),
  ('parking','Parking','#2c5f8a','P'),
  ('restrooms','Restrooms','#64748b','restroom'),
  ('transit','Transit','#1f8a4c','train'),
  ('schools','Schools','#0ea5e9','school'),
  ('hospitals','Hospitals','#dc2626','hospital'),
  ('churches','Churches','#7c3aed','church'),
  ('hotels','Hotels','#0f766e','hotel');
