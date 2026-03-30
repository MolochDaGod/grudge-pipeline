/**
 * Grudge Locomotion Blender
 *
 * Weighted animation blending for character locomotion:
 *   idle ↔ walk ↔ run (+ optional combat idle)
 *
 * Uses BabylonJS beginWeightedAnimation + syncWith for seamless transitions.
 * Designed to work with GrudgeCharacterController state + speed.
 */

import type { Scene } from "@babylonjs/core/scene";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { Animatable } from "@babylonjs/core/Animations/animatable";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FrameRange {
  start: number;
  end: number;
}

/**
 * Animation source — either frame ranges on a single skeleton,
 * or separate AnimationGroups (from glTF imports).
 */
export interface LocomotionConfig {
  /** Skeleton-based frame ranges (for .babylon files) */
  skeleton?: Skeleton;
  idle?: FrameRange;
  walk?: FrameRange;
  run?: FrameRange;
  combatIdle?: FrameRange;

  /** AnimationGroup-based (for glTF files — preferred) */
  idleGroup?: AnimationGroup;
  walkGroup?: AnimationGroup;
  runGroup?: AnimationGroup;
  combatIdleGroup?: AnimationGroup;

  /** Crossfade speed: weight change per frame (default 0.05 = ~20 frames to fully blend) */
  blendSpeed?: number;
  /** Speed threshold to switch from idle→walk (default 0.1) */
  walkThreshold?: number;
  /** Speed threshold to switch from walk→run (default 0.7) */
  runThreshold?: number;
}

interface WeightedAnim {
  anim: Animatable | AnimationGroup;
  targetWeight: number;
  currentWeight: number;
}

// ── Blender ──────────────────────────────────────────────────────────────────

export class LocomotionBlender {
  private scene: Scene;
  private blendSpeed: number;
  private walkThreshold: number;
  private runThreshold: number;

  private anims: Map<string, WeightedAnim> = new Map();
  private mode: "skeleton" | "group" = "group";

  constructor(scene: Scene, config: LocomotionConfig) {
    this.scene = scene;
    this.blendSpeed = config.blendSpeed ?? 0.05;
    this.walkThreshold = config.walkThreshold ?? 0.1;
    this.runThreshold = config.runThreshold ?? 0.7;

    if (config.skeleton && config.idle) {
      this._initSkeleton(config);
    } else {
      this._initGroups(config);
    }

    // Blend tick
    this.scene.onBeforeAnimationsObservable.add(() => this._tick());
  }

  // ── Skeleton-based init (frame ranges) ─────────────────────────────────

  private _initSkeleton(cfg: LocomotionConfig) {
    this.mode = "skeleton";
    const sk = cfg.skeleton!;

    if (cfg.idle) {
      const a = this.scene.beginWeightedAnimation(sk, cfg.idle.start, cfg.idle.end, 1.0, true);
      this.anims.set("idle", { anim: a, targetWeight: 1, currentWeight: 1 });
    }
    if (cfg.walk) {
      const a = this.scene.beginWeightedAnimation(sk, cfg.walk.start, cfg.walk.end, 0, true);
      this.anims.set("walk", { anim: a, targetWeight: 0, currentWeight: 0 });
    }
    if (cfg.run) {
      const a = this.scene.beginWeightedAnimation(sk, cfg.run.start, cfg.run.end, 0, true);
      this.anims.set("run", { anim: a, targetWeight: 0, currentWeight: 0 });
    }
    if (cfg.combatIdle) {
      const a = this.scene.beginWeightedAnimation(sk, cfg.combatIdle.start, cfg.combatIdle.end, 0, true);
      this.anims.set("combatIdle", { anim: a, targetWeight: 0, currentWeight: 0 });
    }

    // Sync walk and run to each other for seamless blending
    const walk = this.anims.get("walk");
    const run = this.anims.get("run");
    if (walk && run) {
      (walk.anim as Animatable).syncWith(run.anim as Animatable);
    }
  }

  // ── AnimationGroup-based init (glTF) ───────────────────────────────────

  private _initGroups(cfg: LocomotionConfig) {
    this.mode = "group";

    const setup = (key: string, group?: AnimationGroup, startWeight = 0) => {
      if (!group) return;
      group.start(true, 1.0, group.from, group.to, false);
      group.setWeightForAllAnimatables(startWeight);
      this.anims.set(key, { anim: group, targetWeight: startWeight, currentWeight: startWeight });
    };

    setup("idle", cfg.idleGroup, 1);
    setup("walk", cfg.walkGroup, 0);
    setup("run", cfg.runGroup, 0);
    setup("combatIdle", cfg.combatIdleGroup, 0);

    // Sync walk↔run
    const walk = this.anims.get("walk");
    const run = this.anims.get("run");
    if (walk && run && this.mode === "group") {
      (walk.anim as AnimationGroup).syncAllAnimationsWith(null);
      (run.anim as AnimationGroup).syncAllAnimationsWith(null);
    }
  }

  // ── Per-frame blend tick ───────────────────────────────────────────────

  private _tick() {
    for (const entry of this.anims.values()) {
      if (Math.abs(entry.currentWeight - entry.targetWeight) < 0.001) {
        entry.currentWeight = entry.targetWeight;
      } else {
        const dir = entry.targetWeight > entry.currentWeight ? 1 : -1;
        entry.currentWeight += dir * this.blendSpeed;
        entry.currentWeight = Math.max(0, Math.min(1, entry.currentWeight));
      }

      // Apply weight
      if (this.mode === "skeleton") {
        (entry.anim as Animatable).weight = entry.currentWeight;
      } else {
        (entry.anim as AnimationGroup).setWeightForAllAnimatables(entry.currentWeight);
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Update blend targets based on movement speed ratio (0 = still, 1 = max speed).
   * Call this every frame from your character controller.
   *
   * @param speedRatio 0..1 where 0=idle, walkThreshold=walking, runThreshold+=running
   * @param inCombat Whether to use combat idle instead of normal idle
   */
  public update(speedRatio: number, inCombat = false) {
    const idle = this.anims.get("idle");
    const walk = this.anims.get("walk");
    const run = this.anims.get("run");
    const combatIdle = this.anims.get("combatIdle");

    if (speedRatio < this.walkThreshold) {
      // Idle
      if (idle) idle.targetWeight = inCombat && combatIdle ? 0 : 1;
      if (walk) walk.targetWeight = 0;
      if (run) run.targetWeight = 0;
      if (combatIdle) combatIdle.targetWeight = inCombat ? 1 : 0;
    } else if (speedRatio < this.runThreshold) {
      // Walk — blend between idle and walk based on speed
      const t = (speedRatio - this.walkThreshold) / (this.runThreshold - this.walkThreshold);
      if (idle) idle.targetWeight = 1 - t;
      if (walk) walk.targetWeight = t;
      if (run) run.targetWeight = 0;
      if (combatIdle) combatIdle.targetWeight = 0;
    } else {
      // Run — blend between walk and run
      const t = Math.min((speedRatio - this.runThreshold) / (1 - this.runThreshold), 1);
      if (idle) idle.targetWeight = 0;
      if (walk) walk.targetWeight = 1 - t;
      if (run) run.targetWeight = t;
      if (combatIdle) combatIdle.targetWeight = 0;
    }
  }

  /**
   * Force a specific animation to full weight immediately (e.g. for skill/emote).
   * All locomotion weights go to 0.
   */
  public forceState(key: string) {
    for (const [k, entry] of this.anims.entries()) {
      entry.targetWeight = k === key ? 1 : 0;
    }
  }

  /** Get current weight of an animation */
  public getWeight(key: string): number {
    return this.anims.get(key)?.currentWeight ?? 0;
  }

  /** Stop all animations */
  public stopAll() {
    for (const entry of this.anims.values()) {
      if (this.mode === "skeleton") {
        (entry.anim as Animatable).stop();
      } else {
        (entry.anim as AnimationGroup).stop();
      }
    }
    this.anims.clear();
  }
}
