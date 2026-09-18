const A = {
  links: [], nav: [], settings: {}, navSelected: new Set(), navDirty: false,
  linkPage: 1, navPage: 1, linkTotal: 0, navTotal: 0, linkPages: 1, navPages: 1,
  navCategories: [], navOrderIds: [], linkSelected: new Set(), loadSeq: 0,
  linkSort: localStorage.getItem("stnav_link_sort") || "created_desc",
  linkPageSize: Number(localStorage.getItem("stnav_link_page_size")) || 10,
  navPageSize: Number(localStorage.getItem("stnav_nav_page_size")) || 12,
};

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  $("#toastRoot").appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

function formData(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  data.enabled = form.elements.enabled?.checked ?? false;
  return data;
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
    links: ["SHORT LINKS", "短链接管理"],
    navigation: ["NAVIGATION", "导航管理"],
    settings: ["SYSTEM MANAGEMENT", "系统管理"],
    data: ["DATA MANAGEMENT", "数据管理"],
  };
  $("#sectionEyebrow").textContent = map[section][0];
  $("#sectionTitle").textContent = map[section][1];
}

async function loadAll({ resetPages = false } = {}) {
  try {
    if (resetPages) {
      A.linkPage = 1;
      A.navPage = 1;
    }
    const params = new URLSearchParams({
      links_page: String(A.linkPage),
      links_page_size: String(A.linkPageSize),
      links_sort: A.linkSort || "created_desc",
      links_search: String($("#linkSearch")?.value || "").trim(),
      nav_page: String(A.navPage),
      nav_page_size: String(A.navPageSize),
      nav_search: String($("#navSearch")?.value || "").trim(),
      nav_category: String($("#navCategoryFilter")?.value || ""),
    });
    const loadSeq = ++A.loadSeq;
    const data = await api(`/api/admin/bootstrap?${params.toString()}`);
    if (loadSeq !== A.loadSeq) return;
    A.links = data.links || [];
    A.nav = data.navigation || [];
    A.settings = data.settings || {};
    A.linkTotal = Number(data.links_pagination?.total || 0);
    A.navTotal = Number(data.navigation_pagination?.total || 0);
    A.linkPages = Number(data.links_pagination?.pages || 1);
    A.navPages = Number(data.navigation_pagination?.pages || 1);
    A.linkPage = Number(data.links_pagination?.page || 1);
    A.navPage = Number(data.navigation_pagination?.page || 1);
    A.navCategories = data.navigation_categories || [];
    A.navOrderIds = (data.navigation_order || []).map(Number);
    A.navSelected = new Set([...A.navSelected].filter((id) => A.navOrderIds.includes(Number(id))));
    A.linkSelected = new Set([...A.linkSelected].filter((id) => Number.isInteger(Number(id)) && Number(id) > 0));
    A.navDirty = false;
    renderDashboard(data.dashboard || {});
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
  const wrap = canvas?.parentElement;
  if (!canvas || !wrap) return;

  // Use the chart container's content box instead of the canvas' intrinsic
  // 300x150 size. The old implementation could make the canvas taller than
  // .chart-wrap, causing the line to visually escape the panel on desktop
  // and mobile. Keep a small minimum only for the drawing math, never the DOM.
  const width = Math.max(1, Math.floor(wrap.clientWidth));
  const height = Math.max(1, Math.floor(wrap.clientHeight));
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const W = width, H = height;
  const padding = Math.min(22, Math.max(12, Math.floor(Math.min(W, H) * 0.08)));
  const lineWidth = 3;
  const left = padding + lineWidth / 2;
  const right = Math.max(left, W - padding - lineWidth / 2);
  const top = padding + lineWidth / 2;
  const bottom = Math.max(top, H - padding - lineWidth / 2);
  const max = Math.max(1, ...rows.map((row) => Number(row.clicks) || 0));
  const styles = getComputedStyle(document.documentElement);

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = styles.getPropertyValue("--border2");
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = padding + (H - padding * 2) * i / 3;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(W - padding, y);
    ctx.stroke();
  }
  if (!rows.length) return;

  ctx.strokeStyle = styles.getPropertyValue("--primary");
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  rows.forEach((row, index) => {
    const x = rows.length === 1
      ? (left + right) / 2
      : left + (right - left) * index / (rows.length - 1);
    const value = Math.max(0, Number(row.clicks) || 0);
    const y = bottom - (bottom - top) * (value / max);
    index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}

function linkedNav(item) {
  if (item?.navigation_id) return { id: Number(item.navigation_id) };
  return A.nav.find((nav) => Number(nav.link_id) === Number(item?.id));
}

function renderPagination(container, page, total, pageSize, onChange) {
  const node = $(container);
  if (!node) return;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const start = Math.max(1, Math.min(current - 2, pages - 4));
  const end = Math.min(pages, start + 4);
  const pageButtons = [];
  for (let p = start; p <= end; p++) {
    pageButtons.push(`<button class="page-btn ${p === current ? "active" : ""}" data-page="${p}">${p}</button>`);
  }
  node.innerHTML = `
    <span class="pagination-info">共 ${total} 项，第 ${current}/${pages} 页</span>
    <div class="pagination-actions">
      <label class="page-size-label">每页 <select class="page-size-select">
        ${[5,8,10,12,20,32,50].map((size) => `<option value="${size}" ${size === pageSize ? "selected" : ""}>${size}</option>`).join("")}
      </select> 项</label>
      <button class="page-btn" data-page="${current - 1}" ${current <= 1 ? "disabled" : ""}>上一页</button>
      ${pageButtons.join("")}
      <button class="page-btn" data-page="${current + 1}" ${current >= pages ? "disabled" : ""}>下一页</button>
    </div>`;
  node.querySelectorAll("[data-page]").forEach((button) => {
    button.onclick = () => {
      const target = Number(button.dataset.page);
      if (target >= 1 && target <= pages && target !== current) onChange(target);
    };
  });
  const sizeSelect = node.querySelector(".page-size-select");
  if (sizeSelect) {
    sizeSelect.onchange = () => {
      const size = Number(sizeSelect.value);
      if (!Number.isFinite(size) || size < 1) return;
      onChange(1, size);
    };
  }
}

function getFilteredLinks() {
  return A.links;
}

function syncLinkSelection() {
  A.linkSelected = new Set([...A.linkSelected].map(Number).filter((id) => Number.isInteger(id) && id > 0));
}

function updateLinkBulkUi() {
  syncLinkSelection();
  const count = A.linkSelected.size;
  const node = $("#linkSelectedCount");
  if (node) node.textContent = `已选 ${count} 项`;
  const selectedIds = new Set(A.linkSelected);
  document.querySelectorAll("#linksTable .link-select, #linksMobileList .link-select").forEach((input) => {
    input.checked = selectedIds.has(Number(input.dataset.id));
  });
}

async function selectVisibleLinks(all = false) {
  if (!all) {
    A.links.forEach((item) => A.linkSelected.add(Number(item.id)));
    renderLinks();
    toast(`已选择本页 ${A.links.length} 项`);
    return;
  }
  try {
    const params = new URLSearchParams({
      search: String($("#linkSearch")?.value || "").trim(),
      sort: A.linkSort || "created_desc",
    });
    const result = await api(`/api/admin/links/ids?${params.toString()}`);
    const ids = (result.ids || []).map(Number);
    ids.forEach((id) => A.linkSelected.add(id));
    renderLinks();
    toast(`已选择 ${ids.length} 项（当前筛选结果）`);
  } catch (error) {
    toast(`选择全部失败：${error.message}`);
  }
}

function clearSelectedLinks() {
  A.linkSelected.clear();
  updateLinkBulkUi();
}

async function toggleLinkFavorite(item) {
  const next = !Number(item.favorite);
  const previous = Number(item.favorite) ? 1 : 0;
  item.favorite = next ? 1 : 0;
  renderLinks();
  try {
    await api(`/api/admin/links/${item.id}/favorite`, {
      method: "PATCH",
      body: JSON.stringify({ favorite: next }),
    });
    toast(next ? `已收藏 /${item.code}` : `已取消收藏 /${item.code}`);
  } catch (error) {
    item.favorite = previous;
    renderLinks();
    toast(`收藏操作失败：${error.message}`);
  }
}

function openShortLink(item) {
  const url = item.short_url || `${location.origin}/${encodeURIComponent(item.code)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function toggleLinkEnabled(item) {
  const next = !Boolean(item.enabled);
  const previous = Boolean(item.enabled);
  item.enabled = next ? 1 : 0;
  renderLinks();
  try {
    await api(`/api/admin/links/${item.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: next }),
    });
    toast(next ? `已启用 /${item.code}` : `已停用 /${item.code}`);
  } catch (error) {
    item.enabled = previous ? 1 : 0;
    renderLinks();
    toast(`状态修改失败：${error.message}`);
  }
}

async function copyShortLink(item) {
  const url = item.short_url || `${location.origin}/${item.code}`;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
    else {
      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand("copy");
      input.remove();
      if (!ok) throw new Error("浏览器未允许复制");
    }
    toast("短链接已复制");
  } catch (error) {
    toast(`复制失败：${error.message}`);
  }
}

async function bulkLinkAction(action) {
  syncLinkSelection();
  const ids = [...A.linkSelected];
  if (!ids.length) return toast("请先选择短链接");

  const messages = {
    add_navigation: "批量加入导航",
    remove_navigation: "批量从导航移除",
    enable: "批量启用",
    disable: "批量停用",
    delete: "批量删除",
  };
  if (action === "delete" && !confirm(`确定删除已选择的 ${ids.length} 个短链接吗？\n已关联的导航项目也会一起删除。`)) return;
  if (action === "remove_navigation" && !confirm(`确定将已选择的 ${ids.length} 个短链接从导航中移除吗？\n不会删除短链接本身。`)) return;

  const button = document.querySelector(`[data-bulk-action="${action}"]`);
  if (button) button.disabled = true;
  try {
    const result = await api("/api/admin/links/bulk", {
      method: "POST",
      body: JSON.stringify({ ids, action }),
    });
    A.linkSelected.clear();
    const failed = Number(result.failed || 0);
    toast(`${messages[action]}完成：${Number(result.affected || 0)} 项${failed ? `，${failed} 项未处理` : ""}`);
    await loadAll();
  } catch (error) {
    toast(`${messages[action]}失败：${error.message}`);
  } finally {
    if (button) button.disabled = false;
  }
}

function renderLinks() {
  const pageRows = A.links;
  const selectedIds = new Set(A.linkSelected);

  $("#linksTable").innerHTML = pageRows.map((item) => {
    const linked = linkedNav(item);
    const id = Number(item.id);
    return `
      <tr class="link-dense-row">
        <td data-label="选择" class="link-select-cell"><input class="link-select" type="checkbox" data-id="${id}" aria-label="选择 /${esc(item.code)}" ${selectedIds.has(id) ? "checked" : ""}></td>
        <td data-label="短码"><strong>/${esc(item.code)}</strong></td>
        <td data-label="目标"><div class="link-dense-title" title="${esc(item.title || item.url)}">${esc(item.title || item.url)}</div></td>
        <td data-label="分类"><span class="link-category">${esc(item.category || "未分类")}</span></td>
        <td data-label="点击"><span class="click-count">${Number(item.clicks || 0).toLocaleString()}</span></td>
        <td data-label="状态"><button class="status status-toggle ${item.enabled ? "on" : "off"}" data-act="status" data-id="${id}" aria-label="${item.enabled ? "点击停用" : "点击启用"}" title="${item.enabled ? "点击停用" : "点击启用"}">${item.enabled ? "启用" : "停用"}</button></td>
        <td data-label="操作"><div class="row-actions compact-actions">
          <button class="small-btn favorite-btn ${item.favorite ? "is-favorite" : ""}" data-act="favorite" data-id="${id}" aria-label="${item.favorite ? "取消收藏" : "收藏"}" title="${item.favorite ? "取消收藏" : "收藏"}">${item.favorite ? "★" : "☆"}</button>
          <button class="small-btn" data-act="nav" data-id="${id}" aria-label="${linked ? "已在导航" : "添加到导航"}" title="${linked ? "已在导航" : "添加到导航"}">${linked ? "✓" : "+"}</button>
          <button class="small-btn edit-btn" data-act="edit" data-id="${id}" aria-label="编辑" title="编辑">✎</button>
          <button class="small-btn" data-act="copy" data-id="${id}" aria-label="复制短链接" title="复制短链接">⧉</button>
          <button class="small-btn" data-act="open" data-id="${id}" aria-label="打开短链接" title="打开短链接">↗</button>
          <button class="small-btn danger-btn del-btn" data-act="del" data-id="${id}" aria-label="删除" title="删除">×</button>
        </div></td>
      </tr>`;
  }).join("") || '<tr><td colspan="7" style="text-align:center;padding:30px">暂无短链接</td></tr>';

  $("#linksMobileList").innerHTML = pageRows.map((item) => {
    const linked = linkedNav(item);
    const id = Number(item.id);
    const title = item.title || item.url || "无标题";
    return `
      <div class="mobile-link-row">
        <div class="mobile-link-main">
          <input class="link-select mobile-link-select" type="checkbox" data-id="${id}" aria-label="选择 /${esc(item.code)}" ${selectedIds.has(id) ? "checked" : ""}>
          <div class="mobile-link-copy">
            <strong class="mobile-link-code">/${esc(item.code)}</strong>
            <div class="mobile-link-meta" title="${esc(title)}">${esc(title)} · ${esc(item.category || "未分类")} · 点击 ${Number(item.clicks || 0).toLocaleString()}</div>
          </div>
        </div>
        <button class="status status-toggle ${item.enabled ? "on" : "off"}" data-act="status" data-id="${id}" aria-label="${item.enabled ? "点击停用" : "点击启用"}" title="${item.enabled ? "点击停用" : "点击启用"}">${item.enabled ? "启用" : "停用"}</button>
        <div class="mobile-link-actions">
          <button class="mobile-link-action favorite-btn ${item.favorite ? "is-favorite" : ""}" data-act="favorite" data-id="${id}" aria-label="${item.favorite ? "取消收藏" : "收藏"}" title="${item.favorite ? "取消收藏" : "收藏"}">${item.favorite ? "★" : "☆"}</button>
          <button class="mobile-link-action" data-act="nav" data-id="${id}" aria-label="${linked ? "已在导航" : "添加到导航"}" title="${linked ? "已在导航" : "添加到导航"}">${linked ? "✓" : "+"}</button>
          <button class="mobile-link-action" data-act="edit" data-id="${id}" aria-label="编辑" title="编辑">✎</button>
          <button class="mobile-link-action" data-act="copy" data-id="${id}" aria-label="复制短链接" title="复制短链接">⧉</button>
          <button class="mobile-link-action" data-act="open" data-id="${id}" aria-label="打开短链接" title="打开短链接">↗</button>
          <button class="mobile-link-action danger-btn" data-act="del" data-id="${id}" aria-label="删除" title="删除">×</button>
        </div>
      </div>`;
  }).join("") || '<div class="mobile-link-empty">暂无短链接</div>';

  renderPagination("#linksPagination", A.linkPage, A.linkTotal, A.linkPageSize, async (page, pageSize) => {
    A.linkPage = page;
    if (pageSize) { A.linkPageSize = pageSize; localStorage.setItem("stnav_link_page_size", String(pageSize)); }
    await loadAll();
  }, A.linkPages);
  updateLinkBulkUi();
}

let linkSearchTimer = null;
$("#linkSearch").oninput = () => {
  clearTimeout(linkSearchTimer);
  linkSearchTimer = setTimeout(() => loadAll({ resetPages: true }), 220);
};
const linkSort = $("#linkSort");
if (linkSort) {
  linkSort.value = A.linkSort;
  linkSort.onchange = () => {
    A.linkSort = linkSort.value || "created_desc";
    localStorage.setItem("stnav_link_sort", A.linkSort);
    loadAll({ resetPages: true });
  };
}
$("#selectPageLinks").onclick = () => selectVisibleLinks(false);
$("#selectAllLinks").onclick = () => selectVisibleLinks(true);
$("#clearSelectedLinks").onclick = clearSelectedLinks;
$("#bulkAddNav").dataset.bulkAction = "add_navigation";
$("#bulkRemoveNav").dataset.bulkAction = "remove_navigation";
$("#bulkEnableLinks").dataset.bulkAction = "enable";
$("#bulkDisableLinks").dataset.bulkAction = "disable";
$("#bulkDeleteLinks").dataset.bulkAction = "delete";
$("#bulkAddNav").onclick = () => bulkLinkAction("add_navigation");
$("#bulkRemoveNav").onclick = () => bulkLinkAction("remove_navigation");
$("#bulkEnableLinks").onclick = () => bulkLinkAction("enable");
$("#bulkDisableLinks").onclick = () => bulkLinkAction("disable");
$("#bulkDeleteLinks").onclick = () => bulkLinkAction("delete");

function handleLinkListClick(event) {
  const select = event.target.closest(".link-select");
  if (select) {
    const id = Number(select.dataset.id);
    if (select.checked) A.linkSelected.add(id);
    else A.linkSelected.delete(id);
    updateLinkBulkUi();
    return;
  }
  const button = event.target.closest("[data-act]");
  if (!button) return;
  const item = A.links.find((value) => value.id == button.dataset.id);
  if (!item) return;
  if (button.dataset.act === "edit") linkModal(item);
  if (button.dataset.act === "del") deleteLink(item);
  if (button.dataset.act === "nav") addLinkToNavigation(item);
  if (button.dataset.act === "favorite") toggleLinkFavorite(item);
  if (button.dataset.act === "copy") copyShortLink(item);
  if (button.dataset.act === "open") openShortLink(item);
  if (button.dataset.act === "status") toggleLinkEnabled(item);
}

$("#linksTable").onclick = handleLinkListClick;
$("#linksMobileList").onclick = handleLinkListClick;

function linkModal(item = null) {
  openModal(item ? "编辑短链接" : "新建短链接", `
    <form class="modal-form" id="linkForm">
      <div class="two"><label>短码（留空自动生成）<input name="code" value="${esc(item?.code || "")}" placeholder="例如 docs" autocomplete="off" spellcheck="false"><small id="linkCodeCheck" class="link-code-check" aria-live="polite"></small></label><label>分类<input name="category" value="${esc(item?.category || "")}" placeholder="工作"></label></div>
      <label>目标 URL<input name="url" required value="${esc(item?.url || "")}" placeholder="https://example.com"></label>
      <label>标题<input name="title" value="${esc(item?.title || "")}"></label>
      <label>描述<textarea name="description" rows="3">${esc(item?.description || "")}</textarea></label>
      <label class="checkbox"><input name="enabled" type="checkbox" ${item?.enabled !== false ? "checked" : ""}> 启用</label>
      <button class="btn primary">保存</button>
    </form>
  `);
  const codeInput = $("#linkForm input[name=code]");
  const codeCheck = $("#linkCodeCheck");
  let codeCheckTimer = null;
  let codeCheckSeq = 0;
  let codeAvailable = !codeInput.value.trim();

  const renderCodeCheck = (state, message = "") => {
    if (!codeCheck) return;
    codeCheck.className = `link-code-check ${state || ""}`.trim();
    codeCheck.textContent = message;
  };

  const checkCodeAvailability = async () => {
    const code = codeInput.value.trim();
    codeAvailable = !code;
    if (!code) {
      renderCodeCheck("", "留空将自动生成");
      return;
    }
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(code)) {
      codeAvailable = false;
      renderCodeCheck("invalid", "格式：2-64 位字母、数字、_、-");
      return;
    }
    renderCodeCheck("checking", "检查中…");
    const seq = ++codeCheckSeq;
    try {
      const params = new URLSearchParams({ code });
      if (item) params.set("exclude_id", String(item.id));
      const result = await api(`/api/admin/links/check-code?${params.toString()}`);
      if (seq !== codeCheckSeq) return;
      codeAvailable = Boolean(result.available);
      renderCodeCheck(codeAvailable ? "available" : "unavailable", result.message || (codeAvailable ? "短码可用" : "短码不可用"));
    } catch (error) {
      if (seq !== codeCheckSeq) return;
      codeAvailable = false;
      renderCodeCheck("error", `检查失败：${error.message}`);
    }
  };

  codeInput.oninput = () => {
    clearTimeout(codeCheckTimer);
    codeCheckSeq++;
    codeAvailable = !codeInput.value.trim();
    if (!codeInput.value.trim()) {
      renderCodeCheck("", "留空将自动生成");
      return;
    }
    renderCodeCheck("checking", "检查中…");
    codeCheckTimer = setTimeout(checkCodeAvailability, 350);
  };
  checkCodeAvailability();

  $("#linkForm").onsubmit = async (event) => {
    event.preventDefault();
    const data = formData(event.target);
    const code = String(data.code || "").trim();
    if (code && !codeAvailable) {
      await checkCodeAvailability();
      if (!codeAvailable) {
        toast("请使用可用的短码");
        codeInput.focus();
        return;
      }
    }
    try {
      await api(item ? `/api/admin/links/${item.id}` : "/api/admin/links", {
        method: item ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      closeModal(); toast(item ? "已保存，关联导航已同步" : "已保存"); await loadAll();
    } catch (error) { toast(error.message); }
  };
}

async function addLinkToNavigation(item) {
  const exists = linkedNav(item);
  try {
    if (exists) {
      await api(`/api/admin/navigation/${exists.id}`, { method: "DELETE" });
      toast("已从导航移除");
    } else {
      await api("/api/admin/navigation", {
        method: "POST",
        body: JSON.stringify({ link_id: item.id, enabled: item.enabled !== false }),
      });
      toast("已添加到导航");
    }
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
}

async function deleteLink(item) {
  const linked = linkedNav(item);
  const message = linked
    ? `确定删除 /${item.code} 吗？\n对应的导航项目也会一起删除。`
    : `确定删除 /${item.code} 吗？`;
  if (!confirm(message)) return;
  try { await api(`/api/admin/links/${item.id}`, { method: "DELETE" }); toast("已删除"); await loadAll(); }
  catch (error) { toast(error.message); }
}


$("#addLinkBtn").onclick = () => linkModal();
$("#addNavBtn").onclick = () => navModal();

function navIcon(item) { return item.icon || iconUrl(item.url); }

function navFilteredItems() {
  return A.nav;
}

function refreshNavFilters() {
  const select = $("#navCategoryFilter");
  if (!select) return;
  const current = select.value;
  const categories = A.navCategories;
  select.innerHTML = '<option value="">全部分类</option>' + categories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join("");
  select.value = categories.includes(current) ? current : "";
}

function renderNav() {
  refreshNavFilters();
  const element = $("#navAdminGrid");
  const pageItems = A.nav;
  const filtered = String($("#navSearch")?.value || "").trim() || String($("#navCategoryFilter")?.value || "");
  $("#navCount").innerHTML = `${A.navTotal} 项` + (A.navDirty ? '<span class="nav-dirty">未保存</span>' : '');
  const selectedCount = $("#navSelectedCount");
  if (selectedCount) selectedCount.textContent = `已选 ${A.navSelected.size} 项`;
  $("#navFilterHint").classList.toggle("hidden", !filtered);
  element.innerHTML = pageItems.map((item) => {
    const orderIndex = A.navOrderIds.indexOf(Number(item.id));
    return `
    <div class="admin-nav-card ${A.navSelected.has(Number(item.id)) ? "selected" : ""}" draggable="${filtered ? "false" : "true"}" data-id="${item.id}">
      <div class="admin-nav-head">
        <div class="admin-nav-selection"><input type="checkbox" data-navact="select" data-id="${item.id}" ${A.navSelected.has(Number(item.id)) ? "checked" : ""} aria-label="选择 ${esc(item.title)}"><div class="admin-icon-wrap">
          <img class="site-icon" src="${esc(navIcon(item))}" alt="" onerror="this.outerHTML='<span class=&quot;site-icon site-icon-fallback&quot;>${esc(fallbackIcon(item))}</span>'">
        </div></div>
        <div class="admin-nav-title"><strong>${esc(item.title)}</strong><small>${esc(item.category || "未分类")}</small></div>
        <span class="drag-handle">⠿</span>
      </div>
      <p>${esc(item.description || item.url)}</p>
      <div class="nav-admin-meta">
        <div class="nav-admin-badges">${item.link_id ? '<span class="linked-badge">短链接</span>' : '<span class="manual-badge">手动</span>'}<span class="nav-order-badge">#${orderIndex >= 0 ? orderIndex + 1 : Number(item.sort_order ?? 0) + 1}</span></div>
        <span class="nav-url" title="${esc(item.url)}">${esc(item.url)}</span>
      </div>
      <div class="row-actions nav-admin-actions">
        <button class="small-btn nav-move-btn" data-navact="up" data-id="${item.id}" aria-label="上移" title="上移">↑</button>
        <button class="small-btn nav-move-btn" data-navact="down" data-id="${item.id}" aria-label="下移" title="下移">↓</button>
        <button class="small-btn" data-navact="edit" data-id="${item.id}" aria-label="编辑" title="编辑">✎</button>
        <button class="small-btn" data-navact="open" data-id="${item.id}" aria-label="打开链接" title="打开链接">↗</button>
        <button class="small-btn" data-navact="copy" data-id="${item.id}" aria-label="复制链接" title="复制链接">⧉</button>
        <button class="small-btn favorite-btn ${item.favorite ? "is-favorite" : ""}" data-navact="favorite" data-id="${item.id}" aria-label="${item.favorite ? "取消收藏" : "收藏"}" title="${item.favorite ? "取消收藏" : "收藏"}">${item.favorite ? "★" : "☆"}</button>
        <button class="status status-toggle nav-status-toggle ${item.enabled ? "on" : "off"}" data-navact="status" data-id="${item.id}" aria-label="${item.enabled ? "点击停用" : "点击启用"}" title="${item.enabled ? "点击停用" : "点击启用"}">${item.enabled ? "启用" : "停用"}</button>
      </div>
    </div>`;
  }).join("") || '<div class="panel" style="padding:30px">暂无导航</div>';
  renderPagination("#navPagination", A.navPage, A.navTotal, A.navPageSize, async (page, pageSize) => {
    A.navPage = page;
    if (pageSize) { A.navPageSize = pageSize; localStorage.setItem("stnav_nav_page_size", String(pageSize)); }
    await loadAll();
  }, A.navPages);
  bindDrag();
}

function bindDrag() {
  const isFiltered = !!($("#navSearch")?.value || $("#navCategoryFilter")?.value);
  if (isFiltered || A.navPage !== 1) return;
  let dragging = null;
  document.querySelectorAll(".admin-nav-card").forEach((card) => {
    card.ondragstart = (event) => {
      dragging = card;
      card.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.dataset.id);
    };
    card.ondragend = () => { card.classList.remove("dragging"); dragging = null; };
    card.ondragover = (event) => {
      event.preventDefault();
      if (!dragging || dragging === card) return;
      const rect = card.getBoundingClientRect();
      card.parentNode.insertBefore(dragging, event.clientY > rect.top + rect.height / 2 ? card.nextSibling : card);
    };
    card.ondrop = (event) => {
      event.preventDefault();
      if (!dragging) return;
      const visibleIds = [...document.querySelectorAll(".admin-nav-card")].map((node) => Number(node.dataset.id));
      const positions = visibleIds.map((id) => A.navOrderIds.indexOf(id)).filter((index) => index >= 0);
      const reordered = visibleIds;
      positions.forEach((position, index) => { A.navOrderIds[position] = reordered[index]; });
      A.navOrderIds.forEach((_, index) => {});
      A.navDirty = true;
      renderNav();
      toast("顺序已调整，点击“保存排序”后生效");
    };
  });
}

function navOpenUrl(item) {
  return item.link_id && item.code
    ? `${location.origin}/${encodeURIComponent(item.code)}`
    : item.url;
}

async function toggleNavFavorite(item) {
  const next = !Number(item.favorite);
  const previous = Number(item.favorite) ? 1 : 0;
  item.favorite = next ? 1 : 0;
  renderNav();
  try {
    await api(`/api/admin/navigation/${item.id}/favorite`, {
      method: "PATCH",
      body: JSON.stringify({ favorite: next }),
    });
    toast(next ? `已收藏「${item.title}」` : `已取消收藏「${item.title}」`);
  } catch (error) {
    item.favorite = previous;
    renderNav();
    toast(`收藏操作失败：${error.message}`);
  }
}

async function toggleNavEnabled(item) {
  const next = !Boolean(item.enabled);
  const previous = Boolean(item.enabled);
  item.enabled = next ? 1 : 0;
  renderNav();
  try {
    await api(`/api/admin/navigation/${item.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: next }),
    });
    toast(next ? `已启用「${item.title}」` : `已停用「${item.title}」`);
  } catch (error) {
    item.enabled = previous ? 1 : 0;
    renderNav();
    toast(`状态修改失败：${error.message}`);
  }
}

function openNavLink(item) {
  window.open(navOpenUrl(item), "_blank", "noopener,noreferrer");
}

async function copyNavLink(item) {
  toast(await copyText(navOpenUrl(item)) ? "链接已复制" : "复制失败");
}

$("#navAdminGrid").onclick = async (event) => {
  const button = event.target.closest("[data-navact]");
  if (!button) return;
  if (button.dataset.navact === "select") {
    const id = Number(button.dataset.id);
    if (button.checked) A.navSelected.add(id); else A.navSelected.delete(id);
    renderNav();
    return;
  }
  const item = A.nav.find((value) => value.id == button.dataset.id);
  if (!item) return;
  if (button.dataset.navact === "edit") navModal(item);
  if (button.dataset.navact === "del") deleteNav(item);
  if (button.dataset.navact === "open") openNavLink(item);
  if (button.dataset.navact === "copy") copyNavLink(item);
  if (button.dataset.navact === "favorite") toggleNavFavorite(item);
  if (button.dataset.navact === "status") toggleNavEnabled(item);
  if (button.dataset.navact === "up" || button.dataset.navact === "down") {
    const currentIndex = A.navOrderIds.indexOf(Number(item.id));
    const targetIndex = currentIndex + (button.dataset.navact === "up" ? -1 : 1);
    if (currentIndex >= 0 && targetIndex >= 0 && targetIndex < A.navOrderIds.length) {
      [A.navOrderIds[currentIndex], A.navOrderIds[targetIndex]] = [A.navOrderIds[targetIndex], A.navOrderIds[currentIndex]];
      A.navDirty = true;
      renderNav();
      toast("顺序已调整，点击“保存排序”后生效");
    }
  }
};

let navSearchTimer = null;
$("#navSearch").oninput = () => {
  clearTimeout(navSearchTimer);
  navSearchTimer = setTimeout(() => loadAll({ resetPages: true }), 220);
};
$("#navCategoryFilter").onchange = () => loadAll({ resetPages: true });
$("#clearNavFilter").onclick = () => {
  $("#navSearch").value = "";
  $("#navCategoryFilter").value = "";
  loadAll({ resetPages: true });
};

$("#saveNavOrder").onclick = async () => {
  const ids = A.navOrderIds.map(Number);
  try { await api("/api/admin/navigation/reorder", { method: "POST", body: JSON.stringify({ ids }) }); A.navDirty = false; toast("排序已保存"); await loadAll(); }
  catch (error) { toast(error.message); }
};

async function updateSelectedNav(enabled) {
  const ids = [...A.navSelected].map(Number);
  if (!ids.length) return toast("请先选择导航项目");
  try {
    const result = await api("/api/admin/navigation/bulk", {
      method: "POST",
      body: JSON.stringify({ ids, action: enabled ? "enable" : "disable" }),
    });
    A.navSelected.clear();
    toast(`${enabled ? "启用" : "停用"}完成：${Number(result.affected || 0)} 项`);
    await loadAll();
  } catch (error) { toast(error.message); }
}

function selectVisibleNav(all = false) {
  const targets = all ? A.navOrderIds : A.nav.map((item) => Number(item.id));
  targets.forEach((id) => A.navSelected.add(Number(id)));
  renderNav();
  toast(all ? `已选择 ${targets.length} 项（全部导航）` : `已选择本页 ${targets.length} 项`);
}

$("#selectPageNav").onclick = () => selectVisibleNav(false);
$("#selectAllNav").onclick = () => selectVisibleNav(true);
$("#clearSelectedNav").onclick = () => { A.navSelected.clear(); renderNav(); };
$("#enableSelectedNav").onclick = () => updateSelectedNav(true);
$("#disableSelectedNav").onclick = () => updateSelectedNav(false);
$("#deleteSelectedNav").onclick = async () => {
  const ids = [...A.navSelected].map(Number);
  if (!ids.length) return toast("请先选择导航项目");
  if (!confirm(`确定删除选中的 ${ids.length} 个导航项目吗？此操作不可撤销。`)) return;
  try {
    const result = await api("/api/admin/navigation/bulk", {
      method: "POST",
      body: JSON.stringify({ ids, action: "delete" }),
    });
    A.navSelected.clear();
    toast(`已删除 ${Number(result.affected || 0)} 项`);
    await loadAll();
  } catch (error) { toast(error.message); }
};

function navModal(item = null) {
  openModal(item ? "编辑导航" : "添加导航", `
    <form class="modal-form" id="navForm">
      <div class="two"><label>标题<input name="title" required value="${esc(item?.title || "")}"></label><label>分类<input name="category" value="${esc(item?.category || "")}" placeholder="工具"></label></div>
      <label>目标 URL<input name="url" required value="${esc(item?.url || "")}" ${item?.link_id ? "readonly" : ""}></label>
      <label>描述<textarea name="description" rows="3">${esc(item?.description || "")}</textarea></label>
      <label>图标 URL（可选）<input name="icon" value="${esc(item?.icon || "")}" placeholder="留空自动使用网站 favicon"></label>
      ${item?.link_id ? '<div class="form-note">此导航已关联短链接。请在「短链接」中编辑；导航会自动同步，避免把短链接地址误当成真实目标 URL。</div>' : ''}
      <label class="checkbox"><input name="enabled" type="checkbox" ${item?.enabled !== false ? "checked" : ""}> 启用</label>
      ${item?.link_id ? '<button type="button" class="btn" id="linkedNavClose">关闭</button>' : '<button class="btn primary">保存</button>'}
    </form>
  `);
  $("#navForm").onsubmit = async (event) => {
    event.preventDefault();
    const data = formData(event.target);
    if (item?.link_id) return;
    try {
      await api(item ? `/api/admin/navigation/${item.id}` : "/api/admin/navigation", {
        method: item ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      closeModal(); toast("已保存"); await loadAll();
    } catch (error) { toast(error.message); }
  };
  if (item?.link_id) {
    $("#linkedNavClose").onclick = closeModal;
  }
}

async function deleteNav(item) {
  if (!confirm(`确定删除「${item.title}」吗？`)) return;
  try { await api(`/api/admin/navigation/${item.id}`, { method: "DELETE" }); toast("已删除"); await loadAll(); }
  catch (error) { toast(error.message); }
}

function initSettingsTabs() {
  const tabs = [...document.querySelectorAll("[data-settings-tab]")];
  const panels = [...document.querySelectorAll("[data-settings-panel]")];
  if (!tabs.length) return;
  const activate = (name) => {
    tabs.forEach((tab) => {
      const active = tab.dataset.settingsTab === name;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    panels.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.settingsPanel !== name));
  };
  tabs.forEach((tab) => tab.addEventListener("click", () => activate(tab.dataset.settingsTab)));
}

function fillSettings() {
  const form = $("#settingsForm");
  ["site_title", "site_subtitle", "site_description", "hero_title", "hero_description", "accent", "nav_tag_style", "nav_columns_mobile", "nav_columns_tablet", "nav_columns_desktop", "nav_columns_wide", "nav_category_order", "nav_hidden_categories"].forEach((key) => {
    if (form.elements[key]) form.elements[key].value = A.settings[key] || ({
      accent: "#8b6cff", nav_tag_style: "pills", nav_columns_mobile: "2", nav_columns_tablet: "3", nav_columns_desktop: "4", nav_columns_wide: "6"
    }[key] || "");
  });
}

$("#settingsForm").onsubmit = async (event) => {
  event.preventDefault();
  const data = formData(event.target);
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

const csvInput = $("#csvFile");
const dataCsvInput = $("#dataCsvFile");
const csvImportButton = $("#importLinksBtn");
const dataCsvButton = $("#dataCsvBtn");
const dataExportCsvButton = $("#dataExportCsvBtn");

function exportLinksCsv(filename = "shortlinks.csv") {
  const headers = ["code", "url", "title", "description", "category", "enabled", "favorite"];
  const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = A.links.map((item) => headers.map((key) => escapeCsv(item[key])).join(","));
  const csv = [headers.join(","), ...rows].join("\r\n");
  downloadBlob(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), filename);
  toast(`CSV 导出完成：${A.links.length} 条短链接`);
}

$("#exportLinks").onclick = () => exportLinksCsv();
dataExportCsvButton?.addEventListener("click", () => exportLinksCsv("shortlinks.csv"));

const restoreJsonInput = $("#restoreJsonFile");
const restoreJsonButton = $("#restoreJsonBtn");
const backupJsonButton = $("#backupJsonBtn");

function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function downloadJson(data, filename) {
  downloadBlob(new Blob(["\ufeff", JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), filename);
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error("CSV 引号不匹配");
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }
  return rows;
}

function normalizeCsvRows(rows) {
  if (rows.length < 2) throw new Error("CSV 没有可导入的数据");
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const required = ["code", "url"];
  const missing = required.filter((key) => !headers.includes(key));
  if (missing.length) throw new Error(`CSV 缺少必需列：${missing.join(", ")}`);
  const seen = new Map();
  return rows.slice(1).map((values, index) => {
    const data = {};
    headers.forEach((key, col) => { data[key] = String(values[col] ?? "").trim(); });
    data.enabled = !["false", "0", "no", "否", "停用"].includes(String(data.enabled).toLowerCase());
    const code = data.code;
    const duplicateInFile = code && seen.has(code);
    if (code) seen.set(code, index + 2);
    let error = "";
    if (!code) error = "缺少短码";
    else if (!/^[A-Za-z0-9_-]{2,64}$/.test(code)) error = "短码格式无效";
    if (!data.url) error = error || "缺少 URL";
    else {
      try { const u = new URL(data.url); if (!["http:", "https:"].includes(u.protocol)) error = error || "URL 必须是 http/https"; }
      catch { error = error || "URL 格式无效"; }
    }
    if (duplicateInFile) error = error || `与第 ${seen.get(code)} 行重复`;
    const existing = A.links.find((item) => item.code === code);
    return { row: index + 2, ...data, existingId: existing ? Number(existing.id) : null, conflict: Boolean(existing), error };
  });
}

function openCsvPicker(input) {
  if (!input) return;
  input.value = "";
  input.click();
}
csvImportButton?.addEventListener("click", () => openCsvPicker(csvInput));
dataCsvButton?.addEventListener("click", () => openCsvPicker(dataCsvInput));

function csvPreviewModal(items, filename) {
  const valid = items.filter((item) => !item.error);
  const conflicts = valid.filter((item) => item.conflict);
  const invalid = items.filter((item) => item.error);
  const statusText = `${items.length} 行，${valid.length} 条可导入，${conflicts.length} 条重复，${invalid.length} 条有问题`;
  openModal("CSV 导入预览", `
    <div class="import-summary"><strong>${esc(filename)}</strong><span>${statusText}</span></div>
    <div class="import-options">
      <label>重复短码处理<select id="csvConflictMode"><option value="skip">跳过重复</option><option value="update">覆盖已有</option><option value="rename">自动生成新短码</option></select></label>
    </div>
    <div class="import-preview-scroll"><table class="import-preview-table"><thead><tr><th>行</th><th>短码</th><th>目标</th><th>状态</th></tr></thead><tbody>
      ${items.slice(0, 500).map((item) => `<tr><td>${item.row}</td><td><strong>${esc(item.code || "—")}</strong></td><td title="${esc(item.url || "")}">${esc(item.url || "—")}</td><td><span class="import-status ${item.error ? "bad" : item.conflict ? "warn" : "good"}">${esc(item.error || (item.conflict ? "重复" : "新增"))}</span></td></tr>`).join("")}
    </tbody></table></div>
    ${items.length > 500 ? '<div class="form-note">预览最多显示前 500 行，实际导入仍会处理全部行。</div>' : ''}
    <div class="modal-actions"><button type="button" class="btn secondary" id="csvPreviewCancel">取消</button><button type="button" class="btn primary" id="csvPreviewImport">开始导入</button></div>
  `);
  $("#csvPreviewCancel").onclick = closeModal;
  $("#csvPreviewImport").onclick = async () => {
    const mode = $("#csvConflictMode").value;
    const button = $("#csvPreviewImport");
    button.disabled = true;
    try {
      const candidates = items.filter((item) => !item.error);
      let success = 0, skipped = 0, failed = 0;
      for (let i = 0; i < candidates.length; i += 25) {
        const chunk = candidates.slice(i, i + 25);
        const result = await api("/api/admin/links/import", {
          method: "POST",
          body: JSON.stringify({ mode, rows: chunk.map(({ row, existingId, conflict, error, ...data }) => ({ ...data, existing_id: existingId })) }),
        });
        success += Number(result.imported || 0);
        skipped += Number(result.skipped || 0);
        failed += Number(result.failed || 0);
      }
      closeModal();
      toast(`CSV 导入完成：成功 ${success} 条${skipped ? `，跳过 ${skipped} 条` : ""}${failed ? `，失败 ${failed} 条` : ""}`);
      await loadAll();
    } catch (error) {
      toast(`CSV 导入失败：${error.message}`);
      button.disabled = false;
    }
  };
}

async function handleCsvFile(file) {
  if (!file) return;
  if (!/\.csv$/i.test(file.name || "")) throw new Error("请选择扩展名为 .csv 的文件");
  if (file.size === 0) throw new Error("CSV 文件为空");
  if (file.size > 10 * 1024 * 1024) throw new Error("CSV 文件不能超过 10 MB");
  const items = normalizeCsvRows(parseCsv(await file.text()));
  csvPreviewModal(items, file.name);
}

for (const input of [csvInput, dataCsvInput]) {
  input?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    try { await handleCsvFile(file); }
    catch (error) { toast(`CSV 预览失败：${error.message || "读取文件失败"}`); }
    finally { event.currentTarget.value = ""; }
  });
}

async function createJsonBackup() {
  const data = await api("/api/admin/backup");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadJson(data, `st-nav-backup-${stamp}.json`);
  toast(`JSON 备份完成：${Number(data.meta?.links || 0)} 个短链接，${Number(data.meta?.navigation || 0)} 个导航`);
}
backupJsonButton?.addEventListener("click", async () => {
  try { backupJsonButton.disabled = true; await createJsonBackup(); }
  catch (error) { toast(`备份失败：${error.message}`); }
  finally { backupJsonButton.disabled = false; }
});

restoreJsonButton?.addEventListener("click", () => openCsvPicker(restoreJsonInput));
restoreJsonInput?.addEventListener("change", async (event) => {
  const file = event.currentTarget.files?.[0];
  try {
    if (!file) return;
    if (!/\.json$/i.test(file.name || "")) throw new Error("请选择 JSON 备份文件");
    if (file.size === 0) throw new Error("JSON 文件为空");
    if (file.size > 10 * 1024 * 1024) throw new Error("JSON 备份不能超过 10 MB");
    const data = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
    const counts = data?.meta || {};
    if (data?.format !== "st-nav-backup" || !Array.isArray(data.links) || !Array.isArray(data.navigation) || !Array.isArray(data.settings)) {
      throw new Error("不是有效的 ST Nav JSON 备份文件");
    }
    openModal("JSON 恢复", `
      <div class="restore-summary"><strong>${esc(file.name)}</strong><span>短链接 ${Number(counts.links || data.links.length)} · 导航 ${Number(counts.navigation || data.navigation.length)} · 设置 ${Number(counts.settings || data.settings.length)}</span></div>
      <div class="import-options"><label>恢复方式<select id="jsonRestoreMode"><option value="merge">合并恢复（推荐）</option><option value="replace">完全覆盖恢复</option></select></label></div>
      <div class="form-note">合并不会删除现有数据；完全覆盖会清空当前业务数据。覆盖恢复前请确认你已经保留当前备份。</div>
      <div class="modal-actions"><button type="button" class="btn secondary" id="restoreCancel">取消</button><button type="button" class="btn primary" id="restoreStart">开始恢复</button></div>
    `);
    $("#restoreCancel").onclick = closeModal;
    $("#restoreStart").onclick = async () => {
      const mode = $("#jsonRestoreMode").value;
      if (mode === "replace" && !confirm("完全覆盖恢复会删除当前短链接、导航、统计和设置，确定继续吗？")) return;
      const button = $("#restoreStart");
      button.disabled = true;
      try {
        const result = await api("/api/admin/restore", { method: "POST", body: JSON.stringify({ mode, backup: data }) });
        closeModal();
        toast(`JSON 恢复完成：新增/更新短链接 ${Number(result.links || 0)}，导航 ${Number(result.navigation || 0)}`);
        await loadAll();
      } catch (error) {
        toast(`JSON 恢复失败：${error.message}`);
        button.disabled = false;
      }
    };
  } catch (error) { toast(`JSON 读取失败：${error.message || "文件无效"}`); }
  finally { event.currentTarget.value = ""; }
});

function toggleAdminTheme() {
  document.documentElement.classList.toggle("light-admin");
  localStorage.setItem("sln_admin_theme", document.documentElement.classList.contains("light-admin") ? "light" : "dark");
  $("#adminThemeBtn").textContent = document.documentElement.classList.contains("light-admin") ? "☀" : "☾";
}

if (localStorage.getItem("sln_admin_theme") === "light") document.documentElement.classList.add("light-admin");
$("#adminThemeBtn").textContent = document.documentElement.classList.contains("light-admin") ? "☀" : "☾";
$("#adminThemeBtn").onclick = toggleAdminTheme;
initSettingsTabs();
boot();
