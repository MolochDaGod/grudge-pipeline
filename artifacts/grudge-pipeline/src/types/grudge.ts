// ── Frontend Grudge Types ─────────────────────────────────────────────────────

export interface GrudgeUser {
  grudge_id: string;
  username: string;
  email?: string;
}

// Pipeline asset as stored locally
export interface PipelineAsset {
  id: string;
  grudgeAssetUuid?: string;
  pipelineJobId?: string;
  category: string;
  name: string;
  meshUrl?: string;
  thumbnailUrl?: string;
  source: string;
  sourceStep?: string;
  sourceTaskId?: string;
  fileFormat?: string;
  polycount?: number;
  fileSize?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  grudgeId?: string;
  createdAt: string;
  updatedAt: string;
}

// Grudge catalog asset
export interface CatalogAsset {
  uuid: string;
  name: string;
  type: string;
  url: string;
  sizeBytes: number;
  tags: string[];
  metadata: Record<string, unknown>;
  source?: string;
  objectstore_id?: string;
  created_at: string;
}

// Scene
export interface Scene {
  id: string;
  name: string;
  grudgeId?: string;
  template: string;
  description?: string;
  placements: ScenePlacement[];
  environment: EnvironmentConfig;
  lighting: LightingConfig;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScenePlacement {
  assetId: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  layer: string;
  metadata?: Record<string, unknown>;
}

export interface EnvironmentConfig {
  skybox?: string;
  ambientLight?: { color: string; intensity: number };
  directionalLight?: { color: string; intensity: number; direction: { x: number; y: number; z: number } };
  fog?: { color: string; near: number; far: number };
  terrain?: string;
}

export interface LightingConfig {
  lights: Array<{
    type: string;
    color: string;
    intensity: number;
    position?: { x: number; y: number; z: number };
    castShadow?: boolean;
  }>;
}

// Animation mapping
export interface AnimationMapping {
  id: string;
  characterAssetId?: string;
  animationSetName: string;
  skeletonType: string;
  characterClass?: string;
  weaponContext?: string;
  animationUrls: Record<string, string | undefined>;
  retargetConfig?: {
    sourceSkeletonType?: string;
    boneMapping?: Record<string, string>;
    scaleAdjustment?: number;
  };
  grudgeId?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

// Pipeline job
export interface PipelineJob {
  id: string;
  grudgeId?: string;
  prompt: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  conceptTaskId?: string;
  previewTaskId?: string;
  refineTaskId?: string;
  retextureTaskId?: string;
  remeshTaskId?: string;
  rigTaskId?: string;
  finalMeshUrl?: string;
  finalRigUrl?: string;
  finalThumbnailUrl?: string;
  meshAssetUuid?: string;
  rigAssetUuid?: string;
  config?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// Batch summary
export interface BatchSummary {
  total: number;
  queued: number;
  inProgress: number;
  completed: number;
  failed: number;
}

// Weapon types
export type WeaponType =
  | "sword" | "2h_sword" | "shield" | "staff" | "tome" | "mace" | "wand"
  | "bow" | "crossbow" | "gun" | "dagger" | "spear" | "hammer"
  | "off_hand_relic" | "2h_weapon" | "cape" | "trinket";

export type CharacterClass = "warrior" | "mage" | "ranger" | "worge";
