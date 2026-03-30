import { useEffect, useRef } from "react";
import { Engine, Scene } from "@babylonjs/core";

export interface BabylonCanvasProps {
  /** Called once the engine + scene are ready. Return cleanup fn if needed. */
  onSceneReady: (scene: Scene, engine: Engine, canvas: HTMLCanvasElement) => void | (() => void);
  /** Optional className for the wrapper div */
  className?: string;
  /** Engine options */
  antialias?: boolean;
}

export function BabylonCanvas({
  onSceneReady,
  className = "",
  antialias = true,
}: BabylonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, antialias, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    engineRef.current = engine;

    const scene = new Scene(engine);
    const cleanup = onSceneReady(scene, engine, canvas);

    engine.runRenderLoop(() => {
      scene.render();
    });

    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (cleanup) cleanup();
      scene.dispose();
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full outline-none block"
        style={{ touchAction: "none" }}
      />
    </div>
  );
}
