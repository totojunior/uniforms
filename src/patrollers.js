// =============================================================
//  마석고 교복지도 — 순찰 NPC(교장/교감) 모듈 (src/patrollers.js)
//  메인 복도(z≈0)를 왕복 순찰하는 교장·교감 선생님.
//  부장(플레이어)이 가까이 오면(부딪히면) main 이 대화를 연다(RPG식).
//  createPatrollers(scene)
//    -> { update(dt, playerPos, paused), getEncounter(playerPos),
//         setTalking(id|null), positions(), npcs }
// =============================================================

import * as THREE from 'three';
import { buildFigure } from './teachers.js';
import { PRINCIPALS } from './data.js';

const ENCOUNTER_RADIUS = 2.2; // 이 거리 안에 들어오면 조우

// 메인 복도(x[-50,66], z[-1.5,1.5])를 서로 다른 레인/속도/위상으로 왕복.
const PATROLS = {
  principal: { lane: -0.55, min: -46, max: 62, speed: 1.2, startX: -12, dir: 1 },
  vice:      { lane: 0.55,  min: -46, max: 62, speed: 1.6, startX: 46, dir: -1 },
};

// 각도 보간(-PI..PI 최단경로)
function lerpAngle(a, b, t) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

export function createPatrollers(scene) {
  const npcs = [];
  for (const p of PRINCIPALS) {
    const cfg = PATROLS[p.id] || { lane: 0, min: -40, max: 40, speed: 1.3, startX: 0, dir: 1 };
    const group = buildFigure(p.appearance);
    group.position.set(cfg.startX, 0, cfg.lane);
    group.rotation.y = cfg.dir > 0 ? Math.PI / 2 : -Math.PI / 2; // +X / -X
    group.userData.role = p.role;
    scene.add(group);
    npcs.push({ data: p, group, cfg, x: cfg.startX, dir: cfg.dir, bob: 0 });
  }

  let talkingId = null;

  function update(dt, playerPos, paused) {
    for (const n of npcs) {
      const head = n.group.userData && n.group.userData.head;
      const isTalker = n.data.id === talkingId;

      // 대화 중(전체 일시정지) 또는 본인이 말하는 중이면 멈춘다.
      if (paused || isTalker) {
        if (isTalker && playerPos) {
          // 말하는 NPC 는 플레이어를 정면으로 바라본다.
          const dx = playerPos.x - n.group.position.x;
          const dz = playerPos.z - n.group.position.z;
          if (dx * dx + dz * dz > 1e-4) {
            n.group.rotation.y = lerpAngle(n.group.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-9 * dt));
          }
          if (head) head.rotation.y = lerpAngle(head.rotation.y, 0, 1 - Math.exp(-9 * dt));
        }
        continue;
      }

      // 왕복 순찰 이동
      n.x += n.dir * n.cfg.speed * dt;
      if (n.x >= n.cfg.max) { n.x = n.cfg.max; n.dir = -1; }
      else if (n.x <= n.cfg.min) { n.x = n.cfg.min; n.dir = 1; }
      n.group.position.x = n.x;
      n.group.position.z = n.cfg.lane;

      // 진행 방향을 바라보기
      const travelYaw = n.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      n.group.rotation.y = lerpAngle(n.group.rotation.y, travelYaw, 1 - Math.exp(-6 * dt));

      // 걷는 느낌의 미세한 상하 보빙
      n.bob += dt * 8.5;
      n.group.position.y = Math.abs(Math.sin(n.bob)) * 0.02;

      // 플레이어가 가까우면 고개를 살짝 돌려 쳐다봄
      if (head) {
        let hy = 0;
        if (playerPos) {
          const dx = playerPos.x - n.group.position.x;
          const dz = playerPos.z - n.group.position.z;
          if (dx * dx + dz * dz < 36) {
            let local = Math.atan2(dx, dz) - n.group.rotation.y;
            local = Math.atan2(Math.sin(local), Math.cos(local));
            hy = Math.max(-0.6, Math.min(0.6, local));
          }
        }
        head.rotation.y = lerpAngle(head.rotation.y, hy, 1 - Math.exp(-6 * dt));
      }
    }
  }

  // 플레이어 반경 안의 가장 가까운 NPC 정보 반환(없으면 null)
  function getEncounter(playerPos) {
    let best = null;
    let bestD = ENCOUNTER_RADIUS * ENCOUNTER_RADIUS;
    for (const n of npcs) {
      const dx = playerPos.x - n.group.position.x;
      const dz = playerPos.z - n.group.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = n; }
    }
    if (!best) return null;
    return {
      id: best.data.id, role: best.data.role,
      appearance: best.data.appearance, lines: best.data.lines, color: best.data.color,
    };
  }

  function setTalking(id) { talkingId = id; }

  // 미니맵 점
  function positions() {
    return npcs.map((n) => ({ x: n.group.position.x, z: n.group.position.z, color: n.data.color }));
  }

  return { update, getEncounter, setTalking, positions, npcs };
}
