// =============================================================
//  마석고 교복지도 — 옥상 빌더 (src/rooftop.js)
//  좌표계: X = 동(+)/서(-), Z = 남(+)/북(-), Y = 위. 단위 미터.
//  AABB(평면 충돌/트리거): { minX, maxX, minZ, maxZ } (Y 무시)
//
//  buildRooftop(scene):
//    - 3층 평면도(x[-60,72], z[-48,42])와 절대 겹치지 않도록
//      옥상을 (0, 0, 200) 부근으로 멀찍이 오프셋해서 만든다.
//    - 콘크리트 바닥 슬래브(32m x 24m) + 타일/라인 디테일
//    - 4면 난간/파라펫(충돌 AABB) — 계단실 출입구만 비움
//    - 계단실(stairwell hut, 4x4m) — 도착/하강 지점, 벽은 충돌체
//    - 장식 소품(충돌 없음): 실외기 3대, 물탱크, 벤치 2개, 화단,
//      현수막, 위성 안테나, 환기구
//    - 실외 조명: HemisphereLight + 부드러운 DirectionalLight('태양')
//  반환: { colliders, spawn, exitTrigger, skyColor }
// =============================================================

import * as THREE from 'three';

// ── 옥상 중심/치수 ──────────────────────────────────────────
const CX = 0;          // 옥상 중심 X
const CZ = 200;        // 옥상 중심 Z (3층 z[-48,42] 와 한참 떨어짐)
const SLAB_W = 32;     // X 폭
const SLAB_D = 24;     // Z 깊이
const SLAB_Y = 0;      // 바닥 상면 y

// 슬래브 모서리(난간이 놓이는 자리)
const MIN_X = CX - SLAB_W / 2; // -16
const MAX_X = CX + SLAB_W / 2; //  16
const MIN_Z = CZ - SLAB_D / 2; // 188 (북쪽)
const MAX_Z = CZ + SLAB_D / 2; // 212 (남쪽)

// 난간/파라펫
const RAIL_H = 1.1;            // 난간 높이
const RAIL_T = 0.18;           // 난간(파라펫) 두께
const COLLIDER_PAD = 0.02;

// 계단실(hut) — 북서쪽 모서리 근처. 도어웨이는 +Z(남, 옥상 안쪽)를 바라봄.
const HUT_W = 4;              // X 폭
const HUT_D = 4;              // Z 깊이
const HUT_H = 2.6;            // 높이
const HUT_CX = -9;           // 중심 X
const HUT_CZ = MIN_Z + HUT_D / 2 + 0.2; // 북벽에 거의 붙임 (≈190.2)
const HUT_T = 0.2;           // 벽 두께
const DOOR_GAP = 1.6;        // 도어웨이 폭

// hut 경계
const HUT_MINX = HUT_CX - HUT_W / 2; // -11
const HUT_MAXX = HUT_CX + HUT_W / 2; //  -7
const HUT_MINZ = HUT_CZ - HUT_D / 2; // 북벽
const HUT_MAXZ = HUT_CZ + HUT_D / 2; // 남벽(도어웨이가 난 면)

// 미니맵(옥상 레이더)이 그릴 옥상 평면 레이아웃
export const ROOF_LAYOUT = {
  cx: CX, cz: CZ, w: SLAB_W, d: SLAB_D,
  hut: { x: HUT_CX, z: HUT_CZ, w: HUT_W, d: HUT_D },
};

// ── 작은 헬퍼: 박스 메시 + (옵션) 충돌 AABB ─────────────────
function addBox(group, mat, cx, cy, cz, sx, sy, sz, colliders) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(cx, cy, cz);
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

// ── 난간 한 변 빌드: 파라펫 벽(낮음) + 위 금속 톱레일 + 기둥 ──
// axis: 'x' = X축을 따라 뻗는 변(북/남), 'z' = Z축을 따라(동/서).
// fixed: 고정축 좌표. span: [a,b] 가변축 범위. gap: {lo,hi} 또는 null(빈틈=출입구).
function buildRailSide(group, mats, axis, fixed, a, b, colliders, gap) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);

  // 가변축 세그먼트(출입구 빈틈 제외)
  let segments;
  if (gap) {
    segments = [];
    if (gap.lo - lo > 0.05) segments.push([lo, gap.lo]);
    if (hi - gap.hi > 0.05) segments.push([gap.hi, hi]);
  } else {
    segments = [[lo, hi]];
  }

  for (const [s, e] of segments) {
    const len = e - s;
    if (len <= 0.001) continue;
    const mid = (s + e) / 2;
    let cx, cz, sx, sz;
    if (axis === 'x') { cx = mid; cz = fixed; sx = len; sz = RAIL_T; }
    else { cx = fixed; cz = mid; sx = RAIL_T; sz = len; }

    // 낮은 콘크리트 파라펫(허리 아래) — 시각 + 충돌
    addBox(group, mats.parapet, cx, 0.45, cz, sx, 0.9, sz, colliders);
    // 위 금속 톱레일(가는 막대) — 시각 전용
    const top = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.08, sz), mats.metal);
    top.position.set(cx, RAIL_H, cz);
    top.castShadow = true;
    group.add(top);

    // 금속 기둥 — 약 2m 간격
    const posts = Math.max(2, Math.round(len / 2));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const pa = s + t * len;
      const px = axis === 'x' ? pa : fixed;
      const pz = axis === 'x' ? fixed : pa;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, RAIL_H, 8), mats.metal);
      post.position.set(px, RAIL_H / 2, pz);
      post.castShadow = true;
      group.add(post);
    }
  }
}

// ── 실외기(AC condenser) — 박스 + 팬 원 2개. 장식(충돌 없음). ──
function buildCondenser(mats) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.7), mats.acBody);
  body.position.y = 0.45;
  body.castShadow = true;
  g.add(body);
  // 측면 팬 그릴(원 2개)
  for (const ox of [-0.3, 0.3]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.22, 16), mats.acGrill);
    ring.position.set(ox, 0.45, 0.351);
    g.add(ring);
    const hub = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), mats.metal);
    hub.position.set(ox, 0.45, 0.352);
    g.add(hub);
  }
  // 상단 통풍 슬릿(얇은 띠)
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.6), mats.acGrill);
  top.position.y = 0.91;
  g.add(top);
  return g;
}

// ── 물탱크(원통 + 다리 4개). 장식. ──────────────────────────
function buildWaterTank(mats) {
  const g = new THREE.Group();
  const legH = 0.8;
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 18), mats.tank);
  tank.position.y = legH + 0.9;
  tank.castShadow = true;
  g.add(tank);
  // 상단 돔 뚜껑
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.tank);
  cap.position.y = legH + 1.8;
  g.add(cap);
  // 다리 4개
  for (const [ox, oz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, legH, 8), mats.metal);
    leg.position.set(ox, legH / 2, oz);
    leg.castShadow = true;
    g.add(leg);
  }
  return g;
}

// ── 벤치(좌판 + 다리 + 등받이). 장식. ──────────────────────
function buildBench(mats) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.45), mats.wood);
  seat.position.y = 0.45;
  seat.castShadow = true;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.08), mats.wood);
  back.position.set(0, 0.7, -0.18);
  g.add(back);
  for (const ox of [-0.65, 0.65]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.4), mats.metal);
    leg.position.set(ox, 0.22, 0);
    g.add(leg);
  }
  return g;
}

// ── 화단/플랜터(나무 박스 + 흙 + 초록 관목). 장식. ──────────
function buildPlanter(mats) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.7), mats.planter);
  box.position.y = 0.25;
  box.castShadow = true;
  g.add(box);
  const soil = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.06, 0.56), mats.soil);
  soil.position.y = 0.5;
  g.add(soil);
  // 관목 구 몇 개
  const bx = [-0.6, 0, 0.6];
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), i === 1 ? mats.leaf2 : mats.leaf);
    leaf.position.set(bx[i], 0.78, 0);
    leaf.scale.y = 0.85;
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

// ── 위성 안테나(접시 + 받침). 장식. ────────────────────────
function buildSatellite(mats) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 8), mats.metal);
  base.position.y = 0.3;
  g.add(base);
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3),
    mats.dish
  );
  dish.position.set(0, 0.7, 0);
  dish.rotation.x = -Math.PI / 3;
  dish.castShadow = true;
  g.add(dish);
  // 수신기 암
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), mats.metal);
  arm.position.set(0, 0.85, 0.35);
  arm.rotation.x = Math.PI / 4;
  g.add(arm);
  return g;
}

// ── 환기구(루프 벤트: 사각 박스 + 둥근 터빈 캡). 장식. ──────
function buildVent(mats) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.6), mats.metal);
  base.position.y = 0.2;
  base.castShadow = true;
  g.add(base);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.3, 12), mats.acGrill);
  cap.position.y = 0.55;
  g.add(cap);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.metal);
  dome.position.y = 0.7;
  g.add(dome);
  return g;
}

// ── 현수막 텍스처(한글 캔버스) ──────────────────────────────
function makeBannerTexture() {
  if (typeof document === 'undefined') return null; // node --check 안전
  const W = 1024, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#f5f5f0';
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.fillStyle = '#f5f5f0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 110px "Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  ctx.fillText('마석고등학교 옥상', W / 2, H / 2 + 6);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// =============================================================
//  메인 진입점
// =============================================================
export function buildRooftop(scene) {
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'rooftop';

  // ── 머티리얼 ──
  const mats = {
    slab:    new THREE.MeshStandardMaterial({ color: 0xc7c2b8, roughness: 0.95, metalness: 0.0 }), // 콘크리트(밝은 웜그레이)
    line:    new THREE.MeshStandardMaterial({ color: 0xb0aaa0, roughness: 0.9 }),                  // 타일 줄눈
    parapet: new THREE.MeshStandardMaterial({ color: 0xd2cdc2, roughness: 0.9, metalness: 0.0 }),  // 파라펫(밝은 콘크리트)
    metal:   new THREE.MeshStandardMaterial({ color: 0x8a9098, roughness: 0.5, metalness: 0.6 }),  // 금속 레일/기둥
    hutWall: new THREE.MeshStandardMaterial({ color: 0xe2ddd0, roughness: 0.9 }),                  // 계단실 벽(미색)
    hutRoof: new THREE.MeshStandardMaterial({ color: 0x9aa7b0, roughness: 0.7 }),                  // 계단실 지붕(청회색)
    frame:   new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.6 }),                  // 문틀(목재)
    doorDark:new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.8 }),                  // 출입구 안 어둠
    acBody:  new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.7, metalness: 0.2 }),  // 실외기 본체
    acGrill: new THREE.MeshStandardMaterial({ color: 0x6b7078, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }),
    tank:    new THREE.MeshStandardMaterial({ color: 0x4a8ca0, roughness: 0.6, metalness: 0.1 }),  // 물탱크(청록)
    wood:    new THREE.MeshStandardMaterial({ color: 0xc89a5a, roughness: 0.7 }),                  // 벤치 목재
    planter: new THREE.MeshStandardMaterial({ color: 0xb5654a, roughness: 0.85 }),                 // 화단 박스
    soil:    new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 1.0 }),
    leaf:    new THREE.MeshStandardMaterial({ color: 0x3f7a42, roughness: 0.9 }),
    leaf2:   new THREE.MeshStandardMaterial({ color: 0x5aa05a, roughness: 0.9 }),
    dish:    new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide }),
  };

  // ── 바닥 슬래브 ──
  const slab = new THREE.Mesh(new THREE.BoxGeometry(SLAB_W, 0.3, SLAB_D), mats.slab);
  slab.position.set(CX, SLAB_Y - 0.15, CZ);
  slab.receiveShadow = true;
  group.add(slab);

  // ── 타일 줄눈(라인 마킹) — X/Z 격자 얇은 띠 ──
  for (let x = MIN_X + 4; x < MAX_X; x += 4) {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.06, SLAB_D - 0.4), mats.line);
    ln.rotation.x = -Math.PI / 2;
    ln.position.set(x, SLAB_Y + 0.01, CZ);
    ln.receiveShadow = true;
    group.add(ln);
  }
  for (let z = MIN_Z + 4; z < MAX_Z; z += 4) {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(SLAB_W - 0.4, 0.06), mats.line);
    ln.rotation.x = -Math.PI / 2;
    ln.position.set(CX, SLAB_Y + 0.01, z);
    ln.receiveShadow = true;
    group.add(ln);
  }

  // ── 난간/파라펫(4면). 북변은 hut 도어웨이 빈틈을 hut 벽이 메운다. ──
  // 도어웨이가 북변(MIN_Z)에 나 있지 않으므로 북변엔 빈틈 없음 — 단,
  // hut 이 북변 안쪽에 붙어있어 충돌상 자연스레 막힌다.
  // 남(MAX_Z), 북(MIN_Z): X축 / 동(MAX_X), 서(MIN_X): Z축
  buildRailSide(group, mats, 'x', MAX_Z, MIN_X, MAX_X, colliders, null); // 남
  buildRailSide(group, mats, 'x', MIN_Z, MIN_X, MAX_X, colliders, null); // 북
  buildRailSide(group, mats, 'z', MAX_X, MIN_Z, MAX_Z, colliders, null); // 동
  buildRailSide(group, mats, 'z', MIN_X, MIN_Z, MAX_Z, colliders, null); // 서

  // ── 계단실(hut) ──
  // 4면 벽. 남벽(MAX_Z 쪽, 옥상 안쪽)에 도어웨이 구멍. 나머지 3면은 막힘.
  const hutGroup = new THREE.Group();
  hutGroup.name = 'rooftop_hut';

  // 북벽(막힘) — X축
  addBox(hutGroup, mats.hutWall, HUT_CX, HUT_H / 2, HUT_MINZ, HUT_W, HUT_H, HUT_T, colliders);
  // 동벽(막힘) — Z축
  addBox(hutGroup, mats.hutWall, HUT_MAXX, HUT_H / 2, HUT_CZ, HUT_T, HUT_H, HUT_D, colliders);
  // 서벽(막힘) — Z축
  addBox(hutGroup, mats.hutWall, HUT_MINX, HUT_H / 2, HUT_CZ, HUT_T, HUT_H, HUT_D, colliders);
  // 남벽(도어웨이) — X축, 가운데 DOOR_GAP 구멍. 좌/우 두 세그먼트만 충돌.
  {
    const doorLo = HUT_CX - DOOR_GAP / 2;
    const doorHi = HUT_CX + DOOR_GAP / 2;
    // 좌 세그먼트
    const lLen = doorLo - HUT_MINX;
    if (lLen > 0.05) {
      addBox(hutGroup, mats.hutWall, (HUT_MINX + doorLo) / 2, HUT_H / 2, HUT_MAXZ, lLen, HUT_H, HUT_T, colliders);
    }
    // 우 세그먼트
    const rLen = HUT_MAXX - doorHi;
    if (rLen > 0.05) {
      addBox(hutGroup, mats.hutWall, (doorHi + HUT_MAXX) / 2, HUT_H / 2, HUT_MAXZ, rLen, HUT_H, HUT_T, colliders);
    }
    // 도어웨이 상단 인방(머리 위 벽, 충돌 없음)
    const lintelH = HUT_H - 2.1;
    if (lintelH > 0.01) {
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_GAP, lintelH, HUT_T), mats.hutWall);
      lintel.position.set(HUT_CX, 2.1 + lintelH / 2, HUT_MAXZ);
      hutGroup.add(lintel);
    }
    // 문틀(도어웨이 둘레 목재)
    for (const ox of [doorLo, doorHi]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, HUT_T + 0.08), mats.frame);
      jamb.position.set(ox, 1.05, HUT_MAXZ);
      hutGroup.add(jamb);
    }
    // 도어웨이 안쪽 어둠 평면(들여다보면 어두운 계단)
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_GAP, 2.1), mats.doorDark);
    dark.position.set(HUT_CX, 1.05, HUT_MAXZ - 0.02);
    hutGroup.add(dark);
  }

  // hut 지붕(살짝 돌출)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(HUT_W + 0.4, 0.2, HUT_D + 0.4), mats.hutRoof);
  roof.position.set(HUT_CX, HUT_H + 0.1, HUT_CZ);
  roof.castShadow = true;
  hutGroup.add(roof);

  // hut 명패(작은 라벨 박스 — 옥상 표시)
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.06), mats.frame);
  sign.position.set(HUT_CX, 2.35, HUT_MAXZ + 0.05);
  hutGroup.add(sign);

  group.add(hutGroup);

  // ── 장식 소품(충돌 없음) ──────────────────────────────────
  const props = new THREE.Group();
  props.name = 'rooftop_props';

  // 실외기 3대 — 동쪽 줄에 나란히
  const condPositions = [
    [11, 195], [11, 197.5], [11, 200],
  ];
  for (const [px, pz] of condPositions) {
    const c = buildCondenser(mats);
    c.position.set(px, 0, pz);
    c.rotation.y = -Math.PI / 2; // 그릴이 서쪽(옥상 안쪽)을 향하게
    props.add(c);
  }

  // 물탱크 — 북동 모서리
  const tank = buildWaterTank(mats);
  tank.position.set(11, 0, 191.5);
  props.add(tank);

  // 벤치 2개 — 남쪽 난간 앞, 옥상 바라보게
  const benchA = buildBench(mats);
  benchA.position.set(-5, 0, 209);
  benchA.rotation.y = Math.PI; // 등받이가 남쪽 난간 쪽
  props.add(benchA);
  const benchB = buildBench(mats);
  benchB.position.set(3, 0, 209);
  benchB.rotation.y = Math.PI;
  props.add(benchB);

  // 화단 3개 — 서쪽 난간 앞 줄
  for (const pz of [197, 201.5, 206]) {
    const pl = buildPlanter(mats);
    pl.position.set(-14, 0, pz);
    pl.rotation.y = Math.PI / 2; // 길이가 Z축 따라
    props.add(pl);
  }

  // 위성 안테나 — 남동 모서리
  const sat = buildSatellite(mats);
  sat.position.set(13, 0, 209);
  sat.rotation.y = -Math.PI * 0.8;
  props.add(sat);

  // 환기구 2개 — 중앙/북쪽 흩뿌림
  const ventA = buildVent(mats);
  ventA.position.set(2, 0, 192);
  props.add(ventA);
  const ventB = buildVent(mats);
  ventB.position.set(6, 0, 204);
  props.add(ventB);

  // 현수막 — 남쪽 난간에 걸린 학교 배너
  {
    const tex = makeBannerTexture();
    const bannerMat = tex
      ? new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
      : new THREE.MeshBasicMaterial({ color: 0xc0392b, side: THREE.DoubleSide });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), bannerMat);
    banner.position.set(-3, 0.75, MAX_Z - 0.12);
    banner.rotation.y = Math.PI; // 앞면(+Z)이 옥상 안쪽(북)을 향해야 글자가 안 뒤집힌다
    props.add(banner);
  }

  group.add(props);

  // ── 조명(실외) ──────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xbfd8f0, 0x9a8f7a, 0.7); // 하늘 파랑 / 땅 베이지
  hemi.position.set(CX, 20, CZ);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff4e0, 0.65);
  sun.position.set(CX + 20, 30, CZ - 20);
  sun.target.position.set(CX, 0, CZ);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  group.add(sun);
  group.add(sun.target);

  scene.add(group);

  // ── 스폰: 도어웨이 바로 바깥(옥상 쪽), 옥상 안쪽(+Z, 남)을 바라봄 ──
  const spawn = {
    x: HUT_CX,
    z: HUT_MAXZ + 1.6, // 도어웨이 남쪽으로 1.6m
    heading: 0,        // 0 = +Z(남) = 옥상 한가운데를 향함
  };

  // ── 종료 트리거: 도어웨이 입구(~1.5 x 1.5m). 여기 들어오면 하강. ──
  const exitTrigger = {
    minX: HUT_CX - 0.75,
    maxX: HUT_CX + 0.75,
    minZ: HUT_MAXZ - 0.75, // hut 내부 살짝
    maxZ: HUT_MAXZ + 0.75, // 도어웨이 바깥 살짝(스폰에서 닿음)
  };

  // ── 하늘색 ──
  const skyColor = 0x9fc6e8;

  if (typeof console !== 'undefined' && console.info) {
    console.info(
      `[rooftop] 슬래브 ${SLAB_W}x${SLAB_D}m @(${CX},${CZ}) · 충돌체 ${colliders.length}개 · ` +
      `계단실 ${HUT_W}x${HUT_D}x${HUT_H}m · spawn(${spawn.x},${spawn.z},h=${spawn.heading})`
    );
  }

  return { colliders, spawn, exitTrigger, skyColor };
}
