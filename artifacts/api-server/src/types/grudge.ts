// ── Grudge Backend Shared Types ────────────────────────────────────────────

// Auth
export interface GrudgeUser {
  grudge_id: string;
  username: string;
  email?: string;
  provider?: string;
}

export interface GrudgeVerifyResponse {
  valid: boolean;
  user?: GrudgeUser;
}

// Assets
export type AssetCategory =
  | "model"
  | "texture"
  | "sprite"
  | "animation"
  | "audio"
  | "video"
  | "icon"
  | "ui"
  | "config"
  | "bundle"
  | "avatar"
  | "build"
  | "other";

export type AssetVisibility = "public" | "private" | "unlisted";

export interface GrudgeAsset {
  uuid: string;
  r2_key: string;
  filename: string;
  mime: string;
  size: number;
  sha256?: string;
  category: AssetCategory;
  tags: string[];
  visibility: AssetVisibility;
  owner_grudge_id?: string;
  metadata: Record<string, unknown>;
  url: string;
  created_at: string;
  updated_at?: string;
}

export interface PresignResponse {
  uuid: string;
  uploadUrl: string;
  r2Key: string;
}

export interface AssetListResponse {
  total: number;
  page: number;
  limit: number;
  assets: GrudgeAsset[];
}

export interface AssetCatalogResponse {
  total: number;
  page: number;
  limit: number;
  assets: GrudgeAsset[];
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface CatalogCategoriesResponse {
  total: number;
  categories: CategoryCount[];
}

// Bundles
export interface BundleDownload {
  uuid: string;
  filename: string;
  mime: string;
  size: number;
  downloadUrl: string;
}

export interface BundleResponse {
  bundleUuid: string;
  name: string;
  assetCount: number;
  downloads: BundleDownload[];
}

// Conversion
export interface ConversionResponse {
  conversionId: number;
  status: "queued" | "processing" | "done" | "failed";
  inputFormat: string;
  outputFormat: string;
  source_uuid?: string;
  output_uuid?: string;
  error?: string;
}

// Weapon types matching the game's 17 weapon categories
export type WeaponType =
  | "sword"
  | "2h_sword"
  | "shield"
  | "staff"
  | "tome"
  | "mace"
  | "wand"
  | "bow"
  | "crossbow"
  | "gun"
  | "dagger"
  | "spear"
  | "hammer"
  | "off_hand_relic"
  | "2h_weapon"
  | "cape"
  | "trinket";

// Character classes
export type CharacterClass = "warrior" | "mage" | "ranger" | "worge";

// Skeleton types
export type SkeletonType =
  | "mixamo_65"
  | "mixamo_49"
  | "mixamo_41"
  | "mixamo_25"
  | "custom";

// Animation set
export interface AnimationSetUrls {
  idle?: string;
  walk?: string;
  run?: string;
  jump?: string;
  attack_1?: string;
  attack_2?: string;
  attack_3?: string;
  dodge?: string;
  block?: string;
  parry?: string;
  death?: string;
  harvest?: string;
  cast?: string;
  [key: string]: string | undefined;
}

// Scene transform
export interface Transform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

// Scene asset placement
export interface ScenePlacement {
  assetId: string;
  transform: Transform;
  layer: string;
  metadata?: Record<string, unknown>;
}

// Scene environment config
export interface EnvironmentConfig {
  skybox?: string;
  ambientLight?: { color: string; intensity: number };
  directionalLight?: { color: string; intensity: number; direction: Transform["position"] };
  fog?: { color: string; near: number; far: number };
  terrain?: string;
}

// Lighting config
export interface LightingConfig {
  lights: Array<{
    type: "point" | "spot" | "directional" | "ambient";
    color: string;
    intensity: number;
    position?: Transform["position"];
    target?: Transform["position"];
    castShadow?: boolean;
  }>;
}

// Game export manifest
export interface GameExportManifest {
  version: string;
  exportedAt: string;
  characters: Array<{
    id: string;
    name: string;
    meshUrl: string;
    rigUrl?: string;
    animations: AnimationSetUrls;
    weapons: Array<{
      type: WeaponType;
      meshUrl: string;
      mountBone: string;
      offset: Transform["position"];
      rotation: Transform["position"];
    }>;
  }>;
  scenes: Array<{
    id: string;
    name: string;
    placements: ScenePlacement[];
    environment: EnvironmentConfig;
    lighting: LightingConfig;
  }>;
}
