import React from 'react';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import assert from 'assert';
import { ProceduralPatient } from '@/components/3d/ProceduralPatient';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mk = (pose: any, position: any = 'sitting') => <ProceduralPatient sex="male" position={position} patientState="neutral" age={45} pose={pose}><group name="RegionLandmark" position={[0, 0.2, 0.1]} /></ProceduralPatient>;
const all = (root: THREE.Object3D) => { const a: THREE.Object3D[] = []; root.traverse((o) => a.push(o)); return a; };
const near = (v: number, t: number, tol = 0.06) => Math.abs(v - t) <= tol;

(async () => {
  const r = await ReactThreeTestRenderer.create(mk('rest'));
  const step = async (n = 150) => { await r.advanceFrames(n, 1 / 30); };
  const arms = () => all((r.scene as any).instance).filter((o) => o.type === 'Group' && o.parent && near(Math.abs(o.parent.position.x), 0.172, 0.001) && near(o.parent.position.y, 0.136, 0.001) && Math.abs(o.rotation.z) > 0.2);
  const armR = () => arms().find((o) => o.parent!.position.x < 0)!;    // patient's right is -x
  const armL = () => arms().find((o) => o.parent!.position.x > 0)!;
  const head = () => all((r.scene as any).instance).find((o) => o.type === 'Group' && near(o.position.y, 0.2, 0.001) && near(o.position.z, -0.006, 0.001))!;
  const mouth = () => all((r.scene as any).instance).find((o) => o.type === 'Group' && near(o.position.y, -0.05, 0.001) && near(o.position.z, 0.1, 0.001))!;
  const tongue = () => all((r.scene as any).instance).find((o) => o.type === 'Group' && near(o.position.y, -0.058, 0.001) && o.position.z >= 0.097)!;
  const regionWorldPosition = () => {
    const marker = all((r.scene as any).instance).find((o) => o.name === 'RegionLandmark')!;
    marker.updateWorldMatrix(true, false);
    return marker.getWorldPosition(new THREE.Vector3());
  };

  await step();
  const gownTorso = all((r.scene as any).instance).find((o) => o.name === 'PatientGownTorso') as THREE.Mesh;
  assert(gownTorso?.geometry.getAttribute('uv').count > 2000, 'gown torso is a smooth UV-mapped mesh for the fabric pattern');
  gownTorso.geometry.computeBoundingBox();
  assert(gownTorso.geometry.boundingBox!.min.y < -0.60 && gownTorso.geometry.boundingBox!.max.y > 0.30, 'gown silhouette reaches from shoulders to below the pelvis');
  const sittingRegion = regionWorldPosition();
  assert(armR() && armL() && head() && mouth() && tongue(), 'found arm, head, mouth and tongue groups');
  assert(near(armR().rotation.z, -0.36, 0.02) && near(armL().rotation.z, 0.36, 0.02), 'rest: arms hang naturally');
  assert(!mouth().visible && !tongue().visible, 'rest: mouth closed, tongue hidden');
  console.log('rest ................ arms z =', armR().rotation.z.toFixed(2), armL().rotation.z.toFixed(2), '| mouth visible:', mouth().visible);

  await r.update(mk('arm_out')); await step();
  assert(near(armR().rotation.z, -0.91, 0.03), `right arm abducts outward (z ${armR().rotation.z})`);
  assert(near(armR().rotation.x, 0.06 - 0.30, 0.03), 'right arm comes slightly forward');
  assert(near(armL().rotation.z, 0.36, 0.02), 'left arm stays put');
  console.log('arm_out ............. right arm z =', armR().rotation.z.toFixed(2), 'x =', armR().rotation.x.toFixed(2), '| left z =', armL().rotation.z.toFixed(2));

  await r.update(mk('arm_raised')); await step();
  assert(near(armR().rotation.x, 0.06 - 2.8, 0.05), `collapsing-pulse arm raised overhead (x ${armR().rotation.x})`);
  console.log('arm_raised .......... right arm x =', armR().rotation.x.toFixed(2));

  await r.update(mk('hands_out')); await step();
  assert(near(armR().rotation.x, 0.06 - 0.75, 0.04) && near(armL().rotation.x, 0.06 - 0.75, 0.04), 'both hands come forward');
  console.log('hands_out ........... both arms x =', armR().rotation.x.toFixed(2), armL().rotation.x.toFixed(2));

  await r.update(mk('rest')); await step();
  assert(near(armR().rotation.z, -0.36, 0.02) && near(armR().rotation.x, 0.06, 0.02), 'arm returns to rest');
  console.log('back to rest ........ right arm z =', armR().rotation.z.toFixed(2));

  await r.update(mk('tongue_out')); await step();
  assert(mouth().visible && tongue().visible, 'mouth opens and tongue shows');
  assert(tongue().position.z > 0.115, `tongue sticks out (z ${tongue().position.z})`);
  console.log('tongue_out .......... mouth visible:', mouth().visible, '| tongue z =', tongue().position.z.toFixed(3));
  await r.update(mk('mouth_open')); await step();
  assert(mouth().visible && !tongue().visible, 'teeth check: mouth open, tongue in');
  await r.update(mk('rest')); await step();
  assert(!mouth().visible && !tongue().visible, 'mouth closes again');

  const rest = head().rotation.y;
  await r.update(mk('head_left')); await step();
  assert(head().rotation.y > rest + 0.3, `head turns to patient's left (y ${head().rotation.y})`);
  await r.update(mk('head_right')); await step();
  assert(head().rotation.y < rest - 0.3, `head turns to patient's right (y ${head().rotation.y})`);
  await r.update(mk('chin_up')); await step();
  assert(head().rotation.x < -0.15, `chin lifts for the neck exam (x ${head().rotation.x})`);
  console.log('head_left / right / chin_up ... y =', 'turns both ways, x =', head().rotation.x.toFixed(2));

  await r.update(mk('arm_out', 'supine')); await step();
  assert(near(armR().rotation.z, -0.91, 0.03), 'same pose works while the patient is lying down');
  assert(regionWorldPosition().distanceTo(sittingRegion) > 0.1, 'patient-local regions follow the procedural body into supine position');
  for (const o of all((r.scene as any).instance)) assert(![o.rotation.x, o.rotation.y, o.rotation.z].some(Number.isNaN), 'no NaN rotations');
  console.log('lying down, arm_out . right arm z =', armR().rotation.z.toFixed(2), '| no NaNs anywhere in the scene');
  console.log('\nProceduralPatient pose wiring: ALL CHECKS PASSED');
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
