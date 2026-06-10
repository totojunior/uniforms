// =============================================================
//  마석고 교복지도 — 후드티 위반 학생 (src/hoodie.js)
//  메인 복도에 후드티를 입고 어슬렁거리는 학생 1명.
//  부장이 다가가면 도망치고("야!! 거기 후드!!"), 끝까지 따라가 잡으면
//  그 자리에서 후드를 벗는다(밑에는 멀쩡한 교복). 이후엔 모범생 모드.
//
//  createHoodie(scene) -> {
//    update(dt, playerPos, paused) -> 'flee' | 'caught' | 'greet' | null
//    startCaught(playerPos),  // 대화 시작 직전: 정지 + 부장 바라보기
//    finishCaught(),          // 대화 끝: 후드 벗기 + 모범생 모드
//    positions(),             // 미니맵 점(잡히기 전까지 회색)
//    reset(),
//    appearance,              // 대화 초상화용(후드 차림)
//  }
// =============================================================

import * as THREE from 'three';
import { buildFigure } from './teachers.js';

const HOOD_COLOR = 0x8a8f96;   // 회색 후드
const UNIFORM_TOP = 0x29324d;  // 후드 밑의 교복(남색)

// 동선: 메인 복도(z≈0), x 범위
const X_MIN = -42, X_MAX = 58;
const IDLE_SPEED = 0.85;
const FLEE_SPEED = 4.9;
const REFORM_SPEED = 0.7;
const FLEE_DIST = 8.5;     // 이 거리 안으로 오면 도망
const CATCH_DIST = 2.3;    // 이 거리 안이면 잡힘
const GREET_DIST = 2.6;    // 개과천선 후 인사 거리
const GREET_COOLDOWN = 25;

// 외형(후드 입은 상태 — 초상화에도 그대로 사용)
const LOOK = {
  skin: 0xeec9a6, hair: 0x241d16, hairStyle: 'short',
  build: 'slim', height: 1.70, top: HOOD_COLOR, bottom: 0x20242f, accessory: 'none',
};

function lerpAngle(a, b, t) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

export function createHoodie(scene) {
  // 본체: 교복(남색) 차림으로 만들고, 그 위에 회색 후드 오버레이를 덧입힌다.
  // → 잡히면 오버레이만 visible=false 하면 "후드를 벗는" 연출이 된다.
  const group = buildFigure({ ...LOOK, top: UNIFORM_TOP });
  const hoodMat = new THREE.MeshStandardMaterial({ color: HOOD_COLOR, roughness: 0.85 });
  const hoodParts = new THREE.Group();
  hoodParts.name = 'hood_overlay';

  // 몸통 덮개(후드집업) — buildFigure 의 slim 기준 치수보다 살짝 크게
  {
    const torsoCover = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.66, 0.28), hoodMat);
    torsoCover.position.set(0, 1.09, 0);
    torsoCover.castShadow = true;
    hoodParts.add(torsoCover);
    // 팔 덮개
    for (const sx of [-1, 1]) {
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.46, 4, 8), hoodMat);
      sleeve.position.set(sx * 0.225, 1.06, 0);
      sleeve.rotation.z = sx * 0.12;
      hoodParts.add(sleeve);
    }
    // 배 주머니(캥거루 포켓)
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.03), new THREE.MeshStandardMaterial({ color: 0x7c818a, roughness: 0.9 }));
    pocket.position.set(0, 0.92, 0.155);
    hoodParts.add(pocket);
  }
  group.add(hoodParts);

  // 머리 위 후드(머리그룹에 붙여서 함께 움직임) — 얼굴 앞은 트여 있음
  const headGroup = group.userData.head;
  const hoodCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.205, 14, 10, Math.PI * 0.62, Math.PI * 1.76, 0, Math.PI * 0.62),
    hoodMat
  );
  hoodCap.position.set(0, 0.01, -0.015);
  hoodCap.rotation.y = Math.PI; // 트인 쪽(개구부)이 얼굴(+Z)을 향하게
  if (headGroup) headGroup.add(hoodCap);
  else group.add(hoodCap);

  group.position.set(20, 0, 0);
  scene.add(group);

  // ── 상태 ──
  let state = 'idle';        // idle | flee | caught | reformed
  let x = 20;                // 복도상 위치
  let lane = 0;              // z(레인)
  let dir = 1;               // 진행 방향(±1)
  let idleTarget = 30;       // idle 목표 x
  let idleTimer = 0;
  let bob = 0;
  let fleeToastCd = 0;       // 'flee' 이벤트(부장 외침) 쿨다운
  let greetCd = 0;

  function pickIdleTarget() {
    idleTarget = X_MIN + 4 + Math.random() * (X_MAX - X_MIN - 8);
    idleTimer = 4 + Math.random() * 5;
  }
  pickIdleTarget();

  function faceYawFor(vx) {
    // 피규어 정면 = +Z. 동(+X)으로 갈 땐 +90°, 서(-X)는 -90°.
    return vx >= 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  function update(dt, playerPos, paused) {
    if (fleeToastCd > 0) fleeToastCd -= dt;
    if (greetCd > 0) greetCd -= dt;
    if (paused || !playerPos) return null;

    const dx = x - playerPos.x;
    const dz = lane - playerPos.z;
    const distSq = dx * dx + dz * dz;
    let event = null;

    if (state === 'idle') {
      // 잡힘 우선(코너에 몰린 경우)
      if (distSq < CATCH_DIST * CATCH_DIST) return 'caught';
      if (distSq < FLEE_DIST * FLEE_DIST) {
        state = 'flee';
        dir = dx >= 0 ? 1 : -1; // 부장 반대쪽으로
        if (fleeToastCd <= 0) { fleeToastCd = 8; event = 'flee'; }
      } else {
        // 어슬렁: 목표 x로 천천히
        idleTimer -= dt;
        if (idleTimer <= 0 || Math.abs(x - idleTarget) < 0.4) pickIdleTarget();
        const v = Math.sign(idleTarget - x) * IDLE_SPEED;
        x += v * dt;
        bob += dt * 5;
        group.rotation.y = lerpAngle(group.rotation.y, faceYawFor(v), 1 - Math.exp(-6 * dt));
        group.rotation.x = 0;
        group.position.y = Math.abs(Math.sin(bob)) * 0.02;
      }
    } else if (state === 'flee') {
      if (distSq < CATCH_DIST * CATCH_DIST) return 'caught';
      if (distSq > 15 * 15) {
        state = 'idle'; // 멀어지면 다시 어슬렁(긴장 풀림)
        pickIdleTarget();
      } else {
        dir = dx >= 0 ? 1 : -1;
        let nx = x + dir * FLEE_SPEED * dt;
        nx = Math.max(X_MIN, Math.min(X_MAX, nx)); // 복도 끝 = 막다른 길
        x = nx;
        bob += dt * 15;
        group.rotation.y = lerpAngle(group.rotation.y, faceYawFor(dir), 1 - Math.exp(-12 * dt));
        group.rotation.x = 0.14; // 앞으로 기울여 '전력질주' 느낌
        group.position.y = Math.abs(Math.sin(bob)) * 0.07;
        if (fleeToastCd <= 0) { fleeToastCd = 8; event = 'flee'; }
      }
    } else if (state === 'reformed') {
      // 모범생 모드: 느긋하게 왕복 + 가까우면 인사
      idleTimer -= dt;
      if (idleTimer <= 0 || Math.abs(x - idleTarget) < 0.4) pickIdleTarget();
      const v = Math.sign(idleTarget - x) * REFORM_SPEED;
      x += v * dt;
      bob += dt * 4;
      group.rotation.y = lerpAngle(group.rotation.y, faceYawFor(v), 1 - Math.exp(-5 * dt));
      group.rotation.x = 0;
      group.position.y = Math.abs(Math.sin(bob)) * 0.015;
      if (greetCd <= 0 && distSq < GREET_DIST * GREET_DIST) {
        greetCd = GREET_COOLDOWN;
        event = 'greet';
      }
    }
    // state === 'caught' 동안은 main 의 대화가 끝날 때까지 정지

    group.position.x = x;
    group.position.z = lane;
    return event;
  }

  // 대화 시작 직전: 그 자리에 멈춰 부장을 바라본다.
  function startCaught(playerPos) {
    state = 'caught';
    group.rotation.x = 0;
    group.position.y = 0;
    if (playerPos) {
      const yaw = Math.atan2(playerPos.x - x, playerPos.z - lane);
      group.rotation.y = yaw;
    }
  }

  // 대화 종료: 후드를 벗는다(오버레이 숨김) → 밑에는 멀쩡한 교복.
  function finishCaught() {
    hoodParts.visible = false;
    hoodCap.visible = false;
    state = 'reformed';
    lane = 0.55; // 벽 쪽으로 붙어 얌전히 다님
    pickIdleTarget();
  }

  function positions() {
    if (state === 'reformed') return []; // 단속 완료 — 레이더에서 제거
    return [{ x: group.position.x, z: group.position.z, color: 0xb8bec6 }];
  }

  function reset() {
    state = 'idle';
    x = 20;
    lane = 0;
    hoodParts.visible = true;
    hoodCap.visible = true;
    group.rotation.x = 0;
    group.position.set(x, 0, lane);
    fleeToastCd = 0;
    greetCd = 0;
    pickIdleTarget();
  }

  return { update, startCaught, finishCaught, positions, reset, appearance: LOOK };
}
