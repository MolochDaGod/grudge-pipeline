import { Router } from "express";
import { db } from "@workspace/db";
import { pipelineAssets, insertPipelineAssetSchema } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAuth, optionalAuth, extractToken } from "../middleware/auth";
import * as grudge from "../lib/grudge-client";

const router = Router();

// ── Upload from pipeline ──────────────────────────────────────────────────────
// Downloads the model from Meshy URL, uploads to Grudge R2 via presigned flow,
// then records the asset locally.
router.post("/assets/upload-from-pipeline", requireAuth, async (req, res) => {
  try {
    const {
      modelUrl,
      filename,
      category = "model",
      pipelineJobId,
      sourceStep,
      sourceTaskId,
      name,
      tags = [],
      polycount,
      metadata = {},
    } = req.body as {
      modelUrl: string;
      filename: string;
      category?: string;
      pipelineJobId?: string;
      sourceStep?: string;
      sourceTaskId?: string;
      name?: string;
      tags?: string[];
      polycount?: number;
      metadata?: Record<string, unknown>;
    };

    if (!modelUrl || !filename) {
      res.status(400).json({ error: "modelUrl and filename required" });
      return;
    }

    const token = extractToken(req);
    if (!token && !req.isInternal) {
      res.status(401).json({ error: "Token required for asset upload" });
      return;
    }

    // Determine MIME from extension
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mimeMap: Record<string, string> = {
      glb: "model/gltf-binary",
      gltf: "model/gltf+json",
      fbx: "application/octet-stream",
      obj: "text/plain",
      usdz: "model/vnd.usdz+zip",
      stl: "model/stl",
    };
    const mime = mimeMap[ext] ?? "application/octet-stream";

    // Download the file from Meshy
    const { buffer } = await grudge.downloadFile(modelUrl);

    // Get presigned upload URL from Grudge backend
    const presign = await grudge.presignUpload(
      token ?? "",
      filename,
      mime,
      category as any,
      [...tags, "pipeline", sourceStep ?? "unknown"].filter(Boolean),
      { ...metadata, pipelineJobId, sourceStep, sourceTaskId, polycount },
    );

    // Upload to R2
    await grudge.uploadFileToPresignedUrl(presign.uploadUrl, buffer, mime);

    // Confirm upload
    const completed = await grudge.completeUpload(token ?? "", presign.uuid);

    // Record locally
    const [asset] = await db
      .insert(pipelineAssets)
      .values({
        grudgeAssetUuid: presign.uuid,
        pipelineJobId: pipelineJobId ?? null,
        category: category as any,
        name: name ?? filename,
        meshUrl: completed.url,
        source: "meshy",
        sourceStep,
        sourceTaskId,
        fileFormat: ext,
        polycount: polycount ?? null,
        fileSize: completed.size,
        tags,
        metadata,
        grudgeId: req.grudgeUser?.grudge_id ?? null,
      })
      .returning();

    res.status(201).json({ asset, grudgeUuid: presign.uuid, url: completed.url });
  } catch (e) {
    console.error("Upload from pipeline error:", e);
    res.status(500).json({ error: "Upload failed", detail: e instanceof Error ? e.message : "" });
  }
});

// ── Browse Grudge asset catalog (public, no auth required) ───────────────────
router.get("/assets/browse", optionalAuth, async (req, res) => {
  try {
    const { type, category, search, page, limit } = req.query as Record<string, string>;
    const data = await grudge.browseCatalog({
      type,
      category,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
    res.json(data);
  } catch (e) {
    console.error("Browse catalog error:", e);
    res.status(500).json({ error: "Failed to browse catalog" });
  }
});

// ── Get catalog categories ───────────────────────────────────────────────────
router.get("/assets/categories", async (_req, res) => {
  try {
    const data = await grudge.getCatalogCategories();
    res.json(data);
  } catch (e) {
    console.error("Get categories error:", e);
    res.status(500).json({ error: "Failed to get categories" });
  }
});

// ── Import existing Grudge asset into pipeline ──────────────────────────────
router.post("/assets/import", requireAuth, async (req, res) => {
  try {
    const { grudgeAssetUuid, name, category } = req.body as {
      grudgeAssetUuid: string;
      name?: string;
      category?: string;
    };

    if (!grudgeAssetUuid) {
      res.status(400).json({ error: "grudgeAssetUuid required" });
      return;
    }

    const token = extractToken(req);
    const grudgeAsset = await grudge.getAsset(token ?? "", grudgeAssetUuid);

    const [asset] = await db
      .insert(pipelineAssets)
      .values({
        grudgeAssetUuid,
        category: (category ?? grudgeAsset.category ?? "model") as any,
        name: name ?? grudgeAsset.filename,
        meshUrl: grudgeAsset.url,
        source: "grudge_import",
        fileFormat: grudgeAsset.filename.split(".").pop() ?? "",
        fileSize: grudgeAsset.size,
        tags: grudgeAsset.tags ?? [],
        metadata: grudgeAsset.metadata ?? {},
        grudgeId: req.grudgeUser?.grudge_id ?? null,
      })
      .returning();

    res.status(201).json({ asset });
  } catch (e) {
    console.error("Import asset error:", e);
    res.status(500).json({ error: "Failed to import asset" });
  }
});

// ── List pipeline assets ─────────────────────────────────────────────────────
router.get("/assets", optionalAuth, async (req, res) => {
  try {
    const assets = await db
      .select()
      .from(pipelineAssets)
      .orderBy(desc(pipelineAssets.createdAt))
      .limit(100);
    res.json({ assets });
  } catch (e) {
    console.error("List pipeline assets error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Get single pipeline asset ────────────────────────────────────────────────
router.get("/assets/:id", async (req, res) => {
  try {
    const [asset] = await db
      .select()
      .from(pipelineAssets)
      .where(eq(pipelineAssets.id, req.params.id))
      .limit(1);
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }
    res.json(asset);
  } catch (e) {
    console.error("Get pipeline asset error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Sync ObjectStore ─────────────────────────────────────────────────────────
router.post("/assets/sync-objectstore", requireAuth, async (_req, res) => {
  try {
    const result = await grudge.syncObjectStore();
    res.json(result);
  } catch (e) {
    console.error("Sync objectstore error:", e);
    res.status(500).json({ error: "Sync failed" });
  }
});

export default router;
