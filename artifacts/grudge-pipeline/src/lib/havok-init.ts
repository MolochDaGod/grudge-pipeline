/**
 * Havok Physics WASM Initialization
 *
 * Loads the Havok WASM binary and creates the HavokPlugin.
 * Must be called before any physics operations.
 *
 * Usage:
 *   const havok = await initHavok();
 *   scene.enablePhysics(new Vector3(0, -9.8, 0), havok);
 */

import HavokPhysics from "@babylonjs/havok";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

let _havokInstance: any = null;

/**
 * Initialize Havok WASM (cached — safe to call multiple times).
 * Returns the raw Havok instance.
 */
export async function getHavokInstance(): Promise<any> {
  if (!_havokInstance) {
    _havokInstance = await HavokPhysics();
  }
  return _havokInstance;
}

/**
 * Create a HavokPlugin ready for scene.enablePhysics().
 */
export async function createHavokPlugin(): Promise<HavokPlugin> {
  const hk = await getHavokInstance();
  return new HavokPlugin(true, hk);
}

/**
 * One-liner: enable Havok physics on a scene with default gravity.
 */
export async function enableHavokPhysics(
  scene: Scene,
  gravity: Vector3 = new Vector3(0, -9.8, 0),
): Promise<HavokPlugin> {
  const plugin = await createHavokPlugin();
  scene.enablePhysics(gravity, plugin);
  return plugin;
}
