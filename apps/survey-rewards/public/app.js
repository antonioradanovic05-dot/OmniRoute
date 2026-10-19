/* ============================================================
   PointPilot — client application
   Vanilla ES modules. No build step, no dependencies.
   ============================================================ */

const API = "/api";
const LS_CLIENT = "pp_client_id";
const LS_THEME = "pp_theme";
const LS_ONBOARDED = "pp_onboarded";

const AVATARS = ["🙂", "🦊", "🐼", "🦉", "🐯", "🐸", "🐨", "🚀", "🌻", "🎧", "🧋", "🦄"];

const view = document.getElementById("view");
const modalRoot = document.getElementById("modal-root");
const toastStack = document.getElementById("toast-stack");

let state = null;
let runner = null;
let routeToken = 0;
const ui = {
  q: "",
  category: "all",
  sort: "recommended",
  rewardFilter: "all",
  confirmAction: null,
  cancelAction: null,
  welcomeEmoji: "🦊",
};

/* ---------- tiny helpers ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmt(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function cash(points) {
  return `$${(Number(points || 0) / 100).toFixed(2)}`;
}

function clientId() {
  let id = localStorage.getItem(LS_CLIENT);
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(LS_CLIENT, id);
  }
  return id;
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", "x-client-id": clientId() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const error = new Error(data.error || "Something went wrong. Please try again.");
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dateLabel(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(name) {
  if (!name || name === "Guest") return "there";
  return name.split(" ")[0];
}

const TILES = [
  { bg: "rgba(91, 75, 255, 0.12)", glow: "rgba(91, 75, 255, 0.18)" },
  { bg: "rgba(15, 191, 154, 0.14)", glow: "rgba(15, 191, 154, 0.18)" },
  { bg: "rgba(245, 158, 11, 0.16)", glow: "rgba(245, 158, 11, 0.2)" },
  { bg: "rgba(244, 63, 94, 0.12)", glow: "rgba(244, 63, 94, 0.16)" },
  { bg: "rgba(2, 132, 199, 0.13)", glow: "rgba(2, 132, 199, 0.18)" },
  { bg: "rgba(139, 92, 246, 0.14)", glow: "rgba(139, 92, 246, 0.2)" },
];

function tileFor(seed = "") {
  let hash = 0;
  for (const char of String(seed)) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return TILES[hash % TILES.length];
}

function hexToRgba(hex, alpha) {
  const clean = String(hex).replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = Number.parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function go(hash) {
  if (location.hash === hash) return;
  location.hash = hash;
}

function setView(html) {
  view.innerHTML = `<div class="page">${html}</div>`;
}

function setActiveNav(page) {
  $$("[data-nav]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.nav === page);
  });
}

/* ---------- theme ---------- */

function applyTheme() {
  const stored = localStorage.getItem(LS_THEME);
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const theme = stored || (prefersDark ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0e1020" : "#5b4bff");
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(LS_THEME, next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#0e1020" : "#5b4bff");
  toast(next === "dark" ? "🌙 Dark mode on" : "☀️ Light mode on");
}

/* ---------- toasts ---------- */

function toast(message, { type = "", emoji = "" } = {}) {
  const node = document.createElement("div");
  node.className = `toast ${type ? `is-${type}` : ""}`;
  node.innerHTML = `<span class="toast-emoji">${esc(emoji)}</span><span>${esc(message)}</span>`;
  toastStack.appendChild(node);
  setTimeout(() => {
    node.classList.add("is-leaving");
    setTimeout(() => node.remove(), 260);
  }, 3400);
}

/* ---------- confetti ---------- */

function confetti(count = 90) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const layer = document.getElementById("confetti-layer");
  const colors = ["#5b4bff", "#8b5cf6", "#0fbf9a", "#ffb020", "#f43f5e", "#4fd1c5", "#c4b5fd"];
  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.setProperty("--dur", `${2 + Math.random() * 1.8}s`);
    piece.style.setProperty("--delay", `${Math.random() * 0.5}s`);
    piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 260}px`);
    piece.style.setProperty("--spin", `${(Math.random() - 0.5) * 1200}deg`);
    piece.style.borderRadius = Math.random() > 0.7 ? "50%" : "2px";
    layer.appendChild(piece);
    setTimeout(() => piece.remove(), 4600);
  }
}

/* ---------- chrome ---------- */

function refreshChrome() {
  if (!state) return;
  const { user, level, dailyBonus } = state;
  $("#points-pill").textContent = fmt(user.points);
  $("#topbar-avatar").textContent = user.emoji;
  $("#sidebar-avatar").textContent = user.emoji;
  $("#sidebar-name").textContent = user.name;
  $("#sidebar-level").textContent = `${level.emoji} ${level.name}`;
  $("#sidebar-streak-value").textContent = `${user.streak} ${user.streak === 1 ? "day" : "days"}`;
  $("#sidebar-streak-copy").textContent = dailyBonus.claimable
    ? `Claim +${dailyBonus.amount} points today.`
    : "Bonus claimed. Come back tomorrow!";

  const bonusBtn = $("#sidebar-bonus-btn");
  if (bonusBtn) {
    bonusBtn.disabled = !dailyBonus.claimable;
    bonusBtn.textContent = dailyBonus.claimable ? `Claim +${dailyBonus.amount} pts` : "Claimed today ✓";
  }
}

/* ============================================================
   Survey card
   ============================================================ */

function tagClass(tag) {
  if (!tag) return "";
  if (/high|featured/i.test(tag)) return "tag-amber";
  if (/new|quick/i.test(tag)) return "tag-mint";
  return "tag-brand";
}

function surveyCard(survey, index = 0, featured = false) {
  const tile = tileFor(survey.category);
  const progress = survey.started && !survey.completed ? `<div class="mini-progress"><i style="width:${Math.round(survey.progress * 100)}%"></i></div>` : "";

  const footer = survey.completed
    ? `<span class="sc-done">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>
         Completed
       </span>`
    : `<span class="sc-go">${survey.started ? "Resume" : "Start survey"}
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
       </span>`;

  return `
    <a class="survey-card ${survey.completed ? "is-done" : ""}"
       href="#/survey/${encodeURIComponent(survey.id)}"
       style="--delay:${Math.min(index * 45, 300)}ms;--tile:${tile.glow};--tile-bg:${tile.bg}"
       aria-label="${esc(survey.title)} — ${survey.reward} points">
      <div class="sc-top">
        <div>
          <span class="emoji-tile" aria-hidden="true">${survey.emoji}</span>
          <div class="sc-brand">${esc(survey.brand)}</div>
        </div>
        ${survey.tag ? `<span class="tag ${tagClass(survey.tag)}">${esc(survey.tag)}</span>` : ""}
      </div>
      <h3 class="sc-title">${esc(survey.title)}</h3>
      ${featured ? `<p class="page-sub" style="margin-top:0;font-size:13px">${esc(survey.description)}</p>` : ""}
      <div class="sc-meta">
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>
          ${survey.minutes} min
        </span>
        <span class="dot-sep">·</span>
        <span>${survey.questions} questions</span>
        <span class="dot-sep">·</span>
        <span>${esc(survey.categoryLabel)}</span>
      </div>
      ${progress}
      <div class="sc-footer">
        <span class="reward-amount">
          <span class="bolt" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="M13 2 5 13h5l-1 9 8-11h-5l1-9Z" fill="currentColor"/></svg>
          </span>
          ${survey.reward}<small>pts</small>
        </span>
        ${footer}
      </div>
    </a>`;
}

/* ============================================================
   Home
   ============================================================ */

function renderHome() {
  const s = state;
  const open = s.surveys.filter((x) => !x.completed);
  const featured = open.filter((x) => x.featured);
  const featuredList = (featured.length ? featured : open).slice(0, 2);
  const featuredIds = new Set(featuredList.map((x) => x.id));
  let rest = open.filter((x) => !featuredIds.has(x.id));
  if (rest.length < 3 && open.length > featuredList.length) {
    rest = open.filter((x) => !featuredIds.has(x.id)).slice(0, 6);
  }
  const upForGrabs = open.reduce((sum, x) => sum + x.reward, 0);
  const recent = s.activity.slice(0, 5);

  const categoryTiles = s.categories
    .map(
      (c) => `
      <button class="category-tile" data-action="filter-category" data-category="${c.id}">
        <span class="emoji" aria-hidden="true">${c.emoji}</span>
        <span>
          <strong>${esc(c.label)}</strong>
          <small>${c.completed}/${c.total} done</small>
        </span>
      </button>`,
    )
    .join("");

  setView(`
    <section class="hero">
      <div class="hero-copy">
        <span class="hero-badge"><span>${s.user.streak > 0 ? "🔥" : "✨"}</span>
          ${s.user.streak > 0 ? `${s.user.streak}-day streak — keep it alive` : "Your first reward is a few questions away"}
        </span>
        <h1>${greeting()}, ${esc(firstName(s.user.name))}. Turn opinions into <em>perks</em>.</h1>
        <p>Short surveys from brands that actually listen. Every answer earns points you can cash out or trade for something you love.</p>
        <div class="hero-actions">
          <a class="btn btn-light" href="#/surveys">
            Find a survey
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </a>
          <button class="btn btn-ghost" data-action="claim-bonus" ${s.dailyBonus.claimable ? "" : "disabled"}>
            ${s.dailyBonus.claimable ? `Claim +${s.dailyBonus.amount} daily bonus` : "Bonus claimed today ✓"}
          </button>
        </div>
        <div class="hero-meta">
          <div><strong>${open.length}</strong><small>surveys waiting</small></div>
          <div><strong>${fmt(upForGrabs)} pts</strong><small>up for grabs</small></div>
          <div><strong>${cash(s.user.points)}</strong><small>balance value</small></div>
        </div>
      </div>

      <div class="balance-card">
        <div class="balance-label"><span>Your balance</span><span>${s.level.emoji} ${esc(s.level.name)}</span></div>
        <div class="balance-amount"><b>${fmt(s.user.points)}</b><span>pts</span></div>
        <div class="balance-cash">≈ ${cash(s.user.points)} in rewards</div>
        <div class="balance-divider"></div>
        <div class="balance-row"><span>Lifetime earned</span><b>${fmt(s.stats.lifetimeEarned)} pts</b></div>
        <div class="balance-row"><span>Rewards redeemed</span><b>${s.stats.redemptions}</b></div>
        <div class="level-track">
          <div class="level-track-bar"><div class="level-track-fill" style="width:${Math.round(s.level.progress * 100)}%"></div></div>
          <div class="level-track-copy">
            <span>${esc(s.level.name)}</span>
            <span>${s.level.next ? `${fmt(s.level.toNext)} pts to ${esc(s.level.next.name)}` : "Top level"}</span>
          </div>
        </div>
      </div>
    </section>

    <div class="stat-grid">
      <div class="stat-tile">
        <span class="stat-icon tint-brand" aria-hidden="true">✅</span>
        <div><div class="stat-value">${s.stats.completed}<span style="color:var(--muted-2);font-size:14px">/${s.stats.available}</span></div><div class="stat-label">Surveys completed</div></div>
      </div>
      <div class="stat-tile">
        <span class="stat-icon tint-mint" aria-hidden="true">💎</span>
        <div><div class="stat-value">${fmt(s.stats.lifetimeEarned)}</div><div class="stat-label">Points earned</div></div>
      </div>
      <div class="stat-tile">
        <span class="stat-icon tint-amber" aria-hidden="true">🔥</span>
        <div><div class="stat-value">${s.user.streak} ${s.user.streak === 1 ? "day" : "days"}</div><div class="stat-label">Current streak</div></div>
      </div>
      <div class="stat-tile">
        <span class="stat-icon tint-brand" aria-hidden="true">🎁</span>
        <div><div class="stat-value">${s.stats.redemptions}</div><div class="stat-label">Rewards redeemed</div></div>
      </div>
    </div>

    ${
      featuredList.length
        ? `<section class="section">
             <div class="section-head">
               <h2>Featured for you</h2>
               <a class="link-more" href="#/surveys">See all
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
               </a>
             </div>
             <div class="survey-grid featured-grid">
               ${featuredList.map((survey, i) => surveyCard(survey, i, true)).join("")}
             </div>
           </section>`
        : ""
    }

    <section class="section">
      <div class="section-head"><h2>Browse by category</h2></div>
      <div class="category-grid">${categoryTiles}</div>
    </section>

    ${
      rest.length
        ? `<section class="section">
             <div class="section-head">
               <h2>More surveys <span class="count">${rest.length}</span></h2>
               <a class="link-more" href="#/surveys">Survey library
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
               </a>
             </div>
             <div class="survey-grid">
               ${rest.slice(0, 6).map((survey, i) => surveyCard(survey, i)).join("")}
             </div>
           </section>`
        : open.length === 0
          ? `<section class="section">
               <div class="empty">
                 <span class="emoji">🎉</span>
                 <h3>You've cleared the board</h3>
                 <p>Every survey is done. New ones arrive regularly — meanwhile, your points are ready to spend.</p>
                 <a class="btn btn-primary btn-sm" href="#/rewards">Browse rewards</a>
               </div>
             </section>`
          : ""
    }

    <section class="section">
      <div class="split">
        <div class="panel">
          <div class="panel-head">
            <h3>Recent activity</h3>
            <a class="muted-link" href="#/activity">View all</a>
          </div>
          ${
            recent.length
              ? `<div class="timeline">${recent
                  .map(
                    (a) => `
                  <div class="tl-item">
                    <span class="tl-icon" aria-hidden="true">${esc(a.emoji || "✨")}</span>
                    <div class="tl-body">
                      <strong>${esc(a.label)}</strong>
                      <small>${timeAgo(a.at)}</small>
                    </div>
                    <span class="tl-amount ${a.points >= 0 ? "plus" : "minus"}">${a.points >= 0 ? "+" : ""}${fmt(a.points)}</span>
                  </div>`,
                  )
                  .join("")}</div>`
              : `<div class="empty" style="padding:32px 16px">
                   <span class="emoji">🌱</span>
                   <h3>Nothing here yet</h3>
                   <p>Complete your first survey and your points will show up here.</p>
                 </div>`
          }
        </div>

        <div class="panel">
          <div class="panel-head">
            <h3>This month's leaderboard</h3>
            <a class="muted-link" href="#/activity">Details</a>
          </div>
          <div class="leaderboard">
            ${s.leaderboard
              .slice(0, 6)
              .map(
                (row) => `
              <div class="lb-row ${row.isYou ? "is-you" : ""}">
                <span class="lb-rank">${row.rank}</span>
                <span class="lb-avatar" aria-hidden="true">${row.emoji}</span>
                <span class="lb-name">${esc(row.name)}${row.isYou ? '<span class="you-tag">YOU</span>' : ""}</span>
                <span class="lb-points">${fmt(row.points)}</span>
              </div>`,
              )
              .join("")}
          </div>
        </div>
      </div>
    </section>

    <footer class="app-foot">
      <span>PointPilot · A demo survey &amp; rewards experience. Points and payouts are simulated.</span>
      <span><a href="#/activity">Achievements</a> · <a href="#/profile">Settings</a></span>
    </footer>
  `);
}

/* ============================================================
   Survey library
   ============================================================ */

function filteredSurveys() {
  const q = ui.q.trim().toLowerCase();
  let list = state.surveys.filter((s) => {
    if (ui.category !== "all" && s.category !== ui.category) return false;
    if (!q) return true;
    return [s.title, s.brand, s.description, s.categoryLabel, s.tag]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(q));
  });

  const comparator = {
    recommended: (a, b) => Number(b.featured) - Number(a.featured) || b.reward - a.reward,
    reward: (a, b) => b.reward - a.reward,
    time: (a, b) => a.minutes - b.minutes,
    newest: (a, b) => Number(b.tag === "New") - Number(a.tag === "New"),
  }[ui.sort];

  list = list.slice().sort(comparator);
  return list.slice().sort((a, b) => Number(a.completed) - Number(b.completed));
}

function surveyResultsMarkup() {
  const list = filteredSurveys();
  if (!list.length) {
    return `<div class="empty" style="grid-column:1/-1">
      <span class="emoji">🔍</span>
      <h3>No surveys match that</h3>
      <p>Try a different category, or clear your search to see everything available.</p>
      <button class="btn btn-ghost btn-sm" data-action="clear-filters">Clear filters</button>
    </div>`;
  }
  return list.map((survey, i) => surveyCard(survey, i)).join("");
}

function refreshSurveyResults() {
  const holder = document.getElementById("survey-results");
  if (!holder) return;
  holder.innerHTML = surveyResultsMarkup();
  const count = document.getElementById("results-count");
  if (count) {
    const n = filteredSurveys().length;
    count.textContent = `${n} ${n === 1 ? "survey" : "surveys"}`;
  }
}

function renderSurveys() {
  $("#global-search").value = ui.q;
  const categories = [
    { id: "all", label: "All categories", emoji: "✨", total: state.surveys.length, completed: state.stats.completed },
    ...state.categories,
  ];

  setView(`
    <div class="page-head">
      <div>
        <span class="eyebrow">Survey library</span>
        <h1 class="page-title">${state.stats.available - state.stats.completed} surveys waiting for you</h1>
        <p class="page-sub">Every survey is a few minutes long and pays instantly. Your progress saves automatically, so you can stop and pick up later.</p>
      </div>
    </div>

    <div class="controls">
      <form class="search" id="catalog-search-form" role="search" onsubmit="return false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
        <input id="catalog-search" type="search" placeholder="Search surveys or brands" value="${esc(ui.q)}" aria-label="Search surveys" />
      </form>
      <div class="select-wrap">
        <select id="sort-select" aria-label="Sort surveys">
          <option value="recommended" ${ui.sort === "recommended" ? "selected" : ""}>Recommended</option>
          <option value="reward" ${ui.sort === "reward" ? "selected" : ""}>Highest reward</option>
          <option value="time" ${ui.sort === "time" ? "selected" : ""}>Quickest</option>
          <option value="newest" ${ui.sort === "newest" ? "selected" : ""}>Newest</option>
        </select>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </div>
      <span class="results-count" id="results-count"></span>
    </div>

    <div class="chip-row" style="margin-bottom:18px">
      ${categories
        .map(
          (c) => `
        <button class="chip ${ui.category === c.id ? "is-active" : ""}" data-action="filter-category" data-category="${c.id}">
          <span aria-hidden="true">${c.emoji}</span> ${esc(c.label)}
          <span style="opacity:.6">${c.total - c.completed}</span>
        </button>`,
        )
        .join("")}
    </div>

    <div class="survey-grid" id="survey-results">${surveyResultsMarkup()}</div>
  `);

  const count = document.getElementById("results-count");
  if (count) {
    const n = filteredSurveys().length;
    count.textContent = `${n} ${n === 1 ? "survey" : "surveys"}`;
  }
}

/* ============================================================
   Survey runner
   ============================================================ */

function isAnswered(question, value) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function renderSurveyLoading() {
  setView(`
    <div class="runner">
      <div class="skeleton" style="height:22px;width:180px;margin-bottom:16px"></div>
      <div class="q-card">
        <div class="skeleton" style="height:12px;width:100px"></div>
        <div class="skeleton" style="height:26px;width:72%;margin-top:14px"></div>
        <div class="skeleton" style="height:52px;margin-top:24px"></div>
        <div class="skeleton" style="height:52px;margin-top:10px"></div>
        <div class="skeleton" style="height:52px;margin-top:10px"></div>
      </div>
    </div>
  `);
}

async function renderSurveyPage(surveyId, token) {
  renderSurveyLoading();
  let data;
  try {
    data = await api(`/surveys/${encodeURIComponent(surveyId)}`);
  } catch (error) {
    if (token !== routeToken) return;
    setView(errorCard(error.message));
    return;
  }
  if (token !== routeToken) return;

  const survey = data.survey;
  if (survey.completed) {
    runner = null;
    renderCompletedSurvey(survey);
    return;
  }

  const answers = { ...survey.savedAnswers };
  runner = {
    survey,
    answers,
    index: Math.min(Math.max(0, survey.startQuestion || 0), survey.questions.length - 1),
    startedAt: Date.now(),
    submitting: false,
    error: "",
  };

  api(`/surveys/${encodeURIComponent(survey.id)}/start`, { method: "POST" }).catch(() => {});
  renderRunner();
}

function renderCompletedSurvey(survey) {
  const record = state.surveys.find((s) => s.id === survey.id);
  setView(`
    <div class="result-wrap">
      <div class="result-card">
        <div class="result-badge" aria-hidden="true">✅</div>
        <h1>Already in the books</h1>
        <p class="result-sub">You completed “${esc(survey.title)}”${record?.completedAt ? ` on ${dateLabel(record.completedAt)}` : ""}.</p>
        <div class="result-stats">
          <div class="result-stat"><b>+${survey.reward}</b><small>points earned</small></div>
          <div class="result-stat"><b>${survey.questions.length}</b><small>questions answered</small></div>
          <div class="result-stat"><b>${esc(survey.categoryLabel)}</b><small>category</small></div>
        </div>
        <div class="result-actions">
          <a class="btn btn-primary" href="#/surveys">Find another survey</a>
          <a class="btn btn-ghost" href="#/rewards">Spend my points</a>
        </div>
      </div>
    </div>
  `);
}

function questionBody(question, value) {
  switch (question.type) {
    case "single":
      return question.options
        .map(
          (option) => `
        <button class="option ${value === option ? "is-selected" : ""}" data-action="answer-single" data-value="${esc(option)}" aria-pressed="${value === option}">
          <span class="marker" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>
          </span>
          ${esc(option)}
        </button>`,
        )
        .join("");

    case "multi": {
      const selected = Array.isArray(value) ? value : [];
      return question.options
        .map(
          (option) => `
        <button class="option ${selected.includes(option) ? "is-selected" : ""}" data-action="answer-multi" data-value="${esc(option)}" aria-pressed="${selected.includes(option)}">
          <span class="marker square" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>
          </span>
          ${esc(option)}
        </button>`,
        )
        .join("");
    }

    case "scale": {
      const labels = ["1", "2", "3", "4", "5"];
      return `
        <div class="scale-row">
          ${labels
            .map(
              (label, i) => `
            <button class="scale-btn ${value === i + 1 ? "is-selected" : ""}" data-action="answer-scale" data-value="${i + 1}" aria-label="Rate ${label} out of 5" aria-pressed="${value === i + 1}">
              ${label}
            </button>`,
            )
            .join("")}
        </div>
        <div class="scale-ends"><span>${esc(question.low || "Low")}</span><span>${esc(question.high || "High")}</span></div>`;
    }

    case "rating": {
      const captions = ["", "Not at all", "Slightly", "Neutral", "Quite a bit", "A great deal"];
      return `
        <div class="stars" role="group" aria-label="Rating out of 5">
          ${[1, 2, 3, 4, 5]
            .map(
              (n) => `
            <button class="star-btn ${value >= n ? "is-on" : ""}" data-action="answer-rating" data-value="${n}" aria-label="${n} out of 5" aria-pressed="${value >= n}">
              <svg viewBox="0 0 24 24" fill="currentColor" style="width:24px;height:24px"><path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6Z"/></svg>
            </button>`,
            )
            .join("")}
        </div>
        <div class="star-caption" id="star-caption">${value ? captions[value] : "Tap a star to rate"}</div>`;
    }

    case "text":
      return `
        <textarea class="q-text" id="q-text" maxlength="${question.maxLength || 300}" placeholder="${esc(question.placeholder || "Type your answer…")}" aria-label="${esc(question.prompt)}">${esc(value || "")}</textarea>
        <div class="q-text-meta">
          <span>${question.required ? "Required" : "Optional — but it genuinely helps"}</span>
          <span id="char-count">${String(value || "").length}/${question.maxLength || 300}</span>
        </div>`;

    default:
      return `<p class="page-sub">Unsupported question type.</p>`;
  }
}

function renderRunner() {
  if (!runner) return;
  const { survey, index, answers } = runner;
  const question = survey.questions[index];
  const value = answers[question.id];
  const isLast = index === survey.questions.length - 1;
  const progress = ((index + (isAnswered(question, value) ? 1 : 0)) / survey.questions.length) * 100;

  setView(`
    <div class="runner">
      <div class="runner-head">
        <a class="icon-btn" href="#/surveys" aria-label="Exit survey" data-action="exit-survey">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
        </a>
        <div class="runner-brand">
          <span class="emoji-tile" aria-hidden="true">${survey.emoji}</span>
          <div>
            <strong>${esc(survey.title)}</strong>
            <small>${esc(survey.brand)} · ${esc(survey.categoryLabel)}</small>
          </div>
        </div>
        <span class="runner-reward">
          <svg viewBox="0 0 24 24" fill="none"><path d="M13 2 5 13h5l-1 9 8-11h-5l1-9Z" fill="currentColor"/></svg>
          ${survey.reward} pts
        </span>
      </div>

      <div class="runner-progress">
        <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
        <span class="progress-copy">${index + 1} / ${survey.questions.length}</span>
      </div>

      <div class="q-card">
        <span class="q-step">Question ${index + 1}</span>
        <h1 class="q-title">${esc(question.prompt)}</h1>
        <p class="q-hint">${question.type === "multi" ? "Select all that apply" : question.required ? "This one's required" : "Optional question"}</p>

        <div class="q-body" id="q-body">${questionBody(question, value)}</div>

        <div class="q-error ${runner.error ? "is-visible" : ""}" id="q-error" role="alert">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/></svg>
          <span>${esc(runner.error || "Please answer this question to continue.")}</span>
        </div>

        <div class="q-footer">
          ${
            index > 0
              ? `<button class="btn btn-ghost" data-action="prev-question">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
                   Back
                 </button>`
              : `<span style="font-size:12px;color:var(--muted);font-weight:600">Autosaved as you go</span>`
          }
          <button class="btn btn-primary" id="next-btn" data-action="${isLast ? "submit-survey" : "next-question"}" ${runner.submitting ? "disabled" : ""}>
            ${runner.submitting ? "Submitting…" : isLast ? `Submit &amp; earn ${survey.reward} pts` : "Next question"}
            ${
              isLast
                ? ""
                : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`
            }
          </button>
        </div>
      </div>
    </div>
  `);

  const textarea = document.getElementById("q-text");
  if (textarea) {
    textarea.addEventListener("input", () => {
      runner.answers[question.id] = textarea.value;
      const counter = document.getElementById("char-count");
      if (counter) counter.textContent = `${textarea.value.length}/${question.maxLength || 300}`;
      runner.error = "";
      document.getElementById("q-error")?.classList.remove("is-visible");
    });
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }
}

function paintSelection(question) {
  const value = runner.answers[question.id];
  if (question.type === "single") {
    $$(".option").forEach((el) => {
      const on = el.dataset.value === value;
      el.classList.toggle("is-selected", on);
      el.setAttribute("aria-pressed", String(on));
    });
  } else if (question.type === "multi") {
    const selected = Array.isArray(value) ? value : [];
    $$(".option").forEach((el) => {
      const on = selected.includes(el.dataset.value);
      el.classList.toggle("is-selected", on);
      el.setAttribute("aria-pressed", String(on));
    });
  } else if (question.type === "scale") {
    $$(".scale-btn").forEach((el) => {
      const on = Number(el.dataset.value) === value;
      el.classList.toggle("is-selected", on);
      el.setAttribute("aria-pressed", String(on));
    });
  } else if (question.type === "rating") {
    const captions = ["", "Not at all", "Slightly", "Neutral", "Quite a bit", "A great deal"];
    $$(".star-btn").forEach((el) => {
      const on = Number(el.dataset.value) <= (value || 0);
      el.classList.toggle("is-on", on);
      el.setAttribute("aria-pressed", String(on));
    });
    const caption = document.getElementById("star-caption");
    if (caption) caption.textContent = value ? captions[value] : "Tap a star to rate";
  }
  if (runner.error) {
    runner.error = "";
    document.getElementById("q-error")?.classList.remove("is-visible");
  }
  updateProgressBar();
}

function updateProgressBar() {
  if (!runner) return;
  const question = runner.survey.questions[runner.index];
  const answered = isAnswered(question, runner.answers[question.id]);
  const progress = ((runner.index + (answered ? 1 : 0)) / runner.survey.questions.length) * 100;
  const fill = $(".progress-fill");
  if (fill) fill.style.width = `${progress}%`;
}

function autosave() {
  if (!runner) return;
  const { survey, answers, index } = runner;
  return api(`/surveys/${encodeURIComponent(survey.id)}/progress`, {
    method: "POST",
    body: { answers, currentQuestion: index },
  }).catch(() => {});
}

function nextQuestion() {
  if (!runner) return;
  const question = runner.survey.questions[runner.index];
  if (question.required && !isAnswered(question, runner.answers[question.id])) {
    runner.error = "This question is required — pick an answer to keep going.";
    document.getElementById("q-error")?.classList.add("is-visible");
    const body = document.getElementById("q-body");
    body?.animate?.(
      [{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }],
      { duration: 280 },
    );
    return;
  }
  autosave();
  runner.error = "";
  runner.index += 1;
  renderRunner();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function prevQuestion() {
  if (!runner || runner.index === 0) return;
  autosave();
  runner.index -= 1;
  runner.error = "";
  renderRunner();
}

async function submitSurvey() {
  if (!runner || runner.submitting) return;
  const { survey, answers, index } = runner;
  const question = survey.questions[index];
  if (question.required && !isAnswered(question, answers[question.id])) {
    runner.error = "This question is required — pick an answer to submit.";
    document.getElementById("q-error")?.classList.add("is-visible");
    return;
  }

  runner.submitting = true;
  const button = document.getElementById("next-btn");
  if (button) {
    button.disabled = true;
    button.textContent = "Submitting…";
  }

  try {
    const result = await api(`/surveys/${encodeURIComponent(survey.id)}/complete`, {
      method: "POST",
      body: { answers, durationSeconds: Math.round((Date.now() - runner.startedAt) / 1000) },
    });
    state = result.state;
    refreshChrome();
    runner = null;
    renderResult(survey, result);
    confetti(110);
    result.newlyUnlocked?.forEach((a) => {
      setTimeout(() => toast(`Achievement unlocked — ${a.title}`, { emoji: a.icon }), 700);
    });
  } catch (error) {
    runner.submitting = false;
    runner.error = error.message;
    document.getElementById("q-error")?.classList.add("is-visible");
    if (button) {
      button.disabled = false;
      button.innerHTML = `Submit &amp; earn ${survey.reward} pts`;
    }
    toast(error.message, { type: "error" });
  }
}

function renderResult(survey, result) {
  const unlocks = result.newlyUnlocked || [];
  setView(`
    <div class="result-wrap">
      <div class="result-card">
        <div class="result-badge" aria-hidden="true">${survey.emoji}</div>
        <span class="tag tag-mint">Survey complete</span>
        <h1>Nice work — that's ${result.pointsAwarded} points in the bag.</h1>
        <p class="result-sub">Your answers to “${esc(survey.title)}” just went to ${esc(survey.brand)}.</p>

        <div class="result-points" id="result-points"><span>+0</span><small>pts</small></div>

        <div class="result-stats">
          <div class="result-stat"><b>${fmt(result.balance)}</b><small>new balance</small></div>
          <div class="result-stat"><b>${result.streak} 🔥</b><small>day streak</small></div>
          <div class="result-stat"><b>${result.completed}/${state.stats.available}</b><small>surveys done</small></div>
        </div>

        ${
          unlocks.length
            ? `<div class="result-unlocks">
                 ${unlocks.map((a) => `<span class="unlock-pill">${a.icon} ${esc(a.title)}</span>`).join("")}
               </div>`
            : ""
        }

        <div class="result-actions">
          <a class="btn btn-primary" href="#/surveys">Take another survey</a>
          <a class="btn btn-ghost" href="#/rewards">Spend ${fmt(result.balance)} pts</a>
        </div>
        <p style="margin-top:16px;font-size:11.5px;color:var(--muted-2)">
          ${result.streakIncreased ? "Streak extended — same time tomorrow?" : "Progress saved automatically."}
        </p>
      </div>
    </div>
  `);

  const holder = document.getElementById("result-points");
  if (holder) {
    const target = result.pointsAwarded;
    const span = holder.querySelector("span");
    const start = performance.now();
    const duration = 900;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      span.textContent = `+${Math.round(target * eased)}`;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ============================================================
   Rewards
   ============================================================ */

function rewardCard(reward, index) {
  const affordable = state.user.points >= reward.cost;
  const shortfall = reward.cost - state.user.points;
  const typeChip = { cash: "💸", giftcard: "🎁", voucher: "🎟️", donation: "💚" }[reward.type] || "✨";

  return `
    <article class="reward-card ${affordable ? "" : "is-locked"}" style="--delay:${Math.min(index * 45, 300)}ms;--accent:${reward.accent};--tile-bg:${hexToRgba(reward.accent, 0.13)}">
      ${reward.popular ? '<span class="popular-flag">Popular</span>' : ""}
      <span class="reward-emoji" aria-hidden="true">${reward.emoji}</span>
      <div>
        <h3 class="reward-title">${esc(reward.title)}</h3>
        <p class="reward-sub">${esc(reward.subtitle)}</p>
      </div>
      <span class="reward-value">${typeChip} ${esc(reward.value)} value</span>
      <div class="reward-footer">
        <span class="reward-cost">
          <b>${fmt(reward.cost)} pts</b>
          <small>${reward.redeemedCount ? `Redeemed ${reward.redeemedCount}×` : "≈ " + cash(reward.cost)}</small>
        </span>
        ${
          affordable
            ? `<button class="btn btn-primary btn-sm" data-action="redeem" data-reward="${esc(reward.id)}">Redeem</button>`
            : `<button class="btn btn-ghost btn-sm" data-action="redeem" data-reward="${esc(reward.id)}">Need ${fmt(shortfall)} more</button>`
        }
      </div>
    </article>`;
}

function renderRewards() {
  const types = state.rewardTypes;
  const list = state.rewards.filter((r) => ui.rewardFilter === "all" || r.type === ui.rewardFilter);
  const nextAffordable = state.rewards
    .filter((r) => r.cost > state.user.points)
    .sort((a, b) => a.cost - b.cost)[0];

  const bannerSub = nextAffordable
    ? `<b>${fmt(nextAffordable.cost - state.user.points)} more points</b> unlocks “${esc(nextAffordable.title)}” ${nextAffordable.emoji}`
    : "Every reward on this page is within reach. Treat yourself.";

  setView(`
    <div class="page-head">
      <div>
        <span class="eyebrow">Reward store</span>
        <h1 class="page-title">Spend your points, keep the perks</h1>
        <p class="page-sub">Cash, gift cards, vouchers or a donation — every 100 points is worth about $1.</p>
      </div>
    </div>

    <div class="balance-banner">
      <div class="balance-banner-main">
        <span class="balance-banner-icon" aria-hidden="true">🎁</span>
        <div>
          <h2>${fmt(state.user.points)} pts <span style="font-size:14px;color:var(--muted);font-weight:600">≈ ${cash(state.user.points)}</span></h2>
          <p>${bannerSub}</p>
        </div>
      </div>
      <a class="btn btn-primary" href="#/surveys">Earn more points</a>
    </div>

    <div class="chip-row" style="margin-bottom:18px">
      ${types
        .map(
          (t) => `
        <button class="chip ${ui.rewardFilter === t.id ? "is-active" : ""}" data-action="reward-filter" data-type="${t.id}">${esc(t.label)}</button>`,
        )
        .join("")}
    </div>

    ${
      list.length
        ? `<div class="reward-grid">${list.map((r, i) => rewardCard(r, i)).join("")}</div>`
        : `<div class="empty"><span class="emoji">🛍️</span><h3>Nothing in this category yet</h3><p>Try another reward type — new partners land every month.</p></div>`
    }

    <section class="section">
      <div class="section-head"><h2>Your rewards <span class="count">${state.redemptions.length}</span></h2></div>
      ${
        state.redemptions.length
          ? `<div class="code-list">
              ${state.redemptions
                .map(
                  (r) => `
                <div class="code-row">
                  <span class="code-emoji" aria-hidden="true">${r.emoji}</span>
                  <div class="code-info">
                    <strong>${esc(r.title)}</strong>
                    <small>${esc(r.subtitle)} · redeemed ${timeAgo(r.at)}</small>
                  </div>
                  <span class="code-tag">
                    ${esc(r.code)}
                    <button class="copy-btn" data-action="copy-code" data-code="${esc(r.code)}" aria-label="Copy code ${esc(r.code)}">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a3 3 0 0 0-3 3v6.5A2.5 2.5 0 0 0 5.5 15"/></svg>
                    </button>
                  </span>
                </div>`,
                )
                .join("")}
             </div>
             <p style="margin-top:12px;font-size:11.5px;color:var(--muted-2)">Demo codes — no real value. In a live app these arrive by email instantly.</p>`
          : `<div class="empty">
               <span class="emoji">🎟️</span>
               <h3>No rewards yet</h3>
               <p>Pick something above once you have enough points. Your redeemed codes will live here.</p>
             </div>`
      }
    </section>
  `);
}

function openRedeemModal(reward) {
  if (state.user.points < reward.cost) {
    const shortfall = reward.cost - state.user.points;
    openModal({
      icon: "🔒",
      title: `${fmt(shortfall)} points to go`,
      body: `“${esc(reward.title)}” costs ${fmt(reward.cost)} points and you have ${fmt(state.user.points)}. A few more surveys and it's yours.`,
      confirmLabel: "Find a survey",
      cancelLabel: "Maybe later",
      onConfirm: () => {
        closeModal();
        go("#/surveys");
      },
    });
    return;
  }

  openModal({
    icon: reward.emoji,
    title: "Redeem this reward?",
    body: "Points are deducted immediately and your reward code is issued right away.",
    bodyHtml: `
      <div class="redeem-summary">
        <span class="emoji" aria-hidden="true">${reward.emoji}</span>
        <div>
          <strong style="font-size:14px">${esc(reward.title)}</strong>
          <p style="margin:2px 0 0;font-size:12px">${esc(reward.subtitle)}</p>
        </div>
      </div>
      <div class="redeem-lines">
        <div class="redeem-line"><span>Reward cost</span><b>−${fmt(reward.cost)} pts</b></div>
        <div class="redeem-line"><span>Current balance</span><b>${fmt(state.user.points)} pts</b></div>
        <div class="redeem-line total"><span>Balance after</span><b>${fmt(state.user.points - reward.cost)} pts</b></div>
      </div>`,
    confirmLabel: `Redeem for ${fmt(reward.cost)} pts`,
    cancelLabel: "Cancel",
    onConfirm: () => confirmRedeem(reward),
  });
}

async function confirmRedeem(reward) {
  const button = document.querySelector('[data-action="modal-confirm"]');
  if (button) {
    button.disabled = true;
    button.textContent = "Redeeming…";
  }
  try {
    const result = await api(`/rewards/${encodeURIComponent(reward.id)}/redeem`, { method: "POST" });
    state = result.state;
    refreshChrome();
    closeModal();
    renderRewards();
    confetti(100);
    openModal({
      icon: "🎉",
      title: "Reward unlocked",
      bodyHtml: `
        <div class="redeem-summary">
          <span class="emoji" aria-hidden="true">${result.redemption.emoji}</span>
          <div>
            <strong style="font-size:14px">${esc(result.redemption.title)}</strong>
            <p style="margin:2px 0 0;font-size:12px">${esc(result.redemption.subtitle)}</p>
          </div>
        </div>
        <p style="margin-top:14px">Your code:</p>
        <div class="code-tag" style="margin-top:6px;width:100%;justify-content:space-between;font-size:15px">
          ${esc(result.redemption.code)}
          <button class="copy-btn" data-action="copy-code" data-code="${esc(result.redemption.code)}" aria-label="Copy reward code">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a3 3 0 0 0-3 3v6.5A2.5 2.5 0 0 0 5.5 15"/></svg>
          </button>
        </div>
        <p style="margin-top:10px;font-size:11.5px;color:var(--muted-2)">Demo code — stored in your rewards list.</p>`,
      confirmLabel: "Done",
      cancelLabel: "",
      onConfirm: () => {
        closeModal();
      },
    });
    result.newlyUnlocked?.forEach((a) => {
      setTimeout(() => toast(`Achievement unlocked — ${a.title}`, { emoji: a.icon }), 700);
    });
  } catch (error) {
    toast(error.message, { type: "error" });
    if (button) {
      button.disabled = false;
      button.textContent = `Redeem for ${fmt(reward.cost)} pts`;
    }
  }
}

/* ============================================================
   Activity
   ============================================================ */

function renderActivity() {
  const s = state;
  const spent = s.redemptions.reduce((sum, r) => sum + r.cost, 0);
  const activity = s.activity;

  setView(`
    <div class="page-head">
      <div>
        <span class="eyebrow">Your history</span>
        <h1 class="page-title">Activity & milestones</h1>
        <p class="page-sub">Everything you've earned, spent and unlocked in one place.</p>
      </div>
      <a class="btn btn-primary" href="#/surveys">Earn more points</a>
    </div>

    <div class="stat-grid">
      <div class="stat-tile">
        <span class="stat-icon tint-mint" aria-hidden="true">💎</span>
        <div><div class="stat-value">${fmt(s.stats.lifetimeEarned)}</div><div class="stat-label">Lifetime points earned</div></div>
      </div>
      <div class="stat-tile">
        <span class="stat-icon tint-brand" aria-hidden="true">🎁</span>
        <div><div class="stat-value">${fmt(spent)}</div><div class="stat-label">Points redeemed</div></div>
      </div>
      <div class="stat-tile">
        <span class="stat-icon tint-amber" aria-hidden="true">⏱️</span>
        <div><div class="stat-value">${s.stats.minutes} min</div><div class="stat-label">Time shared</div></div>
      </div>
      <div class="stat-tile">
        <span class="stat-icon tint-brand" aria-hidden="true">🗂️</span>
        <div><div class="stat-value">${s.stats.categoriesExplored}/${s.stats.totalCategories}</div><div class="stat-label">Categories explored</div></div>
      </div>
    </div>

    <section class="section">
      <div class="split">
        <div class="panel">
          <div class="panel-head"><h3>Activity feed</h3><span class="tag">${activity.length} events</span></div>
          ${
            activity.length
              ? `<div class="timeline">
                  ${activity
                    .map(
                      (a) => `
                    <div class="tl-item">
                      <span class="tl-icon" aria-hidden="true">${esc(a.emoji || (a.type === "spend" ? "🎁" : "✨"))}</span>
                      <div class="tl-body">
                        <strong>${esc(a.label)}</strong>
                        <small>${timeAgo(a.at)} · ${a.type === "spend" ? "Redemption" : a.type === "bonus" ? "Daily bonus" : "Survey reward"}</small>
                      </div>
                      <span class="tl-amount ${a.points >= 0 ? "plus" : "minus"}">${a.points >= 0 ? "+" : ""}${fmt(a.points)}</span>
                    </div>`,
                    )
                    .join("")}
                </div>`
              : `<div class="empty"><span class="emoji">📭</span><h3>No activity yet</h3><p>Your earnings and redemptions will appear here.</p><a class="btn btn-primary btn-sm" href="#/surveys">Take a survey</a></div>`
          }
        </div>

        <div style="display:flex;flex-direction:column;gap:18px">
          <div class="panel">
            <div class="panel-head"><h3>Achievements</h3><span class="tag">${s.achievements.filter((a) => a.unlocked).length}/${s.achievements.length}</span></div>
            <div class="achievement-list">
              ${s.achievements
                .map(
                  (a) => `
                <div class="ach-row ${a.unlocked ? "" : "is-locked"}">
                  <span class="ach-icon" aria-hidden="true">${a.unlocked ? a.icon : "🔒"}</span>
                  <div class="ach-body">
                    <strong>${esc(a.title)}</strong>
                    <small>${esc(a.desc)}${a.unlocked ? ` · ${dateLabel(a.unlockedAt)}` : ""}</small>
                  </div>
                </div>`,
                )
                .join("")}
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><h3>Leaderboard</h3><span class="tag tag-brand">This month</span></div>
            <div class="leaderboard">
              ${s.leaderboard
                .map(
                  (row) => `
                <div class="lb-row ${row.isYou ? "is-you" : ""}">
                  <span class="lb-rank">${row.rank}</span>
                  <span class="lb-avatar" aria-hidden="true">${row.emoji}</span>
                  <span class="lb-name">${esc(row.name)}${row.isYou ? '<span class="you-tag">YOU</span>' : ""}</span>
                  <span class="lb-points">${fmt(row.points)}</span>
                </div>`,
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>
    </section>
  `);
}

/* ============================================================
   Profile
   ============================================================ */

function renderProfile() {
  const s = state;
  const theme = document.documentElement.dataset.theme;

  setView(`
    <div class="page-head">
      <div>
        <span class="eyebrow">Account</span>
        <h1 class="page-title">Your profile</h1>
        <p class="page-sub">Set how you appear on the leaderboard and tune the app to your liking.</p>
      </div>
    </div>

    <div class="profile-grid">
      <div class="panel profile-hero">
        <span class="avatar avatar-xl" id="profile-avatar-preview">${esc(s.user.emoji)}</span>
        <h2 id="profile-name-preview">${esc(s.user.name)}</h2>
        <span class="member">Member since ${dateLabel(s.user.memberSince)}</span>

        <div class="level-strip">
          <div>
            <strong>${s.level.emoji} ${esc(s.level.name)}</strong>
            <small>${s.level.next ? `${fmt(s.level.toNext)} pts to ${esc(s.level.next.name)}` : "Highest level reached"}</small>
          </div>
          <span class="tag tag-brand">${fmt(s.user.lifetimeEarned)} pts</span>
        </div>
        <div class="level-track" style="width:100%">
          <div class="level-track-bar" style="background:var(--surface-3)">
            <div class="level-track-fill" style="width:${Math.round(s.level.progress * 100)}%;background:linear-gradient(90deg,var(--brand),var(--violet))"></div>
          </div>
        </div>

        <div class="mini-metrics">
          <div class="mini-metric"><b>${fmt(s.user.points)}</b><small>points balance</small></div>
          <div class="mini-metric"><b>${s.stats.completed}</b><small>surveys done</small></div>
          <div class="mini-metric"><b>${s.user.streak} 🔥</b><small>day streak</small></div>
          <div class="mini-metric"><b>${s.stats.redemptions}</b><small>rewards claimed</small></div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="panel">
          <div class="panel-head"><h3>Profile details</h3></div>
          <div class="form">
            <div class="field">
              <label for="profile-name">Display name</label>
              <input id="profile-name" type="text" maxlength="32" value="${esc(s.user.name)}" placeholder="Your name" />
            </div>
            <div class="field">
              <label>Avatar</label>
              <div class="emoji-picker">
                ${AVATARS.map(
                  (emoji) => `
                  <button class="emoji-choice ${emoji === s.user.emoji ? "is-selected" : ""}" data-action="pick-avatar" data-emoji="${emoji}" aria-label="Choose ${emoji}">${emoji}</button>`,
                ).join("")}
              </div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <button class="btn btn-primary" data-action="save-profile">Save changes</button>
              <a class="btn btn-ghost" href="#/activity">View activity</a>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h3>Preferences</h3></div>
          <div class="setting-row">
            <div>
              <strong>Dark mode</strong>
              <small>Easier on the eyes at night.</small>
            </div>
            <button class="switch ${theme === "dark" ? "is-on" : ""}" data-action="toggle-theme" role="switch" aria-checked="${theme === "dark"}" aria-label="Toggle dark mode"></button>
          </div>
          <div class="setting-row">
            <div>
              <strong>Daily bonus</strong>
              <small>${s.dailyBonus.claimable ? `+${s.dailyBonus.amount} points available today.` : "Claimed today — back tomorrow."}</small>
            </div>
            <button class="btn btn-ghost btn-sm" data-action="claim-bonus" ${s.dailyBonus.claimable ? "" : "disabled"}>
              ${s.dailyBonus.claimable ? "Claim" : "Claimed"}
            </button>
          </div>
          <div class="setting-row">
            <div>
              <strong>Reset demo data</strong>
              <small>Clear your points, surveys and rewards on this device.</small>
            </div>
            <button class="btn btn-ghost btn-sm danger-btn" data-action="reset-data">Reset</button>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h3>About PointPilot</h3></div>
          <p style="font-size:13px;color:var(--muted);line-height:1.65">
            PointPilot is a demo survey-and-rewards experience. Your answers and points are stored in a local
            JSON database, keyed to a random ID kept in this browser. No sign-up, no tracking, no real payouts.
          </p>
          <div class="chip-row" style="margin-top:12px">
            <span class="tag tag-mint">100 pts ≈ $1</span>
            <span class="tag tag-brand">Zero dependencies</span>
            <span class="tag">Local-first</span>
          </div>
        </div>
      </div>
    </div>
  `);
}

/* ============================================================
   Modal
   ============================================================ */

function openModal({
  icon = "",
  title,
  body = "",
  bodyHtml = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm = null,
  onCancel = null,
}) {
  ui.confirmAction = onConfirm;
  ui.cancelAction = onCancel;
  modalRoot.innerHTML = `
    <div class="modal-overlay" data-action="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        ${icon ? `<div class="modal-icon" aria-hidden="true">${icon}</div>` : ""}
        <h2 id="modal-title">${title}</h2>
        ${body ? `<p>${body}</p>` : ""}
        ${bodyHtml ? `<div class="modal-body">${bodyHtml}</div>` : ""}
        <div class="modal-actions">
          ${
            cancelLabel
              ? `<button class="btn btn-ghost" data-action="modal-cancel">${esc(cancelLabel)}</button>`
              : ""
          }
          <button class="btn ${danger ? "btn-primary" : "btn-primary"}" data-action="modal-confirm">${esc(confirmLabel)}</button>
        </div>
      </div>
    </div>`;
  document.body.style.overflow = "hidden";
  setTimeout(() => {
    modalRoot.querySelector('[data-action="modal-confirm"]')?.focus({ preventScroll: true });
  }, 40);
}

function closeModal() {
  modalRoot.innerHTML = "";
  document.body.style.overflow = "";
  ui.confirmAction = null;
  ui.cancelAction = null;
}

function errorCard(message) {
  return `
    <div class="empty" style="margin:40px auto;max-width:520px">
      <span class="emoji">😕</span>
      <h3>Something went sideways</h3>
      <p>${esc(message || "We couldn't load that page.")}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:6px">
        <button class="btn btn-primary btn-sm" data-action="retry">Try again</button>
        <a class="btn btn-ghost btn-sm" href="#/home">Back home</a>
      </div>
    </div>`;
}

/* ============================================================
   Onboarding
   ============================================================ */

function maybeOnboard() {
  if (localStorage.getItem(LS_ONBOARDED) === "1") return;
  ui.welcomeEmoji = state.user.emoji && state.user.emoji !== "🙂" ? state.user.emoji : "🦊";
  openModal({
    icon: "👋",
    title: "Welcome to PointPilot",
    body: "Tell us what to call you. Then answer a few short surveys to start earning points.",
    bodyHtml: `
      <div class="form">
        <div class="field">
          <label for="welcome-name">Display name</label>
          <input id="welcome-name" type="text" maxlength="32" placeholder="e.g. Alex" value="${state.user.name === "Guest" ? "" : esc(state.user.name)}" />
        </div>
        <div class="field">
          <label>Pick an avatar</label>
          <div class="emoji-picker">
            ${AVATARS.map(
              (emoji) => `
              <button class="emoji-choice ${emoji === ui.welcomeEmoji ? "is-selected" : ""}" data-action="pick-welcome-avatar" data-emoji="${emoji}" aria-label="Choose ${emoji}">${emoji}</button>`,
            ).join("")}
          </div>
        </div>
      </div>`,
    confirmLabel: "Start earning",
    cancelLabel: "Skip for now",
    onCancel: () => localStorage.setItem(LS_ONBOARDED, "1"),
    onConfirm: async () => {
      const name = document.getElementById("welcome-name")?.value?.trim();
      const button = document.querySelector('[data-action="modal-confirm"]');
      if (button) {
        button.disabled = true;
        button.textContent = "Saving…";
      }
      try {
        const body = { emoji: ui.welcomeEmoji };
        if (name) body.name = name;
        const result = await api("/profile", { method: "POST", body });
        state = result.state;
        refreshChrome();
        localStorage.setItem(LS_ONBOARDED, "1");
        closeModal();
        rerender();
        toast(`Welcome, ${state.user.name}! Your first survey is waiting.`, { emoji: "🎉" });
      } catch (error) {
        toast(error.message, { type: "error" });
        if (button) {
          button.disabled = false;
          button.textContent = "Start earning";
        }
      }
    },
  });
}

/* ============================================================
   Actions
   ============================================================ */

function rerender() {
  const page = (location.hash.replace(/^#\/?/, "").split("/")[0] || "home");
  if (page === "survey") {
    route();
    return;
  }
  switch (page) {
    case "home":
      renderHome();
      break;
    case "surveys":
      renderSurveys();
      break;
    case "rewards":
      renderRewards();
      break;
    case "activity":
      renderActivity();
      break;
    case "profile":
      renderProfile();
      break;
    default:
      renderHome();
  }
}

async function claimBonus() {
  if (!state.dailyBonus.claimable) {
    toast("Today's bonus is already claimed — see you tomorrow.", { emoji: "🔥" });
    return;
  }
  const buttons = $$('[data-action="claim-bonus"]');
  buttons.forEach((b) => {
    b.disabled = true;
  });
  try {
    const result = await api("/daily-bonus", { method: "POST" });
    state = result.state;
    refreshChrome();
    rerender();
    confetti(50);
    toast(`Daily bonus claimed — +${result.amount} points, day ${result.streak} streak!`, { type: "success", emoji: "🔥" });
    result.newlyUnlocked?.forEach((a) => {
      setTimeout(() => toast(`Achievement unlocked — ${a.title}`, { emoji: a.icon }), 900);
    });
  } catch (error) {
    toast(error.message, { type: "error" });
    buttons.forEach((b) => {
      b.disabled = false;
    });
  }
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    toast("Code copied to clipboard", { type: "success", emoji: "📋" });
  } catch {
    const input = document.createElement("textarea");
    input.value = code;
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand("copy");
      toast("Code copied to clipboard", { type: "success", emoji: "📋" });
    } catch {
      toast(`Your code is ${code}`, { emoji: "🎟️" });
    }
    input.remove();
  }
}

async function saveProfile() {
  const input = document.getElementById("profile-name");
  const name = input?.value?.trim();
  const emoji = document.querySelector(".emoji-choice.is-selected")?.dataset.emoji || state.user.emoji;
  if (!name) {
    toast("Please enter a display name.", { type: "error" });
    input?.focus();
    return;
  }
  try {
    const result = await api("/profile", { method: "POST", body: { name, emoji } });
    state = result.state;
    refreshChrome();
    renderProfile();
    toast("Profile updated", { type: "success", emoji: "✅" });
  } catch (error) {
    toast(error.message, { type: "error" });
  }
}

function confirmReset() {
  openModal({
    icon: "🧹",
    title: "Reset your demo data?",
    body: "This clears your points, completed surveys, streak and reward codes on this device. It can't be undone.",
    confirmLabel: "Yes, reset everything",
    cancelLabel: "Keep my data",
    danger: true,
    onConfirm: async () => {
      try {
        const result = await api("/reset", { method: "POST" });
        state = result.state;
        closeModal();
        refreshChrome();
        localStorage.setItem(LS_ONBOARDED, "1");
        go("#/home");
        setTimeout(() => {
          rerender();
          toast("Fresh start — everything reset.", { emoji: "🌱" });
        }, 20);
      } catch (error) {
        toast(error.message, { type: "error" });
      }
    },
  });
}

/* ---------- delegated clicks ---------- */

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  switch (action) {
    case "toggle-theme":
      event.preventDefault();
      toggleTheme();
      if ((location.hash || "").includes("/profile")) setTimeout(renderProfile, 10);
      break;
    case "claim-bonus":
      event.preventDefault();
      claimBonus();
      break;
    case "filter-category":
      ui.category = target.dataset.category || "all";
      ui.q = "";
      $("#global-search").value = "";
      if (!(location.hash || "").includes("surveys")) go("#/surveys");
      else renderSurveys();
      break;
    case "clear-filters": {
      ui.q = "";
      ui.category = "all";
      const search = $("#global-search");
      if (search) search.value = "";
      renderSurveys();
      break;
    }
    case "reward-filter":
      ui.rewardFilter = target.dataset.type || "all";
      renderRewards();
      break;
    case "redeem": {
      const reward = state.rewards.find((r) => r.id === target.dataset.reward);
      if (reward) openRedeemModal(reward);
      break;
    }
    case "copy-code":
      copyCode(target.dataset.code);
      break;
    case "answer-single":
      if (!runner) return;
      runner.answers[runner.survey.questions[runner.index].id] = target.dataset.value;
      paintSelection(runner.survey.questions[runner.index]);
      break;
    case "answer-multi": {
      if (!runner) return;
      const question = runner.survey.questions[runner.index];
      const current = Array.isArray(runner.answers[question.id]) ? [...runner.answers[question.id]] : [];
      const value = target.dataset.value;
      const at = current.indexOf(value);
      if (at >= 0) current.splice(at, 1);
      else current.push(value);
      runner.answers[question.id] = current;
      paintSelection(question);
      break;
    }
    case "answer-scale":
      if (!runner) return;
      runner.answers[runner.survey.questions[runner.index].id] = Number(target.dataset.value);
      paintSelection(runner.survey.questions[runner.index]);
      break;
    case "answer-rating":
      if (!runner) return;
      runner.answers[runner.survey.questions[runner.index].id] = Number(target.dataset.value);
      paintSelection(runner.survey.questions[runner.index]);
      break;
    case "next-question":
      nextQuestion();
      break;
    case "prev-question":
      prevQuestion();
      break;
    case "submit-survey":
      submitSurvey();
      break;
    case "exit-survey":
      autosave();
      break;
    case "pick-avatar": {
      $$(".emoji-choice", document.querySelector(".profile-grid") || document).forEach((el) =>
        el.classList.toggle("is-selected", el === target),
      );
      const preview = document.getElementById("profile-avatar-preview");
      if (preview) preview.textContent = target.dataset.emoji;
      break;
    }
    case "pick-welcome-avatar":
      ui.welcomeEmoji = target.dataset.emoji;
      $$(".emoji-choice", modalRoot).forEach((el) => el.classList.toggle("is-selected", el === target));
      break;
    case "save-profile":
      saveProfile();
      break;
    case "reset-data":
      confirmReset();
      break;
    case "modal-backdrop":
      if (event.target === target) closeModal();
      break;
    case "modal-cancel": {
      const cancel = ui.cancelAction;
      closeModal();
      cancel?.();
      break;
    }
    case "modal-confirm":
      ui.confirmAction?.();
      break;
    case "retry":
      route();
      break;
    default:
      break;
  }
});

/* ---------- inputs ---------- */

document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id === "catalog-search") {
    ui.q = el.value;
    refreshSurveyResults();
  }
  if (el.id === "profile-name") {
    const preview = document.getElementById("profile-name-preview");
    if (preview) preview.textContent = el.value.trim() || "Guest";
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "sort-select") {
    ui.sort = event.target.value;
    refreshSurveyResults();
  }
});

document.getElementById("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  ui.q = $("#global-search").value;
  ui.category = "all";
  if ((location.hash || "").includes("surveys")) renderSurveys();
  else go("#/surveys");
});

$("#global-search").addEventListener("input", (event) => {
  if (event.target.value === "") {
    ui.q = "";
    if ((location.hash || "").includes("surveys")) refreshSurveyResults();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modalRoot.innerHTML) closeModal();
  const interactiveTag = ["BUTTON", "INPUT", "TEXTAREA", "SELECT", "A"].includes(event.target.tagName);
  if (event.key === "Enter" && runner && !interactiveTag) {
    // Enter advances the survey when focus is on the page body.
    if (event.target.closest(".q-card") || event.target === document.body) {
      event.preventDefault();
      const isLast = runner.index === runner.survey.questions.length - 1;
      if (isLast) submitSurvey();
      else nextQuestion();
    }
  }
});

window.addEventListener("hashchange", () => {
  route();
});

/* ============================================================
   Router + boot
   ============================================================ */

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [page = "", param = ""] = raw.split("/");
  let decoded = param || "";
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = "";
  }
  return { page: page || "home", param: decoded };
}

async function route() {
  if (!state) return;
  const token = ++routeToken;
  const { page, param } = parseRoute();
  if (runner && page !== "survey") {
    autosave();
    runner = null;
  }
  if (modalRoot.innerHTML) closeModal();
  setActiveNav(page);
  window.scrollTo({ top: 0, behavior: "instant" });

  switch (page) {
    case "home":
      runner = null;
      renderHome();
      break;
    case "surveys":
      runner = null;
      renderSurveys();
      break;
    case "survey":
      if (!param) {
        go("#/surveys");
        return;
      }
      await renderSurveyPage(param, token);
      break;
    case "rewards":
      runner = null;
      renderRewards();
      break;
    case "activity":
      runner = null;
      renderActivity();
      break;
    case "profile":
      runner = null;
      renderProfile();
      break;
    default:
      renderNotFound();
  }
}

function renderNotFound() {
  setView(`
    <div class="empty" style="margin:60px auto;max-width:520px">
      <span class="emoji">🧭</span>
      <h3>This page took a wrong turn</h3>
      <p>The link you followed doesn't exist. Your points are safe, though.</p>
      <a class="btn btn-primary btn-sm" href="#/home">Back to dashboard</a>
    </div>`);
}

async function boot() {
  applyTheme();
  try {
    const data = await api("/bootstrap");
    state = data.state;
    refreshChrome();
    if (!location.hash) location.replace("#/home");
    await route();
    maybeOnboard();
  } catch (error) {
    setView(errorCard(error.message || "Could not reach the PointPilot server."));
  }
}

boot();
