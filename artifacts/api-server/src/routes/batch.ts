import { Router } from "express";
import { db } from "@workspace/db";
import { pipelineJobs, insertPipelineJobSchema } from "@workspace/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middleware/auth";

const router = Router();

// ── Submit batch of pipeline jobs ────────────────────────────────────────────
router.post("/batch/generate", requireAuth, async (req, res) => {
  try {
    const { jobs } = req.body as {
      jobs: Array<{
        prompt: string;
        config?: {
          ai_model?: string;
          topology?: string;
          target_polycount?: number;
          pose_mode?: string;
          enable_pbr?: boolean;
          target_formats?: string[];
          height_meters?: number;
        };
      }>;
    };

    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      res.status(400).json({ error: "jobs array required and must not be empty" });
      return;
    }

    if (jobs.length > 50) {
      res.status(400).json({ error: "Maximum 50 jobs per batch" });
      return;
    }

    const grudgeId = req.grudgeUser?.grudge_id ?? null;

    const insertValues = jobs.map((j) => ({
      grudgeId,
      prompt: j.prompt,
      status: "queued" as const,
      currentStep: 0,
      totalSteps: 6,
      config: j.config ?? null,
    }));

    const created = await db.insert(pipelineJobs).values(insertValues).returning();
    res.status(201).json({ batchSize: created.length, jobs: created });
  } catch (e) {
    console.error("Batch generate error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── List pipeline jobs ───────────────────────────────────────────────────────
router.get("/batch/jobs", optionalAuth, async (req, res) => {
  try {
    const { status, limit = "50", page = "1" } = req.query as Record<string, string>;
    const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * safeLimit;

    let rows;
    if (status) {
      rows = await db
        .select()
        .from(pipelineJobs)
        .where(eq(pipelineJobs.status, status as any))
        .orderBy(desc(pipelineJobs.createdAt))
        .limit(safeLimit)
        .offset(offset);
    } else {
      rows = await db
        .select()
        .from(pipelineJobs)
        .orderBy(desc(pipelineJobs.createdAt))
        .limit(safeLimit)
        .offset(offset);
    }

    res.json({ jobs: rows });
  } catch (e) {
    console.error("List jobs error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Get single job ───────────────────────────────────────────────────────────
router.get("/batch/jobs/:id", async (req, res) => {
  try {
    const [job] = await db
      .select()
      .from(pipelineJobs)
      .where(eq(pipelineJobs.id, req.params.id))
      .limit(1);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  } catch (e) {
    console.error("Get job error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Update job status (internal/pipeline use) ────────────────────────────────
router.patch("/batch/jobs/:id", requireAuth, async (req, res) => {
  try {
    const {
      status, currentStep, error,
      conceptTaskId, previewTaskId, refineTaskId,
      retextureTaskId, remeshTaskId, rigTaskId,
      finalMeshUrl, finalRigUrl, finalThumbnailUrl,
      meshAssetUuid, rigAssetUuid,
    } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status !== undefined) updates.status = status;
    if (currentStep !== undefined) updates.currentStep = currentStep;
    if (error !== undefined) updates.error = error;
    if (conceptTaskId !== undefined) updates.conceptTaskId = conceptTaskId;
    if (previewTaskId !== undefined) updates.previewTaskId = previewTaskId;
    if (refineTaskId !== undefined) updates.refineTaskId = refineTaskId;
    if (retextureTaskId !== undefined) updates.retextureTaskId = retextureTaskId;
    if (remeshTaskId !== undefined) updates.remeshTaskId = remeshTaskId;
    if (rigTaskId !== undefined) updates.rigTaskId = rigTaskId;
    if (finalMeshUrl !== undefined) updates.finalMeshUrl = finalMeshUrl;
    if (finalRigUrl !== undefined) updates.finalRigUrl = finalRigUrl;
    if (finalThumbnailUrl !== undefined) updates.finalThumbnailUrl = finalThumbnailUrl;
    if (meshAssetUuid !== undefined) updates.meshAssetUuid = meshAssetUuid;
    if (rigAssetUuid !== undefined) updates.rigAssetUuid = rigAssetUuid;
    if (status === "completed") updates.completedAt = new Date();

    const [updated] = await db
      .update(pipelineJobs)
      .set(updates)
      .where(eq(pipelineJobs.id, req.params.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json({ job: updated });
  } catch (e) {
    console.error("Update job error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Batch status summary ─────────────────────────────────────────────────────
router.get("/batch/summary", optionalAuth, async (_req, res) => {
  try {
    const allJobs = await db.select().from(pipelineJobs);
    const summary = {
      total: allJobs.length,
      queued: allJobs.filter((j) => j.status === "queued").length,
      inProgress: allJobs.filter((j) =>
        !["queued", "completed", "failed"].includes(j.status),
      ).length,
      completed: allJobs.filter((j) => j.status === "completed").length,
      failed: allJobs.filter((j) => j.status === "failed").length,
    };
    res.json(summary);
  } catch (e) {
    console.error("Batch summary error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
