import * as THREE from 'three';
// A synthetic Ready-Player-Me-style avatar (bones, blendshapes, separate clothing meshes) so the real loader code can run without a model file.
export function buildAvatar() {
  const bone = (name: string, x: number, y: number, z: number, parent?: THREE.Object3D) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); parent?.add(b); return b; };
  const root = new THREE.Group();
  const hips = bone('Hips', 0, 1, 0, root), spine = bone('Spine', 0, .1, 0, hips), s1 = bone('Spine1', 0, .15, 0, spine), s2 = bone('Spine2', 0, .15, 0, s1);
  const neck = bone('Neck', 0, .2, 0, s2), head = bone('Head', 0, .1, 0, neck);
  const rs = bone('RightShoulder', -.08, .15, 0, s2), ra = bone('RightArm', -.1, 0, 0, rs), rf = bone('RightForeArm', 0, -.3, 0, ra), rh = bone('RightHand', 0, -.25, 0, rf);
  const ls = bone('LeftShoulder', .08, .15, 0, s2), la = bone('LeftArm', .1, 0, 0, ls), lf = bone('LeftForeArm', 0, -.3, 0, la), lh = bone('LeftHand', 0, -.25, 0, lf);
  const rul = bone('RightUpLeg', -.1, -.05, 0, hips), rl = bone('RightLeg', 0, -.45, 0, rul), rfoot = bone('RightFoot', 0, -.45, 0, rl);
  const lul = bone('LeftUpLeg', .1, -.05, 0, hips), ll = bone('LeftLeg', 0, -.45, 0, lul), lfoot = bone('LeftFoot', 0, -.45, 0, ll);
  const bones = [hips, spine, s1, s2, neck, head, rs, ra, rf, rh, ls, la, lf, lh, rul, rl, rfoot, lul, ll, lfoot];
  const skeleton = new THREE.Skeleton(bones);
  const mk = (name: string, matName: string, size: [number, number, number]) => {
    const g = new THREE.BoxGeometry(...size, 1, 1, 1);
    const n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? 0 : 0)), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    const m = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ color: '#c08050', name: matName }));
    m.name = name; m.add(hips.parent ? new THREE.Object3D() : new THREE.Object3D()); return m;
  };
  const meshes = [mk('Wolf3D_Body', 'Wolf3D_Skin', [0.4, 1.7, 0.2]), mk('Wolf3D_Head', 'Wolf3D_Skin', [0.2, 0.25, 0.2]),
    mk('Wolf3D_Outfit_Top', 'Wolf3D_Outfit_Top', [0.45, 0.6, 0.25]), mk('Wolf3D_Outfit_Footwear', 'Wolf3D_Outfit_Footwear', [0.2, 0.1, 0.3]),
    mk('Wolf3D_Glasses', 'Wolf3D_Glasses', [0.2, 0.05, 0.05])];
  const names = ['jawOpen', 'tongueOut', 'eyeBlinkLeft', 'eyeBlinkRight', 'eyeLookUpLeft', 'eyeLookUpRight', 'browDownLeft', 'browInnerUp', 'mouthFunnel'];
  const headMesh = meshes[1] as any;
  headMesh.morphTargetDictionary = Object.fromEntries(names.map((n, i) => [n, i]));
  headMesh.morphTargetInfluences = names.map(() => 0);
  root.add(hips);
  for (const m of meshes) { root.add(m); m.bind(skeleton); }
  root.updateMatrixWorld(true);
  return root;
}
export function useGLTF(_url: string) { return { scene: (useGLTF as any).scene ?? ((useGLTF as any).scene = buildAvatar()), animations: [] }; }
useGLTF.preload = () => {};
export const useAnimations = () => ({ actions: {}, mixer: { stopAllAction() {} } });
