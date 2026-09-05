const JSON_HEADERS = {
  "content-type": "application/json;charset=UTF-8",
  "cache-control": "no-store",
};

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });

const now = () => new Date().toISOString();
const b62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CODE_RE = /^[A-Za-z0-9_-]{2,64}$/;
const ALLOWED_SETTINGS = [
  "site_title",
  "site_subtitle",
  "site_description",
  "hero_title",
  "hero_description",
  "accent",
];

function randomCode(n = 7) {
  let s = "";
  const values = new Uint32Array(n);
  crypto.getRandomValues(values);
  for (let i = 0; i < n; i++) s += b62[values[i] % b62.length];
  return s;
}

function validUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function clean(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function base64urlEncode(value) {
  return btoa(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64urlDecode(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return atob(padded);
}

function cookie(name, value, maxAge = 86400) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );
  return base64urlEncode(String.fromCharCode(...new Uint8Array(sig)));
}

async function sessionToken(secret) {
  const payload = base64urlEncode(
    JSON.stringify({ exp: Date.now() + 86400000, iat: Date.now() })
  );
  return `${payload}.${await hmac(secret, payload)}`;
}

function getCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] || "";
}

async function isAuthed(request, env) {
  if (!env.SESSION_SECRET) return false;
  const token = getCookie(request, "sln_session");
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  try {
    const data = JSON.parse(base64urlDecode(payload));
    if (!data.exp || data.exp < Date.now()) return false;
    const expected = await hmac(env.SESSION_SECRET, payload);
    return expected === signature;
  } catch {
    return false;
  }
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

async function requireAuth(request, env) {
  if (!(await isAuthed(request, env))) return json({ error: "未登录" }, 401);
  if (!sameOrigin(request)) return json({ error: "非法来源" }, 403);
  return null;
}

async function body(request) {
  return await request.json().catch(() => ({}));
}

function routeParts(path) {
  return path.split("/").filter(Boolean);
}

async function uniqueCode(env) {
  for (let i = 0; i < 12; i++) {
    const code = randomCode();
    const exists = await env.DB.prepare("SELECT id FROM links WHERE code = ?")
      .bind(code)
      .first();
    if (!exists) return code;
  }
  throw new Error("无法生成唯一短码，请稍后重试");
}

async function handleApi(request, env, ctx, parts) {
  const method = request.method.toUpperCase();
  const path = "/" + parts.join("/");

  if (path === "/api/auth/login" && method === "POST") {
    if (!sameOrigin(request)) return json({ error: "非法来源" }, 403);
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
      return json({ error: "服务器尚未配置管理员密码或 SESSION_SECRET" }, 500);
    }
    const data = await body(request);
    if (String(data.password ?? "") !== String(env.ADMIN_PASSWORD)) {
      return json({ error: "密码错误" }, 401);
    }
    const token = await sessionToken(env.SESSION_SECRET);
    return json(
      { ok: true },
      200,
      { "Set-Cookie": cookie("sln_session", token) }
    );
  }

  if (path === "/api/auth/logout" && method === "POST") {
    if (!sameOrigin(request)) return json({ error: "非法来源" }, 403);
    return json(
      { ok: true },
      200,
      { "Set-Cookie": cookie("sln_session", "", 0) }
    );
  }

  if (path === "/api/auth/me" && method === "GET") {
    return json({ authenticated: await isAuthed(request, env) });
  }

  if (path === "/api/public/navigation" && method === "GET") {
    const result = await env.DB.prepare(
      `SELECT id,title,description,url,icon,category,sort_order,enabled
       FROM navigation WHERE enabled=1 ORDER BY sort_order,id`
    ).all();
    return json({ items: result.results });
  }

  if (path === "/api/public/settings" && method === "GET") {
    const result = await env.DB.prepare("SELECT key,value FROM settings").all();
    return json({
      settings: Object.fromEntries(result.results.map((x) => [x.key, x.value])),
    });
  }

  const auth = await requireAuth(request, env);
  if (auth) return auth;

  if (path === "/api/admin/dashboard" && method === "GET") {
    const stats = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM links) links,
        (SELECT COALESCE(SUM(clicks),0) FROM links) clicks,
        (SELECT COUNT(*) FROM navigation) navigation,
        (SELECT COUNT(*) FROM link_visits WHERE visited_at >= datetime('now','-13 day')) recentClicks`
    ).first();

    const top = await env.DB.prepare(
      "SELECT id,code,url,title,clicks FROM links ORDER BY clicks DESC,id DESC LIMIT 8"
    ).all();

    const trend = await env.DB.prepare(
      `WITH RECURSIVE dates(d) AS (
        SELECT date('now','-13 day')
        UNION ALL
        SELECT date(d,'+1 day') FROM dates WHERE d < date('now')
      )
      SELECT dates.d day, COALESCE(COUNT(link_visits.id),0) clicks
      FROM dates
      LEFT JOIN link_visits ON date(link_visits.visited_at)=dates.d
      GROUP BY dates.d ORDER BY dates.d`
    ).all();

    return json({ stats, topLinks: top.results, trend: trend.results });
  }

  if (path === "/api/admin/links" && method === "GET") {
    const result = await env.DB.prepare(
      "SELECT * FROM links ORDER BY created_at DESC,id DESC"
    ).all();
    return json({ items: result.results });
  }

  if (path === "/api/admin/links" && method === "POST") {
    const data = await body(request);
    const url = clean(data.url, 2000);
    if (!validUrl(url)) return json({ error: "URL 必须是 http/https" }, 400);

    const code = clean(data.code, 64) || (await uniqueCode(env));
    if (!CODE_RE.test(code)) {
      return json({ error: "短码格式不合法：仅允许 2-64 位字母、数字、_、-" }, 400);
    }

    try {
      await env.DB.prepare(
        `INSERT INTO links(code,url,title,description,category,enabled,updated_at)
         VALUES(?,?,?,?,?,?,?)`
      )
        .bind(
          code,
          url,
          clean(data.title, 200),
          clean(data.description, 500),
          clean(data.category, 80),
          data.enabled === false ? 0 : 1,
          now()
        )
        .run();
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("unique")) {
        return json({ error: "短码已存在" }, 409);
      }
      throw error;
    }

    return json({ ok: true, code });
  }

  const linkMatch = path.match(/^\/api\/admin\/links\/(\d+)$/);
  if (linkMatch) {
    const id = Number(linkMatch[1]);

    if (method === "PUT") {
      const data = await body(request);
      const code = clean(data.code, 64);
      const url = clean(data.url, 2000);

      if (!CODE_RE.test(code)) {
        return json({ error: "短码格式不合法：仅允许 2-64 位字母、数字、_、-" }, 400);
      }
      if (!validUrl(url)) return json({ error: "URL 必须是 http/https" }, 400);

      try {
        const result = await env.DB.prepare(
          `UPDATE links SET code=?,url=?,title=?,description=?,category=?,enabled=?,updated_at=?
           WHERE id=?`
        )
          .bind(
            code,
            url,
            clean(data.title, 200),
            clean(data.description, 500),
            clean(data.category, 80),
            data.enabled === false ? 0 : 1,
            now(),
            id
          )
          .run();

        if (!result.meta?.changes) return json({ error: "短链接不存在" }, 404);
      } catch (error) {
        if (String(error?.message || "").toLowerCase().includes("unique")) {
          return json({ error: "短码已存在" }, 409);
        }
        throw error;
      }
      return json({ ok: true });
    }

    if (method === "DELETE") {
      const result = await env.DB.prepare("DELETE FROM links WHERE id=?")
        .bind(id)
        .run();
      if (!result.meta?.changes) return json({ error: "短链接不存在" }, 404);
      return json({ ok: true });
    }
  }

  if (path === "/api/admin/navigation" && method === "GET") {
    const result = await env.DB.prepare(
      "SELECT * FROM navigation ORDER BY sort_order,id"
    ).all();
    return json({ items: result.results });
  }

  if (path === "/api/admin/navigation" && method === "POST") {
    const data = await body(request);
    const title = clean(data.title, 120);
    const url = clean(data.url, 2000);
    if (!title || !validUrl(url)) return json({ error: "标题和有效 URL 必填" }, 400);

    const max = await env.DB.prepare(
      "SELECT COALESCE(MAX(sort_order),-1) m FROM navigation"
    ).first();

    await env.DB.prepare(
      `INSERT INTO navigation(title,description,url,icon,category,sort_order,enabled,updated_at)
       VALUES(?,?,?,?,?,?,?,?)`
    )
      .bind(
        title,
        clean(data.description, 500),
        url,
        clean(data.icon, 1000),
        clean(data.category, 80),
        Number(max?.m ?? -1) + 1,
        data.enabled === false ? 0 : 1,
        now()
      )
      .run();

    return json({ ok: true });
  }

  if (path === "/api/admin/navigation/reorder" && method === "POST") {
    const data = await body(request);
    if (!Array.isArray(data.ids) || data.ids.some((id) => !Number.isInteger(Number(id)))) {
      return json({ error: "排序数据无效" }, 400);
    }

    const ids = data.ids.map(Number);
    if (new Set(ids).size !== ids.length) return json({ error: "排序数据存在重复项目" }, 400);

    const statements = ids.map((id, index) =>
      env.DB.prepare("UPDATE navigation SET sort_order=?,updated_at=? WHERE id=?")
        .bind(index, now(), id)
    );
    if (statements.length) await env.DB.batch(statements);
    return json({ ok: true });
  }

  const navMatch = path.match(/^\/api\/admin\/navigation\/(\d+)$/);
  if (navMatch) {
    const id = Number(navMatch[1]);

    if (method === "PUT") {
      const data = await body(request);
      const title = clean(data.title, 120);
      const url = clean(data.url, 2000);
      if (!title || !validUrl(url)) return json({ error: "标题和有效 URL 必填" }, 400);

      const result = await env.DB.prepare(
        `UPDATE navigation SET title=?,description=?,url=?,icon=?,category=?,enabled=?,updated_at=?
         WHERE id=?`
      )
        .bind(
          title,
          clean(data.description, 500),
          url,
          clean(data.icon, 1000),
          clean(data.category, 80),
          data.enabled === false ? 0 : 1,
          now(),
          id
        )
        .run();

      if (!result.meta?.changes) return json({ error: "导航不存在" }, 404);
      return json({ ok: true });
    }

    if (method === "DELETE") {
      const result = await env.DB.prepare("DELETE FROM navigation WHERE id=?")
        .bind(id)
        .run();
      if (!result.meta?.changes) return json({ error: "导航不存在" }, 404);
      return json({ ok: true });
    }
  }

  if (path === "/api/admin/settings" && method === "GET") {
    const result = await env.DB.prepare("SELECT key,value FROM settings").all();
    return json({
      settings: Object.fromEntries(result.results.map((x) => [x.key, x.value])),
    });
  }

  if (path === "/api/admin/settings" && method === "PUT") {
    const data = await body(request);
    const statements = ALLOWED_SETTINGS
      .filter((key) => key in data)
      .map((key) =>
        env.DB.prepare(
          `INSERT INTO settings(key,value) VALUES(?,?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value`
        ).bind(key, clean(data[key], 500))
      );

    if (statements.length) await env.DB.batch(statements);
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
}

async function handleRedirect(request, env, ctx, code) {
  if (!CODE_RE.test(code)) return null;
  const link = await env.DB.prepare(
    "SELECT id,url FROM links WHERE code=? AND enabled=1"
  ).bind(code).first();
  if (!link) return null;

  const timestamp = now();
  ctx.waitUntil(
    Promise.all([
      env.DB.prepare(
        "UPDATE links SET clicks=clicks+1,last_clicked_at=?,updated_at=? WHERE id=?"
      ).bind(timestamp, timestamp, link.id).run(),
      env.DB.prepare(
        "INSERT INTO link_visits(link_id,visited_at) VALUES(?,?)"
      ).bind(link.id, timestamp).run(),
    ])
  );

  return Response.redirect(link.url, 302);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const parts = routeParts(url.pathname);

    try {
      if (parts[0] === "api") return await handleApi(request, env, ctx, parts);

      // Pages Assets 不同配置下对 /admin 的处理可能不同，这里显式映射到 admin.html。
      if (url.pathname === "/admin" || url.pathname === "/admin/") {
        return env.ASSETS.fetch(new Request(new URL("/admin.html", url), request));
      }

      if (parts.length === 1 && parts[0]) {
        const redirect = await handleRedirect(request, env, ctx, parts[0]);
        if (redirect) return redirect;
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return json({ error: error?.message || "Server error" }, 500);
    }
  },
};
