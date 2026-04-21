import type { VercelRequest, VercelResponse } from "@vercel/node";
import express, { type Request, type Response } from "express";
import cors from "cors";

// ── Lightweight logger for serverless (no pino dep needed) ───────────────────
const log = {
  info: (...args: unknown[]) => console.log("[api]", ...args),
  error: (...args: unknown[]) => console.error("[api]", ...args),
};

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ── Health ───────────────────────────────────────────────────────────────────
app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok", serverless: true, timestamp: new Date().toISOString() });
});

// ── Meshy proxy routes ───────────────────────────────────────────────────────
const MESHY_BASE = "https://api.meshy.ai";
const MESHY_KEY = process.env.MESHY_API_KEY ?? "";
const ANTHROPIC_BASE = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
const ANTHROPIC_KEY = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "";

function meshyHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${MESHY_KEY}` };
}

const MESHY_SYSTEM_PROMPT = `You are the Grudge Pipeline AI — a specialist in crafting optimized prompts and settings for the Meshy AI API to generate game-ready 3D characters.

You know the Meshy API inside-out:
- Text-to-3D model options: meshy-5, meshy-6, latest
- topology: quad (better for animation/rigging), triangle
- target_polycount: 5000-50000 ideal for web games; 30000 is standard
- pose_mode: always use "t-pose" for characters that will be rigged
- should_remesh: true for cleaner meshes
- enable_pbr: true for PBR maps
- target_formats: always include "fbx" and "glb" for game use

When the user asks for a character, generate an optimized prompt. End your response with a JSON block:

<meshy_params>
{
  "prompt": "...",
  "ai_model": "latest",
  "topology": "quad",
  "target_polycount": 30000,
  "pose_mode": "t-pose",
  "should_remesh": true,
  "enable_pbr": true,
  "target_formats": ["glb", "fbx"]
}
</meshy_params>`;

// Chat
app.post("/api/meshy/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages array required" });
    if (!ANTHROPIC_KEY) return res.status(503).json({ error: "AI service not configured" });

    const response = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: MESHY_SYSTEM_PROMPT,
        messages: messages.map((m: any) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
      }),
    });

    if (!response.ok) return res.status(502).json({ error: "AI service error", detail: await response.text() });

    const data = await response.json() as any;
    const reply = data.content?.[0]?.text ?? "";

    let extractedPrompt: string | undefined;
    let extractedParams: any;
    const match = reply.match(/<meshy_params>([\s\S]*?)<\/meshy_params>/);
    if (match) {
      try { extractedParams = JSON.parse(match[1].trim()); extractedPrompt = extractedParams?.prompt; } catch {}
    }

    res.json({ reply: reply.replace(/<meshy_params>[\s\S]*?<\/meshy_params>/, "").trim(), extractedPrompt, extractedParams });
  } catch (e: any) { log.error("Chat error:", e.message); res.status(500).json({ error: "Internal server error" }); }
});

// Meshy proxy helper
async function meshyProxy(req: express.Request, res: express.Response, path: string, method = "POST") {
  try {
    if (!MESHY_KEY) return res.status(503).json({ error: "Meshy API key not configured" });
    const opts: RequestInit = { method, headers: meshyHeaders() };
    if (method === "POST") opts.body = JSON.stringify(req.body);
    const response = await fetch(`${MESHY_BASE}${path}`, opts);
    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json(data);
  } catch (e: any) { log.error("Meshy proxy error:", e.message); res.status(500).json({ error: "Internal server error" }); }
}

app.post("/api/meshy/text-to-3d/preview", (req, res) => {
  const body = req.body;
  req.body = {
    mode: "preview", prompt: body.prompt, ai_model: body.ai_model ?? "latest",
    topology: body.topology ?? "quad", target_polycount: body.target_polycount ?? 30000,
    should_remesh: body.should_remesh ?? true, pose_mode: body.pose_mode ?? "t-pose",
    enable_pbr: body.enable_pbr ?? true, target_formats: body.target_formats ?? ["glb", "fbx"],
  };
  meshyProxy(req, res, "/openapi/v2/text-to-3d");
});

app.post("/api/meshy/text-to-3d/refine", (req, res) => {
  const { preview_task_id, texture_prompt, enable_pbr, ai_model } = req.body;
  const payload: any = { mode: "refine", preview_task_id, enable_pbr: enable_pbr ?? true, ai_model: ai_model ?? "latest" };
  if (texture_prompt) payload.texture_prompt = texture_prompt;
  req.body = payload;
  meshyProxy(req, res, "/openapi/v2/text-to-3d");
});

app.get("/api/meshy/text-to-3d/:id", (req, res) => meshyProxy(req, res, `/openapi/v2/text-to-3d/${req.params.id}`, "GET"));

app.post("/api/meshy/rig", (req, res) => {
  const { input_task_id, model_url, height_meters } = req.body;
  const payload: any = { height_meters: height_meters ?? 1.7 };
  if (input_task_id) payload.input_task_id = input_task_id;
  if (model_url) payload.model_url = model_url;
  req.body = payload;
  meshyProxy(req, res, "/openapi/v1/rigging");
});

app.get("/api/meshy/rig/:id", (req, res) => meshyProxy(req, res, `/openapi/v1/rigging/${req.params.id}`, "GET"));

app.post("/api/meshy/text-to-image", (req, res) => {
  const { prompt, ai_model, generate_multi_view, pose_mode, aspect_ratio } = req.body;
  const payload: any = { prompt, ai_model: ai_model ?? "nano-banana" };
  if (generate_multi_view !== undefined) payload.generate_multi_view = generate_multi_view;
  if (pose_mode) payload.pose_mode = pose_mode;
  if (aspect_ratio && !generate_multi_view) payload.aspect_ratio = aspect_ratio;
  req.body = payload;
  meshyProxy(req, res, "/openapi/v1/text-to-image");
});

app.get("/api/meshy/text-to-image/:id", (req, res) => meshyProxy(req, res, `/openapi/v1/text-to-image/${req.params.id}`, "GET"));

app.post("/api/meshy/retexture", (req, res) => {
  const { input_task_id, model_url, text_style_prompt, image_style_url, ai_model, enable_original_uv, enable_pbr, remove_lighting, target_formats } = req.body;
  const payload: any = {
    ai_model: ai_model ?? "latest", enable_original_uv: enable_original_uv ?? true,
    enable_pbr: enable_pbr ?? false, remove_lighting: remove_lighting ?? true,
    target_formats: target_formats ?? ["glb", "fbx"],
  };
  if (input_task_id) payload.input_task_id = input_task_id;
  if (model_url) payload.model_url = model_url;
  if (image_style_url) payload.image_style_url = image_style_url;
  else if (text_style_prompt) payload.text_style_prompt = text_style_prompt;
  req.body = payload;
  meshyProxy(req, res, "/openapi/v1/retexture");
});

app.get("/api/meshy/retexture/:id", (req, res) => meshyProxy(req, res, `/openapi/v1/retexture/${req.params.id}`, "GET"));

app.post("/api/meshy/remesh", (req, res) => {
  const { input_task_id, model_url, target_formats, topology, target_polycount, resize_height, auto_size, origin_at, convert_format_only } = req.body;
  const payload: any = { target_formats: target_formats ?? ["glb", "fbx"], topology: topology ?? "triangle", target_polycount: target_polycount ?? 30000 };
  if (input_task_id) payload.input_task_id = input_task_id;
  if (model_url) payload.model_url = model_url;
  if (resize_height !== undefined && resize_height > 0) payload.resize_height = resize_height;
  if (auto_size) payload.auto_size = auto_size;
  if (origin_at) payload.origin_at = origin_at;
  if (convert_format_only) payload.convert_format_only = convert_format_only;
  req.body = payload;
  meshyProxy(req, res, "/openapi/v1/remesh");
});

app.get("/api/meshy/remesh/:id", (req, res) => meshyProxy(req, res, `/openapi/v1/remesh/${req.params.id}`, "GET"));

// ── ObjectStore Worker Proxy ─────────────────────────────────────────────────
// Canonical path: all uploads go through objectstore.grudge-studio.com
// ─ D1 metadata is registered (shows up in catalog/search)
// ─ R2 file is stored (served via assets.grudge-studio.com CDN)
// ─ Same pattern as grudgeDot's objectstoreProxy.ts
const OBJECTSTORE_URL = (process.env.OBJECTSTORE_WORKER_URL || "https://objectstore.grudge-studio.com").replace(/\/$/, "");
const OBJECTSTORE_KEY = process.env.OBJECTSTORE_API_KEY || process.env.INTERNAL_API_KEY || "";
const CDN_BASE = process.env.PUBLIC_CDN_URL || "https://assets.grudge-studio.com";

async function objectstoreProxy(req: express.Request, res: express.Response, workerPath: string, injectKey = false) {
  try {
    const qs = Object.keys(req.query).length
      ? "?" + new URLSearchParams(req.query as Record<string, string>).toString()
      : "";
    const url = `${OBJECTSTORE_URL}${workerPath}${qs}`;
    const headers: Record<string, string> = {};
    const ct = req.headers["content-type"];
    if (ct) headers["Content-Type"] = ct;
    if (req.headers.authorization) headers["Authorization"] = req.headers.authorization as string;
    if (injectKey && OBJECTSTORE_KEY) headers["X-API-Key"] = OBJECTSTORE_KEY;

    const fetchOpts: RequestInit = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      // For JSON endpoints, forward the parsed body
      if (ct?.includes("application/json")) {
        fetchOpts.body = JSON.stringify(req.body);
      }
    }

    const upstream = await fetch(url, fetchOpts);
    const contentType = upstream.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } else {
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.status(upstream.status);
      if (contentType) res.set("Content-Type", contentType);
      res.send(buffer);
    }
  } catch (e: any) {
    log.error("ObjectStore proxy error:", e.message);
    res.status(502).json({ error: "ObjectStore worker unreachable", detail: e.message });
  }
}

// ObjectStore health
app.get("/api/objectstore/health", (req, res) => objectstoreProxy(req, res, "/health"));

// List / search assets (public reads)
app.get("/api/objectstore/assets", (req, res) => objectstoreProxy(req, res, "/v1/assets"));

// Get single asset metadata
app.get("/api/objectstore/assets/:id", (req, res) => objectstoreProxy(req, res, `/v1/assets/${req.params.id}`));

// Stream asset file (CDN)
app.get("/api/objectstore/assets/:id/file", (req, res) => objectstoreProxy(req, res, `/v1/assets/${req.params.id}/file`));

// Upload asset (auth required — injects API key)
app.post("/api/objectstore/assets", (req, res) => objectstoreProxy(req, res, "/v1/assets", true));

// Delete asset (auth required)
app.delete("/api/objectstore/assets/:id", (req, res) => objectstoreProxy(req, res, `/v1/assets/${req.params.id}`, true));

// ── Upload from URL via ObjectStore (pipeline convenience) ────────────────
// Downloads from Meshy/external, uploads to ObjectStore Worker → D1+R2
app.post("/api/objectstore/upload-from-url", async (req, res) => {
  try {
    const { url, filename, category = "pipeline", tags = [], metadata = {} } = req.body;
    if (!url || !filename) return res.status(400).json({ error: "url and filename required" });

    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(502).json({ error: `Download failed: ${upstream.status}` });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const mime = upstream.headers.get("content-type") || "application/octet-stream";

    // Build multipart form for ObjectStore Worker
    const boundary = `----Pipeline${Date.now()}`;
    const encoder = new TextEncoder();

    const filePreamble = encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
    );
    const fieldParts = [
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="filename"\r\n\r\n${filename}`,
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\n${category}`,
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="tags"\r\n\r\n${JSON.stringify([...tags, "pipeline"])}`,
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify({ source: "grudge-pipeline", originalUrl: url.slice(0, 200), ...metadata })}`,
    ].join("");
    const ending = `\r\n--${boundary}--\r\n`;

    const fieldBytes = encoder.encode(fieldParts);
    const endBytes = encoder.encode(ending);
    const body = new Uint8Array(filePreamble.length + buffer.length + fieldBytes.length + endBytes.length);
    body.set(filePreamble, 0);
    body.set(new Uint8Array(buffer), filePreamble.length);
    body.set(fieldBytes, filePreamble.length + buffer.length);
    body.set(endBytes, filePreamble.length + buffer.length + fieldBytes.length);

    const headers: Record<string, string> = {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    };
    if (OBJECTSTORE_KEY) headers["X-API-Key"] = OBJECTSTORE_KEY;

    const workerRes = await fetch(`${OBJECTSTORE_URL}/v1/assets`, {
      method: "POST", headers, body,
    });
    const data = await workerRes.json() as any;

    if (!workerRes.ok) return res.status(workerRes.status).json(data);

    // Return with CDN URL
    res.status(201).json({
      ...data,
      cdnUrl: `${CDN_BASE}/${data.key}`,
      source: "grudge-pipeline",
    });
  } catch (e: any) {
    log.error("ObjectStore upload-from-url error:", e.message);
    res.status(500).json({ error: "Upload failed", detail: e.message });
  }
});

// R2 status (checks both ObjectStore Worker and direct S3)
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const R2_ENDPOINT = process.env.R2_ENDPOINT ?? "";
const s3 = R2_ENDPOINT ? new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
}) : null;

app.get("/api/r2/status", async (_req, res) => {
  let objectstoreOk = false;
  try {
    const r = await fetch(`${OBJECTSTORE_URL}/health`);
    objectstoreOk = r.ok;
  } catch {}
  res.json({
    objectstore: { url: OBJECTSTORE_URL, connected: objectstoreOk },
    s3Direct: { configured: !!s3, endpoint: R2_ENDPOINT ? "connected" : "not set" },
    cdn: CDN_BASE,
  });
});

// ── Grudge catalog proxy (assets-api.grudge-studio.com) ─────────────────
const ASSETS_API = process.env.GRUDGE_ASSETS_API_URL ?? "https://assets-api.grudge-studio.com";

app.get("/api/assets/browse", async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query as Record<string, string>);
    const response = await fetch(`${ASSETS_API}/assets/catalog?${qs}`);
    res.status(response.ok ? 200 : response.status).json(await response.json());
  } catch (e: any) { res.status(500).json({ error: "Catalog unavailable" }); }
});

app.get("/api/assets/categories", async (_req, res) => {
  try {
    const response = await fetch(`${ASSETS_API}/assets/catalog/categories`);
    res.status(response.ok ? 200 : response.status).json(await response.json());
  } catch { res.status(500).json({ error: "Categories unavailable" }); }
});

// ── grudgeDot Pipeline Integration ────────────────────────────────────────────
// Push pipeline assets to grudgeDot via ObjectStore (canonical path)
const GRUDGEDOT_URL = process.env.GRUDGEDOT_URL ?? "https://grudgedot-launcher.vercel.app";

app.post("/api/grudgedot/push-asset", async (req, res) => {
  try {
    const { assetName, meshUrl, rigUrl, thumbnailUrl, category = "model", tags = [], metadata = {} } = req.body;
    if (!assetName || !meshUrl) return res.status(400).json({ error: "assetName and meshUrl required" });

    // Upload through ObjectStore Worker (registers in D1 + stores in R2)
    let uploadResult: any = null;
    try {
      const ext = meshUrl.split(".").pop()?.split("?")[0] || "glb";
      const filename = `${assetName.replace(/\s+/g, "_").toLowerCase()}.${ext}`;

      const upstream = await fetch(meshUrl);
      if (upstream.ok) {
        const buffer = Buffer.from(await upstream.arrayBuffer());
        const mime = upstream.headers.get("content-type") || "model/gltf-binary";

        const boundary = `----GDPush${Date.now()}`;
        const encoder = new TextEncoder();
        const filePreamble = encoder.encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
        );
        const fields = encoder.encode([
          `\r\n--${boundary}\r\nContent-Disposition: form-data; name="filename"\r\n\r\n${filename}`,
          `\r\n--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\n${category}`,
          `\r\n--${boundary}\r\nContent-Disposition: form-data; name="tags"\r\n\r\n${JSON.stringify([...tags, "pipeline", "grudgedot"])}`,
          `\r\n--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify({ source: "grudge-pipeline", assetName, ...metadata })}`,
        ].join(""));
        const end = encoder.encode(`\r\n--${boundary}--\r\n`);

        const body = new Uint8Array(filePreamble.length + buffer.length + fields.length + end.length);
        body.set(filePreamble, 0);
        body.set(new Uint8Array(buffer), filePreamble.length);
        body.set(fields, filePreamble.length + buffer.length);
        body.set(end, filePreamble.length + buffer.length + fields.length);

        const headers: Record<string, string> = {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        };
        if (OBJECTSTORE_KEY) headers["X-API-Key"] = OBJECTSTORE_KEY;

        const r = await fetch(`${OBJECTSTORE_URL}/v1/assets`, { method: "POST", headers, body });
        if (r.ok) uploadResult = await r.json();
      }
    } catch (e: any) { log.error("ObjectStore upload during grudgeDot push:", e.message); }

    res.json({
      pushed: true,
      asset: {
        name: assetName,
        meshUrl: uploadResult ? `${CDN_BASE}/${uploadResult.key}` : meshUrl,
        rigUrl, thumbnailUrl, category, tags,
        objectstoreId: uploadResult?.id,
        cdnKey: uploadResult?.key,
        source: "grudge-pipeline",
      },
    });
  } catch (e: any) { log.error("grudgeDot push error:", e.message); res.status(500).json({ error: "Push failed" }); }
});

// ── Puter → Grudge Auth ──────────────────────────────────────────────────────
// Accepts a Puter user (uuid + username) and resolves / creates a Grudge ID.
// In production this hits the Grudge backend; here we maintain a lightweight
// in-memory map so the pipeline app can operate standalone.

import crypto from "crypto";

const GRUDGE_API = process.env.GRUDGE_API_URL ?? "https://api.grudge-studio.com";

app.post("/api/auth/puter", async (req, res) => {
  try {
    const { puter_uuid, username } = req.body;
    if (!puter_uuid || !username) {
      return res.status(400).json({ error: "puter_uuid and username required" });
    }

    // Try the canonical Grudge backend first
    try {
      const upstream = await fetch(`${GRUDGE_API}/auth/puter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(OBJECTSTORE_KEY ? { "X-API-Key": OBJECTSTORE_KEY } : {}) },
        body: JSON.stringify({ puter_uuid, username }),
      });
      if (upstream.ok) {
        const data = await upstream.json() as any;
        return res.json(data);
      }
    } catch {
      // Grudge backend unreachable — fall through to local provisioning
    }

    // Local fallback: deterministic Grudge ID from Puter UUID
    const grudge_id = `grudge_${crypto.createHash("sha256").update(puter_uuid).digest("hex").slice(0, 16)}`;
    // Deterministic server-side wallet (placeholder keypair seed)
    const wallet_seed = crypto.createHash("sha256").update(`wallet:${puter_uuid}`).digest("hex");

    const user = {
      grudge_id,
      puter_id: puter_uuid,
      username,
      provider: "puter",
      wallet: {
        address: `0x${wallet_seed.slice(0, 40)}`,
        provisioned: true,
      },
    };

    log.info("Puter auth (local):", user.grudge_id, user.username);
    res.json({ valid: true, user });
  } catch (e: any) {
    log.error("Puter auth error:", e.message);
    res.status(500).json({ error: "Auth failed" });
  }
});

app.get("/api/auth/me", async (req, res) => {
  const { puter_uuid } = req.query as { puter_uuid?: string };
  if (!puter_uuid) return res.status(400).json({ error: "puter_uuid required" });

  const grudge_id = `grudge_${crypto.createHash("sha256").update(puter_uuid).digest("hex").slice(0, 16)}`;
  const wallet_seed = crypto.createHash("sha256").update(`wallet:${puter_uuid}`).digest("hex");

  res.json({
    valid: true,
    user: {
      grudge_id,
      puter_id: puter_uuid,
      username: req.query.username ?? "unknown",
      provider: "puter",
      wallet: { address: `0x${wallet_seed.slice(0, 40)}`, provisioned: true },
    },
  });
});

// ── Stub routes (return empty data until DB is connected) ────────────────────
app.get("/api/assets", (_req, res) => res.json({ assets: [] }));
app.get("/api/characters", (_req, res) => res.json({ characters: [] }));
app.post("/api/characters", (req, res) => res.status(201).json({ character: { id: "stub", ...req.body } }));
app.get("/api/scenes", (_req, res) => res.json({ scenes: [] }));
app.post("/api/scenes", (req, res) => res.status(201).json({ scene: { id: "stub", ...req.body } }));
app.get("/api/animations", (_req, res) => res.json({ animations: [] }));
app.post("/api/animations", (req, res) => res.status(201).json({ animation: { id: "stub", ...req.body } }));
app.get("/api/batch/jobs", (_req, res) => res.json({ jobs: [] }));
app.get("/api/batch/summary", (_req, res) => res.json({ total: 0, queued: 0, inProgress: 0, completed: 0, failed: 0 }));
app.post("/api/batch/generate", (req, res) => res.status(201).json({ batchSize: 0, jobs: [] }));

// ── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => res.status(404).json({ error: "Not found" }));

// ── Export for Vercel serverless ─────────────────────────────────────────────
export default function handler(req: VercelRequest, res: VercelResponse) {
  return new Promise<void>((resolve, reject) => {
    app(req as any, res as any, (err?: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
