/**
 * Grudge Scene Exporter
 *
 * Serialize BabylonJS scenes to glTF/glb format and optionally
 * upload to the Grudge ObjectStore pipeline.
 */

import { GLTF2Export } from "@babylonjs/serializers/glTF";
import type { Scene } from "@babylonjs/core/scene";

export interface ExportResult {
  /** The raw .glb ArrayBuffer */
  glb: ArrayBuffer;
  /** Object URL for local download */
  downloadUrl: string;
  /** Filename */
  filename: string;
}

/**
 * Export the current scene as a .glb file.
 */
export async function exportSceneToGlb(
  scene: Scene,
  filename = "grudge-scene",
): Promise<ExportResult> {
  const result = await GLTF2Export.GLBAsync(scene, filename);

  // result.glTFFiles is a map of filename → Blob | string
  const glbKey = Object.keys(result.glTFFiles).find((k) => k.endsWith(".glb"));
  if (!glbKey) throw new Error("GLB export produced no output");

  const blob = result.glTFFiles[glbKey] as Blob;
  const buffer = await blob.arrayBuffer();
  const downloadUrl = URL.createObjectURL(blob);

  return {
    glb: buffer,
    downloadUrl,
    filename: `${filename}.glb`,
  };
}

/**
 * Trigger a browser download of the exported scene.
 */
export function downloadExport(result: ExportResult) {
  const a = document.createElement("a");
  a.href = result.downloadUrl;
  a.download = result.filename;
  a.click();
  // Clean up after a delay
  setTimeout(() => URL.revokeObjectURL(result.downloadUrl), 5000);
}

/**
 * Export scene and upload to Grudge ObjectStore via the pipeline API.
 */
export async function exportAndUploadScene(
  scene: Scene,
  filename = "grudge-scene",
  tags: string[] = [],
  apiBase = "",
): Promise<{ id: string; cdnUrl: string }> {
  const result = await exportSceneToGlb(scene, filename);

  // Upload to ObjectStore via the pipeline upload-from-url endpoint
  // Since we have the buffer locally, we POST it as a Blob
  const formData = new FormData();
  formData.append("file", new Blob([result.glb], { type: "model/gltf-binary" }), result.filename);
  formData.append("filename", result.filename);
  formData.append("category", "scene");
  formData.append("tags", JSON.stringify(["grudge-engine", "scene-export", ...tags]));
  formData.append("metadata", JSON.stringify({ source: "grudge-web-engine", exportedAt: new Date().toISOString() }));

  const res = await fetch(`${apiBase}/api/objectstore/assets`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} — ${text}`);
  }

  const data = (await res.json()) as { id: string; key: string };
  const cdnBase = "https://assets.grudge-studio.com";

  return {
    id: data.id,
    cdnUrl: `${cdnBase}/${data.key}`,
  };
}
