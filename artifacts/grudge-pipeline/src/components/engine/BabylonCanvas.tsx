import { useEffect, useRef, useState } from "react";
import { Engine, Scene } from "@babylonjs/core";
import { Loader2 } from "lucide-react";

export interface BabylonCanvasProps {
  /**
   * Called once the engine is ready. Can be sync or async (for Havok WASM init).
   * Receives engine + canvas — create your own Scene or use createGrudgeScene().
   * Return a cleanup fn if needed.
   */
  onSceneReady: (
    engine: Engine,
    canvas: HTMLCanvasElement,
  ) => void | (() => void) | Promise<void | (() => void)>;
  /** Optional className for the wrapper div */
  className?: string;
  /** Engine options */
  antialias?: boolean;
  /** Optional drag-drop handler */
  onFileDrop?: (files: FileList) => void;
}

export function BabylonCanvas({
  onSceneReady,
  className = "",
  antialias = true,
  onFileDrop,
}: BabylonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let cleanupFn: (() => void) | void;
    let resizeHandler: (() => void) | null = null;

    (async () => {
      const engine = new Engine(canvas, antialias, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
      if (disposed) { engine.dispose(); return; }
      engineRef.current = engine;

      cleanupFn = await onSceneReady(engine, canvas);
      if (disposed) { engine.dispose(); return; }

      engine.runRenderLoop(() => {
        if (engine.scenes.length > 0) {
          engine.scenes[0].render();
        }
      });

      resizeHandler = () => engine.resize();
      window.addEventListener("resize", resizeHandler);
      setLoading(false);
    })();

    return () => {
      disposed = true;
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      if (cleanupFn) cleanupFn();
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (onFileDrop && e.dataTransfer.files.length > 0) {
      onFileDrop(e.dataTransfer.files);
    }
  };

  return (
    <div
      className={`relative w-full h-full ${className}`}
      onDragOver={onFileDrop ? handleDragOver : undefined}
      onDragLeave={onFileDrop ? handleDragLeave : undefined}
      onDrop={onFileDrop ? handleDrop : undefined}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full outline-none block"
        style={{ touchAction: "none" }}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}
      {dragOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary pointer-events-none">
          <span className="text-primary font-mono text-sm">Drop .glb / .gltf file</span>
        </div>
      )}
    </div>
  );
}
