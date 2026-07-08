-- Run this once against your existing project to fix "permission
-- denied for table X" errors. Needed because "Automatically expose
-- new tables" was left off during project creation (the right call,
-- per Supabase's own recommendation) — but that setting is what
-- normally applies these base grants automatically, so schema.sql
-- needed to grant them explicitly and didn't. Fixed there too, so a
-- future fresh install won't need this file.

grant usage on schema public to anon, authenticated;

grant select on
  cities, neighborhoods, categories, events, vendors, vendor_events,
  promo_pricing, promo_bookings, event_closed_hours, pins
to anon, authenticated;

grant insert on events, vendors, vendor_events, promo_bookings, pins
to anon, authenticated;

grant update, delete on
  events, vendors, promo_bookings, promo_pricing, event_closed_hours,
  pins, cities, neighborhoods, categories
to authenticated;
