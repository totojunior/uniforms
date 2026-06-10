// =============================================================
//  마석고 교복지도 — 옥상 매점빵 학생들 (src/roofkids.js)
//  옥상 물탱크 옆에서 몰래 빵을 먹는 학생 2명. 부장이 다가가면
//  화들짝("헉!! 부장님?!") → 대화 → 계단실로 도망쳐 사라진다.
//  옥상까지 올라온 부장에게 주는 코믹 보상 이벤트.
//
//  createRoofKids(scene) -> {
//    update(dt, playerPos, onRoof, paused) -> 'spotted' | null
//    flee(),        // 대화가 끝난 뒤 호출: 계단실로 도주 시작
//    positions(),   // 옥상 레이더용 점(주황) — 사라지면 []
//    reset(),
//    appearance,    // 대화 초상화용(대표 1명)
//  }
// =============================================================

import * as THREE from 'three';
import { buildFigure } from './teachers.js';

// 물탱크(11, 191.5) 옆 — 계단실 스폰(-9, 193.8)에서는 안 보이는 척 멀찍이
const SPOT_A = { x: 8.9, z: 193.1 };
const SPOT_B = { x: 10.3, z: 194.4 };
// 도주 경로: 계단실 도어웨이 앞(-9, 193.4) → 계단실 안(-9, 191.2) → 소멸
const FLEE_WAYPOINTS = [ { x: -9, z: 193.4 }, { x: -9, z: 191.2 } ];
const SPOT_DIST = 7;       // 발각 거리(m)
const FLEE_SPEED = 5.2;

const LOOKS = [
  { skin: 0xe9c6a2, hair: 0x1f1812, hairStyle: 'short',    build: 'slim', height: 1.68, top: 0x29324d, bottom: 0x20242f, accessory: 'none' },
  { skin: 0xf2d6b8, hair: 0x33261c, hairStyle: 'ponytail', build: 'slim', height: 1.60, top: 0x29324d, bottom: 0x20242f, accessory: 'none' },
];

function lerpAngle(a, b, t) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

export function createRoofKids(scene) {
  const kids = [];

  for (let i = 0; i < 2; i++) {
    const spot = i === 0 ? SPOT_A : SPOT_B;
    const group = buildFigure(LOOKS[i]);
    group.position.set(spot.x, 0, spot.z);
    // 서로 마주 보게
    const other = i === 0 ? SPOT_B : SPOT_A;
    group.rotation.y = Math.atan2(other.x - spot.x, other.z - spot.z);

    // 손에 든 매점빵(단팥빵 느낌의 황금색 박스 + 흰 크림 줄)
    const bread = new THREE.Group();
    const bun = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.1, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xdfae62, roughness: 0.8 })
    );
    bread.add(bun);
    const cream = new THREE.Mesh(
      new THREE.BoxGeometry(0.21, 0.025, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xf5efe2, roughness: 0.9 })
    );
    cream.position.y = 0.0;
    bread.add(cream);
    bread.position.set(i === 0 ? 0.16 : -0.16, 1.05, 0.16);
    group.add(bread);

    scene.add(group);
    kids.push({ group, bread, spot, munch: Math.random() * 6, wp: 0 });
  }

  // ── 상태: eating(우물우물) → busted(얼음) → flee(도주) → gone ──
  let state = 'eating';

  function update(dt, playerPos, onRoof, paused) {
    if (state === 'gone') return null;
    if (paused) return null;

    if (state === 'eating') {
      // 우물우물: 빵이 입가로 오르내린다(시차를 둬서 따로따로)
      for (const k of kids) {
        k.munch += dt * 2.2;
        k.bread.position.y = 1.05 + Math.max(0, Math.sin(k.munch)) * 0.22;
        k.group.position.y = Math.sin(k.munch * 0.7) * 0.012; // 미세한 들썩임
      }
      if (onRoof && playerPos) {
        const mx = (SPOT_A.x + SPOT_B.x) / 2;
        const mz = (SPOT_A.z + SPOT_B.z) / 2;
        const dx = playerPos.x - mx;
        const dz = playerPos.z - mz;
        if (dx * dx + dz * dz < SPOT_DIST * SPOT_DIST) {
          state = 'busted';
          // 화들짝: 빵 든 채 부장 쪽으로 홱 돌아본다
          for (const k of kids) {
            k.group.rotation.y = Math.atan2(playerPos.x - k.group.position.x, playerPos.z - k.group.position.z);
            k.bread.position.y = 0.95; // 빵을 슬그머니 내림
            k.group.position.y = 0;
          }
          return 'spotted';
        }
      }
    } else if (state === 'flee') {
      let allGone = true;
      for (const k of kids) {
        if (k.wp >= FLEE_WAYPOINTS.length) continue;
        allGone = false;
        const t = FLEE_WAYPOINTS[k.wp];
        const dx = t.x - k.group.position.x;
        const dz = t.z - k.group.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.35) {
          k.wp++;
          if (k.wp >= FLEE_WAYPOINTS.length) k.group.visible = false; // 계단실로 사라짐
          continue;
        }
        const step = Math.min(d, FLEE_SPEED * dt);
        k.group.position.x += (dx / d) * step;
        k.group.position.z += (dz / d) * step;
        k.munch += dt * 15;
        k.group.position.y = Math.abs(Math.sin(k.munch)) * 0.07; // 달리기 보빙
        k.group.rotation.x = 0.15;
        k.group.rotation.y = lerpAngle(k.group.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt));
      }
      if (allGone) state = 'gone';
    }
    // busted 동안은 대화가 끝나기를 기다리며 얼어 있음
    return null;
  }

  // 대화 종료 후 호출 — 둘 다 계단실로 전력 도주
  function flee() {
    if (state !== 'busted') return;
    state = 'flee';
    for (const k of kids) {
      k.wp = 0;
      k.bread.visible = false; // 빵은 입에 물고 간 걸로 치자
    }
  }

  function positions() {
    if (state === 'gone' || state === 'flee') {
      // 도주 중에도 보이는 동안은 점 표시
      return kids
        .filter((k) => k.group.visible)
        .map((k) => ({ x: k.group.position.x, z: k.group.position.z, color: 0xffa040 }));
    }
    return kids.map((k) => ({ x: k.group.position.x, z: k.group.position.z, color: 0xffa040 }));
  }

  function reset() {
    state = 'eating';
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      k.group.visible = true;
      k.bread.visible = true;
      k.bread.position.y = 1.05;
      k.group.rotation.x = 0;
      k.group.position.set(k.spot.x, 0, k.spot.z);
      const other = i === 0 ? SPOT_B : SPOT_A;
      k.group.rotation.y = Math.atan2(other.x - k.spot.x, other.z - k.spot.z);
      k.wp = 0;
    }
  }

  return { update, flee, positions, reset, appearance: LOOKS[0] };
}
