import { Router } from "express";
import { db } from "@workspace/db";
import {
  pipelineAssets, pipelineJobs, scenes,
  animationMappings, weaponConfigs,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, extractToken } from "../middleware/auth";
import * as grudge from "../lib/grudge-client";

const router = Router();

// ── Export character bundle ──────────────────────────────────────────────────
// Packages: mesh + rig + animations + weapon configs into a Grudge asset bundle
router.post("/export/character-bundle", requireAuth, async (req, res) => {
  try {
    const { characterName, meshAssetUuid, rigAssetUuid, animationMappingIds, weaponConfigIds } = req.body as {
      characterName: string;
      meshAssetUuid?: string;
      rigAssetUuid?: string;
      animationMappingIds?: string[];
      weaponConfigIds?: string[];
    };

    if (!characterName) {
      res.status(400).json({ error: "characterName required" });
      return;
    }

    const token = extractToken(req);
    const assetUuids: string[] = [];

    if (meshAssetUuid) assetUuids.push(meshAssetUuid);
    if (rigAssetUuid) assetUuids.push(rigAssetUuid);

    // Gather animation asset UUIDs
    let animations: typeof animationMappings.$inferSelect[] = [];
    if (animationMappingIds?.length) {
      for (const id of animationMappingIds) {
        const [mapping] = await db
          .select()
          .from(animationMappings)
          .where(eq(animationMappings.id, id))
          .limit(1);
        if (mapping) animations.push(mapping);
      }
    }

    // Gather weapon config details
    let weapons: typeof weaponConfigs.$inferSelect[] = [];
    if (weaponConfigIds?.length) {
      for (const id of weaponConfigIds) {
        const [config] = await db
          .select()
          .from(weaponConfigs)
          .where(eq(weaponConfigs.id, id))
          .limit(1);
        if (config && config.grudgeAssetUuid) {
          assetUuids.push(config.grudgeAssetUuid);
          weapons.push(config);
        }
      }
    }

    // Create bundle on Grudge backend if we have assets
    let bundle = null;
    if (assetUuids.length > 0 && token) {
      bundle = await grudge.createBundle(
        token,
        `${characterName} — Character Bundle`,
        assetUuids,
        `Exported character bundle for ${characterName}`,
      );
    }

    // Build manifest
    const manifest = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      character: {
        name: characterName,
        meshAssetUuid,
        rigAssetUuid,
        animations: animations.map((a) => ({
          setName: a.animationSetName,
          skeletonType: a.skeletonType,
          characterClass: a.characterClass,
          weaponContext: a.weaponContext,
          urls: a.animationUrls,
        })),
        weapons: weapons.map((w) => ({
          name: w.name,
          type: w.weaponType,
          mountBone: w.mountBone,
          offset: { x: w.offsetX, y: w.offsetY, z: w.offsetZ },
          rotation: { x: w.rotationX, y: w.rotationY, z: w.rotationZ },
          scale: w.scaleMultiplier,
          meshUrl: w.meshUrl,
          grudgeAssetUuid: w.grudgeAssetUuid,
        })),
      },
      bundle,
    };

    res.json(manifest);
  } catch (e) {
    console.error("Character bundle export error:", e);
    res.status(500).json({ error: "Export failed" });
  }
});

// ── Export scene bundle ──────────────────────────────────────────────────────
router.post("/export/scene-bundle", requireAuth, async (req, res) => {
  try {
    const { sceneId, bundleName } = req.body as {
      sceneId: string;
      bundleName?: string;
    };

    if (!sceneId) {
      res.status(400).json({ error: "sceneId required" });
      return;
    }

    const [scene] = await db
      .select()
      .from(scenes)
      .where(eq(scenes.id, sceneId))
      .limit(1);

    if (!scene) {
      res.status(404).json({ error: "Scene not found" });
      return;
    }

    // Collect all asset UUIDs from placements
    const placementAssetIds = (scene.placements as any[] ?? [])
      .map((p: { assetId: string }) => p.assetId)
      .filter(Boolean);

    // Look up Grudge asset UUIDs for those assets
    const grudgeUuids: string[] = [];
    for (const assetId of placementAssetIds) {
      const [asset] = await db
        .select()
        .from(pipelineAssets)
        .where(eq(pipelineAssets.id, assetId))
        .limit(1);
      if (asset?.grudgeAssetUuid) {
        grudgeUuids.push(asset.grudgeAssetUuid);
      }
    }

    // Create bundle on Grudge backend
    const token = extractToken(req);
    let bundle = null;
    if (grudgeUuids.length > 0 && token) {
      bundle = await grudge.createBundle(
        token,
        bundleName ?? `${scene.name} — Scene Bundle`,
        grudgeUuids,
        `Scene export: ${scene.name}`,
      );
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
      assetCount: grudgeUuids.length,
      bundle,
    };

    res.json(exportData);
  } catch (e) {
    console.error("Scene bundle export error:", e);
    res.status(500).json({ error: "Export failed" });
  }
});

// ── Deploy to game CDN ───────────────────────────────────────────────────────
// Generates a full game manifest with all characters, scenes, animations
router.post("/export/deploy", requireAuth, async (req, res) => {
  try {
    const { jobIds, sceneIds } = req.body as {
      jobIds?: string[];
      sceneIds?: string[];
    };

    // Gather completed pipeline jobs
    const characters: Array<{
      name: string;
      meshUrl: string;
      rigUrl?: string;
      meshAssetUuid?: string;
      rigAssetUuid?: string;
    }> = [];

    if (jobIds?.length) {
      for (const id of jobIds) {
        const [job] = await db
          .select()
          .from(pipelineJobs)
          .where(eq(pipelineJobs.id, id))
          .limit(1);
        if (job?.status === "completed" && job.finalMeshUrl) {
          characters.push({
            name: job.prompt.slice(0, 50),
            meshUrl: job.finalMeshUrl,
            rigUrl: job.finalRigUrl ?? undefined,
            meshAssetUuid: job.meshAssetUuid ?? undefined,
            rigAssetUuid: job.rigAssetUuid ?? undefined,
          });
        }
      }
    }

    // Gather scenes
    const exportedScenes: Array<Record<string, unknown>> = [];
    if (sceneIds?.length) {
      for (const id of sceneIds) {
        const [scene] = await db
          .select()
          .from(scenes)
          .where(eq(scenes.id, id))
          .limit(1);
        if (scene) {
          exportedScenes.push({
            id: scene.id,
            name: scene.name,
            template: scene.template,
            placements: scene.placements,
            environment: scene.environment,
            lighting: scene.lighting,
          });
        }
      }
    }

    const manifest = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      characters,
      scenes: exportedScenes,
      assetCdnBase: "https://assets.grudge-studio.com",
    };

    res.json(manifest);
  } catch (e) {
    console.error("Deploy export error:", e);
    res.status(500).json({ error: "Deploy failed" });
  }
});

export default router;
