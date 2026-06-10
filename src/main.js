// =============================================================
//  마석고 교복지도 — 엔트리포인트 / 글루 (src/main.js)
//  좌표계: X = 동(+)/서(-), Z = 남(+)/북(-), Y = 위. 단위 미터. 눈높이 y=1.6.
//
//  역할:
//   - WebGLRenderer(안티앨리어싱) 생성, 캔버스를 <body> 에 append, 리사이즈 대응
//   - Scene(어두운 배경 + 안개)는 buildWorld 가 설정 / PerspectiveCamera 를 WORLD.spawn 에 배치
//   - UI / Audio / Dialogue 생성, 타이틀 → 시작 → 렌더 루프
//   - 매 프레임: player.update(dt, dialogue 열림 여부), 이동 중 발소리,
//     아침 시계(08:30~) 천천히 진행, 교실 트리거 진입 시 인카운터 진행
//   - 11개 교실 모두 방문 시: reveal + 부장 마무리 대사 + 배정표 요약
//   - 재시작: 새 배정(다른 결과 보장) + 교사 피규어 재배치 + 방문 초기화 + 스폰 복귀
//   - M: 음소거 토글 / H: 도움말 토글
// =============================================================

import * as THREE from 'three';

import { WORLD, CLASSROOMS, TEACHERS, BOSS, ROOMS } from './data.js';
import { generateAssignment, buildTable } from './assignment.js';
import { buildWorld } from './world.js';
import { createPlayer } from './player.js';
import { placeTeachers } from './teachers.js';
import { createAudio } from './audio.js';
import { createDialogue } from './dialogue.js';
import { createUI } from './ui.js';
import { createMinimap } from './minimap.js';
import { createPatrollers } from './patrollers.js';
import { createRunners } from './runners.js';
import { createBubbles } from './bubbles.js';
import { buildRooftop } from './rooftop.js';
import { createFunEvents } from './events.js';
import { createHoodie } from './hoodie.js';
import { createRoofKids } from './roofkids.js';

// ── 상수 ──────────────────────────────────────────────────
const EYE_HEIGHT = 1.6;          // 카메라 눈높이(m)
const DT_MAX = 0.05;             // dt 상한(탭 비활성 후 점프 방지, 초)
const FOOTSTEP_INTERVAL = 0.42;  // 발소리 간격(초) — 걷는 박자
const MOVE_EPS = 0.0008;         // '움직임' 판정 최소 평면 이동(m/frame 제곱)

// 인게임 아침 시계: 오전 조회 시작(08:50)부터 천천히 흐름.
const CLOCK_START_MIN = 8 * 60 + 50; // 530분 = 08:50
const CLOCK_RATE = 0.25;             // 게임 1초당 진행되는 '분' (아주 천천히 — 조회 분위기)

// ── 전역 핸들 ──────────────────────────────────────────────
const root = document.getElementById('ui-root');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene(); // 배경/안개는 buildWorld 에서 설정됨

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  300
);

// 월드 빌드 (배경·안개·바닥·벽·조명·트리거 모두 여기서)
const { colliders, roomTriggers, teacherAnchors, doors } = buildWorld(scene);

// 3층 환경(배경/안개) 보관 — 옥상 다녀오면 복원
const floorBg = scene.background;
const floorFog = scene.fog;

// 옥상 레벨(멀리 떨어진 곳에 미리 빌드)
const roof = buildRooftop(scene);

// 플레이어가 참조하는 충돌체(층 전환 시 내용만 교체, 배열 객체는 유지)
const playerColliders = colliders.slice();
function setColliders(arr) {
  playerColliders.length = 0;
  for (let i = 0; i < arr.length; i++) playerColliders.push(arr[i]);
}

// 교실 문 위치(여닫이 근접 판정용)
const doorPositions = {};
for (const r of ROOMS) {
  if (CLASSROOMS.includes(r.id)) doorPositions[r.id] = { x: r.door.x, z: r.door.z };
}

// 중앙 계단(stairC) 내부 → 옥상으로 올라가는 트리거
const stairUpTrigger = (() => {
  const s = ROOMS.find((r) => r.id === 'stairC');
  if (!s) return null;
  return { minX: s.x - s.w / 2 + 1, maxX: s.x + s.w / 2 - 1, minZ: s.z - s.d / 2 + 1, maxZ: s.z + s.d / 2 - 1 };
})();

let currentFloor = 'floor'; // 'floor' | 'roof'
let transitioning = false;

// 카메라를 스폰 위치/방위로 배치
function placeCameraAtSpawn() {
  camera.position.set(WORLD.spawn.x, EYE_HEIGHT, WORLD.spawn.z);
  // heading 규약: 0 = +Z(남쪽)를 바라봄, 시계방향. 카메라 기본 시선은 -Z.
  // -Z 기준 yaw 를 Math.PI(남쪽 +Z) + heading 으로 맞춘다.
  camera.rotation.set(0, Math.PI + (WORLD.spawn.heading || 0), 0, 'YXZ');
}
placeCameraAtSpawn();

// UI / 오디오 / 대화
const ui = createUI(root);
const audio = createAudio();
const dialogue = createDialogue(root, audio);
const minimap = createMinimap(root);
if (minimap.el) minimap.el.style.display = 'none'; // 타이틀 화면에선 숨김
const _fwd = new THREE.Vector3(); // 카메라 전방(미니맵 방위 / 교사 시선)
const patrollers = createPatrollers(scene); // 복도 순찰 교장/교감
const runners = createRunners(scene);        // 지각생(뛰어가는 학생)
const bubbles = createBubbles(root, camera); // 학생 잡담 말풍선
const hoodie = createHoodie(scene);          // 후드티 위반 학생(추격/단속)
const roofKids = createRoofKids(scene);      // 옥상 매점빵 학생들
const funEvents = createFunEvents({          // 혼잣말/교내방송/헐떡임/9시 종
  toast: (msg, dur) => ui.toast(msg, dur),
  audio,
  setClockLabel: (t) => ui.setClockLabel(t),
});
const npcCooldown = {};            // {id: 남은 쿨다운(초)} — RPG 조우 도배 방지
let lateToastCd = 0;               // 지각생 토스트 쿨다운(초)

// 지각생 스침 멘트(랜덤)
const LATE_LINES = [
  '지각생: 헉헉, 죄송합니다!! (다다닥)',
  '지각생: 준식이 선생님 죄송해요!! 늦잠이!! (슝)',
  '지각생: 아침밥은 먹고 뛰는 겁니다!! (휙)',
];

// ── 가변 상태 ──────────────────────────────────────────────
let player = null;                 // createPlayer 결과
let assignment = null;             // number[] a[classIdx]=teacherIdx
let placedTeachers = null;         // Map<classId,{group,teacherIdx}>
const visited = {};                // visited[classId] = true
let visitedCount = 0;
let clockMinutes = CLOCK_START_MIN;
let footstepAccum = 0;
let running = false;               // 루프 활성 여부
let finished = false;              // 11개 완료 여부
let prevTime = 0;                  // performance.now 기반(초)
let elapsedSec = 0;                // 이번 판 실제 순찰 시간(초) — 칭호 산정용

// ── 리사이즈 대응 ─────────────────────────────────────────
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// ── 시계 텍스트(분 -> 'HH:MM') ────────────────────────────
function formatClock(totalMin) {
  const m = Math.floor(totalMin);
  const hh = String(Math.floor(m / 60) % 24).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ── 트리거 판정(평면 AABB 안에 있는지) ─────────────────────
function insideAABB(pos, t) {
  return pos.x >= t.minX && pos.x <= t.maxX && pos.z >= t.minZ && pos.z <= t.maxZ;
}

// classId -> CLASSROOMS 인덱스 (assignment 조회용)
function classIndexOf(classId) {
  return CLASSROOMS.indexOf(classId);
}

// ── 교사 피규어 제거(재시작용) ─────────────────────────────
function removeTeacherFigures() {
  if (!placedTeachers) return;
  for (const { group } of placedTeachers.values()) {
    if (group && group.parent) group.parent.remove(group);
  }
  placedTeachers = null;
}

// ── 교사 시선 추적 ─────────────────────────────────────────
// 부장(플레이어)이 가까이 오면 교사가 고개를 돌려 바라본다(생동감).
function updateTeacherGaze(playerPos, dt) {
  if (!placedTeachers) return;
  const k = 1 - Math.exp(-6 * dt); // 부드러운 추적 계수
  for (const { group } of placedTeachers.values()) {
    const head = group.userData && group.userData.head;
    if (!head) continue;
    const dx = playerPos.x - group.position.x;
    const dz = playerPos.z - group.position.z;
    let targetLocal = 0;
    if (dx * dx + dz * dz < 49) {               // 7m 이내면 플레이어 응시
      const worldYaw = Math.atan2(dx, dz);      // 피규어 정면 = +Z
      let local = worldYaw - group.rotation.y;  // 그룹 회전 보정
      local = Math.atan2(Math.sin(local), Math.cos(local)); // -PI..PI
      targetLocal = Math.max(-0.7, Math.min(0.7, local));   // 과회전 방지
    }
    head.rotation.y += (targetLocal - head.rotation.y) * k;
  }
}

// =============================================================
//  층 전환(중앙 계단 ↔ 옥상) — 페이드 연출
// =============================================================
const fadeEl = document.createElement('div');
fadeEl.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;transition:opacity 0.35s ease;pointer-events:none;z-index:200';
document.body.appendChild(fadeEl);

function fadeTransition(midFn) {
  if (transitioning) return;
  transitioning = true;
  fadeEl.style.opacity = '1';
  setTimeout(() => {
    midFn();
    setTimeout(() => { fadeEl.style.opacity = '0'; transitioning = false; }, 90);
  }, 360);
}

function goToRooftop() {
  if (currentFloor !== 'floor') return;
  fadeTransition(() => {
    currentFloor = 'roof';
    setColliders(roof.colliders);
    camera.position.set(roof.spawn.x, EYE_HEIGHT, roof.spawn.z);
    camera.rotation.set(0, Math.PI + (roof.spawn.heading || 0), 0, 'YXZ');
    if (player) player.setPosition(roof.spawn.x, roof.spawn.z);
    scene.background = new THREE.Color(roof.skyColor);
    scene.fog = new THREE.Fog(roof.skyColor, 35, 120); // 멀리 있는 3층은 안개로 가림
    bubbles.clear();
    ui.toast('🏞 옥상에 올라왔습니다. 바람 좀 쐬고, 계단으로 다시 내려가세요.', 3000);
  });
}

function goToFloorAt(x, z, heading) {
  if (currentFloor !== 'roof') return;
  fadeTransition(() => {
    currentFloor = 'floor';
    setColliders(colliders);
    camera.position.set(x, EYE_HEIGHT, z);
    camera.rotation.set(0, Math.PI + (heading || 0), 0, 'YXZ');
    if (player) player.setPosition(x, z);
    scene.background = floorBg;
    scene.fog = floorFog;
  });
}

// ── 교실 문 여닫이: 가까이 가거나 방문한 교실은 문이 열린다 ──
const DOOR_OPEN_DIST = 3.3;
function updateDoors(playerPos, dt) {
  if (!doors) return;
  const k = 1 - Math.exp(-7 * dt);
  doors.forEach((d, classId) => {
    const dp = doorPositions[classId];
    if (!dp) return;
    const dx = playerPos.x - dp.x;
    const dz = playerPos.z - dp.z;
    const near = dx * dx + dz * dz < DOOR_OPEN_DIST * DOOR_OPEN_DIST;
    const target = (near || visited[classId]) ? d.openAngle : 0;
    // 닫혀 있던 문이 플레이어 근처에서 열리기 시작하면 '드르륵' 효과음 1회
    const opening = target !== 0 && Math.abs(d.pivot.rotation.y) < 0.06;
    if (opening && near && !d._sounded) {
      d._sounded = true;
      audio.door();
    } else if (target === 0 && Math.abs(d.pivot.rotation.y) < 0.06) {
      d._sounded = false; // 완전히 닫히면 다음 열림 때 다시 소리
    }
    d.pivot.rotation.y += (target - d.pivot.rotation.y) * k;
  });
}

// =============================================================
//  교실 인카운터 처리(중복 진입 가드 포함)
// =============================================================
let encounterBusy = false; // 인카운터 진행 중(await) 동안 재진입 방지

async function tryEncounter(trigger) {
  const classId = trigger.id;
  if (encounterBusy) return;
  if (finished) return;
  if (visited[classId]) return;
  if (dialogue.isOpen()) return;

  const idx = classIndexOf(classId);
  if (idx < 0) return;
  const teacher = TEACHERS[assignment[idx]];
  if (!teacher) return;

  // 방문 처리(중복 방지) + 카운터 갱신
  encounterBusy = true;
  visited[classId] = true;
  visitedCount++;
  ui.setVisited(visitedCount, CLASSROOMS.length);

  // 입장 연출: 학생들 패닉 말풍선 + '차렷, 경례!' (의자 드르륵 + 인사 소리)
  bubbles.panic(classId);
  audio.salute();
  ui.toast('반장: 차렷!! 준식이 선생님께… 경례!!! (우당탕)', 1900);

  // 대화(부장 배정 → 교사 수락). 닫힐 때까지 대기.
  try {
    await dialogue.startEncounter({
      classLabel: trigger.label || classId,
      teacher,
      boss: BOSS,
    });
  } finally {
    encounterBusy = false;
  }

  // 모든 교실 완료 → 결과 공개
  if (visitedCount >= CLASSROOMS.length && !finished) {
    finishGame();
  }
}

// =============================================================
//  순찰 교장/교감 조우(부딪힘) → 한마디 + 부장 굽신 리액션
// =============================================================
async function tryPrincipal(enc) {
  if (encounterBusy || finished || dialogue.isOpen()) return;
  encounterBusy = true;
  npcCooldown[enc.id] = 14; // 다음 조우까지 쿨다운(초)
  patrollers.setTalking(enc.id);

  const pLine = enc.lines[Math.floor(Math.random() * enc.lines.length)];
  const bReply = BOSS.lines.toPrincipal[Math.floor(Math.random() * BOSS.lines.toPrincipal.length)];
  try {
    await dialogue.startConversation([
      { name: enc.role, text: pLine, isBoss: false, appearance: enc.appearance },
      { name: BOSS.name, text: bReply, isBoss: true, appearance: BOSS.appearance },
    ]);
  } finally {
    patrollers.setTalking(null);
    encounterBusy = false;
  }
}

// =============================================================
//  후드티 학생 단속 — 끝까지 쫓아가 잡으면 그 자리에서 후드를 벗는다
// =============================================================
async function tryHoodieCatch(playerPos) {
  if (encounterBusy || finished || dialogue.isOpen()) return;
  encounterBusy = true;
  hoodie.startCaught(playerPos);
  try {
    await dialogue.startConversation([
      {
        name: '후드티 학생', isBoss: false, appearance: hoodie.appearance,
        text: '헉, 준식이 선생님?! 이건 그… 체온 유지용… 아니 패션… 죄송합니다!! 지금 벗을게요!! (스르륵)',
      },
      {
        name: BOSS.name, isBoss: true, appearance: BOSS.appearance,
        text: '등교했으면 교복! 후드는 주말에! …그래도 바로 벗는 거 보니 양심은 있군. 명찰도 챙겨라.',
      },
    ]);
  } finally {
    hoodie.finishCaught(); // 후드 탈의 → 밑에는 멀쩡한 교복(모범생 모드)
    encounterBusy = false;
    ui.toast('🧥 후드티 단속 완료! 밑에 교복을 입고 있었다…', 2600);
  }
}

// =============================================================
//  옥상 매점빵 학생들 발각 — 대화 후 계단실로 도주
// =============================================================
async function tryRoofBust() {
  if (encounterBusy || dialogue.isOpen()) { roofKids.flee(); return; }
  encounterBusy = true;
  try {
    await dialogue.startConversation([
      {
        name: '옥상의 학생들', isBoss: false, appearance: roofKids.appearance,
        text: '헉!!! 준식이 선생님?!?! 아, 아침을 못 먹어서… 매점빵은 죄가 없잖아요!!',
      },
      {
        name: BOSS.name, isBoss: true, appearance: BOSS.appearance,
        text: '죄는 빵에 없지. 옥상에 있지!! 조회 시작 전에 교실로… 뛰어!!!',
      },
    ]);
  } finally {
    encounterBusy = false;
    roofKids.flee();
    ui.toast('🥐 학생들이 계단으로 도망쳤다… (빵은 입에 물고)', 2800);
  }
}

// =============================================================
//  게임 완료 → reveal + 부장 마무리 대사 + 배정표 요약
// =============================================================
function finishGame() {
  finished = true;

  // 포인터 락 해제 — 안 풀면 커서가 캔버스에 잡혀 '다시하기' 버튼을 누를 수 없다.
  if (player && player.isLocked()) player.unlock();

  audio.reveal();

  // 부장 마무리 대사 1줄을 먼저 토스트로 띄워 코믹 페이오프를 읽힌 뒤,
  // 약간의 텀을 두고 배정표 요약 모달을 연다(동시에 뜨면 토스트가 묻힘).
  const doneLine = BOSS.lines.done[Math.floor(Math.random() * BOSS.lines.done.length)];
  ui.toast(`${BOSS.name}: ${doneLine}`, 3500);

  // 순찰 시간 → 부장 칭호(빠를수록 명예롭다)
  const mm = Math.floor(elapsedSec / 60);
  const ss = Math.floor(elapsedSec % 60);
  const timeText = mm > 0 ? `${mm}분 ${ss}초` : `${ss}초`;
  let gradeText;
  if (elapsedSec < 180) gradeText = '⚡ 번개 부장';
  else if (elapsedSec < 300) gradeText = '🏃 성실 부장';
  else if (elapsedSec < 480) gradeText = '🍵 여유만만 부장';
  else gradeText = '🌸 산책 나온 부장 (조회는 이미…)';

  setTimeout(() => {
    ui.showSummary(buildTable(assignment), restart, { timeText, gradeText });
  }, 600);
}

// =============================================================
//  시작
// =============================================================
function startGame() {
  // 오디오 잠금 해제(첫 제스처) + 배경음.
  // resume() 은 비동기(ctx.resume) 라 이 틱에서는 아직 'running' 이 아니다.
  // ambientStart()/bell() 은 running 이 아니면 무음 처리되므로 resume 완료 후 호출.
  audio.resume().then(() => {
    audio.ambientStart();
    audio.bell(); // 아침 종소리 — 등교 분위기
  });

  // 배정 생성 + 교사 배치
  assignment = generateAssignment();
  placedTeachers = placeTeachers(scene, teacherAnchors, assignment);

  // 플레이어 생성 (카메라는 이미 스폰에 배치됨)
  player = createPlayer(camera, renderer.domElement, playerColliders);

  // 상태 초기화
  resetProgress();

  // HUD 표시
  ui.startHUD();
  if (minimap.el) minimap.el.style.display = ''; // 미니맵 표시
  ui.setClock(formatClock(clockMinutes));
  ui.setVisited(visitedCount, CLASSROOMS.length);

  // 부장 아침 인사 한마디(분위기)
  const greet = BOSS.lines.greet[Math.floor(Math.random() * BOSS.lines.greet.length)];
  ui.toast(`${BOSS.name}: ${greet}`, 3200);

  // 잠시 뒤 교내방송(아침 조회 안내) — 분위기 살리기
  setTimeout(() => {
    if (!finished) {
      audio.bell();
      ui.toast('📢 [교내방송] 잠시 후 아침 조회를 시작합니다. 학생 여러분은 교복을 단정히 해주세요.', 4200);
    }
  }, 3600);

  // 캔버스 클릭 → 포인터 락
  renderer.domElement.addEventListener('click', onCanvasClick);

  // 루프 시작
  if (!running) {
    running = true;
    prevTime = performance.now() / 1000;
    requestAnimationFrame(loop);
  }
}

function onCanvasClick() {
  // 대화 중이거나 이미 잠겨 있으면 무시
  if (dialogue.isOpen()) return;
  if (player && !player.isLocked()) {
    player.lock();
  }
}

// 진행 상태(방문/시계/발소리) 초기화 + 스폰 복귀
function resetProgress() {
  for (const k of Object.keys(visited)) delete visited[k];
  visitedCount = 0;
  finished = false;
  encounterBusy = false;
  clockMinutes = CLOCK_START_MIN;
  footstepAccum = 0;
  elapsedSec = 0;
  for (const k of Object.keys(npcCooldown)) delete npcCooldown[k];
  patrollers.setTalking(null);
  currentFloor = 'floor';
  transitioning = false;
  setColliders(colliders);
  scene.background = floorBg;
  scene.fog = floorFog;
  bubbles.clear();
  lateToastCd = 0;
  funEvents.reset();   // 혼잣말/방송/9시 종 1회성 상태 복구
  hoodie.reset();      // 후드 학생 부활(다시 단속 가능)
  roofKids.reset();    // 옥상 학생들 복귀(빵도 복구)
  ui.setClockLabel('오전 조회');
  placeCameraAtSpawn();
  if (player) player.setPosition(WORLD.spawn.x, WORLD.spawn.z);
}

// =============================================================
//  재시작 — 새 배정(다른 결과) + 피규어 재배치 + 상태 초기화
// =============================================================
function restart() {
  // 기존 교사 피규어 제거
  removeTeacherFigures();

  // 새 배정 — 이전과 다르게 보장(가능한 한 재시도)
  const prev = assignment;
  let next = generateAssignment();
  if (prev && prev.length === next.length) {
    let attempts = 0;
    while (attempts < 50 && next.every((v, i) => v === prev[i])) {
      next = generateAssignment();
      attempts++;
    }
  }
  assignment = next;

  // 새 배치
  placedTeachers = placeTeachers(scene, teacherAnchors, assignment);

  // 진행 초기화 + 스폰 복귀
  resetProgress();

  // 요약 레이어는 다시하기 버튼이 이미 숨김 처리. HUD 갱신/재표시.
  ui.startHUD();
  ui.setVisited(visitedCount, CLASSROOMS.length);
  ui.setClock(formatClock(clockMinutes));

  // 다시 시점 고정은 사용자의 캔버스 클릭(onCanvasClick)으로 이루어진다.
}

// =============================================================
//  렌더 루프
// =============================================================
function loop() {
  if (!running) return;
  requestAnimationFrame(loop);

  const now = performance.now() / 1000;
  let dt = now - prevTime;
  prevTime = now;
  if (dt > DT_MAX) dt = DT_MAX; // 클램프
  if (dt < 0) dt = 0;

  const blocked = dialogue.isOpen();
  const onFloor = currentFloor === 'floor';

  // 이동 전 위치(발소리/이동 판정용)
  const before = player ? player.getPosition() : { x: 0, z: 0 };

  // 플레이어 갱신(대화 중이면 이동 무시)
  if (player) player.update(dt, blocked);

  // 이동량 계산
  const after = player ? player.getPosition() : before;
  const ddx = after.x - before.x;
  const ddz = after.z - before.z;
  const movedSq = ddx * ddx + ddz * ddz;
  const moving = movedSq > MOVE_EPS;

  // 달리는 중인지(발소리 박자 + 헐떡임 이벤트 공용)
  const sprinting = !blocked && moving && !!player && player.isLocked()
    && !!(player.isRunning && player.isRunning());

  // 발소리: 걷/뛰는 박자. 달릴 때 더 잦고 경쾌하게.
  if (!blocked && moving && player && player.isLocked()) {
    const interval = sprinting ? FOOTSTEP_INTERVAL * 0.6 : FOOTSTEP_INTERVAL;
    footstepAccum += dt;
    if (footstepAccum >= interval) {
      footstepAccum -= interval;
      audio.footstep(sprinting);
    }
  } else {
    // 멈추면 다음 발이 바로 나도록 박자 리셋(살짝 남겨 자연스럽게)
    footstepAccum = FOOTSTEP_INTERVAL * 0.5;
  }

  // 아침 시계 진행 + 순찰 시간 누적 (게임 종료 전까지)
  if (!finished) {
    clockMinutes += dt * CLOCK_RATE;
    elapsedSec += dt;
    ui.setClock(formatClock(clockMinutes));
  }

  // 교실 트리거 검사 (3층에서, 대화/완료 중이 아닐 때만)
  if (onFloor && player && !blocked && !finished && !encounterBusy) {
    const pos = after;
    for (const t of roomTriggers) {
      if (!visited[t.id] && insideAABB(pos, t)) {
        // 비동기 인카운터 시작(내부에서 중복 가드)
        tryEncounter(t);
        break; // 한 프레임에 하나만
      }
    }
  }

  // 층 전환(계단 ↔ 옥상)
  if (player && !blocked && !finished && !transitioning) {
    if (onFloor && stairUpTrigger && insideAABB(after, stairUpTrigger)) goToRooftop();
    else if (!onFloor && insideAABB(after, roof.exitTrigger)) goToFloorAt(-4, 1.2, 0);
  }

  // NPC 쿨다운 감소 + 순찰 교장/교감 조우(부딪힘) — 3층에서만
  for (const id in npcCooldown) { if (npcCooldown[id] > 0) npcCooldown[id] -= dt; }
  if (onFloor && player && !blocked && !finished && !encounterBusy) {
    const enc = patrollers.getEncounter(after);
    if (enc && !(npcCooldown[enc.id] > 0)) tryPrincipal(enc);
  }

  // 지각생 스침 토스트(멘트 랜덤)
  if (lateToastCd > 0) lateToastCd -= dt;
  if (onFloor && player && !blocked && lateToastCd <= 0 && runners.getNear(after) >= 0) {
    lateToastCd = 7;
    ui.toast(LATE_LINES[Math.floor(Math.random() * LATE_LINES.length)], 1700);
  }

  // 잔재미 이벤트(혼잣말/교내방송/달리기 헐떡임/9시 종)
  if (player && !finished) {
    funEvents.update(dt, after, {
      paused: blocked,
      onFloor,
      running: sprinting,
      clockMinutes,
    });
  }

  // 후드티 학생: 도망 외침 / 단속(잡힘) / 개과천선 인사
  if (player && !finished) {
    const hev = hoodie.update(dt, after, blocked || !onFloor);
    if (hev === 'flee' && !blocked) {
      ui.toast(`${BOSS.name}: 야!! 거기 후드티!! 서라!!!`, 2000);
    } else if (hev === 'caught' && !encounterBusy && !blocked) {
      tryHoodieCatch(after);
    } else if (hev === 'greet' && !blocked) {
      ui.toast('학생: (단정한 교복) 안녕하십니까!! 준식이 선생님!!', 1800);
    }
  }

  // 옥상 매점빵 학생들: 발각 이벤트(바쁘면 대화 없이 바로 도주 — 내부에서 처리)
  if (player) {
    const rev = roofKids.update(dt, after, !onFloor, blocked);
    if (rev === 'spotted') tryRoofBust();
  }

  // 동적 요소 갱신 + 미니맵 + 교사 시선
  if (player) {
    const pausedNpc = blocked || !onFloor;
    patrollers.update(dt, after, pausedNpc);
    runners.update(dt, after, pausedNpc);
    if (onFloor) {
      updateDoors(after, dt);
      bubbles.update(dt, after, blocked);
      updateTeacherGaze(after, dt);
    } else {
      bubbles.update(dt, null, true);
    }
    camera.getWorldDirection(_fwd);
    const dots = onFloor
      ? patrollers.positions().concat(runners.positions(), hoodie.positions())
      : roofKids.positions();
    minimap.update(after.x, after.z, _fwd.x, _fwd.z, visited, dots, !onFloor);
  }

  renderer.render(scene, camera);
}

// =============================================================
//  키 입력 — M(음소거) / H(도움말)
//  (이동 키는 player.js 가 처리, 대화 진행 키는 dialogue.js 가 처리)
//  toggleMute() 는 변경된 muted(boolean) 를 그대로 반환한다.
// =============================================================
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyM') {
    const muted = audio.toggleMute();
    ui.toast('음소거 ' + (muted ? '켜짐' : '꺼짐'));
  } else if (e.code === 'KeyH') {
    ui.showHelp();
  }
});

// ── 타이틀 표시 → 시작 ─────────────────────────────────────
ui.showTitle(startGame);
