/* Thin shared wrapper around the Supabase JS client, used by /admin/
   and /pins/ (and eventually /board/ and /map/ once they migrate off
   localStorage). Depends on the Supabase SDK, loaded via CDN script
   tag in each page before this file, and shared/supabase-config.js,
   also loaded before this file. */

function isSupabaseConfigured() {
  return typeof SUPABASE_URL === "string" && SUPABASE_URL.indexOf("supabase.co") > 0 &&
    typeof SUPABASE_ANON_KEY === "string" && SUPABASE_ANON_KEY.length > 20;
}

var _sbClient = null;
function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!_sbClient) _sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sbClient;
}

/* Renders a friendly "not connected yet" notice into a container -
   every page that needs Supabase checks isSupabaseConfigured() first
   and falls back to this instead of a blank/broken screen. */
function renderSupabaseNotConfigured(containerEl, whatFor) {
  containerEl.innerHTML =
    "<div class='sb-notice'>" +
    "<h2>Not connected yet</h2>" +
    "<p>" + (whatFor || "This page") + " needs a Supabase project to work. " +
    "See <code>supabase/README.md</code> in the repo for the 5-minute setup, " +
    "then paste your Project URL and anon key into <code>shared/supabase-config.js</code>.</p>" +
    "</div>";
}
