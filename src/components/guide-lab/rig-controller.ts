import {
  AnimationClip, AnimationMixer, Euler, LoopRepeat, MathUtils, Object3D,
  Quaternion, QuaternionKeyframeTrack, Vector3,
  type AnimationAction,
} from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { ActorSnapshot, ActorState } from "@/domain/guide-lab";
import type { Vec3 } from "@/domain/types";

const q = (x: number, y: number, z: number) => new Quaternion().setFromEuler(new Euler(x, y, z));

/** Original short skeletal clips. They are rig animations, not CSS/image state changes. */
function makeClip(vrm: VRM, state: ActorState): AnimationClip {
  const poses: Partial<Record<VRMHumanBoneName, [number, number, number]>> = {
    leftUpperArm: [0.08, 0.03, -1.24], rightUpperArm: [0.08, -0.03, 1.24],
    leftLowerArm: [0, -0.18, 0], rightLowerArm: [0, 0.18, 0],
    leftHand: [0, 0, 0], rightHand: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
  };
  if (["pointing", "guiding", "summoning", "presenting", "arrived"].includes(state)) {
    poses.leftUpperArm = [0, 0, -0.5];
    poses.leftLowerArm = [0, -0.9, 0];
  }
  if (state === "thinking") poses.head = [0.07, -0.12, -0.04];
  const tracks = Object.entries(poses).flatMap(([bone, rotation]) => {
    const node = vrm.humanoid.getNormalizedBoneNode(bone as VRMHumanBoneName);
    if (!node) return [];
    const [x, y, z] = rotation;
    const amplitude = bone === "chest" ? 0.012 : bone === "spine" ? 0.008 : 0;
    return [new QuaternionKeyframeTrack(`${node.uuid}.quaternion`, [0, 1.6, 3.2], [
      ...q(x, y, z).toArray(), ...q(x + amplitude, y, z).toArray(), ...q(x, y, z).toArray(),
    ])];
  });
  // Curl non-index fingers for an actual pointing hand, otherwise keep a soft open hand.
  for (const side of ["left", "right"]) for (const finger of ["Index", "Middle", "Ring", "Little"]) {
    for (const joint of ["Proximal", "Intermediate", "Distal"]) {
      const name = `${side}${finger}${joint}` as VRMHumanBoneName;
      const bone = vrm.humanoid.getNormalizedBoneNode(name);
      if (!bone) continue;
      const pointing = side === "left" && ["pointing", "guiding"].includes(state) && finger !== "Index";
      const straightIndex = side === "left" && ["pointing", "guiding"].includes(state) && finger === "Index";
      const angle = (pointing ? 0.85 : straightIndex ? 0 : 0.12) * (side === "left" ? -1 : 1);
      tracks.push(new QuaternionKeyframeTrack(`${bone.uuid}.quaternion`, [0, 3.2], [...q(0, 0, angle).toArray(), ...q(0, 0, angle).toArray()]));
    }
  }
  return new AnimationClip(`lab:${state}`, 3.2, tracks);
}

/** Two-bone reach in world space; normalized bones make it independent of source rig axes. */
class ArmReach {
  private a = new Vector3(); private b = new Vector3(); private c = new Vector3();
  private direction = new Vector3(); private pole = new Vector3(); private elbow = new Vector3();
  private oldDirection = new Vector3(); private newDirection = new Vector3();
  private rotation = new Quaternion(); private world = new Quaternion(); private parent = new Quaternion();

  private aim(bone: Object3D, child: Object3D, destination: Vector3) {
    bone.getWorldPosition(this.a); child.getWorldPosition(this.b);
    this.oldDirection.subVectors(this.b, this.a).normalize();
    this.newDirection.subVectors(destination, this.a).normalize();
    this.rotation.setFromUnitVectors(this.oldDirection, this.newDirection);
    bone.getWorldQuaternion(this.world).premultiply(this.rotation);
    bone.parent!.getWorldQuaternion(this.parent).invert();
    bone.quaternion.copy(this.parent.multiply(this.world));
    bone.updateWorldMatrix(false, true);
  }

  solve(vrm: VRM, destination: Vector3) {
    const upper = vrm.humanoid.getNormalizedBoneNode("leftUpperArm")!;
    const lower = vrm.humanoid.getNormalizedBoneNode("leftLowerArm")!;
    const hand = vrm.humanoid.getNormalizedBoneNode("leftHand")!;
    upper.getWorldPosition(this.a); lower.getWorldPosition(this.b); hand.getWorldPosition(this.c);
    const l1 = this.a.distanceTo(this.b), l2 = this.b.distanceTo(this.c);
    this.direction.subVectors(destination, this.a);
    const distance = MathUtils.clamp(this.direction.length(), Math.abs(l1 - l2) + 0.001, (l1 + l2) * 0.97);
    this.direction.normalize();
    const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
    this.pole.set(0, -1, 0.3).addScaledVector(this.direction, -this.pole.dot(this.direction)).normalize();
    this.elbow.copy(this.a).addScaledVector(this.direction, along).addScaledVector(this.pole, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
    this.c.copy(this.a).addScaledVector(this.direction, distance);
    this.aim(upper, lower, this.elbow);
    this.aim(lower, hand, this.c);
  }
}

export class RigController {
  readonly mixer: AnimationMixer;
  readonly gaze = new Object3D();
  readonly palm = new Vector3();
  readonly hand = new Vector3();
  gazeError = 0;
  private clips = new Map<ActorState, AnimationAction>();
  private action: AnimationAction | null = null;
  private signature = "";
  private reach = new ArmReach();
  private elapsed = 0;
  private time = 0;
  private bodyYaw = 0;
  private target = new Vector3(); private local = new Vector3(); private origin = new Vector3();
  private destination = new Vector3(); private wristQ = new Quaternion(); private parentQ = new Quaternion();
  private offset = new Vector3(); private lookRotation = new Quaternion();
  private fingerAxis = new Vector3(1, 0, 0);
  private imported: AnimationAction | null = null;
  private importedBase: AnimationAction | null = null;
  private transitionBones: { node: Object3D; from: Quaternion; target: Quaternion; animationPose: Quaternion }[];

  constructor(readonly vrm: VRM, private palmOffset: Vec3) {
    this.mixer = new AnimationMixer(vrm.scene);
    this.transitionBones = Object.values(vrm.humanoid.normalizedHumanBones).map(bone => ({ node: bone.node, from: bone.node.quaternion.clone(), target: new Quaternion(), animationPose: bone.node.quaternion.clone() }));
    for (const state of ["idle", "attention", "thinking", "pointing", "guiding", "arrived", "summoning", "presenting"] as ActorState[]) {
      this.clips.set(state, this.mixer.clipAction(makeClip(vrm, state)).setLoop(LoopRepeat, Infinity));
    }
    if (vrm.lookAt) vrm.lookAt.target = this.gaze;
  }

  playImported(clip: AnimationClip) {
    this.imported?.stop(); this.importedBase?.stop();
    const animated = new Set(clip.tracks.map(track => track.name));
    const fallback = makeClip(this.vrm, "idle");
    fallback.tracks = fallback.tracks.filter(track => !animated.has(track.name));
    fallback.name = "lab:vrma-unanimated-bones";
    this.action?.stop();
    this.importedBase = this.mixer.clipAction(fallback).play();
    this.imported = this.mixer.clipAction(clip).reset().play();
    this.imported.fadeIn(0.4);
  }

  stopImported() {
    this.imported?.fadeOut(0.35); this.importedBase?.fadeOut(0.35);
    this.imported = null; this.importedBase = null; this.signature = "";
  }

  update(dt: number, snapshot: ActorSnapshot, planet: Vector3, memory: Vector3 | null, camera: Vector3, reduced: boolean) {
    const signature = `${snapshot.run}:${snapshot.state}`;
    if (this.signature !== signature) {
      this.signature = signature; this.elapsed = 0;
      // Capture the actual IK result, not only the underlying clip's pose.
      for (const bone of this.transitionBones) bone.from.copy(bone.node.quaternion);
      const next = this.clips.get(snapshot.state)!;
      next.reset().setEffectiveWeight(1).play();
      if (this.action && this.action !== next) next.crossFadeFrom(this.action, reduced ? 0.12 : 0.45, false);
      this.action = next;
    }
    this.elapsed += dt; this.time += dt;
    // PropertyMixer can skip writing unchanged tracks. Restore the clean animation
    // layer before evaluation, otherwise last frame's IK/blend can become the rest pose.
    for (const bone of this.transitionBones) bone.node.quaternion.copy(bone.animationPose);
    // Pause clip time, not mixer time: cross-fades must still finish under reduced motion.
    if (this.action) this.action.paused = reduced;
    if (this.imported) this.imported.paused = reduced;
    this.mixer.update(dt);
    for (const bone of this.transitionBones) bone.animationPose.copy(bone.node.quaternion);
    if (this.imported) { this.vrm.update(reduced ? 0 : dt); this.updatePalm(); return this.elapsed; }
    const state = snapshot.state;
    const aimed = ["attention", "pointing", "guiding", "thinking", "summoning"].includes(state);
    this.target.copy(aimed ? (state === "thinking" || state === "summoning") && memory ? memory : planet : camera);
    this.vrm.scene.getWorldPosition(this.origin);
    const desiredYaw = aimed ? MathUtils.clamp(Math.atan2(this.target.x - this.origin.x, this.target.z - this.origin.z), -1.05, 1.05) : 0.08;
    this.bodyYaw = MathUtils.damp(this.bodyYaw, desiredYaw, reduced ? 20 : 3.0, dt);
    this.gazeError = Math.abs(this.bodyYaw - desiredYaw);
    this.vrm.scene.rotation.y = this.bodyYaw;
    this.vrm.scene.updateMatrixWorld(true);
    this.gaze.position.lerp(this.target, 1 - Math.exp(-dt * 5));
    const head = this.vrm.humanoid.getNormalizedBoneNode("head")!;
    this.local.copy(this.target); head.parent!.worldToLocal(this.local);
    this.lookRotation.setFromEuler(new Euler(MathUtils.clamp(-Math.atan2(this.local.y - head.position.y, Math.hypot(this.local.x, this.local.z)), -0.22, 0.22), MathUtils.clamp(Math.atan2(this.local.x, this.local.z), -0.4, 0.4), 0, "YXZ"));
    head.quaternion.slerp(this.lookRotation, 0.65);
    const gesturing = ["pointing", "guiding", "arrived", "summoning", "presenting"].includes(state);
    if (gesturing) {
      if (state === "pointing" || state === "guiding") {
        this.destination.copy(planet); this.destination.y -= 0.08;
      } else {
        this.destination.set(0.38, state === "arrived" ? 1.36 : 1.08, state === "arrived" ? 0.18 : 0.35);
        this.destination.applyAxisAngle(Object3D.DEFAULT_UP, this.bodyYaw).add(this.origin);
      }
      this.vrm.scene.updateMatrixWorld(true);
      // Ease the reach from the mixer pose instead of snapping to the target.
      const hand = this.vrm.humanoid.getNormalizedBoneNode("leftHand")!;
      hand.getWorldPosition(this.local);
      this.destination.lerpVectors(this.local, this.destination, MathUtils.smoothstep(this.elapsed, 0, reduced ? 0.15 : 0.9));
      this.reach.solve(this.vrm, this.destination);
      // Open palm faces upward; welcome adds a small wrist wave about real bones.
      if (state === "pointing" || state === "guiding") {
        hand.getWorldPosition(this.local);
        this.local.subVectors(planet, this.local).normalize();
        this.wristQ.setFromUnitVectors(this.fingerAxis, this.local);
      } else if (state === "arrived") {
        // Fingers point up and the palm faces the viewer, unlike the horizontal offering pose.
        this.wristQ.setFromEuler(new Euler(0, Math.PI / 2, Math.PI / 2 + (!reduced ? Math.sin(this.elapsed * 5) * 0.14 : 0), "YXZ"));
      } else this.wristQ.setFromEuler(new Euler(0, -Math.PI / 2, 0));
      hand.parent!.getWorldQuaternion(this.parentQ).invert();
      hand.quaternion.slerp(this.parentQ.multiply(this.wristQ), MathUtils.smoothstep(this.elapsed, 0, 0.8));
    }
    const transition = MathUtils.smoothstep(this.elapsed, 0, reduced ? 0.15 : 0.45);
    if (transition < 1) for (const bone of this.transitionBones) {
      bone.target.copy(bone.node.quaternion);
      bone.node.quaternion.slerpQuaternions(bone.from, bone.target, transition);
    }
    const blinkPhase = this.time % 4.6;
    const blink = reduced ? 0 : blinkPhase > 4.38 ? Math.sin(((blinkPhase - 4.38) / 0.22) * Math.PI) : 0;
    this.vrm.expressionManager?.setValue("blink", Math.max(0, blink));
    this.vrm.expressionManager?.setValue("relaxed", state === "arrived" || state === "presenting" ? 0.22 : 0.08);
    // Apply humanoid → expressions/lookAt → spring bones, once per frame.
    this.vrm.update(reduced ? 0 : dt);
    this.vrm.scene.updateMatrixWorld(true);
    this.updatePalm();
    return this.elapsed;
  }

  private updatePalm() {
    const raw = this.vrm.humanoid.getRawBoneNode("leftHand")!;
    const normalized = this.vrm.humanoid.getNormalizedBoneNode("leftHand")!;
    raw.getWorldPosition(this.hand);
    normalized.getWorldQuaternion(this.wristQ);
    this.offset.fromArray(this.palmOffset).applyQuaternion(this.wristQ).multiplyScalar(this.vrm.scene.scale.x);
    this.palm.copy(this.hand).add(this.offset);
  }

  dispose() {
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.vrm.scene);
  }
}
