import { Router } from "express";
import { db } from "@workspace/db";
import { scenes, insertSceneSchema } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middleware/auth";

const router = Router();

// ── List scenes ──────────────────────────────────────────────────────────────
router.get("/scenes", optionalAuth, async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(scenes)
      .orderBy(desc(scenes.updatedAt))
      .limit(100);
    res.json({ scenes: rows });
  } catch (e) {
    console.error("List scenes error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Get single scene ─────────────────────────────────────────────────────────
router.get("/scenes/:id", async (req, res) => {
  try {
    const [scene] = await db
      .select()
      .from(scenes)
      .where(eq(scenes.id, req.params.id))
      .limit(1);
    if (!scene) {
      res.status(404).json({ error: "Scene not found" });
      return;
    }
    res.json(scene);
  } catch (e) {
    console.error("Get scene error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Create scene ─────────────────────────────────────────────────────────────
router.post("/scenes", requireAuth, async (req, res) => {
  try {
    const parsed = insertSceneSchema.safeParse({
      ...req.body,
      grudgeId: req.grudgeUser?.grudge_id ?? req.body.grudgeId,
    });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
      return;
    }

    const [scene] = await db.insert(scenes).values(parsed.data).returning();
    res.status(201).json({ scene });
  } catch (e) {
    console.error("Create scene error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Update scene ─────────────────────────────────────────────────────────────
router.patch("/scenes/:id", requireAuth, async (req, res) => {
  try {
    const { name, description, template, placements, environment, lighting, thumbnailUrl } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (template !== undefined) updates.template = template;
    if (placements !== undefined) updates.placements = placements;
    if (environment !== undefined) updates.environment = environment;
    if (lighting !== undefined) updates.lighting = lighting;
    if (thumbnailUrl !== undefined) updates.thumbnailUrl = thumbnailUrl;

    const [updated] = await db
      .update(scenes)
      .set(updates)
      .where(eq(scenes.id, req.params.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Scene not found" });
      return;
    }
    res.json({ scene: updated });
  } catch (e) {
    console.error("Update scene error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Delete scene ─────────────────────────────────────────────────────────────
router.delete("/scenes/:id", requireAuth, async (req, res) => {
  try {
    const [deleted] = await db
      .delete(scenes)
      .where(eq(scenes.id, req.params.id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Scene not found" });
      return;
    }
    res.json({ deleted: true, id: deleted.id });
  } catch (e) {
    console.error("Delete scene error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Export scene as game-ready JSON ──────────────────────────────────────────
router.get("/scenes/:id/export", async (req, res) => {
  try {
    const [scene] = await db
      .select()
      .from(scenes)
      .where(eq(scenes.id, req.params.id))
      .limit(1);

    if (!scene) {
      res.status(404).json({ error: "Scene not found" });
      return;
    }

    const exportData = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      scene: {
        id: scene.id,
        name: scene.name,
        template: scene.template,
        placements: scene.placements,
        environment: scene.environment,
        lighting: scene.lighting,
      },
    };

    res.json(exportData);
  } catch (e) {
    console.error("Export scene error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
