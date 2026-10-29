'use client';
/**
 * BodyRegions — subtle anatomical examination zones.
 * NO giant red/coloured boxes.
 * Uses soft glow outlines that follow the patient anatomy.
 */
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

export interface RegionDef {
  key: string;
  label: string;
  methods: string[];
  // position relative to patient group centre
  position: [number,number,number];
  // thin hitbox size — much smaller than before
  size: [number,number,number];
  category: 'general'|'cardiovascular'|'respiratory'|'abdominal'|'neurological'|'limb';
}

// All positions tuned for the procedural patient's actual anatomy
export const BODY_REGIONS: RegionDef[] = [
  // Head/Face
  { key:'face',         label:'Face',             position:[0,0.195,0.11],  size:[0.22,0.14,0.10], methods:['inspect'],               category:'general' },
  { key:'eyes',         label:'Eyes / Pupils',    position:[0,0.205,0.10],  size:[0.14,0.06,0.08], methods:['inspect'],               category:'general' },
  { key:'tongue',       label:'Oral Cavity',      position:[0,0.172,0.11],  size:[0.12,0.06,0.08], methods:['inspect'],               category:'general' },
  // Neck
  { key:'jvp',          label:'JVP',              position:[-0.06,0.132,0.05],size:[0.08,0.10,0.08], methods:['inspect'],             category:'cardiovascular' },
  { key:'carotid',      label:'Carotid',          position:[0.06,0.132,0.05], size:[0.08,0.10,0.08], methods:['palpate','auscultate'],category:'cardiovascular' },
  { key:'lymph_nodes',  label:'Lymph Nodes',      position:[0,0.128,0.06],  size:[0.28,0.10,0.10], methods:['palpate'],               category:'general' },
  // General surface
  { key:'general',      label:'General',          position:[0,0.040,0.13],  size:[0.34,0.30,0.08], methods:['inspect'],               category:'general' },
  { key:'pallor',       label:'Pallor',           position:[0,0.030,0.13],  size:[0.28,0.14,0.08], methods:['inspect'],               category:'general' },
  { key:'jaundice',     label:'Jaundice',         position:[-0.14,0.205,0.10],size:[0.10,0.06,0.06],methods:['inspect'],              category:'general' },
  { key:'cyanosis',     label:'Cyanosis',         position:[0,0.175,0.11],  size:[0.14,0.06,0.06], methods:['inspect'],               category:'general' },
  { key:'clubbing',     label:'Clubbing',         position:[-0.30,-0.08,0.02],size:[0.10,0.08,0.08],methods:['inspect'],              category:'general' },
  { key:'nails',        label:'Nails',            position:[-0.32,-0.10,0.02],size:[0.10,0.06,0.06],methods:['inspect'],              category:'general' },
  { key:'edema',        label:'Oedema',           position:[0,-0.55,0.05],  size:[0.28,0.10,0.14], methods:['inspect','palpate'],      category:'general' },
  // Arms
  { key:'left_arm',     label:'Left Arm',         position:[-0.26,0.00,0.04],size:[0.14,0.44,0.14], methods:['inspect','palpate'],    category:'cardiovascular' },
  { key:'right_arm',    label:'Right Arm / BP',   position:[0.26,0.00,0.04], size:[0.14,0.44,0.14], methods:['inspect','palpate','measure'], category:'cardiovascular' },
  // Chest / Cardiac
  { key:'chest',        label:'Chest',            position:[0,0.055,0.14],  size:[0.38,0.26,0.08], methods:['inspect','palpate','percuss','auscultate'], category:'respiratory' },
  { key:'precordium',   label:'Precordium',       position:[-0.05,0.030,0.14],size:[0.20,0.22,0.08],methods:['inspect','palpate','auscultate'], category:'cardiovascular' },
  { key:'aortic',       label:'Aortic Area',      position:[0.09,0.165,0.14],size:[0.08,0.08,0.06], methods:['auscultate'],           category:'cardiovascular' },
  { key:'pulmonary',    label:'Pulmonary Area',   position:[-0.09,0.165,0.14],size:[0.08,0.08,0.06],methods:['auscultate'],           category:'cardiovascular' },
  { key:'tricuspid',    label:'Tricuspid',        position:[0.04,0.022,0.14],size:[0.08,0.08,0.06], methods:['auscultate'],           category:'cardiovascular' },
  { key:'mitral',       label:'Mitral Area',      position:[-0.10,-0.010,0.14],size:[0.08,0.08,0.06],methods:['auscultate'],          category:'cardiovascular' },
  { key:'lungs',        label:'Lung Fields',      position:[0,0.055,0.14],  size:[0.42,0.28,0.08], methods:['inspect','palpate','percuss','auscultate'], category:'respiratory' },
  { key:'posterior_chest',label:'Posterior Chest',position:[0,0.055,-0.14], size:[0.40,0.28,0.06], methods:['inspect','palpate','percuss','auscultate'], category:'respiratory' },
  // Abdomen
  { key:'abdomen',      label:'Abdomen',          position:[0,-0.120,0.14], size:[0.36,0.22,0.08], methods:['inspect','palpate','percuss','auscultate'], category:'abdominal' },
  { key:'liver',        label:'Liver',            position:[0.11,-0.095,0.14],size:[0.16,0.14,0.08],methods:['palpate','percuss'],     category:'abdominal' },
  { key:'spleen',       label:'Spleen',           position:[-0.13,-0.095,0.14],size:[0.14,0.14,0.08],methods:['palpate','percuss'],   category:'abdominal' },
  { key:'ascites',      label:'Ascites',          position:[0,-0.145,0.14], size:[0.36,0.20,0.08], methods:['palpate','percuss'],      category:'abdominal' },
  // Legs
  { key:'legs',         label:'Legs',             position:[0,-0.435,0.06], size:[0.30,0.44,0.16], methods:['inspect','palpate'],      category:'general' },
  { key:'foot_pulses',  label:'Foot Pulses',      position:[0,-0.620,0.06], size:[0.20,0.08,0.14], methods:['palpate'],               category:'cardiovascular' },
  // Neuro
  { key:'neurological', label:'Neurological',     position:[0,0.040,0.14],  size:[0.40,0.60,0.08], methods:['inspect','assess'],       category:'neurological' },
  { key:'cranial_nerves',label:'Cranial Nerves',  position:[0,0.192,0.10],  size:[0.26,0.18,0.08], methods:['inspect','assess'],       category:'neurological' },
  { key:'motor',        label:'Motor System',     position:[0,-0.040,0.14], size:[0.40,0.38,0.10], methods:['inspect','palpate','assess'], category:'neurological' },
  { key:'reflexes',     label:'Reflexes',         position:[0,-0.380,0.10], size:[0.34,0.38,0.16], methods:['assess'],                category:'neurological' },
];

// Colour per category — soft pastels, not harsh red
const CAT_COLOR: Record<string, string> = {
  general:       '#38bdf8',  // sky blue
  cardiovascular:'#f87171',  // soft red
  respiratory:   '#34d399',  // green
  abdominal:     '#fbbf24',  // amber
  neurological:  '#a78bfa',  // violet
  limb:          '#22d3ee',  // cyan
};

function RegionZone({ def, isSelected, onHover, onSelect, hoveredKey }: {
  def: RegionDef;
  isSelected: boolean;
  hoveredKey: string | null;
  onHover: (k: string | null) => void;
  onSelect: (k: string) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const isHov = hoveredKey === def.key;
  const color = CAT_COLOR[def.category] ?? '#38bdf8';

  useFrame(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    // Only glow on hover or selection — completely invisible otherwise
    const target = isSelected ? 0.38 : isHov ? 0.22 : 0;
    mat.opacity = THREE.MathUtils.lerp(mat.opacity, target, 0.18);
    mat.emissiveIntensity = isSelected ? 0.55 : isHov ? 0.35 : 0;
  });

  return (
    <group position={def.position}>
      <mesh
        ref={meshRef}
        onClick={e => { e.stopPropagation(); onSelect(def.key); }}
        onPointerOver={e => { e.stopPropagation(); onHover(def.key); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = 'default'; }}
      >
        <boxGeometry args={def.size} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0}
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Label — only show on hover or selection, NOT interactive (no pointer capture) */}
      {(isHov || isSelected) && (
        <>
          <Text
            position={[0, def.size[1] / 2 + 0.055, 0.01]}
            fontSize={0.055}
            color={isSelected ? '#ffffff' : color}
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.008}
            outlineColor={isSelected ? '#1d4ed8' : '#000000'}
            renderOrder={100}
            raycast={() => null}
          >
            {def.label}
          </Text>
          {isHov && !isSelected && (
            <Text
              position={[0, def.size[1] / 2 + 0.010, 0.01]}
              fontSize={0.036}
              color="#94a3b8"
              anchorX="center"
              anchorY="top"
              outlineWidth={0.005}
              outlineColor="#000000"
              renderOrder={100}
              raycast={() => null}
            >
              {def.methods.join(' · ')}
            </Text>
          )}
        </>
      )}

      {/* Soft glow ring on selected */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[
            Math.max(def.size[0], def.size[1]) * 0.48,
            Math.max(def.size[0], def.size[1]) * 0.52,
            32
          ]} />
          <meshBasicMaterial color={color} transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

interface BodyRegionsProps {
  selectedRegion: string | null;
  activeCategory?: string | null;
  onRegionClick: (key: string) => void;
}

export function BodyRegions({ selectedRegion, activeCategory, onRegionClick }: BodyRegionsProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const visible = activeCategory
    ? BODY_REGIONS.filter(r => r.category === activeCategory || r.key === selectedRegion)
    : BODY_REGIONS;

  return (
    <group>
      {visible.map(def => (
        <RegionZone
          key={def.key}
          def={def}
          isSelected={selectedRegion === def.key}
          hoveredKey={hoveredKey}
          onHover={setHoveredKey}
          onSelect={onRegionClick}
        />
      ))}
    </group>
  );
}
