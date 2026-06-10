// =============================================================
//  마석고 교복지도 — 대화(비주얼노벨) 모듈 (src/dialogue.js)
//  createDialogue(uiRoot, audio)
//   -> { startEncounter({ classLabel, teacher, boss }) -> Promise, isOpen() }
//
//  교실 진입 시 호출되는 2줄 대화:
//    1) BOSS.assign 무작위 1줄 ({teacher}/{class} 치환)
//    2) teacher.accept 무작위 1줄
//  교사 외형(appearance)을 캔버스에 미니 초상화로 그리고 이름을 표시.
//  패널 클릭 / Enter / Space 로 다음 줄 진행. 마지막 줄에서 닫으면 Promise resolve.
//  타자기(typewriter) 효과 + audio.blip() 줄마다, audio.door() 열릴 때.
// =============================================================

// ---- 유틸 ----------------------------------------------------

// 0xRRGGBB 숫자 색상 -> CSS '#rrggbb' 문자열
function hexToCss(n) {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0');
}

// 색상 밝기 보정 (음수=어둡게, 양수=밝게). amt: -1..1
function shade(n, amt) {
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  const f = (c) =>
    amt >= 0
      ? Math.round(c + (255 - c) * amt)
      : Math.round(c * (1 + amt));
  return hexToCss((f(r) << 16) | (f(g) << 8) | f(b));
}

// 배열에서 무작위 1개
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// {teacher}, {class} 치환
function fillTemplate(line, teacherName, classLabel) {
  return line
    .replace(/\{teacher\}/g, teacherName)
    .replace(/\{class\}/g, classLabel);
}

// ---- 초상화 렌더링 -------------------------------------------

// teacher.appearance 로부터 작은 정사각 캔버스 초상화를 그린다.
//   - 배경(둥근 사각)
//   - 어깨(top 색)
//   - 목 + 얼굴(skin 색) 둥근 머리
//   - 머리카락(hairStyle 별 형태, hair 색)
//   - 안경(accessory === 'glasses')
function drawPortrait(canvas, appearance, accentCss) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const skin = hexToCss(appearance.skin);
  const hair = hexToCss(appearance.hair);
  const top = hexToCss(appearance.top);

  ctx.clearRect(0, 0, W, H);

  // 배경 (은은한 세로 그라데이션)
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#2a3340');
  bg.addColorStop(1, '#1b2129');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 14);
  ctx.fill();

  const cx = W / 2;

  // ── 어깨 (상의 색) ──
  ctx.fillStyle = top;
  ctx.beginPath();
  const shoulderTop = H * 0.74;
  const shoulderHalf = W * 0.42;
  ctx.moveTo(cx - shoulderHalf, H);
  ctx.quadraticCurveTo(cx - shoulderHalf, shoulderTop, cx - W * 0.16, shoulderTop - H * 0.02);
  ctx.lineTo(cx + W * 0.16, shoulderTop - H * 0.02);
  ctx.quadraticCurveTo(cx + shoulderHalf, shoulderTop, cx + shoulderHalf, H);
  ctx.closePath();
  ctx.fill();

  // 옷깃(살짝 어둡게) — 정장/단정 느낌
  ctx.fillStyle = shade(appearance.top, -0.22);
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.16, shoulderTop);
  ctx.lineTo(cx, H * 0.9);
  ctx.lineTo(cx + W * 0.16, shoulderTop);
  ctx.closePath();
  ctx.fill();

  // ── 목 ──
  const neckW = W * 0.16;
  ctx.fillStyle = shade(appearance.skin, -0.1);
  ctx.fillRect(cx - neckW / 2, H * 0.6, neckW, H * 0.18);

  // ── 얼굴 ──
  const faceCx = cx;
  const faceCy = H * 0.44;
  const faceRx = W * 0.22;
  const faceRy = H * 0.27;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(faceCx, faceCy, faceRx, faceRy, 0, 0, Math.PI * 2);
  ctx.fill();

  // 귀
  ctx.beginPath();
  ctx.ellipse(faceCx - faceRx, faceCy + faceRy * 0.1, faceRx * 0.22, faceRy * 0.22, 0, 0, Math.PI * 2);
  ctx.ellipse(faceCx + faceRx, faceCy + faceRy * 0.1, faceRx * 0.22, faceRy * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── 머리카락 (hairStyle 별) ──
  drawHair(ctx, appearance.hairStyle, hair, faceCx, faceCy, faceRx, faceRy, H);

  // ── 눈썹/눈 ──
  const eyeY = faceCy - faceRy * 0.02;
  const eyeDx = faceRx * 0.45;
  ctx.fillStyle = '#3a2b22';
  // 눈
  ctx.beginPath();
  ctx.ellipse(faceCx - eyeDx, eyeY, faceRx * 0.12, faceRy * 0.09, 0, 0, Math.PI * 2);
  ctx.ellipse(faceCx + eyeDx, eyeY, faceRx * 0.12, faceRy * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  // 코 (작은 선)
  ctx.strokeStyle = shade(appearance.skin, -0.28);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(faceCx, eyeY + faceRy * 0.18);
  ctx.lineTo(faceCx - faceRx * 0.08, eyeY + faceRy * 0.38);
  ctx.lineTo(faceCx + faceRx * 0.04, eyeY + faceRy * 0.4);
  ctx.stroke();

  // 입 (살짝 미소)
  ctx.strokeStyle = '#8a4a44';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(faceCx - faceRx * 0.3, faceCy + faceRy * 0.55);
  ctx.quadraticCurveTo(faceCx, faceCy + faceRy * 0.72, faceCx + faceRx * 0.3, faceCy + faceRy * 0.55);
  ctx.stroke();

  // ── 안경 ──
  if (appearance.accessory === 'glasses') {
    ctx.strokeStyle = '#1c2026';
    ctx.lineWidth = 3;
    const r = faceRx * 0.26;
    ctx.beginPath();
    ctx.arc(faceCx - eyeDx, eyeY, r, 0, Math.PI * 2);
    ctx.arc(faceCx + eyeDx, eyeY, r, 0, Math.PI * 2);
    ctx.stroke();
    // 다리(브릿지)
    ctx.beginPath();
    ctx.moveTo(faceCx - eyeDx + r, eyeY);
    ctx.lineTo(faceCx + eyeDx - r, eyeY);
    ctx.stroke();
  }

  // 테두리 강조
  ctx.strokeStyle = accentCss;
  ctx.lineWidth = 3;
  roundRect(ctx, 1.5, 1.5, W - 3, H - 3, 13);
  ctx.stroke();
}

// hairStyle 별 머리카락
function drawHair(ctx, style, hair, fx, fy, frx, fry, H) {
  ctx.fillStyle = hair;
  if (style === 'bald') {
    // 옆머리만 살짝
    ctx.beginPath();
    ctx.ellipse(fx - frx * 0.95, fy, frx * 0.25, fry * 0.35, 0, 0, Math.PI * 2);
    ctx.ellipse(fx + frx * 0.95, fy, frx * 0.25, fry * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // 윗머리 캡(공통)
  ctx.beginPath();
  ctx.ellipse(fx, fy - fry * 0.32, frx * 1.12, fry * 0.92, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  switch (style) {
    case 'short':
      // 짧은 옆머리
      ctx.beginPath();
      ctx.moveTo(fx - frx * 1.12, fy - fry * 0.3);
      ctx.quadraticCurveTo(fx - frx * 1.2, fy + fry * 0.1, fx - frx * 0.95, fy + fry * 0.2);
      ctx.lineTo(fx - frx * 0.95, fy - fry * 0.2);
      ctx.closePath();
      ctx.moveTo(fx + frx * 1.12, fy - fry * 0.3);
      ctx.quadraticCurveTo(fx + frx * 1.2, fy + fry * 0.1, fx + frx * 0.95, fy + fry * 0.2);
      ctx.lineTo(fx + frx * 0.95, fy - fry * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'medium':
      // 귀를 덮는 중간 길이
      ctx.beginPath();
      ctx.moveTo(fx - frx * 1.12, fy - fry * 0.4);
      ctx.quadraticCurveTo(fx - frx * 1.25, fy + fry * 0.5, fx - frx * 0.85, fy + fry * 0.55);
      ctx.lineTo(fx - frx * 0.9, fy - fry * 0.1);
      ctx.closePath();
      ctx.moveTo(fx + frx * 1.12, fy - fry * 0.4);
      ctx.quadraticCurveTo(fx + frx * 1.25, fy + fry * 0.5, fx + frx * 0.85, fy + fry * 0.55);
      ctx.lineTo(fx + frx * 0.9, fy - fry * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    case 'long':
      // 어깨까지 내려오는 긴 머리
      ctx.beginPath();
      ctx.moveTo(fx - frx * 1.12, fy - fry * 0.4);
      ctx.quadraticCurveTo(fx - frx * 1.35, fy + fry * 1.4, fx - frx * 0.8, fy + fry * 1.6);
      ctx.lineTo(fx - frx * 0.55, fy + fry * 0.2);
      ctx.lineTo(fx - frx * 0.9, fy - fry * 0.1);
      ctx.closePath();
      ctx.moveTo(fx + frx * 1.12, fy - fry * 0.4);
      ctx.quadraticCurveTo(fx + frx * 1.35, fy + fry * 1.4, fx + frx * 0.8, fy + fry * 1.6);
      ctx.lineTo(fx + frx * 0.55, fy + fry * 0.2);
      ctx.lineTo(fx + frx * 0.9, fy - fry * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    case 'bob':
      // 단발 — 턱선 정도
      ctx.beginPath();
      ctx.moveTo(fx - frx * 1.18, fy - fry * 0.4);
      ctx.quadraticCurveTo(fx - frx * 1.28, fy + fry * 0.85, fx - frx * 0.75, fy + fry * 0.9);
      ctx.lineTo(fx - frx * 0.78, fy);
      ctx.closePath();
      ctx.moveTo(fx + frx * 1.18, fy - fry * 0.4);
      ctx.quadraticCurveTo(fx + frx * 1.28, fy + fry * 0.85, fx + frx * 0.75, fy + fry * 0.9);
      ctx.lineTo(fx + frx * 0.78, fy);
      ctx.closePath();
      ctx.fill();
      break;
    case 'ponytail':
      // 옆은 짧게 + 뒤로 묶은 꼬리
      ctx.beginPath();
      ctx.ellipse(fx + frx * 1.0, fy + fry * 0.3, frx * 0.28, fry * 0.9, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(fx - frx * 1.12, fy - fry * 0.3);
      ctx.quadraticCurveTo(fx - frx * 1.18, fy + fry * 0.2, fx - frx * 0.9, fy + fry * 0.25);
      ctx.lineTo(fx - frx * 0.9, fy - fry * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      break;
  }
}

// 둥근 사각형 경로
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---- DOM 구성 ------------------------------------------------

function buildPanel(uiRoot) {
  let panel = uiRoot.querySelector('#dialogue');
  if (panel) {
    panel.innerHTML = '';
  } else {
    panel = document.createElement('div');
    panel.id = 'dialogue';
    uiRoot.appendChild(panel);
  }

  // 인라인 스타일(스타일시트가 없어도 동작하도록 기본값 보장)
  Object.assign(panel.style, {
    position: 'absolute',
    left: '50%',
    bottom: '5%',
    transform: 'translateX(-50%)',
    width: 'min(760px, 92vw)',
    display: 'none',
    boxSizing: 'border-box',
    padding: '16px 18px',
    gap: '16px',
    alignItems: 'stretch',
    background: 'rgba(20, 26, 33, 0.94)',
    border: '2px solid #d94f4f',
    borderRadius: '14px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
    color: '#f2f0ea',
    fontFamily:
      '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif',
    zIndex: '50',
    cursor: 'pointer',
    userSelect: 'none',
  });

  // 초상화 캔버스
  const canvas = document.createElement('canvas');
  canvas.width = 224;
  canvas.height = 272;
  canvas.className = 'dlg-portrait';
  Object.assign(canvas.style, {
    width: '152px',
    height: '184px',
    flex: '0 0 auto',
    borderRadius: '12px',
    alignSelf: 'center',
    // 방어적 고정: 전역 canvas 규칙(position:fixed 등)이 새어들어와도
    // 초상화는 플렉스 흐름 안에 머물러 본문 텍스트와 겹치지 않게 한다.
    position: 'relative',
    inset: 'auto',
    display: 'block',
  });

  // 텍스트 영역
  const body = document.createElement('div');
  body.className = 'dlg-body';
  Object.assign(body.style, {
    flex: '1 1 auto',
    display: 'flex',
    flexDirection: 'column',
    minWidth: '0',
  });

  const nameEl = document.createElement('div');
  nameEl.className = 'dlg-name';
  Object.assign(nameEl.style, {
    fontWeight: '700',
    fontSize: '17px',
    color: '#ffd27a',
    marginBottom: '8px',
    letterSpacing: '0.5px',
  });

  const textEl = document.createElement('div');
  textEl.className = 'dlg-text';
  Object.assign(textEl.style, {
    flex: '1 1 auto',
    fontSize: '17px',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    wordBreak: 'keep-all',
    minHeight: '3.2em',
  });

  const hintEl = document.createElement('div');
  hintEl.className = 'dlg-hint';
  hintEl.textContent = '▶ 클릭 또는 Enter / Space';
  Object.assign(hintEl.style, {
    alignSelf: 'flex-end',
    marginTop: '8px',
    fontSize: '12px',
    color: '#8a98a6',
    opacity: '0.85',
  });

  body.appendChild(nameEl);
  body.appendChild(textEl);
  body.appendChild(hintEl);

  panel.style.display = 'none';
  // flex 컨테이너로 사용 (보일 때 flex 로 전환)
  panel.appendChild(canvas);
  panel.appendChild(body);

  return { panel, canvas, nameEl, textEl, hintEl };
}

// ---- 메인 팩토리 ---------------------------------------------

export function createDialogue(uiRoot, audio) {
  const { panel, canvas, nameEl, textEl, hintEl } = buildPanel(uiRoot);

  let open = false;        // 현재 패널 표시 여부
  let lines = [];          // [{ name, text }] 진행할 줄들
  let lineIndex = 0;       // 현재 줄 인덱스
  let resolveFn = null;    // startEncounter Promise resolve
  let advancing = false;   // 더블 진행 가드

  // 타자기 상태
  let typeTimer = null;
  let typing = false;
  let fullText = '';
  let charPos = 0;

  function clearTyping() {
    if (typeTimer !== null) {
      clearInterval(typeTimer);
      typeTimer = null;
    }
    typing = false;
  }

  // 한 줄 표시 시작 (타자기 효과 + blip)
  function showLine(idx) {
    const line = lines[idx];
    nameEl.textContent = line.name;
    // 화자 구분: 부장(보스)은 남색 톤, 교사는 금색 톤으로 이름표 색을 바꿔
    // 비주얼노벨의 화자 전환(부장 → 교사)을 시각적으로 알린다.
    // (인라인 스타일을 쓰므로 styles.css 의 .is-boss 대신 직접 색을 지정)
    nameEl.style.color = line.isBoss ? '#cfe0f0' : '#ffd27a';
    // 화자별 초상화 전환(라인에 appearance 가 있으면 다시 그림 — 교장/교감 조우 등 다화자)
    if (line.appearance) {
      drawPortrait(canvas, line.appearance, line.isBoss ? '#8fb4d8' : '#d94f4f');
    }
    fullText = line.text;
    charPos = 0;
    textEl.textContent = '';
    hintEl.style.visibility = 'hidden';

    if (audio && typeof audio.blip === 'function') {
      audio.blip();
    }

    clearTyping();
    typing = true;
    typeTimer = setInterval(() => {
      charPos++;
      textEl.textContent = fullText.slice(0, charPos);
      if (charPos >= fullText.length) {
        clearTyping();
        hintEl.style.visibility = 'visible';
      }
    }, 26);
  }

  // 진행: 타자기 중이면 즉시 완성, 아니면 다음 줄/종료
  function advance() {
    if (!open || advancing) return;
    advancing = true;

    try {
      if (typing) {
        // 타이핑 중 -> 즉시 전체 표시
        clearTyping();
        textEl.textContent = fullText;
        hintEl.style.visibility = 'visible';
        return;
      }

      lineIndex++;
      if (lineIndex < lines.length) {
        showLine(lineIndex);
      } else {
        close();
      }
    } finally {
      advancing = false;
    }
  }

  // 입력 핸들러 (등록/해제 관리)
  function onClick() {
    advance();
  }
  function onKeyDown(e) {
    if (!open) return;
    if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      advance();
    }
  }

  function addListeners() {
    panel.addEventListener('click', onClick);
    window.addEventListener('keydown', onKeyDown, true);
  }
  function removeListeners() {
    panel.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKeyDown, true);
  }

  function close() {
    if (!open) return;
    clearTyping();
    removeListeners();
    panel.style.display = 'none';
    open = false;
    const r = resolveFn;
    resolveFn = null;
    lines = [];
    lineIndex = 0;
    if (typeof r === 'function') r();
  }

  // 외부 API: 교실 인카운터 시작
  function startEncounter({ classLabel, teacher, boss }) {
    return new Promise((resolve) => {
      // 진행 중이던 대화가 있으면 안전하게 정리
      if (open) {
        close();
      }
      resolveFn = resolve;

      // 1줄: 부장 배정 대사 ({teacher}/{class} 치환)
      const assignRaw = pick(boss.lines.assign);
      const assignText = fillTemplate(assignRaw, teacher.name, classLabel);
      // 2줄: 교사 수락 대사
      const acceptText = pick(teacher.lines.accept);

      lines = [
        { name: boss.name, text: assignText, isBoss: true },
        { name: teacher.name, text: acceptText, isBoss: false },
      ];
      lineIndex = 0;

      // 초상화는 교사 외형으로 (대화 주인공 = 교사)
      drawPortrait(canvas, teacher.appearance, '#d94f4f');

      // 패널 열기
      open = true;
      panel.style.display = 'flex';
      addListeners();

      // 문 여는 효과음
      if (audio && typeof audio.door === 'function') {
        audio.door();
      }

      showLine(0);
    });
  }

  // 외부 API: 임의의 화자 대화(교장/교감 조우 등). entries=[{name,text,isBoss,appearance}]
  function startConversation(entries) {
    return new Promise((resolve) => {
      if (open) close();
      resolveFn = resolve;
      lines = (entries || []).map((e) => ({
        name: e.name, text: e.text, isBoss: !!e.isBoss, appearance: e.appearance,
      }));
      lineIndex = 0;
      const first = lines[0];
      if (first && first.appearance) {
        drawPortrait(canvas, first.appearance, first.isBoss ? '#8fb4d8' : '#d94f4f');
      }
      open = true;
      panel.style.display = 'flex';
      addListeners();
      if (audio && typeof audio.door === 'function') audio.door();
      showLine(0);
    });
  }

  function isOpen() {
    return open;
  }

  return { startEncounter, startConversation, isOpen };
}
