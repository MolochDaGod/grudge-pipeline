/**
 * Grudge Backend API Client
 *
 * Typed client for interacting with Grudge Studio backend services:
 *  - id.grudge-studio.com  (auth)
 *  - assets-api.grudge-studio.com  (asset CRUD, presign, bundles)
 *  - api.grudge-studio.com  (game API, AI endpoints)
 */

import type {
  GrudgeVerifyResponse,
  PresignResponse,
  AssetCategory,
  AssetListResponse,
  AssetCatalogResponse,
  CatalogCategoriesResponse,
  BundleResponse,
  ConversionResponse,
} from "../types/grudge";
import { logger } from "./logger";

// ── Config ────────────────────────────────────────────────────────────────────

const AUTH_URL = process.env["GRUDGE_AUTH_URL"] ?? "https://id.grudge-studio.com";
const ASSETS_API_URL = process.env["GRUDGE_ASSETS_API_URL"] ?? "https://assets-api.grudge-studio.com";
const GAME_API_URL = process.env["GRUDGE_API_URL"] ?? "https://api.grudge-studio.com";
const INTERNAL_KEY = process.env["INTERNAL_API_KEY"] ?? "";

// ── Helpers ───────────────────────────────────────────────────────────────────

function internalHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-API-Key": INTERNAL_KEY,
  };
}

function authHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error({ url, status: res.status, body }, "Grudge API request failed");
    throw new Error(`Grudge API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function verifyToken(token: string): Promise<GrudgeVerifyResponse> {
  return request<GrudgeVerifyResponse>(`${AUTH_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

// ── Asset CRUD ────────────────────────────────────────────────────────────────

export async function presignUpload(
  token: string,
  filename: string,
  mime: string,
  category: AssetCategory = "model",
  tags: string[] = [],
  metadata?: Record<string, unknown>,
): Promise<PresignResponse> {
  return request<PresignResponse>(`${ASSETS_API_URL}/assets/presign`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ filename, mime, category, tags, visibility: "public", metadata }),
  });
}

export async function completeUpload(token: string, uuid: string) {
  return request<{ uuid: string; size: number; url: string }>(
    `${ASSETS_API_URL}/assets/${uuid}/complete`,
    { method: "POST", headers: authHeaders(token) },
  );
}

export async function uploadFileToPresignedUrl(uploadUrl: string, data: Buffer | ArrayBuffer, mime: string) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: data,
  });
  if (!res.ok) {
    throw new Error(`Presigned upload failed: ${res.status}`);
  }
}

export async function listAssets(
  token: string,
  params: {
    category?: string;
    q?: string;
    visibility?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<AssetListResponse> {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (params.q) qs.set("q", params.q);
  if (params.visibility) qs.set("visibility", params.visibility);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  return request<AssetListResponse>(`${ASSETS_API_URL}/assets?${qs}`, {
    headers: authHeaders(token),
  });
}

export async function getAsset(token: string, uuid: string) {
  return request<import("../types/grudge").GrudgeAsset>(
    `${ASSETS_API_URL}/assets/${uuid}`,
    { headers: authHeaders(token) },
  );
}

export async function browseCatalog(params: {
  type?: string;
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
} = {}): Promise<AssetCatalogResponse> {
  const qs = new URLSearchParams();
  if (params.type) qs.set("type", params.type);
  if (params.category) qs.set("category", params.category);
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  return request<AssetCatalogResponse>(`${ASSETS_API_URL}/assets/catalog?${qs}`);
}

export async function getCatalogCategories(): Promise<CatalogCategoriesResponse> {
  return request<CatalogCategoriesResponse>(`${ASSETS_API_URL}/assets/catalog/categories`);
}

// ── Bundles ───────────────────────────────────────────────────────────────────

export async function createBundle(
  token: string,
  name: string,
  assetUuids: string[],
  description?: string,
): Promise<BundleResponse> {
  return request<BundleResponse>(`${ASSETS_API_URL}/assets/bundle`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name, assetUuids, description }),
  });
}

// ── Conversions ───────────────────────────────────────────────────────────────

export async function queueConversion(
  token: string,
  sourceUuid: string,
  outputFormat: string,
): Promise<ConversionResponse> {
  return request<ConversionResponse>(`${ASSETS_API_URL}/assets/conversion`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ sourceUuid, outputFormat }),
  });
}

export async function getConversionStatus(id: number): Promise<ConversionResponse> {
  return request<ConversionResponse>(`${ASSETS_API_URL}/assets/conversion/${id}`);
}

// ── Game API (AI endpoints) ──────────────────────────────────────────────────

export async function aiArtPrompt(
  token: string,
  description: string,
  style: string = "voxel",
  target: string = "meshy",
) {
  return request<{ prompt: string; params?: Record<string, unknown> }>(
    `${GAME_API_URL}/ai/art/prompt`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ description, style, target }),
    },
  );
}

// ── Sync ObjectStore ─────────────────────────────────────────────────────────

export async function syncObjectStore() {
  return request<{
    synced: boolean;
    manifestVersion: string;
    totalInManifest: number;
    inserted: number;
    updated: number;
    skipped: number;
  }>(`${ASSETS_API_URL}/assets/sync-objectstore`, {
    method: "POST",
    headers: internalHeaders(),
  });
}

// ── Download remote file as buffer (for pipeline upload flow) ────────────────

export async function downloadFile(url: string): Promise<{ buffer: ArrayBuffer; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const mime = res.headers.get("content-type") ?? "application/octet-stream";
  const buffer = await res.arrayBuffer();
  return { buffer, mime };
}
