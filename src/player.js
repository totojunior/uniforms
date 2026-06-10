// =============================================================
//  마석고 교복지도 — 플레이어 컨트롤러 (src/player.js)
//  좌표계: X = 동(+)/서(-), Z = 남(+)/북(-), Y = 위. 단위 미터.
//  PointerLockControls 로 시점 회전, WASD 로 시선 기준 이동.
//  충돌: 플레이어를 반지름 0.35m 원으로 보고, 각 콜라이더 AABB 를
//        반지름만큼 확장한 사각형과 검사한다. X/Z 축을 따로 해소해
//        벽을 따라 미끄러질 수 있게 한다(슬라이드).
//  눈높이 y 는 항상 1.6m 로 고정.
// =============================================================

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// 플레이어 충돌 반지름(원 모델) 및 눈높이
const PLAYER_RADIUS = 0.35;
const EYE_HEIGHT = 1.6;
// 걷기 / 달리기 속도(m/s). Shift 를 누르면 달린다.
const WALK_SPEED = 3.7;
const RUN_SPEED = 7.0;

/**
 * 플레이어 컨트롤러 생성.
 * @param {THREE.Camera} camera     - 1인칭 카메라(눈)
 * @param {HTMLElement}  domElement - 포인터 락을 걸 대상(보통 렌더러 캔버스)
 * @param {Array<{minX:number,maxX:number,minZ:number,maxZ:number}>} colliders - 평면 충돌 AABB 목록
 * @returns {{ controls:PointerLockControls, update:(dt:number,isBlocked:boolean)=>void,
 *            getPosition:()=>{x:number,z:number}, setPosition:(x:number,z:number)=>void,
 *            lock:()=>void, unlock:()=>void, isLocked:()=>boolean }}
 */
export function createPlayer(camera, domElement, colliders) {
  const controls = new PointerLockControls(camera, domElement);

  // 카메라 눈높이 고정
  camera.position.y = EYE_HEIGHT;

  // 안전하게 콜라이더 목록 확보(없으면 빈 배열)
  const aabbs = Array.isArray(colliders) ? colliders : [];

  // 눌린 키 상태
  const keys = {
    forward: false, // W
    back: false,    // S
    left: false,    // A (좌측 스트래프)
    right: false,   // D (우측 스트래프)
    run: false,     // Shift (달리기)
  };
  let running = false; // 현재 달리는 중인지(이동+Shift) — main 발소리 박자에 사용

  // ── 키 입력(window 에 등록) ───────────────────────────────
  function onKeyDown(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    keys.forward = true; break;
      case 'KeyS': case 'ArrowDown':  keys.back = true;    break;
      case 'KeyA': case 'ArrowLeft':  keys.left = true;    break;
      case 'KeyD': case 'ArrowRight': keys.right = true;   break;
      case 'ShiftLeft': case 'ShiftRight': keys.run = true; break;
      default: return;
    }
  }
  function onKeyUp(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    keys.forward = false; break;
      case 'KeyS': case 'ArrowDown':  keys.back = false;    break;
      case 'KeyA': case 'ArrowLeft':  keys.left = false;    break;
      case 'KeyD': case 'ArrowRight': keys.right = false;   break;
      case 'ShiftLeft': case 'ShiftRight': keys.run = false; break;
      default: return;
    }
  }
  // 키를 모두 떼는 상황(포커스 이탈/락 해제) 대비 초기화
  function clearKeys() {
    keys.forward = keys.back = keys.left = keys.right = keys.run = false;
    running = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearKeys);
  // 포인터 락이 풀리면 입력을 흘려보내지 않도록 초기화
  controls.addEventListener('unlock', clearKeys);

  // ── 시선 기준 평면 방향 벡터(재사용) ─────────────────────
  const forwardDir = new THREE.Vector3(); // 카메라가 바라보는 방향(평면 투영)
  const rightDir = new THREE.Vector3();   // 카메라 기준 오른쪽(평면)
  const moveDir = new THREE.Vector3();     // 최종 이동 방향(정규화)
  const UP = new THREE.Vector3(0, 1, 0);

  /**
   * 제안된 XZ 위치(반지름 확장 AABB)에서 어느 한 축이라도 콜라이더와 겹치는지 검사.
   * @returns {boolean} 겹치면 true
   */
  function collidesAt(x, z) {
    const r = PLAYER_RADIUS;
    for (let i = 0; i < aabbs.length; i++) {
      const b = aabbs[i];
      if (
        x > b.minX - r && x < b.maxX + r &&
        z > b.minZ - r && z < b.maxZ + r
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * 매 프레임 갱신.
   * @param {number}  dt        - 경과 시간(초)
   * @param {boolean} isBlocked - true 면(대화창 열림 등) 이동 입력 무시
   */
  function update(dt, isBlocked) {
    // 눈높이는 어떤 경우에도 고정
    camera.position.y = EYE_HEIGHT;
    running = false;

    // 대화 중이면 속도를 0으로 두고 입력을 무시(이동 없음)
    if (isBlocked) return;

    // 입력으로부터 이동 방향(로컬: 전후/좌우) 계산
    let inputF = 0; // 전(+)/후(-)
    let inputR = 0; // 우(+)/좌(-)
    if (keys.forward) inputF += 1;
    if (keys.back)    inputF -= 1;
    if (keys.right)   inputR += 1;
    if (keys.left)    inputR -= 1;

    if (inputF === 0 && inputR === 0) return; // 입력 없음
    running = keys.run; // 이동 입력이 있을 때만 달리기 상태로 간주

    // 카메라 시선의 수평 성분(전방)과 오른쪽 벡터 계산
    camera.getWorldDirection(forwardDir);
    forwardDir.y = 0;
    if (forwardDir.lengthSq() < 1e-8) return; // 수직 응시 등 예외 방지
    forwardDir.normalize();
    // 오른쪽 = forward × up (좌표계상 +X 오른쪽이 되도록)
    rightDir.crossVectors(forwardDir, UP).normalize();

    // 최종 이동 방향 = 전방*inputF + 오른쪽*inputR (정규화하여 대각 가속 방지)
    moveDir.set(0, 0, 0);
    moveDir.addScaledVector(forwardDir, inputF);
    moveDir.addScaledVector(rightDir, inputR);
    if (moveDir.lengthSq() < 1e-8) return;
    moveDir.normalize();

    const dist = (keys.run ? RUN_SPEED : WALK_SPEED) * dt;
    const dx = moveDir.x * dist;
    const dz = moveDir.z * dist;

    const curX = camera.position.x;
    const curZ = camera.position.z;

    // 축별로 따로 해소 → 벽을 따라 미끄러짐(슬라이드)
    let nextX = curX;
    let nextZ = curZ;

    // X 축 이동 시도
    if (dx !== 0 && !collidesAt(curX + dx, curZ)) {
      nextX = curX + dx;
    }
    // Z 축 이동 시도(이미 갱신된 X 기준으로 검사)
    if (dz !== 0 && !collidesAt(nextX, curZ + dz)) {
      nextZ = curZ + dz;
    }

    camera.position.x = nextX;
    camera.position.z = nextZ;
  }

  /** 현재 평면 위치 반환 */
  function getPosition() {
    return { x: camera.position.x, z: camera.position.z };
  }

  /** 평면 위치 설정(눈높이는 유지) */
  function setPosition(x, z) {
    camera.position.x = x;
    camera.position.z = z;
    camera.position.y = EYE_HEIGHT;
  }

  /** 포인터 락 시작 */
  function lock() {
    controls.lock();
  }

  /** 포인터 락 해제(커서 복귀) — 요약/대화 등에서 UI 클릭이 필요할 때 호출 */
  function unlock() {
    controls.unlock();
  }

  /** 포인터 락 상태 */
  function isLocked() {
    return controls.isLocked === true;
  }

  return { controls, update, getPosition, setPosition, lock, unlock, isLocked, isRunning: () => running };
}
