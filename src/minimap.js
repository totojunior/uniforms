// =============================================================
//  마석고 교복지도 — 미니맵 레이더 모듈 (src/minimap.js)
//  우하단 원형 FPS 레이더. 플레이어는 항상 원 중심(빨간 점),
//  맵은 플레이어의 전방(forward)이 화면 위쪽을 향하도록 회전(egocentric).
//  순수 2D 캔버스 + data.js 만 사용. THREE 불필요.
//  좌표계: X = 동(+)/서(-), Z = 남(+)/북(-). 단위 미터.
// =============================================================

import { ROOMS, CORRIDORS, CLASSROOMS, WORLD } from './data.js';
import { ROOF_LAYOUT } from './rooftop.js';

// --- 시각 상수 -------------------------------------------------
const DIAMETER = 180;        // CSS px
const RADIUS = DIAMETER / 2; // 90
const VIEW_RADIUS_M = 24;    // 원 안에 들어오는 월드 반경(미터)
const PAD = 6;               // 가장자리 여백(px) — 링 안쪽에 맵을 둠
const LABEL_RADIUS_M = 16;   // 이 반경 안의 교실에만 번호 라벨 표시

const CLASS_SET = new Set(CLASSROOMS); // 교실 id 빠른 조회

// 방 유형 → 색상군 (CSS hex 문자열)
function roomColors(type, isVisitedClass) {
  switch (type) {
    case 'classroom':
      // 방문 = 초록 / 미방문 = 밝은 호박(amber) — "여기로 가라" 표시
      return isVisitedClass
        ? { fill: '#3fae5a', border: '#1f6e35', glow: null }
        : { fill: '#ffc23a', border: '#b67d10', glow: 'rgba(255,200,60,0.9)' };
    case 'office':
    case 'special':
      return { fill: '#5b6b80', border: '#3a4658', glow: null }; // 차분한 청회색
    case 'stairs':
    case 'restroom':
    case 'elevator':
    case 'facility':
      return { fill: '#4a4a4f', border: '#2c2c30', glow: null }; // 어두운 회색
    default:
      return { fill: '#555a62', border: '#33373d', glow: null };
  }
}

// =============================================================
//  createMinimap(uiRoot) -> { update(px, pz, fdx, fdz, visited), el }
// =============================================================
export function createMinimap(uiRoot) {
  const dpr = Math.max(1, Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));

  // --- DOM 위젯 (인라인 스타일만 사용; 외부 CSS 불필요) ---
  const el = document.createElement('div');
  el.className = 'minimap';
  el.style.position = 'absolute';
  el.style.right = '16px';
  el.style.bottom = '16px';
  el.style.width = DIAMETER + 'px';
  el.style.height = DIAMETER + 'px';
  el.style.borderRadius = '50%';
  el.style.overflow = 'hidden';
  el.style.pointerEvents = 'none';
  el.style.zIndex = '50';
  el.style.boxShadow = '0 2px 10px rgba(0,0,0,0.45)';
  el.style.userSelect = 'none';

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(DIAMETER * dpr);
  canvas.height = Math.round(DIAMETER * dpr);
  canvas.style.width = DIAMETER + 'px';
  canvas.style.height = DIAMETER + 'px';
  canvas.style.display = 'block';
  el.appendChild(canvas);

  uiRoot.appendChild(el);

  const ctx = canvas.getContext('2d');

  // hi-dpi 보정: 이후 모든 그리기는 CSS px 좌표계로 작업
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cx = RADIUS; // 화면 중심 = 원 중심 = 플레이어
  const cy = RADIUS;
  // 월드 미터 → 화면 px 배율 (VIEW_RADIUS_M 가 (RADIUS-PAD) px 안에 들어옴)
  const scale = (RADIUS - PAD) / VIEW_RADIUS_M;

  // onRoof: true 면 3층 평면 대신 옥상(슬래브 + 계단실)을 그린다.
  function update(px, pz, fdx, fdz, visited, extraDots, onRoof) {
    visited = visited || {};

    // 전방 벡터로 heading 계산. 전방이 화면 위(↑)를 향하도록 맵을 -heading 회전.
    // 화면: 위 = -y. 월드 forward (fdx, fdz)가 위를 가리키게 한다.
    // 회전각: forward 를 (0,-1) 화면방향에 맞춤.
    let heading = Math.atan2(fdx, fdz); // 0 = +Z(남) 바라봄
    if (!isFinite(heading)) heading = 0;
    const cosH = Math.cos(heading);
    const sinH = Math.sin(heading);

    // 월드(wx, wz) → 화면(sx, sy). 먼저 플레이어 기준 상대좌표, -heading 회전, y반전.
    function worldToScreen(wx, wz) {
      const dx = wx - px;
      const dz = wz - pz;
      // -heading 회전 (forward 가 +y_local 이 되도록):
      //   localX = dx*cosH - dz*sinH
      //   localY = dx*sinH + dz*cosH   (localY = forward 방향 거리)
      const localX = dx * cosH - dz * sinH;
      const localY = dx * sinH + dz * cosH;
      // 화면: x 오른쪽, forward 는 위(-y) → sy = cy - localY*scale
      return {
        sx: cx + localX * scale,
        sy: cy - localY * scale,
      };
    }

    // --- 배경 클리어 + 반투명 디스크 ---
    ctx.clearRect(0, 0, DIAMETER, DIAMETER);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, RADIUS - 1, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(14,18,24,0.78)';
    ctx.fill();

    // --- 원 안쪽으로 클립 ---
    ctx.beginPath();
    ctx.arc(cx, cy, RADIUS - 1, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (onRoof) {
      // --- 옥상 모드: 슬래브 + 계단실(내려가는 곳) ---
      ctx.fillStyle = 'rgba(190,196,206,0.22)';
      drawWorldRect(ROOF_LAYOUT.cx, ROOF_LAYOUT.cz, ROOF_LAYOUT.w, ROOF_LAYOUT.d, false);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(222,228,238,0.55)';
      drawWorldRectStroke(ROOF_LAYOUT.cx, ROOF_LAYOUT.cz, ROOF_LAYOUT.w, ROOF_LAYOUT.d);

      const hut = ROOF_LAYOUT.hut;
      ctx.shadowColor = 'rgba(255,200,60,0.9)'; // 출구 강조(미방문 교실과 같은 호박색 글로우)
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#ffc23a';
      drawWorldRect(hut.x, hut.z, hut.w, hut.d, false);
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#b67d10';
      drawWorldRectStroke(hut.x, hut.z, hut.w, hut.d);

      // 계단실 라벨(화면 정립)
      const hp = worldToScreen(hut.x, hut.z);
      if (Math.hypot(hp.sx - cx, hp.sy - cy) <= RADIUS - 6) {
        ctx.font = '700 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText('계단', hp.sx + 0.6, hp.sy + 0.6);
        ctx.fillStyle = '#fff4cf';
        ctx.fillText('계단', hp.sx, hp.sy);
      }
    } else {
    // --- 복도(흐린 회색 둥근 사각형) 먼저 ---
    ctx.fillStyle = 'rgba(180,190,200,0.16)';
    for (let i = 0; i < CORRIDORS.length; i++) {
      const c = CORRIDORS[i];
      drawWorldRect(c.x, c.z, c.w, c.d, true);
    }

    // --- 방(작은 채워진 사각형 + 얇은 테두리) ---
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.004;
    const pulse = 0.5 + 0.5 * Math.sin(t); // 0..1 미방문 교실 글로우 펄스용

    for (let i = 0; i < ROOMS.length; i++) {
      const r = ROOMS[i];
      const isClass = CLASS_SET.has(r.id);
      const isVisitedClass = isClass && !!visited[r.id];
      const col = roomColors(r.type, isVisitedClass);

      // 미방문 교실: 펄스 글로우로 "여기로 가라" 강조
      if (isClass && !isVisitedClass && col.glow) {
        ctx.shadowColor = col.glow;
        ctx.shadowBlur = 6 + 8 * pulse;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = col.fill;
      drawWorldRect(r.x, r.z, r.w, r.d, false);

      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = col.border;
      drawWorldRectStroke(r.x, r.z, r.w, r.d);
    }

    // --- 가까운 교실 번호 라벨 (화면 정립; 맵 회전과 무관) ---
    ctx.shadowBlur = 0;
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < ROOMS.length; i++) {
      const r = ROOMS[i];
      if (!CLASS_SET.has(r.id)) continue;
      const ddx = r.x - px;
      const ddz = r.z - pz;
      if (ddx * ddx + ddz * ddz > LABEL_RADIUS_M * LABEL_RADIUS_M) continue;
      const p = worldToScreen(r.x, r.z);
      // 원 밖이면 스킵
      const off = Math.hypot(p.sx - cx, p.sy - cy);
      if (off > RADIUS - 4) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(r.label, p.sx + 0.6, p.sy + 0.6);
      ctx.fillStyle = visited[r.id] ? '#dffbe4' : '#fff4cf';
      ctx.fillText(r.label, p.sx, p.sy);
    }
    } // onRoof else 끝

    // --- 추가 점: 순찰 교장/교감(색깔 점, 발광) ---
    if (extraDots && extraDots.length) {
      for (let i = 0; i < extraDots.length; i++) {
        const d = extraDots[i];
        const p = worldToScreen(d.x, d.z);
        if (Math.hypot(p.sx - cx, p.sy - cy) > RADIUS - 4) continue; // 원 밖 스킵
        const css = typeof d.color === 'number'
          ? '#' + (d.color & 0xffffff).toString(16).padStart(6, '0')
          : (d.color || '#ffffff');
        ctx.shadowColor = css;
        ctx.shadowBlur = 7;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 3.6, 0, Math.PI * 2);
        ctx.fillStyle = css;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.stroke();
      }
    }

    // --- 북(N) 틱: 맵이 회전하므로 화면상 북쪽 위치도 회전 ---
    // 북 = -Z 방향. worldToScreen 으로 플레이어 기준 북쪽 단위벡터 방향을 구함.
    {
      const north = worldToScreen(px, pz - 1); // 북쪽으로 1m
      let nx = north.sx - cx;
      let ny = north.sy - cy;
      const nlen = Math.hypot(nx, ny) || 1;
      nx /= nlen; ny /= nlen;
      const ringR = RADIUS - 9;
      const tx = cx + nx * ringR;
      const ty = cy + ny * ringR;
      // 작은 틱 선
      ctx.strokeStyle = 'rgba(220,230,240,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + nx * (ringR - 6), cy + ny * (ringR - 6));
      ctx.lineTo(tx, ty);
      ctx.stroke();
      // 'N' 글자 (화면 정립)
      ctx.font = '700 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(235,242,250,0.95)';
      ctx.fillText('N', cx + nx * (ringR - 14), cy + ny * (ringR - 14));
    }

    ctx.restore(); // 클립 해제

    // --- 플레이어: 중앙 빨간 점 + 위(전방) 향한 삼각 웨지 ---
    // 전방은 항상 화면 위(-y).
    ctx.save();
    ctx.translate(cx, cy);
    // 웨지(전방 표시)
    ctx.beginPath();
    ctx.moveTo(0, -11);     // 꼭짓점(전방)
    ctx.lineTo(-6, 6);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(6, 6);
    ctx.closePath();
    ctx.fillStyle = 'rgba(217,79,79,0.55)';
    ctx.fill();
    // 중심 점
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#e23b3b';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();

    // --- 외곽 링 테두리 ---
    ctx.beginPath();
    ctx.arc(cx, cy, RADIUS - 1.5, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(230,238,248,0.55)';
    ctx.stroke();

    // --- 헬퍼: 월드 사각형을 화면 4모서리로 변환해 채움/그림 ---
    function drawWorldRect(wx, wz, ww, wd, rounded) {
      const hw = ww / 2;
      const hd = wd / 2;
      const a = worldToScreen(wx - hw, wz - hd);
      const b = worldToScreen(wx + hw, wz - hd);
      const c2 = worldToScreen(wx + hw, wz + hd);
      const d2 = worldToScreen(wx - hw, wz + hd);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.lineTo(c2.sx, c2.sy);
      ctx.lineTo(d2.sx, d2.sy);
      ctx.closePath();
      ctx.fill();
    }
    function drawWorldRectStroke(wx, wz, ww, wd) {
      const hw = ww / 2;
      const hd = wd / 2;
      const a = worldToScreen(wx - hw, wz - hd);
      const b = worldToScreen(wx + hw, wz - hd);
      const c2 = worldToScreen(wx + hw, wz + hd);
      const d2 = worldToScreen(wx - hw, wz + hd);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.lineTo(c2.sx, c2.sy);
      ctx.lineTo(d2.sx, d2.sy);
      ctx.closePath();
      ctx.stroke();
    }
  }

  return { update, el };
}
