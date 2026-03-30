/**
 * Grudge Havok Character Controller
 *
 * Unified physics-based character controller using BabylonJS + Havok.
 * State machine: IN_AIR → ON_GROUND → START_JUMP → IN_AIR
 * Camera: over-the-shoulder follow cam (Fortnite-style, W = forward from camera)
 *
 * Used across all game modes: MMO, MOBA, combat arena.
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PhysicsCharacterController } from "@babylonjs/core/Physics/characterController";
import { PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { CharacterSupportedState } from "@babylonjs/core/Physics/characterController";
import { KeyboardEventTypes } from "@babylonjs/core/Events/keyboardEvents";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

// ── Types ────────────────────────────────────────────────────────────────────

export type CharacterState = "IN_AIR" | "ON_GROUND" | "START_JUMP";

export interface CharacterConfig {
  /** Capsule height (default 1.8) */
  height?: number;
  /** Capsule radius (default 0.6) */
  radius?: number;
  /** Walk speed (default 10) */
  walkSpeed?: number;
  /** Air control speed (default 8) */
  airSpeed?: number;
  /** Sprint multiplier (default 1.6) */
  sprintMultiplier?: number;
  /** Jump height in world units (default 1.5) */
  jumpHeight?: number;
  /** Gravity strength (default 18) */
  gravity?: number;
  /** Camera follow distance (default 7.5) */
  cameraDistance?: number;
  /** Camera height offset (default 2) */
  cameraHeight?: number;
  /** Camera lerp speed (default 0.1) */
  cameraLerp?: number;
  /** Spawn position */
  spawnPosition?: { x: number; y: number; z: number };
  /** Show debug capsule (default true) */
  showCapsule?: boolean;
}

const DEFAULTS: Required<CharacterConfig> = {
  height: 1.8,
  radius: 0.6,
  walkSpeed: 10,
  airSpeed: 8,
  sprintMultiplier: 1.6,
  jumpHeight: 1.5,
  gravity: 18,
  cameraDistance: 7.5,
  cameraHeight: 2,
  cameraLerp: 0.1,
  spawnPosition: { x: 0, y: 1, z: 0 },
  showCapsule: true,
};

// ── Controller ───────────────────────────────────────────────────────────────

export class GrudgeCharacterController {
  public state: CharacterState = "IN_AIR";
  public controller: PhysicsCharacterController;
  public capsuleMesh: Mesh;
  public camera: FreeCamera;

  private scene: Scene;
  private cfg: Required<CharacterConfig>;
  private inputDirection = Vector3.Zero();
  private characterOrientation = Quaternion.Identity();
  private characterGravity: Vector3;
  private forwardLocal = new Vector3(0, 0, 1);
  private wantJump = false;
  private isSprinting = false;
  private isMouseDown = false;

  /** Optional mesh to move with the controller (your character model) */
  public attachedMesh: TransformNode | null = null;

  constructor(scene: Scene, config?: CharacterConfig) {
    this.scene = scene;
    this.cfg = { ...DEFAULTS, ...config } as Required<CharacterConfig>;
    this.characterGravity = new Vector3(0, -this.cfg.gravity, 0);

    // Capsule display
    this.capsuleMesh = MeshBuilder.CreateCapsule(
      "GrudgeCharacter",
      { height: this.cfg.height, radius: this.cfg.radius },
      scene,
    );
    this.capsuleMesh.isVisible = this.cfg.showCapsule;

    // Physics character controller
    const spawn = new Vector3(
      this.cfg.spawnPosition.x,
      this.cfg.spawnPosition.y,
      this.cfg.spawnPosition.z,
    );
    this.controller = new PhysicsCharacterController(
      spawn,
      { capsuleHeight: this.cfg.height, capsuleRadius: this.cfg.radius },
      scene,
    );

    // Camera — free camera, over-the-shoulder follow
    this.camera = new FreeCamera("GrudgeFollowCam", spawn.add(new Vector3(0, this.cfg.cameraHeight, -this.cfg.cameraDistance)), scene);
    this.camera.setTarget(spawn);
    this.camera.minZ = 0.1;
    scene.activeCamera = this.camera;

    // Trigger collisions
    this.controller.onTriggerCollisionObservable.add((event) => {
      console.log(`[Grudge] Trigger: ${event.collider.transformNode.name}`);
    });

    this._setupInput();
    this._setupRenderLoop();
    this._setupPhysicsTick();
  }

  // ── Input ────────────────────────────────────────────────────────────────

  private _setupInput() {
    const scene = this.scene;

    // Keyboard
    scene.onKeyboardObservable.add((info) => {
      const down = info.type === KeyboardEventTypes.KEYDOWN;
      const key = info.event.key.toLowerCase();

      if (key === "w" || key === "arrowup") this.inputDirection.z = down ? 1 : 0;
      else if (key === "s" || key === "arrowdown") this.inputDirection.z = down ? -1 : 0;
      else if (key === "a" || key === "arrowleft") this.inputDirection.x = down ? -1 : 0;
      else if (key === "d" || key === "arrowright") this.inputDirection.x = down ? 1 : 0;
      else if (key === " ") this.wantJump = down;
      else if (key === "shift") this.isSprinting = down;
    });

    // Mouse — hold LMB to rotate camera around character
    scene.onPointerObservable.add((info) => {
      if (info.type === PointerEventTypes.POINTERDOWN) this.isMouseDown = true;
      else if (info.type === PointerEventTypes.POINTERUP) this.isMouseDown = false;
      else if (info.type === PointerEventTypes.POINTERMOVE && this.isMouseDown) {
        const tgt = this.camera.getTarget().clone();
        const right = this.camera.getDirection(Vector3.Right());
        this.camera.position.addInPlace(right.scale(info.event.movementX * -0.02));
        this.camera.setTarget(tgt);
      }
    });
  }

  // ── Render loop (visual update) ──────────────────────────────────────────

  private _setupRenderLoop() {
    this.scene.onBeforeRenderObservable.add(() => {
      const pos = this.controller.getPosition();
      this.capsuleMesh.position.copyFrom(pos);

      // Move attached character mesh
      if (this.attachedMesh) {
        this.attachedMesh.position.copyFrom(pos);
        this.attachedMesh.position.y -= this.cfg.height / 2;
        // Face movement direction
        if (this.inputDirection.lengthSquared() > 0.01) {
          const facing = this.inputDirection.applyRotationQuaternion(this.characterOrientation);
          const angle = Math.atan2(facing.x, facing.z);
          this.attachedMesh.rotation.y = angle;
        }
      }

      // Camera smooth follow
      const camDir = this.camera.getDirection(new Vector3(0, 0, 1));
      camDir.y = 0;
      camDir.normalize();
      this.camera.setTarget(
        Vector3.Lerp(this.camera.getTarget(), pos, this.cfg.cameraLerp),
      );
      const dist = Vector3.Distance(this.camera.position, pos);
      const minDist = this.cfg.cameraDistance - 1.5;
      const maxDist = this.cfg.cameraDistance + 1.5;
      const pushPull = (Math.min(dist - minDist, 0) + Math.max(dist - maxDist, 0)) * 0.04;
      camDir.scaleAndAddToRef(pushPull, this.camera.position);
      this.camera.position.y += (pos.y + this.cfg.cameraHeight - this.camera.position.y) * 0.04;
    });
  }

  // ── Physics tick ─────────────────────────────────────────────────────────

  private _setupPhysicsTick() {
    this.scene.onAfterPhysicsObservable.add(() => {
      if (this.scene.deltaTime === undefined) return;
      const dt = this.scene.deltaTime / 1000;
      if (dt <= 0) return;

      const down = new Vector3(0, -1, 0);
      const support = this.controller.checkSupport(dt, down);

      // Orientation = camera yaw
      Quaternion.FromEulerAnglesToRef(0, this.camera.rotation.y, 0, this.characterOrientation);

      const velocity = this._getDesiredVelocity(dt, support);
      this.controller.setVelocity(velocity);
      this.controller.integrate(dt, support, this.characterGravity);
    });
  }

  // ── State machine + velocity ─────────────────────────────────────────────

  private _getNextState(support: any): CharacterState {
    const supported = support.supportedState === CharacterSupportedState.SUPPORTED;
    if (this.state === "IN_AIR") return supported ? "ON_GROUND" : "IN_AIR";
    if (this.state === "ON_GROUND") {
      if (!supported) return "IN_AIR";
      if (this.wantJump) return "START_JUMP";
      return "ON_GROUND";
    }
    // START_JUMP
    return "IN_AIR";
  }

  private _getDesiredVelocity(dt: number, support: any): Vector3 {
    const next = this._getNextState(support);
    if (next !== this.state) this.state = next;

    const up = this.characterGravity.normalizeToNew().scale(-1);
    const forward = this.forwardLocal.applyRotationQuaternion(this.characterOrientation);
    const currentVel = this.controller.getVelocity();

    const speed = this.isSprinting
      ? this.cfg.walkSpeed * this.cfg.sprintMultiplier
      : this.cfg.walkSpeed;

    if (this.state === "IN_AIR") {
      const desired = this.inputDirection.scale(this.cfg.airSpeed).applyRotationQuaternion(this.characterOrientation);
      const out = this.controller.calculateMovement(dt, forward, up, currentVel, Vector3.ZeroReadOnly, desired, up);
      // Keep vertical velocity, add gravity
      out.addInPlace(up.scale(-out.dot(up)));
      out.addInPlace(up.scale(currentVel.dot(up)));
      out.addInPlace(this.characterGravity.scale(dt));
      return out;
    }

    if (this.state === "ON_GROUND") {
      const desired = this.inputDirection.scale(speed).applyRotationQuaternion(this.characterOrientation);
      const out = this.controller.calculateMovement(
        dt, forward, support.averageSurfaceNormal, currentVel,
        support.averageSurfaceVelocity, desired, up,
      );
      // Horizontal projection on surface
      out.subtractInPlace(support.averageSurfaceVelocity);
      if (out.dot(up) > 1e-3) {
        const len = out.length();
        out.normalizeFromLength(len);
        const horizLen = len / support.averageSurfaceNormal.dot(up);
        const c = support.averageSurfaceNormal.cross(out);
        const projected = c.cross(up);
        projected.scaleInPlace(horizLen);
        return projected.add(support.averageSurfaceVelocity);
      }
      out.addInPlace(support.averageSurfaceVelocity);
      return out;
    }

    if (this.state === "START_JUMP") {
      const u = Math.sqrt(2 * this.characterGravity.length() * this.cfg.jumpHeight);
      const curRelVel = currentVel.dot(up);
      return currentVel.add(up.scale(u - curRelVel));
    }

    return Vector3.Zero();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** Attach a character model mesh to follow the controller */
  public attach(mesh: TransformNode) {
    this.attachedMesh = mesh;
  }

  /** Teleport the character to a position */
  public teleport(position: Vector3) {
    this.controller.setPosition(position);
  }

  /** Get current world position */
  public getPosition(): Vector3 {
    return this.controller.getPosition();
  }

  /** Whether the character is on the ground */
  public get isGrounded(): boolean {
    return this.state === "ON_GROUND";
  }

  /** Make static collision for a level mesh */
  public static makeStatic(mesh: AbstractMesh, scene?: Scene): PhysicsAggregate {
    const agg = new PhysicsAggregate(mesh, PhysicsShapeType.MESH);
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = true;
    return agg;
  }

  /** Make a dynamic physics box */
  public static makeDynamic(mesh: AbstractMesh, mass = 0.1): PhysicsAggregate {
    return new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass });
  }

  /** Dispose everything */
  public dispose() {
    this.capsuleMesh.dispose();
    this.camera.dispose();
  }
}
