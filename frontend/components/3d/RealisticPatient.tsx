'use client';
/**
 * RealisticPatient v9 — loads a real human GLB and turns it into a hospital patient.
 *
 * Expected files (you supply them, see public/assets/patients/README.md):
 *   /assets/patients/patient-male.glb
 *   /assets/patients/patient-female.glb
 *
 * What this does with ANY humanoid GLB:
 *  - scales it to a realistic height, lays it on the mattress (supine / semi / sitting)
 *  - swaps clothing meshes for a hospital-gown print, footwear for blue slippers,
 *    hides glasses / hats / armour
 *  - breathing (chest bone), head micro-motion, blinking + pain/anxiety expressions
 *    (blinking & expressions need ARKit blendshapes, e.g. Ready Player Me avatars)
 * If a file is missing or broken, the old procedural body is shown instead (never a crash).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ProceduralPatient } from './ProceduralPatient';
import { useVoiceStore } from '@/lib/voice';

export type PatientPosition = 'sitting' | 'supine' | 'semi_recumbent' | 'standing';
export type PatientState = 'neutral' | 'anxious' | 'painful' | 'breathless' | 'comfortable';

interface Props {
  sex?: 'male' | 'female' | string;
  position?: PatientPosition;
  patientState?: PatientState;
  age?: number;
  glbUrl?: string;
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
  bones: Record<string, THREE.Object3D>;
  morphMeshes: THREE.Mesh[];
}

function buildRig(
  scene: THREE.Object3D, sex: string, position: PatientPosition,
  gownMat: THREE.Material, slipperMat: THREE.Material,
): Rig {
  const root = cloneSkinned(scene) as THREE.Object3D;
  const bones: Record<string, THREE.Object3D> = {};
  const morphMeshes: THREE.Mesh[] = [];

  root.traverse((o) => {
    if ((o as any).isBone) bones[o.name.replace(/^mixamorig[:_]?/i, '').toLowerCase()] = o;
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    if (m.morphTargetDictionary) morphMeshes.push(m);
    const matName = Array.isArray(m.material) ? m.material[0]?.name : (m.material as THREE.Material)?.name;
    const n = `${m.name} ${matName ?? ''}`.toLowerCase();
    if (/glasses|hat|headwear|helmet|visor|armor|armour|weapon|backpack/.test(n)) { m.visible = false; return; }
    if (/footwear|shoe|boot|sneaker|slipper/.test(n)) { m.material = slipperMat; return; }
    if (/outfit|shirt|dress|gown|cloth|jacket|tee|pant|trouser|bottom|suit|uniform|\btop\b|_top/.test(n)
        && !/head|hair|eye|teeth|brow|lash|beard|body_?skin/.test(n)) {
      m.material = gownMat;
    }
  });

  // 1) realistic height from the untouched bind pose
  refreshBounds(root);
  const h0 = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y || 1;
  root.scale.multiplyScalar((sex === 'female' ? 1.64 : 1.76) / h0);

  // 2) pose: sitting on the couch with legs extended forward
  if (position === 'sitting') {
    for (const n of ['leftupleg', 'rightupleg']) if (bones[n]) rotateWorldX(bones[n], -Math.PI / 2);
  }

  // 3) whole-body rotation + placement
  const rot: [number, number, number] =
    position === 'supine' ? [-Math.PI / 2, 0, 0] :
    position === 'semi_recumbent' ? [-Math.PI / 3.4, 0, 0] : [0, 0, 0];

  refreshBounds(root);
  const box = new THREE.Box3().setFromObject(root)
    .applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  const c = box.getCenter(new THREE.Vector3());

  const lying = position !== 'standing';
  const baseY = lying ? MATTRESS_TOP : 0;                    // standing patient is on the floor
  const pos: [number, number, number] = [
    -c.x,
    baseY - box.min.y - ROOM_Y(position) + 0.015,            // parent group already sits at ROOM_Y
    -c.z + (position === 'standing' ? 1.55 : 0),             // standing: at the foot of the bed
  ];
  return { root, rot, pos, bones, morphMeshes };
}

/* ── The animated GLB patient ─────────────────────────────────────────── */
function GLBPatient({ url, sex, position, patientState }: {
  url: string; sex: string; position: PatientPosition; patientState: PatientState;
}) {
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
  const headBase = useMemo(() => rig.bones['head']?.quaternion.clone(), [rig]);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const tmpE = useMemo(() => new THREE.Euler(), []);

  useFrame(({ clock }, dt) => {
    const T = clock.elapsedTime;
    const st = stateRef.current;
    const { rate, amp } = BREATH[st];

    // breathing: chest bone expands, second harmonic makes it less mechanical
    const b = (Math.sin(T * rate * Math.PI * 2) + Math.sin(T * rate * Math.PI * 4) * 0.15 + 1.15) / 2.3;
    const chest = rig.bones['spine2'] ?? rig.bones['spine1'] ?? rig.bones['chest'];
    if (chest) chest.scale.set(1 + b * amp * 0.5, 1 + b * amp * 0.1, 1 + b * amp);

    // head micro-motion
    const head = rig.bones['head'];
    if (head && headBase) {
      tmpE.set(Math.sin(T * 0.21) * 0.025, Math.sin(T * 0.17 + 0.8) * 0.03, Math.sin(T * 0.14 + 2) * 0.012);
      head.quaternion.copy(headBase).multiply(tmpQ.setFromEuler(tmpE));
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

    // facial expression targets (smoothed)
    const speaking = useVoiceStore.getState().speaking;
    const target: Record<string, number> = { ...EXPR[st], eyeBlinkLeft: blinkV, eyeBlinkRight: blinkV };
    if (speaking) {
      // syllable-like jaw movement while the patient talks
      target.jawOpen = 0.10 + 0.28 * Math.abs(Math.sin(T * 9)) * (0.65 + 0.35 * Math.sin(T * 3.3));
      target.mouthFunnel = 0.10 * Math.abs(Math.sin(T * 4.5));
    }
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
  sex = 'male', position = 'supine', patientState = 'neutral', age = 45, glbUrl,
}: Props) {
  const url = glbUrl ?? (sex === 'female' ? '/assets/patients/patient-female.glb' : '/assets/patients/patient-male.glb');
  const [exists, setExists] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    setExists(null);
    fetch(url, { method: 'HEAD' })
      .then((r) => live && setExists(r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')))
      .catch(() => live && setExists(false));
    return () => { live = false; };
  }, [url]);

  const fallback = <ProceduralPatient sex={sex} position={position} patientState={patientState} age={age} />;
  if (exists === null) return null;
  if (!exists) return fallback;
  return (
    <Safe fallback={fallback}>
      <React.Suspense fallback={null}>
        <GLBPatient url={url} sex={sex} position={position} patientState={patientState} />
      </React.Suspense>
    </Safe>
  );
}
