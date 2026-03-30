/**
 * Grudge Scene Bootstrap
 *
 * Single async function that sets up a complete BabylonJS scene with:
 *  - Havok physics (WASM loaded)
 *  - ArcRotate camera
 *  - Hemispheric + directional lights with shadows
 *  - Default environment (ground + skybox)
 *  - DefaultRenderingPipeline
 *  - glTF loader registered
 *
 * Usage:
 *   const { scene, camera, pipeline, shadowGenerator } = await createGrudgeScene(engine, canvas);
 */

import { Scene } from "@babylonjs/core/scene";
import { Engine } from "@babylonjs/core/Engines/engine";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
import { enableHavokPhysics } from "./havok-init";

// Side-effect imports — register loaders
import "@babylonjs/loaders/glTF";
import "@babylonjs/core/Helpers/sceneHelpers";

export interface GrudgeSceneOptions {
  /** Enable Havok physics (default true) */
  physics?: boolean;
  /** Gravity vector (default 0, -9.8, 0) */
  gravity?: Vector3;
  /** Create ground plane (default true) */
  ground?: boolean;
  /** Ground size (default 20) */
  groundSize?: number;
  /** Create skybox (default true) */
  skybox?: boolean;
  /** Enable shadows (default true) */
  shadows?: boolean;
  /** Shadow map resolution (default 1024) */
  shadowResolution?: number;
  /** Create rendering pipeline (default true) */
  pipeline?: boolean;
}

export interface GrudgeSceneResult {
  scene: Scene;
  camera: ArcRotateCamera;
  hemisphericLight: HemisphericLight;
  directionalLight: DirectionalLight;
  shadowGenerator: ShadowGenerator | null;
  pipeline: DefaultRenderingPipeline | null;
}

export async function createGrudgeScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
  options?: GrudgeSceneOptions,
): Promise<GrudgeSceneResult> {
  const opts = {
    physics: true,
    ground: true,
    groundSize: 20,
    skybox: true,
    shadows: true,
    shadowResolution: 1024,
    pipeline: true,
    ...options,
  };

  const scene = new Scene(engine);

  // ── Physics ──────────────────────────────────────────────────────────────
  if (opts.physics) {
    await enableHavokPhysics(scene, opts.gravity);
  }

  // ── Camera ───────────────────────────────────────────────────────────────
  const camera = new ArcRotateCamera("GrudgeCam", -Math.PI / 2, Math.PI / 2.5, 5, new Vector3(0, 1, 0), scene);
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 50;
  camera.minZ = 0.01;
  camera.lowerRadiusLimit = 1;
  camera.upperRadiusLimit = 50;

  // ── Lights ───────────────────────────────────────────────────────────────
  const hemiLight = new HemisphericLight("GrudgeHemi", new Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.6;
  hemiLight.specular = Color3.Black();

  const dirLight = new DirectionalLight("GrudgeSun", new Vector3(0, -0.5, -1.0), scene);
  dirLight.position = new Vector3(0, 5, 5);
  dirLight.intensity = 0.8;

  // ── Shadows ──────────────────────────────────────────────────────────────
  let shadowGenerator: ShadowGenerator | null = null;
  if (opts.shadows) {
    shadowGenerator = new ShadowGenerator(opts.shadowResolution, dirLight);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 32;
  }

  // ── Environment ──────────────────────────────────────────────────────────
  if (opts.ground || opts.skybox) {
    const env = scene.createDefaultEnvironment({
      createGround: opts.ground,
      groundSize: opts.groundSize,
      createSkybox: opts.skybox,
      enableGroundShadow: opts.shadows,
    });
    if (env?.ground) {
      env.ground.position.y += 0.01;
    }
  }

  // ── Rendering Pipeline ───────────────────────────────────────────────────
  let pipeline: DefaultRenderingPipeline | null = null;
  if (opts.pipeline) {
    pipeline = new DefaultRenderingPipeline("GrudgePipeline", true, scene, [camera]);
    pipeline.fxaaEnabled = true;
    pipeline.imageProcessing.toneMappingEnabled = false;
    pipeline.imageProcessing.contrast = 1.0;
    pipeline.imageProcessing.exposure = 1.0;

    // Default color curves (Grudge cyberpunk tint)
    const curves = new ColorCurves();
    curves.globalHue = 200;
    curves.globalDensity = 80;
    curves.globalSaturation = 80;
    curves.highlightsHue = 20;
    curves.highlightsDensity = 80;
    curves.highlightsSaturation = -80;
    curves.shadowsHue = 2;
    curves.shadowsDensity = 80;
    curves.shadowsSaturation = 40;
    pipeline.imageProcessing.colorCurves = curves;
  }

  return { scene, camera, hemisphericLight: hemiLight, directionalLight: dirLight, shadowGenerator, pipeline };
}
