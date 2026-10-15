'use client';
/**
 * PatientAvatar — smooth organic humanoid using capsule-based skeletal hierarchy.
 * All limbs are children of their parent joint — no floating parts.
 * Supports: idle breathing, sitting, supine, semi-recumbent positions.
 * Architecture supports future GLB/GLTF replacement via the assetUrl prop.
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface PatientAvatarProps {
  sex: 'male' | 'female' | string;
  position: 'sitting' | 'supine' | 'semi_recumbent' | 'standing' | string;
  patientState: 'neutral' | 'anxious' | 'painful' | 'breathless' | 'comfortable';
  age: number;
  assetUrl?: string; // Future GLB path
}

// Simple primitives helpers
function Cap({ pos, rot, r, len, color, rough = 0.65 }: {
  pos: [number,number,number]; rot?: [number,number,number];
  r: number; len: number; color: string; rough?: number;
}) {
  return (
    <mesh position={pos} rotation={rot ?? [0,0,0]} castShadow>
      <capsuleGeometry args={[r, len, 8, 16]} />
      <meshStandardMaterial color={color} roughness={rough} />
    </mesh>
  );
}
function Ball({ pos, r, color, rough = 0.65, emissive = '#000000', emissiveI = 0 }: {
  pos: [number,number,number]; r: number; color: string;
  rough?: number; emissive?: string; emissiveI?: number;
}) {
  return (
    <mesh position={pos} castShadow>
      <sphereGeometry args={[r, 24, 20]} />
      <meshStandardMaterial color={color} roughness={rough} emissive={emissive} emissiveIntensity={emissiveI} />
    </mesh>
  );
}

export function PatientAvatar({ sex, position, patientState, age }: PatientAvatarProps) {
  const rootRef = useRef<THREE.Group>(null);
  const chestRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  const skin   = sex === 'female' ? '#c07848' : '#b06838';
  const skinD  = '#8a5228';
  const hair   = age < 40 ? (sex === 'female' ? '#1a0800' : '#2a1000') : '#707070';
  const shirt  = sex === 'male' ? '#2563eb' : '#7c3aed';
  const pants  = '#1e293b';
  const shoe   = '#111827';
  const lip    = '#b05048';
  const white_ = '#f0ede6';
  const iris_  = '#3b1a06';

  // Breathing animation — rate varies by state
  const breathRate = patientState === 'breathless' ? 3.5 : patientState === 'anxious' ? 1.8 : 1.0;
  const breathAmp  = patientState === 'breathless' ? 0.018 : 0.008;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (chestRef.current) {
      chestRef.current.scale.y = 1 + Math.sin(t * breathRate * Math.PI) * breathAmp;
    }
    if (headRef.current && patientState === 'anxious') {
      headRef.current.rotation.y = Math.sin(t * 0.4) * 0.04;
    }
  });

  // Position-based root rotation
  const rootRot: [number,number,number] =
    position === 'supine' ? [-Math.PI / 2, 0, 0] :
    position === 'semi_recumbent' ? [-Math.PI / 4, 0, 0] : [0, 0, 0];

  const legAngle = position === 'sitting' ? -Math.PI / 2.2 : 0;

  return (
    <group ref={rootRef} rotation={rootRot}>

      {/* ══ TORSO ═══════════════════════════════════════════════ */}
      <group ref={chestRef}>
        <mesh castShadow>
          <capsuleGeometry args={[0.185, 0.40, 8, 16]} />
          <meshStandardMaterial color={shirt} roughness={0.82} />
        </mesh>
        {/* Upper chest swell */}
        <Ball pos={[0, 0.16, 0]} r={0.198} color={shirt} rough={0.82} />
        {/* Hip-waist blend into pants */}
        <Ball pos={[0, -0.20, 0]} r={0.178} color={pants} rough={0.88} />
        {/* Collar skin */}
        <Ball pos={[0, 0.24, 0.12]} r={0.060} color={skin} rough={0.68} />

        {/* ── NECK ─────────────────────────────────────────────── */}
        <group position={[0, 0.315, 0]}>
          <Cap pos={[0,0,0]} r={0.062} len={0.10} color={skin} rough={0.66} />

          {/* ── HEAD ─────────────────────────────────────────── */}
          <group ref={headRef} position={[0, 0.185, 0]}>
            {/* Skull */}
            <mesh castShadow>
              <sphereGeometry args={[0.148, 32, 28]} />
              <meshStandardMaterial color={skin} roughness={0.60} />
            </mesh>
            {/* Jaw blend */}
            <Ball pos={[0, -0.068, 0.022]} r={0.116} color={skin} rough={0.62} />

            {/* ─ HAIR ─ */}
            {sex === 'female' ? (
              <group>
                <mesh position={[0, 0.040, -0.005]} rotation={[0.07,0,0]} castShadow>
                  <sphereGeometry args={[0.152, 28, 14, 0, Math.PI*2, 0, Math.PI*0.58]} />
                  <meshStandardMaterial color={hair} roughness={0.94} side={THREE.DoubleSide} />
                </mesh>
                <Cap pos={[0,-0.095,-0.080]} r={0.122} len={0.28} color={hair} rough={0.94} />
                <Cap pos={[-0.132,-0.060,0.010]} rot={[0,0,0.12]} r={0.030} len={0.24} color={hair} rough={0.94} />
                <Cap pos={[0.132,-0.060,0.010]} rot={[0,0,-0.12]} r={0.030} len={0.24} color={hair} rough={0.94} />
              </group>
            ) : (
              <mesh position={[0, 0.034, -0.012]} rotation={[0.06,0,0]} castShadow>
                <sphereGeometry args={[0.150, 28, 12, 0, Math.PI*2, 0, Math.PI*0.50]} />
                <meshStandardMaterial color={hair} roughness={0.90} side={THREE.DoubleSide} />
              </mesh>
            )}

            {/* ─ LEFT EYE ─ */}
            <group position={[-0.053, 0.034, 0.128]}>
              <Ball pos={[0,0,-0.003]} r={0.026} color={skinD} rough={0.72} />
              <Ball pos={[0,0,0]} r={0.023} color={white_} rough={0.12} />
              <mesh position={[0,0,0.018]}><circleGeometry args={[0.014,20]} /><meshStandardMaterial color={iris_} roughness={0.05} /></mesh>
              <mesh position={[0,0,0.020]}><circleGeometry args={[0.008,14]} /><meshStandardMaterial color="#040200" roughness={0} /></mesh>
              <mesh position={[0.006,0.006,0.022]}><circleGeometry args={[0.003,8]} /><meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={1} roughness={0} /></mesh>
            </group>
            {/* ─ RIGHT EYE ─ */}
            <group position={[0.053, 0.034, 0.128]}>
              <Ball pos={[0,0,-0.003]} r={0.026} color={skinD} rough={0.72} />
              <Ball pos={[0,0,0]} r={0.023} color={white_} rough={0.12} />
              <mesh position={[0,0,0.018]}><circleGeometry args={[0.014,20]} /><meshStandardMaterial color={iris_} roughness={0.05} /></mesh>
              <mesh position={[0,0,0.020]}><circleGeometry args={[0.008,14]} /><meshStandardMaterial color="#040200" roughness={0} /></mesh>
              <mesh position={[-0.006,0.006,0.022]}><circleGeometry args={[0.003,8]} /><meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={1} roughness={0} /></mesh>
            </group>

            {/* Brows */}
            <group position={[-0.053, 0.068, 0.128]} rotation={[0,0.15,0.12]}>
              <Cap pos={[0,0,0]} r={0.006} len={0.044} color={hair} rough={0.6} />
            </group>
            <group position={[0.053, 0.068, 0.128]} rotation={[0,-0.15,-0.12]}>
              <Cap pos={[0,0,0]} r={0.006} len={0.044} color={hair} rough={0.6} />
            </group>

            {/* Nose */}
            <group position={[0, 0.002, 0.140]}>
              <Cap pos={[0,0.036,-0.005]} r={0.011} len={0.036} color={skin} rough={0.62} />
              <Ball pos={[0,0,0.012]} r={0.020} color={skin} rough={0.60} />
              <Ball pos={[-0.022,-0.004,0.004]} r={0.014} color={skin} rough={0.60} />
              <Ball pos={[0.022,-0.004,0.004]} r={0.014} color={skin} rough={0.60} />
            </group>

            {/* Lips */}
            <group position={[0,-0.055,0.132]}>
              <group position={[0,0.007,0.004]}>
                <Cap pos={[0,0,0]} r={0.009} len={0.052} color={lip} rough={0.42} />
              </group>
              <group position={[0,-0.009,0.006]}>
                <Cap pos={[0,0,0]} r={0.012} len={0.048} color={lip} rough={0.40} />
              </group>
              <mesh position={[0,0,0.010]}><capsuleGeometry args={[0.003,0.046,4,6]} /><meshStandardMaterial color="#8a2010" roughness={0.6} /></mesh>
            </group>

            {/* Chin + cheeks */}
            <Ball pos={[0,-0.108,0.108]} r={0.032} color={skin} rough={0.64} />
            <Ball pos={[-0.090,0.010,0.108]} r={0.026} color={skin} rough={0.62} />
            <Ball pos={[0.090,0.010,0.108]} r={0.026} color={skin} rough={0.62} />

            {/* Ears */}
            <group position={[-0.146,0.006,0.004]}>
              <Ball pos={[0,0,0]} r={0.030} color={skin} rough={0.68} />
              <Ball pos={[0.006,0,0.002]} r={0.020} color={skinD} rough={0.72} />
            </group>
            <group position={[0.146,0.006,0.004]}>
              <Ball pos={[0,0,0]} r={0.030} color={skin} rough={0.68} />
              <Ball pos={[-0.006,0,0.002]} r={0.020} color={skinD} rough={0.72} />
            </group>
          </group>
          {/* end HEAD */}
        </group>
        {/* end NECK */}

        {/* ── SHOULDER CAPS ─────────────────────────────────────── */}
        <Ball pos={[-0.210, 0.160, 0]} r={0.076} color={shirt} rough={0.82} />
        <Ball pos={[0.210, 0.160, 0]} r={0.076} color={shirt} rough={0.82} />

        {/* ── LEFT ARM ──────────────────────────────────────────── */}
        <group position={[-0.210, 0.160, 0]}>
          <group rotation={[0.05, 0, 0.38]}>
            <Cap pos={[0,-0.175,0]} r={0.056} len={0.240} color={shirt} rough={0.82} />
            <group position={[0,-0.316,0]}>
              <Ball pos={[0,0,0]} r={0.052} color={shirt} rough={0.82} />
              <group rotation={[-0.14,0,0.10]}>
                <Cap pos={[0,-0.155,0]} r={0.042} len={0.220} color={skin} rough={0.65} />
                <group position={[0,-0.280,0]}>
                  <Ball pos={[0,0,0]} r={0.037} color={skin} rough={0.65} />
                  <group position={[0,-0.055,0]} rotation={[0.18,0,0]}>
                    <mesh castShadow><boxGeometry args={[0.070,0.080,0.030]} /><meshStandardMaterial color={skin} roughness={0.62} /></mesh>
                    {[-0.024,-0.008,0.008,0.024].map((fx,i)=>(
                      <group key={i} position={[fx,-0.052,0]}>
                        <Cap pos={[0,0,0]} r={0.009} len={0.034} color={skin} rough={0.60} />
                      </group>
                    ))}
                    <group position={[-0.040,-0.016,0.006]} rotation={[0.1,0,0.72]}>
                      <Cap pos={[0,0,0]} r={0.011} len={0.028} color={skin} rough={0.60} />
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>

        {/* ── RIGHT ARM (mirrored) ──────────────────────────────── */}
        <group position={[0.210, 0.160, 0]}>
          <group rotation={[0.05, 0, -0.38]}>
            <Cap pos={[0,-0.175,0]} r={0.056} len={0.240} color={shirt} rough={0.82} />
            <group position={[0,-0.316,0]}>
              <Ball pos={[0,0,0]} r={0.052} color={shirt} rough={0.82} />
              <group rotation={[-0.14,0,-0.10]}>
                <Cap pos={[0,-0.155,0]} r={0.042} len={0.220} color={skin} rough={0.65} />
                <group position={[0,-0.280,0]}>
                  <Ball pos={[0,0,0]} r={0.037} color={skin} rough={0.65} />
                  <group position={[0,-0.055,0]} rotation={[0.18,0,0]}>
                    <mesh castShadow><boxGeometry args={[0.070,0.080,0.030]} /><meshStandardMaterial color={skin} roughness={0.62} /></mesh>
                    {[-0.024,-0.008,0.008,0.024].map((fx,i)=>(
                      <group key={i} position={[fx,-0.052,0]}>
                        <Cap pos={[0,0,0]} r={0.009} len={0.034} color={skin} rough={0.60} />
                      </group>
                    ))}
                    <group position={[0.040,-0.016,0.006]} rotation={[0.1,0,-0.72]}>
                      <Cap pos={[0,0,0]} r={0.011} len={0.028} color={skin} rough={0.60} />
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>

        {/* ── PELVIS ─────────────────────────────────────────────── */}
        <mesh position={[0,-0.268,0]} castShadow>
          <capsuleGeometry args={[0.178,0.082,6,14]} />
          <meshStandardMaterial color={pants} roughness={0.88} />
        </mesh>

        {/* ── LEFT LEG ──────────────────────────────────────────── */}
        <group position={[-0.096,-0.318,0]}>
          <Ball pos={[0,0,0]} r={0.084} color={pants} rough={0.88} />
          <group rotation={[legAngle,0,0.04]}>
            <Cap pos={[0,-0.212,0]} r={0.076} len={0.318} color={pants} rough={0.88} />
            <group position={[0,-0.394,0]}>
              <Ball pos={[0,0,0]} r={0.072} color={pants} rough={0.88} />
              <group rotation={[position==='sitting' ? Math.PI/2.2 : 0.04, 0, 0]}>
                <Cap pos={[0,-0.192,0]} r={0.060} len={0.288} color={pants} rough={0.88} />
                <group position={[0,-0.352,0]}>
                  <Ball pos={[0,0,0]} r={0.050} color={skin} rough={0.66} />
                  <group position={[0,-0.038,0.052]} rotation={[-0.16,0,0]}>
                    <mesh castShadow><boxGeometry args={[0.088,0.046,0.168]} /><meshStandardMaterial color={shoe} roughness={0.88} /></mesh>
                    <Ball pos={[0,-0.002,0.088]} r={0.038} color={shoe} rough={0.86} />
                    <Ball pos={[0,-0.002,-0.086]} r={0.034} color={shoe} rough={0.88} />
                    <mesh position={[0,-0.026,0.008]} castShadow><boxGeometry args={[0.092,0.010,0.172]} /><meshStandardMaterial color="#090909" roughness={0.95} /></mesh>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>

        {/* ── RIGHT LEG (mirrored) ───────────────────────────────── */}
        <group position={[0.096,-0.318,0]}>
          <Ball pos={[0,0,0]} r={0.084} color={pants} rough={0.88} />
          <group rotation={[legAngle,0,-0.04]}>
            <Cap pos={[0,-0.212,0]} r={0.076} len={0.318} color={pants} rough={0.88} />
            <group position={[0,-0.394,0]}>
              <Ball pos={[0,0,0]} r={0.072} color={pants} rough={0.88} />
              <group rotation={[position==='sitting' ? Math.PI/2.2 : 0.04, 0, 0]}>
                <Cap pos={[0,-0.192,0]} r={0.060} len={0.288} color={pants} rough={0.88} />
                <group position={[0,-0.352,0]}>
                  <Ball pos={[0,0,0]} r={0.050} color={skin} rough={0.66} />
                  <group position={[0,-0.038,0.052]} rotation={[-0.16,0,0]}>
                    <mesh castShadow><boxGeometry args={[0.088,0.046,0.168]} /><meshStandardMaterial color={shoe} roughness={0.88} /></mesh>
                    <Ball pos={[0,-0.002,0.088]} r={0.038} color={shoe} rough={0.86} />
                    <Ball pos={[0,-0.002,-0.086]} r={0.034} color={shoe} rough={0.88} />
                    <mesh position={[0,-0.026,0.008]} castShadow><boxGeometry args={[0.092,0.010,0.172]} /><meshStandardMaterial color="#090909" roughness={0.95} /></mesh>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>

      </group>
      {/* end TORSO group / breathing ref */}
    </group>
  );
}
