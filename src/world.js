// =============================================================
//  마석고 교복지도 — 월드 빌더 (src/world.js)
//  좌표계: X = 동(+)/서(-), Z = 남(+)/북(-), Y = 위. 단위 미터.
//  AABB(평면 충돌/트리거): { minX, maxX, minZ, maxZ } (Y 무시)
//
//  buildWorld(scene):
//    - 큰 바닥 평면 + 복도 강조 장판
//    - 천장
//    - 각 방의 4면 벽(얇은 박스)에 door.dir 쪽 출입구 구멍(약 1.2m) +
//      문틀 + 머리 위 명패(한글 라벨 CanvasTexture)
//    - 교실(type 'classroom'): 문 반대 벽 칠판 + 4x3 책상 그리드 +
//      teacherAnchor(문에서 안쪽으로 ~1.3m, 문 바라보는 heading)
//    - 환경광 + 직사광 + 따뜻한 복도 포인트 라이트 몇 개
//    - 벽 AABB 충돌체(두께 반영, 출입구는 비워 통과 가능)
//    - roomTriggers = 교실 내부 인셋 AABB
//  반환: { colliders, roomTriggers, teacherAnchors:Map<classId,{x,z,heading}> }
// =============================================================

import * as THREE from 'three';
import { PALETTE, WORLD, CORRIDORS, ROOMS } from './data.js';

// ── 상수 ──────────────────────────────────────────────────
const WALL_T = 0.2;          // 벽 두께(m)
const WALL_H = WORLD.wallHeight; // 벽 높이
const DOOR_GAP = 1.4;        // 출입구 폭(약 1.2~1.4m)
const DOOR_H = 2.3;          // 문틀(출입구) 높이
const FRAME_T = 0.12;        // 문틀 두께
const COLLIDER_PAD = 0.02;   // 충돌체 미세 여유

// heading 규약: 0 = +Z(남쪽)를 바라봄. 시계방향 회전(player.js 와 일치).
// 안쪽 법선 방향 -> 그 방향을 바라보는 heading.
const HEADING_BY_DIR = {
  S: 0,             // +Z 남쪽
  W: Math.PI / 2,   // -X 서쪽 (문이 W면 안쪽은 +X 동쪽이지만 heading은 문 쪽=서쪽을 봄)
  N: Math.PI,       // -Z 북쪽
  E: -Math.PI / 2,  // +X 동쪽
};

// ── 색상 살짝 변형(벽면 음영 다양화) ─────────────────────────
function shadeVary(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return c;
}

// ── 한글 라벨 명패 텍스처 ───────────────────────────────────
function makeNameplateTexture(label) {
  const W = 512;
  const H = 160;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');

  // 바탕(남색) + 테두리
  ctx.fillStyle = '#' + new THREE.Color(PALETTE.nameplate).getHexString();
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#' + new THREE.Color(PALETTE.accent).getHexString();
  ctx.lineWidth = 10;
  ctx.strokeRect(6, 6, W - 12, H - 12);

  // 라벨(흰 글씨). 길면 글자 크기 축소.
  ctx.fillStyle = '#f5f5f0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fontSize = 86;
  if (label.length > 6) fontSize = 60;
  if (label.length > 9) fontSize = 46;
  ctx.font = `700 ${fontSize}px "Malgun Gothic","Apple SD Gothic Neo",sans-serif`;
  ctx.fillText(label, W / 2, H / 2 + 4);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ── 박스 벽 메시 + (옵션) 충돌 AABB ─────────────────────────
function addWallBox(group, mat, cx, cz, sx, sz, h, yBase, colliders) {
  const geo = new THREE.BoxGeometry(sx, h, sz);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, yBase + h / 2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (colliders) {
    colliders.push({
      minX: cx - sx / 2 - COLLIDER_PAD,
      maxX: cx + sx / 2 + COLLIDER_PAD,
      minZ: cz - sz / 2 - COLLIDER_PAD,
      maxZ: cz + sz / 2 + COLLIDER_PAD,
    });
  }
  return mesh;
}

// ── 걸레받이(baseboard) — 얇고 낮은 청회색 띠 ───────────────
function addBaseboard(group, trimMat, cx, cz, sx, sz) {
  const h = 0.18;
  const geo = new THREE.BoxGeometry(sx + 0.02, h, sz + 0.02);
  const mesh = new THREE.Mesh(geo, trimMat);
  mesh.position.set(cx, h / 2, cz);
  mesh.receiveShadow = true;
  group.add(mesh);
}

// ── 상단 몰딩(trim) — 벽 꼭대기 띠 ──────────────────────────
function addTopTrim(group, trimMat, cx, cz, sx, sz) {
  const h = 0.14;
  const geo = new THREE.BoxGeometry(sx + 0.03, h, sz + 0.03);
  const mesh = new THREE.Mesh(geo, trimMat);
  mesh.position.set(cx, WALL_H - h / 2, cz);
  group.add(mesh);
}

// ── 한 벽면(출입구 유무) 빌드 ───────────────────────────────
// axis: 'x' = X축을 따라 길게 뻗은 벽(남/북 벽), 'z' = Z축을 따라(동/서 벽)
// center: 벽 중심선의 고정 좌표(X벽이면 z고정, Z벽이면 x고정)
// span: [a,b] 벽이 덮는 가변축 범위
// hasDoor: 가운데 출입구 구멍 여부, doorCoord: 출입구 중심(가변축 좌표)
function buildWallSide(opts) {
  const { group, wallMat, trimMat, axis, fixed, spanA, spanB, hasDoor, doorCoord, colliders } = opts;
  const lo = Math.min(spanA, spanB);
  const hi = Math.max(spanA, spanB);

  // 가변축 세그먼트 목록 [start,end]
  let segments;
  if (hasDoor) {
    const gapLo = doorCoord - DOOR_GAP / 2;
    const gapHi = doorCoord + DOOR_GAP / 2;
    segments = [];
    if (gapLo - lo > 0.05) segments.push([lo, gapLo]);
    if (hi - gapHi > 0.05) segments.push([gapHi, hi]);
  } else {
    segments = [[lo, hi]];
  }

  for (const [s, e] of segments) {
    const len = e - s;
    if (len <= 0.001) continue;
    const mid = (s + e) / 2;
    let cx, cz, sx, sz;
    if (axis === 'x') {
      // X축을 따라 뻗음: z 고정
      cx = mid; cz = fixed; sx = len; sz = WALL_T;
    } else {
      // Z축을 따라 뻗음: x 고정
      cx = fixed; cz = mid; sx = WALL_T; sz = len;
    }
    addWallBox(group, wallMat, cx, cz, sx, sz, WALL_H, 0, colliders);
    addBaseboard(group, trimMat, cx, cz, sx, sz);
    addTopTrim(group, trimMat, cx, cz, sx, sz);
  }

  // 출입구 상단 인방(lintel) — 구멍 위 통과 가능한 빈틈을 막는 위쪽 벽(충돌 없음)
  if (hasDoor) {
    let cx, cz, sx, sz;
    if (axis === 'x') {
      cx = doorCoord; cz = fixed; sx = DOOR_GAP; sz = WALL_T;
    } else {
      cx = fixed; cz = doorCoord; sx = WALL_T; sz = DOOR_GAP;
    }
    const lintelH = WALL_H - DOOR_H;
    if (lintelH > 0.01) {
      const geo = new THREE.BoxGeometry(sx, lintelH, sz);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(cx, DOOR_H + lintelH / 2, cz);
      mesh.castShadow = true;
      group.add(mesh);
      addTopTrim(group, trimMat, cx, cz, sx, sz);
    }
    // 문틀/명패는 buildRoom 에서 출입구가 난 벽에 한 번만 추가한다.
  }
}

// ── 문틀: 출입구 둘레 목재 프레임 ───────────────────────────
function addDoorFrame(group, frameMat, axis, fixed, doorCoord) {
  const jambH = DOOR_H;
  const halfGap = DOOR_GAP / 2;
  const addPiece = (cx, cz, sx, sy, sz, cy) => {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const m = new THREE.Mesh(geo, frameMat);
    m.position.set(cx, cy, cz);
    m.castShadow = true;
    group.add(m);
  };

  if (axis === 'x') {
    // X축 벽: 출입구는 X 방향, 기둥은 doorCoord±halfGap
    addPiece(doorCoord - halfGap, fixed, FRAME_T, jambH, WALL_T + 0.06, jambH / 2);
    addPiece(doorCoord + halfGap, fixed, FRAME_T, jambH, WALL_T + 0.06, jambH / 2);
    // 상인방
    addPiece(doorCoord, fixed, DOOR_GAP + FRAME_T, FRAME_T, WALL_T + 0.06, jambH - FRAME_T / 2);
  } else {
    // Z축 벽
    addPiece(fixed, doorCoord - halfGap, WALL_T + 0.06, jambH, FRAME_T, jambH / 2);
    addPiece(fixed, doorCoord + halfGap, WALL_T + 0.06, jambH, FRAME_T, jambH / 2);
    addPiece(fixed, doorCoord, WALL_T + 0.06, FRAME_T, DOOR_GAP + FRAME_T, jambH - FRAME_T / 2);
  }
}

// ── 명패: 문 위쪽 작은 평면 ─────────────────────────────────
// dir: 문이 난 벽면(복도 쪽). 명패는 그 '바깥(복도)' 면 위로 띄워야 가려지지 않는다.
function addNameplate(group, label, axis, fixed, doorCoord, dir) {
  const tex = makeNameplateTexture(label);
  const plateW = 1.6;
  const plateH = 0.5;
  const geo = new THREE.PlaneGeometry(plateW, plateH);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false });
  const mesh = new THREE.Mesh(geo, mat);
  const y = DOOR_H + 0.36;
  const off = WALL_T / 2 + 0.03;
  // 복도 방향(바깥) 부호: S/E 문은 +(maxZ/maxX 바깥), W/N 문은 -(minX/minZ 바깥).
  // 항상 + 로 두면 벽 안쪽(방)으로 박혀 복도에서 안 보인다.
  const s = (dir === 'S' || dir === 'E') ? +1 : -1;
  // 평면의 '앞면'(+Z)이 항상 복도(바깥) 쪽을 향해야 글자가 거울상이 안 된다.
  if (axis === 'x') {
    // X축 벽(남/북). 복도 쪽(바깥)을 향하게 약간 띄움.
    mesh.position.set(doorCoord, y, fixed + s * off);
    mesh.rotation.y = s > 0 ? 0 : Math.PI;
  } else {
    // Z축 벽(동/서).
    mesh.position.set(fixed + s * off, y, doorCoord);
    mesh.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  mat.side = THREE.DoubleSide;
  group.add(mesh);
}

// ── 칠판: 문 반대 벽 안쪽 평면 ──────────────────────────────
function addChalkboard(group, room) {
  const dir = room.door.dir;
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(room.w - 1.6, 4.2), 1.3),
    new THREE.MeshStandardMaterial({ color: PALETTE.chalkboard, roughness: 0.9, metalness: 0.0 })
  );
  // 분필 자국 느낌의 살짝 밝은 테두리
  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(room.w - 1.4, 4.4), 1.5),
    new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: 0.7 })
  );
  const y = 1.55;
  const inset = WALL_T / 2 + 0.04;
  // 문 반대 벽 = door.dir 의 정반대.
  const half = { w: room.w / 2, d: room.d / 2 };
  let bx = room.x, bz = room.z, ry = 0;
  if (dir === 'S') { // 문 남쪽 -> 칠판 북벽(minZ)
    bz = room.z - half.d + inset; ry = 0;
  } else if (dir === 'N') { // 칠판 남벽(maxZ)
    bz = room.z + half.d - inset; ry = Math.PI;
  } else if (dir === 'W') { // 칠판 동벽(maxX)
    bx = room.x + half.w - inset; ry = -Math.PI / 2;
  } else { // E -> 칠판 서벽(minX)
    bx = room.x - half.w + inset; ry = Math.PI / 2;
  }
  frame.position.set(bx, y, bz);
  frame.rotation.y = ry;
  board.position.set(bx, y, bz);
  board.rotation.y = ry;
  // 칠판을 프레임보다 살짝 앞으로
  const fwd = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, ry, 0)).multiplyScalar(0.01);
  board.position.add(fwd);
  group.add(frame);
  group.add(board);
}

// ── 결정적(seeded) 의사난수 — 인덱스 기반 변형용 ────────────
// 빌드 시 1회 평가. 같은 seed -> 항상 같은 값(프레임마다 바뀌지 않음).
function seeded(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ── 교복/머리/피부 변형 팔레트(저폴리, PALETTE 톤) ──────────
const SKIN_TONES = [0xf0d2b4, 0xe8c4a0, 0xe0b896, 0xd6a878, 0xc8946a];
const HAIR_TONES = [0x1f1c1a, 0x2b2622, 0x3a2c22, 0x4a3526, 0x14110f];
// 상의: 흰 셔츠 / 남색 / 차콜 / 가디건 톤
const UNIFORM_TOPS = [0xf2efe6, 0xf2efe6, 0x2b3a4a, 0x35506b, 0x303338];
const TIE_TONES = [0x8a2b35, 0x2b3a4a, 0x35506b, 0x4a4f5a];

// ── 한 명의 착석 학생(저폴리) — 정면 +Z 기준으로 만든 뒤 회전 ──
// teachers.js 의 buildFigure 룩과 맞춤: 머리(sphere)+머리캡+토르소 박스+팔.
// 앉은 자세이므로 다리는 생략하고 의자 위에 토르소만 올린다.
function buildSeatedStudent(seed) {
  const g = new THREE.Group();
  g.name = 'student';

  const skin = SKIN_TONES[Math.floor(seeded(seed * 3.1) * SKIN_TONES.length)];
  const hair = HAIR_TONES[Math.floor(seeded(seed * 7.7) * HAIR_TONES.length)];
  const top = UNIFORM_TOPS[Math.floor(seeded(seed * 5.3) * UNIFORM_TOPS.length)];
  const hasTie = seeded(seed * 9.4) > 0.45;
  const tie = TIE_TONES[Math.floor(seeded(seed * 11.2) * TIE_TONES.length)];

  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.85, metalness: 0.0 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9, metalness: 0.0 });
  const topMat = new THREE.MeshStandardMaterial({ color: top, roughness: 0.8, metalness: 0.05 });

  // 착석 치수: 의자 좌면(약 0.46) 위에 토르소. 정면 +Z(앞=책상/칠판 쪽).
  const seatY = 0.46;
  const torsoH = 0.46;
  const torsoY = seatY + torsoH / 2;       // 토르소 중심
  const torsoTopY = seatY + torsoH;        // 어깨 높이
  const headR = 0.13;
  const headY = torsoTopY + 0.05 + headR;  // 머리 중심

  // 토르소 (교복 상의색)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, torsoH, 0.22), topMat);
  torso.position.set(0, torsoY, 0);
  torso.castShadow = true;
  g.add(torso);

  // 칼라(흰) — 목 아래 작은 박스
  const collar = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.06, 0.18),
    new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.8 })
  );
  collar.position.set(0, torsoTopY - 0.02, 0.02);
  g.add(collar);

  // 넥타이(옵션) — 앞면 얇은 띠
  if (hasTie) {
    const tieMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.22, 0.02),
      new THREE.MeshStandardMaterial({ color: tie, roughness: 0.7 })
    );
    tieMesh.position.set(0, torsoTopY - 0.16, 0.115);
    g.add(tieMesh);
  }

  // 목 (skin)
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.055, 0.07, 8),
    skinMat
  );
  neck.position.set(0, torsoTopY + 0.025, 0);
  g.add(neck);

  // 머리 (skin)
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 12, 10), skinMat);
  head.position.set(0, headY, 0);
  head.castShadow = true;
  g.add(head);

  // 머리카락 캡 (반구) — teachers.js short 스타일과 동일 톤
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(headR * 1.07, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
    hairMat
  );
  cap.position.set(0, headY + headR * 0.05, 0);
  g.add(cap);
  // 뒤통수 채움(짧은 머리 느낌)
  const backHair = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.9, 10, 8), hairMat);
  backHair.scale.set(1, 1, 0.7);
  backHair.position.set(0, headY - headR * 0.1, -headR * 0.5);
  g.add(backHair);

  // 팔 (상의색) — 앞(+Z, 책상)으로 뻗어 책상에 기댄 모습
  const armGeo = new THREE.CapsuleGeometry(0.045, 0.34, 4, 6);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, topMat);
    arm.position.set(sx * 0.15, torsoTopY - 0.1, 0.16);
    arm.rotation.x = Math.PI / 2.4; // 앞으로 뻗음
    arm.castShadow = true;
    g.add(arm);
    // 손 (skin) — 책상 위
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), skinMat);
    hand.position.set(sx * 0.15, torsoTopY - 0.14, 0.34);
    g.add(hand);
  }

  return g;
}

// ── 책상 4x3 그리드 + 착석 학생 + 의자 ──────────────────────
// 학생은 칠판(문 반대편)을 바라보고 앉는다. 책상 '뒤'(칠판 반대쪽)에서
// 칠판 쪽으로 향함. teacherAnchor / 출입구 경로 위에는 앉히지 않는다.
function addDesks(group, room, deskMat, chairMat, deskIndexRef, anchor) {
  const cols = 4; // X 방향(가로)
  const rows = 3; // Z 방향(세로)
  const usableW = room.w - 1.8;
  const usableD = room.d - 1.8;
  const gx = usableW / (cols - 1 || 1);
  const gz = usableD / (rows - 1 || 1);
  const startX = room.x - usableW / 2;
  const startZ = room.z - usableD / 2;
  const deskGeo = new THREE.BoxGeometry(0.7, 0.72, 0.5);
  const chairGeo = new THREE.BoxGeometry(0.42, 0.46, 0.42);

  // 칠판 방향(안쪽 법선의 반대 = 문 반대쪽). 학생은 이 방향을 '바라봄'.
  // 모든 교실 문이 W 이므로 칠판은 동(+X). 일반화하여 처리.
  const dir = room.door.dir;
  // 학생이 바라보는 방향 벡터(칠판 쪽)
  let faceX = 0, faceZ = 0;
  if (dir === 'W') { faceX = 1; }       // 칠판 동(+X)
  else if (dir === 'E') { faceX = -1; } // 칠판 서(-X)
  else if (dir === 'N') { faceZ = 1; }  // 칠판 남(+Z)
  else { faceZ = -1; }                   // S -> 칠판 북(-Z)

  // 정면 +Z 기준 피규어를 faceX/faceZ 방향으로 돌리는 heading.
  // (atan2(x,z): +Z->0, +X->PI/2, -Z->PI, -X->-PI/2)
  const studentHeading = Math.atan2(faceX, faceZ);

  // 학생은 책상보다 칠판 반대편(즉 -face 방향)으로 0.36m 물러나 앉음.
  const back = 0.42;

  // 방마다 좌석 점유/외형이 달라지도록 방 id 해시를 시드에 섞는다(결정적).
  let roomSeed = 0;
  for (let i = 0; i < room.id.length; i++) roomSeed = (roomSeed * 31 + room.id.charCodeAt(i)) & 0x7fff;

  // 가장 칠판에 가까운 열/행 한 줄은 비워(교사/칠판 앞 공간 + 시야) — 변형감.
  let placed = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dx = startX + c * gx;
      const dz = startZ + r * gz;
      const desk = new THREE.Mesh(deskGeo, deskMat);
      desk.position.set(dx, 0.36, dz);
      desk.castShadow = true;
      desk.receiveShadow = true;
      group.add(desk);

      // 의자 — 학생이 앉는 쪽(칠판 반대편)
      const chair = new THREE.Mesh(chairGeo, chairMat);
      chair.position.set(dx - faceX * 0.5, 0.23, dz - faceZ * 0.5);
      chair.castShadow = true;
      group.add(chair);

      // 학생 착석 위치(책상 뒤, 칠판 반대편)
      const sx = dx - faceX * back;
      const sz = dz - faceZ * back;

      // 좌석 점유 여부(결정적): 대부분 채우되 ~1~3석은 빈 자리.
      deskIndexRef.v += 1;
      let occ = seeded(roomSeed * 0.21 + deskIndexRef.v * 1.7) > 0.18;
      // 교사 앵커(문 안쪽) 너무 가까운 좌석은 비워 교사와 겹치지 않게.
      if (anchor) {
        const ddx = sx - anchor.x;
        const ddz = sz - anchor.z;
        if (ddx * ddx + ddz * ddz < 1.1 * 1.1) occ = false;
      }
      if (occ) {
        const student = buildSeatedStudent(roomSeed * 17 + deskIndexRef.v * 13 + 7);
        student.position.set(sx, 0, sz);
        student.rotation.y = studentHeading;
        group.add(student);
        placed += 1;
      }
    }
  }
  return placed;
}

// ── 교실 부속 소품: 교탁/시계/게시판/형광등 ─────────────────
// 칠판(문 반대 벽) 정보로 정면 방향을 잡는다. 충돌체 추가 없음.
function addClassroomProps(group, room) {
  const dir = room.door.dir;
  const half = { w: room.w / 2, d: room.d / 2 };
  const inset = WALL_T / 2 + 0.04;

  // 칠판 벽 중심 좌표 + 그 벽의 안쪽 법선(방 안쪽 = +면 방향)
  let bx = room.x, bz = room.z, ry = 0;
  let inX = 0, inZ = 0;             // 칠판 벽에서 방 안쪽으로 향하는 단위벡터
  if (dir === 'S') { bz = room.z - half.d + inset; ry = 0; inZ = 1; }
  else if (dir === 'N') { bz = room.z + half.d - inset; ry = Math.PI; inZ = -1; }
  else if (dir === 'W') { bx = room.x + half.w - inset; ry = -Math.PI / 2; inX = -1; }
  else { bx = room.x - half.w + inset; ry = Math.PI / 2; inX = 1; }

  // 교탁(lectern) — 칠판 앞 0.7m, 약간 오른쪽으로
  const lecternMat = new THREE.MeshStandardMaterial({ color: PALETTE.doorFrame, roughness: 0.6 });
  const lectern = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.05, 0.5), lecternMat);
  // 칠판 벽 법선 방향으로 0.75m 안쪽, 측면으로 0.6m
  const sideX = inZ;  // 벽이 X축이면 측면은 X, Z축이면 측면은 Z
  const sideZ = inX;
  lectern.position.set(
    bx + inX * 0.75 + sideX * 0.7,
    0.52,
    bz + inZ * 0.75 + sideZ * 0.7
  );
  lectern.castShadow = true;
  group.add(lectern);
  // 교탁 상판(살짝 밝게)
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(0.74, 0.06, 0.54),
    new THREE.MeshStandardMaterial({ color: PALETTE.desk, roughness: 0.55 })
  );
  top.position.set(lectern.position.x, 1.06, lectern.position.z);
  group.add(top);

  // 벽시계 — 칠판 위쪽 벽, 살짝 높게
  const clockBack = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 20),
    new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 })
  );
  const clockFrame = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.26, 24),
    new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.5 })
  );
  const clockY = 2.55;
  clockBack.position.set(bx + inX * 0.02, clockY, bz + inZ * 0.02);
  clockBack.rotation.y = ry;
  clockFrame.position.set(bx + inX * 0.025, clockY, bz + inZ * 0.025);
  clockFrame.rotation.y = ry;
  group.add(clockBack);
  group.add(clockFrame);
  // 시침/분침
  const handMat = new THREE.MeshStandardMaterial({ color: 0x202024, roughness: 0.5 });
  const hMin = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.18), handMat);
  const hHour = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.12), handMat);
  for (const h of [hMin, hHour]) {
    h.position.set(bx + inX * 0.03, clockY, bz + inZ * 0.03);
    h.rotation.y = ry;
    group.add(h);
  }
  hMin.position.y += 0.07; // 12시 방향
  hHour.rotation.z = Math.PI / 2.5;

  // 게시판/포스터 — 칠판과 직각인 측면 벽(앞쪽 절반)
  // 측면 벽: 칠판 벽이 X축(S/N)이면 측벽은 동/서(Z축), 반대면 남/북(X축).
  const posterColors = [0xd94f4f, 0x4a8ca0, 0xc98a5a];
  for (let i = 0; i < 2; i++) {
    const col = posterColors[(room.id.charCodeAt(room.id.length - 1) + i) % posterColors.length];
    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 1.0),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, side: THREE.DoubleSide })
    );
    let px, pz, pry;
    if (dir === 'S' || dir === 'N') {
      // 칠판은 X축 벽 -> 측벽은 동벽(maxX). 포스터를 동벽 안쪽에.
      px = room.x + half.w - inset;
      pz = bz + inZ * (1.6 + i * 1.6);
      pry = -Math.PI / 2;
    } else {
      // 칠판은 Z축 벽 -> 측벽은 남벽(maxZ). 포스터를 남벽 안쪽에.
      px = bx + inX * (1.6 + i * 1.6);
      pz = room.z + half.d - inset;
      pry = 0;
    }
    poster.position.set(px, 1.7, pz);
    poster.rotation.y = pry;
    group.add(poster);
  }

  // 천장 형광등 — 교실 중앙에 2개
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff7e0, emissive: 0xffe9bf, emissiveIntensity: 0.85, roughness: 0.4,
  });
  for (const off of [-1.2, 1.2]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.28), lampMat);
    if (dir === 'S' || dir === 'N') {
      lamp.position.set(room.x, WALL_H - 0.07, room.z + off);
    } else {
      lamp.rotation.y = Math.PI / 2;
      lamp.position.set(room.x + off, WALL_H - 0.07, room.z);
    }
    group.add(lamp);
  }
}

// ── 한 방 전체 빌드 ─────────────────────────────────────────
// 반환: { studentLight:THREE.Light|null, studentCount:number } — 통계/조명용
function buildRoom(scene, room, mats, colliders, anchor, doors) {
  const group = new THREE.Group();
  group.name = 'room_' + room.id;
  let studentCount = 0;

  // 방 벽 음영을 라벨 해시로 살짝 다양화
  let h = 0;
  for (let i = 0; i < room.id.length; i++) h = (h * 31 + room.id.charCodeAt(i)) & 0xffff;
  const vary = ((h % 7) - 3) * 0.012;
  const wallMat = mats.wall.clone();
  wallMat.color = shadeVary(room.color || PALETTE.wall, vary);

  const half = { w: room.w / 2, d: room.d / 2 };
  const minX = room.x - half.w;
  const maxX = room.x + half.w;
  const minZ = room.z - half.d;
  const maxZ = room.z + half.d;
  const dir = room.door.dir;

  // 4면. 각 면에서 door.dir 와 일치하는 벽만 출입구 구멍.
  // 남벽(maxZ, X축), 북벽(minZ, X축), 동벽(maxX, Z축), 서벽(minX, Z축)
  buildWallSide({
    group, wallMat, trimMat: mats.trim, axis: 'x', fixed: maxZ,
    spanA: minX, spanB: maxX, hasDoor: dir === 'S', doorCoord: room.door.x,
    colliders,
  });
  buildWallSide({
    group, wallMat, trimMat: mats.trim, axis: 'x', fixed: minZ,
    spanA: minX, spanB: maxX, hasDoor: dir === 'N', doorCoord: room.door.x,
    colliders,
  });
  buildWallSide({
    group, wallMat, trimMat: mats.trim, axis: 'z', fixed: maxX,
    spanA: minZ, spanB: maxZ, hasDoor: dir === 'E', doorCoord: room.door.z,
    colliders,
  });
  buildWallSide({
    group, wallMat, trimMat: mats.trim, axis: 'z', fixed: minX,
    spanA: minZ, spanB: maxZ, hasDoor: dir === 'W', doorCoord: room.door.z,
    colliders,
  });

  // 문틀 + 명패는 출입구가 난 벽에서만.
  if (dir === 'S' || dir === 'N') {
    const fixed = dir === 'S' ? maxZ : minZ;
    addDoorFrame(group, mats.frame, 'x', fixed, room.door.x);
    addNameplate(group, room.label, 'x', fixed, room.door.x, dir);
  } else {
    const fixed = dir === 'E' ? maxX : minX;
    addDoorFrame(group, mats.frame, 'z', fixed, room.door.z);
    addNameplate(group, room.label, 'z', fixed, room.door.z, dir);
  }

  // 교실 내부 소품
  let studentLight = null;
  if (room.type === 'classroom') {
    addChalkboard(group, room);
    // 여닫이 문짝(시각 전용) — 출입구에 hinged leaf 추가.
    if (doors) {
      const leaf = addDoorLeaf(group, room, mats.doorLeaf, mats.doorPane, mats.doorHandle);
      doors.set(room.id, leaf);
    }
    const deskIndexRef = { v: 0 };
    studentCount = addDesks(group, room, mats.desk, mats.chair, deskIndexRef, anchor);
    addClassroomProps(group, room);

    // 교실 내부 따뜻한 포인트 라이트 — 교사 앵커(문 안쪽) 근처를 밝힘.
    // 교사 얼굴/학생이 잘 보이도록 앵커보다 살짝 위·앞에 배치.
    if (anchor) {
      const pl = new THREE.PointLight(0xffe9c4, 0.95, 13, 1.8);
      pl.position.set(anchor.x, WALL_H - 0.55, anchor.z);
      pl.name = 'classroomLight_' + room.id;
      group.add(pl);
      studentLight = pl;
    }
  }

  scene.add(group);
  return { studentLight, studentCount };
}

// ── 출입구 안쪽 법선(방 내부 방향) ──────────────────────────
function inwardNormal(dir) {
  switch (dir) {
    case 'S': return { x: 0, z: -1 }; // 문이 남쪽 -> 안쪽은 북(-Z)
    case 'N': return { x: 0, z: 1 };
    case 'W': return { x: 1, z: 0 };  // 문이 서쪽 -> 안쪽은 동(+X)
    case 'E': return { x: -1, z: 0 };
    default: return { x: 0, z: 0 };
  }
}

// ── 여닫이 문짝(hinged door leaf) ───────────────────────────
// 출입구 1.4m 틈을 닫는 목재 문짝. 경첩(pivot) 그룹을 틈 한쪽 끝(벽선 위)에
// 놓고, pivot.rotation.y = 0 이면 닫힘(틈을 막음), 회전하면 방 안쪽(복도 반대)
// 으로 ~100° 열린다. 충돌체에는 절대 추가하지 않는다(순수 시각용).
// 반환: { pivot:THREE.Group, openAngle:number } (열림 각도, 안쪽 방향 부호 반영)
const DOOR_LEAF_W = 1.32;     // 문짝 폭(틈 1.4 보다 약간 작게)
const DOOR_LEAF_H = 2.12;     // 문짝 높이(문틀 상인방 아래)
const DOOR_LEAF_T = 0.06;     // 문짝 두께
const DOOR_OPEN = (100 * Math.PI) / 180; // 열림 각도 크기(~100°)

function addDoorLeaf(group, room, doorMat, paneMat, handleMat) {
  const dir = room.door.dir;
  const half = { w: room.w / 2, d: room.d / 2 };
  const halfGap = DOOR_GAP / 2;
  const yc = DOOR_LEAF_H / 2; // 문짝 중심 Y (바닥 0 ~ 상단 ~2.12)

  // 벽선 좌표(fixed) 와 경첩 위치 결정.
  const pivot = new THREE.Group();
  pivot.name = 'doorPivot_' + room.id;

  // 문짝 본체(슬랩). 축에 따라 폭 방향이 X 또는 Z.
  let slab, pane, handle, openAngle;

  if (dir === 'S' || dir === 'N') {
    // X축 벽: 출입구는 X 방향. 벽선 Z = fixed.
    const fixedZ = dir === 'S' ? room.z + half.d : room.z - half.d;
    // 경첩을 틈의 -X 끝에 둔다. 문짝은 local +X 로 뻗는다.
    pivot.position.set(room.door.x - halfGap, 0, fixedZ);
    // 슬랩: 폭=X, 두께=Z
    slab = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR_LEAF_W, DOOR_LEAF_H, DOOR_LEAF_T),
      doorMat
    );
    slab.position.set(DOOR_LEAF_W / 2, yc, 0);
    // 안쪽 법선 z 부호: S->-1, N->+1. 자유단 Z오프셋 = -L·sinθ 이므로
    // 안쪽으로 열리려면 openAngle = -nz·DOOR_OPEN.
    const nz = dir === 'S' ? -1 : 1;
    openAngle = -nz * DOOR_OPEN;
    // 상단 유리창(약간 위쪽, 살짝 투명)
    pane = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR_LEAF_W * 0.62, DOOR_LEAF_H * 0.34, DOOR_LEAF_T + 0.01),
      paneMat
    );
    pane.position.set(DOOR_LEAF_W / 2, yc + DOOR_LEAF_H * 0.22, 0);
    // 손잡이: 경첩 반대(자유단) 쪽, 양면으로 살짝 돌출
    handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), handleMat);
    handle.position.set(DOOR_LEAF_W - 0.12, yc - 0.05, DOOR_LEAF_T / 2 + 0.03);
  } else {
    // Z축 벽: 출입구는 Z 방향. 벽선 X = fixed.
    const fixedX = dir === 'E' ? room.x + half.w : room.x - half.w;
    // 경첩을 틈의 -Z 끝에 둔다. 문짝은 local +Z 로 뻗는다.
    pivot.position.set(fixedX, 0, room.door.z - halfGap);
    // 슬랩: 폭=Z, 두께=X
    slab = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR_LEAF_T, DOOR_LEAF_H, DOOR_LEAF_W),
      doorMat
    );
    slab.position.set(0, yc, DOOR_LEAF_W / 2);
    // 안쪽 법선 x 부호: W->+1, E->-1. 자유단 X오프셋 = +L·sinθ 이므로
    // 안쪽으로 열리려면 openAngle = nx·DOOR_OPEN.
    const nx = dir === 'W' ? 1 : -1;
    openAngle = nx * DOOR_OPEN;
    pane = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR_LEAF_T + 0.01, DOOR_LEAF_H * 0.34, DOOR_LEAF_W * 0.62),
      paneMat
    );
    pane.position.set(0, yc + DOOR_LEAF_H * 0.22, DOOR_LEAF_W / 2);
    handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), handleMat);
    handle.position.set(DOOR_LEAF_T / 2 + 0.03, yc - 0.05, DOOR_LEAF_W - 0.12);
  }

  slab.castShadow = true;
  slab.receiveShadow = true;
  pivot.add(slab);
  pivot.add(pane);
  pivot.add(handle);
  // 시각용 전용: 충돌체에 추가하지 않는다.
  group.add(pivot);

  return { pivot, openAngle };
}

// =============================================================
//  복도 소품(장식 전용) — 충돌체에 추가하지 않는다.
//  배치 규칙(하드 제약):
//   - 복도는 폭 3m. 소품은 긴 벽에 바짝(중심선에서 ±~1.3m) 붙여 중앙 ~2m 비움.
//   - 어떤 문(door.x/door.z)으로부터도 긴축으로 1.2m 이상 떨어뜨림.
//   - 변형은 인덱스/좌표 기반(seeded), 프레임마다 바뀌지 않음.
// =============================================================

// 복도 한 칸의 기하를 정규화: 긴축(L)/짧은축(perp) 정보 반환.
//  isWide=true 면 긴축=X, 짧은축=Z. wallSign 두 변(±)에 벽이 있음.
function corridorGeom(c) {
  const isWide = c.w >= c.d;
  if (isWide) {
    return {
      isWide,
      loA: c.x - c.w / 2, hiA: c.x + c.w / 2, // 긴축(X) 범위
      perpCenter: c.z,                          // 짧은축 중심
      perpHalf: c.d / 2,                        // 1.5
    };
  }
  return {
    isWide,
    loA: c.z - c.d / 2, hiA: c.z + c.d / 2,     // 긴축(Z) 범위
    perpCenter: c.x,
    perpHalf: c.w / 2,
  };
}

// 긴축 좌표 a, 벽쪽 부호 wallSign(-1/+1)로 월드 (x,z) 만든다.
// off = 짧은축에서 벽 안쪽으로 들어온 거리(중심선 기준 perpHalf-off 위치).
function corridorPoint(g, a, wallSign, off) {
  const perp = g.perpCenter + wallSign * (g.perpHalf - off);
  return g.isWide ? { x: a, z: perp } : { x: perp, z: a };
}

// 긴축 좌표 a 가 어떤 문과 너무 가까운가? (문은 복도 긴축 위의 한 점)
//  doorsAlong: 이 복도 긴축 위 문 좌표 배열. clearance 이내면 true.
function nearDoor(a, doorsAlong, clearance) {
  for (let i = 0; i < doorsAlong.length; i++) {
    if (Math.abs(a - doorsAlong[i]) < clearance) return true;
  }
  return false;
}

// 사물함 공용 기하(재사용) — 수백 개 인스턴스가 같은 지오메트리를 공유.
// 메시 절제를 위해 1칸 = 본체 + 손잡이/통풍 디테일 1개(2메시)로 단순화.
const LOCKER_W = 0.4, LOCKER_H = 1.8, LOCKER_D = 0.42;
const LOCKER_BODY_GEO = new THREE.BoxGeometry(LOCKER_W, LOCKER_H, LOCKER_D);
// 손잡이 + 통풍 슬릿을 한 메시로: 가는 세로 막대(손잡이) 위에 살짝 넓은 상단.
const LOCKER_TRIM_GEO = new THREE.BoxGeometry(0.05, 0.5, 0.03);

// 사물함 1칸(슬림 박스 + 손잡이 디테일). 정면 +Z 기준으로 만든 뒤 회전.
function buildLocker(bodyMat, handleMat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(LOCKER_BODY_GEO, bodyMat);
  body.position.y = LOCKER_H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // 손잡이/디테일(세로 막대) — 문 앞면(+Z), 살짝 오른쪽.
  const trim = new THREE.Mesh(LOCKER_TRIM_GEO, handleMat);
  trim.position.set(LOCKER_W * 0.28, LOCKER_H * 0.55, LOCKER_D / 2 + 0.016);
  g.add(trim);
  return g;
}

// 화분 + 잎(구/원뿔 몇 개). 저폴리.
function buildPlant(potMat, leafMat, leafMat2, variant) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.34, 10), potMat);
  pot.position.y = 0.17;
  pot.castShadow = true;
  g.add(pot);
  const pot2 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.06, 10), potMat);
  pot2.position.y = 0.34;
  g.add(pot2);
  if (variant === 0) {
    // 둥근 관목 — 잎 구 3개
    const r = [0.26, 0.2, 0.18];
    const off = [[0, 0.62, 0], [-0.16, 0.5, 0.05], [0.15, 0.52, -0.04]];
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(r[i], 8, 6), i === 1 ? leafMat2 : leafMat);
      leaf.position.set(off[i][0], off[i][1], off[i][2]);
      leaf.castShadow = true;
      g.add(leaf);
    }
  } else {
    // 침엽수형 — 원뿔 2단
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 8), leafMat);
    c1.position.y = 0.62; c1.castShadow = true; g.add(c1);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 8), leafMat2);
    c2.position.y = 0.92; c2.castShadow = true; g.add(c2);
  }
  return g;
}

// 벽걸이 평면(배너/게시판/포스터): 프레임 박스 + 앞면 평면.
//  axis 'x' = X축 벽(법선 ±Z), 'z' = Z축 벽(법선 ±X). faceSign = 복도 안쪽 부호.
function addWallPanel(group, x, z, axis, faceSign, w, h, y, frameMat, faceMat) {
  const t = 0.05;
  let ry, sx, sz;
  if (axis === 'x') { ry = faceSign > 0 ? 0 : Math.PI; sx = w; sz = t; }
  else { ry = faceSign > 0 ? Math.PI / 2 : -Math.PI / 2; sx = t; sz = w; }
  // 프레임(약간 큰 박스)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.08, h + 0.08, sz + 0.08), frameMat);
  frame.position.set(x, y, z);
  group.add(frame);
  // 앞면 평면(프레임보다 살짝 복도 쪽으로)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
  const eps = 0.05;
  if (axis === 'x') face.position.set(x, y, z + faceSign * eps);
  else face.position.set(x + faceSign * eps, y, z);
  face.rotation.y = ry;
  group.add(face);
}

// 벽시계(원판 + 테두리 + 바늘). 정면 법선 faceSign 방향.
function addWallClock(group, x, z, axis, faceSign, y, faceMat, frameMat, handMat) {
  let ry;
  if (axis === 'x') ry = faceSign > 0 ? 0 : Math.PI;
  else ry = faceSign > 0 ? Math.PI / 2 : -Math.PI / 2;
  const nx = axis === 'z' ? faceSign : 0;
  const nz = axis === 'x' ? faceSign : 0;
  const back = new THREE.Mesh(new THREE.CircleGeometry(0.2, 18), faceMat);
  back.position.set(x + nx * 0.02, y, z + nz * 0.02); back.rotation.y = ry; group.add(back);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.24, 22), frameMat);
  ring.position.set(x + nx * 0.025, y, z + nz * 0.025); ring.rotation.y = ry; group.add(ring);
  const hMin = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.16), handMat);
  hMin.position.set(x + nx * 0.03, y + 0.06, z + nz * 0.03); hMin.rotation.y = ry; group.add(hMin);
  const hHour = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.1), handMat);
  hHour.position.set(x + nx * 0.03, y, z + nz * 0.03); hHour.rotation.y = ry;
  hHour.rotation.z = Math.PI / 2.2; group.add(hHour);
}

// 방향 표지판("2학년 →") — 작은 캔버스 텍스처 평면(천장 아래 매달림).
function makeSignTexture(label) {
  const W = 320, H = 96;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#' + new THREE.Color(PALETTE.nameplate).getHexString();
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#f5f5f0';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  ctx.fillStyle = '#f5f5f0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 52px "Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  ctx.fillText(label, W / 2, H / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function addDirectionSign(group, x, z, axis, faceSign, label) {
  const tex = makeSignTexture(label);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.3), mat);
  let ry;
  if (axis === 'x') ry = faceSign > 0 ? 0 : Math.PI;
  else ry = faceSign > 0 ? Math.PI / 2 : -Math.PI / 2;
  sign.position.set(x, WALL_H - 0.55, z);
  sign.rotation.y = ry;
  group.add(sign);
}

// 트로피 전시장: 유리 느낌 박스 + 안쪽 금색 트로피 몇 개.
function addTrophyCase(group, x, z, axis, faceSign) {
  const caseMat = new THREE.MeshStandardMaterial({
    color: 0x9fb8c4, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.32,
  });
  const baseMat = new THREE.MeshStandardMaterial({ color: PALETTE.doorFrame, roughness: 0.6 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd9b44a, roughness: 0.35, metalness: 0.6 });
  // 캐비닛 본체: 긴축으로 1.6m, 높이 1.7m, 벽쪽 두께 0.4m
  let bw, bd;
  if (axis === 'x') { bw = 1.6; bd = 0.4; } else { bw = 0.4; bd = 1.6; }
  const base = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.6, bd), baseMat);
  base.position.set(x, 0.3, z); base.castShadow = true; group.add(base);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(bw, 1.0, bd), caseMat);
  glass.position.set(x, 1.1, z); group.add(glass);
  // 안쪽 트로피 3개(컵 = 작은 실린더 + 구)
  for (let i = 0; i < 3; i++) {
    const ox = axis === 'x' ? (i - 1) * 0.45 : 0;
    const oz = axis === 'z' ? (i - 1) * 0.45 : 0;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.18, 8), goldMat);
    cup.position.set(x + ox, 0.78, z + oz); group.add(cup);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), goldMat);
    knob.position.set(x + ox, 0.92, z + oz); group.add(knob);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.06, 8), goldMat);
    foot.position.set(x + ox, 0.66, z + oz); group.add(foot);
  }
}

// 복도 소품 전체 빌드. scene 에 group 들을 추가. 충돌체는 건드리지 않는다.
// 반환: 추가 통계 객체.
function addCorridorProps(scene) {
  const stats = { lockers: 0, plants: 0, banners: 0, boards: 0, clocks: 0, signs: 0, trophyCases: 0, ceilingPanels: 0, lights: 0 };
  const group = new THREE.Group();
  group.name = 'corridor_props';

  // ── 공유 머티리얼(재사용) ──
  const lockerMats = [
    new THREE.MeshStandardMaterial({ color: 0x4a6b78, roughness: 0.55, metalness: 0.35 }), // 스틸 블루
    new THREE.MeshStandardMaterial({ color: 0x4f6b5a, roughness: 0.55, metalness: 0.35 }), // 스틸 그린
    new THREE.MeshStandardMaterial({ color: 0x586b74, roughness: 0.55, metalness: 0.35 }), // 청회색
  ];
  const lockerHandleMat = new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.4, metalness: 0.5 });
  const potMat = new THREE.MeshStandardMaterial({ color: 0xb5654a, roughness: 0.8 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a42, roughness: 0.85 });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x5aa05a, roughness: 0.85 });
  const frameMat = new THREE.MeshStandardMaterial({ color: PALETTE.doorFrame, roughness: 0.6 });
  const corkMat = new THREE.MeshStandardMaterial({ color: 0xc8a06a, roughness: 0.95 });
  const bannerMats = [
    new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.8, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x35506b, roughness: 0.8, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x3a7a52, roughness: 0.8, side: THREE.DoubleSide }),
  ];
  const posterMats = [
    new THREE.MeshStandardMaterial({ color: 0xe0c060, roughness: 0.85, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x4a8ca0, roughness: 0.85, side: THREE.DoubleSide }),
  ];
  const clockFaceMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 });
  const clockRingMat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.5 });
  const clockHandMat = new THREE.MeshStandardMaterial({ color: 0x202024, roughness: 0.5 });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0xfff7e0, emissive: 0xffe9bf, emissiveIntensity: 0.9, roughness: 0.4,
  });

  // ── 모든 문 좌표 수집(복도별 근접 회피용) ──
  const allDoors = ROOMS.map((r) => ({ x: r.door.x, z: r.door.z }));
  const DOOR_CLEAR = 1.2;     // 문에서 최소 이격(긴축)
  const WALL_OFF = 0.2;       // 벽 안쪽으로 들어오는 깊이(사물함 절반 두께 정도)
  const END_PAD = 1.0;        // 복도 양 끝 여유(코너 벽 회피)

  // ── 복도별 처리 ──
  for (let ci = 0; ci < CORRIDORS.length; ci++) {
    const c = CORRIDORS[ci];
    const g = corridorGeom(c);
    const axis = g.isWide ? 'x' : 'z'; // 벽의 진행축
    const length = g.hiA - g.loA;

    // 이 복도 긴축 위에 있는 문 좌표만 추림(짧은축이 복도 벽 근처).
    const doorsAlong = [];
    for (const d of allDoors) {
      const along = g.isWide ? d.x : d.z;
      const perp = g.isWide ? d.z : d.x;
      if (Math.abs(perp - g.perpCenter) <= g.perpHalf + 0.6 &&
          along >= g.loA - 0.5 && along <= g.hiA + 0.5) {
        doorsAlong.push(along);
      }
    }

    // 양쪽 벽(wallSign = -1, +1). faceSign = 복도 안쪽 = -wallSign.
    for (const wallSign of [-1, 1]) {
      const faceSign = -wallSign;

      // (1) 사물함 뱅크: 6칸짜리 클러스터를 일정 간격(뱅크 사이 큰 공백)으로.
      //  연속 도배가 아니라 '여러 군데 묶음'으로 배치 → 메시 수 절제 + 자연스러움.
      const step = 0.42;            // 사물함 1칸 폭
      const perBank = 5;            // 한 뱅크 칸 수(~2.1m)
      const bankPitch = perBank * step + 5.5; // 뱅크 시작점 간격(공백 ~5.5m)
      const start = g.loA + END_PAD;
      const end = g.hiA - END_PAD;
      const lockerRot = faceSign > 0
        ? (axis === 'x' ? 0 : Math.PI / 2)
        : (axis === 'x' ? Math.PI : -Math.PI / 2);
      let bankIdx = 0;
      for (let bs = start; bs + perBank * step <= end + 0.01; bs += bankPitch) {
        // 이 뱅크가 어떤 문과 겹치면 통째로 건너뜀(출입구 가독성 우선).
        const bankCenter = bs + (perBank * step) / 2;
        if (nearDoor(bs, doorsAlong, DOOR_CLEAR) ||
            nearDoor(bs + perBank * step, doorsAlong, DOOR_CLEAR) ||
            nearDoor(bankCenter, doorsAlong, DOOR_CLEAR)) {
          bankIdx += 1;
          continue;
        }
        // 뱅크마다 색 살짝 변형(인덱스 기반).
        const bankColor = lockerMats[(ci * 2 + bankIdx + (wallSign > 0 ? 1 : 0)) % lockerMats.length];
        for (let j = 0; j < perBank; j++) {
          const a = bs + (j + 0.5) * step;
          if (nearDoor(a, doorsAlong, DOOR_CLEAR)) continue;
          const p = corridorPoint(g, a, wallSign, WALL_OFF);
          const locker = buildLocker(bankColor, lockerHandleMat);
          locker.position.set(p.x, 0, p.z);
          locker.rotation.y = lockerRot;
          group.add(locker);
          stats.lockers += 1;
        }
        bankIdx += 1;
      }

      // (2) 게시판/배너/포스터: 사물함과 안 겹치게 한쪽 벽에만, 긴 복도에서만.
      //  사물함은 1.8m, 배너는 더 높은 2.0~2.6m 영역 → 사실 높이로 분리되나
      //  단순화를 위해 벽면 다른 지점(문 옆 빈 곳)에 몇 개만.
      if (length >= 10 && wallSign > 0) {
        const nPanels = Math.min(4, Math.floor(length / 9));
        for (let k = 0; k < nPanels; k++) {
          const t = (k + 0.5) / nPanels;
          let a = g.loA + END_PAD + t * (length - 2 * END_PAD);
          if (nearDoor(a, doorsAlong, DOOR_CLEAR + 0.4)) {
            a += 1.6; // 문 근처면 한 칸 밀기
            if (nearDoor(a, doorsAlong, DOOR_CLEAR)) continue;
          }
          const p = corridorPoint(g, a, wallSign, 0.05);
          const kind = (ci + k) % 3;
          if (kind === 0) {
            // 세로 배너(상단~중단)
            const bm = bannerMats[(ci + k) % bannerMats.length];
            addWallPanel(group, p.x, p.z, axis, faceSign, 0.7, 1.6, 2.0, frameMat, bm);
            stats.banners += 1;
          } else if (kind === 1) {
            // 코르크 게시판
            addWallPanel(group, p.x, p.z, axis, faceSign, 1.4, 1.0, 2.05, frameMat, corkMat);
            stats.boards += 1;
          } else {
            // 포스터
            const pm = posterMats[(ci + k) % posterMats.length];
            addWallPanel(group, p.x, p.z, axis, faceSign, 0.8, 1.1, 2.1, frameMat, pm);
            stats.banners += 1;
          }
        }
      }
    }

    // (3) 화분: 복도 양 끝(코너/접합부)에 벽에 바짝.
    for (const wallSign of [-1, 1]) {
      for (const endA of [g.loA + 0.7, g.hiA - 0.7]) {
        if (nearDoor(endA, doorsAlong, DOOR_CLEAR)) continue;
        const p = corridorPoint(g, endA, wallSign, 0.28);
        const variant = (ci + (wallSign > 0 ? 1 : 0) + (endA > g.perpCenter ? 1 : 0)) % 2;
        const plant = buildPlant(potMat, leafMat, leafMat2, variant);
        plant.position.set(p.x, 0, p.z);
        group.add(plant);
        stats.plants += 1;
      }
    }
  }

  // ── 메인 복도(spine) 전용 장식: ci=0 ──
  const main = CORRIDORS[0];
  const mg = corridorGeom(main);
  const mainDoors = allDoors.filter((d) => Math.abs(d.z - mg.perpCenter) <= mg.perpHalf + 0.6).map((d) => d.x);

  // (4) 천장 형광등 패널 줄 — 메인 복도 스파인 따라. 실광원은 일부만.
  const panelStep = 5;
  let panelIdx = 0;
  for (let x = mg.loA + 3; x <= mg.hiA - 3; x += panelStep) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.5), panelMat);
    panel.position.set(x, WALL_H - 0.06, main.z);
    group.add(panel);
    stats.ceilingPanels += 1;
    // 실제 포인트 라이트는 3칸마다 1개만(광원 수 절약)
    if (panelIdx % 3 === 1) {
      const pl = new THREE.PointLight(0xfff0d0, 0.35, 16, 1.8);
      pl.position.set(x, WALL_H - 0.4, main.z);
      group.add(pl);
      stats.lights += 1;
    }
    panelIdx += 1;
  }

  // (5) 트로피 전시장 — 메인 복도 중앙(스폰 근처, 북벽 z=minZ). 문 회피.
  {
    const wallSign = -1;          // 북벽(z 작은 쪽)
    const faceSign = -wallSign;   // 복도 안쪽 +Z
    // 후보 x 위치들 중 문에서 먼 곳 선택
    const candidates = [3, -16, 12];
    let placedAt = null;
    for (const cx of candidates) {
      if (!nearDoor(cx, mainDoors, 1.6)) { placedAt = cx; break; }
    }
    if (placedAt !== null) {
      const p = corridorPoint(mg, placedAt, wallSign, 0.25);
      addTrophyCase(group, p.x, p.z, 'x', faceSign);
      stats.trophyCases += 1;
    }
  }

  // (6) 벽시계 + 방향 표지판 — 메인 복도.
  {
    // 시계 2개(남벽 z=maxZ), 문 회피.
    const clockXs = [-2, 20];
    for (const cx of clockXs) {
      if (nearDoor(cx, mainDoors, 1.4)) continue;
      const wallSign = 1; const faceSign = -wallSign; // 남벽 -> 안쪽 -Z
      const p = corridorPoint(mg, cx, wallSign, 0.06);
      addWallClock(group, p.x, p.z, 'x', faceSign, 2.45, clockFaceMat, clockRingMat, clockHandMat);
      stats.clocks += 1;
    }
    // 방향 표지판(천장 아래 매달림) — 복도 중앙(perpCenter 위)
    const signs = [
      { x: 30, label: '2-1 ~ 2-3 →' },
      { x: 4, label: '← 2학년부' },
      { x: -8, label: '2-9 ~ 2-11 ↓' },
    ];
    for (const s of signs) {
      if (nearDoor(s.x, mainDoors, 1.0)) continue;
      addDirectionSign(group, s.x, main.z, 'x', 1, s.label);
      stats.signs += 1;
    }
  }

  scene.add(group);
  return stats;
}

// =============================================================
//  메인 진입점
// =============================================================
export function buildWorld(scene) {
  const colliders = [];
  const roomTriggers = [];
  const teacherAnchors = new Map();
  const doors = new Map();

  scene.background = new THREE.Color(0x1a1d22);
  scene.fog = new THREE.Fog(0x1a1d22, 40, 120);

  // ── 공유 머티리얼 ──
  const mats = {
    wall: new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.92, metalness: 0.0 }),
    trim: new THREE.MeshStandardMaterial({ color: PALETTE.wallTrim, roughness: 0.7, metalness: 0.05 }),
    frame: new THREE.MeshStandardMaterial({ color: PALETTE.doorFrame, roughness: 0.6, metalness: 0.0 }),
    desk: new THREE.MeshStandardMaterial({ color: PALETTE.desk, roughness: 0.6, metalness: 0.0 }),
    chair: new THREE.MeshStandardMaterial({ color: 0x6b7078, roughness: 0.7, metalness: 0.1 }),
    // 문짝(목재) / 상단 유리창(살짝 투명) / 손잡이(금속)
    doorLeaf: new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.65, metalness: 0.0 }),
    doorPane: new THREE.MeshStandardMaterial({
      color: 0xbcd2dc, roughness: 0.25, metalness: 0.0, transparent: true, opacity: 0.55,
    }),
    doorHandle: new THREE.MeshStandardMaterial({ color: 0xcdb87a, roughness: 0.35, metalness: 0.7 }),
  };

  // ── 바닥 평면(월드 전체) ──
  const b = WORLD.bounds;
  const floorW = b.maxX - b.minX;
  const floorD = b.maxZ - b.minZ;
  const floorCx = (b.minX + b.maxX) / 2;
  const floorCz = (b.minZ + b.maxZ) / 2;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorW, floorD),
    new THREE.MeshStandardMaterial({ color: PALETTE.floor, roughness: 0.95, metalness: 0.0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(floorCx, 0, floorCz);
  floor.receiveShadow = true;
  scene.add(floor);

  // ── 복도 강조 장판(바닥 위 얇게) ──
  const corridorMat = new THREE.MeshStandardMaterial({ color: PALETTE.corridor, roughness: 0.85, metalness: 0.0 });
  for (const c of CORRIDORS) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(c.w, c.d), corridorMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(c.x, 0.01, c.z);
    strip.receiveShadow = true;
    scene.add(strip);

    // 복도 중앙 적색 포인트 라인(마석고 적색)
    const isWide = c.w >= c.d;
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(isWide ? c.w : 0.12, isWide ? 0.12 : c.d),
      new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.6 })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(c.x, 0.02, c.z);
    scene.add(line);
  }

  // ── 천장(월드 전체) ──
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(floorW, floorD),
    new THREE.MeshStandardMaterial({ color: PALETTE.ceiling, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(floorCx, WALL_H, floorCz);
  scene.add(ceiling);

  // ── 외곽 경계 벽(월드 둘레) — 플레이어 이탈 방지 ──
  const boundMat = mats.wall.clone();
  boundMat.color = shadeVary(PALETTE.wall, -0.04);
  const boundGroup = new THREE.Group();
  boundGroup.name = 'world_bounds';
  // 남(maxZ), 북(minZ): X축 / 동(maxX), 서(minX): Z축
  addWallBox(boundGroup, boundMat, floorCx, b.maxZ, floorW, WALL_T, WALL_H, 0, colliders);
  addWallBox(boundGroup, boundMat, floorCx, b.minZ, floorW, WALL_T, WALL_H, 0, colliders);
  addWallBox(boundGroup, boundMat, b.maxX, floorCz, WALL_T, floorD, WALL_H, 0, colliders);
  addWallBox(boundGroup, boundMat, b.minX, floorCz, WALL_T, floorD, WALL_H, 0, colliders);
  scene.add(boundGroup);

  // ── 각 방 빌드 ──
  let totalStudents = 0;
  let classroomLights = 0;
  for (const room of ROOMS) {
    let anchor = null;
    if (room.type === 'classroom') {
      // teacherAnchor: 문에서 안쪽 법선 방향 1.3m, heading 은 문을 바라봄
      const n = inwardNormal(room.door.dir);
      anchor = {
        x: room.door.x + n.x * 1.3,
        z: room.door.z + n.z * 1.3,
        heading: HEADING_BY_DIR[room.door.dir],
      };
    }

    const built = buildRoom(scene, room, mats, colliders, anchor, doors);
    totalStudents += built.studentCount;
    if (built.studentLight) classroomLights += 1;

    if (room.type === 'classroom') {
      // roomTrigger = 내부 인셋 AABB
      const inset = 0.6;
      roomTriggers.push({
        id: room.id,
        label: room.label,
        minX: room.x - room.w / 2 + inset,
        maxX: room.x + room.w / 2 - inset,
        minZ: room.z - room.d / 2 + inset,
        maxZ: room.z + room.d / 2 - inset,
      });

      teacherAnchors.set(room.id, anchor);
    }
  }

  // ── 조명 ──
  // 환경광 (교실 학생/교사 얼굴 가독성 위해 약간 상향)
  const ambient = new THREE.AmbientLight(0xfff4e0, 0.62);
  scene.add(ambient);
  // 반구광(천장 흰 / 바닥 베이지 반사) — 위에서 내려오는 채움광 상향
  const hemi = new THREE.HemisphereLight(0xfdf6e8, 0x8a8070, 0.55);
  hemi.position.set(0, WALL_H, 0);
  scene.add(hemi);
  // 직사광(약한 그림자)
  const dir = new THREE.DirectionalLight(0xfff1d6, 0.5);
  dir.position.set(30, 40, -20);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.near = 1;
  dir.shadow.camera.far = 160;
  dir.shadow.camera.left = -90;
  dir.shadow.camera.right = 90;
  dir.shadow.camera.top = 70;
  dir.shadow.camera.bottom = -70;
  scene.add(dir);

  // 따뜻한 복도 포인트 라이트 — 각 복도에 일정 간격 배치
  const warm = 0xffdca8;
  for (const c of CORRIDORS) {
    const along = Math.max(c.w, c.d);
    const isWide = c.w >= c.d;
    const count = Math.max(1, Math.round(along / 14));
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const px = isWide ? (c.x - c.w / 2 + t * c.w) : c.x;
      const pz = isWide ? c.z : (c.z - c.d / 2 + t * c.d);
      const pl = new THREE.PointLight(warm, 0.7, 22, 1.6);
      pl.position.set(px, WALL_H - 0.3, pz);
      scene.add(pl);

      // 천장 조명등 박스(시각적)
      const fixture = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.08, 0.4),
        new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xffe6b0, emissiveIntensity: 0.8, roughness: 0.4 })
      );
      fixture.position.set(px, WALL_H - 0.06, pz);
      scene.add(fixture);
    }
  }

  // ── 복도 소품(장식 전용, 충돌체 미추가) ──
  const propStats = addCorridorProps(scene);

  if (typeof console !== 'undefined' && console.info) {
    const ps = propStats;
    console.info(
      `[world] 교실 학생 ${totalStudents}명, 교실 조명 ${classroomLights}개, 여닫이 문짝 ${doors.size}개 배치 완료`
    );
    console.info(
      `[world] 복도 소품: 사물함 ${ps.lockers} · 화분 ${ps.plants} · 배너 ${ps.banners} · 게시판 ${ps.boards} · 시계 ${ps.clocks} · 표지판 ${ps.signs} · 전시장 ${ps.trophyCases} · 천장패널 ${ps.ceilingPanels} · 추가광원 ${ps.lights}`
    );
  }

  return { colliders, roomTriggers, teacherAnchors, doors };
}
