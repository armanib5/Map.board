-- ============================================================
-- Adds the `reports` table (event/vendor "Report" button on the Board).
-- Run this ONCE in the Supabase SQL Editor, same as the original
-- schema.sql: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run once on a project that already has schema.sql applied;
-- does not touch any existing table.
-- ============================================================

create table reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('event', 'vendor')),
  target_id text not null,
  target_name text,
  reason text not null check (reason in ('Inappropriate Content', 'Fraudulent Flyer', 'Misleading Information', 'Other')),
  details text not null,
  status text not null default 'new' check (status in ('new', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);
create index reports_status_idx on reports(status);

alter table reports enable row level security;

-- Anyone can file a report (no account needed), but nobody except the
-- signed-in admin can read them back - a reported vendor/organizer has no
-- way to see who reported them or what was said.
create policy "anyone can submit a report" on reports for insert with check (true);
create policy "admin reads reports" on reports for select using (auth.role() = 'authenticated');
create policy "admin updates reports" on reports for update using (auth.role() = 'authenticated');

grant usage on schema public to anon, authenticated;
grant insert on reports to anon, authenticated;
grant select, update on reports to authenticated;
