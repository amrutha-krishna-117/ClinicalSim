'use client';
/**
 * RealisticPatient v7 — ZERO box geometry.
 * Everything is spheres + capsules + torus. No blocks, no rectangles.
 * Full 7-layer human animation system.
 */
import { useRef, useMemo, Suspense, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PoseName } from '@/lib/poseMath';
import { usePoseRef } from './usePose';

export type PatientPosition = 'sitting' | 'supine' | 'semi_recumbent' | 'standing';
export type PatientState    = 'neutral' | 'anxious' | 'painful' | 'breathless' | 'comfortable';

interface Props {
  sex?: 'male' | 'female' | string;
  position?: PatientPosition;
  patientState?: PatientState;
  age?: number;
  glbUrl?: string;
}

function useMat(c:string,r=0.68,m=0,e='#000',ei=0) {
  return useMemo(()=>new THREE.MeshStandardMaterial({
    color:new THREE.Color(c),roughness:r,metalness:m,
    emissive:new THREE.Color(e),emissiveIntensity:ei,
  }),[c,r,m,e,ei]);
}

function makeGownMaterial() {
  let map: THREE.CanvasTexture | undefined;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#eaf0f1';
      ctx.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 12) for (let x = 0; x < 128; x += 12) {
        ctx.fillStyle = 'rgba(91, 121, 139, 0.24)';
        ctx.beginPath(); ctx.arc(x + 5.5, y + 5.5, 1.35, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.52)'; ctx.fillRect(x + 3, y + 2, 0.7, 6.5);
      }
      map = new THREE.CanvasTexture(canvas);
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(8, 7);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
    }
  }
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.93, metalness: 0 });
  if (map) material.map = map;
  return material;
}

/* Sphere — high poly, perfectly round */
function S({r,mat,p,s,rot}:{r:number;mat:THREE.Material;p?:[number,number,number];s?:[number,number,number];rot?:[number,number,number]}) {
  return <mesh material={mat} position={p} scale={s} rotation={rot} castShadow><sphereGeometry args={[r,56,44]}/></mesh>;
}

/* Capsule — smooth cylinder with round ends */
function C({r,l,mat,p,rot,s}:{r:number;l:number;mat:THREE.Material;p?:[number,number,number];rot?:[number,number,number];s?:[number,number,number]}) {
  return <mesh material={mat} position={p} rotation={rot} scale={s} castShadow><capsuleGeometry args={[r,l,18,40]}/></mesh>;
}

/** A single softly contoured chest-to-pelvis surface, in the patient-local frame. */
function createTorsoGeometry() {
  const profile = [
    [-0.63, 0.001, 0.001], [-0.59, 0.158, 0.122], [-0.52, 0.166, 0.132],
    [-0.39, 0.154, 0.128], [-0.25, 0.146, 0.124], [-0.11, 0.137, 0.115],
    [-0.01, 0.140, 0.117], [0.09, 0.155, 0.123], [0.17, 0.164, 0.116],
    [0.23, 0.136, 0.093], [0.29, 0.075, 0.067],
    [0.33, 0.001, 0.001],
  ];
  const rows = 48, columns = 48;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const sample = (t: number, channel: number) => {
    const scaled = t * (profile.length - 1);
    const i = Math.min(profile.length - 2, Math.floor(scaled));
    const f = scaled - i;
    const p0 = profile[Math.max(0, i - 1)][channel];
    const p1 = profile[i][channel], p2 = profile[i + 1][channel];
    const p3 = profile[Math.min(profile.length - 1, i + 2)][channel];
    return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2*p0 - 5*p1 + 4*p2 - p3) * f*f + (-p0 + 3*p1 - 3*p2 + p3) * f*f*f);
  };

  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const y = sample(t, 0), rx = Math.max(0.001, sample(t, 1)), rz = Math.max(0.001, sample(t, 2));
    for (let col = 0; col <= columns; col++) {
      const a = (col / columns) * Math.PI * 2;
      positions.push(Math.cos(a) * rx, y, Math.sin(a) * rz);
      uvs.push(col / columns, 1 - t);
      if (row < rows && col < columns) {
        const n = row * (columns + 1) + col;
        indices.push(n, n + columns + 1, n + 1, n + 1, n + columns + 1, n + columns + 2);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function TorsoMesh({material}:{material:THREE.Material}) {
  const geometry = useMemo(createTorsoGeometry, []);
  return <mesh name="PatientGownTorso" geometry={geometry} material={material} castShadow receiveShadow />;
}

function Sleeve({material}:{material:THREE.Material}) {
  const geometry = useMemo(() => {
    const rows = 24, columns = 32;
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let row = 0; row <= rows; row++) {
      const t = row / rows, y = -0.22 * t;
      const r = 0.067 - 0.011 * t + Math.sin(t * Math.PI) * 0.006;
      for (let col = 0; col <= columns; col++) {
        const a = col / columns * Math.PI * 2;
        positions.push(Math.cos(a) * r, y, Math.sin(a) * r * 0.86);
        uvs.push(col / columns, 1 - t);
        if (row < rows && col < columns) {
          const n = row * (columns + 1) + col;
          indices.push(n, n + columns + 1, n + 1, n + 1, n + columns + 1, n + columns + 2);
        }
      }
    }
    const mesh = new THREE.BufferGeometry();
    mesh.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    mesh.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    mesh.setIndex(indices);
    mesh.computeVertexNormals();
    return mesh;
  }, []);
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}

/* Torus — ring shape for collar */
function T({R,r,mat,p,rot}:{R:number;r:number;mat:THREE.Material;p?:[number,number,number];rot?:[number,number,number]}) {
  return <mesh material={mat} position={p} rotation={rot} castShadow><torusGeometry args={[R,r,14,40]}/></mesh>;
}

function Face({skin,darkSkin,hair,lip,sex,eyelidL,eyelidR,gazeGrp,mouthRef,tongueRef}:{
  mouthRef:React.RefObject<THREE.Group|null>;tongueRef:React.RefObject<THREE.Group|null>;
  skin:THREE.Material;darkSkin:THREE.Material;hair:THREE.Material;lip:THREE.Material;
  sex:string;
  eyelidL:React.RefObject<THREE.Mesh|null>;eyelidR:React.RefObject<THREE.Mesh|null>;
  gazeGrp:React.RefObject<THREE.Group|null>;
}) {
  const scleraMat = useMat('#edeae4',0.08);
  const irisMat   = useMat('#3a5c2a',0.06);
  const pupilMat  = useMat('#080808',0.04);
  const catchMat  = useMat('#ffffff',0.0,0,'#ffffff',5.0);
  const cavity    = useMat('#2a0d10',0.9);
  const teethM    = useMat('#f3efe6',0.4);
  const tongueM   = useMat('#c4545e',0.6);
  const noseTip   = useMat('#b87045',0.70);

  return (
    <group>
      {/* Skull — layered spheres */}
      <S r={0.108} mat={skin}/>
      <S r={0.104} mat={skin} p={[0,0.016,-0.004]}/>
      <S r={0.076} mat={skin} p={[0,0.058,0.054]}/>
      <S r={0.050} mat={skin} p={[-0.086,0.010,0.026]}/>
      <S r={0.050} mat={skin} p={[0.086,0.010,0.026]}/>
      <S r={0.040} mat={skin} p={[-0.078,0.008,0.070]}/>
      <S r={0.040} mat={skin} p={[0.078,0.008,0.070]}/>
      <S r={0.084} mat={skin} p={[0,-0.066,0.008]} s={[1,0.80,0.90]}/>
      <S r={0.032} mat={skin} p={[0,-0.092,0.070]} s={[0.9,0.80,1.0]}/>

      {/* Hair */}
      {sex==='female' ? (
        <group>
          <mesh material={hair} position={[0,0.024,-0.014]} castShadow>
            <sphereGeometry args={[0.114,44,24,0,Math.PI*2,0,Math.PI*0.54]}/>
          </mesh>
          <C r={0.022} l={0.145} mat={hair} p={[-0.095,-0.048,0.010]} rot={[0,0,0.12]}/>
          <C r={0.022} l={0.145} mat={hair} p={[0.095,-0.048,0.010]} rot={[0,0,-0.12]}/>
        </group>
      ):(
        <group>
          <mesh material={hair} position={[0,0.016,-0.014]} castShadow>
            <sphereGeometry args={[0.111,48,24,0,Math.PI*2,0,Math.PI*0.44]}/>
          </mesh>
          <S r={0.070} mat={hair} p={[-0.090,-0.006,-0.012]} s={[0.44,0.62,0.72]}/>
          <S r={0.070} mat={hair} p={[0.090,-0.006,-0.012]} s={[0.44,0.62,0.72]}/>
        </group>
      )}

      {/* Brow ridge — two rounded spheres, NOT a box */}
      <S r={0.022} mat={darkSkin} p={[-0.040,0.046,0.090]} s={[2.2,0.60,0.80]}/>
      <S r={0.022} mat={darkSkin} p={[0.040,0.046,0.090]} s={[2.2,0.60,0.80]}/>
      {/* Eyebrows */}
      <C r={0.0058} l={0.034} mat={hair} p={[-0.040,0.058,0.095]} rot={[Math.PI/2,0,-0.15]} s={[1,0.24,1]}/>
      <C r={0.0058} l={0.034} mat={hair} p={[0.040,0.058,0.095]} rot={[Math.PI/2,0,0.15]} s={[1,0.24,1]}/>

      {/* Eyes with gaze */}
      <group ref={gazeGrp}>
        {[-1,1].map(s=>(
          <group key={s} position={[s*0.038,0.020,0.090]}>
            <S r={0.026} mat={darkSkin} p={[0,0,-0.006]}/>
            <S r={0.021} mat={scleraMat}/>
            <mesh material={irisMat} position={[0,0,0.016]}><circleGeometry args={[0.013,28]}/></mesh>
            <mesh material={pupilMat} position={[0,0,0.018]}><circleGeometry args={[0.007,20]}/></mesh>
            <mesh position={[s*0.003,0.005,0.020]}><circleGeometry args={[0.003,8]}/><primitive object={catchMat} attach="material"/></mesh>
            <mesh ref={s===-1?eyelidL:eyelidR} position={[0,0.012,0.017]} rotation={[0.30,0,0]} scale={[1.12,0.36,0.72]}>
              <sphereGeometry args={[0.020,18,14]}/>
              <primitive object={skin} attach="material"/>
            </mesh>
            <S r={0.018} mat={skin} p={[0,-0.012,0.016]} s={[1.10,0.30,0.64]} rot={[-0.20,0,0]}/>
          </group>
        ))}
      </group>

      {/* Nose */}
      <group position={[0,-0.004,0.102]}>
        <C r={0.010} l={0.034} mat={skin} p={[0,0.040,-0.004]}/>
        <S r={0.022} mat={noseTip} p={[0,0.004,0.010]}/>
        <S r={0.013} mat={skin} p={[-0.020,-0.002,0.006]}/>
        <S r={0.013} mat={skin} p={[0.020,-0.002,0.006]}/>
        <S r={0.008} mat={darkSkin} p={[-0.011,-0.012,0.014]}/>
        <S r={0.008} mat={darkSkin} p={[0.011,-0.012,0.014]}/>
        <C r={0.008} l={0.012} mat={skin} p={[0,-0.006,0.014]}/>
      </group>

      {/* Open mouth + tongue: shown only when the doctor asks the patient to open wide */}
      <group ref={mouthRef} position={[0,-0.050,0.100]} visible={false}>
        <S r={0.020} mat={cavity} s={[1.35,1,0.35]}/>
        <S r={0.018} mat={teethM} p={[0,0.011,0.005]} s={[1.15,0.22,0.3]}/>
      </group>
      <group ref={tongueRef} position={[0,-0.058,0.098]} visible={false}>
        <C r={0.011} l={0.028} mat={tongueM} rot={[Math.PI/2,0,0]}/>
      </group>

      {/* Lips */}
      <group position={[0,-0.048,0.096]}>
        <C r={0.006} l={0.012} mat={skin} p={[0,0.018,-0.002]}/>
        <C r={0.0095} l={0.046} mat={lip}/>
        <S r={0.010} mat={lip} p={[-0.013,0.009,0.003]} s={[0.72,0.65,1]}/>
        <S r={0.010} mat={lip} p={[0.013,0.009,0.003]} s={[0.72,0.65,1]}/>
        <C r={0.012} l={0.040} mat={lip} p={[0,-0.010,0.004]} s={[1,0.80,1]}/>
        <S r={0.006} mat={darkSkin} p={[-0.030,-0.001,0.002]}/>
        <S r={0.006} mat={darkSkin} p={[0.030,-0.001,0.002]}/>
        <C r={0.003} l={0.038} mat={darkSkin} p={[0,-0.001,0.007]} rot={[0,0,Math.PI/2]}/>
      </group>

      {/* Ears */}
      {[-1,1].map(s=>(
        <group key={s} position={[s*0.110,0.000,0.002]}>
          <S r={0.028} mat={skin}/>
          <S r={0.018} mat={skin} p={[s*0.003,0.006,0.002]}/>
          <C r={0.008} l={0.016} mat={skin} p={[0,-0.014,0.004]}/>
          <S r={0.014} mat={darkSkin} p={[s*0.002,0,0.008]}/>
        </group>
      ))}

    </group>
  );
}

function Hand({mat,side}:{mat:THREE.Material;side:1|-1}) {
  const nailMat = useMat('#e8cdb0',0.28,0.04);
  const lengths=[0.056,0.066,0.062,0.050];
  return (
    <group>
      <S r={0.034} mat={mat} s={[1.20,0.64,0.50]}/>
      <S r={0.026} mat={mat} p={[0,0.020,0]} s={[1.0,0.55,0.44]}/>
      {[-0.018,-0.006,0.006,0.018].map((fx,i)=>(<S key={i} r={0.008} mat={mat} p={[fx,0.030,0.006]}/>))}
      {[-0.018,-0.006,0.006,0.018].map((fx,i)=>{
        const L=lengths[i];
        return (
          <group key={i} position={[fx,-0.046,0]}>
            <C r={0.007} l={L*0.36} mat={mat}/>
            <group position={[0,-(L*0.40),0]}>
              <C r={0.006} l={L*0.30} mat={mat}/>
              <group position={[0,-(L*0.32),0]}>
                <C r={0.005} l={L*0.24} mat={mat}/>
                <S r={0.006} mat={nailMat} p={[0,-(L*0.12),0.004]} s={[1.2,0.55,0.35]}/>
              </group>
            </group>
          </group>
        );
      })}
      <group position={[side*0.032,-0.016,0.004]} rotation={[0.1,0,side*0.54]}>
        <C r={0.0075} l={0.024} mat={mat}/>
        <group position={[0,-0.028,0]}>
          <C r={0.0066} l={0.020} mat={mat}/>
          <S r={0.007} mat={nailMat} p={[0,-0.014,0.004]} s={[1.2,0.5,0.3]}/>
        </group>
      </group>
    </group>
  );
}

export function ProceduralPatient({sex,position,patientState,pose='rest',children}:{sex:string;position:PatientPosition;patientState:PatientState;age:number;pose?:PoseName;children?:React.ReactNode}) {
  const isFemale=sex==='female';
  const poseRef=usePoseRef(pose);
  const armRefs=useRef<(THREE.Group|null)[]>([null,null]);
  const mouthRef=useRef<THREE.Group>(null);
  const tongueRef=useRef<THREE.Group>(null);
  const skin      = useMat('#c58b78',0.70,0,'#170706',0.02);
  const darkSkin  = useMat('#945d50',0.76);
  const hair      = useMat('#2b211d',0.92);
  const lip       = useMat(isFemale?'#b85060':'#a85050',0.48);
  const gownMain  = useMemo(makeGownMaterial, []);
  const gownTie   = useMat('#3a78a4',0.82);
  const legSkin   = useMat('#c58b78',0.72,0,'#170706',0.02);
  const ivTape    = useMat('#f0e0c4',0.82);
  const ivTube    = useMat('#d0eaf8',0.28);

  const rootRef=useRef<THREE.Group>(null);
  const torsoRef=useRef<THREE.Group>(null);
  const shoulderLRef=useRef<THREE.Group>(null);
  const shoulderRRef=useRef<THREE.Group>(null);
  const neckRef=useRef<THREE.Group>(null);
  const headRef=useRef<THREE.Group>(null);
  const gazeRef=useRef<THREE.Group>(null);
  const eyelidLRef=useRef<THREE.Mesh>(null);
  const eyelidRRef=useRef<THREE.Mesh>(null);
  const handLRef=useRef<THREE.Group>(null);
  const blinkSt=useRef({next:3.5+Math.random()*2,phase:0 as 0|1|2,t:0});
  const winceSt=useRef({next:5+Math.random()*4,active:false,t:0});

  const P=useMemo(()=>{
    const m:Record<PatientState,any>={
      neutral:    {rate:1.05,amp:0.009,hAmp:0.008,sway:0.004},
      breathless: {rate:3.50,amp:0.028,hAmp:0.016,sway:0.002},
      anxious:    {rate:1.80,amp:0.012,hAmp:0.014,sway:0.010},
      painful:    {rate:1.40,amp:0.010,hAmp:0.011,sway:0.006},
      comfortable:{rate:0.78,amp:0.007,hAmp:0.005,sway:0.003},
    };
    return m[patientState]??m.neutral;
  },[patientState]);

  useFrame(({clock},delta)=>{
    const T=clock.getElapsedTime();
    const{rate,amp,hAmp,sway}=P;
    const b=Math.sin(T*rate*Math.PI)+Math.sin(T*rate*Math.PI*2)*0.16;
    const bN=(b+1.16)/2.32;
    if(torsoRef.current) torsoRef.current.scale.set(1+bN*amp*0.55,1+bN*amp*0.10,1+bN*amp);
    const sl=bN*amp*0.55;
    if(shoulderLRef.current) shoulderLRef.current.position.y=sl;
    if(shoulderRRef.current) shoulderRRef.current.position.y=sl;
    const hx=Math.sin(T*0.21+1.3)*hAmp*0.70+Math.sin(T*0.08)*hAmp*0.38;
    const hy=Math.sin(T*0.17+0.8)*hAmp*0.50;
    const hz=Math.sin(T*0.14+2.0)*hAmp*0.30;
    const bLift=patientState==='breathless'?bN*0.022:0;
    if(headRef.current) headRef.current.rotation.set(hx-bLift,hy,hz);
    if(neckRef.current) neckRef.current.rotation.set(hx*0.34,hy*0.22,0);
    const gd=Math.sin(T*0.19+0.5)*0.006+(patientState==='anxious'?Math.sin(T*1.4+1.8)*0.005:0);
    if(gazeRef.current) gazeRef.current.rotation.y=gd;

    /* examination pose: arms out / raised, head turned or tilted, mouth open, tongue out, eyes up */
    const pz=poseRef.current;
    if(headRef.current){headRef.current.rotation.x+=pz.pitch*0.6; headRef.current.rotation.y+=pz.yaw*0.6;}
    if(neckRef.current){neckRef.current.rotation.x+=pz.pitch*0.4; neckRef.current.rotation.y+=pz.yaw*0.4;}
    if(gazeRef.current) gazeRef.current.rotation.x=-pz.eyesUp*0.45;
    const armPose=[pz.rArm,pz.lArm];
    [-1,1].forEach((side,i)=>{const g=armRefs.current[i]; if(g) g.rotation.set(0.06-armPose[i].fw,0,side*(0.36+armPose[i].ab));});
    if(mouthRef.current){mouthRef.current.visible=pz.mouth>0.05; mouthRef.current.scale.set(1,Math.max(0.05,pz.mouth),1);}
    if(tongueRef.current){tongueRef.current.visible=pz.tongue>0.05; tongueRef.current.position.z=0.098+pz.tongue*0.022; tongueRef.current.scale.set(1,1,Math.max(0.05,pz.tongue));}
    const bs=blinkSt.current;
    if(bs.phase===0){bs.next-=delta;if(bs.next<=0){bs.phase=1;bs.t=0;bs.next=(patientState==='anxious'?2.5:4.2)+Math.random()*2;}}
    else{
      bs.t+=delta;
      const dur=bs.phase===1?0.075:0.115;
      const p=Math.min(bs.t/dur,1);
      const sc=bs.phase===1?0.36+p*1.64:2.0-p*1.64;
      if(eyelidLRef.current) eyelidLRef.current.scale.y=sc;
      if(eyelidRRef.current) eyelidRRef.current.scale.y=sc;
      if(bs.t>=dur){bs.phase=bs.phase===1?2:0;bs.t=0;}
    }
    if(handLRef.current) handLRef.current.rotation.x=patientState==='anxious'?Math.sin(T*0.75)*0.055+0.030:0;
    if(patientState==='painful'){
      const ws=winceSt.current;
      ws.next-=delta;
      if(ws.next<=0&&!ws.active){ws.active=true;ws.t=0;ws.next=5+Math.random()*4;}
      if(ws.active){
        ws.t+=delta;
        const bell=ws.t<0.4?ws.t/0.4:(0.8-ws.t)/0.4;
        if(shoulderLRef.current) shoulderLRef.current.position.y=sl+Math.max(0,bell)*0.028;
        if(headRef.current) headRef.current.rotation.z=hz+Math.max(0,bell)*0.055;
        if(ws.t>=0.8) ws.active=false;
      }
    }
    if(rootRef.current&&(position==='sitting'||position==='standing'))
      rootRef.current.rotation.z=Math.sin(T*0.13+0.6)*sway;
  });

  const isSupine=position==='supine';
  const isSemi=position==='semi_recumbent';
  const isSitting=position==='sitting';
  const rootRot:[number,number,number]=isSupine?[-Math.PI/2,0,0]:isSemi?[-Math.PI/3.5,0,0]:[0,0,0];
  const kneeAngle=isSitting?-Math.PI/2.2:0;
  const shinAngle=isSitting?Math.PI/2.0:0;

  return (
    <group rotation={rootRot}>
      <group ref={rootRef}>
        <group ref={torsoRef}>
          {/* TORSO — spheres + capsule only */}
          <TorsoMesh material={gownMain}/>

          {/* Collar and ties over a continuous printed gown surface. */}
          <group>
            {/* Collar — torus ring, not a box */}
            <T R={0.040} r={0.010} mat={gownTie} p={[0,0.238,0.092]} rot={[Math.PI/2,0,0]}/>
            <C r={0.005} l={0.060} mat={gownTie} p={[-0.020,0.218,0.124]} rot={[0,0,-0.22]}/>
            <C r={0.005} l={0.060} mat={gownTie} p={[0.020,0.218,0.124]} rot={[0,0,0.22]}/>
          </group>

          {/* IV — all capsules/spheres */}
          <C r={0.003} l={0.165} mat={ivTube} p={[-0.192,0.022,-0.040]} rot={[0.18,0,0.28]}/>
          <S r={0.016} mat={ivTape} p={[-0.220,-0.054,-0.032]} s={[1.4,0.45,0.9]}/>

          {/* NECK */}
          <group ref={neckRef} position={[0,0.342,0.008]}>
            <C r={0.040} l={0.080} mat={skin}/>
            <S r={0.022} mat={skin} p={[0,0.008,0.030]}/>
            <C r={0.010} l={0.065} mat={darkSkin} p={[-0.018,-0.018,0.022]} rot={[0.18,0,-0.14]} s={[0.44,1,0.46]}/>
            <C r={0.010} l={0.065} mat={darkSkin} p={[0.018,-0.018,0.022]} rot={[0.18,0,0.14]} s={[0.44,1,0.46]}/>
            <group ref={headRef} position={[0,0.200,-0.006]}>
              <Face skin={skin} darkSkin={darkSkin} hair={hair} lip={lip}
                sex={sex} eyelidL={eyelidLRef} eyelidR={eyelidRRef} gazeGrp={gazeRef} mouthRef={mouthRef} tongueRef={tongueRef}/>
            </group>
          </group>

          {/* SHOULDERS */}
          <group ref={shoulderLRef} position={[-0.172,0.136,0.004]}><S r={0.060} mat={gownMain}/></group>
          <group ref={shoulderRRef} position={[0.172,0.136,0.004]}><S r={0.060} mat={gownMain}/></group>

          {/* ARMS */}
          {[-1,1].map(side=>(
            <group key={side} position={[side*0.172,0.136,0.004]}>
              <group ref={(g)=>{armRefs.current[side===-1?0:1]=g;}} rotation={[0.06,0,side*0.36]}>
                <Sleeve material={gownMain}/>
                <T R={0.055} r={0.003} mat={gownTie} p={[0,-0.216,0]} rot={[Math.PI/2,0,0]}/>
                <S r={0.038} mat={gownMain} p={[side*0.052,-0.202,0.002]}/>
                <group position={[side*0.052,-0.202,0.002]} rotation={[-0.12,0,0]}>
                  <C r={0.027} l={0.158} mat={legSkin} p={[0,-0.106,0]}/>
                  <S r={0.023} mat={legSkin} p={[0,-0.192,0]}/>
                  <group ref={side===-1?handLRef:undefined} position={[0,-0.232,0]}>
                    <Hand mat={legSkin} side={side as 1|-1}/>
                  </group>
                </group>
              </group>
            </group>
          ))}

          {/* LEGS */}
          {[-1,1].map(side=>(
            <group key={side} position={[side*0.064,-0.250,0.004]}>
              <S r={0.056} mat={legSkin}/>
              <group rotation={[kneeAngle,0,side*0.022]}>
                <C r={0.052} l={0.218} mat={legSkin} p={[0,-0.148,0]}/>
                <S r={0.048} mat={legSkin} p={[0,-0.268,0.016]}/>
                <group position={[0,-0.274,0]} rotation={[shinAngle,0,0]}>
                  <C r={0.038} l={0.196} mat={legSkin} p={[0,-0.128,0]} s={[0.93,1,0.89]}/>
                  <S r={0.036} mat={legSkin} p={[side*-0.004,-0.116,-0.020]} s={[0.86,1,1.08]}/>
                  <S r={0.030} mat={legSkin} p={[0,-0.244,0]}/>
                  <S r={0.014} mat={legSkin} p={[0.022,-0.240,0.002]}/>
                  <S r={0.014} mat={legSkin} p={[-0.022,-0.240,0.002]}/>
                  <S r={0.037} mat={legSkin} p={[0,-0.264,0.040]} s={[1,0.52,1.44]}/>
                  <S r={0.026} mat={legSkin} p={[0,-0.264,-0.048]} s={[0.88,0.70,0.76]}/>
                  {[-0.022,-0.008,0.005,0.016,0.024].map((tx,ti)=>(
                    <S key={ti} r={0.010-ti*0.001} mat={legSkin} p={[tx,-0.272,0.050-ti*0.004]}/>
                  ))}
                </group>
              </group>
            </group>
          ))}
        </group>
      </group>
      {children}
    </group>
  );
}

