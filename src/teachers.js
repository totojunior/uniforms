// =============================================================
//  마석고 교복지도 — 교사 피규어 모듈 (src/teachers.js)
//  좌표계: X = 동(+)/서(-), Z = 남(+)/북(-), Y = 위. 단위 미터.
//  buildFigure(appearance)  -> 저폴리 휴머노이드 THREE.Group
//  placeTeachers(scene, teacherAnchors, assignment)
//      -> 각 교실 앵커에 담당 교사 배치, Map<classId,{group,teacherIdx}> 반환
//  (재시작 시 main 에서 group 을 scene.remove() 하고 다시 호출)
// =============================================================

import * as THREE from 'three';
import { TEACHERS, CLASSROOMS } from './data.js';

// build(체형) 별 몸통 너비 배율
const BUILD_WIDTH = {
  slim: 0.78,
  average: 1.0,
  stocky: 1.28,
};

// 외형 비율의 기준이 되는 '표준 키'. 이 키일 때 그룹 스케일 1.0.
const BASE_HEIGHT = 1.72;

/**
 * 외형(appearance)으로 저폴리 휴머노이드 그룹을 만든다.
 * - 몸통(top 색), 머리(skin), 머리카락(hairStyle), 팔/다리(bottom 색),
 *   accessory==='glasses' 이면 얇은 안경.
 * - 전체 높이를 appearance.height 에 맞춰 스케일.
 * @param {{skin:number,hair:number,hairStyle:string,build:string,height:number,top:number,bottom:number,accessory:string}} appearance
 * @returns {THREE.Group}
 */
export function buildFigure(appearance) {
  const a = appearance || {};
  const skinColor = a.skin ?? 0xe8c4a0;
  const hairColor = a.hair ?? 0x2b2b2b;
  const topColor = a.top ?? 0x35506b;
  const bottomColor = a.bottom ?? 0x2a2f38;
  const hairStyle = a.hairStyle ?? 'short';
  const build = a.build ?? 'average';
  const accessory = a.accessory ?? 'none';
  const height = typeof a.height === 'number' ? a.height : BASE_HEIGHT;

  const widthScale = BUILD_WIDTH[build] ?? 1.0;

  // 공유 재질 (저폴리 룩 — flat 느낌의 표준 재질)
  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.85, metalness: 0.0 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.9, metalness: 0.0 });
  const topMat = new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.8, metalness: 0.05 });
  const bottomMat = new THREE.MeshStandardMaterial({ color: bottomColor, roughness: 0.85, metalness: 0.05 });

  const group = new THREE.Group();
  group.name = 'teacherFigure';

  // ── 기준 치수 (BASE_HEIGHT 기준, 발바닥 y=0) ──
  const legHeight = 0.78;
  const torsoHeight = 0.62;
  const neckGap = 0.06;
  const headRadius = 0.16;

  const hipY = legHeight;                       // 다리 위 = 몸통 아래
  const torsoCenterY = hipY + torsoHeight / 2;  // 몸통 중심
  const torsoTopY = hipY + torsoHeight;         // 몸통 위
  const headCenterY = torsoTopY + neckGap + headRadius;

  // ── 다리 (bottom 색) : 좌우 두 개 ──
  const legRadius = 0.085 * widthScale;
  const legGeo = new THREE.CapsuleGeometry(legRadius, legHeight - legRadius * 2, 4, 8);
  const legOffsetX = 0.11 * widthScale;
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, bottomMat);
    leg.position.set(sx * legOffsetX, legHeight / 2, 0);
    leg.castShadow = true;
    group.add(leg);
  }

  // ── 몸통 (top 색) : 박스형 토르소, build 에 따라 너비 변화 ──
  const torsoW = 0.42 * widthScale;
  const torsoD = 0.24 * widthScale;
  const torsoGeo = new THREE.BoxGeometry(torsoW, torsoHeight, torsoD);
  const torso = new THREE.Mesh(torsoGeo, topMat);
  torso.position.set(0, torsoCenterY, 0);
  torso.castShadow = true;
  group.add(torso);

  // 어깨 캡슐 (실루엣 보강)
  const shoulderGeo = new THREE.CapsuleGeometry(0.1 * widthScale, torsoW * 0.7, 4, 8);
  const shoulder = new THREE.Mesh(shoulderGeo, topMat);
  shoulder.rotation.z = Math.PI / 2;
  shoulder.position.set(0, torsoTopY - 0.06, 0);
  shoulder.castShadow = true;
  group.add(shoulder);

  // ── 팔 (top 색) : 몸통 좌우, 살짝 벌림 ──
  const armRadius = 0.06 * widthScale;
  const armLength = 0.6;
  const armGeo = new THREE.CapsuleGeometry(armRadius, armLength - armRadius * 2, 4, 8);
  const armOffsetX = torsoW / 2 + armRadius + 0.01;
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, topMat);
    arm.position.set(sx * armOffsetX, torsoTopY - armLength / 2 - 0.04, 0);
    arm.rotation.z = sx * 0.12; // 바깥으로 살짝
    arm.castShadow = true;
    group.add(arm);

    // 손 (skin)
    const handGeo = new THREE.SphereGeometry(armRadius * 1.15, 8, 6);
    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.set(sx * (armOffsetX + 0.02), torsoTopY - armLength - 0.02, 0);
    group.add(hand);
  }

  // ── 목 (skin) ──
  const neckGeo = new THREE.CylinderGeometry(0.06, 0.07, neckGap + 0.06, 8);
  const neck = new THREE.Mesh(neckGeo, skinMat);
  neck.position.set(0, torsoTopY + neckGap / 2, 0);
  group.add(neck);

  // ── 머리 그룹 (얼굴/머리카락/안경을 한 그룹으로 → main 에서 플레이어를 향해 살짝 돌릴 수 있음) ──
  const headGroup = new THREE.Group();
  headGroup.position.set(0, headCenterY, 0);

  const headGeo = new THREE.SphereGeometry(headRadius, 16, 12);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.castShadow = true;
  headGroup.add(head);

  // 얼굴 디테일 (정면 = +Z): 눈/눈썹/코/입 — 저폴리지만 표정이 읽히게
  addFace(headGroup, headRadius, skinColor);

  // 머리카락 / 안경 (headGroup 로컬 좌표, 머리 중심 y=0 기준)
  addHair(headGroup, hairMat, hairStyle, 0, headRadius, torsoTopY - headCenterY);
  if (accessory === 'glasses') {
    addGlasses(headGroup, 0, headRadius);
  }

  group.add(headGroup);
  group.userData.head = headGroup;

  // ── 전체 키 스케일 ──
  const scale = height / BASE_HEIGHT;
  group.scale.setScalar(scale);

  // 메타 정보 (디버깅/식별용)
  group.userData.appearance = appearance;

  return group;
}

/**
 * 머리 그룹에 얼굴(눈/눈썹/코/입)을 추가한다. 정면 = +Z.
 * headGroup 의 로컬 원점이 머리 중심이라고 가정.
 */
function addFace(headGroup, headRadius, skinColor) {
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x241f1b, roughness: 0.45 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4efe9, roughness: 0.6 });
  const browMat = new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 0.85 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x9c5a52, roughness: 0.7 });
  const noseMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.85 });

  const eyeX = headRadius * 0.4;
  const eyeY = headRadius * 0.06;
  const frontZ = headRadius * 0.9;

  // 흰자(살짝 눌린 구) + 눈동자
  const whiteGeo = new THREE.SphereGeometry(headRadius * 0.15, 10, 8);
  const pupilGeo = new THREE.SphereGeometry(headRadius * 0.08, 8, 6);
  for (const sx of [-1, 1]) {
    const white = new THREE.Mesh(whiteGeo, whiteMat);
    white.position.set(sx * eyeX, eyeY, frontZ);
    white.scale.set(1.1, 0.85, 0.5);
    headGroup.add(white);

    const pupil = new THREE.Mesh(pupilGeo, eyeMat);
    pupil.position.set(sx * eyeX, eyeY, frontZ + headRadius * 0.05);
    headGroup.add(pupil);
  }

  // 눈썹
  const browGeo = new THREE.BoxGeometry(headRadius * 0.3, headRadius * 0.06, headRadius * 0.06);
  for (const sx of [-1, 1]) {
    const brow = new THREE.Mesh(browGeo, browMat);
    brow.position.set(sx * eyeX, eyeY + headRadius * 0.27, frontZ * 0.95);
    brow.rotation.z = sx * 0.1;
    headGroup.add(brow);
  }

  // 코
  const noseGeo = new THREE.ConeGeometry(headRadius * 0.1, headRadius * 0.2, 6);
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -headRadius * 0.1, frontZ * 1.02);
  headGroup.add(nose);

  // 입(살짝 미소)
  const mouthGeo = new THREE.BoxGeometry(headRadius * 0.36, headRadius * 0.07, headRadius * 0.05);
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.position.set(0, -headRadius * 0.42, frontZ * 0.96);
  headGroup.add(mouth);
}

/**
 * hairStyle 에 따라 머리카락 메시를 추가한다.
 *  - bald   : 없음
 *  - short  : 두피를 살짝 덮는 캡
 *  - medium : 캡 + 옆을 감싸는 프레이밍
 *  - bob    : 턱선까지 내려오는 단발 (얼굴 프레이밍)
 *  - long   : 등 뒤로 길게 내려오는 긴 머리
 *  - ponytail: 정수리 캡 + 뒤로 묶은 꽁지
 */
function addHair(group, hairMat, hairStyle, headCenterY, headRadius, torsoTopY) {
  if (hairStyle === 'bald') return;

  // 공통: 머리 위를 덮는 캡 (반구를 약간 키워 모자처럼)
  const capGeo = new THREE.SphereGeometry(
    headRadius * 1.06,
    16,
    12,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.62
  );
  const cap = new THREE.Mesh(capGeo, hairMat);
  cap.position.set(0, headCenterY + headRadius * 0.05, 0);
  group.add(cap);

  if (hairStyle === 'bob') {
    // 단발: 얼굴 양옆/뒤를 감싸는 짧은 통
    const sideGeo = new THREE.CylinderGeometry(
      headRadius * 1.12,
      headRadius * 1.18,
      headRadius * 1.3,
      16,
      1,
      true
    );
    const sides = new THREE.Mesh(sideGeo, hairMat);
    sides.position.set(0, headCenterY - headRadius * 0.25, -0.01);
    group.add(sides);
    // 뒤통수 채움
    const backGeo = new THREE.SphereGeometry(headRadius * 0.95, 12, 10);
    const back = new THREE.Mesh(backGeo, hairMat);
    back.scale.set(1, 1, 0.7);
    back.position.set(0, headCenterY - headRadius * 0.15, -headRadius * 0.55);
    group.add(back);
  } else if (hairStyle === 'medium') {
    // 중단발: 옆을 살짝 감싸는 프레이밍 + 뒤통수
    const sideGeo = new THREE.CylinderGeometry(
      headRadius * 1.1,
      headRadius * 1.14,
      headRadius * 0.85,
      16,
      1,
      true
    );
    const sides = new THREE.Mesh(sideGeo, hairMat);
    sides.position.set(0, headCenterY - headRadius * 0.05, -0.01);
    group.add(sides);
    const backGeo = new THREE.SphereGeometry(headRadius * 0.95, 12, 10);
    const back = new THREE.Mesh(backGeo, hairMat);
    back.scale.set(1, 1, 0.6);
    back.position.set(0, headCenterY - headRadius * 0.05, -headRadius * 0.5);
    group.add(back);
  } else if (hairStyle === 'long') {
    // 긴 머리: 등 뒤로 길게 내려오는 한 덩어리 (어깨 아래까지)
    const backLen = headRadius * 4.0;
    const backGeo = new THREE.CapsuleGeometry(headRadius * 0.95, backLen, 6, 12);
    const back = new THREE.Mesh(backGeo, hairMat);
    back.scale.set(1, 1, 0.45);
    back.position.set(0, headCenterY - headRadius * 1.3, -headRadius * 0.75);
    group.add(back);
    // 옆 머리 프레이밍
    const sideGeo = new THREE.CylinderGeometry(headRadius * 1.08, headRadius * 1.1, headRadius * 1.1, 16, 1, true);
    const sides = new THREE.Mesh(sideGeo, hairMat);
    sides.position.set(0, headCenterY - headRadius * 0.2, -0.01);
    group.add(sides);
  } else if (hairStyle === 'ponytail') {
    // 포니테일: 정수리는 캡, 뒤로 묶은 꽁지를 비스듬히
    const tieGeo = new THREE.SphereGeometry(headRadius * 0.35, 8, 6);
    const tie = new THREE.Mesh(tieGeo, hairMat);
    tie.position.set(0, headCenterY + headRadius * 0.2, -headRadius * 0.95);
    group.add(tie);

    const tailLen = headRadius * 3.0;
    const tailGeo = new THREE.CapsuleGeometry(headRadius * 0.45, tailLen, 6, 10);
    const tail = new THREE.Mesh(tailGeo, hairMat);
    tail.position.set(0, headCenterY - headRadius * 0.6, -headRadius * 1.25);
    tail.rotation.x = -0.5; // 뒤로 흘러내림
    group.add(tail);
  }
  // 'short' 는 캡만으로 충분
}

/**
 * 얇은 안경(테 + 다리)을 머리 앞쪽에 추가한다.
 */
function addGlasses(group, headCenterY, headRadius) {
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x202024,
    roughness: 0.4,
    metalness: 0.6,
  });

  const eyeY = headCenterY + headRadius * 0.05;
  const frontZ = headRadius * 0.92;
  const lensR = headRadius * 0.33;
  const lensSep = headRadius * 0.42;
  const tubeR = headRadius * 0.035;

  // 렌즈 테 (토러스 두 개)
  const lensGeo = new THREE.TorusGeometry(lensR, tubeR, 6, 16);
  for (const sx of [-1, 1]) {
    const lens = new THREE.Mesh(lensGeo, glassMat);
    lens.position.set(sx * lensSep, eyeY, frontZ);
    group.add(lens);
  }

  // 콧대 (브릿지)
  const bridgeGeo = new THREE.CylinderGeometry(tubeR, tubeR, lensSep * 2 - lensR * 2, 6);
  const bridge = new THREE.Mesh(bridgeGeo, glassMat);
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(0, eyeY, frontZ);
  group.add(bridge);

  // 안경 다리 (양옆에서 귀 쪽으로)
  const templeLen = headRadius * 0.9;
  const templeGeo = new THREE.CylinderGeometry(tubeR, tubeR, templeLen, 6);
  for (const sx of [-1, 1]) {
    const temple = new THREE.Mesh(templeGeo, glassMat);
    temple.rotation.x = Math.PI / 2;
    temple.position.set(sx * (lensSep + lensR), eyeY, frontZ - templeLen / 2);
    group.add(temple);
  }
}

/**
 * 각 교실 앵커에 담당 교사 피규어를 배치한다.
 * @param {THREE.Scene} scene
 * @param {Map<string,{x:number,z:number,heading:number}>} teacherAnchors  classId -> 앵커
 * @param {number[]} assignment  a[classIdx] = teacherIdx (담당 교사 인덱스)
 * @returns {Map<string,{group:THREE.Group, teacherIdx:number}>}
 */
export function placeTeachers(scene, teacherAnchors, assignment) {
  const placed = new Map();

  for (let i = 0; i < CLASSROOMS.length; i++) {
    const classId = CLASSROOMS[i];
    const anchor = teacherAnchors.get(classId);
    if (!anchor) continue;

    const teacherIdx = assignment[i];
    const teacher = TEACHERS[teacherIdx];
    if (!teacher) continue;

    const group = buildFigure(teacher.appearance);
    group.position.set(anchor.x, 0, anchor.z);
    // 앵커 heading 은 실내를 향하므로, 들어오는 부장(문) 쪽을 바라보도록 +180°.
    // → 교실에 들어선 순간 선생님과 눈이 마주친다.
    group.rotation.y = anchor.heading + Math.PI;

    // 얼굴 전방(문 쪽) 키 라이트 — 입장 시 얼굴이 또렷하게 보이도록.
    // 그룹의 자식으로 달아 재시작 시 함께 제거되고, 로컬 +Z = 정면(문 쪽).
    const keyLight = new THREE.PointLight(0xffe9cc, 0.65, 5.5, 2.0);
    keyLight.position.set(0, 1.5, 1.15);
    group.add(keyLight);

    group.userData.classId = classId;
    group.userData.teacherIdx = teacherIdx;
    group.userData.teacherName = teacher.name;

    scene.add(group);
    placed.set(classId, { group, teacherIdx });
  }

  return placed;
}
