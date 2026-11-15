import { createServer } from "node:http";
const REOOHB_URL = process.env.REOOHB_URL || "https://wdkpojqtftvpfeuctlzi.supabase.co/functions/v1/reoohb-verify";
const PROJECT_ID = process.env.REOOHB_PROJECT_ID;
const API_SECRET = process.env.REOOHB_API_SECRET;
if (!PROJECT_ID || !API_SECRET) throw new Error("Set REOOHB_PROJECT_ID and REOOHB_API_SECRET in your server environment.");
const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/api/verify") { res.writeHead(404).end("Not found"); return; }
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 4096) { res.writeHead(413).end("Request too large"); return; } }
  try {
    const body = JSON.parse(raw || "{}");
    if (typeof body.code !== "string" || !/^[0-9a-f]{64}$/i.test(body.code)) {
      res.writeHead(400, { "Content-Type":"application/json" }); res.end(JSON.stringify({ valid:false, error:"Invalid verification code." })); return;
    }
    const upstream = await fetch(REOOHB_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ action:"exchange", project_id:PROJECT_ID, api_secret:API_SECRET, code:body.code }), cache:"no-store"
    });
    const result = await upstream.json();
    res.writeHead(upstream.ok && result.valid ? 200 : 401, { "Content-Type":"application/json", "Cache-Control":"no-store" });
    res.end(JSON.stringify({ valid:Boolean(result.valid) }));
  } catch {
    res.writeHead(400, { "Content-Type":"application/json" }); res.end(JSON.stringify({ valid:false, error:"Invalid request." }));
  }
});
server.listen(Number(process.env.PORT || 3000));