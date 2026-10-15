'use client';
/**
 * RealisticPatient v6 — Pixar/Oxford Medical Simulation style
 * Smooth organic human forms, realistic face, proper anatomy.
 * Matches the reference: patient lying in hospital bed, blue gown,
 * white sheet, calm relaxed expression.
 */
import { useRef, useMemo, Suspense, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';

export type PatientPosition = 'sitting' | 'supine' | 'semi_recumbent' | 'standing';
export type PatientState    = 'neutral' | 'anxious' | 'painful' | 'breathless' | 'comfortable';

interface Props {
  sex?: 'male' | 'female' | string;
  position?: PatientPosition;
  patientState?: PatientState;
  age?: number;
  glbUrl?: string;
}

/* ── GLB loader ──────────────────────────────────────────────────────── */
function GLBPatient({ url, position }: { url: string; position: PatientPosition }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const { actions, mixer } = useAnimations(animations, group);
  useEffect(() => {
    const a = actions['idle'] ?? actions['Idle'] ?? actions[Object.keys(actions)[0]];
    if (a) a.reset().fadeIn(0.4).play();
    return () => { mixer.stopAllAction(); };
  }, [actions, mixer]);
  const rot: [number, number, number] =
    position === 'supine' ? [-Math.PI / 2, 0, 0] :
    position === 'semi_recumbent' ? [-Math.PI / 3.5, 0, 0] : [0, 0, 0];
  return <group ref={group} rotation={rot}><primitive object={scene} /></group>;
}

/* ── Materials ───────────────────────────────────────────────────────── */
function useMat(
  color: string, roughness = 0.70, metalness = 0,
  emissive = '#000000', emissiveIntensity = 0
) {
  return useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), roughness, metalness,
    emissive: new THREE.Color(emissive), emissiveIntensity,
  }), [color, roughness, metalness, emissive, emissiveIntensity]);
}

/* ── Smooth sphere shorthand ──────────────────────────────────────────── */
function Sp({ r, mat, p, s }: {
  r: number; mat: THREE.Material;
  p?: [number, number, number];
  s?: [number, number, number];
}) {
  return (
    <mesh material={mat} position={p} scale={s} castShadow>
      <sphereGeometry args={[r, 48, 36]} />
    </mesh>
  );
}

/* ── Smooth capsule shorthand ─────────────────────────────────────────── */
function Cap({ r, l, mat, p, rot, s }: {
  r: number; l: number; mat: THREE.Material;
  p?: [number, number, number];
  rot?: [number, number, number];
  s?: [number, number, number];
}) {
  return (
    <mesh material={mat} position={p} rotation={rot} scale={s} castShadow>
      <capsuleGeometry args={[r, l, 16, 32]} />
    </mesh>
  );
}

/* ── Realistic Face ───────────────────────────────────────────────────── */
function Face({
  skin, darkSkin, hair, lip, eyeWhite, irisColor, sex, age,
  eyelidLRef, eyelidRRef, gazeRef,
}: {
  skin: THREE.Material; darkSkin: THREE.Material;
  hair: THREE.Material; lip: THREE.Material;
  eyeWhite: THREE.Material; irisColor: THREE.Material;
  sex: string; age: number;
  eyelidLRef: React.RefObject<THREE.Mesh | null>;
  eyelidRRef: React.RefObject<THREE.Mesh | null>;
  gazeRef: React.RefObject<THREE.Group | null>;
}) {
  const pupilMat = useMat('#080808', 0.05);
  const catchMat = useMat('#ffffff', 0.0, 0, '#ffffff', 4.0);

  return (
    <group>
      {/* ── SKULL ── large smooth base */}
      <Sp r={0.108} mat={skin} />
      {/* Upper cranium dome */}
      <Sp r={0.102} mat={skin} p={[0, 0.018, -0.006]} />
      {/* Forehead */}
      <Sp r={0.074} mat={skin} p={[0, 0.058, 0.056]} />
      {/* Temporal — left/right */}
      {[-1, 1].map(s => <Sp key={s} r={0.048} mat={skin} p={[s * 0.086, 0.010, 0.028]} />)}
      {/* Mid-face — cheek fill */}
      {[-1, 1].map(s => <Sp key={s} r={0.038} mat={skin} p={[s * 0.076, 0.006, 0.072]} />)}
      {/* Lower face */}
      <Sp r={0.082} mat={skin} p={[0, -0.068, 0.008]} s={[1, 0.80, 0.90]} />
      {/* Chin */}
      <Sp r={0.030} mat={skin} p={[0, -0.094, 0.072]} s={[0.92, 0.80, 1.0]} />
      {/* Philtrum ridge */}
      <Sp r={0.010} mat={darkSkin} p={[0, -0.030, 0.100]} s={[0.5, 1, 0.5]} />

      {/* ── HAIR ── */}
      {sex === 'female' ? (
        <group>
          {/* Crown */}
          <mesh material={hair} position={[0, 0.026, -0.014]} castShadow>
            <sphereGeometry args={[0.114, 40, 22, 0, Math.PI * 2, 0, Math.PI * 0.54]} />
          </mesh>
          {/* Side panels */}
          {[-1, 1].map(s => (
            <Cap key={s} r={0.022} l={0.150} mat={hair}
              p={[s * 0.096, -0.048, 0.010]} rot={[0, 0, s * 0.12]} />
          ))}
        </group>
      ) : (
        /* Short natural male hair — dark, sits close to skull */
        <group>
          <mesh material={hair} position={[0, 0.018, -0.014]} castShadow>
            <sphereGeometry args={[0.110, 44, 22, 0, Math.PI * 2, 0, Math.PI * 0.44]} />
          </mesh>
          {/* Side taper */}
          {[-1, 1].map(s => (
            <mesh key={s} material={hair} position={[s * 0.092, -0.010, -0.010]}
              scale={[0.42, 0.60, 0.70]} castShadow>
              <sphereGeometry args={[0.094, 24, 18]} />
            </mesh>
          ))}
        </group>
      )}

      {/* ── BROW RIDGE ── */}
      <mesh material={darkSkin} position={[0, 0.046, 0.090]} scale={[1, 0.50, 0.68]}>
        <boxGeometry args={[0.165, 0.018, 0.022]} />
      </mesh>
      {/* Eyebrows */}
      {[-1, 1].map(s => (
        <mesh key={s} material={hair}
          position={[s * 0.040, 0.058, 0.096]}
          rotation={[Math.PI / 2, 0, s * 0.15]}
          scale={[1, 0.26, 1]}>
          <capsuleGeometry args={[0.0055, 0.036, 6, 10]} />
        </mesh>
      ))}

      {/* ── EYES ── gaze group for drift animation */}
      <group ref={gazeRef}>
        {[-1, 1].map(s => (
          <group key={s} position={[s * 0.038, 0.020, 0.090]}>
            {/* Eye socket shadow */}
            <Sp r={0.026} mat={darkSkin} p={[0, 0, -0.006]} />
            {/* Sclera — slightly off-white, organic */}
            <Sp r={0.021} mat={eyeWhite} />
            {/* Iris */}
            <mesh position={[0, 0, 0.016]} rotation={[0, 0, 0]}>
              <circleGeometry args={[0.013, 28]} />
              <primitive object={irisColor} attach="material" />
            </mesh>
            {/* Pupil */}
            <mesh position={[0, 0, 0.018]}>
              <circleGeometry args={[0.007, 20]} />
              <primitive object={pupilMat} attach="material" />
            </mesh>
            {/* Specular catchlight */}
            <mesh position={[s * 0.003, 0.005, 0.020]}>
              <circleGeometry args={[0.003, 8]} />
              <primitive object={catchMat} attach="material" />
            </mesh>
            {/* Upper eyelid — animated */}
            <mesh
              ref={s === -1 ? eyelidLRef : eyelidRRef}
              material={skin}
              position={[0, 0.012, 0.017]}
              rotation={[0.30, 0, 0]}
              scale={[1.12, 0.36, 0.72]}>
              <sphereGeometry args={[0.020, 16, 12]} />
            </mesh>
            {/* Lower eyelid */}
            <mesh material={skin} position={[0, -0.012, 0.016]}
              rotation={[-0.20, 0, 0]} scale={[1.10, 0.32, 0.65]}>
              <sphereGeometry args={[0.018, 14, 10]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ── NOSE ── */}
      <group position={[0, -0.004, 0.104]}>
        {/* Bridge */}
        <Cap r={0.010} l={0.036} mat={skin} p={[0, 0.040, -0.004]} />
        {/* Tip */}
        <Sp r={0.020} mat={skin} p={[0, 0.004, 0.010]} />
        {/* Alae (wings) */}
        {[-1, 1].map(s => <Sp key={s} r={0.013} mat={skin} p={[s * 0.020, -0.002, 0.006]} />)}
        {/* Nostril hint */}
        {[-1, 1].map(s => (
          <mesh key={s} material={darkSkin} position={[s * 0.011, -0.012, 0.014]}>
            <circleGeometry args={[0.006, 12]} />
          </mesh>
        ))}
      </group>

      {/* ── LIPS ── relaxed, slightly parted for realism */}
      <group position={[0, -0.048, 0.096]}>
        {/* Upper lip */}
        <mesh material={lip}>
          <capsuleGeometry args={[0.0095, 0.048, 8, 14]} />
        </mesh>
        {/* Cupid's bow */}
        {[-1, 1].map(s => (
          <mesh key={s} material={lip} position={[s * 0.013, 0.009, 0.003]}
            scale={[0.72, 0.66, 1]}>
            <sphereGeometry args={[0.010, 10, 8]} />
          </mesh>
        ))}
        {/* Lower lip — slightly fuller */}
        <mesh material={lip} position={[0, -0.010, 0.004]} scale={[1, 0.78, 1]}>
          <capsuleGeometry args={[0.012, 0.042, 8, 14]} />
        </mesh>
        {/* Mouth line */}
        <mesh material={darkSkin} position={[0, -0.001, 0.008]} scale={[0.9, 0.3, 0.5]}>
          <capsuleGeometry args={[0.004, 0.040, 4, 8]} />
        </mesh>
        {/* Mouth corners */}
        {[-1, 1].map(s => (
          <Sp key={s} r={0.006} mat={darkSkin} p={[s * 0.030, -0.001, 0.002]} />
        ))}
      </group>

      {/* ── EARS ── */}
      {[-1, 1].map(s => (
        <group key={s} position={[s * 0.110, 0.000, 0.002]}>
          <Sp r={0.028} mat={skin} />
          <Sp r={0.018} mat={skin} p={[s * 0.003, 0.006, 0.002]} />
          <Sp r={0.013} mat={skin} p={[0, -0.022, 0.002]} />
          <Sp r={0.014} mat={darkSkin} p={[s * 0.002, 0, 0.008]} />
        </group>
      ))}

      {/* Age: add subtle nasolabial folds */}
      {age > 45 && [-1, 1].map(s => (
        <mesh key={s} material={darkSkin}
          position={[s * 0.034, -0.030, 0.094]}
          rotation={[0, 0, s * 0.24]}
          scale={[0.38, 1, 0.40]}>
          <sphereGeometry args={[0.010, 10, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Main procedural patient ─────────────────────────────────────────── */
function ProceduralPatient({ sex, position, patientState, age }: {
  sex: string; position: PatientPosition; patientState: PatientState; age: number;
}) {
  const isFemale = sex === 'female';

  /* Materials */
  const skin      = useMat('#c08050', 0.65, 0, '#280800', 0.05);
  const darkSkin  = useMat('#9a5c2e', 0.72);
  const hair      = useMat(age > 62 ? '#909090' : isFemale ? '#1a0800' : '#1a0800', 0.85);
  const lip       = useMat(isFemale ? '#b85060' : '#a85050', 0.48);
  const eyeWhite  = useMat('#ede8e2', 0.10);
  const irisMat   = useMat('#3c6030', 0.08);
  const gown      = useMat('#6fa8d0', 0.80);   // hospital blue like the reference
  const gownLight = useMat('#88bce0', 0.82);
  const gownDark  = useMat('#5090bc', 0.84);
  const legSkin   = useMat('#c08050', 0.68, 0, '#280800', 0.04);
  const ivTape    = useMat('#f2e4cc', 0.82);
  const ivTube    = useMat('#d8eef8', 0.30);

  /* Animation refs */
  const rootRef      = useRef<THREE.Group>(null);
  const torsoRef     = useRef<THREE.Group>(null);
  const chestRef     = useRef<THREE.Group>(null);
  const shoulderLRef = useRef<THREE.Group>(null);
  const shoulderRRef = useRef<THREE.Group>(null);
  const neckRef      = useRef<THREE.Group>(null);
  const headRef      = useRef<THREE.Group>(null);
  const gazeRef      = useRef<THREE.Group>(null);
  const eyelidLRef   = useRef<THREE.Mesh>(null);
  const eyelidRRef   = useRef<THREE.Mesh>(null);
  const handLRef     = useRef<THREE.Group>(null);

  /* Blink state machine */
  const blinkSt = useRef({ next: 3.5 + Math.random() * 2, phase: 0 as 0 | 1 | 2, t: 0 });
  /* Wince state (painful) */
  const winceSt = useRef({ next: 5 + Math.random() * 4, active: false, t: 0 });

  /* Per-state breathing parameters */
  const P = useMemo(() => {
    const m = {
      neutral:    { rate: 1.05, amp: 0.009, headAmp: 0.008, swayAmp: 0.004 },
      breathless: { rate: 3.50, amp: 0.028, headAmp: 0.016, swayAmp: 0.002 },
      anxious:    { rate: 1.80, amp: 0.012, headAmp: 0.014, swayAmp: 0.010 },
      painful:    { rate: 1.40, amp: 0.010, headAmp: 0.011, swayAmp: 0.006 },
      comfortable:{ rate: 0.78, amp: 0.007, headAmp: 0.005, swayAmp: 0.003 },
    };
    return m[patientState] ?? m.neutral;
  }, [patientState]);

  /* Master animation */
  useFrame(({ clock }, delta) => {
    const T = clock.getElapsedTime();
    const { rate, amp, headAmp, swayAmp } = P;

    /* ─ 1. BREATHING: primary + harmonic */
    const b1 = Math.sin(T * rate * Math.PI);
    const b2 = Math.sin(T * rate * Math.PI * 2) * 0.16;
    const bN = ((b1 + b2) + 1.16) / 2.32; // 0→1

    if (torsoRef.current) {
      torsoRef.current.scale.set(1 + bN * amp * 0.55, 1 + bN * amp * 0.10, 1 + bN * amp);
    }
    if (chestRef.current) chestRef.current.position.y = bN * amp * 0.28;
    const sl = bN * amp * 0.55;
    if (shoulderLRef.current) shoulderLRef.current.position.y = sl;
    if (shoulderRRef.current) shoulderRRef.current.position.y = sl;

    /* ─ 2. HEAD DRIFT: multi-frequency */
    const hdX = Math.sin(T * 0.21 + 1.3) * headAmp * 0.70 + Math.sin(T * 0.08) * headAmp * 0.38;
    const hdY = Math.sin(T * 0.17 + 0.8) * headAmp * 0.50;
    const hdZ = Math.sin(T * 0.14 + 2.0) * headAmp * 0.30;
    const breathLift = patientState === 'breathless' ? bN * 0.022 : 0;
    if (headRef.current) {
      headRef.current.rotation.x = hdX - breathLift;
      headRef.current.rotation.y = hdY;
      headRef.current.rotation.z = hdZ;
    }
    if (neckRef.current) {
      neckRef.current.rotation.x = hdX * 0.34;
      neckRef.current.rotation.y = hdY * 0.22;
    }

    /* ─ 3. GAZE DRIFT */
    const gd = Math.sin(T * 0.19 + 0.5) * 0.006
      + (patientState === 'anxious' ? Math.sin(T * 1.4 + 1.8) * 0.005 : 0);
    if (gazeRef.current) gazeRef.current.rotation.y = gd;

    /* ─ 4. BLINK */
    const bs = blinkSt.current;
    const blinkInterval = patientState === 'anxious' ? 2.5 : 4.2;
    if (bs.phase === 0) {
      bs.next -= delta;
      if (bs.next <= 0) { bs.phase = 1; bs.t = 0; bs.next = blinkInterval + Math.random() * 2; }
    } else {
      bs.t += delta;
      const p = bs.phase === 1
        ? Math.min(bs.t / 0.075, 1)
        : Math.min(bs.t / 0.115, 1);
      const sc = bs.phase === 1 ? 0.36 + p * 1.64 : 2.0 - p * 1.64;
      if (eyelidLRef.current) eyelidLRef.current.scale.y = sc;
      if (eyelidRRef.current) eyelidRRef.current.scale.y = sc;
      const dur = bs.phase === 1 ? 0.075 : 0.115;
      if (bs.t >= dur) {
        bs.phase = bs.phase === 1 ? 2 : 0;
        bs.t = 0;
      }
    }

    /* ─ 5. HAND FIDGET (anxious) */
    if (handLRef.current) {
      handLRef.current.rotation.x = patientState === 'anxious'
        ? Math.sin(T * 0.75) * 0.055 + 0.030 : 0;
    }

    /* ─ 6. PAIN WINCE */
    if (patientState === 'painful') {
      const ws = winceSt.current;
      ws.next -= delta;
      if (ws.next <= 0 && !ws.active) { ws.active = true; ws.t = 0; ws.next = 5 + Math.random() * 4; }
      if (ws.active) {
        ws.t += delta;
        const wp = Math.min(ws.t / 0.80, 1);
        const bell = wp < 0.4 ? wp / 0.4 : (1 - wp) / 0.6;
        if (shoulderLRef.current) shoulderLRef.current.position.y = sl + bell * 0.028;
        if (headRef.current) headRef.current.rotation.z = hdZ + bell * 0.055;
        if (ws.t >= 0.80) ws.active = false;
      }
    }

    /* ─ 7. IDLE SWAY (sitting/standing) */
    if (rootRef.current && (position === 'sitting' || position === 'standing')) {
      rootRef.current.rotation.z = Math.sin(T * 0.13 + 0.6) * swayAmp;
    }
  });

  const isSupine  = position === 'supine';
  const isSemi    = position === 'semi_recumbent';
  const isSitting = position === 'sitting';

  const rootRot: [number, number, number] =
    isSupine ? [-Math.PI / 2, 0, 0] :
    isSemi   ? [-Math.PI / 3.5, 0, 0] : [0, 0, 0];

  const kneeAngle = isSitting ? -Math.PI / 2.2 : 0;
  const shinAngle = isSitting ? Math.PI / 2.0  : 0;

  return (
    <group rotation={rootRot}>
      <group ref={rootRef}>
        <group ref={torsoRef}>

          {/* ── TORSO body ── */}
          {/* Main trunk — gown */}
          <Cap r={0.134} l={0.420} mat={gown} />
          {/* Chest volume — makes it less like a cylinder */}
          <Sp r={0.142} mat={gown} p={[0, 0.148, 0.006]} s={[1.08, 1, 1.05]} />
          {/* Abdomen */}
          <Sp r={0.126} mat={gown} p={[0, -0.092, 0.008]} s={[1.04, 1, 1.04]} />

          {/* ── Gown detail ── */}
          <group ref={chestRef}>
            {/* Front panel */}
            <mesh material={gownLight} position={[0, 0.040, 0.126]} castShadow>
              <boxGeometry args={[0.215, 0.390, 0.006]} />
            </mesh>
            {/* Vertical folds */}
            {[-0.080, 0, 0.080].map((x, i) => (
              <mesh key={i} material={gownDark} position={[x, 0.040, 0.130]}>
                <capsuleGeometry args={[0.002, 0.340, 4, 6]} />
              </mesh>
            ))}
            {/* Horizontal crease */}
            {[-0.10, 0.06].map((y, i) => (
              <mesh key={i} material={gownDark} position={[0, y, 0.130]} rotation={[0, 0, Math.PI / 2]}>
                <capsuleGeometry args={[0.002, 0.185, 4, 6]} />
              </mesh>
            ))}
            {/* Collar */}
            <mesh material={gown} position={[0, 0.232, 0.116]}>
              <boxGeometry args={[0.098, 0.072, 0.012]} />
            </mesh>
          </group>

          {/* ── IV line ── */}
          <Cap r={0.003} l={0.170} mat={ivTube} p={[-0.196, 0.024, -0.042]} rot={[0.20, 0, 0.28]} />
          <mesh material={ivTape} position={[-0.224, -0.056, -0.034]} rotation={[0.4, 0, 0.5]}>
            <boxGeometry args={[0.026, 0.015, 0.004]} />
          </mesh>

          {/* ── NECK ── */}
          <group ref={neckRef} position={[0, 0.342, 0.008]}>
            <Cap r={0.040} l={0.080} mat={skin} />
            {/* Throat bulge */}
            <Sp r={0.022} mat={skin} p={[0, 0.008, 0.030]} />
            {/* Sternocleidomastoid */}
            {[-1, 1].map(s => (
              <mesh key={s} material={darkSkin}
                position={[s * 0.018, -0.018, 0.022]}
                rotation={[0.18, 0, s * 0.14]}
                scale={[0.40, 1, 0.46]}>
                <capsuleGeometry args={[0.010, 0.068, 6, 10]} />
              </mesh>
            ))}

            {/* ── HEAD ── */}
            <group ref={headRef} position={[0, 0.200, -0.006]}>
              <Face
                skin={skin} darkSkin={darkSkin} hair={hair} lip={lip}
                eyeWhite={eyeWhite} irisColor={irisMat}
                sex={sex} age={age}
                eyelidLRef={eyelidLRef} eyelidRRef={eyelidRRef}
                gazeRef={gazeRef}
              />
            </group>
          </group>

          {/* ── SHOULDERS ── */}
          <group ref={shoulderLRef} position={[-0.172, 0.136, 0.004]}>
            <Sp r={0.058} mat={gown} />
          </group>
          <group ref={shoulderRRef} position={[0.172, 0.136, 0.004]}>
            <Sp r={0.058} mat={gown} />
          </group>

          {/* ── LEFT ARM ── */}
          <group position={[-0.172, 0.136, 0.004]}>
            <group rotation={[0.06, 0, 0.36]}>
              {/* Upper — gown sleeve */}
              <Cap r={0.040} l={0.155} mat={gown} p={[0, -0.110, 0]} />
              {/* Elbow */}
              <Sp r={0.037} mat={gown} p={[-0.054, -0.205, 0.002]} />
              <group position={[-0.054, -0.205, 0.002]} rotation={[-0.12, 0, 0]}>
                {/* Forearm — skin */}
                <Cap r={0.027} l={0.162} mat={legSkin} p={[0, -0.108, 0]} />
                <Sp r={0.023} mat={legSkin} p={[0, -0.196, 0]} />
                {/* Hand */}
                <group ref={handLRef} position={[0, -0.236, 0]}>
                  <Sp r={0.036} mat={legSkin} s={[1, 0.62, 0.46]} />
                  {[-0.012, 0, 0.012].map((fx, i) => (
                    <Cap key={i} r={0.0065} l={0.026} mat={legSkin} p={[fx, -0.028, 0.004]} />
                  ))}
                </group>
              </group>
            </group>
          </group>

          {/* ── RIGHT ARM ── */}
          <group position={[0.172, 0.136, 0.004]}>
            <group rotation={[0.06, 0, -0.36]}>
              <Cap r={0.040} l={0.155} mat={gown} p={[0, -0.110, 0]} />
              <Sp r={0.037} mat={gown} p={[0.054, -0.205, 0.002]} />
              <group position={[0.054, -0.205, 0.002]} rotation={[-0.12, 0, 0]}>
                <Cap r={0.027} l={0.162} mat={legSkin} p={[0, -0.108, 0]} />
                <Sp r={0.023} mat={legSkin} p={[0, -0.196, 0]} />
                <group position={[0, -0.236, 0]}>
                  <Sp r={0.036} mat={legSkin} s={[1, 0.62, 0.46]} />
                  {[-0.012, 0, 0.012].map((fx, i) => (
                    <Cap key={i} r={0.0065} l={0.026} mat={legSkin} p={[fx, -0.028, 0.004]} />
                  ))}
                </group>
              </group>
            </group>
          </group>

          {/* ── PELVIS / HEM ── */}
          <Sp r={0.128} mat={gown} p={[0, -0.210, 0.004]} />
          {/* Gown hem drape */}
          <mesh material={gownLight} position={[0, -0.290, 0.052]}
            rotation={[-0.16, 0, 0]} scale={[1, 0.28, 1]} castShadow>
            <capsuleGeometry args={[0.130, 0.024, 8, 16]} />
          </mesh>

          {/* ── LEGS ── */}
          {[-1, 1].map(side => (
            <group key={side} position={[side * 0.064, -0.248, 0.004]}>
              {/* Hip */}
              <Sp r={0.056} mat={legSkin} />
              <group rotation={[kneeAngle, 0, side * 0.022]}>
                {/* Thigh */}
                <Cap r={0.052} l={0.220} mat={legSkin} p={[0, -0.148, 0]} />
                {/* Knee */}
                <Sp r={0.048} mat={legSkin} p={[0, -0.268, 0.016]} />
                <group position={[0, -0.274, 0]} rotation={[shinAngle, 0, 0]}>
                  {/* Shin */}
                  <Cap r={0.038} l={0.200} mat={legSkin} p={[0, -0.130, 0]} s={[0.93, 1, 0.89]} />
                  {/* Calf */}
                  <Sp r={0.036} mat={legSkin} p={[side * -0.004, -0.118, -0.020]} s={[0.86, 1, 1.08]} />
                  {/* Ankle */}
                  <Sp r={0.030} mat={legSkin} p={[0, -0.245, 0]} />
                  {/* Ankle bumps */}
                  {[-1, 1].map(s => <Sp key={s} r={0.014} mat={legSkin} p={[s * 0.022, -0.242, 0.002]} />)}
                  {/* Foot */}
                  <Sp r={0.037} mat={legSkin} p={[0, -0.264, 0.040]} s={[1, 0.52, 1.42]} />
                  {/* Heel */}
                  <Sp r={0.026} mat={legSkin} p={[0, -0.264, -0.048]} s={[0.88, 0.72, 0.78]} />
                  {/* Toes */}
                  {[-0.022, -0.008, 0.005, 0.016, 0.024].map((tx, ti) => (
                    <Sp key={ti} r={0.010 - ti * 0.001} mat={legSkin}
                      p={[tx, -0.272, 0.050 - ti * 0.004]} />
                  ))}
                </group>
              </group>
            </group>
          ))}

        </group>{/* /torsoRef */}
      </group>{/* /rootRef */}
    </group>
  );
}

/* ── Export ──────────────────────────────────────────────────────────── */
export function RealisticPatient({
  sex = 'male', position = 'supine', patientState = 'neutral', age = 45, glbUrl,
}: Props) {
  const assetPath = glbUrl ?? '/assets/patients/default-adult-male.glb';
  const [useGLB, setUseGLB] = useState(false);
  useEffect(() => {
    fetch(assetPath, { method: 'HEAD' })
      .then(r => { if (r.ok) setUseGLB(true); })
      .catch(() => setUseGLB(false));
  }, [assetPath]);

  if (useGLB) {
    return (
      <Suspense fallback={
        <ProceduralPatient sex={sex} position={position}
          patientState={patientState} age={age} />
      }>
        <GLBPatient url={assetPath} position={position} />
      </Suspense>
    );
  }
  return (
    <ProceduralPatient sex={sex} position={position}
      patientState={patientState} age={age} />
  );
}

useGLTF.preload('/assets/patients/default-adult-male.glb');
