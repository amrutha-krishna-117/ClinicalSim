/**
 * Patient body poses for examination (arm out for pulse/BP, mouth open, chin up for the neck, head turned,
 * leaning forward for the back ...). Pure maths so it can be tested without a renderer.
 * Rotations are done about the MODEL's own axes (x = patient's left, y = up, z = facing), so they stay
 * correct when the whole patient is rotated to lie on the bed.
 */
import * as THREE from 'three';

export type PoseName =
  | 'rest' | 'arm_out' | 'arm_out_left' | 'hands_out' | 'arm_raised' | 'mouth_open' | 'tongue_out'
  | 'eyes_up' | 'chin_up' | 'head_left' | 'head_right' | 'lean_forward';

export interface ArmPose { ab: number; fw: number }          // outward and forward raise, radians
export interface PoseTarget {
  rArm: ArmPose; lArm: ArmPose;                                // patient's right / left
  pitch: number; yaw: number;                                  // head: +pitch nods down, +yaw turns to patient's left
  lean: number;                                                // trunk forward lean
  mouth: number; tongue: number; eyesUp: number;               // 0..1
}

const A0: ArmPose = { ab: 0, fw: 0 };
export const REST: PoseTarget = { rArm: A0, lArm: A0, pitch: 0, yaw: 0, lean: 0, mouth: 0, tongue: 0, eyesUp: 0 };
const P = (o: Partial<PoseTarget>): PoseTarget => ({ ...REST, ...o });

export const POSES: Record<PoseName, PoseTarget> = {
  rest: REST,
  arm_out: P({ rArm: { ab: 0.55, fw: 0.30 } }),
  arm_out_left: P({ lArm: { ab: 0.55, fw: 0.30 } }),
  hands_out: P({ rArm: { ab: 0.15, fw: 0.75 }, lArm: { ab: 0.15, fw: 0.75 } }),
  arm_raised: P({ rArm: { ab: 0.35, fw: 2.8 } }),
  mouth_open: P({ mouth: 1, pitch: -0.05 }),
  tongue_out: P({ mouth: 1, tongue: 1, pitch: -0.08 }),
  eyes_up: P({ eyesUp: 1, pitch: -0.10 }),
  chin_up: P({ pitch: -0.38 }),
  head_left: P({ yaw: 0.65 }),
  head_right: P({ yaw: -0.65 }),
  lean_forward: P({ lean: 0.38, pitch: 0.05 }),
};

/** Which position the patient should be put in for an examination. */
export function poseFor(region?: string | null): PoseName {
  switch (region) {
    case 'hands': case 'nails': case 'clubbing': return 'hands_out';
    case 'radial_pulse': case 'brachial_pulse': case 'right_arm': case 'pulse': case 'radioradial_delay': case 'blood_pressure': return 'arm_out';
    case 'left_arm': return 'arm_out_left';
    case 'collapsing_pulse': return 'arm_raised';
    case 'tongue': return 'tongue_out';
    case 'teeth': return 'mouth_open';
    case 'eyes': case 'pallor': case 'jaundice': return 'eyes_up';
    case 'neck': case 'thyroid': case 'lymph_nodes': case 'trachea': return 'chin_up';
    case 'carotid': case 'jvp': return 'head_left';
    case 'posterior_chest': return 'lean_forward';
    default: return 'rest';
  }
}

/** Move `cur` a fraction `k` (0..1) of the way to `to`, in place. */
export function approach(cur: PoseTarget, to: PoseTarget, k: number) {
  const m = (a: number, b: number) => a + (b - a) * k;
  cur.rArm = { ab: m(cur.rArm.ab, to.rArm.ab), fw: m(cur.rArm.fw, to.rArm.fw) };
  cur.lArm = { ab: m(cur.lArm.ab, to.lArm.ab), fw: m(cur.lArm.fw, to.lArm.fw) };
  cur.pitch = m(cur.pitch, to.pitch); cur.yaw = m(cur.yaw, to.yaw); cur.lean = m(cur.lean, to.lean);
  cur.mouth = m(cur.mouth, to.mouth); cur.tongue = m(cur.tongue, to.tongue); cur.eyesUp = m(cur.eyesUp, to.eyesUp);
}

/* ───────────── skeleton (GLB models) ───────────── */
export const POSE_BONES = ['spine1', 'spine2', 'neck', 'head', 'rightarm', 'leftarm'] as const;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export interface PoseRig {
  frame: THREE.Object3D;                                         // the model root; its axes define forward/up/left
  bones: Record<string, THREE.Object3D | undefined>;
  bases: Map<THREE.Object3D, THREE.Quaternion>;                  // resting orientation of each driven bone
}

export function makePoseRig(frame: THREE.Object3D, bones: Record<string, THREE.Object3D | undefined>): PoseRig {
  const bases = new Map<THREE.Object3D, THREE.Quaternion>();
  for (const n of POSE_BONES) { const b = bones[n]; if (b) bases.set(b, b.quaternion.clone()); }
  return { frame, bones, bases };
}

/** Rotate a bone about an axis of the model frame, regardless of how the rig's local axes are set up. */
export function rotateInFrame(bone: THREE.Object3D, frame: THREE.Object3D, axis: THREE.Vector3, angle: number) {
  const parent = bone.parent;
  if (!parent || Math.abs(angle) < 1e-5) return;
  frame.updateWorldMatrix(true, false);
  parent.updateWorldMatrix(true, false);
  const axisW = axis.clone().applyQuaternion(frame.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const q = new THREE.Quaternion().setFromAxisAngle(axisW, angle);
  const pq = parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.premultiply(pq.clone().invert().multiply(q).multiply(pq));
}

/**
 * Apply a pose on top of the resting skeleton. Call every frame (it resets the driven bones first, so it
 * never accumulates). Set resetHead=false if the caller already set the head's orientation this frame.
 */
export function applyPoseToRig(rig: PoseRig, pose: PoseTarget, resetHead = true) {
  const { frame, bones, bases } = rig;
  for (const n of POSE_BONES) {
    const b = bones[n];
    if (b && (resetHead || n !== 'head')) b.quaternion.copy(bases.get(b)!);
  }
  if (bones.spine1) rotateInFrame(bones.spine1, frame, X, pose.lean * 0.4);
  if (bones.spine2) rotateInFrame(bones.spine2, frame, X, pose.lean * 0.6);
  if (bones.neck) { rotateInFrame(bones.neck, frame, X, pose.pitch * 0.4); rotateInFrame(bones.neck, frame, Y, pose.yaw * 0.4); }
  if (bones.head) { rotateInFrame(bones.head, frame, X, pose.pitch * 0.6); rotateInFrame(bones.head, frame, Y, pose.yaw * 0.6); }
  if (bones.rightarm) { rotateInFrame(bones.rightarm, frame, Z, -pose.rArm.ab); rotateInFrame(bones.rightarm, frame, X, -pose.rArm.fw); }
  if (bones.leftarm) { rotateInFrame(bones.leftarm, frame, Z, pose.lArm.ab); rotateInFrame(bones.leftarm, frame, X, -pose.lArm.fw); }
}

/** ARKit blendshapes (Ready Player Me etc.) for the face part of a pose. */
export function faceTargets(pose: PoseTarget): Record<string, number> {
  const out: Record<string, number> = {};
  if (pose.mouth > 0.02) out.jawOpen = 0.55 * pose.mouth;
  if (pose.tongue > 0.02) out.tongueOut = pose.tongue;
  if (pose.eyesUp > 0.02) { out.eyeLookUpLeft = pose.eyesUp; out.eyeLookUpRight = pose.eyesUp; }
  return out;
}
