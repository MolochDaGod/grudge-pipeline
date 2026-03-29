import { Router } from "express";
import { db } from "@workspace/db";
import { animationMappings, insertAnimationMappingSchema } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middleware/auth";

const router = Router();

// ── Default animation presets per class ──────────────────────────────────────
const CLASS_PRESETS: Record<string, { setName: string; weaponContext: string }[]> = {
  warrior: [
    { setName: "warrior_sword_shield", weaponContext: "sword+shield" },
    { setName: "warrior_2h", weaponContext: "2h_weapon" },
    { setName: "warrior_hammer", weaponContext: "hammer" },
  ],
  mage: [
    { setName: "mage_staff", weaponContext: "staff" },
    { setName: "mage_wand_tome", weaponContext: "wand+tome" },
    { setName: "mage_mace_relic", weaponContext: "mace+off_hand_relic" },
  ],
  ranger: [
    { setName: "ranger_bow", weaponContext: "bow" },
    { setName: "ranger_crossbow", weaponContext: "crossbow" },
    { setName: "ranger_dual_dagger", weaponContext: "dagger+dagger" },
    { setName: "ranger_gun", weaponContext: "gun" },
  ],
  worge: [
    { setName: "worge_bear", weaponContext: "unarmed" },
    { setName: "worge_raptor", weaponContext: "dagger" },
    { setName: "worge_bird", weaponContext: "unarmed" },
    { setName: "worge_humanoid", weaponContext: "staff" },
  ],
};

// ── List animation mappings ──────────────────────────────────────────────────
router.get("/animations", optionalAuth, async (req, res) => {
  try {
    const { characterClass, skeletonType } = req.query as Record<string, string>;
    let query = db.select().from(animationMappings).orderBy(desc(animationMappings.createdAt));

    // Note: filtering done in application layer for simplicity
    const rows = await query.limit(200);

    let filtered = rows;
    if (characterClass) {
      filtered = filtered.filter((r) => r.characterClass === characterClass);
    }
    if (skeletonType) {
      filtered = filtered.filter((r) => r.skeletonType === skeletonType);
    }

    res.json({ animations: filtered });
  } catch (e) {
    console.error("List animations error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Get single animation mapping ─────────────────────────────────────────────
router.get("/animations/:id", async (req, res) => {
  try {
    const [mapping] = await db
      .select()
      .from(animationMappings)
      .where(eq(animationMappings.id, req.params.id))
      .limit(1);
    if (!mapping) {
      res.status(404).json({ error: "Animation mapping not found" });
      return;
    }
    res.json(mapping);
  } catch (e) {
    console.error("Get animation mapping error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Create animation mapping ─────────────────────────────────────────────────
router.post("/animations", requireAuth, async (req, res) => {
  try {
    const parsed = insertAnimationMappingSchema.safeParse({
      ...req.body,
      grudgeId: req.grudgeUser?.grudge_id ?? req.body.grudgeId,
    });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
      return;
    }

    const [mapping] = await db
      .insert(animationMappings)
      .values(parsed.data)
      .returning();
    res.status(201).json({ animation: mapping });
  } catch (e) {
    console.error("Create animation mapping error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Update animation mapping ─────────────────────────────────────────────────
router.patch("/animations/:id", requireAuth, async (req, res) => {
  try {
    const { animationSetName, animationUrls, retargetConfig, skeletonType, characterClass, weaponContext, tags } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (animationSetName !== undefined) updates.animationSetName = animationSetName;
    if (animationUrls !== undefined) updates.animationUrls = animationUrls;
    if (retargetConfig !== undefined) updates.retargetConfig = retargetConfig;
    if (skeletonType !== undefined) updates.skeletonType = skeletonType;
    if (characterClass !== undefined) updates.characterClass = characterClass;
    if (weaponContext !== undefined) updates.weaponContext = weaponContext;
    if (tags !== undefined) updates.tags = tags;

    const [updated] = await db
      .update(animationMappings)
      .set(updates)
      .where(eq(animationMappings.id, req.params.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Animation mapping not found" });
      return;
    }
    res.json({ animation: updated });
  } catch (e) {
    console.error("Update animation mapping error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Delete animation mapping ─────────────────────────────────────────────────
router.delete("/animations/:id", requireAuth, async (req, res) => {
  try {
    const [deleted] = await db
      .delete(animationMappings)
      .where(eq(animationMappings.id, req.params.id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Animation mapping not found" });
      return;
    }
    res.json({ deleted: true, id: deleted.id });
  } catch (e) {
    console.error("Delete animation mapping error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Get class presets ────────────────────────────────────────────────────────
router.get("/animations/presets/:characterClass", (req, res) => {
  const presets = CLASS_PRESETS[req.params.characterClass];
  if (!presets) {
    res.status(404).json({ error: "Unknown class", validClasses: Object.keys(CLASS_PRESETS) });
    return;
  }
  res.json({ characterClass: req.params.characterClass, presets });
});

export default router;
