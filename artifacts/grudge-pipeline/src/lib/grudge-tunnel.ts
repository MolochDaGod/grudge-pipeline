/**
 * Grudge Tunnel SDK
 *
 * Unified export pipeline that pushes assets, scenes, animations,
 * and converted code from the Grudge Pipeline to any Grudge Web Engine instance.
 *
 * Flow:
 *   Pipeline (this app) → Tunnel → Grudge Web Engine API → ObjectStore / Scene DB
 *
 * Auth: Uses the Grudge ID from Puter auth. Every push is tagged with
 * the user's grudge_id so the engine knows who owns what.
 *
 * Supports:
 *  - Asset push (glb, gltf, textures, audio)
 *  - Scene push (serialized BabylonJS scene)
 *  - Animation push (retargeted animation groups)
 *  - Code push (converted playground → module code)
 *  - Archive push (zip/7z → engine unpacks and catalogs)
 *  - Batch push (multiple assets in one call)
 */

import type { Scene } from "@babylonjs/core/scene";
import { GLTF2Export } from "@babylonjs/serializers/glTF";

// ── Types ────────────────────────────────────────────────────────────────────

export type AssetCategory =
  | "model" | "texture" | "sprite" | "animation" | "audio"
  | "scene" | "script" | "icon" | "ui" | "config" | "archive" | "other";

export interface TunnelConfig {
  /** Grudge Web Engine API base URL (e.g. https://grudge-engine-web.vercel.app) */
  engineUrl: string;
  /** ObjectStore Worker URL (canonical asset storage) */
  objectStoreUrl?: string;
  /** CDN base for asset URLs */
  cdnBase?: string;
  /** Grudge ID of the authenticated user */
  grudgeId: string;
  /** Optional API key for service-to-service auth */
  apiKey?: string;
}

export interface PushResult {
  success: boolean;
  id?: string;
  key?: string;
  cdnUrl?: string;
  engineUrl?: string;
  error?: string;
}

export interface AssetPushOptions {
  filename: string;
  category: AssetCategory;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ScenePushOptions {
  name: string;
  description?: string;
  tags?: string[];
  /** Include physics config in export */
  includePhysics?: boolean;
}

export interface CodePushOptions {
  filename: string;
  language: "typescript" | "javascript";
  /** Script category for the engine's script editor */
  scriptType?: "scene" | "component" | "behavior" | "shader" | "utility";
}

// ── Default config ───────────────────────────────────────────────────────────

const DEFAULTS: Partial<TunnelConfig> = {
  objectStoreUrl: "https://objectstore.grudge-studio.com",
  cdnBase: "https://assets.grudge-studio.com",
};

// ── Tunnel SDK ───────────────────────────────────────────────────────────────

export class GrudgeTunnel {
  private config: Required<TunnelConfig> & { apiKey: string };

  constructor(config: TunnelConfig) {
    this.config = {
      objectStoreUrl: DEFAULTS.objectStoreUrl!,
      cdnBase: DEFAULTS.cdnBase!,
      apiKey: "",
      ...config,
    };
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  private headers(contentType?: string): Record<string, string> {
    const h: Record<string, string> = {
      "X-Grudge-ID": this.config.grudgeId,
    };
    if (contentType) h["Content-Type"] = contentType;
    if (this.config.apiKey) h["X-API-Key"] = this.config.apiKey;
    return h;
  }

  private async postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers("application/json"),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Tunnel POST ${url}: ${res.status} — ${text}`);
    }
    return res.json() as Promise<T>;
  }

  private async postFormData<T>(url: string, formData: FormData): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Grudge-ID": this.config.grudgeId,
        ...(this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {}),
      },
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Tunnel upload ${url}: ${res.status} — ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Asset Push ───────────────────────────────────────────────────────

  /**
   * Push a raw file (Blob/ArrayBuffer) to the engine's asset store.
   */
  async pushAsset(
    data: Blob | ArrayBuffer,
    mime: string,
    options: AssetPushOptions,
  ): Promise<PushResult> {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const formData = new FormData();
    formData.append("file", blob, options.filename);
    formData.append("filename", options.filename);
    formData.append("category", options.category);
    formData.append("tags", JSON.stringify([
      "grudge-pipeline", "tunnel-push",
      ...(options.tags ?? []),
    ]));
    formData.append("metadata", JSON.stringify({
      source: "grudge-tunnel",
      pushedBy: this.config.grudgeId,
      pushedAt: new Date().toISOString(),
      ...(options.metadata ?? {}),
    }));

    // Push to ObjectStore (canonical storage)
    const storeResult = await this.postFormData<{ id: string; key: string }>(
      `${this.config.objectStoreUrl}/v1/assets`,
      formData,
    );

    // Notify the engine that a new asset is available
    try {
      await this.postJson(`${this.config.engineUrl}/api/assets/ingest`, {
        objectStoreId: storeResult.id,
        objectStoreKey: storeResult.key,
        cdnUrl: `${this.config.cdnBase}/${storeResult.key}`,
        filename: options.filename,
        category: options.category,
        tags: options.tags ?? [],
        metadata: options.metadata ?? {},
        grudgeId: this.config.grudgeId,
      });
    } catch {
      // Engine notification is best-effort — asset is already in ObjectStore
    }

    return {
      success: true,
      id: storeResult.id,
      key: storeResult.key,
      cdnUrl: `${this.config.cdnBase}/${storeResult.key}`,
    };
  }

  // ── Scene Push ───────────────────────────────────────────────────────

  /**
   * Export a BabylonJS scene to .glb and push to the engine.
   */
  async pushScene(scene: Scene, options: ScenePushOptions): Promise<PushResult> {
    const filename = `${options.name.replace(/\s+/g, "_").toLowerCase()}.glb`;

    // Export scene to glb
    const exportResult = await GLTF2Export.GLBAsync(scene, options.name);
    const glbKey = Object.keys(exportResult.glTFFiles).find((k) => k.endsWith(".glb"));
    if (!glbKey) return { success: false, error: "GLB export produced no output" };

    const blob = exportResult.glTFFiles[glbKey] as Blob;

    // Push the .glb asset
    const assetResult = await this.pushAsset(blob, "model/gltf-binary", {
      filename,
      category: "scene",
      tags: ["scene", ...(options.tags ?? [])],
      metadata: {
        sceneName: options.name,
        description: options.description,
        meshCount: scene.meshes.length,
        lightCount: scene.lights.length,
        materialCount: scene.materials.length,
        hasPhysics: !!scene.getPhysicsEngine(),
      },
    });

    // Register scene in engine's scene database
    try {
      await this.postJson(`${this.config.engineUrl}/api/scenes`, {
        name: options.name,
        description: options.description,
        glbUrl: assetResult.cdnUrl,
        objectStoreId: assetResult.id,
        grudgeId: this.config.grudgeId,
        tags: options.tags ?? [],
      });
    } catch {
      // Scene DB registration is best-effort
    }

    return assetResult;
  }

  // ── Animation Push ───────────────────────────────────────────────────

  /**
   * Push a retargeted animation (as a .glb containing only animation data).
   */
  async pushAnimation(
    animationBlob: Blob,
    name: string,
    options?: {
      characterClass?: string;
      skeletonType?: string;
      tags?: string[];
    },
  ): Promise<PushResult> {
    const filename = `${name.replace(/\s+/g, "_").toLowerCase()}.glb`;

    const result = await this.pushAsset(animationBlob, "model/gltf-binary", {
      filename,
      category: "animation",
      tags: ["animation", "retargeted", ...(options?.tags ?? [])],
      metadata: {
        animationName: name,
        characterClass: options?.characterClass,
        skeletonType: options?.skeletonType,
      },
    });

    // Register in engine's animation database
    try {
      await this.postJson(`${this.config.engineUrl}/api/animations`, {
        animationSetName: name,
        glbUrl: result.cdnUrl,
        objectStoreId: result.id,
        characterClass: options?.characterClass,
        skeletonType: options?.skeletonType,
        grudgeId: this.config.grudgeId,
      });
    } catch {}

    return result;
  }

  // ── Code Push ────────────────────────────────────────────────────────

  /**
   * Push converted code (playground → module) to the engine's script editor.
   */
  async pushCode(code: string, options: CodePushOptions): Promise<PushResult> {
    const blob = new Blob([code], { type: "text/typescript" });

    const result = await this.pushAsset(blob, "text/typescript", {
      filename: options.filename,
      category: "script" as AssetCategory,
      tags: ["script", options.language, options.scriptType ?? "scene"],
      metadata: {
        language: options.language,
        scriptType: options.scriptType ?? "scene",
      },
    });

    // Push to engine's script registry
    try {
      await this.postJson(`${this.config.engineUrl}/api/scripts`, {
        filename: options.filename,
        code,
        language: options.language,
        scriptType: options.scriptType ?? "scene",
        cdnUrl: result.cdnUrl,
        grudgeId: this.config.grudgeId,
      });
    } catch {}

    return result;
  }

  // ── Archive Push ─────────────────────────────────────────────────────

  /**
   * Push a zip/7z archive. The engine will unpack and catalog all assets inside.
   */
  async pushArchive(
    archive: Blob | File,
    options?: { tags?: string[]; autoOrganize?: boolean },
  ): Promise<PushResult> {
    const filename = archive instanceof File ? archive.name : `archive-${Date.now()}.zip`;

    const result = await this.pushAsset(archive, "application/zip", {
      filename,
      category: "archive",
      tags: ["archive", "bulk-import", ...(options?.tags ?? [])],
      metadata: {
        autoOrganize: options?.autoOrganize ?? true,
        originalFilename: filename,
      },
    });

    // Tell engine to unpack and process
    try {
      await this.postJson(`${this.config.engineUrl}/api/assets/unpack`, {
        objectStoreId: result.id,
        objectStoreKey: result.key,
        autoOrganize: options?.autoOrganize ?? true,
        grudgeId: this.config.grudgeId,
      });
    } catch {}

    return result;
  }

  // ── Batch Push ───────────────────────────────────────────────────────

  /**
   * Push multiple assets in parallel.
   */
  async pushBatch(
    items: Array<{
      data: Blob | ArrayBuffer;
      mime: string;
      options: AssetPushOptions;
    }>,
  ): Promise<PushResult[]> {
    return Promise.all(
      items.map((item) => this.pushAsset(item.data, item.mime, item.options)),
    );
  }

  // ── Status ───────────────────────────────────────────────────────────

  /**
   * Check if the engine is reachable and what it supports.
   */
  async ping(): Promise<{
    online: boolean;
    engineVersion?: string;
    objectStoreConnected?: boolean;
  }> {
    try {
      const [engineRes, storeRes] = await Promise.all([
        fetch(`${this.config.engineUrl}/api/healthz`).catch(() => null),
        fetch(`${this.config.objectStoreUrl}/health`).catch(() => null),
      ]);

      return {
        online: !!engineRes?.ok,
        objectStoreConnected: !!storeRes?.ok,
      };
    } catch {
      return { online: false };
    }
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a GrudgeTunnel from the current auth state.
 * Reads grudge_id from the auth store and targets the specified engine URL.
 */
export function createTunnel(
  grudgeId: string,
  engineUrl: string,
  apiKey?: string,
): GrudgeTunnel {
  return new GrudgeTunnel({
    grudgeId,
    engineUrl,
    apiKey,
  });
}
