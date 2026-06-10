// =============================================================
//  마석고 교복지도 — 학생 잡담 말풍선 (src/bubbles.js)
//  플레이어가 가까운 교실 안 학생들 머리 위로 가끔 잡담 말풍선이 뜬다.
//  월드 좌표 → 화면 좌표로 투영해 DOM 말풍선을 띄우고 잠시 뒤 사라짐.
//  createBubbles(uiRoot, camera) -> { update(dt, playerPos, paused) }
// =============================================================

import * as THREE from 'three';
import { ROOMS, CLASSROOMS } from './data.js';

const CHATTER = [
  '야 숙제 했어?', '배고프다…', '준식쌤 온다 준식쌤!!', '단추 잠가 빨리', '어제 그거 봤어?',
  '졸려…', '오늘 급식 뭐야?', '나 명찰 안 가져옴 ㅠ', '치마 줄인 거 걸리겠다',
  '앗 지각이다!', '조용히 해, 준식이 선생님 오심', '나만 후드 입었나?', '체육 몇 교시지?',
  '와 ㄹㅇ?', '준식쌤 오늘 어느 반부터래?', '나 어제 게임하느라 못 잤어',
];

// 부장이 교실에 들어선 순간 터지는 패닉 잡담(panic 전용 — 일반 잡담과 별개)
const PANIC = [
  '쉿!! 준식이 선생님 오심!!', '후드 벗어 빨리!!', '명찰!! 명찰 어딨어!!',
  '자는 척 하지 마!!', '단추 잠가!! 빨리!!', '휴대폰 넣어!! 빨리!!',
  '와이셔츠 넣어 넣어!!', '준식쌤이다!! 앉아 앉아!!',
];

const MAX_BUBBLES = 3;       // 동시에 보일 최대 개수
const NEAR_DIST = 11;        // 이 거리(m) 안 교실에서만 잡담
const SPAWN_MIN = 1.4;       // 스폰 간격(초) 최소
const SPAWN_MAX = 3.4;       // 스폰 간격 최대
const LIFE = 2.8;            // 말풍선 수명(초)

const CLASS_ROOMS = ROOMS.filter((r) => CLASSROOMS.includes(r.id));

export function createBubbles(uiRoot, camera) {
  // 레이어
  const layer = document.createElement('div');
  layer.className = 'bubble-layer';
  layer.style.cssText =
    'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:45';
  uiRoot.appendChild(layer);

  const active = []; // { el, world:Vector3, t }
  let spawnTimer = randRange(SPAWN_MIN, SPAWN_MAX);
  const tmp = new THREE.Vector3();

  function makeBubble(text) {
    const el = document.createElement('div');
    el.className = 'bubble';
    el.textContent = text;
    el.style.cssText =
      'position:absolute;transform:translate(-50%,-100%);' +
      'background:rgba(255,255,255,0.96);color:#23262c;font:600 12px/1.3 system-ui,"Malgun Gothic",sans-serif;' +
      'padding:5px 9px;border-radius:11px;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.35);' +
      'opacity:0;transition:opacity 0.25s ease;border:1px solid rgba(0,0,0,0.08)';
    // 꼬리
    const tail = document.createElement('div');
    tail.style.cssText =
      'position:absolute;left:50%;bottom:-5px;width:10px;height:10px;background:inherit;' +
      'transform:translateX(-50%) rotate(45deg);border-right:1px solid rgba(0,0,0,0.08);border-bottom:1px solid rgba(0,0,0,0.08)';
    el.appendChild(tail);
    layer.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    return el;
  }

  function spawn(playerPos) {
    if (active.length >= MAX_BUBBLES) return;
    // 플레이어 근처 교실 후보
    const near = [];
    for (const r of CLASS_ROOMS) {
      const dx = r.x - playerPos.x;
      const dz = r.z - playerPos.z;
      if (dx * dx + dz * dz <= NEAR_DIST * NEAR_DIST) near.push(r);
    }
    if (!near.length) return;
    const r = near[(Math.random() * near.length) | 0];
    // 교실 안 임의 지점(학생 머리 높이)
    const ox = (Math.random() - 0.5) * (r.w * 0.55);
    const oz = (Math.random() - 0.5) * (r.d * 0.55);
    const world = new THREE.Vector3(r.x + ox, 1.45, r.z + oz);

    // 화면 안/카메라 앞쪽일 때만
    tmp.copy(world).project(camera);
    if (tmp.z > 1 || Math.abs(tmp.x) > 1 || Math.abs(tmp.y) > 1) return;

    const text = CHATTER[(Math.random() * CHATTER.length) | 0];
    active.push({ el: makeBubble(text), world, t: 0 });
  }

  function update(dt, playerPos, paused) {
    const W = window.innerWidth;
    const H = window.innerHeight;

    // 스폰 타이머
    if (!paused && playerPos) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = randRange(SPAWN_MIN, SPAWN_MAX);
        spawn(playerPos);
      }
    }

    // 기존 말풍선 위치 갱신 + 수명
    for (let i = active.length - 1; i >= 0; i--) {
      const b = active[i];
      b.t += dt;
      tmp.copy(b.world).project(camera);
      const behind = tmp.z > 1;
      if (b.t >= LIFE || behind) {
        // 페이드아웃 후 제거
        b.el.style.opacity = '0';
        if (b.t >= LIFE + 0.3 || behind) {
          b.el.remove();
          active.splice(i, 1);
          continue;
        }
      }
      const sx = (tmp.x * 0.5 + 0.5) * W;
      const sy = (-tmp.y * 0.5 + 0.5) * H;
      b.el.style.left = sx.toFixed(1) + 'px';
      b.el.style.top = sy.toFixed(1) + 'px';
      // 화면 밖이면 숨김
      b.el.style.visibility =
        sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40 ? 'hidden' : 'visible';
    }
  }

  // 부장 입장 패닉: 해당 교실 안 학생들 위로 '쉿!! 부장님!!' 류 말풍선을
  // 즉시 2~3개 띄운다(일반 스폰 한도/타이머 무시 — 특별 연출).
  function panic(classId) {
    const r = CLASS_ROOMS.find((c) => c.id === classId);
    if (!r) return;
    const n = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < n; i++) {
      const text = PANIC[(Math.random() * PANIC.length) | 0];
      const ox = (Math.random() - 0.5) * (r.w * 0.5);
      const oz = (Math.random() - 0.5) * (r.d * 0.5);
      const world = new THREE.Vector3(r.x + ox, 1.5 + Math.random() * 0.15, r.z + oz);
      // t 를 음수로 시작시켜 살짝 시차를 두고 사라지게
      active.push({ el: makeBubble(text), world, t: -(i * 0.15) });
    }
  }

  function clear() {
    for (const b of active) b.el.remove();
    active.length = 0;
  }

  return { update, panic, clear, layer };
}

function randRange(a, b) {
  return a + Math.random() * (b - a);
}
