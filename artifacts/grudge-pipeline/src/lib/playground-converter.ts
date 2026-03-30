/**
 * Grudge Playground Converter
 *
 * Converts BabylonJS Playground code (global BABYLON.* style)
 * to ES module imports compatible with the Grudge Web Engine.
 *
 * Handles:
 *  - BABYLON.* → named imports from @babylonjs/core/*
 *  - BABYLON.GUI.* → imports from @babylonjs/gui
 *  - var/function createScene → export default async
 *  - global `engine` and `canvas` → function parameters
 *  - CannonJSPlugin → HavokPlugin with WASM init
 */

// ── Known BABYLON.* → module path mappings ───────────────────────────────────

const BABYLON_CLASS_MAP: Record<string, { module: string; subpath: string }> = {
  // Scene
  Scene: { module: "@babylonjs/core", subpath: "scene" },
  // Cameras
  FreeCamera: { module: "@babylonjs/core", subpath: "Cameras/freeCamera" },
  ArcRotateCamera: { module: "@babylonjs/core", subpath: "Cameras/arcRotateCamera" },
  FollowCamera: { module: "@babylonjs/core", subpath: "Cameras/followCamera" },
  UniversalCamera: { module: "@babylonjs/core", subpath: "Cameras/universalCamera" },
  // Lights
  HemisphericLight: { module: "@babylonjs/core", subpath: "Lights/hemisphericLight" },
  DirectionalLight: { module: "@babylonjs/core", subpath: "Lights/directionalLight" },
  PointLight: { module: "@babylonjs/core", subpath: "Lights/pointLight" },
  SpotLight: { module: "@babylonjs/core", subpath: "Lights/spotLight" },
  ShadowGenerator: { module: "@babylonjs/core", subpath: "Lights/Shadows/shadowGenerator" },
  // Math
  Vector3: { module: "@babylonjs/core", subpath: "Maths/math.vector" },
  Vector2: { module: "@babylonjs/core", subpath: "Maths/math.vector" },
  Quaternion: { module: "@babylonjs/core", subpath: "Maths/math.vector" },
  Matrix: { module: "@babylonjs/core", subpath: "Maths/math.vector" },
  Color3: { module: "@babylonjs/core", subpath: "Maths/math.color" },
  Color4: { module: "@babylonjs/core", subpath: "Maths/math.color" },
  // Meshes
  MeshBuilder: { module: "@babylonjs/core", subpath: "Meshes/meshBuilder" },
  Mesh: { module: "@babylonjs/core", subpath: "Meshes/mesh" },
  TransformNode: { module: "@babylonjs/core", subpath: "Meshes/transformNode" },
  AbstractMesh: { module: "@babylonjs/core", subpath: "Meshes/abstractMesh" },
  InstancedMesh: { module: "@babylonjs/core", subpath: "Meshes/instancedMesh" },
  GroundMesh: { module: "@babylonjs/core", subpath: "Meshes/groundMesh" },
  // Materials
  StandardMaterial: { module: "@babylonjs/core", subpath: "Materials/standardMaterial" },
  PBRMaterial: { module: "@babylonjs/core", subpath: "Materials/PBR/pbrMaterial" },
  ShaderMaterial: { module: "@babylonjs/core", subpath: "Materials/shaderMaterial" },
  NodeMaterial: { module: "@babylonjs/core", subpath: "Materials/Node/nodeMaterial" },
  GridMaterial: { module: "@babylonjs/materials", subpath: "grid/gridMaterial" },
  Texture: { module: "@babylonjs/core", subpath: "Materials/Textures/texture" },
  CubeTexture: { module: "@babylonjs/core", subpath: "Materials/Textures/cubeTexture" },
  ColorCurves: { module: "@babylonjs/core", subpath: "Materials/colorCurves" },
  // Animation
  Animation: { module: "@babylonjs/core", subpath: "Animations/animation" },
  AnimationGroup: { module: "@babylonjs/core", subpath: "Animations/animationGroup" },
  AnimatorAvatar: { module: "@babylonjs/core", subpath: "Animations/animatorAvatar" },
  // Physics
  HavokPlugin: { module: "@babylonjs/core", subpath: "Physics/v2/Plugins/havokPlugin" },
  PhysicsAggregate: { module: "@babylonjs/core", subpath: "Physics/v2/physicsAggregate" },
  PhysicsShapeType: { module: "@babylonjs/core", subpath: "Physics/v2/physicsAggregate" },
  PhysicsCharacterController: { module: "@babylonjs/core", subpath: "Physics/v2/characterController" },
  CharacterSupportedState: { module: "@babylonjs/core", subpath: "Physics/v2/characterController" },
  HingeConstraint: { module: "@babylonjs/core", subpath: "Physics/v2/physicsConstraint" },
  CannonJSPlugin: { module: "@babylonjs/core", subpath: "Physics/Plugins/cannonJSPlugin" },
  // Loading
  SceneLoader: { module: "@babylonjs/core", subpath: "Loading/sceneLoader" },
  // Post-processing
  DefaultRenderingPipeline: { module: "@babylonjs/core", subpath: "PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline" },
  DepthOfFieldEffectBlurLevel: { module: "@babylonjs/core", subpath: "PostProcesses/depthOfFieldEffect" },
  // Particles
  ParticleSystem: { module: "@babylonjs/core", subpath: "Particles/particleSystem" },
  // Actions
  ActionManager: { module: "@babylonjs/core", subpath: "Actions/actionManager" },
  ExecuteCodeAction: { module: "@babylonjs/core", subpath: "Actions/directActions" },
  // Events
  KeyboardEventTypes: { module: "@babylonjs/core", subpath: "Events/keyboardEvents" },
  PointerEventTypes: { module: "@babylonjs/core", subpath: "Events/pointerEvents" },
  // Helpers
  EnvironmentHelper: { module: "@babylonjs/core", subpath: "Helpers/environmentHelper" },
  // GUI
  AdvancedDynamicTexture: { module: "@babylonjs/gui", subpath: "2D/advancedDynamicTexture" },
  StackPanel: { module: "@babylonjs/gui", subpath: "2D/controls/stackPanel" },
  TextBlock: { module: "@babylonjs/gui", subpath: "2D/controls/textBlock" },
  Slider: { module: "@babylonjs/gui", subpath: "2D/controls/sliders/slider" },
  Checkbox: { module: "@babylonjs/gui", subpath: "2D/controls/checkbox" },
  Button: { module: "@babylonjs/gui", subpath: "2D/controls/button" },
  ColorPicker: { module: "@babylonjs/gui", subpath: "2D/controls/colorpicker" },
  Control: { module: "@babylonjs/gui", subpath: "2D/controls/control" },
  Image: { module: "@babylonjs/gui", subpath: "2D/controls/image" },
};

// ── Converter ────────────────────────────────────────────────────────────────

export interface ConvertResult {
  /** Converted TypeScript module code */
  code: string;
  /** Import statements generated */
  imports: string[];
  /** Warnings (e.g. unknown BABYLON.* references) */
  warnings: string[];
}

/**
 * Convert BabylonJS Playground code to Grudge ES module format.
 */
export function convertPlaygroundToModule(playgroundCode: string): ConvertResult {
  const warnings: string[] = [];
  let code = playgroundCode;

  // ── Collect all BABYLON.* and BABYLON.GUI.* references ───────────────

  const usedClasses = new Set<string>();
  const unknownRefs = new Set<string>();

  // Match BABYLON.GUI.ClassName
  const guiRefs = code.matchAll(/BABYLON\.GUI\.(\w+)/g);
  for (const m of guiRefs) {
    const cls = m[1];
    if (BABYLON_CLASS_MAP[cls]) usedClasses.add(cls);
    else unknownRefs.add(`BABYLON.GUI.${cls}`);
  }

  // Match BABYLON.ClassName (but not BABYLON.GUI)
  const babylonRefs = code.matchAll(/BABYLON\.(?!GUI\.)(\w+)/g);
  for (const m of babylonRefs) {
    const cls = m[1];
    if (BABYLON_CLASS_MAP[cls]) usedClasses.add(cls);
    else unknownRefs.add(`BABYLON.${cls}`);
  }

  // ── Build import map (group by subpath) ──────────────────────────────

  const importGroups = new Map<string, Set<string>>();
  for (const cls of usedClasses) {
    const info = BABYLON_CLASS_MAP[cls];
    const key = `${info.module}/${info.subpath}`;
    if (!importGroups.has(key)) importGroups.set(key, new Set());
    importGroups.get(key)!.add(cls);
  }

  const importLines: string[] = [];
  for (const [path, classes] of importGroups) {
    const names = [...classes].sort().join(", ");
    importLines.push(`import { ${names} } from "${path}";`);
  }

  // Always add glTF loader side-effect
  if (code.includes("SceneLoader") || code.includes("ImportMesh")) {
    importLines.push(`import "@babylonjs/loaders/glTF";`);
  }

  // Add Havok init if physics is used
  const usesPhysics = code.includes("enablePhysics") || code.includes("PhysicsAggregate") || code.includes("PhysicsCharacterController");
  if (usesPhysics) {
    importLines.push(`import { enableHavokPhysics } from "./havok-init";`);
  }

  // ── Replace BABYLON.GUI.* and BABYLON.* with bare class names ────────

  code = code.replace(/BABYLON\.GUI\.(\w+)/g, "$1");
  code = code.replace(/BABYLON\.(?!GUI)(\w+)/g, "$1");

  // ── Replace CannonJSPlugin with Havok ────────────────────────────────

  if (code.includes("CannonJSPlugin")) {
    code = code.replace(
      /new\s+CannonJSPlugin\([^)]*\)/g,
      "await enableHavokPhysics(scene)",
    );
    code = code.replace(/const\s+physicsPlugin\s*=\s*await enableHavokPhysics\(scene\);\s*\n\s*scene\.enablePhysics\([^)]+\);/g,
      "await enableHavokPhysics(scene);");
    warnings.push("Replaced CannonJSPlugin with Havok. Ensure havok-init.ts is available.");
  }

  // ── Convert createScene function signature ───────────────────────────

  // var createScene = function() { ... }
  code = code.replace(
    /(?:var|let|const)\s+(?:createScene|delayCreateScene)\s*=\s*(?:async\s+)?function\s*\(\)\s*\{/,
    "export default async function createScene(engine: Engine, canvas: HTMLCanvasElement) {",
  );

  // function createScene() { ... }
  code = code.replace(
    /(?:async\s+)?function\s+(?:createScene|delayCreateScene)\s*\(\)\s*\{/,
    "export default async function createScene(engine: Engine, canvas: HTMLCanvasElement) {",
  );

  // Remove trailing export default createScene
  code = code.replace(/\n?export\s+default\s+(?:createScene|delayCreateScene)\s*;?\s*$/, "");
  code = code.replace(/\n?export\s*\{\s*(?:Playground|createScene)\s*\}\s*;?\s*$/, "");

  // ── Add Engine import if not present ─────────────────────────────────

  if (!importGroups.has("@babylonjs/core/Engines/engine")) {
    importLines.unshift(`import { Engine } from "@babylonjs/core/Engines/engine";`);
  }

  // ── Assemble ─────────────────────────────────────────────────────────

  for (const ref of unknownRefs) {
    warnings.push(`Unknown reference: ${ref} — may need manual import`);
  }

  const finalCode = [...importLines, "", code.trim(), ""].join("\n");

  return {
    code: finalCode,
    imports: importLines,
    warnings,
  };
}

/**
 * Convert Grudge module code back to Playground-compatible global style.
 */
export function convertModuleToPlayground(moduleCode: string): string {
  let code = moduleCode;

  // Remove import lines
  code = code.replace(/^import\s+.*;\s*\n/gm, "");

  // Wrap bare class names back to BABYLON.*
  for (const cls of Object.keys(BABYLON_CLASS_MAP)) {
    const info = BABYLON_CLASS_MAP[cls];
    const prefix = info.module.includes("gui") ? "BABYLON.GUI." : "BABYLON.";
    // Only replace standalone word occurrences (not inside strings/comments)
    code = code.replace(new RegExp(`(?<![."'])\\b${cls}\\b(?!["':])`, "g"), `${prefix}${cls}`);
  }

  // Convert export default async function → var createScene = async function()
  code = code.replace(
    /export\s+default\s+async\s+function\s+createScene\s*\([^)]*\)\s*\{/,
    "var createScene = async function () {",
  );

  // Add trailing export
  code = code.trim() + "\n\nexport default createScene;\n";

  return code;
}
