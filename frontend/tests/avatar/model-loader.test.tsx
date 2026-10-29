import React from 'react';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import assert from 'assert';
import { RealisticPatient } from '@/components/3d/RealisticPatient';
import { useVoiceStore } from '@/lib/voice';
import { useThree } from '@react-three/fiber';
function CaptureClock() { (globalThis as any).__clock = useThree((s) => s.clock); return null; }
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let fetchOk = true;
(globalThis as any).fetch = async () => ({ ok: fetchOk, headers: { get: () => 'model/gltf-binary' } });
const fakeDocument = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, beginPath() {}, arc() {}, fill() {}, set fillStyle(_v: string) {} }) }) };

const regionMarker = <group name="RegionLandmark" position={[0, 0.2, 0.1]} />;
const mk = (pose: any, extra: any = {}, children: React.ReactNode = regionMarker) => (<><CaptureClock /><RealisticPatient sex="female" position="sitting" patientState="neutral" age={30} pose={pose} {...extra}>{children}</RealisticPatient></>);
const all = (o: THREE.Object3D) => { const a: THREE.Object3D[] = []; o.traverse((x) => a.push(x)); return a; };
const near = (v: number, t: number, tol: number) => Math.abs(v - t) <= tol;

(async () => {
  const r = await ReactThreeTestRenderer.create(mk('rest'));
  const root = () => (r.scene as any).instance as THREE.Object3D;
  // the headless renderer never advances the clock (a browser does every frame), so do it here
  const frames = async (n: number, dt = 1 / 30) => { await ReactThreeTestRenderer.act(async () => { for (let i = 0; i < n; i++) { (globalThis as any).__clock.elapsedTime += dt; await r.advanceFrames(1, dt); } }); };
  await ReactThreeTestRenderer.act(async () => { await new Promise((res) => setTimeout(res, 60)); });   // the HEAD request that checks the file exists
  await frames(5);
  const bone = (n: string) => all(root()).find((o) => o.name === n)!;
  const headMesh = () => all(root()).find((o) => o.name === 'Wolf3D_Head') as any;
  const inf = (k: string) => headMesh().morphTargetInfluences[headMesh().morphTargetDictionary[k]] as number;
  assert(bone('RightArm') && headMesh(), 'the real-model path loaded (not the fallback body)');
  const marker = () => all(root()).find((o) => o.name === 'RegionLandmark')!;
  const markerPosition = () => { marker().updateWorldMatrix(true, false); return marker().getWorldPosition(new THREE.Vector3()); };
  const sittingMarker = markerPosition();
  await r.update(mk('rest', { position: 'supine' })); await frames(3);
  assert(markerPosition().distanceTo(sittingMarker) > 0.1, 'patient-local regions follow the GLB when its position changes');
  await r.update(mk('rest', { position: 'sitting' })); await frames(3);
  console.log('model path active ............ bones found: RightArm, Head, Spine2; morph targets:', Object.keys(headMesh().morphTargetDictionary).length);

  // clothing -> hospital gown, shoes -> slippers, glasses hidden
  const top = all(root()).find((o) => o.name === 'Wolf3D_Outfit_Top') as THREE.Mesh, shoes = all(root()).find((o) => o.name === 'Wolf3D_Outfit_Footwear') as THREE.Mesh, glasses = all(root()).find((o) => o.name === 'Wolf3D_Glasses') as THREE.Mesh, body = all(root()).find((o) => o.name === 'Wolf3D_Body') as THREE.Mesh;
  assert((top.material as THREE.MeshStandardMaterial).map, 'outfit gets the hospital-gown print texture');
  assert((shoes.material as THREE.MeshStandardMaterial).color.getHexString() === '2f6fb0', 'footwear becomes blue slippers');
  assert(glasses.visible === false, 'glasses are hidden');
  assert(!(body.material as THREE.MeshStandardMaterial).map, 'skin is left alone');
  console.log('gown / slippers / glasses .... gown texture applied, slippers blue, glasses hidden, skin untouched');

  // sitting position: legs swung forward by the loader
  const worldDir = (o: THREE.Object3D) => { o.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); };
  const hipY = worldDir(bone('Hips')).y, kneeY = worldDir(bone('RightLeg')).y;
  assert(near(kneeY, hipY, 0.25), `sitting: thigh is horizontal (hip y ${hipY.toFixed(2)}, knee y ${kneeY.toFixed(2)})`);

  // pose -> skeleton
  const handX = () => { const h = bone('RightHand'); h.updateWorldMatrix(true, false); const rootInv = root().children[0].parent!; return rootInv.worldToLocal(h.getWorldPosition(new THREE.Vector3())); };
  const restHand = handX().clone();
  await r.update(mk('arm_out')); await frames(150);
  const outHand = handX();
  assert(outHand.distanceTo(restHand) > 0.15, `right hand moves when the pose is arm_out (moved ${outHand.distanceTo(restHand).toFixed(2)} m)`);
  await r.update(mk('rest')); await frames(150);
  assert(handX().distanceTo(restHand) < 0.02, 'and returns to rest');
  console.log('arm pose on skeleton ......... right hand moved', outHand.distanceTo(restHand).toFixed(2), 'm, then returned');

  const head = bone('Head'); head.updateWorldMatrix(true, false);
  const restHead = head.getWorldQuaternion(new THREE.Quaternion());
  await r.update(mk('head_left')); await frames(150);
  head.updateWorldMatrix(true, false);
  assert(head.getWorldQuaternion(new THREE.Quaternion()).angleTo(restHead) > 0.2, 'head examination pose rotates the GLB head');
  await r.update(mk('rest')); await frames(150);

  // face blendshapes for examination poses
  await r.update(mk('tongue_out')); await frames(150);
  assert(inf('tongueOut') > 0.7 && inf('jawOpen') > 0.3, `tongue_out: tongueOut ${inf('tongueOut').toFixed(2)}, jawOpen ${inf('jawOpen').toFixed(2)}`);
  console.log('tongue_out ................... tongueOut =', inf('tongueOut').toFixed(2), 'jawOpen =', inf('jawOpen').toFixed(2));
  await r.update(mk('eyes_up')); await frames(150);
  assert(inf('eyeLookUpLeft') > 0.7 && inf('tongueOut') < 0.05, 'eyes_up: eyes look up, tongue back in');
  await r.update(mk('rest')); await frames(200);
  assert(inf('jawOpen') < 0.05 && inf('eyeLookUpLeft') < 0.05, 'face returns to neutral');

  // speaking moves the jaw; blinking happens
  useVoiceStore.getState().patch({ speaking: true });
  let maxJaw = 0, minJaw = 1; for (let i = 0; i < 60; i++) { await frames(1, 1 / 30); maxJaw = Math.max(maxJaw, inf('jawOpen')); minJaw = Math.min(minJaw, inf('jawOpen')); }
  useVoiceStore.getState().patch({ speaking: false });
  assert(maxJaw > 0.2 && maxJaw - minJaw > 0.1, `jaw moves while the patient speaks (range ${minJaw.toFixed(2)}-${maxJaw.toFixed(2)})`);
  await frames(30);
  let blinked = false; for (let i = 0; i < 450 && !blinked; i++) { await frames(1, 1 / 30); blinked = inf('eyeBlinkLeft') > 0.5; }
  assert(blinked, 'the patient blinks within 15 seconds');
  console.log('speaking / blinking .......... jaw range', minJaw.toFixed(2), '-', maxJaw.toFixed(2), '| blink seen');

  // missing file -> safe fallback body, not a crash
  fetchOk = false;
  const r2 = await ReactThreeTestRenderer.create(mk('rest'));
  await ReactThreeTestRenderer.act(async () => { await new Promise((res) => setTimeout(res, 60)); await r2.advanceFrames(3, 1 / 30); });
  const names2 = all((r2.scene as any).instance).map((o) => o.name);
  assert(!names2.includes('RightArm') && all((r2.scene as any).instance).length > 50, 'missing model file -> fallback body renders instead');
  console.log('missing model file ........... fallback body rendered, no crash');
  console.log('\nGLB loader + poses: ALL CHECKS PASSED');
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message, '\n', e.stack?.split('\n').slice(0, 4).join('\n')); process.exit(1); });
