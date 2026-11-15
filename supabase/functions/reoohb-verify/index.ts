import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const authClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
function reply(status: number, data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), { status, headers: cors });
}
function randomHex(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
function cleanDomain(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const input = value.trim().toLowerCase();
    const url = new URL(input.includes("://") ? input : "https://" + input);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) return null;
    const host = url.hostname.replace(/^www\./, "");
    if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return null;
    return host;
  } catch { return null; }
}
async function getUser(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data, error } = await authClient.auth.getUser(token);
  return error ? null : data.user;
}
async function projectByPublicId(publicId: unknown) {
  if (typeof publicId !== "string") return null;
  const { data } = await admin.from("reoohb_projects")
    .select("id,public_id,domain,name").eq("public_id", publicId).maybeSingle();
  return data;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method === "GET" && new URL(req.url).pathname.endsWith("/reoohb-verify")) {
    return reply(200, { ok: true, service: "reoohb", version: "0.2.0" });
  }
  if (req.method !== "POST") return reply(405, { error: "Use POST." });
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || typeof body.action !== "string") return reply(400, { error: "A valid action is required." });

    if (body.action === "create_project") {
      const user = await getUser(req);
      if (!user) return reply(401, { error: "Please sign in again." });
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const domain = cleanDomain(body.domain);
      if (!name || name.length > 60 || !domain) return reply(400, { error: "Enter a project name and a valid domain such as example.com." });
      const secret = "reo_" + randomHex(32);
      const { data: project, error: insertError } = await admin.from("reoohb_projects")
        .insert({ owner_id: user.id, name, domain }).select("id,public_id,name,domain,created_at").single();
      if (insertError || !project) return reply(400, { error: "Could not create this project. Check the details and try again." });
      const { error: secretError } = await admin.from("reoohb_project_secrets")
        .insert({ project_id: project.id, secret_hash: await sha256(secret) });
      if (secretError) {
        await admin.from("reoohb_projects").delete().eq("id", project.id);
        return reply(500, { error: "Could not securely save the project credential." });
      }
      return reply(200, { project, api_secret: secret, warning: "Copy this secret now. It is shown only once." });
    }

    if (body.action === "create_api_key" || body.action === "list_api_keys" || body.action === "revoke_api_key") {
      const user = await getUser(req);
      if (!user) return reply(401, { error: "Please sign in again." });
      const projectId = typeof body.project_id === "string" ? body.project_id : "";
      const { data: ownedProject } = await admin.from("reoohb_projects").select("id")
        .eq("id", projectId).eq("owner_id", user.id).maybeSingle();
      if (!ownedProject) return reply(404, { error: "Project not found." });

      if (body.action === "create_api_key") {
        const label = typeof body.label === "string" ? body.label.trim() : "";
        if (!label || label.length > 60) return reply(400, { error: "Enter a key name up to 60 characters." });
        const secret = "reo_" + randomHex(32);
        const { data: key, error } = await admin.from("reoohb_project_api_keys")
          .insert({ project_id: projectId, label, secret_hash: await sha256(secret) })
          .select("id,label,created_at").single();
        if (error || !key) return reply(500, { error: "Could not create this project code." });
        return reply(200, { key, api_secret: secret, warning: "Copy this code now. It is shown only once." });
      }

      if (body.action === "list_api_keys") {
        const { data, error } = await admin.from("reoohb_project_api_keys")
          .select("id,label,created_at,revoked_at").eq("project_id", projectId)
          .order("created_at", { ascending: false });
        if (error) return reply(500, { error: "Could not load project codes." });
        return reply(200, { keys: data ?? [] });
      }

      const keyId = typeof body.key_id === "string" ? body.key_id : "";
      const { data: revoked, error } = await admin.from("reoohb_project_api_keys")
        .update({ revoked_at: new Date().toISOString() }).eq("id", keyId)
        .eq("project_id", projectId).is("revoked_at", null).select("id").maybeSingle();
      if (error || !revoked) return reply(404, { error: "Active project code not found." });
      return reply(200, { revoked: true });
    }

    if (body.action === "challenge") {
      const project = await projectByPublicId(body.project_id);
      if (!project) return reply(404, { error: "Unknown project." });
      const origin = req.headers.get("Origin");
      let originHost = "";
      try { originHost = origin ? new URL(origin).hostname.toLowerCase().replace(/^www\./, "") : ""; } catch { }
      if (originHost !== project.domain) return reply(403, { error: "This domain is not registered for the project." });
      const left = 2 + Math.floor(Math.random() * 8);
      const right = 2 + Math.floor(Math.random() * 8);
      const challengeId = crypto.randomUUID();
      const { error } = await admin.from("reoohb_challenges").insert({
        id: challengeId, project_id: project.id, answer_hash: await sha256(challengeId + ":" + (left + right)),
      });
      if (error) return reply(500, { error: "Could not start verification." });
      return reply(200, { challenge_id: challengeId, question: `What is ${left} + ${right}?`, expires_in_seconds: 300 });
    }

    if (body.action === "verify") {
      const project = await projectByPublicId(body.project_id);
      if (!project || typeof body.challenge_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.challenge_id)) return reply(400, { error: "Invalid project or challenge." });
      const origin = req.headers.get("Origin");
      let originHost = "";
      try { originHost = origin ? new URL(origin).hostname.toLowerCase().replace(/^www\./, "") : ""; } catch { }
      if (originHost !== project.domain) return reply(403, { error: "This domain is not registered for the project." });
      const answer = typeof body.answer === "string" ? body.answer.trim() : "";
      if (!/^\d{1,3}$/.test(answer)) return reply(400, { error: "Enter the numeric answer." });
      const { data: challenge } = await admin.from("reoohb_challenges").select("id,answer_hash,expires_at,used_at")
        .eq("id", body.challenge_id).eq("project_id", project.id).maybeSingle();
      if (!challenge || challenge.used_at || Date.parse(challenge.expires_at) <= Date.now()) return reply(400, { error: "Challenge expired or already used. Start again." });
      const correct = safeEqual(await sha256(challenge.id + ":" + answer), challenge.answer_hash);
      const { data: claimed } = await admin.from("reoohb_challenges").update({ used_at: new Date().toISOString() })
        .eq("id", challenge.id).is("used_at", null).gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
      if (!claimed) return reply(400, { error: "Challenge expired or already used. Start again." });
      if (!correct) return reply(400, { error: "That answer wasn't correct. Start a new challenge." });
      const code = randomHex(32);
      const { error } = await admin.from("reoohb_codes").insert({
        project_id: project.id, code_hash: await sha256(code), expires_at: new Date(Date.now() + 120_000).toISOString(),
      });
      if (error) return reply(500, { error: "Could not issue a verification code." });
      return reply(200, { verified: true, code, expires_in_seconds: 120 });
    }

    if (body.action === "exchange") {
      const project = await projectByPublicId(body.project_id);
      const secret = typeof body.api_secret === "string" ? body.api_secret : "";
      const code = typeof body.code === "string" ? body.code : "";
      if (!project || !secret || !/^[0-9a-f]{64}$/i.test(code)) return reply(400, { valid: false, error: "Invalid credentials or code." });
      const secretHash = await sha256(secret);
      const { data: storedApiKey } = await admin.from("reoohb_project_api_keys").select("id,secret_hash")
        .eq("project_id", project.id).eq("secret_hash", secretHash).is("revoked_at", null).maybeSingle();
      const { data: legacySecret } = storedApiKey ? { data: null } : await admin.from("reoohb_project_secrets")
        .select("secret_hash").eq("project_id", project.id).maybeSingle();
      const credentialValid = storedApiKey
        ? safeEqual(secretHash, storedApiKey.secret_hash)
        : !!legacySecret && safeEqual(secretHash, legacySecret.secret_hash);
      if (!credentialValid) return reply(401, { valid: false, error: "Invalid project credentials." });
      const { data: storedCode } = await admin.from("reoohb_codes").select("id,expires_at,used_at")
        .eq("project_id", project.id).eq("code_hash", await sha256(code)).maybeSingle();
      if (!storedCode || storedCode.used_at || Date.parse(storedCode.expires_at) <= Date.now()) return reply(400, { valid: false, error: "Code expired or already used." });
      const { data: consumed } = await admin.from("reoohb_codes").update({ used_at: new Date().toISOString() })
        .eq("id", storedCode.id).is("used_at", null).gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
      if (!consumed) return reply(400, { valid: false, error: "Code expired or already used." });
      return reply(200, { valid: true, project_id: project.public_id, verified_at: new Date().toISOString() });
    }
    return reply(400, { error: "Unknown action." });
  } catch {
    return reply(400, { error: "Invalid request." });
  }
});