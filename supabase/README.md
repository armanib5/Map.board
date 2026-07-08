# Connecting Supabase

Five steps, roughly five minutes. Nothing here needs coding knowledge.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) and sign up / log in.
2. Click **New Project**. Free tier is plenty to start.
3. Pick a name (e.g. `baypinned`), a database password (save it somewhere — you likely won't need it again, but keep it), and a region close to you (e.g. `us-west`).
4. Wait ~2 minutes for it to finish provisioning.

## 2. Run the schema

1. In your new project, open the **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open `supabase/schema.sql` from this repo, copy the whole file, paste it into the editor.
4. Click **Run**. You should see "Success. No rows returned."

This creates every table the board, map, admin, and pin-submission sites will use, turns on Row Level Security, and seeds the cities/neighborhoods/categories that already exist in the apps today.

## 3. Get your API credentials

1. Go to **Settings → API** (left sidebar, gear icon).
2. Copy the **Project URL** (looks like `https://xxxxx.supabase.co`).
3. Copy the **anon / public** key (a long string starting with `eyJ...`). **Not** the `service_role` key — that one must never appear in client-side code.

Send me both of those. They're safe to paste in chat — the anon key is meant to be public; it's what every visitor's browser will use, and Row Level Security (already set up by the schema) is what actually controls who can do what.

## 4. Create your admin login

The private `/admin/` site needs one real login — you.

1. Go to **Authentication → Users** (left sidebar).
2. Click **Add user → Create new user**.
3. Enter your email and a password. Leave "Auto Confirm User" checked.
4. That's it — those are the credentials you'll use to sign in at `/admin/`.

## 5. Tell me you're done

Once you've sent me the Project URL + anon key, I'll wire up `/board/`, `/map/`, `/admin/`, and `/pins/` to actually read/write through Supabase instead of each browser's local storage, and test the whole thing end to end before calling it done.

---

### What's *not* in this first pass

- Migrating whatever flyers/vendors/bookings are already sitting in your browser's local storage into Supabase — that's a separate one-time export/import step I can do once the tables exist, if you want that old data carried over instead of starting fresh.
- Real accounts for vendors (right now, anyone can post — same as today, just backed by a real database instead of a single browser's storage).
- Payments — Boost/Featured checkout stays a labeled demo until you're ready to talk about a real payment processor, which is a separate step from Supabase itself.
