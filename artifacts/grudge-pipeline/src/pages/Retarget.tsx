import { useState, useCallback, useRef } from "react";
import { BabylonCanvas } from "../components/engine/BabylonCanvas";
import { Upload, Play, RotateCcw, Download, Bone } from "lucide-react";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { AnimatorAvatar } from "@babylonjs/core/Animations/animatorAvatar";
import type { Scene } from "@babylonjs/core/scene";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

// Side-effect imports for loaders
import "@babylonjs/loaders/glTF";

export default function Retarget() {
  const [characterUrl, setCharacterUrl] = useState("");
  const [animUrl, setAnimUrl] = useState("");
  const [status, setStatus] = useState("Ready — load a character and animation");
  const [retargetedGroups, setRetargetedGroups] = useState<string[]>([]);
  const [boneMappings, setBoneMappings] = useState<[string, string][]>([
    ["mixamorig:Hips", "Hips"],
    ["mixamorig:Spine", "Spine"],
    ["mixamorig:LeftFoot", "LeftFoot"],
    ["mixamorig:RightFoot", "RightFoot"],
  ]);
  const [newSrc, setNewSrc] = useState("");
  const [newTgt, setNewTgt] = useState("");

  const sceneRef = useRef<Scene | null>(null);
  const characterRootRef = useRef<TransformNode | null>(null);
  const sourceAnimsRef = useRef<AnimationGroup[]>([]);

  const onSceneReady = useCallback((scene: Scene) => {
    sceneRef.current = scene;

    const camera = new ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 2.5, 4, new Vector3(0, 1, 0), scene);
    camera.attachControl(undefined, true);
    camera.wheelPrecision = 50;
    camera.minZ = 0.01;

    new HemisphericLight("light", new Vector3(0, 1, 0.3), scene);

    scene.createDefaultEnvironment({
      createGround: true,
      groundSize: 10,
      createSkybox: false,
    });
  }, []);

  const loadCharacter = async () => {
    if (!characterUrl.trim() || !sceneRef.current) return;
    setStatus("Loading character...");
    try {
      const result = await SceneLoader.ImportMeshAsync("", characterUrl, "", sceneRef.current);
      characterRootRef.current = result.meshes[0] as TransformNode;
      setStatus(`Character loaded — ${result.meshes.length} meshes, ${result.skeletons.length} skeletons`);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
  };

  const loadAnimation = async () => {
    if (!animUrl.trim() || !sceneRef.current) return;
    setStatus("Loading animation...");
    try {
      const result = await SceneLoader.ImportMeshAsync("", animUrl, "", sceneRef.current);
      // Hide the animation source mesh
      result.meshes.forEach((m) => (m.isVisible = false));
      sourceAnimsRef.current = result.animationGroups;
      setStatus(`Animation loaded — ${result.animationGroups.length} groups: ${result.animationGroups.map((g) => g.name).join(", ")}`);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
  };

  const runRetarget = () => {
    if (!characterRootRef.current || sourceAnimsRef.current.length === 0) {
      setStatus("Load both a character and animation first");
      return;
    }
    setStatus("Retargeting...");
    try {
      const avatar = new AnimatorAvatar("grudge-avatar", characterRootRef.current);
      const mapNodeNames = new Map<string, string>(boneMappings);
      const results: string[] = [];

      for (const srcGroup of sourceAnimsRef.current) {
        const retargeted = avatar.retargetAnimationGroup(srcGroup, {
          animationGroupName: `retarget_${srcGroup.name}`,
          fixRootPosition: true,
          fixGroundReference: true,
          rootNodeName: "Hips",
          groundReferenceNodeName: "LeftFoot",
          mapNodeNames,
        });
        retargeted.play(true);
        results.push(retargeted.name);
      }

      setRetargetedGroups(results);
      setStatus(`Retargeted ${results.length} animation(s) — playing`);
    } catch (err: any) {
      setStatus(`Retarget error: ${err.message}`);
    }
  };

  const addMapping = () => {
    if (newSrc.trim() && newTgt.trim()) {
      setBoneMappings((prev) => [...prev, [newSrc.trim(), newTgt.trim()]]);
      setNewSrc("");
      setNewTgt("");
    }
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-0 min-h-0">
      {/* Left panel — controls */}
      <div className="w-full md:w-80 shrink-0 border-r border-panel-border overflow-y-auto p-4 space-y-4 bg-black/20">
        <h2 className="text-sm font-bold tracking-widest text-primary flex items-center gap-2">
          <Bone className="w-4 h-4" /> RETARGET
        </h2>

        {/* Character URL */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono text-muted tracking-wider">CHARACTER (glTF/glb URL)</label>
          <div className="flex gap-1">
            <input
              type="text"
              value={characterUrl}
              onChange={(e) => setCharacterUrl(e.target.value)}
              placeholder="https://...character.glb"
              className="flex-1 bg-black/40 border border-panel-border rounded px-2 py-1.5 text-xs font-mono text-foreground focus:border-primary/50 outline-none"
            />
            <button onClick={loadCharacter} className="p-1.5 border border-primary/30 rounded text-primary hover:bg-primary/10">
              <Upload className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Animation URL */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono text-muted tracking-wider">ANIMATION (glTF/glb URL)</label>
          <div className="flex gap-1">
            <input
              type="text"
              value={animUrl}
              onChange={(e) => setAnimUrl(e.target.value)}
              placeholder="https://...walk.glb"
              className="flex-1 bg-black/40 border border-panel-border rounded px-2 py-1.5 text-xs font-mono text-foreground focus:border-primary/50 outline-none"
            />
            <button onClick={loadAnimation} className="p-1.5 border border-primary/30 rounded text-primary hover:bg-primary/10">
              <Upload className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Bone mapping */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono text-muted tracking-wider">BONE NAME MAPPING</label>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {boneMappings.map(([src, tgt], i) => (
              <div key={i} className="flex items-center gap-1 text-[10px] font-mono">
                <span className="text-accent/70 truncate flex-1">{src}</span>
                <span className="text-muted">→</span>
                <span className="text-primary/70 truncate flex-1">{tgt}</span>
                <button
                  onClick={() => setBoneMappings((prev) => prev.filter((_, j) => j !== i))}
                  className="text-red-400/50 hover:text-red-400 text-xs px-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              value={newSrc}
              onChange={(e) => setNewSrc(e.target.value)}
              placeholder="source bone"
              className="flex-1 bg-black/40 border border-panel-border rounded px-2 py-1 text-[10px] font-mono text-foreground outline-none"
            />
            <input
              value={newTgt}
              onChange={(e) => setNewTgt(e.target.value)}
              placeholder="target bone"
              className="flex-1 bg-black/40 border border-panel-border rounded px-2 py-1 text-[10px] font-mono text-foreground outline-none"
            />
            <button onClick={addMapping} className="px-2 border border-panel-border rounded text-xs text-primary hover:bg-primary/10">+</button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={runRetarget}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded border border-primary/40 text-primary text-xs font-bold tracking-wider hover:bg-primary/10 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" /> RETARGET
          </button>
        </div>

        {/* Retargeted anims */}
        {retargetedGroups.length > 0 && (
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-muted tracking-wider">RETARGETED ANIMATIONS</label>
            {retargetedGroups.map((name) => (
              <div key={name} className="flex items-center gap-2 text-[10px] font-mono text-primary/80">
                <Play className="w-3 h-3" /> {name}
              </div>
            ))}
          </div>
        )}

        {/* Status */}
        <div className="text-[10px] font-mono text-muted/70 border-t border-panel-border pt-3">
          {status}
        </div>
      </div>

      {/* Right — 3D viewport */}
      <div className="flex-1 min-h-0">
        <BabylonCanvas onSceneReady={onSceneReady} />
      </div>
    </div>
  );
}
