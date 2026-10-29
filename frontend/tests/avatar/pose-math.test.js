const THREE = require('three'); const pm = require(process.env.POSEMATH_JS || './out/poseMath.js'); const assert = require('assert');
function bone(name, x, y, z, parent) { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); parent && parent.add(b); return b; }
function build(parentRot) {
  const scene = new THREE.Group(); const holder = new THREE.Group(); scene.add(holder);
  if (parentRot) holder.rotation.x = parentRot;                  // e.g. patient lying on the bed
  const root = new THREE.Group(); holder.add(root);             // model root: faces +Z, up +Y, patient's left = +X
  const hips = bone('hips', 0, 1, 0, root), s1 = bone('spine1', 0, .2, 0, hips), s2 = bone('spine2', 0, .2, 0, s1);
  const neck = bone('neck', 0, .2, 0, s2), head = bone('head', 0, .1, 0, neck), tip = bone('tip', 0, 0, 0.2, head);   // tip = nose
  const rS = bone('rightshoulder', -.1, .15, 0, s2), rArm = bone('rightarm', -.1, 0, 0, rS), rFore = bone('rfore', 0, -.3, 0, rArm), rHand = bone('rhand', 0, -.25, 0, rFore);
  const lS = bone('leftshoulder', .1, .15, 0, s2), lArm = bone('leftarm', .1, 0, 0, lS), lFore = bone('lfore', 0, -.3, 0, lArm), lHand = bone('lhand', 0, -.25, 0, lFore);
  scene.updateMatrixWorld(true);
  const bones = { spine1: s1, spine2: s2, neck, head, rightarm: rArm, leftarm: lArm };
  return { scene, root, bones, rig: pm.makePoseRig(root, bones), rHand, lHand, rArm, head, tip };
}
const inRoot = (m, o) => m.root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
const dirInRoot = (m, o, v) => v.clone().transformDirection(o.matrixWorld).applyQuaternion(m.root.getWorldQuaternion(new THREE.Quaternion()).invert());
function run(parentRot) {
  const label = parentRot ? ' (patient lying down)' : '';
  const m = build(parentRot);
  const apply = (name) => { pm.applyPoseToRig(m.rig, pm.POSES[name]); m.scene.updateMatrixWorld(true); };
  apply('rest'); const rest = { rh: inRoot(m, m.rHand), lh: inRoot(m, m.lHand), nose: inRoot(m, m.tip), arm: inRoot(m, m.rArm) };

  apply('arm_out');
  let rh = inRoot(m, m.rHand);
  assert(rh.x < rest.rh.x - 0.12, 'right hand moves outward (more negative x)' + label); assert(rh.z > rest.rh.z + 0.05, 'and slightly forward' + label);
  assert(Math.abs(inRoot(m, m.lHand).x - rest.lh.x) < 1e-3, 'left arm unaffected' + label);

  apply('arm_out_left'); assert(inRoot(m, m.lHand).x > rest.lh.x + 0.12, 'left hand moves outward (positive x)' + label);

  apply('arm_raised'); rh = inRoot(m, m.rHand); const sh = inRoot(m, m.rArm);
  assert(rh.y > sh.y + 0.2, 'raised arm: hand above the shoulder' + label);

  apply('hands_out'); assert(inRoot(m, m.rHand).z > rest.rh.z + 0.25 && inRoot(m, m.lHand).z > rest.lh.z + 0.25, 'both hands come forward' + label);

  apply('lean_forward'); assert(inRoot(m, m.head).z > rest.nose.z - 0.0 + 0.05 || inRoot(m, m.tip).z > rest.nose.z + 0.05, 'leaning forward moves the head forward' + label);

  apply('chin_up'); assert(dirInRoot(m, m.tip, new THREE.Vector3(0, 0, 1)).y !== undefined);
  const faceDir = (n) => { apply(n); const p0 = inRoot(m, m.head), p1 = inRoot(m, m.tip); return p1.clone().sub(p0).normalize(); };
  assert(faceDir('rest').y > -0.05 && faceDir('rest').z > 0.95, 'rest: face looks straight ahead' + label);
  assert(faceDir('chin_up').y > 0.2, 'chin up: face tilts upward' + label);
  assert(faceDir('head_left').x > 0.3, "head turns to the patient's left (+x)" + label);
  assert(faceDir('head_right').x < -0.3, "head turns to the patient's right (-x)" + label);

  // no drift: applying the same pose again and again gives identical results, and rest returns to rest
  apply('arm_out'); const a = inRoot(m, m.rHand); for (let i = 0; i < 5; i++) apply('arm_out'); const b = inRoot(m, m.rHand);
  assert(a.distanceTo(b) < 1e-6, 'repeated frames do not accumulate' + label);
  apply('rest'); assert(inRoot(m, m.rHand).distanceTo(rest.rh) < 1e-5, 'returning to rest restores the original pose' + label);
}
run(0); run(-Math.PI / 2); run(Math.PI / 3.4 * -1);
// smoothing + poseFor + face blendshapes
const cur = JSON.parse(JSON.stringify(pm.REST)); for (let i = 0; i < 60; i++) pm.approach(cur, pm.POSES.arm_out, 0.15);
assert(Math.abs(cur.rArm.ab - 0.55) < 0.01, 'pose smoothing converges');
assert.equal(pm.poseFor('radial_pulse'), 'arm_out'); assert.equal(pm.poseFor('tongue'), 'tongue_out'); assert.equal(pm.poseFor('thyroid'), 'chin_up');
assert.equal(pm.poseFor('collapsing_pulse'), 'arm_raised'); assert.equal(pm.poseFor('posterior_chest'), 'lean_forward'); assert.equal(pm.poseFor('abdomen'), 'rest');
assert(pm.faceTargets(pm.POSES.tongue_out).tongueOut === 1 && pm.faceTargets(pm.POSES.tongue_out).jawOpen > 0.4 && Object.keys(pm.faceTargets(pm.REST)).length === 0);
console.log('poseMath: arm/head/trunk motion correct in 3 body orientations (standing, flat, propped); no drift; smoothing OK');
