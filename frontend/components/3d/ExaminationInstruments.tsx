'use client';
/**
 * ExaminationInstruments — 3D instrument tray visible in simulation.
 * Student selects instrument → it activates → used on body region → triggers finding.
 */
import { useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

export type InstrumentType =
  | 'stethoscope' | 'bp_cuff' | 'thermometer'
  | 'pulse_oximeter' | 'reflex_hammer' | 'penlight'
  | 'tape_measure' | 'none';

export interface InstrumentDef {
  id: InstrumentType;
  label: string;
  icon: string;
  color: string;
  applicableRegions: string[];
  applicableMethods: string[];
}

export const INSTRUMENTS: InstrumentDef[] = [
  {
    id: 'stethoscope', label: 'Stethoscope', icon: '', color: '#1a1a2e',
    applicableRegions: ['chest','precordium','lungs','abdomen','posterior_chest','aortic','pulmonary','tricuspid','mitral','carotid'],
    applicableMethods: ['auscultate'],
  },
  {
    id: 'bp_cuff', label: 'BP Cuff', icon: '', color: '#1e3a5f',
    applicableRegions: ['right_arm','left_arm','blood_pressure'],
    applicableMethods: ['measure'],
  },
  {
    id: 'thermometer', label: 'Thermometer', icon: '🌡️', color: '#dc2626',
    applicableRegions: ['temperature','general'],
    applicableMethods: ['measure'],
  },
  {
    id: 'pulse_oximeter', label: 'Pulse Oximeter', icon: '📡', color: '#7c3aed',
    applicableRegions: ['oxygen_saturation','right_arm','left_arm','nails'],
    applicableMethods: ['measure'],
  },
  {
    id: 'reflex_hammer', label: 'Reflex Hammer', icon: '🔨', color: '#b45309',
    applicableRegions: ['reflexes','neurological','motor'],
    applicableMethods: ['assess'],
  },
  {
    id: 'penlight', label: 'Penlight', icon: '', color: '#374151',
    applicableRegions: ['eyes','cranial_nerves','tongue','face'],
    applicableMethods: ['inspect'],
  },
  {
    id: 'tape_measure', label: 'Tape Measure', icon: '📏', color: '#d97706',
    applicableRegions: ['bmi','abdomen','limbs','legs'],
    applicableMethods: ['measure'],
  },
];

export function getRequiredInstrument(region: string, method: string): InstrumentType | null {
  for (const inst of INSTRUMENTS) {
    if (inst.applicableRegions.includes(region) && inst.applicableMethods.includes(method)) {
      return inst.id;
    }
  }
  return null;
}

// 3D Stethoscope model in scene
function Stethoscope3D({ position, active }: { position: [number,number,number]; active: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current && active) {
      ref.current.rotation.z = Math.sin(clock.getElapsedTime() * 2) * 0.05;
    }
  });
  return (
    <group ref={ref} position={position}>
      <mesh>
        <torusGeometry args={[0.055, 0.007, 8, 24, Math.PI * 1.6]} />
        <meshStandardMaterial color={active ? '#3b82f6' : '#1a1a2e'} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.028]} rotation={[Math.PI/2,0,0]}>
        <cylinderGeometry args={[0.007, 0.007, 0.16, 8]} />
        <meshStandardMaterial color={active ? '#3b82f6' : '#1a1a2e'} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.108]}>
        <cylinderGeometry args={[0.022, 0.022, 0.010, 16]} />
        <meshStandardMaterial color={active ? '#60a5fa' : '#374151'} metalness={0.8} roughness={0.2} />
      </mesh>
      {active && (
        <Text position={[0, 0.10, 0]} fontSize={0.040} color="#3b82f6" anchorX="center" outlineWidth={0.004} outlineColor="#fff">
          Active
        </Text>
      )}
    </group>
  );
}

// Instrument tray — sits to the right of the patient bed
export function InstrumentTray({
  activeInstrument, onSelect,
}: {
  activeInstrument: InstrumentType;
  onSelect: (id: InstrumentType) => void;
}) {
  return (
    <group position={[1.85, 0.82, 0.20]}>
      {/* Tray surface */}
      <mesh receiveShadow>
        <boxGeometry args={[0.30, 0.012, 0.80]} />
        <meshStandardMaterial color="#c0bdb0" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* 3D stethoscope on tray */}
      <Stethoscope3D position={[0, 0.016, 0.22]} active={activeInstrument === 'stethoscope'} />

      {/* BP cuff */}
      <group position={[0, 0.016, -0.10]}>
        <mesh>
          <boxGeometry args={[0.10, 0.025, 0.055]} />
          <meshStandardMaterial color={activeInstrument === 'bp_cuff' ? '#3b82f6' : '#1e3a5f'} roughness={0.7} />
        </mesh>
      </group>

      {/* Thermometer */}
      <group position={[0.08, 0.016, 0.05]}>
        <mesh>
          <capsuleGeometry args={[0.006, 0.080, 4, 8]} />
          <meshStandardMaterial color={activeInstrument === 'thermometer' ? '#f87171' : '#dc2626'} roughness={0.4} />
        </mesh>
      </group>

      {/* Reflex hammer */}
      <group position={[-0.08, 0.016, -0.25]} rotation={[0,0.3,0]}>
        <mesh>
          <capsuleGeometry args={[0.008, 0.160, 4, 8]} />
          <meshStandardMaterial color={activeInstrument === 'reflex_hammer' ? '#fbbf24' : '#92400e'} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.095, 0]}>
          <boxGeometry args={[0.032, 0.040, 0.018]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
        </mesh>
      </group>

      {/* Active indicator ring */}
      {INSTRUMENTS.map((inst, i) => (
        <mesh
          key={inst.id}
          position={[0, 0.025, -0.32 + i * 0.10]}
          onClick={e => { e.stopPropagation(); onSelect(inst.id); }}
          onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = 'default'; }}
        >
          <boxGeometry args={[0.28, 0.002, 0.090]} />
          <meshStandardMaterial
            color={activeInstrument === inst.id ? '#3b82f6' : '#e2e8f0'}
            transparent opacity={0.0}
          />
        </mesh>
      ))}

      {/* Tray label */}
      <Text position={[0, 0.04, 0.38]} fontSize={0.030} color="#64748b" anchorX="center" rotation={[-Math.PI/2,0,0]}>
        Instruments
      </Text>
    </group>
  );
}
