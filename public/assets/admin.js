const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

const A = { links: [], nav: [], settings: {}, chart: null };

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  $("#toastRoot").appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

async function boot() {
  try {
    const me = await api("/api/auth/me");
    if (me.authenticated) showAdmin(); else showLogin();
  } catch {
    showLogin();
  }
}

function showLogin() {
  $("#loginView").classList.remove("hidden");
  $("#adminView").classList.add("hidden");
}

function showAdmin() {
  $("#loginView").classList.add("hidden");
  $("#adminView").classList.remove("hidden");
  loadAll();
}

$("#loginForm").onsubmit = async (event) => {
  event.preventDefault();
  $("#loginError").textContent = "";
  try {
    await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: $("#password").value }),
    });
    $("#password").value = "";
    showAdmin();
  } catch (error) {
    $("#loginError").textContent = error.message;
  }
};

$("#logoutBtn").onclick = async () => {
  try { await api("/api/auth/logout", { method: "POST" }); } finally { location.reload(); }
};

document.querySelectorAll(".side-item").forEach((button) => {
  button.onclick = () => switchSection(button.dataset.section);
});

function switchSection(section) {
  document.querySelectorAll(".side-item").forEach((button) => button.classList.toggle("active", button.dataset.section === section));
  document.querySelectorAll(".admin-section").forEach((node) => node.classList.add("hidden"));
  $("#section-" + section).classList.remove("hidden");
  const map = {
    overview: ["OVERVIEW", "控制台"],
    links: ["SHORT LINKS", "短链接"],
    navigation: ["NAVIGATION", "导航管理"],
    settings: ["SETTINGS", "系统设置"],
  };
  $("#sectionEyebrow").textContent = map[section][0];
  $("#sectionTitle").textContent = map[section][1];
}

async function loadAll() {
  try {
    const [dashboard, links, navigation, settings] = await Promise.all([
      api("/api/admin/dashboard"),
      api("/api/admin/links"),
      api("/api/admin/navigation"),
      api("/api/admin/settings"),
    ]);
    A.links = links.items || [];
    A.nav = navigation.items || [];
    A.settings = settings.settings || {};
    renderDashboard(dashboard);
    renderLinks();
    renderNav();
    fillSettings();
  } catch (error) {
    toast(error.message);
    if (error.message === "未登录") showLogin();
  }
}

function renderDashboard(data) {
  const stats = data.stats || {};
  $("#statsGrid").innerHTML = [
    ["总短链接", stats.links || 0],
    ["总点击", stats.clicks || 0],
    ["导航项目", stats.navigation || 0],
    ["近14天点击", stats.recentClicks || 0],
  ].map(([label, value]) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${Number(value).toLocaleString()}</div></div>`).join("");

  $("#topLinks").innerHTML = (data.topLinks || []).slice(0, 7).map((item) => `
    <div class="mini-row"><div><strong>${esc(item.code)}</strong><small>${esc(item.title || item.url)}</small></div><b>${item.clicks || 0}</b></div>
  `).join("") || '<p style="color:var(--faint)">暂无数据</p>';
  drawChart(data.trend || []);
}

function drawChart(rows) {
  const canvas = $("#clickChart");
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(300, Math.floor(rect.width));
  const height = Math.max(220, Math.floor(rect.height));
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const W = width, H = height, padding = 22;
  const max = Math.max(1, ...rows.map((row) => Number(row.clicks) || 0));
  const styles = getComputedStyle(document.documentElement);

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = styles.getPropertyValue("--border2");
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = padding + (H - padding * 2) * i / 3;
    ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(W - padding, y); ctx.stroke();
  }

  if (!rows.length) return;
  ctx.strokeStyle = styles.getPropertyValue("--primary");
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  rows.forEach((row, index) => {
    const x = padding + (W - padding * 2) * index / Math.max(1, rows.length - 1);
    const y = H - padding - (H - padding * 2) * ((Number(row.clicks) || 0) / max);
    index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}

function renderLinks() {
  const query = ($("#linkSearch")?.value || "").toLowerCase();
  const rows = A.links.filter((item) => [item.code, item.url, item.title, item.category].join(" ").toLowerCase().includes(query));
  $("#linksTable").innerHTML = rows.map((item) => `
    <tr>
      <td><strong>/${esc(item.code)}</strong></td>
      <td><div style="max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.title || item.url)}</div></td>
      <td>${esc(item.category || "—")}</td><td>${item.clicks || 0}</td>
      <td><span class="status ${item.enabled ? "on" : "off"}">${item.enabled ? "启用" : "停用"}</span></td>
      <td><div class="row-actions"><button class="small-btn" data-act="qr" data-id="${item.id}">QR</button><button class="small-btn" data-act="edit" data-id="${item.id}">编辑</button><button class="small-btn" data-act="del" data-id="${item.id}">删除</button></div></td>
    </tr>
  `).join("") || '<tr><td colspan="6" style="text-align:center;padding:40px">暂无短链接</td></tr>';
}

$("#linkSearch").oninput = renderLinks;
$("#linksTable").onclick = (event) => {
  const button = event.target.closest("[data-act]");
  if (!button) return;
  const item = A.links.find((value) => value.id == button.dataset.id);
  if (!item) return;
  if (button.dataset.act === "edit") linkModal(item);
  if (button.dataset.act === "del") deleteLink(item);
  if (button.dataset.act === "qr") qrModal(item);
};

function linkModal(item = null) {
  openModal(item ? "编辑短链接" : "新建短链接", `
    <form class="modal-form" id="linkForm">
      <div class="two"><label>短码（留空自动生成）<input name="code" value="${esc(item?.code || "")}" placeholder="例如 docs"></label><label>分类<input name="category" value="${esc(item?.category || "")}" placeholder="工作"></label></div>
      <label>目标 URL<input name="url" required value="${esc(item?.url || "")}" placeholder="https://example.com"></label>
      <label>标题<input name="title" value="${esc(item?.title || "")}"></label>
      <label>描述<textarea name="description" rows="3">${esc(item?.description || "")}</textarea></label>
      <label class="checkbox"><input name="enabled" type="checkbox" ${item?.enabled !== false ? "checked" : ""}> 启用</label>
      <button class="btn primary">保存</button>
    </form>
  `);

  $("#linkForm").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const data = Object.fromEntries(form.entries());
    data.enabled = form.get("enabled") === "on";
    try {
      await api(item ? `/api/admin/links/${item.id}` : "/api/admin/links", {
        method: item ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      closeModal(); toast("已保存"); await loadAll();
    } catch (error) { toast(error.message); }
  };
}

async function deleteLink(item) {
  if (!confirm(`确定删除 /${item.code} 吗？`)) return;
  try { await api(`/api/admin/links/${item.id}`, { method: "DELETE" }); toast("已删除"); await loadAll(); }
  catch (error) { toast(error.message); }
}

function qrModal(item) {
  openModal("短链接二维码", `
    <div style="text-align:center"><div class="qr-box"><canvas id="qrCanvas"></canvas></div><strong>/${esc(item.code)}</strong><p style="color:var(--muted);word-break:break-all">${esc(location.origin + "/" + item.code)}</p><button class="btn primary" id="downloadQr">下载二维码</button></div>
  `);
  const canvas = $("#qrCanvas");
  QRCode.toCanvas(canvas, `${location.origin}/${item.code}`, { width: 220, margin: 1 }, (error) => { if (error) toast("二维码生成失败"); });
  $("#downloadQr").onclick = () => {
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${item.code}-qrcode.png`;
    link.click();
  };
}

$("#addLinkBtn").onclick = () => linkModal();
$("#addNavBtn").onclick = () => navModal();

function iconUrl(url) {
  try { return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}&sz=64`; }
  catch { return ""; }
}

function navIcon(item) { return item.icon || iconUrl(item.url); }

function renderNav() {
  const element = $("#navAdminGrid");
  element.innerHTML = A.nav.map((item) => `
    <div class="admin-nav-card" draggable="true" data-id="${item.id}">
      <div class="admin-nav-head">
        <img class="site-icon" src="${esc(navIcon(item))}" alt="" onerror="this.style.display='none'">
        <div><strong>${esc(item.title)}</strong><small style="display:block;color:var(--faint)">${esc(item.category || "未分类")}</small></div>
        <span class="drag-handle">⠿</span>
      </div>
      <p>${esc(item.description || item.url)}</p>
      <div class="row-actions" style="margin-top:12px"><button class="small-btn" data-navact="edit" data-id="${item.id}">编辑</button><button class="small-btn" data-navact="del" data-id="${item.id}">删除</button></div>
    </div>
  `).join("") || '<div class="panel" style="padding:30px">暂无导航</div>';
  bindDrag();
}

function bindDrag() {
  let dragging = null;
  document.querySelectorAll(".admin-nav-card").forEach((card) => {
    card.ondragstart = () => { dragging = card; card.classList.add("dragging"); };
    card.ondragend = () => { card.classList.remove("dragging"); dragging = null; };
    card.ondragover = (event) => {
      event.preventDefault();
      if (!dragging || dragging === card) return;
      const rect = card.getBoundingClientRect();
      card.parentNode.insertBefore(dragging, event.clientY > rect.top + rect.height / 2 ? card.nextSibling : card);
    };
  });
}

$("#navAdminGrid").onclick = (event) => {
  const button = event.target.closest("[data-navact]");
  if (!button) return;
  const item = A.nav.find((value) => value.id == button.dataset.id);
  if (!item) return;
  button.dataset.navact === "edit" ? navModal(item) : deleteNav(item);
};

$("#saveNavOrder").onclick = async () => {
  const ids = [...document.querySelectorAll(".admin-nav-card")].map((node) => Number(node.dataset.id));
  try { await api("/api/admin/navigation/reorder", { method: "POST", body: JSON.stringify({ ids }) }); toast("排序已保存"); await loadAll(); }
  catch (error) { toast(error.message); }
};

function navModal(item = null) {
  openModal(item ? "编辑导航" : "添加导航", `
    <form class="modal-form" id="navForm">
      <div class="two"><label>标题<input name="title" required value="${esc(item?.title || "")}"></label><label>分类<input name="category" value="${esc(item?.category || "")}" placeholder="工具"></label></div>
      <label>URL<input name="url" required value="${esc(item?.url || "")}"></label>
      <label>描述<textarea name="description" rows="3">${esc(item?.description || "")}</textarea></label>
      <label>图标 URL（可选）<input name="icon" value="${esc(item?.icon || "")}" placeholder="留空自动使用网站 favicon"></label>
      <label class="checkbox"><input name="enabled" type="checkbox" ${item?.enabled !== false ? "checked" : ""}> 启用</label>
      <button class="btn primary">保存</button>
    </form>
  `);

  $("#navForm").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const data = Object.fromEntries(form.entries());
    data.enabled = form.get("enabled") === "on";
    try {
      await api(item ? `/api/admin/navigation/${item.id}` : "/api/admin/navigation", {
        method: item ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      closeModal(); toast("已保存"); await loadAll();
    } catch (error) { toast(error.message); }
  };
}

async function deleteNav(item) {
  if (!confirm(`确定删除「${item.title}」吗？`)) return;
  try { await api(`/api/admin/navigation/${item.id}`, { method: "DELETE" }); toast("已删除"); await loadAll(); }
  catch (error) { toast(error.message); }
}

function fillSettings() {
  const form = $("#settingsForm");
  ["site_title", "site_subtitle", "site_description", "hero_title", "hero_description", "accent"].forEach((key) => {
    if (form.elements[key]) form.elements[key].value = A.settings[key] || (key === "accent" ? "#8b6cff" : "");
  });
}

$("#settingsForm").onsubmit = async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  try {
    await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(data) });
    A.settings = { ...A.settings, ...data };
    $("#settingsMessage").textContent = "设置已保存";
    toast("设置已保存");
  } catch (error) { $("#settingsMessage").textContent = error.message; }
};

function openModal(title, html) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = html;
  $("#modal").classList.remove("hidden");
}
function closeModal() { $("#modal").classList.add("hidden"); }
document.querySelectorAll("[data-close-modal]").forEach((node) => node.onclick = closeModal);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });

$("#exportLinks").onclick = () => {
  const headers = ["code", "url", "title", "description", "category", "enabled"];
  const csv = [headers.join(","), ...A.links.map((item) => headers.map((key) => `"${String(item[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  link.download = "shortlinks.csv";
  link.click();
  URL.revokeObjectURL(link.href);
};

$("#importLinksBtn").onclick = () => $("#csvFile").click();
$("#csvFile").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const lines = text.replace(/^\ufeff/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) { toast("CSV 没有数据"); return; }

  const parseCsvLine = (line) => {
    const values = [];
    let current = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { values.push(current); current = ""; }
      else current += char;
    }
    values.push(current);
    return values;
  };

  const headers = parseCsvLine(lines[0]).map((x) => x.trim());
  let success = 0;
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line), data = {};
    headers.forEach((key, index) => data[key] = values[index] || "");
    data.enabled = data.enabled !== "false";
    try { await api("/api/admin/links", { method: "POST", body: JSON.stringify(data) }); success++; } catch {}
  }
  toast(`导入完成：${success} 条`);
  event.target.value = "";
  await loadAll();
};

function toggleAdminTheme() {
  document.documentElement.classList.toggle("light-admin");
  localStorage.setItem("sln_admin_theme", document.documentElement.classList.contains("light-admin") ? "light" : "dark");
  $("#adminThemeBtn").textContent = document.documentElement.classList.contains("light-admin") ? "☀" : "☾";
}
if (localStorage.getItem("sln_admin_theme") === "light") document.documentElement.classList.add("light-admin");
$("#adminThemeBtn").textContent = document.documentElement.classList.contains("light-admin") ? "☀" : "☾";
$("#adminThemeBtn").onclick = toggleAdminTheme;

boot();
