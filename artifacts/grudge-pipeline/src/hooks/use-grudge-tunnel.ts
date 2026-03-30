/**
 * React hook for the Grudge Tunnel SDK.
 *
 * Automatically wired to the current Puter auth state.
 * Returns push methods and connection status.
 *
 * Usage:
 *   const { tunnel, connected, pushScene, pushAsset } = useGrudgeTunnel();
 *   await pushScene(babylonScene, { name: "My Level" });
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuthStore } from "./use-grudge-auth";
import { GrudgeTunnel, createTunnel } from "../lib/grudge-tunnel";
import type { PushResult, AssetPushOptions, ScenePushOptions, CodePushOptions } from "../lib/grudge-tunnel";
import type { Scene } from "@babylonjs/core/scene";

// Default engine URL — can be overridden per-user in settings
const DEFAULT_ENGINE_URL = "https://grudge-engine-web-1.vercel.app";

export interface TunnelHook {
  /** The tunnel instance (null if not authenticated) */
  tunnel: GrudgeTunnel | null;
  /** Whether the engine + ObjectStore are reachable */
  connected: boolean;
  /** Whether a push operation is in progress */
  pushing: boolean;
  /** Last push result */
  lastResult: PushResult | null;

  /** Push a BabylonJS scene */
  pushScene: (scene: Scene, options: ScenePushOptions) => Promise<PushResult>;
  /** Push a raw asset file */
  pushAsset: (data: Blob | ArrayBuffer, mime: string, options: AssetPushOptions) => Promise<PushResult>;
  /** Push a retargeted animation */
  pushAnimation: (blob: Blob, name: string, opts?: { characterClass?: string; skeletonType?: string; tags?: string[] }) => Promise<PushResult>;
  /** Push converted code */
  pushCode: (code: string, options: CodePushOptions) => Promise<PushResult>;
  /** Push an archive (zip/7z) for the engine to unpack */
  pushArchive: (archive: Blob | File, opts?: { tags?: string[]; autoOrganize?: boolean }) => Promise<PushResult>;
  /** Check connectivity */
  ping: () => Promise<void>;
}

export function useGrudgeTunnel(engineUrl?: string): TunnelHook {
  const user = useAuthStore((s) => s.user);
  const [connected, setConnected] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [lastResult, setLastResult] = useState<PushResult | null>(null);

  const tunnel = useMemo(() => {
    if (!user?.grudge_id) return null;
    return createTunnel(user.grudge_id, engineUrl ?? DEFAULT_ENGINE_URL);
  }, [user?.grudge_id, engineUrl]);

  // Auto-ping on mount
  useEffect(() => {
    if (!tunnel) return;
    tunnel.ping().then((r) => setConnected(r.online && !!r.objectStoreConnected));
  }, [tunnel]);

  const wrap = useCallback(
    async <T extends PushResult>(fn: () => Promise<T>): Promise<T> => {
      setPushing(true);
      try {
        const result = await fn();
        setLastResult(result);
        return result;
      } catch (err: any) {
        const fail: PushResult = { success: false, error: err.message };
        setLastResult(fail);
        return fail as T;
      } finally {
        setPushing(false);
      }
    },
    [],
  );

  return {
    tunnel,
    connected,
    pushing,
    lastResult,

    pushScene: useCallback(
      (scene, options) => wrap(() => tunnel!.pushScene(scene, options)),
      [tunnel, wrap],
    ),
    pushAsset: useCallback(
      (data, mime, options) => wrap(() => tunnel!.pushAsset(data, mime, options)),
      [tunnel, wrap],
    ),
    pushAnimation: useCallback(
      (blob, name, opts) => wrap(() => tunnel!.pushAnimation(blob, name, opts)),
      [tunnel, wrap],
    ),
    pushCode: useCallback(
      (code, options) => wrap(() => tunnel!.pushCode(code, options)),
      [tunnel, wrap],
    ),
    pushArchive: useCallback(
      (archive, opts) => wrap(() => tunnel!.pushArchive(archive, opts)),
      [tunnel, wrap],
    ),
    ping: useCallback(async () => {
      if (!tunnel) return;
      const r = await tunnel.ping();
      setConnected(r.online && !!r.objectStoreConnected);
    }, [tunnel]),
  };
}
