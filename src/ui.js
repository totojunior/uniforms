// =============================================================
//  마석고 교복지도 — UI 모듈 (src/ui.js)
//  uiRoot(#ui-root) 아래에 타이틀/HUD/도움말/배정표/토스트를 그린다.
//  pointer-events 규칙:
//    - 컨테이너(레이어)는 기본 pointer-events:none → 게임(캔버스) 클릭을 막지 않음
//    - 버튼/표 등 실제 상호작용 요소만 pointer-events:auto 로 다시 켠다
//  외부 의존성 없음 — 순수 DOM. 사용자에게 보이는 텍스트는 한국어.
// =============================================================

export function createUI(uiRoot) {
  // ---- 스타일 1회 주입 (styles.css 가 없어도 동작하도록 자급자족) ----
  injectStyles();

  // ---- 레이어 컨테이너 생성 ----
  uiRoot.classList.add('ui-root');

  const titleLayer = el('div', 'ui-layer ui-title');
  const hudLayer = el('div', 'ui-layer ui-hud');
  const helpLayer = el('div', 'ui-layer ui-help');
  const summaryLayer = el('div', 'ui-layer ui-summary');
  const toastLayer = el('div', 'ui-layer ui-toast-layer');

  // 처음엔 전부 숨김
  [titleLayer, hudLayer, helpLayer, summaryLayer, toastLayer].forEach((l) => {
    l.style.display = 'none';
    uiRoot.appendChild(l);
  });

  // =========================================================
  //  타이틀 화면
  // =========================================================
  function buildTitle(onStart) {
    titleLayer.replaceChildren();

    const card = el('div', 'ui-card ui-title-card');

    const kicker = el('div', 'ui-kicker', '마석고등학교 · 3층 2학년 교무실');
    const h1 = el('h1', 'ui-title-h1', '마석고 교복지도');
    const sub = el(
      'p',
      'ui-title-sub',
      '오늘도 학생들의 교복은 단정한가? 부장 김준식의 지시를 받아\n11개 학급을 돌며 교복지도 배정을 마치자.'
    );

    const startBtn = el('button', 'ui-btn ui-btn-primary', '시작');
    startBtn.type = 'button';
    startBtn.addEventListener('click', () => {
      titleLayer.style.display = 'none';
      if (typeof onStart === 'function') onStart();
    });

    const hint = el(
      'div',
      'ui-title-hint',
      '이동 WASD · 달리기 Shift · 시점 마우스 · 도움말 H · 음소거 M · 캔버스를 클릭하면 시점이 고정됩니다.'
    );

    const credit = el(
      'div',
      'ui-title-credit',
      '제작: 2학년부 · 사다리타기 대체 시스템 v2.0 (결재: 부장 김준식)'
    );

    card.append(kicker, h1, sub, startBtn, hint, credit);
    titleLayer.appendChild(card);
  }

  function showTitle(onStart) {
    buildTitle(onStart);
    titleLayer.style.display = 'flex';
  }

  // =========================================================
  //  HUD (시계 / 배정 카운터 / 음소거·도움말 힌트)
  // =========================================================
  let clockNode = null;
  let visitedNode = null;
  let clockLabelNode = null;

  function buildHUD() {
    hudLayer.replaceChildren();

    // 좌상단: 시계
    const clockBox = el('div', 'hud-corner hud-tl');
    clockNode = el('div', 'hud-clock', '08:30');
    clockLabelNode = el('div', 'hud-clock-label', '오전 조회');
    clockBox.append(clockNode, clockLabelNode);

    // 우상단: 배정 카운터
    const visitedBox = el('div', 'hud-corner hud-tr');
    visitedNode = el('div', 'hud-visited', '교복지도 배정 0/11');
    visitedBox.append(visitedNode);

    // 하단 중앙: 조작 힌트
    const hintBox = el('div', 'hud-corner hud-bottom');
    hintBox.append(el('span', 'hud-hint', 'WASD 이동 · Shift 달리기 · 마우스 시점 · H 도움말 · M 음소거'));

    // 화면 중앙: 조준점(크로스헤어)
    const crosshair = el('div', 'hud-crosshair');

    hudLayer.append(clockBox, visitedBox, hintBox, crosshair);
  }

  function startHUD() {
    if (!clockNode || !visitedNode) buildHUD();
    hudLayer.style.display = 'block';
  }

  function setClock(text) {
    if (!clockNode) buildHUD();
    clockNode.textContent = text;
  }

  function setVisited(n, total) {
    if (!visitedNode) buildHUD();
    visitedNode.textContent = `교복지도 배정 ${n}/${total}`;
  }

  // 시계 아래 작은 라벨('오전 조회' → '조회 연장전' 등)
  function setClockLabel(text) {
    if (!clockLabelNode) buildHUD();
    clockLabelNode.textContent = text;
  }

  // =========================================================
  //  도움말 오버레이 (토글)
  // =========================================================
  let helpBuilt = false;

  function buildHelp() {
    helpLayer.replaceChildren();

    const card = el('div', 'ui-card ui-help-card');
    const h2 = el('h2', 'ui-help-h2', '조작 안내');

    const rows = [
      ['W A S D', '앞 / 왼쪽 / 뒤 / 오른쪽 이동'],
      ['Shift', '달리기 (빠르게 이동)'],
      ['마우스', '시점 회전'],
      ['캔버스 클릭', '시점 고정(잠금) — Esc 로 해제'],
      ['교실 진입', '담당 선생님과 자동으로 교복지도 배정'],
      ['우하단 레이더', '노란 방 = 아직 안 간 교실 / 빨간 점 = 나(부장)'],
      ['중앙 계단', '옥상으로 올라갈 수 있다 (올라가면 무슨 일이…?)'],
      ['후드티 학생', '복도에서 발견하면 따라가서 단속할 수 있다'],
      ['H', '이 도움말 열기 / 닫기'],
      ['M', '음소거 켜기 / 끄기'],
    ];

    const list = el('div', 'ui-help-list');
    for (const [key, desc] of rows) {
      const row = el('div', 'ui-help-row');
      row.append(el('span', 'ui-help-key', key), el('span', 'ui-help-desc', desc));
      list.appendChild(row);
    }

    const closeBtn = el('button', 'ui-btn ui-btn-ghost', '닫기 (H)');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => {
      helpLayer.style.display = 'none';
    });

    card.append(h2, list, closeBtn);
    helpLayer.appendChild(card);
    helpBuilt = true;
  }

  function showHelp() {
    if (!helpBuilt) buildHelp();
    // 토글: 보이면 숨기고, 숨겨져 있으면 보인다.
    helpLayer.style.display = helpLayer.style.display === 'flex' ? 'none' : 'flex';
  }

  // =========================================================
  //  배정표 (요약 화면)
  // =========================================================
  function buildSummary(table, onRestart, opts) {
    summaryLayer.replaceChildren();

    const card = el('div', 'ui-card ui-summary-card');

    const kicker = el('div', 'ui-kicker', '부장 김준식 결재 완료');
    const h2 = el('h2', 'ui-summary-h2', '오늘의 교복지도 배정표');
    const sub = el('p', 'ui-summary-sub', '11개 학급 모두 배정을 마쳤습니다. 수고 많으셨습니다!');

    // 소요 시간 + 부장 칭호(있을 때만)
    let grade = null;
    if (opts && (opts.timeText || opts.gradeText)) {
      const parts = [];
      if (opts.timeText) parts.push(`순찰 시간 ${opts.timeText}`);
      if (opts.gradeText) parts.push(`오늘의 칭호: ${opts.gradeText}`);
      grade = el('div', 'ui-summary-grade', parts.join('  ·  '));
    }

    // 표
    const tableEl = el('table', 'ui-table');
    const thead = el('thead');
    const headRow = el('tr');
    headRow.append(thEl('반'), thEl('담당 선생님'));
    thead.appendChild(headRow);

    const tbody = el('tbody');
    const rows = Array.isArray(table) ? table : [];
    for (const r of rows) {
      const tr = el('tr');
      const classLabel = r.classLabel != null ? r.classLabel : r.classId != null ? r.classId : '';
      const teacherName = r.teacherName != null ? r.teacherName : '';
      tr.append(tdEl(classLabel, 'ui-td-class'), tdEl(teacherName, 'ui-td-teacher'));
      tbody.appendChild(tr);
    }
    tableEl.append(thead, tbody);

    // 스크롤 가능한 표 래퍼 (행이 많아도 버튼이 항상 보이도록)
    const tableWrap = el('div', 'ui-table-wrap');
    tableWrap.appendChild(tableEl);

    const restartBtn = el('button', 'ui-btn ui-btn-primary', '다시하기');
    restartBtn.type = 'button';
    restartBtn.addEventListener('click', () => {
      summaryLayer.style.display = 'none';
      if (typeof onRestart === 'function') onRestart();
    });

    if (grade) card.append(kicker, h2, sub, grade, tableWrap, restartBtn);
    else card.append(kicker, h2, sub, tableWrap, restartBtn);
    summaryLayer.appendChild(card);
  }

  // 완주 축하 색종이(컨페티) — 4초간 떨어지고 자동 제거. 클릭 방해 없음.
  function launchConfetti() {
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:80';
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const W = window.innerWidth, H = window.innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    uiRoot.appendChild(cv);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const colors = ['#ff5d5d', '#ffd23a', '#4fd17a', '#4fa8ff', '#c98aff', '#ff8ad1'];
    const N = 170;
    const ps = [];
    for (let i = 0; i < N; i++) {
      ps.push({
        x: Math.random() * W, y: -20 - Math.random() * H * 0.6,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 9,
        vx: -40 + Math.random() * 80, vy: 60 + Math.random() * 130,
        rot: Math.random() * Math.PI, vr: -5 + Math.random() * 10,
        color: colors[(Math.random() * colors.length) | 0],
      });
    }
    let last = performance.now();
    const start = last;
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      g.clearRect(0, 0, W, H);
      for (const p of ps) {
        p.vy += 90 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.color;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      }
      if (now - start < 4200) requestAnimationFrame(frame);
      else cv.remove();
    }
    requestAnimationFrame(frame);
  }

  function showSummary(table, onRestart, opts) {
    buildSummary(table, onRestart, opts);
    summaryLayer.style.display = 'flex';
    launchConfetti();
  }

  // =========================================================
  //  토스트 (중앙 상단 짧은 알림 — 교실 진입 등)
  // =========================================================
  let toastTimer = null;

  // duration(ms): 토스트 유지 시간. 미지정 시 기본 1800ms.
  function toast(msg, duration) {
    const holdMs = typeof duration === 'number' && duration > 0 ? duration : 1800;
    toastLayer.style.display = 'block';
    toastLayer.replaceChildren();

    const bubble = el('div', 'ui-toast', String(msg));
    toastLayer.appendChild(bubble);

    // 등장 → 잠시 유지 → 페이드아웃 → 제거
    // 다음 프레임에 'show' 를 붙여 트랜지션이 동작하게 한다.
    requestAnimationFrame(() => bubble.classList.add('show'));

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      bubble.classList.remove('show');
      setTimeout(() => {
        if (bubble.parentNode === toastLayer) bubble.remove();
        if (!toastLayer.childElementCount) toastLayer.style.display = 'none';
      }, 350);
    }, holdMs);
  }

  // =========================================================
  //  전체 숨김
  // =========================================================
  function hideAll() {
    [titleLayer, hudLayer, helpLayer, summaryLayer, toastLayer].forEach((l) => {
      l.style.display = 'none';
    });
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    toastLayer.replaceChildren();
  }

  return {
    showTitle,
    startHUD,
    setClock,
    setVisited,
    setClockLabel,
    showHelp,
    showSummary,
    hideAll,
    toast,
  };
}

// ===============================================================
//  내부 헬퍼
// ===============================================================
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function thEl(text) {
  const th = document.createElement('th');
  th.textContent = text;
  return th;
}

function tdEl(text, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = text;
  return td;
}

// styles.css 와 별개로, 모듈이 단독 동작하도록 핵심 UI 스타일을 1회 주입.
// (styles.css 가 있으면 같은 클래스에 추가 테마를 얹어도 충돌하지 않는다.)
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const css = `
  .ui-root {
    position: fixed; inset: 0;
    z-index: 10;
    pointer-events: none;            /* 레이어는 기본적으로 클릭 통과 */
    font-family: "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic",
                 "Noto Sans KR", system-ui, sans-serif;
    color: #f1ece1;
    -webkit-font-smoothing: antialiased;
    user-select: none;
  }
  .ui-layer { position: absolute; inset: 0; }

  /* ---- 중앙 정렬 카드형 레이어(타이틀/도움말/요약) ---- */
  .ui-title, .ui-help, .ui-summary {
    display: flex; align-items: center; justify-content: center;
    pointer-events: auto;            /* 모달 배경 — 뒤 클릭 차단 */
  }
  .ui-title, .ui-summary {
    background: radial-gradient(120% 90% at 50% 0%, rgba(40,52,66,0.92), rgba(14,18,24,0.96));
  }
  .ui-help {
    background: rgba(10, 14, 20, 0.55);
  }

  .ui-card {
    pointer-events: auto;
    background: rgba(24, 30, 38, 0.96);
    border: 1px solid rgba(217, 79, 79, 0.55);
    border-radius: 16px;
    box-shadow: 0 24px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05);
    padding: 36px 40px;
    max-width: 540px; width: min(90vw, 540px);
    text-align: center;
  }
  .ui-kicker {
    font-size: 13px; letter-spacing: 0.14em;
    color: #d94f4f; text-transform: none;
    margin-bottom: 12px;
  }

  /* ---- 타이틀 ---- */
  .ui-title-h1 {
    margin: 0 0 14px; font-size: 44px; font-weight: 800;
    letter-spacing: -0.01em; color: #fbf7ee;
    text-shadow: 0 2px 18px rgba(217,79,79,0.35);
  }
  .ui-title-sub {
    margin: 0 0 26px; font-size: 15px; line-height: 1.7;
    color: #c9c2b4; white-space: pre-line;
  }
  .ui-title-hint {
    margin-top: 22px; font-size: 12.5px; line-height: 1.6;
    color: #8f897c;
  }
  .ui-title-credit {
    margin-top: 14px; font-size: 11px; color: #6e695e;
    letter-spacing: 0.03em;
  }
  .ui-summary-grade {
    margin: -6px 0 16px; font-size: 14.5px; font-weight: 700;
    color: #f0c98a;
  }

  /* ---- 버튼 ---- */
  .ui-btn {
    pointer-events: auto;
    cursor: pointer; border: none; outline: none;
    font: inherit; font-weight: 700;
    border-radius: 10px; padding: 13px 30px; font-size: 16px;
    transition: transform .08s ease, box-shadow .15s ease, background .15s ease;
  }
  .ui-btn:active { transform: translateY(1px) scale(0.99); }
  .ui-btn-primary {
    background: linear-gradient(180deg, #e35a5a, #c43d3d);
    color: #fff;
    box-shadow: 0 8px 24px rgba(196,61,61,0.45);
  }
  .ui-btn-primary:hover {
    background: linear-gradient(180deg, #ec6a6a, #d04545);
    box-shadow: 0 10px 28px rgba(196,61,61,0.55);
  }
  .ui-btn-ghost {
    background: rgba(255,255,255,0.08);
    color: #e8e2d6;
    border: 1px solid rgba(255,255,255,0.18);
    margin-top: 22px;
  }
  .ui-btn-ghost:hover { background: rgba(255,255,255,0.14); }

  /* ---- HUD ---- */
  .ui-hud { pointer-events: none; }   /* HUD 전체는 클릭 통과 */
  .hud-corner { position: absolute; pointer-events: none; }
  .hud-tl { top: 18px; left: 20px; text-align: left; }
  .hud-tr { top: 18px; right: 20px; text-align: right; }
  .hud-bottom {
    left: 50%; bottom: 16px; transform: translateX(-50%); text-align: center;
  }
  .hud-clock {
    font-size: 30px; font-weight: 800; letter-spacing: 0.04em;
    color: #fbf7ee;
    text-shadow: 0 2px 10px rgba(0,0,0,0.7);
    font-variant-numeric: tabular-nums;
  }
  .hud-clock-label {
    font-size: 12px; color: #c4bdaf; margin-top: 2px;
    text-shadow: 0 1px 6px rgba(0,0,0,0.7);
  }
  .hud-visited {
    display: inline-block;
    background: rgba(20, 26, 34, 0.62);
    border: 1px solid rgba(217,79,79,0.5);
    border-radius: 999px; padding: 8px 16px;
    font-size: 15px; font-weight: 700; color: #fbf2ea;
    text-shadow: 0 1px 6px rgba(0,0,0,0.6);
  }
  .hud-hint {
    background: rgba(14, 18, 24, 0.5);
    border-radius: 8px; padding: 6px 14px;
    font-size: 12.5px; color: #d6d0c2;
  }

  /* 화면 정중앙 조준점(크로스헤어) — 1인칭 조준 기준 */
  .hud-crosshair {
    position: absolute;
    top: 50%; left: 50%;
    width: 7px; height: 7px;
    margin: -3.5px 0 0 -3.5px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.85);
    box-shadow: 0 0 0 2px rgba(0,0,0,0.45), 0 0 8px rgba(0,0,0,0.6);
    pointer-events: none;
  }

  /* ---- 도움말 ---- */
  .ui-help-h2 { margin: 0 0 18px; font-size: 24px; color: #fbf7ee; }
  .ui-help-list { display: flex; flex-direction: column; gap: 10px; text-align: left; }
  .ui-help-row {
    display: flex; align-items: center; gap: 14px;
    padding-bottom: 10px; border-bottom: 1px dashed rgba(255,255,255,0.1);
  }
  .ui-help-row:last-child { border-bottom: none; }
  .ui-help-key {
    flex: 0 0 128px; font-weight: 800; color: #f0c98a;
    font-size: 14px; letter-spacing: 0.02em;
  }
  .ui-help-desc { flex: 1; color: #d2ccbe; font-size: 14px; }

  /* ---- 배정표 ---- */
  .ui-summary-card { max-width: 520px; width: min(92vw, 520px); }
  .ui-summary-h2 { margin: 0 0 6px; font-size: 28px; color: #fbf7ee; }
  .ui-summary-sub { margin: 0 0 20px; font-size: 14px; color: #c4bdaf; }
  .ui-table-wrap {
    max-height: 46vh; overflow-y: auto;
    border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);
    margin-bottom: 24px;
  }
  .ui-table {
    width: 100%; border-collapse: collapse; font-size: 15px;
  }
  .ui-table th {
    position: sticky; top: 0;
    background: #2a3340; color: #f0c98a;
    font-weight: 700; padding: 12px 16px; text-align: left;
    letter-spacing: 0.04em;
  }
  .ui-table td {
    padding: 11px 16px; text-align: left;
    border-top: 1px solid rgba(255,255,255,0.07);
    color: #e8e2d6;
  }
  .ui-table tbody tr:nth-child(odd) { background: rgba(255,255,255,0.02); }
  .ui-table tbody tr:hover { background: rgba(217,79,79,0.12); }
  .ui-td-class { font-weight: 800; color: #fbf2ea; width: 38%; }
  .ui-td-teacher { color: #d6d0c2; }

  /* ---- 토스트 ---- */
  .ui-toast-layer { pointer-events: none; }
  .ui-toast {
    position: absolute; top: 14%; left: 50%;
    transform: translate(-50%, -10px);
    background: rgba(20, 26, 34, 0.92);
    border: 1px solid rgba(217,79,79,0.6);
    border-radius: 10px;
    padding: 12px 22px; font-size: 16px; font-weight: 600;
    color: #fbf2ea; white-space: nowrap;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    opacity: 0;
    transition: opacity .3s ease, transform .3s ease;
    pointer-events: none;
  }
  .ui-toast.show { opacity: 1; transform: translate(-50%, 0); }
  `;

  const style = document.createElement('style');
  style.setAttribute('data-ui', 'maseok-ui');
  style.textContent = css;
  document.head.appendChild(style);
}
