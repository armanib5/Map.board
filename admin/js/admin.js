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
  else if (tab === "reports") renderReportsTab(el);
}

/* Reports come from the Board's "Report" button on flyers/vendors -
   see supabase/migration_reports.sql, which needs to be run once before
   this table exists. Reports table only lets an authenticated user
   read/update rows, so this is the only place they're ever visible. */
var reportsFilter = "new";
function renderReportsTab(el) {
  var sb = getSupabase();
  sb.from("reports").select("*").order("created_at", { ascending: false }).then(function (res) {
    if (res.error) {
      el.innerHTML = "<p class='aempty'>" + res.error.message + " - have you run supabase/migration_reports.sql yet?</p>";
      return;
    }
    el.innerHTML = "";
    el.appendChild(statusFilterBarGeneric(reportsFilter, ["new", "reviewed", "dismissed", "all"], function (s) { reportsFilter = s; renderReportsTab(el); }));
    var rows = reportsFilter === "all" ? res.data : res.data.filter(function (r) { return r.status === reportsFilter; });
    if (!rows.length) { var p = document.createElement("p"); p.className = "aempty"; p.textContent = "No " + (reportsFilter === "all" ? "" : reportsFilter + " ") + "reports."; el.appendChild(p); return; }
    rows.forEach(function (r) {
      var row = document.createElement("div"); row.className = "eventcard"; row.style.alignItems = "flex-start"; row.style.flexDirection = "column";
      row.innerHTML = "<span class='etitle'>" + (r.target_type === "vendor" ? "Vendor: " : "Event: ") + (r.target_name || r.target_id) +
        " <span style='opacity:.6;font-size:11px;'>(" + r.reason + " &middot; " + new Date(r.created_at).toLocaleString() + ")</span></span>" +
        "<p style='font-size:12.5px;margin:6px 0;color:#fff;'>" + r.details + "</p>";
      if (r.status !== "reviewed") {
        var reviewedBtn = document.createElement("button"); reviewedBtn.className = "abtn green"; reviewedBtn.textContent = "Mark Reviewed";
        reviewedBtn.onclick = function () { sb.from("reports").update({ status: "reviewed" }).eq("id", r.id).then(function (res2) { if (res2.error) { alert(res2.error.message); return; } renderReportsTab(el); }); };
        row.appendChild(reviewedBtn);
      }
      if (r.status !== "dismissed") {
        var dismissBtn = document.createElement("button"); dismissBtn.className = "abtn gray"; dismissBtn.textContent = "Dismiss";
        dismissBtn.onclick = function () { sb.from("reports").update({ status: "dismissed" }).eq("id", r.id).then(function (res2) { if (res2.error) { alert(res2.error.message); return; } renderReportsTab(el); }); };
        row.appendChild(dismissBtn);
      }
      el.appendChild(row);
    });
  });
}

function statusFilterBarGeneric(current, options, onChange) {
  var bar = document.createElement("div"); bar.className = "tabrow"; bar.style.cssText = "margin:0 0 12px;padding:0;";
  options.forEach(function (s) {
    var b = document.createElement("button");
    b.className = "tabbtn" + (s === current ? " on" : "");
    b.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    b.onclick = function () { onChange(s); };
    bar.appendChild(b);
  });
  return bar;
}

/* Approve/reject used to fail silently on any error (RLS denial, network
   hiccup, session expired) - the row would just sit there with no
   feedback, looking like the button "didn't work". Every write below now
   surfaces res.error via alert() instead of swallowing it. */
var vendorsFilter = "pending", pinsFilter = "pending";

function statusFilterBar(current, onChange) {
  return statusFilterBarGeneric(current, ["pending", "approved", "rejected", "all"], onChange);
}

function renderVendorsTab(el) {
  var sb = getSupabase();
  sb.from("vendors").select("*").order("created_at", { ascending: false }).then(function (res) {
    if (res.error) { el.innerHTML = "<p class='aempty'>" + res.error.message + "</p>"; return; }
    el.innerHTML = "";
    el.appendChild(statusFilterBar(vendorsFilter, function (s) { vendorsFilter = s; renderVendorsTab(el); }));
    var rows = vendorsFilter === "all" ? res.data : res.data.filter(function (v) { return v.status === vendorsFilter; });
    if (vendorsFilter === "pending" && rows.length > 1) {
      var approveAllBtn = document.createElement("button"); approveAllBtn.className = "abtn gold"; approveAllBtn.style.marginBottom = "10px";
      approveAllBtn.textContent = "Approve All (" + rows.length + ")";
      approveAllBtn.onclick = function () {
        if (!confirm("Approve all " + rows.length + " pending vendors?")) return;
        var ids = rows.map(function (v) { return v.id; });
        sb.from("vendors").update({ status: "approved" }).in("id", ids).then(function (r) {
          if (r.error) { alert("Couldn't approve all: " + r.error.message); return; }
          renderVendorsTab(el);
        });
      };
      el.appendChild(approveAllBtn);
    }
    if (!rows.length) { el.appendChild(document.createTextNode("")); var p = document.createElement("p"); p.className = "aempty"; p.textContent = "No " + (vendorsFilter === "all" ? "" : vendorsFilter + " ") + "vendors."; el.appendChild(p); return; }
    rows.forEach(function (v) {
      var row = document.createElement("div"); row.className = "eventcard";
      row.innerHTML = "<span class='etitle'>" + v.name + " <span style='opacity:.6;font-size:11px;'>(" + v.status + ")</span></span>";
      if (v.status !== "approved") {
        var approveBtn = document.createElement("button"); approveBtn.className = "abtn green"; approveBtn.textContent = "Approve";
        approveBtn.onclick = function () { sb.from("vendors").update({ status: "approved" }).eq("id", v.id).then(function (r) { if (r.error) { alert("Couldn't approve: " + r.error.message); return; } renderVendorsTab(el); }); };
        row.appendChild(approveBtn);
      }
      if (v.status !== "rejected") {
        var rejectBtn = document.createElement("button"); rejectBtn.className = "abtn red"; rejectBtn.textContent = "Reject";
        rejectBtn.onclick = function () { sb.from("vendors").update({ status: "rejected" }).eq("id", v.id).then(function (r) { if (r.error) { alert("Couldn't reject: " + r.error.message); return; } renderVendorsTab(el); }); };
        row.appendChild(rejectBtn);
      }
      el.appendChild(row);
    });
  });
}

function renderPinsTab(el) {
  var sb = getSupabase();
  sb.from("pins").select("*").order("created_at", { ascending: false }).then(function (res) {
    if (res.error) { el.innerHTML = "<p class='aempty'>" + res.error.message + "</p>"; return; }
    el.innerHTML = "";
    el.appendChild(statusFilterBar(pinsFilter, function (s) { pinsFilter = s; renderPinsTab(el); }));
    var rows = pinsFilter === "all" ? res.data : res.data.filter(function (p) { return p.status === pinsFilter; });
    if (pinsFilter === "pending" && rows.length > 1) {
      var approveAllBtn = document.createElement("button"); approveAllBtn.className = "abtn gold"; approveAllBtn.style.marginBottom = "10px";
      approveAllBtn.textContent = "Approve All (" + rows.length + ")";
      approveAllBtn.onclick = function () {
        if (!confirm("Approve all " + rows.length + " pending pins?")) return;
        var ids = rows.map(function (p) { return p.id; });
        sb.from("pins").update({ status: "approved" }).in("id", ids).then(function (r) {
          if (r.error) { alert("Couldn't approve all: " + r.error.message); return; }
          renderPinsTab(el);
        });
      };
      el.appendChild(approveAllBtn);
    }
    if (!rows.length) { var p2 = document.createElement("p"); p2.className = "aempty"; p2.textContent = "No " + (pinsFilter === "all" ? "" : pinsFilter + " ") + "pins."; el.appendChild(p2); return; }
    rows.forEach(function (p) {
      var row = document.createElement("div"); row.className = "eventcard";
      row.innerHTML = "<span class='etitle'>" + (p.title || "Untitled pin") + " &middot; " + p.owner_name +
        " <span style='opacity:.6;font-size:11px;'>(" + p.source + " / " + p.status + ")</span></span>";
      if (p.status !== "approved") {
        var approveBtn = document.createElement("button"); approveBtn.className = "abtn green"; approveBtn.textContent = "Approve";
        approveBtn.onclick = function () { sb.from("pins").update({ status: "approved" }).eq("id", p.id).then(function (r) { if (r.error) { alert("Couldn't approve: " + r.error.message); return; } renderPinsTab(el); }); };
        row.appendChild(approveBtn);
      }
      if (p.status !== "rejected") {
        var rejectBtn = document.createElement("button"); rejectBtn.className = "abtn red"; rejectBtn.textContent = "Reject";
        rejectBtn.onclick = function () { sb.from("pins").update({ status: "rejected" }).eq("id", p.id).then(function (r) { if (r.error) { alert("Couldn't reject: " + r.error.message); return; } renderPinsTab(el); }); };
        row.appendChild(rejectBtn);
      }
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
