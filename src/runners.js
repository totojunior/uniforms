// =============================================================
//  마석고 교복지도 — 지각생(뛰어가는 학생) NPC (src/runners.js)
//  메인 복도를 빠르게 왕복하며 뛰는 학생들. 부장 옆을 스치면
//  main 이 "헉헉, 죄송합니다!" 토스트를 띄운다(가벼운 연출).
//  createRunners(scene) -> { update(dt, playerPos, paused), getNear(playerPos), positions() }
// =============================================================

import * as THREE from 'three';
import { buildFigure } from './teachers.js';

// 지각생 외형(교복: 남색 상의/짙은 하의)
const LOOKS = [
  { skin: 0xe9c6a2, hair: 0x201a14, hairStyle: 'short',    build: 'slim', height: 1.69, top: 0x29324d, bottom: 0x20242f, accessory: 'none' },
  { skin: 0xf0d2b4, hair: 0x2e241c, hairStyle: 'ponytail', build: 'slim', height: 1.61, top: 0x29324d, bottom: 0x20242f, accessory: 'none' },
];

// 순찰 라인(메인 복도 x[-46,62])
const ROUTES = [
  { lane: -0.7, min: -46, max: 62, speed: 5.6, startX: -42, dir: 1 },
  { lane: 0.7,  min: -46, max: 62, speed: 6.2, startX: 58,  dir: -1 },
];

const NEAR = 2.6;

function lerpAngle(a, b, t) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

export function createRunners(scene) {
  const runners = [];
  for (let i = 0; i < ROUTES.length; i++) {
    const cfg = ROUTES[i];
    const group = buildFigure(LOOKS[i % LOOKS.length]);
    group.position.set(cfg.startX, 0, cfg.lane);
    group.rotation.y = cfg.dir > 0 ? Math.PI / 2 : -Math.PI / 2;

    // 가방(등에 멘 백팩) — 정면 +Z 이므로 등은 -Z
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.42, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x8a3a3a, roughness: 0.8 })
    );
    bag.position.set(0, 1.02, -0.2);
    group.add(bag);

    runners.push({ group, cfg, x: cfg.startX, dir: cfg.dir, bob: Math.random() * 6 });
  }

  function update(dt, playerPos, paused) {
    for (const n of runners) {
      if (paused) continue;
      n.x += n.dir * n.cfg.speed * dt;
      if (n.x >= n.cfg.max) { n.x = n.cfg.max; n.dir = -1; }
      else if (n.x <= n.cfg.min) { n.x = n.cfg.min; n.dir = 1; }
      n.group.position.x = n.x;
      n.group.position.z = n.cfg.lane;

      const travelYaw = n.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      n.group.rotation.y = lerpAngle(n.group.rotation.y, travelYaw, 1 - Math.exp(-10 * dt));

      // 뛰는 느낌: 빠른 상하 보빙 + 앞으로 살짝 기울임
      n.bob += dt * 16;
      n.group.position.y = Math.abs(Math.sin(n.bob)) * 0.07;
      n.group.rotation.x = 0.14;
    }
  }

  // 부장 옆을 스쳤는지(가장 가까운 지각생 인덱스 반환, 없으면 -1)
  function getNear(playerPos) {
    for (let i = 0; i < runners.length; i++) {
      const n = runners[i];
      const dx = playerPos.x - n.group.position.x;
      const dz = playerPos.z - n.group.position.z;
      if (dx * dx + dz * dz < NEAR * NEAR) return i;
    }
    return -1;
  }

  function positions() {
    return runners.map((n) => ({ x: n.group.position.x, z: n.group.position.z, color: 0xffd24a }));
  }

  return { update, getNear, positions, runners };
}
