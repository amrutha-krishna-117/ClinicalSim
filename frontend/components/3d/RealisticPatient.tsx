'use client';
/**
 * RealisticPatient v9 — loads a real human GLB and turns it into a hospital patient.
 *
 * Expected shared asset (you supply it, see public/assets/patients/README.md):
 *   /assets/patients/patient.glb
 *
 * What this does with ANY humanoid GLB:
 *  - uses the same patient model in every position, poses it for sitting,
 *    and places supine / semi-recumbent patients on the mattress
 *  - swaps clothing meshes for a hospital-gown print, footwear for blue slippers,
 *    hides glasses / hats / armour
 *  - subtle state and speech motion; skeletal breathing, limb posing, blinking,
 *    and facial expressions are applied when the supplied GLB includes a rig
 *    or facial blendshapes
 * If a file is missing or broken, the old procedural body is shown instead (never a crash).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ProceduralPatient } from './ProceduralPatient';
import { useVoiceStore } from '@/lib/voice';
import { PoseName, PoseRig, makePoseRig, applyPoseToRig, faceTargets } from '@/lib/poseMath';
import { usePoseRef } from './usePose';

export type PatientPosition = 'sitting' | 'supine' | 'semi_recumbent' | 'standing';
export type PatientState = 'neutral' | 'anxious' | 'painful' | 'breathless' | 'comfortable';

interface Props {
  sex?: 'male' | 'female' | string;
  position?: PatientPosition;
  patientState?: PatientState;
  age?: number;
  glbUrl?: string;
  pose?: PoseName;
  /** Interactive anatomy shares the rendered model's position and orientation. */
  children?: React.ReactNode;
}

const MATTRESS_TOP = 0.54;                      // world height of the mattress surface
const ROOM_Y = (p: PatientPosition) =>          // where SimulationRoom places the patient group
  p === 'supine' || p === 'semi_recumbent' ? 0.54 : 1.10;

const BREATH: Record<PatientState, { rate: number; amp: number }> = {
  neutral:     { rate: 0.26, amp: 0.018 },
  comfortable: { rate: 0.20, amp: 0.014 },
  anxious:     { rate: 0.38, amp: 0.026 },
  painful:     { rate: 0.30, amp: 0.020 },
  breathless:  { rate: 0.55, amp: 0.042 },
};

/* ARKit blendshape targets per state (only used when the model has them) */
const EXPR: Record<PatientState, Record<string, number>> = {
  neutral: {}, comfortable: { mouthSmileLeft: 0.12, mouthSmileRight: 0.12 },
  anxious: { browInnerUp: 0.5, eyeWideLeft: 0.2, eyeWideRight: 0.2 },
  painful: { browDownLeft: 0.45, browDownRight: 0.45, eyeSquintLeft: 0.3, eyeSquintRight: 0.3, mouthFrownLeft: 0.25, mouthFrownRight: 0.25 },
  breathless: { jawOpen: 0.14, browInnerUp: 0.25, eyeWideLeft: 0.15, eyeWideRight: 0.15 },
};

/* ── Hospital-gown print (white with a fine blue pattern, like a real gown) ── */
function makeGownTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();   // server rendering: no canvas available
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f7fb';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#8ea6d4';
  for (let y = 0; y < 256; y += 16) {
    for (let x = 0; x < 256; x += 16) {
      const ox = (y / 16) % 2 ? 8 : 0;
      g.beginPath(); g.arc(x + ox + 4, y + 4, 1.7, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* Rotate a bone about the WORLD X axis (independent of how the rig's local axes are set up) */
function rotateWorldX(bone: THREE.Object3D, angle: number) {
  const parent = bone.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  const pQ = parent.getWorldQuaternion(new THREE.Quaternion());
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
  bone.quaternion.premultiply(pQ.clone().invert().multiply(q).multiply(pQ));
}

function refreshBounds(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const s = o as any;
    if (s.isSkinnedMesh) {
      s.skeleton.update();
      s.boundingBox = null;
      s.computeBoundingBox?.();
    }
  });
}

interface Rig {
  root: THREE.Object3D;
  rot: [number, number, number];
  pos: [number, number, number];
  landmarkPos: [number, number, number];
  bones: Record<string, THREE.Object3D>;
  morphMeshes: THREE.Mesh[];
  poseRig: PoseRig;
  baseScale: THREE.Vector3;
  blinkMeshes: THREE.Mesh[];
  breathTargets: Array<{ mesh: THREE.Mesh; index: number }>;
}

/** Add a small chest-only morph to static GLBs, which otherwise cannot breathe. */
function prepareChestBreathing(root: THREE.Object3D, chest: THREE.Vector3) {
  const targets: Array<{ mesh: THREE.Mesh; index: number }> = [];
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('position')) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const existing = geometry.morphAttributes.position ?? [];
    const priorIndex = existing.findIndex((attr) => attr.name === 'clinicalBreath');
    if (priorIndex >= 0) {
      mesh.updateMorphTargets();
      targets.push({ mesh, index: priorIndex });
      return;
    }

    const meshToRoot = rootInverse.clone().multiply(mesh.matrixWorld);
    const rootToMesh = meshToRoot.clone().invert();
    const values = new Float32Array(position.count * 3);
    const p = new THREE.Vector3();
    const expanded = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i).applyMatrix4(meshToRoot);
      const dy = (p.y - chest.y) / 0.19;
      const dx = (p.x - chest.x) / 0.25;
      const weight = Math.exp(-0.5 * (dy * dy + dx * dx));
      expanded.copy(p).add(new THREE.Vector3(
        (p.x - chest.x) * 0.024 * weight,
        0.004 * weight,
        (p.z - chest.z) * 0.040 * weight,
      )).applyMatrix4(rootToMesh);
      values[i * 3] = expanded.x;
      values[i * 3 + 1] = expanded.y;
      values[i * 3 + 2] = expanded.z;
    }
    const morph = new THREE.Float32BufferAttribute(values, 3);
    morph.name = 'clinicalBreath';
    geometry.morphAttributes.position = [...existing, morph];
    mesh.updateMorphTargets();
    const index = mesh.morphTargetDictionary?.clinicalBreath;
    if (index !== undefined) targets.push({ mesh, index });
  });
  return targets;
}

function buildRig(
  scene: THREE.Object3D, sex: string, position: PatientPosition,
  gownMat: THREE.Material, slipperMat: THREE.Material,
): Rig {
  const root = cloneSkinned(scene) as THREE.Object3D;
  const bones: Record<string, THREE.Object3D> = {};
  const morphMeshes: THREE.Mesh[] = [];
  const blinkMeshes: THREE.Mesh[] = [];

  root.traverse((o) => {
    if ((o as any).isBone) bones[o.name.replace(/^mixamorig[:_]?/i, '').toLowerCase()] = o;
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    if (m.morphTargetDictionary) morphMeshes.push(m);
    const matName = Array.isArray(m.material) ? m.material[0]?.name : (m.material as THREE.Material)?.name;
    const n = `${m.name} ${matName ?? ''}`.toLowerCase();
    if (/patient-eyes|\beyes?\b|\bhigh-poly\b/.test(n)) blinkMeshes.push(m);
    if (/glasses|hat|headwear|helmet|visor|armor|armour|weapon|backpack/.test(n)) { m.visible = false; return; }
    if (/footwear|shoe|boot|sneaker|slipper/.test(n)) { m.material = slipperMat; return; }
    if (/outfit|shirt|dress|gown|cloth|jacket|tee|pant|trouser|bottom|suit|uniform|\btop\b|_top/.test(n)
        && !/head|hair|eye|teeth|brow|lash|beard|body_?skin/.test(n)) {
      m.material = gownMat;
    }
  });

  // 1) Normalize once to adult height. The sitting pose changes joint angles,
  // never the patient's size or proportions.
  refreshBounds(root);
  const h0 = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y || 1;
  const targetHeight = position === 'sitting' ? 1.35 : (sex === 'female' ? 1.64 : 1.76);
  root.scale.multiplyScalar(targetHeight / h0);

  // 2) Apply articulated leg pose only when the supplied model has those bones.
  if (position === 'sitting') {
    // Rigged assets can use the procedural seated leg pose. The supplied CC0
    // seated patient already has this pose baked into its geometry.
    for (const n of ['leftupleg', 'rightupleg']) if (bones[n]) rotateWorldX(bones[n], -Math.PI / 2);
    for (const n of ['leftleg', 'rightleg']) if (bones[n]) rotateWorldX(bones[n], Math.PI / 2);
  }

  // 3) whole-body rotation + placement
  const rot: [number, number, number] =
    position === 'supine' ? [-Math.PI / 2, 0, 0] :
    position === 'semi_recumbent' ? [-Math.PI / 3.4, 0, 0] : [0, 0, 0];

  refreshBounds(root);
  const modelBounds = new THREE.Box3().setFromObject(root);
  const box = modelBounds.clone()
    .applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  const c = box.getCenter(new THREE.Vector3());
  const boundsCenter = c.clone().applyQuaternion(
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)).invert(),
  );
  // Prefer a recognized torso landmark so the existing patient-local region
  // layout is centered at the body, even when the asset origin is at the feet.
  root.updateMatrixWorld(true);
  const torso = bones['spine1'] ?? bones['hips'];
  const modelSize = modelBounds.getSize(new THREE.Vector3());
  const landmarkCenter = torso
    ? torso.getWorldPosition(new THREE.Vector3())
    : new THREE.Vector3(boundsCenter.x, modelBounds.min.y + modelSize.y * 0.69, boundsCenter.z);
  const breathTargets = prepareChestBreathing(root, landmarkCenter);

  const onMattress = position === 'supine' || position === 'semi_recumbent';
  const baseY = onMattress ? MATTRESS_TOP : 0;               // seated feet rest at floor level
  const patientZ = position === 'standing' ? 1.55 : position === 'sitting' ? 0.62 : 0;
  const pelvis = bones['hips']?.getWorldPosition(new THREE.Vector3());
  const sitYOffset = position === 'sitting' && pelvis ? MATTRESS_TOP - pelvis.y : 0;
  const pos: [number, number, number] = [
    -c.x,
    baseY - box.min.y - ROOM_Y(position) + 0.015 + sitYOffset, // align pelvis to mattress at bed edge
    -c.z + patientZ,                                         // sitting is at the long side edge
  ];
  const poseRig = makePoseRig(root, {
    spine1: bones['spine1'], spine2: bones['spine2'], neck: bones['neck'], head: bones['head'],
    rightarm: bones['rightarm'], leftarm: bones['leftarm'],
  });
  return {
    root, rot, pos,
    landmarkPos: [landmarkCenter.x, landmarkCenter.y, landmarkCenter.z],
    bones, morphMeshes, poseRig, baseScale: root.scale.clone(), blinkMeshes, breathTargets,
  };
}

/* ── The animated GLB patient ─────────────────────────────────────────── */
function GLBPatient({ url, sex, position, patientState, pose = 'rest', children }: {
  url: string; sex: string; position: PatientPosition; patientState: PatientState; pose?: PoseName; children?: React.ReactNode;
}) {
  const poseRef = usePoseRef(pose);
  const { scene } = useGLTF(url);
  const gownMat = useMemo(() => new THREE.MeshStandardMaterial({
    map: makeGownTexture(), roughness: 0.92, metalness: 0, side: THREE.DoubleSide,
  }), []);
  const slipperMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2f6fb0', roughness: 0.7 }), []);
  const rig = useMemo(
    () => buildRig(scene, sex, position, gownMat, slipperMat),
    [scene, sex, position, gownMat, slipperMat],
  );

  const stateRef = useRef(patientState);
  stateRef.current = patientState;
  const blink = useRef({ next: 2.5, t: -1 });
  const expr = useRef<Record<string, number>>({});
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const tmpE = useMemo(() => new THREE.Euler(), []);

  useFrame(({ clock }, dt) => {
    const T = clock.elapsedTime;
    const st = stateRef.current;
    const { rate, amp } = BREATH[st];

    // The CC0 meshes have no armature, so animate a chest-only morph and add
    // small state-specific body cues while retaining their detailed appearance.
    const anxiousMotion = st === 'anxious' ? Math.sin(T * 2.3) * 0.012 : 0;
    const painLean = st === 'painful' ? 0.025 : st === 'breathless' ? 0.012 : 0;
    const talkingNod = useVoiceStore.getState().speaking ? Math.sin(T * 3.4) * 0.012 : 0;
    rig.root.rotation.set(painLean + talkingNod, anxiousMotion * 0.45, anxiousMotion);
    rig.root.scale.copy(rig.baseScale);
    const breathWave = (Math.sin(T * rate * Math.PI * 2) + Math.sin(T * rate * Math.PI * 4) * 0.12 + 1.12) / 2.24;
    rig.breathTargets.forEach(({ mesh, index }) => {
      if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = breathWave;
    });

    // breathing: chest bone expands, second harmonic makes it less mechanical
    const b = (Math.sin(T * rate * Math.PI * 2) + Math.sin(T * rate * Math.PI * 4) * 0.15 + 1.15) / 2.3;
    const chest = rig.bones['spine2'] ?? rig.bones['spine1'] ?? rig.bones['chest'];
    if (chest) chest.scale.set(1 + b * amp * 0.5, 1 + b * amp * 0.1, 1 + b * amp);

    // Examination poses reset from the captured bind pose each frame, avoiding
    // accumulated rotation while allowing the head pose to be applied.
    applyPoseToRig(rig.poseRig, poseRef.current);

    // head micro-motion layered over the examination pose
    const head = rig.bones['head'];
    if (head) {
      tmpE.set(Math.sin(T * 0.21) * 0.025, Math.sin(T * 0.17 + 0.8) * 0.03, Math.sin(T * 0.14 + 2) * 0.012);
      // applyPoseToRig resets to the captured bind pose and applies the requested
      // examination pose before this small idle motion, so neither accumulates.
      head.quaternion.multiply(tmpQ.setFromEuler(tmpE));
    }
    // blink
    const bl = blink.current;
    bl.next -= dt;
    if (bl.next <= 0 && bl.t < 0) { bl.t = 0; bl.next = (st === 'anxious' ? 2 : 3.5) + Math.random() * 3; }
    let blinkV = 0;
    if (bl.t >= 0) {
      bl.t += dt;
      const d = 0.2;
      blinkV = bl.t < d / 2 ? bl.t / (d / 2) : 1 - (bl.t - d / 2) / (d / 2);
      if (bl.t >= d) { bl.t = -1; blinkV = 0; }
    }
    rig.blinkMeshes.forEach((mesh) => { mesh.visible = blinkV < 0.55; });

    // facial expression targets (smoothed)
    const speaking = useVoiceStore.getState().speaking;
    const target: Record<string, number> = { ...EXPR[st], eyeBlinkLeft: blinkV, eyeBlinkRight: blinkV };
    if (speaking) {
      // syllable-like jaw movement while the patient talks
      target.jawOpen = 0.10 + 0.28 * Math.abs(Math.sin(T * 9)) * (0.65 + 0.35 * Math.sin(T * 3.3));
      target.mouthFunnel = 0.10 * Math.abs(Math.sin(T * 4.5));
    }
    const face = faceTargets(poseRef.current);
    for (const k in face) target[k] = Math.max(target[k] ?? 0, face[k]);
    const names = new Set([...Object.keys(expr.current), ...Object.keys(target)]);
    names.forEach((k) => {
      const cur = expr.current[k] ?? 0;
      const want = target[k] ?? 0;
      const instant = k.startsWith('eyeBlink') || (speaking && (k === 'jawOpen' || k === 'mouthFunnel'));
      expr.current[k] = instant ? want : cur + (want - cur) * Math.min(1, dt * 3);
    });
    for (const m of rig.morphMeshes) {
      const dict = m.morphTargetDictionary!;
      const inf = m.morphTargetInfluences!;
      for (const k in expr.current) {
        const i = dict[k];
        if (i !== undefined) inf[i] = expr.current[k];
      }
    }
  });

  return (
    <group rotation={rig.rot} position={rig.pos}>
      {/* Landmark coordinates are expressed in the normalized model's meter-scale frame. */}
      <group position={rig.landmarkPos}>{children}</group>
      <primitive object={rig.root} />
    </group>
  );
}

/* Never let a bad/missing model take the whole 3D view down */
class Safe extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(e: unknown) { console.warn('[patient] GLB failed, using fallback body:', e); }
  render() { return this.state.err ? this.props.fallback : this.props.children; }
}

export function RealisticPatient({
  sex = 'male', position = 'supine', patientState = 'neutral', age = 45, glbUrl, pose = 'rest', children,
}: Props) {
  // Both GLBs are baked from one source mesh; sitting changes the pose geometry,
  // while preserving the same face, skin texture, hair, and hospital gown.
  const url = glbUrl ?? (position === 'sitting'
    ? '/assets/patients/patient-sitting.glb'
    : '/assets/patients/patient.glb');
  const [exists, setExists] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    setExists(null);
    fetch(url, { method: 'HEAD' })
      .then((r) => live && setExists(r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')))
      .catch(() => live && setExists(false));
    return () => { live = false; };
  }, [url]);

  const fallback = <ProceduralPatient sex={sex} position={position} patientState={patientState} age={age} pose={pose}>{children}</ProceduralPatient>;
  // Keep a usable patient on screen while the optional GLB is checked/downloaded.
  if (exists === null) return fallback;
  if (!exists) return fallback;
  return (
    <Safe fallback={fallback}>
      <React.Suspense fallback={fallback}>
        <GLBPatient url={url} sex={sex} position={position} patientState={patientState} pose={pose}>{children}</GLBPatient>
      </React.Suspense>
    </Safe>
  );
}
