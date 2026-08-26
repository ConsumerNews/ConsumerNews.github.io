// EdgeOne Pages Function · 访问计数
// 同一 IP 1 小时内多次访问仅计 1 次；全局与本周计数持久累加（KV 绑定名 VISITS）。
// 启用：在 EdgeOne Pages 项目绑定一个 KV 命名空间，绑定名设为 VISITS 即可。
export async function onRequest(context) {
  const json = (o) => new Response(JSON.stringify(o), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
  try {
    const req = context.request;
    const KV = context.VISITS; // KV 绑定（需在控制台创建并绑定）
    if (!KV) return json({ total: null, week: null, counted: false, note: "KV 未绑定" });

    const xff = req.headers.get("x-forwarded-for") || "";
    const ip = req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") ||
               (xff.split(",")[0] || "anon").trim() || "anon";
    const now = Date.now();
    const WEEK = 7 * 86400000;
    const HOUR = 3600000;
    let counted = false;

    const last = await KV.get("ip:" + ip);
    if (!last || now - parseInt(last, 10) > HOUR) {
      counted = true;
      await KV.put("ip:" + ip, String(now));
      const t = parseInt((await KV.get("total")) || "0", 10);
      await KV.put("total", String(t + 1));
      let wkStart = parseInt((await KV.get("weekstart")) || "0", 10);
      if (now - wkStart > WEEK) { await KV.put("week", "0"); await KV.put("weekstart", String(now)); }
      const w = parseInt((await KV.get("week")) || "0", 10);
      await KV.put("week", String(w + 1));
    }
    const total = parseInt((await KV.get("total")) || "0", 10);
    const week = parseInt((await KV.get("week")) || "0", 10);
    return json({ total, week, counted });
  } catch (e) {
    return json({ total: null, week: null, counted: false, error: String(e) });
  }
}
