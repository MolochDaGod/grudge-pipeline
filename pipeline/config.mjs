/**
 * config.mjs — Grudge Pipeline Configuration
 * Central config for all pipeline paths, options, and constants.
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT = path.resolve(__dirname, '..');

// ── Paths ──────────────────────────────────────────────
export const ATTACKMOTION_DIR = path.join(ROOT, 'attackmotion');
export const ORGANIZED_DIR = path.join(ATTACKMOTION_DIR, '_organized');
export const CONVERTED_DIR = path.join(ROOT, '_converted');
export const OPTIMIZED_DIR = path.join(ROOT, '_optimized');
export const INVENTORY_PATH = path.join(ROOT, 'ingest', 'attackmotion-inventory.json');

// ObjectStore paths (for sync)
export const OBJECTSTORE_DIR = 'C:\\Users\\nugye\\Documents\\1111111\\ObjectStore';
export const OBJECTSTORE_MODELS = path.join(OBJECTSTORE_DIR, 'models');
export const OBJECTSTORE_API = path.join(OBJECTSTORE_DIR, 'api', 'v1');

// FBX2glTF binary
export const FBX2GLTF_BIN = path.join(OBJECTSTORE_DIR, 'tools', 'bin', 'FBX2glTF-windows-x86_64', 'FBX2glTF-windows-x86_64.exe');

// ── Pipeline Options ───────────────────────────────────
export const MAX_TEXTURE_SIZE = 1024;
export const DRACO_CONFIG = {
  quantizePosition: 14,
  quantizeNormal: 10,
  quantizeTexcoord: 12,
  quantizeColor: 8,
};

// File extensions by type
export const SOURCE_EXTENSIONS = new Set(['.fbx', '.obj', '.dae']);
export const GLTF_EXTENSIONS = new Set(['.gltf', '.glb']);
export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tga', '.bmp']);
export const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.ogg', '.flac']);
export const ALL_3D_EXTENSIONS = new Set([...SOURCE_EXTENSIONS, ...GLTF_EXTENSIONS]);

// Mixamo standard skeleton joint count
export const MIXAMO_65_JOINTS = 65;
export const MIXAMO_BONE_NAMES = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
];

// Grudge equipment bone containers
export const BONE_CONTAINERS = {
  rightHand: 'R_hand_container',
  leftHand: 'L_hand_container',
  leftShield: 'L_shield_container',
  head: 'Head',
  back: 'Spine2',
};

// Category mapping for pipeline output
export const CATEGORIES = {
  characters: 'characters',
  animations: 'animations',
  environments: 'environments',
  weapons: 'weapons',
  effects: 'effects',
  space: 'space',
  rts: 'rts',
  ui: 'ui',
};

// R2 config
export const R2_BUCKET = 'grudge-assets';
export const R2_PREFIX = 'models';
