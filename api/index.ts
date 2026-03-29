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

// ── Cloudflare R2 Direct Storage ─────────────────────────────────────────────
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ENDPOINT = process.env.R2_ENDPOINT ?? "";
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID ?? "";
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "";
const R2_BUCKET = process.env.R2_BUCKET ?? "grudge-assets";

const s3 = R2_ENDPOINT ? new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
}) : null;

// Get presigned upload URL for direct browser uploads to R2
app.post("/api/r2/presign-upload", async (req, res) => {
  try {
    if (!s3) return res.status(503).json({ error: "R2 storage not configured" });
    const { filename, contentType, category = "pipeline" } = req.body;
    if (!filename) return res.status(400).json({ error: "filename required" });

    const key = `${category}/${Date.now()}-${filename}`;
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    res.json({ uploadUrl, key, bucket: R2_BUCKET });
  } catch (e: any) { log.error("R2 presign error:", e.message); res.status(500).json({ error: "Presign failed" }); }
});

// Upload from URL — download file from Meshy/external and store in R2
app.post("/api/r2/upload-from-url", async (req, res) => {
  try {
    if (!s3) return res.status(503).json({ error: "R2 storage not configured" });
    const { url, filename, category = "pipeline", metadata = {} } = req.body;
    if (!url || !filename) return res.status(400).json({ error: "url and filename required" });

    // Download the file
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(502).json({ error: `Failed to download: ${upstream.status}` });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const mime = upstream.headers.get("content-type") || "application/octet-stream";

    const key = `${category}/${Date.now()}-${filename}`;
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mime,
      Metadata: {
        source: "grudge-pipeline",
        originalUrl: url.slice(0, 200),
        ...Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k, String(v)])),
      },
    }));

    const publicUrl = `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;
    res.json({ key, bucket: R2_BUCKET, size: buffer.length, mime, publicUrl });
  } catch (e: any) { log.error("R2 upload-from-url error:", e.message); res.status(500).json({ error: "Upload failed" }); }
});

// List objects in R2 bucket
app.get("/api/r2/list", async (req, res) => {
  try {
    if (!s3) return res.status(503).json({ error: "R2 storage not configured" });
    const { prefix = "", limit = "50" } = req.query as Record<string, string>;
    const result = await s3.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: prefix,
      MaxKeys: Math.min(parseInt(limit) || 50, 200),
    }));
    const objects = (result.Contents ?? []).map(o => ({
      key: o.Key, size: o.Size, lastModified: o.LastModified?.toISOString(),
    }));
    res.json({ objects, count: objects.length, prefix });
  } catch (e: any) { log.error("R2 list error:", e.message); res.status(500).json({ error: "List failed" }); }
});

// R2 health check
app.get("/api/r2/status", (_req, res) => {
  res.json({ configured: !!s3, endpoint: R2_ENDPOINT ? "connected" : "not set", bucket: R2_BUCKET });
});

// ── Grudge catalog proxy (no DB needed) ──────────────────────────────────────
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

// ── GDevelop Pipeline Integration ────────────────────────────────────────────
// Called by GDevelop Assistant to push pipeline-generated assets into its system
const GDEVELOP_URL = process.env.GDEVELOP_URL ?? "https://gdevelop-assistant.vercel.app";

app.post("/api/gdevelop/push-asset", async (req, res) => {
  try {
    const { assetName, meshUrl, rigUrl, thumbnailUrl, category, tags, metadata } = req.body;
    if (!assetName || !meshUrl) return res.status(400).json({ error: "assetName and meshUrl required" });

    // First upload to R2 if configured
    let r2Key = null;
    if (s3 && meshUrl) {
      const ext = meshUrl.split(".").pop()?.split("?")[0] || "glb";
      const filename = `${assetName.replace(/\s+/g, "_").toLowerCase()}.${ext}`;
      try {
        const upstream = await fetch(meshUrl);
        if (upstream.ok) {
          const buffer = Buffer.from(await upstream.arrayBuffer());
          r2Key = `gdevelop/${Date.now()}-${filename}`;
          await s3.send(new PutObjectCommand({
            Bucket: R2_BUCKET, Key: r2Key, Body: buffer,
            ContentType: upstream.headers.get("content-type") || "model/gltf-binary",
            Metadata: { source: "grudge-pipeline", assetName, ...(metadata ? Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k, String(v)])) : {}) },
          }));
        }
      } catch (e: any) { log.error("R2 upload during GDevelop push:", e.message); }
    }

    res.json({
      pushed: true,
      asset: {
        name: assetName,
        meshUrl: r2Key ? `${R2_ENDPOINT}/${R2_BUCKET}/${r2Key}` : meshUrl,
        rigUrl, thumbnailUrl, category, tags,
        r2Key,
        source: "grudge-pipeline",
      },
    });
  } catch (e: any) { log.error("GDevelop push error:", e.message); res.status(500).json({ error: "Push failed" }); }
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
