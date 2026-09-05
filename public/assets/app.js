const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

const state = {
  items: [],
  settings: {},
  category: "全部",
  favoritesOnly: false,
  recent: JSON.parse(localStorage.getItem("sln_recent") || "[]"),
  favorites: JSON.parse(localStorage.getItem("sln_favorites") || "[]"),
};

function iconUrl(url) {
  try {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}&sz=64`;
  } catch {
    return "";
  }
}

function savePrefs() {
  localStorage.setItem("sln_recent", JSON.stringify(state.recent.slice(0, 8)));
  localStorage.setItem("sln_favorites", JSON.stringify(state.favorites));
}

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function applySettings() {
  const s = state.settings;
  const siteTitle = s.site_title || "My Navigation";
  const subtitle = s.site_subtitle || "Personal links";
  const heroTitle = s.hero_title || "Everything you need, one click away.";
  const heroDescription = s.hero_description || s.site_description || "A fast, elegant home for your frequently used websites.";

  document.title = siteTitle;
  $("#siteTitle").textContent = siteTitle;
  $("#siteSubtitle").textContent = subtitle;
  $("#heroTitle").textContent = heroTitle;
  $("#heroDesc").textContent = heroDescription;
  $("#footerText").textContent = subtitle;

  if (s.accent && /^#[0-9a-fA-F]{6}$/.test(s.accent)) {
    document.documentElement.style.setProperty("--primary", s.accent);
  }
}

async function init() {
  try {
    const [navigation, settings] = await Promise.all([
      api("/api/public/navigation"),
      api("/api/public/settings"),
    ]);
    state.items = navigation.items || [];
    state.settings = settings.settings || {};
    applySettings();
    renderCats();
    render();
    renderRecent();
  } catch (error) {
    $("#navGrid").innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${esc(error.message)}</p></div>`;
  }
}

function renderCats() {
  const cats = ["全部", ...new Set(state.items.map((item) => item.category).filter(Boolean))];
  $("#categoryChips").innerHTML = cats.map((category) => `
    <button class="chip ${state.category === category ? "active" : ""}" data-cat="${esc(category)}">${esc(category)}</button>
  `).join("");

  document.querySelectorAll("[data-cat]").forEach((button) => {
    button.onclick = () => {
      state.category = button.dataset.cat;
      renderCats();
      render();
    };
  });
}

function filtered() {
  const query = $("#searchInput").value.trim().toLowerCase();
  return state.items.filter((item) =>
    (state.category === "全部" || item.category === state.category) &&
    (!state.favoritesOnly || state.favorites.includes(item.id)) &&
    (!query || [item.title, item.description, item.category, item.url].join(" ").toLowerCase().includes(query))
  );
}

function render() {
  const list = filtered();
  $("#navGrid").innerHTML = list.map((item, index) => {
    const favorite = state.favorites.includes(item.id);
    const icon = item.icon || iconUrl(item.url);
    let fallback = "?";
    try { fallback = (item.title || new URL(item.url).hostname || "?")[0].toUpperCase(); } catch {}

    return `<a class="nav-card" style="animation:fadeUp .28s ease ${Math.min(index, 10) * 0.035}s both" href="${esc(item.url)}" data-id="${item.id}">
      <div class="nav-top">
        <img class="site-icon" src="${esc(icon)}" alt="" onerror="this.outerHTML='<span class=&quot;site-icon site-icon-fallback&quot;>${esc(fallback)}</span>'">
        <button class="favorite ${favorite ? "active" : ""}" data-fav="${item.id}" title="收藏" aria-label="收藏">${favorite ? "★" : "☆"}</button>
      </div>
      <h3>${esc(item.title)}</h3>
      <p>${esc(item.description || (() => { try { return new URL(item.url).hostname; } catch { return item.url; } })())}</p>
      <div class="nav-meta">${item.category ? `<span class="tag">${esc(item.category)}</span>` : ""}</div>
    </a>`;
  }).join("");

  $("#emptyState").classList.toggle("hidden", list.length > 0);

  document.querySelectorAll("[data-fav]").forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = Number(button.dataset.fav);
      state.favorites = state.favorites.includes(id)
        ? state.favorites.filter((value) => value !== id)
        : [...state.favorites, id];
      savePrefs();
      render();
      renderRecent();
    };
  });

  document.querySelectorAll(".nav-card").forEach((card) => {
    card.onclick = () => {
      const id = Number(card.dataset.id);
      state.recent = [id, ...state.recent.filter((value) => value !== id)];
      savePrefs();
    };
  });
}

function renderRecent() {
  const items = state.recent.map((id) => state.items.find((item) => item.id === id)).filter(Boolean);
  $("#recentGrid").innerHTML = items.length
    ? items.map((item) => `<a class="recent-item" href="${esc(item.url)}"><img src="${esc(item.icon || iconUrl(item.url))}" alt=""><span>${esc(item.title)}</span></a>`).join("")
    : '<span style="color:var(--faint);font-size:13px">还没有访问记录</span>';
}

$("#searchInput").oninput = render;
$("#favoritesOnly").onclick = () => {
  state.favoritesOnly = !state.favoritesOnly;
  $("#favoritesOnly").textContent = state.favoritesOnly ? "★ 已收藏" : "☆ 收藏";
  render();
};
$("#clearFilters").onclick = () => {
  $("#searchInput").value = "";
  state.category = "全部";
  state.favoritesOnly = false;
  $("#favoritesOnly").textContent = "☆ 收藏";
  renderCats();
  render();
};
$("#clearRecent").onclick = () => {
  state.recent = [];
  savePrefs();
  renderRecent();
};

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    $("#searchInput").focus();
  }
});

function toggleTheme() {
  const light = document.documentElement.dataset.theme !== "light";
  document.documentElement.dataset.theme = light ? "light" : "dark";
  localStorage.setItem("sln_theme", light ? "light" : "dark");
  $("#themeBtn").textContent = light ? "☀" : "☾";
}

const savedTheme = localStorage.getItem("sln_theme");
if (savedTheme === "light") document.documentElement.dataset.theme = "light";
$("#themeBtn").textContent = savedTheme === "light" ? "☀" : "☾";
$("#themeBtn").onclick = toggleTheme;

init();
