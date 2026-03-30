import { useState, useCallback, useRef } from "react";
import { BabylonCanvas } from "../components/engine/BabylonCanvas";
import { Palette, Upload } from "lucide-react";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
import { DepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/depthOfFieldEffect";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { Scene } from "@babylonjs/core/scene";
import type { Engine } from "@babylonjs/core/Engines/engine";

import "@babylonjs/loaders/glTF";

/** Slider helper */
function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[9px] font-mono text-muted">
        <span>{label}</span><span className="text-foreground/70">{value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step ?? 0.01} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 accent-primary bg-panel-border rounded appearance-none cursor-pointer" />
    </div>
  );
}

/** Toggle helper */
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 accent-primary rounded" />
      <span className="text-[10px] font-mono text-foreground/80">{label}</span>
    </label>
  );
}

export default function Renderer() {
  const pipelineRef = useRef<DefaultRenderingPipeline | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [modelUrl, setModelUrl] = useState("");

  // Pipeline state
  const [bloom, setBloom] = useState(false);
  const [bloomWeight, setBloomWeight] = useState(0.5);
  const [bloomKernel, setBloomKernel] = useState(64);
  const [bloomThreshold, setBloomThreshold] = useState(0.6);

  const [dof, setDof] = useState(false);
  const [focalLength, setFocalLength] = useState(150);
  const [fStop, setFStop] = useState(1.4);
  const [focusDistance, setFocusDistance] = useState(2000);

  const [fxaa, setFxaa] = useState(true);
  const [toneMapping, setToneMapping] = useState(false);
  const [contrast, setContrast] = useState(1.0);
  const [exposure, setExposure] = useState(1.0);
  const [colorCurves, setColorCurves] = useState(false);

  const [chromatic, setChromatic] = useState(false);
  const [chromaticAmount, setChromaticAmount] = useState(0);
  const [sharpen, setSharpen] = useState(false);
  const [sharpenEdge, setSharpenEdge] = useState(0.3);
  const [vignette, setVignette] = useState(false);
  const [vignetteWeight, setVignetteWeight] = useState(1.5);
  const [grain, setGrain] = useState(false);
  const [grainIntensity, setGrainIntensity] = useState(20);

  const syncPipeline = useCallback(() => {
    const p = pipelineRef.current;
    if (!p) return;
    p.bloomEnabled = bloom;
    p.bloomWeight = bloomWeight;
    p.bloomKernel = bloomKernel;
    p.bloomThreshold = bloomThreshold;
    p.depthOfFieldEnabled = dof;
    p.depthOfField.focalLength = focalLength;
    p.depthOfField.fStop = fStop;
    p.depthOfField.focusDistance = focusDistance;
    p.fxaaEnabled = fxaa;
    p.imageProcessing.toneMappingEnabled = toneMapping;
    p.imageProcessing.contrast = contrast;
    p.imageProcessing.exposure = exposure;
    p.imageProcessing.colorCurvesEnabled = colorCurves;
    p.chromaticAberrationEnabled = chromatic;
    p.chromaticAberration.aberrationAmount = chromaticAmount;
    p.sharpenEnabled = sharpen;
    p.sharpen.edgeAmount = sharpenEdge;
    p.imageProcessing.vignetteEnabled = vignette;
    p.imageProcessing.vignetteWeight = vignetteWeight;
    p.grainEnabled = grain;
    p.grain.intensity = grainIntensity;
  }, [bloom, bloomWeight, bloomKernel, bloomThreshold, dof, focalLength, fStop, focusDistance, fxaa, toneMapping, contrast, exposure, colorCurves, chromatic, chromaticAmount, sharpen, sharpenEdge, vignette, vignetteWeight, grain, grainIntensity]);

  // Sync whenever state changes
  syncPipeline();

  const onSceneReady = useCallback((scene: Scene, engine: Engine, canvas: HTMLCanvasElement) => {
    sceneRef.current = scene;

    const camera = new ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 2.5, 5, new Vector3(0, 1, 0), scene);
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 50;
    camera.minZ = 0.01;

    new HemisphericLight("light", new Vector3(0, 1, 0.3), scene);

    scene.createDefaultEnvironment({ createGround: true, groundSize: 20, createSkybox: true });

    // Create the default rendering pipeline
    const pipeline = new DefaultRenderingPipeline("default", true, scene, [camera]);
    pipelineRef.current = pipeline;

    // Default color curves
    const curve = new ColorCurves();
    curve.globalHue = 200;
    curve.globalDensity = 80;
    curve.globalSaturation = 80;
    curve.highlightsHue = 20;
    curve.highlightsDensity = 80;
    curve.highlightsSaturation = -80;
    curve.shadowsHue = 2;
    curve.shadowsDensity = 80;
    curve.shadowsSaturation = 40;
    pipeline.imageProcessing.colorCurves = curve;
    pipeline.depthOfField.focalLength = 150;

    // Load a default model to preview
    SceneLoader.ImportMeshAsync("", "https://www.babylonjs.com/Assets/DamagedHelmet/glTF/", "DamagedHelmet.gltf", scene).then((r) => {
      camera.target = r.meshes[0].position;
    }).catch(() => {});
  }, []);

  const loadModel = async () => {
    if (!modelUrl.trim() || !sceneRef.current) return;
    try {
      // Clear existing non-environment meshes
      const result = await SceneLoader.ImportMeshAsync("", modelUrl, "", sceneRef.current);
      const cam = sceneRef.current.activeCamera as ArcRotateCamera;
      if (cam && result.meshes[0]) cam.target = result.meshes[0].position;
    } catch {}
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-0 min-h-0">
      {/* Controls */}
      <div className="w-full md:w-72 shrink-0 border-r border-panel-border overflow-y-auto p-4 space-y-3 bg-black/20">
        <h2 className="text-sm font-bold tracking-widest text-secondary flex items-center gap-2">
          <Palette className="w-4 h-4" /> RENDER PIPELINE
        </h2>

        {/* Model loader */}
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-muted tracking-wider">LOAD MODEL</label>
          <div className="flex gap-1">
            <input type="text" value={modelUrl} onChange={(e) => setModelUrl(e.target.value)}
              placeholder="https://...model.glb"
              className="flex-1 bg-black/40 border border-panel-border rounded px-2 py-1.5 text-xs font-mono text-foreground focus:border-primary/50 outline-none" />
            <button onClick={loadModel} className="p-1.5 border border-panel-border rounded text-secondary hover:bg-secondary/10">
              <Upload className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="border-t border-panel-border pt-2 space-y-2">
          <Toggle label="FXAA" value={fxaa} onChange={setFxaa} />
          <Toggle label="Tone Mapping" value={toneMapping} onChange={setToneMapping} />
          <Slider label="Contrast" value={contrast} min={0} max={4} onChange={setContrast} />
          <Slider label="Exposure" value={exposure} min={0} max={4} onChange={setExposure} />
          <Toggle label="Color Curves" value={colorCurves} onChange={setColorCurves} />
        </div>

        <div className="border-t border-panel-border pt-2 space-y-2">
          <Toggle label="Bloom" value={bloom} onChange={setBloom} />
          {bloom && <>
            <Slider label="Weight" value={bloomWeight} min={0} max={1} onChange={setBloomWeight} />
            <Slider label="Kernel" value={bloomKernel} min={1} max={500} step={1} onChange={setBloomKernel} />
            <Slider label="Threshold" value={bloomThreshold} min={0} max={1} onChange={setBloomThreshold} />
          </>}
        </div>

        <div className="border-t border-panel-border pt-2 space-y-2">
          <Toggle label="Depth of Field" value={dof} onChange={setDof} />
          {dof && <>
            <Slider label="Focal Length" value={focalLength} min={1} max={300} step={1} onChange={setFocalLength} />
            <Slider label="F-Stop" value={fStop} min={1} max={10} onChange={setFStop} />
            <Slider label="Focus Distance" value={focusDistance} min={1} max={50000} step={100} onChange={setFocusDistance} />
          </>}
        </div>

        <div className="border-t border-panel-border pt-2 space-y-2">
          <Toggle label="Chromatic Aberration" value={chromatic} onChange={setChromatic} />
          {chromatic && <Slider label="Amount" value={chromaticAmount} min={-500} max={500} step={1} onChange={setChromaticAmount} />}
        </div>

        <div className="border-t border-panel-border pt-2 space-y-2">
          <Toggle label="Sharpen" value={sharpen} onChange={setSharpen} />
          {sharpen && <Slider label="Edge Amount" value={sharpenEdge} min={0} max={2} onChange={setSharpenEdge} />}
        </div>

        <div className="border-t border-panel-border pt-2 space-y-2">
          <Toggle label="Vignette" value={vignette} onChange={setVignette} />
          {vignette && <Slider label="Weight" value={vignetteWeight} min={0} max={10} onChange={setVignetteWeight} />}
        </div>

        <div className="border-t border-panel-border pt-2 space-y-2">
          <Toggle label="Film Grain" value={grain} onChange={setGrain} />
          {grain && <Slider label="Intensity" value={grainIntensity} min={0} max={100} step={1} onChange={setGrainIntensity} />}
        </div>
      </div>

      {/* 3D viewport */}
      <div className="flex-1 min-h-0">
        <BabylonCanvas onSceneReady={onSceneReady} />
      </div>
    </div>
  );
}
