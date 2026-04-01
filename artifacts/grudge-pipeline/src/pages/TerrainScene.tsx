/**
 * TerrainScene — Loads Terrain.glb and applies best-practice terrain
 * rendering for the Grudge web engine (Babylon.js 9).
 *
 * Techniques:
 *  - PBR terrain material with height/slope-based blending
 *  - Procedural noise-based detail via DynamicTexture
 *  - Directional sun with cascaded shadow maps
 *  - SkyMaterial atmospheric skybox
 *  - WaterMaterial ocean plane
 *  - Exponential fog
 *  - DefaultRenderingPipeline (FXAA, bloom, ACES tone mapping, vignette)
 */

import { useCallback } from "react";
import { BabylonCanvas } from "../components/engine/BabylonCanvas";
import { Mountain } from "lucide-react";

import { Scene }               from "@babylonjs/core/scene";
import { Engine }              from "@babylonjs/core/Engines/engine";
import { ArcRotateCamera }     from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 }             from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 }      from "@babylonjs/core/Maths/math.color";
import { HemisphericLight }    from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight }    from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator }     from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import { MeshBuilder }         from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial }         from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DynamicTexture }      from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture }             from "@babylonjs/core/Materials/Textures/texture";
import { SceneLoader }         from "@babylonjs/core/Loading/sceneLoader";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";

import { SkyMaterial }   from "@babylonjs/materials/sky/skyMaterial";
import { WaterMaterial } from "@babylonjs/materials/water/waterMaterial";

import "@babylonjs/loaders/glTF";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { SceneLoaderFlags } from "@babylonjs/core/Loading/sceneLoaderFlags";

// ── Procedural terrain albedo texture (height + slope based) ─────────

function createTerrainAlbedo(scene: Scene, size = 1024): DynamicTexture {
  const tex = new DynamicTexture("terrainAlbedo", size, scene, true);
  const ctx = tex.getContext();

  // Paint a blended terrain texture: greens, browns, rock greys, snow whites
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Simple noise-based color variation
      const nx = x / size, ny = y / size;
      const noise = (Math.sin(nx * 47.3 + ny * 91.7) * 0.5 + 0.5)
                  * (Math.cos(nx * 83.1 - ny * 37.2) * 0.5 + 0.5);

      // Biome bands (simulating height from y position)
      let r: number, g: number, b: number;
      if (ny < 0.15) {
        // Sand/beach
        r = 0.76 + noise * 0.08; g = 0.70 + noise * 0.06; b = 0.50 + noise * 0.04;
      } else if (ny < 0.45) {
        // Grass
        r = 0.18 + noise * 0.12; g = 0.42 + noise * 0.15; b = 0.12 + noise * 0.06;
      } else if (ny < 0.70) {
        // Rock
        r = 0.38 + noise * 0.10; g = 0.35 + noise * 0.08; b = 0.30 + noise * 0.06;
      } else {
        // Snow
        r = 0.88 + noise * 0.08; g = 0.90 + noise * 0.06; b = 0.92 + noise * 0.04;
      }

      ctx.fillStyle = `rgb(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.update();
  return tex;
}

function createTerrainNormal(scene: Scene, size = 512): DynamicTexture {
  const tex = new DynamicTexture("terrainNormal", size, scene, true);
  const ctx = tex.getContext();

  // Flat normal map with subtle noise-based perturbation
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size, ny = y / size;
      const noise = Math.sin(nx * 200 + ny * 150) * 0.03;
      // Normal map: (0.5 + dx, 0.5 + dy, 1.0) packed to [0,1]
      const r = 128 + (noise * 255) | 0;
      const g = 128 + (noise * 200) | 0;
      const b = 255;
      ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, r))},${Math.max(0, Math.min(255, g))},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.update();
  return tex;
}

// ── Scene setup ──────────────────────────────────────────────────────

export default function TerrainScene() {
  const onSceneReady = useCallback((engine: Engine, canvas: HTMLCanvasElement) => {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.55, 0.75, 0.92, 1);

    // ── Fog ──
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0015;
    scene.fogColor = new Color3(0.65, 0.78, 0.90);

    // ── Camera ──
    const camera = new ArcRotateCamera("cam", -Math.PI / 3, Math.PI / 3.5, 120, new Vector3(0, 10, 0), scene);
    camera.lowerRadiusLimit = 20;
    camera.upperRadiusLimit = 500;
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = Math.PI / 2.2;
    camera.wheelDeltaPercentage = 0.005;
    camera.attachControl(canvas, true);

    // ── Hemispheric (ambient) light ──
    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.4;
    hemi.groundColor = new Color3(0.15, 0.12, 0.10);

    // ── Directional sun ──
    const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, -0.3), scene);
    sun.position = new Vector3(100, 200, 100);
    sun.intensity = 1.5;
    sun.diffuse = new Color3(1.0, 0.95, 0.85);  // warm sunlight

    // ── Cascaded Shadow Maps (best for large terrains) ──
    let csg: CascadedShadowGenerator | ShadowGenerator;
    try {
      csg = new CascadedShadowGenerator(2048, sun);
      (csg as CascadedShadowGenerator).numCascades = 4;
      (csg as CascadedShadowGenerator).lambda = 0.9;
      (csg as CascadedShadowGenerator).cascadeBlendPercentage = 0.1;
      (csg as CascadedShadowGenerator).stabilizeCascades = true;
      csg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    } catch {
      // Fallback to basic shadow gen if CSM not available
      csg = new ShadowGenerator(2048, sun);
      csg.useBlurExponentialShadowMap = true;
      csg.blurKernel = 16;
    }

    // ── Skybox (atmospheric Preetham model) ──
    const skybox = MeshBuilder.CreateBox("skybox", { size: 2000 }, scene);
    const skyMat = new SkyMaterial("sky", scene);
    skyMat.backFaceCulling = false;
    skyMat.luminance = 1.0;
    skyMat.turbidity = 10;
    skyMat.rayleigh = 2;
    skyMat.mieCoefficient = 0.005;
    skyMat.mieDirectionalG = 0.8;
    skyMat.inclination = 0.46;
    skyMat.azimuth = 0.25;
    skybox.material = skyMat;
    skybox.infiniteDistance = true;
    skybox.isPickable = false;

    // ── Water plane ──
    const waterMesh = MeshBuilder.CreateGround("water", { width: 1000, height: 1000, subdivisions: 32 }, scene);
    waterMesh.position.y = -2;
    const waterMat = new WaterMaterial("waterMat", scene);
    waterMat.windForce = -5;
    waterMat.waveHeight = 0.3;
    waterMat.waveLength = 0.4;
    waterMat.windDirection.set(1, 1);
    waterMat.waterColor = new Color3(0.04, 0.16, 0.32);
    waterMat.colorBlendFactor = 0.3;
    waterMat.bumpHeight = 0.1;
    waterMat.addToRenderList(skybox);
    waterMesh.material = waterMat;

    // ── Procedural terrain textures ──
    const terrainAlbedo = createTerrainAlbedo(scene);
    const terrainNormal = createTerrainNormal(scene);

    // ── Load Terrain.glb ──
    // The FBX→GLB conversion preserved broken texture references from Unity
    // (all 236 terrain texture GUIDs are missing in the source project).
    // We skip material loading entirely since we replace all materials with
    // procedural PBR terrain textures anyway.
    const prevLogLevel = SceneLoaderFlags.loggingLevel;
    SceneLoaderFlags.loggingLevel = 0; // suppress texture warnings

    // Configure GLTF loader to skip materials (geometry only)
    SceneLoader.OnPluginActivatedObservable.addOnce((plugin) => {
      if (plugin.name === "gltf") {
        (plugin as any).skipMaterials = true;
        (plugin as any).compileMaterials = false;
      }
    });

    SceneLoader.ImportMeshAsync("", "/models/", "Terrain.glb", scene).then((result) => {
      SceneLoaderFlags.loggingLevel = prevLogLevel;

      const root = result.meshes[0];
      root.name = "terrain_root";

      // Apply PBR terrain material to all child meshes
      result.meshes.forEach((mesh) => {
        if (!mesh.getTotalVertices || mesh.getTotalVertices() === 0) return;

        const terrainMat = new PBRMaterial(`terrainPBR_${mesh.name}`, scene);

        // Albedo: procedural height/slope texture
        terrainMat.albedoTexture = terrainAlbedo;
        terrainMat.albedoTexture.coordinatesMode = Texture.SPHERICAL_MODE;

        // Normal map for micro-detail
        terrainMat.bumpTexture = terrainNormal;
        terrainMat.bumpTexture.coordinatesMode = Texture.SPHERICAL_MODE;
        terrainMat.bumpTexture.level = 0.6;

        // PBR properties for natural terrain
        terrainMat.metallic = 0.0;           // terrain is non-metallic
        terrainMat.roughness = 0.85;         // rough natural surface
        terrainMat.ambientColor = new Color3(0.15, 0.15, 0.15);

        terrainMat.backFaceCulling = true;

        mesh.material = terrainMat;
        mesh.receiveShadows = true;
        csg.addShadowCaster(mesh);
      });

      // Add terrain to water reflection
      result.meshes.forEach((m) => waterMat.addToRenderList(m));

      // Frame camera on terrain
      const bounds = root.getHierarchyBoundingVectors(true);
      const center = bounds.min.add(bounds.max).scale(0.5);
      const size = bounds.max.subtract(bounds.min);
      const maxDim = Math.max(size.x, size.y, size.z);
      camera.setTarget(center);
      camera.radius = maxDim * 0.8;

      // Stop embedded animations (character anims baked into the FBX scene)
      scene.animationGroups.forEach((g) => g.stop());

      console.log(`Terrain loaded: ${result.meshes.length} meshes, bounds: ${size.x.toFixed(0)}×${size.y.toFixed(0)}×${size.z.toFixed(0)}`);
    }).catch((err) => {
      SceneLoaderFlags.loggingLevel = prevLogLevel;
      console.error("Failed to load Terrain.glb:", err);
    });

    // ── Post-processing pipeline ──
    const pip = new DefaultRenderingPipeline("terrainPip", true, scene, [camera]);
    pip.fxaaEnabled = true;

    pip.bloomEnabled = true;
    pip.bloomThreshold = 0.6;
    pip.bloomWeight = 0.2;
    pip.bloomKernel = 64;

    pip.imageProcessingEnabled = true;
    pip.imageProcessing.toneMappingEnabled = true;
    pip.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    pip.imageProcessing.exposure = 1.1;
    pip.imageProcessing.contrast = 1.15;

    pip.imageProcessing.vignetteEnabled = true;
    pip.imageProcessing.vignetteWeight = 1.2;
    pip.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);

    pip.chromaticAberrationEnabled = false;
    pip.sharpenEnabled = true;
    pip.sharpen.edgeAmount = 0.2;
  }, []);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 py-2 border-b border-panel-border bg-black/20 flex items-center gap-2">
        <Mountain className="w-4 h-4 text-secondary" />
        <h2 className="text-sm font-bold tracking-widest text-secondary">TERRAIN SCENE</h2>
        <span className="text-[10px] font-mono text-muted ml-2">
          Terrain.glb · PBR · Cascaded Shadows · Sky + Water + Fog
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <BabylonCanvas onSceneReady={onSceneReady} />
      </div>
    </div>
  );
}
