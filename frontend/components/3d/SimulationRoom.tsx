'use client';
/**
 * SimulationRoom — Professional clinical examination room
 * Visual target: Oxford Medical Simulation / Full Code quality
 * - Realistic blue exam bed with white mattress
 * - Clinical equipment on walls
 * - Proper PBR lighting
 * - Smooth camera rig
 */
import { Suspense, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment, useEnvironment } from '@react-three/drei';
import * as THREE from 'three';
import { RealisticPatient, PatientPosition, PatientState } from './RealisticPatient';
import { BodyRegions } from './BodyRegions';
import { InstrumentType } from './ExaminationInstruments';

export interface SimulationRoomProps {
  patient: { sex: string; age: number; position: string; personality: string };
  onRegionClick: (region: string) => void;
  selectedRegion: string | null;
  activeInstrument?: InstrumentType;
  onInstrumentSelect?: (id: InstrumentType) => void;
  patientState?: PatientState;
  activeCategory?: string | null;
}

// ─── CameraRig: updates OrbitControls target only (does NOT override camera position)
// This allows OrbitControls to keep working while focusing on regions
function CameraRig({ selectedRegion, controlsRef }: {
  selectedRegion: string | null;
  controlsRef: React.MutableRefObject<any>;
}) {
  const targetRef = useRef(new THREE.Vector3(0, 0.85, 0));

  const REGION_TARGET: Record<string, [number, number, number]> = {
    face: [0, 1.55, 0], eyes: [0, 1.55, 0], tongue: [0, 1.50, 0],
    jvp: [-0.05, 1.42, 0], carotid: [0.05, 1.42, 0], lymph_nodes: [0, 1.40, 0],
    chest: [0, 1.22, 0], precordium: [-0.04, 1.20, 0],
    aortic: [0.08, 1.30, 0], pulmonary: [-0.08, 1.30, 0],
    mitral: [-0.10, 1.18, 0], tricuspid: [0.04, 1.18, 0],
    lungs: [0, 1.22, 0], posterior_chest: [0, 1.22, 0],
    abdomen: [0, 1.02, 0], liver: [0.12, 1.04, 0],
    spleen: [-0.12, 1.04, 0], ascites: [0, 0.98, 0],
    left_arm: [-0.35, 1.08, 0], right_arm: [0.35, 1.08, 0],
    nails: [-0.40, 0.94, 0], legs: [0, 0.65, 0],
    edema: [0, 0.52, 0], neurological: [0, 1.10, 0],
    reflexes: [0, 0.72, 0], cranial_nerves: [0, 1.52, 0],
  };

  useFrame((_, delta) => {
    const tgt = selectedRegion && REGION_TARGET[selectedRegion]
      ? new THREE.Vector3(...REGION_TARGET[selectedRegion])
      : new THREE.Vector3(0, 0.85, 0);
    targetRef.current.lerp(tgt, delta * 2.0);
    if (controlsRef.current) {
      controlsRef.current.target.copy(targetRef.current);
      controlsRef.current.update();
    }
  });

  return null;
}

// ─── Professional Clinical Examination Bed ────────────────────────────
// Based on the reference images: blue frame/upholstery, white mattress, chrome rails
function ClinicalBed({ supine }: { supine: boolean }) {
  const blueMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1d4ed8', roughness: 0.55, metalness: 0.08,
  }), []);
  const whiteMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f1f5f9', roughness: 0.88, metalness: 0,
  }), []);
  const chromeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d1d5db', metalness: 0.92, roughness: 0.10,
  }), []);
  const darkBlueMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1e3a8a', roughness: 0.60, metalness: 0.05,
  }), []);
  const sheetMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 0.96, metalness: 0,
  }), []);
  const pillowMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f8fafc', roughness: 0.95, metalness: 0,
  }), []);

  return (
    <group position={[0, 0, 0]}>
      {/* Main bed base — blue like reference image */}
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow material={blueMat}>
        <boxGeometry args={[0.88, 0.12, 2.10]} />
      </mesh>
      {/* Blue side panels */}
      <mesh position={[-0.45, 0.50, 0]} castShadow material={blueMat}>
        <boxGeometry args={[0.04, 0.36, 2.08]} />
      </mesh>
      <mesh position={[0.45, 0.50, 0]} castShadow material={blueMat}>
        <boxGeometry args={[0.04, 0.36, 2.08]} />
      </mesh>
      {/* Blue end panels */}
      <mesh position={[0, 0.50, 1.06]} castShadow material={blueMat}>
        <boxGeometry args={[0.90, 0.36, 0.04]} />
      </mesh>
      <mesh position={[0, 0.50, -1.06]} castShadow material={blueMat}>
        <boxGeometry args={[0.90, 0.36, 0.04]} />
      </mesh>
      {/* White mattress */}
      <mesh position={[0, 0.465, 0]} castShadow receiveShadow material={whiteMat}>
        <boxGeometry args={[0.84, 0.075, 2.02]} />
      </mesh>
      {/* White sheet on top */}
      <mesh position={[0, 0.504, 0.10]} material={sheetMat}>
        <boxGeometry args={[0.82, 0.008, 1.72]} />
      </mesh>
      {/* Pillow — white */}
      <mesh position={[0, 0.510, -0.82]} castShadow material={pillowMat}>
        <boxGeometry args={[0.60, 0.080, 0.38]} />
      </mesh>
      {/* Headboard — dark blue */}
      <mesh position={[0, 0.72, -1.08]} castShadow material={darkBlueMat}>
        <boxGeometry args={[0.88, 0.52, 0.06]} />
      </mesh>

      {/* Semi-recumbent back section raise */}
      {supine ? null : (
        <mesh position={[0, 0.54, -0.50]} rotation={[0.35, 0, 0]} castShadow material={whiteMat}>
          <boxGeometry args={[0.82, 0.06, 0.85]} />
        </mesh>
      )}

      {/* Chrome side rails */}
      {([-0.47, 0.47] as const).map(x => (
        <group key={x}>
          <mesh position={[x, 0.76, 0]} material={chromeMat} castShadow>
            <boxGeometry args={[0.018, 0.028, 1.60]} />
          </mesh>
          {/* Rail vertical posts */}
          {([-0.6, 0, 0.6] as const).map(z => (
            <mesh key={z} position={[x, 0.62, z]} material={chromeMat}>
              <cylinderGeometry args={[0.009, 0.009, 0.28, 8]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Chrome column legs */}
      {([-0.40, 0.40] as const).flatMap(x =>
        ([-0.92, 0.92] as const).map(z => (
          <mesh key={`${x}${z}`} position={[x, 0.18, z]} material={chromeMat} castShadow>
            <cylinderGeometry args={[0.022, 0.022, 0.36, 10]} />
          </mesh>
        ))
      )}
      {/* Wheel base crossbar */}
      <mesh position={[0, 0.025, 0]} material={chromeMat}>
        <boxGeometry args={[0.86, 0.025, 2.00]} />
      </mesh>
      {/* Wheels */}
      {([-0.38, 0.38] as const).flatMap(x =>
        ([-0.90, 0.90] as const).map(z => (
          <group key={`w${x}${z}`} position={[x, 0.04, z]}>
            <mesh material={new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 })}>
              <cylinderGeometry args={[0.040, 0.040, 0.030, 12]} />
            </mesh>
          </group>
        ))
      )}
      {/* Orange wheel lock handles */}
      {([-0.44, 0.44] as const).flatMap(x =>
        ([-0.90, 0.90] as const).map(z => (
          <mesh key={`o${x}${z}`} position={[x, 0.032, z]}
            material={new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.7 })}>
            <boxGeometry args={[0.015, 0.012, 0.060]} />
          </mesh>
        ))
      )}
    </group>
  );
}

// ─── Vital Signs Monitor ──────────────────────────────────────────────
function VitalSignsMonitor({ position }: { position: [number, number, number] }) {
  const blackMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1c1917', roughness: 0.65 }), []);
  const screenMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0a0a0a', roughness: 0.2 }), []);
  const poleMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6b7280', metalness: 0.82, roughness: 0.18 }), []);
  const greenMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#22c55e', emissive: '#22c55e', emissiveIntensity: 1.8, roughness: 0 }), []);
  const yellowMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#eab308', emissive: '#eab308', emissiveIntensity: 1.2, roughness: 0 }), []);
  const redMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 1.0, roughness: 0 }), []);

  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 0.72, 0]} material={poleMat} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 1.44, 10]} />
      </mesh>
      {/* Base */}
      <mesh position={[0, 0, 0]} material={poleMat}>
        <cylinderGeometry args={[0.155, 0.155, 0.022, 16]} />
      </mesh>
      {/* Monitor housing */}
      <mesh position={[0, 1.35, 0.02]} material={blackMat} castShadow>
        <boxGeometry args={[0.28, 0.22, 0.10]} />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 1.35, 0.072]}>
        <boxGeometry args={[0.24, 0.18, 0.004]} />
        <meshStandardMaterial color="#0d1117" roughness={0.15} metalness={0.1} />
      </mesh>
      {/* ECG green line */}
      <mesh position={[0, 1.360, 0.076]} material={greenMat}>
        <boxGeometry args={[0.18, 0.003, 0.002]} />
      </mesh>
      <mesh position={[0.025, 1.370, 0.076]} material={greenMat}>
        <boxGeometry args={[0.003, 0.042, 0.002]} />
      </mesh>
      <mesh position={[-0.025, 1.350, 0.076]} material={greenMat}>
        <boxGeometry args={[0.003, 0.042, 0.002]} />
      </mesh>
      {/* SpO2 value */}
      <mesh position={[0.07, 1.368, 0.076]} material={yellowMat}>
        <boxGeometry args={[0.046, 0.026, 0.002]} />
      </mesh>
      {/* HR value */}
      <mesh position={[-0.076, 1.368, 0.076]} material={redMat}>
        <boxGeometry args={[0.040, 0.026, 0.002]} />
      </mesh>
      {/* Cables */}
      <mesh position={[0, 1.14, 0.03]} material={new THREE.MeshStandardMaterial({ color: '#374151', roughness: 0.9 })}>
        <cylinderGeometry args={[0.006, 0.006, 0.38, 6]} />
      </mesh>
    </group>
  );
}

// ─── IV Pole ──────────────────────────────────────────────────────────
function IVPole({ position }: { position: [number, number, number] }) {
  const poleMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.85, roughness: 0.15 }), []);
  const bagMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#93c5fd', transparent: true, opacity: 0.72, roughness: 0.12 }), []);
  return (
    <group position={position}>
      <mesh position={[0, 0.92, 0]} material={poleMat} castShadow>
        <cylinderGeometry args={[0.013, 0.013, 1.84, 8]} />
      </mesh>
      <mesh position={[0, 0, 0]} material={poleMat}>
        <cylinderGeometry args={[0.17, 0.17, 0.018, 16]} />
      </mesh>
      {/* Hook crossbar */}
      <mesh position={[0, 1.83, 0]} rotation={[0, 0, Math.PI / 2]} material={poleMat}>
        <cylinderGeometry args={[0.008, 0.008, 0.28, 8]} />
      </mesh>
      {/* Hooks */}
      {[-0.12, 0.12].map(x => (
        <mesh key={x} position={[x, 1.86, 0.01]} rotation={[0.4, 0, 0]} material={poleMat}>
          <cylinderGeometry args={[0.005, 0.005, 0.055, 6]} />
        </mesh>
      ))}
      {/* IV bag */}
      <mesh position={[0.08, 1.74, 0]} castShadow material={bagMat}>
        <boxGeometry args={[0.100, 0.162, 0.025]} />
      </mesh>
      {/* Bag rounded top */}
      <mesh position={[0.08, 1.82, 0]} material={bagMat}>
        <sphereGeometry args={[0.050, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
      </mesh>
      {/* Drip tube */}
      <mesh position={[0.08, 1.57, 0.005]} material={new THREE.MeshStandardMaterial({ color: '#d1d5db', roughness: 0.7 })}>
        <cylinderGeometry args={[0.004, 0.004, 0.34, 6]} />
      </mesh>
    </group>
  );
}

// ─── Bedside Instrument Trolley ───────────────────────────────────────
function InstrumentTrolley({ position }: { position: [number, number, number] }) {
  const greyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d1d5db', metalness: 0.6, roughness: 0.35 }), []);
  const darkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#374151', roughness: 0.75 }), []);
  const blackMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.5 }), []);
  return (
    <group position={position}>
      {/* 2-shelf trolley */}
      <mesh position={[0, 0.78, 0]} material={greyMat} castShadow receiveShadow>
        <boxGeometry args={[0.48, 0.022, 0.38]} />
      </mesh>
      <mesh position={[0, 0.42, 0]} material={greyMat} receiveShadow>
        <boxGeometry args={[0.46, 0.018, 0.36]} />
      </mesh>
      {/* Posts */}
      {([-0.21, 0.21] as const).flatMap(x =>
        ([-0.16, 0.16] as const).map(z => (
          <mesh key={`${x}${z}`} position={[x, 0.40, z]} material={greyMat}>
            <cylinderGeometry args={[0.012, 0.012, 0.80, 8]} />
          </mesh>
        ))
      )}
      {/* Stethoscope */}
      <mesh position={[-0.10, 0.794, 0.06]} material={darkMat}>
        <torusGeometry args={[0.050, 0.006, 8, 22, Math.PI * 1.6]} />
      </mesh>
      <mesh position={[0.016, 0.794, 0.096]} rotation={[Math.PI/2, 0, 0]} material={darkMat}>
        <cylinderGeometry args={[0.006, 0.006, 0.14, 8]} />
      </mesh>
      <mesh position={[0.016, 0.794, 0.166]} material={new THREE.MeshStandardMaterial({ color: '#6b7280', metalness: 0.75, roughness: 0.25 })}>
        <cylinderGeometry args={[0.019, 0.019, 0.009, 14]} />
      </mesh>
      {/* Reflex hammer */}
      <mesh position={[0.12, 0.800, 0.02]} rotation={[0, 0.4, 0]} material={darkMat}>
        <capsuleGeometry args={[0.007, 0.175, 4, 8]} />
      </mesh>
      <mesh position={[0.135, 0.800, 0.072]} rotation={[0, 0.4, 0]} material={blackMat}>
        <boxGeometry args={[0.028, 0.038, 0.015]} />
      </mesh>
      {/* BP cuff coiled */}
      <mesh position={[0.08, 0.797, -0.08]}
        material={new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.7 })}>
        <torusGeometry args={[0.038, 0.012, 8, 16]} />
      </mesh>
      {/* Penlight */}
      <mesh position={[-0.14, 0.797, -0.07]} rotation={[0, 0, 0.3]}
        material={new THREE.MeshStandardMaterial({ color: '#374151', metalness: 0.7, roughness: 0.3 })}>
        <capsuleGeometry args={[0.006, 0.095, 4, 8]} />
      </mesh>
      {/* Wheels */}
      {([-0.20, 0.20] as const).flatMap(x =>
        ([-0.14, 0.14] as const).map(z => (
          <mesh key={`${x}${z}`} position={[x, 0.032, z]} material={blackMat}>
            <cylinderGeometry args={[0.032, 0.032, 0.020, 10]} />
          </mesh>
        ))
      )}
    </group>
  );
}

// ─── Clinician's stool ────────────────────────────────────────────────
function Stool({ position }: { position: [number, number, number] }) {
  const seatMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1e3a5f', roughness: 0.6 }), []);
  const legMat  = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.80, roughness: 0.20 }), []);
  return (
    <group position={position}>
      <mesh position={[0, 0.58, 0]} material={seatMat} castShadow>
        <cylinderGeometry args={[0.175, 0.165, 0.055, 18]} />
      </mesh>
      <mesh position={[0, 0.31, 0]} material={legMat} castShadow>
        <cylinderGeometry args={[0.022, 0.022, 0.58, 8]} />
      </mesh>
      {/* 5-star base */}
      {[0,72,144,216,288].map(angle => (
        <mesh key={angle} position={[
          Math.cos(angle * Math.PI/180) * 0.185, 0.036, Math.sin(angle * Math.PI/180) * 0.185
        ]} rotation={[0, -angle * Math.PI/180, 0]} material={legMat}>
          <boxGeometry args={[0.370, 0.018, 0.028]} />
        </mesh>
      ))}
      {/* Wheels on each arm */}
      {[0,72,144,216,288].map(angle => (
        <mesh key={`w${angle}`} position={[
          Math.cos(angle * Math.PI/180) * 0.350, 0.030, Math.sin(angle * Math.PI/180) * 0.350
        ]} material={new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 })}>
          <cylinderGeometry args={[0.026, 0.026, 0.022, 8]} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Wall-mounted panel (suction, oxygen outlets) ─────────────────────
function WallPanel({ position }: { position: [number, number, number] }) {
  const panelMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.75 }), []);
  const outletMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d1d5db', metalness: 0.7, roughness: 0.3 }), []);
  return (
    <group position={position}>
      <mesh material={panelMat} castShadow>
        <boxGeometry args={[0.40, 0.30, 0.052]} />
      </mesh>
      {/* Outlets: oxygen (green), air (black/white), vacuum (yellow) */}
      {[
        { x: -0.11, color: '#16a34a' },
        { x: 0.00,  color: '#d1d5db' },
        { x: 0.11,  color: '#ca8a04' },
      ].map((o, i) => (
        <mesh key={i} position={[o.x, 0, 0.032]}
          material={new THREE.MeshStandardMaterial({ color: o.color, metalness: 0.6, roughness: 0.3 })}>
          <cylinderGeometry args={[0.018, 0.018, 0.025, 12]} />
        </mesh>
      ))}
      {/* Label text placeholders */}
      <mesh position={[0, -0.095, 0.028]} material={panelMat}>
        <boxGeometry args={[0.36, 0.045, 0.006]} />
      </mesh>
    </group>
  );
}

// ─── Clinical Examination Room ────────────────────────────────────────
function ClinicalRoom() {
  // PBR materials
  const floorMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#c8cdd5', roughness: 0.82, metalness: 0.08,
  }), []);
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f5f5f4', roughness: 0.92,
  }), []);
  const ceilMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#fafafa', roughness: 0.98,
  }), []);
  const lightPanelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff', emissive: '#e0ecff', emissiveIntensity: 0.55, roughness: 0.95,
  }), []);
  const skirtMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#cbd5e1', roughness: 0.88,
  }), []);
  const windowFrameMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e2e8f0', roughness: 0.75,
  }), []);
  const glassMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#bfdbfe', transparent: true, opacity: 0.38, roughness: 0.04, metalness: 0.1,
  }), []);
  const cabinetMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f0f4f8', roughness: 0.70,
  }), []);
  const counterMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d4d4d4', roughness: 0.60, metalness: 0.12,
  }), []);
  const tileAMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d0d5dd', roughness: 0.84, metalness: 0.06 }), []);
  const tileBMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c4cad6', roughness: 0.84, metalness: 0.06 }), []);

  return (
    <group>
      {/* Floor — tiled */}
      <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.002, 0]} receiveShadow material={floorMat}>
        <planeGeometry args={[12, 12]} />
      </mesh>
      {/* Tile grid */}
      {[-3.75,-2.25,-0.75,0.75,2.25,3.75].flatMap((x, xi) =>
        [-3.75,-2.25,-0.75,0.75,2.25,3.75].map((z, zi) => (
          <mesh key={`t${xi}${zi}`} rotation={[-Math.PI/2, 0, 0]} position={[x, 0.001, z]} receiveShadow
            material={(xi+zi)%2===0 ? tileAMat : tileBMat}>
            <planeGeometry args={[1.48, 1.48]} />
          </mesh>
        ))
      )}

      {/* Walls — back */}
      <mesh position={[0, 2.4, -4.5]} receiveShadow material={wallMat}>
        <planeGeometry args={[12, 4.8]} />
      </mesh>
      {/* Left wall */}
      <mesh rotation={[0, Math.PI/2, 0]} position={[-4.5, 2.4, 0]} receiveShadow material={wallMat}>
        <planeGeometry args={[12, 4.8]} />
      </mesh>
      {/* Right wall */}
      <mesh rotation={[0, -Math.PI/2, 0]} position={[4.5, 2.4, 0]} receiveShadow material={wallMat}>
        <planeGeometry args={[12, 4.8]} />
      </mesh>
      {/* Ceiling */}
      <mesh rotation={[Math.PI/2, 0, 0]} position={[0, 4.8, 0]} material={ceilMat}>
        <planeGeometry args={[12, 12]} />
      </mesh>

      {/* Recessed ceiling light panels — 2 rows of 2 */}
      {([-1.5, 1.5] as const).flatMap(x => ([-1.2, 1.2] as const).map(z => (
        <mesh key={`lp${x}${z}`} position={[x, 4.76, z]} material={lightPanelMat}>
          <boxGeometry args={[0.90, 0.028, 0.70]} />
        </mesh>
      )))}

      {/* Skirting boards */}
      <mesh position={[0, 0.055, -4.46]} material={skirtMat}>
        <boxGeometry args={[12, 0.110, 0.055]} />
      </mesh>
      <mesh rotation={[0, Math.PI/2, 0]} position={[-4.46, 0.055, 0]} material={skirtMat}>
        <boxGeometry args={[12, 0.110, 0.055]} />
      </mesh>
      <mesh rotation={[0, -Math.PI/2, 0]} position={[4.46, 0.055, 0]} material={skirtMat}>
        <boxGeometry args={[12, 0.110, 0.055]} />
      </mesh>

      {/* Windows — back wall high windows like reference image */}
      {([-2.2, 0, 2.2] as const).map(x => (
        <group key={x} position={[x, 3.42, -4.42]}>
          {/* Frame */}
          <mesh material={windowFrameMat}>
            <boxGeometry args={[1.30, 0.88, 0.08]} />
          </mesh>
          {/* Glass */}
          <mesh position={[0, 0, 0.048]} material={glassMat}>
            <boxGeometry args={[1.24, 0.82, 0.010]} />
          </mesh>
          {/* Crossbar */}
          <mesh position={[0, 0, 0.058]} material={windowFrameMat}>
            <boxGeometry args={[1.24, 0.022, 0.014]} />
          </mesh>
        </group>
      ))}

      {/* Counter/workstation on left wall */}
      <mesh position={[-4.20, 0.88, -1.8]} material={counterMat} castShadow receiveShadow>
        <boxGeometry args={[0.60, 0.042, 2.20]} />
      </mesh>
      {/* Cabinets above counter */}
      <mesh position={[-4.26, 2.30, -1.8]} material={cabinetMat} castShadow>
        <boxGeometry args={[0.48, 0.90, 2.16]} />
      </mesh>
      {/* Cabinet doors */}
      {[-0.90, -0.30, 0.30, 0.90].map((z, i) => (
        <mesh key={i} position={[-4.03, 2.30, -1.8 + z]} material={new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.68 })}>
          <boxGeometry args={[0.005, 0.84, 0.52]} />
        </mesh>
      ))}
      {/* Cabinet handles */}
      {[-0.90, -0.30, 0.30, 0.90].map((z, i) => (
        <mesh key={i} position={[-4.02, 2.30, -1.8 + z + 0.18]}
          material={new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.8, roughness: 0.2 })}>
          <cylinderGeometry args={[0.008, 0.008, 0.075, 8]} />
        </mesh>
      ))}
      {/* Under counter cabinets */}
      <mesh position={[-4.24, 0.44, -1.8]} material={cabinetMat} castShadow>
        <boxGeometry args={[0.46, 0.88, 2.16]} />
      </mesh>
      {/* Sink */}
      <mesh position={[-4.16, 0.90, 1.6]} material={new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.3, roughness: 0.5 })}>
        <boxGeometry args={[0.45, 0.04, 0.48]} />
      </mesh>
      <mesh position={[-4.16, 0.76, 1.6]} material={new THREE.MeshStandardMaterial({ color: '#d1d5db', roughness: 0.6 })}>
        <boxGeometry args={[0.36, 0.28, 0.38]} />
      </mesh>

      {/* Door — right wall */}
      <mesh position={[4.42, 1.22, 2.2]} material={new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.75 })} castShadow>
        <boxGeometry args={[0.060, 2.44, 0.98]} />
      </mesh>
      <mesh position={[4.43, 1.22, 2.2]} material={new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.72 })}>
        <boxGeometry args={[0.04, 2.38, 0.92]} />
      </mesh>
      {/* Door handle */}
      <mesh position={[4.46, 1.1, 1.82]} material={new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.8, roughness: 0.2 })}>
        <capsuleGeometry args={[0.010, 0.095, 4, 8]} />
      </mesh>

      {/* Wall-mounted equipment panel on back wall */}
      <WallPanel position={[-1.8, 1.62, -4.40]} />
      <WallPanel position={[0, 1.62, -4.40]} />

      {/* Bulletin / notice board — back right */}
      <mesh position={[2.2, 2.2, -4.42]} material={new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.9 })} castShadow>
        <boxGeometry args={[1.30, 0.96, 0.028]} />
      </mesh>
      {/* Papers on board */}
      {[[-0.3, 0.15], [0.15, 0.15], [-0.3, -0.15], [0.15, -0.18]].map(([bx, by], i) => (
        <mesh key={i} position={[2.2 + bx, 2.2 + by, -4.40]}
          material={new THREE.MeshStandardMaterial({ color: '#fef9c3', roughness: 0.95 })}>
          <boxGeometry args={[0.20, 0.26, 0.008]} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Lighting Setup ───────────────────────────────────────────────────
function ClinicalLighting() {
  return (
    <>
      {/* Base ambient — clinical room, slightly warm */}
      <ambientLight intensity={0.52} color="#f4f0ee" />

      {/* Ceiling LED panels — 4 positions, bright white */}
      {([-1.4, 1.4] as const).flatMap(x => ([-1.0, 1.2] as const).map(z => (
        <pointLight key={`pl${x}${z}`} position={[x, 4.6, z]}
          intensity={2.2} color="#f8faff" distance={7.5} decay={2} />
      )))}

      {/* Primary key — overhead surgical light, casts clean shadows */}
      <directionalLight
        position={[0.8, 6.0, 1.8]} intensity={1.40} color="#fffef8"
        castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-left={-5} shadow-camera-right={5}
        shadow-camera-top={5} shadow-camera-bottom={-5}
        shadow-camera-near={0.5} shadow-camera-far={20}
        shadow-bias={-0.0006}
      />

      {/* Overhead surgical spotlight — focused on patient bed */}
      <spotLight
        position={[0, 5.0, 0.6]}
        angle={0.42} penumbra={0.55}
        intensity={2.20} color="#fff9f0"
        castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-bias={-0.001}
        distance={9} decay={1.8}
      />

      {/* Second surgical spot — slightly offset, fills face shadows */}
      <spotLight
        position={[-0.6, 4.6, 1.2]}
        angle={0.45} penumbra={0.65}
        intensity={1.20} color="#fffbf2"
        distance={8} decay={1.8}
      />

      {/* Window daylight — cool blue from back windows */}
      <directionalLight position={[0, 3.0, -6]} intensity={0.42} color="#dbeeff" />

      {/* Warm right fill — counteracts blue window, brings life to skin */}
      <directionalLight position={[5, 2.5, 2]} intensity={0.38} color="#fff0d8" />

      {/* Subtle bounce from floor */}
      <hemisphereLight args={["#f0f4ff", "#d8ccc0", 0.28]} />
    </>
  );
}

// ─── Main Scene ───────────────────────────────────────────────────────
function Scene({ patient, onRegionClick, selectedRegion, activeInstrument, onInstrumentSelect, patientState, activeCategory }: SimulationRoomProps) {
  const isSupine = patient.position === 'supine' || patient.position === 'semi_recumbent';
  const isSemiRecumbent = patient.position === 'semi_recumbent';
  const patientY = isSupine ? 0.54 : 1.10;
  const controlsRef = useRef<any>(null);

  return (
    <>
      <ClinicalLighting />
      <ClinicalRoom />

      {/* Examination bed — centred in room */}
      <ClinicalBed supine={isSemiRecumbent} />

      {/* Vital signs monitor — left of bed */}
      <VitalSignsMonitor position={[-1.35, 0, 0.30]} />

      {/* IV pole — left head of bed */}
      <IVPole position={[-1.10, 0, -0.80]} />

      {/* Instrument trolley — right of bed */}
      <InstrumentTrolley position={[1.22, 0, 0.20]} />

      {/* Clinician stool */}
      <Stool position={[1.35, 0, -0.60]} />

      {/* Patient avatar with body regions */}
      <group position={[0, patientY, 0]}>
        <RealisticPatient
          sex={patient.sex}
          position={patient.position as PatientPosition}
          patientState={patientState ?? 'neutral'}
          age={patient.age}
        />
        <BodyRegions
          selectedRegion={selectedRegion}
          activeCategory={activeCategory}
          onRegionClick={onRegionClick}
        />
      </group>

      {/* Soft contact shadow on floor/bed */}
      <ContactShadows
        position={[0, 0.005, 0]}
        opacity={0.32} scale={8} blur={2.8} far={1.8}
        color="#4a4a5a"
      />

      <OrbitControls
        ref={controlsRef}
        enablePan={true}
        panSpeed={0.5}
        minDistance={0.6}
        maxDistance={5.5}
        minPolarAngle={Math.PI / 16}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 0.85, 0]}
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.70}
        zoomSpeed={0.90}
      />

      <CameraRig selectedRegion={selectedRegion} controlsRef={controlsRef} />
    </>
  );
}

// ─── Export ───────────────────────────────────────────────────────────
export function SimulationRoom(props: SimulationRoomProps) {
  return (
    <div className="w-full h-full" style={{ minHeight: '420px' }}>
      <Canvas
        camera={{ position: [0, 1.65, 2.90], fov: 44 }}
        shadows="soft"
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.08,
        }}
        dpr={[1, 1.5]}
        style={{ background: '#c8d4e0' }}
      >
        <Suspense fallback={null}>
          <Scene {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}
