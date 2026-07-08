/* Owner Admin — gated by Supabase Auth (one admin account, created
   per supabase/README.md step 4). Tab bodies query Supabase directly;
   RLS (supabase/schema.sql) is what actually enforces that only a
   signed-in user can approve/reject/edit — this file doesn't need to
   duplicate that logic client-side. */

function init() {
  var gate = document.getElementById("sbGate");
  if (!isSupabaseConfigured()) {
    renderSupabaseNotConfigured(gate, "The admin dashboard");
    return;
  }
  var sb = getSupabase();
  sb.auth.getSession().then(function (res) {
    if (res.data.session) showDash(res.data.session);
    else showLogin();
  });
  sb.auth.onAuthStateChange(function (event, session) {
    if (session) showDash(session); else showLogin();
  });

  document.getElementById("loginBtn").onclick = function () {
    var email = document.getElementById("loginEmail").value.trim();
    var pass = document.getElementById("loginPass").value;
    var err = document.getElementById("loginErr");
    err.style.display = "none";
    sb.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
      if (res.error) { err.textContent = res.error.message; err.style.display = "block"; }
    });
  };
  document.getElementById("signOutBtn").onclick = function (e) {
    e.preventDefault();
    sb.auth.signOut();
  };

  document.querySelectorAll(".tabbtn").forEach(function (btn) {
    btn.onclick = function () {
      document.querySelectorAll(".tabbtn").forEach(function (b) { b.classList.remove("on"); });
      btn.classList.add("on");
      renderTab(btn.dataset.tab);
    };
  });
}

function showLogin() {
  document.getElementById("loginWrap").style.display = "block";
  document.getElementById("dashWrap").style.display = "none";
}
function showDash(session) {
  document.getElementById("loginWrap").style.display = "none";
  document.getElementById("dashWrap").style.display = "block";
  document.getElementById("whoami").textContent = session.user.email;
  renderTab("vendors");
}

function renderTab(tab) {
  var el = document.getElementById("tabContent");
  el.innerHTML = "<p class='aempty'>Loading&hellip;</p>";
  if (tab === "vendors") renderVendorsTab(el);
  else if (tab === "bookings") renderBookingsTab(el);
  else if (tab === "pins") renderPinsTab(el);
  else if (tab === "pricing") renderPricingTab(el);
  else if (tab === "hours") renderHoursTab(el);
}

function renderVendorsTab(el) {
  var sb = getSupabase();
  sb.from("vendors").select("*").order("created_at", { ascending: false }).then(function (res) {
    if (res.error) { el.innerHTML = "<p class='aempty'>" + res.error.message + "</p>"; return; }
    if (!res.data.length) { el.innerHTML = "<p class='aempty'>No vendors yet.</p>"; return; }
    el.innerHTML = "";
    res.data.forEach(function (v) {
      var row = document.createElement("div"); row.className = "eventcard";
      row.innerHTML = "<span class='etitle'>" + v.name + " <span style='opacity:.6;font-size:11px;'>(" + v.status + ")</span></span>";
      var approveBtn = document.createElement("button"); approveBtn.className = "abtn green"; approveBtn.textContent = "Approve";
      approveBtn.onclick = function () { sb.from("vendors").update({ status: "approved" }).eq("id", v.id).then(function () { renderVendorsTab(el); }); };
      var rejectBtn = document.createElement("button"); rejectBtn.className = "abtn red"; rejectBtn.textContent = "Reject";
      rejectBtn.onclick = function () { sb.from("vendors").update({ status: "rejected" }).eq("id", v.id).then(function () { renderVendorsTab(el); }); };
      row.appendChild(approveBtn); row.appendChild(rejectBtn);
      el.appendChild(row);
    });
  });
}

function renderPinsTab(el) {
  var sb = getSupabase();
  sb.from("pins").select("*").order("created_at", { ascending: false }).then(function (res) {
    if (res.error) { el.innerHTML = "<p class='aempty'>" + res.error.message + "</p>"; return; }
    if (!res.data.length) { el.innerHTML = "<p class='aempty'>No pins yet.</p>"; return; }
    el.innerHTML = "";
    res.data.forEach(function (p) {
      var row = document.createElement("div"); row.className = "eventcard";
      row.innerHTML = "<span class='etitle'>" + (p.title || "Untitled pin") + " &middot; " + p.owner_name +
        " <span style='opacity:.6;font-size:11px;'>(" + p.source + " / " + p.status + ")</span></span>";
      var approveBtn = document.createElement("button"); approveBtn.className = "abtn green"; approveBtn.textContent = "Approve";
      approveBtn.onclick = function () { sb.from("pins").update({ status: "approved" }).eq("id", p.id).then(function () { renderPinsTab(el); }); };
      var rejectBtn = document.createElement("button"); rejectBtn.className = "abtn red"; rejectBtn.textContent = "Reject";
      rejectBtn.onclick = function () { sb.from("pins").update({ status: "rejected" }).eq("id", p.id).then(function () { renderPinsTab(el); }); };
      row.appendChild(approveBtn); row.appendChild(rejectBtn);
      el.appendChild(row);
    });
  });
}

function renderBookingsTab(el) {
  var sb = getSupabase();
  sb.from("promo_bookings").select("*, vendors(name), events(title)").order("purchased_at", { ascending: false }).then(function (res) {
    if (res.error) { el.innerHTML = "<p class='aempty'>" + res.error.message + "</p>"; return; }
    if (!res.data.length) { el.innerHTML = "<p class='aempty'>No bookings yet.</p>"; return; }
    el.innerHTML = "";
    res.data.forEach(function (b) {
      var row = document.createElement("div"); row.className = "eventcard";
      row.innerHTML = "<span class='etitle'>" + (b.vendors ? b.vendors.name : "?") + " &middot; " + (b.events ? b.events.title : "?") +
        " <span style='opacity:.6;font-size:11px;'>(" + b.type + " &middot; $" + b.amount + " &middot; " + b.status + ")</span></span>";
      if (b.status !== "cancelled") {
        var cancelBtn = document.createElement("button"); cancelBtn.className = "abtn red"; cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = function () {
          if (!confirm("Cancel this booking?")) return;
          sb.from("promo_bookings").update({ status: "cancelled" }).eq("id", b.id).then(function () { renderBookingsTab(el); });
        };
        row.appendChild(cancelBtn);
      }
      el.appendChild(row);
    });
  });
}

function renderPricingTab(el) {
  var sb = getSupabase();
  sb.from("promo_pricing").select("*").eq("id", 1).single().then(function (res) {
    if (res.error) { el.innerHTML = "<p class='aempty'>" + res.error.message + "</p>"; return; }
    var p = res.data;
    el.innerHTML = "<div class='formgrid'>" +
      "<label>Boost price ($)<input id='priceBoost' type='number' min='0' step='1' value='" + p.boost_price + "'></label>" +
      "<label>Featured price ($)<input id='priceFeatured' type='number' min='0' step='1' value='" + p.featured_price + "'></label>" +
      "</div><button class='abtn green' id='savePricingBtn' style='margin-top:10px;'>Save Pricing</button>";
    document.getElementById("savePricingBtn").onclick = function () {
      var b = parseFloat(document.getElementById("priceBoost").value) || 0;
      var f = parseFloat(document.getElementById("priceFeatured").value) || 0;
      sb.from("promo_pricing").update({ boost_price: b, featured_price: f }).eq("id", 1).then(function (r) {
        alert(r.error ? r.error.message : "Pricing updated.");
      });
    };
  });
}

function renderHoursTab(el) {
  var sb = getSupabase();
  sb.from("events").select("id, title").order("title").then(function (res) {
    if (res.error) { el.innerHTML = "<p class='aempty'>" + res.error.message + "</p>"; return; }
    if (!res.data.length) { el.innerHTML = "<p class='aempty'>No events yet.</p>"; return; }
    var opts = res.data.map(function (e) { return "<option value='" + e.id + "'>" + e.title + "</option>"; }).join("");
    el.innerHTML = "<div class='formgrid'><label>Event<select id='hoursEventSel'>" + opts + "</select></label></div><div id='hoursGridWrap'></div>";
    var sel = document.getElementById("hoursEventSel");
    function draw() {
      var eventId = sel.value;
      sb.from("events").select("start_hour, end_hour").eq("id", eventId).single().then(function (evRes) {
        var sh = Math.floor(evRes.data && evRes.data.start_hour != null ? evRes.data.start_hour : 9);
        var eh = Math.ceil(evRes.data && evRes.data.end_hour != null ? evRes.data.end_hour : 21);
        sb.from("event_closed_hours").select("hour").eq("event_id", eventId).then(function (chRes) {
          var closed = (chRes.data || []).map(function (r) { return r.hour; });
          var grid = "";
          for (var h = sh; h < eh; h++) {
            var isClosed = closed.indexOf(h) >= 0;
            var ap = h >= 12 ? "pm" : "am", h12 = h % 12 || 12;
            grid += "<button class='abtn " + (isClosed ? "gray" : "green") + "' data-hour='" + h + "' style='margin:3px;'>" + h12 + ap + (isClosed ? " (closed)" : " (open)") + "</button>";
          }
          document.getElementById("hoursGridWrap").innerHTML = grid;
          document.querySelectorAll("#hoursGridWrap button").forEach(function (btn) {
            btn.onclick = function () {
              var hour = parseInt(btn.dataset.hour, 10);
              var isClosed = closed.indexOf(hour) >= 0;
              var op = isClosed
                ? sb.from("event_closed_hours").delete().eq("event_id", eventId).eq("hour", hour)
                : sb.from("event_closed_hours").insert({ event_id: eventId, hour: hour });
              op.then(function () { draw(); });
            };
          });
        });
      });
    }
    sel.onchange = draw;
    draw();
  });
}

document.addEventListener("DOMContentLoaded", init);
