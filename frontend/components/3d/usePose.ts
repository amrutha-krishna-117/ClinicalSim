'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { PoseName, PoseTarget, POSES, REST, approach } from '@/lib/poseMath';

/** Smoothly eases the body toward the requested pose; returns a ref holding the current pose values. */
export function usePoseRef(name: PoseName) {
  const cur = useRef<PoseTarget>(JSON.parse(JSON.stringify(REST)));
  const want = useRef<PoseName>(name);
  want.current = name;
  useFrame((_, dt) => approach(cur.current, POSES[want.current], 1 - Math.exp(-Math.min(dt, 0.1) * 5)));
  return cur;
}
