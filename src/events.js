// =============================================================
//  마석고 교복지도 — 잔재미 이벤트 모듈 (src/events.js)
//  · 특별실/화장실/승강기 문 앞을 지나면 부장의 혼잣말 토스트(방마다 1회)
//  · 교내방송(PA): 차임 + 유머 안내 멘트가 주기적으로 나옴
//  · 오래 달리면 쉰 살 무릎의 헐떡임 토스트
//  · 09:00 도달 시 수업 종 + "서둘러라" 멘트 (1회)
//  createFunEvents({ toast, audio, setClockLabel })
//    -> { update(dt, pos, { paused, onFloor, running, clockMinutes }), reset() }
// =============================================================

import { ROOMS } from './data.js';

// ── 방 앞 혼잣말(부장 김준식 1인칭). id → 멘트(배열이면 랜덤 1개) ──
const SPOT_LINES = {
  elevator:  '김준식: 승강기… 「교직원용」이라 쓰여 있지만 눌러도 안 온다. 10년째 안 온다.',
  toiletM_n: '김준식: 화장실은… 참자. 조회가 먼저다. 부장의 길은 인내다.',
  toiletF_n: '김준식: 여자 화장실 앞은 빠르게 통과. 괜한 오해는 금물이다.',
  toiletM_s: '김준식: 화장실 점검은 이따가. 지금은 교복지도가 우선이다.',
  toiletF_s: '김준식: (헛기침) 지나가던 중입니다, 지나가던 중.',
  toiletM_w: '김준식: 서쪽 끝 화장실… 여기까지 오는 애들은 대체 누구지?',
  toiletF_w: '김준식: 이 구역은 항상 조용하군. 수상할 정도로.',
  music:     '김준식: 음악실에서 피아노 소리… 아침부터 부지런하시군.',
  jegwa:     '김준식: 제과제빵실에서 버터 냄새가… 참자. 나는 부장이다.',
  art:       '김준식: 미술실. 작년에 그려준 내 초상화, 실물보다 머리숱이 많았지.',
  seogo:     '김준식: 서고. 한번 들어가면 30분은 못 나오는 곳. 오늘은 패스.',
  wee:       '김준식: wee클래스… "부장님도 상담 받으러 오세요"라던데, 진심이었나?',
  '2hak':    '김준식: 우리 2학년부 교무실. 내 커피… 식고 있겠지. 조금만 기다려라.',
  sahoe:     '김준식: 사회Cafe. 카페인데 커피가 없다. 사회의 쓴맛만 있다.',
  jachi:     '김준식: 학생자치부. 요즘 애들이 나보다 회의를 많이 한다.',
  jinro:     '김준식: 진로교육부. 내 진로 상담도 되려나. 희망 진로: 무사 정년.',
  jinhak:    '김준식: 진학지도실. 올해도 우리 애들 다 좋은 데 가야 할 텐데.',
  dongari:   '김준식: 동아리준비실. 밴드부 드럼 소리가 밤 10시까지 났다는 민원이…',
  chaeum:    '김준식: 채움실. 정확히 뭘 채우는 방인지 10년째 모르겠다.',
  irum:      '김준식: 이룸터. 좋아 — 오늘의 교복지도도 이뤄보자.',
  oreum:     '김준식: 오름실. 학년회의가… 오늘이었나? 아니다. 아니길 빈다.',
  sogyumo:   '김준식: 소규모강의실. 작지만 에어컨은 제일 세지.',
  saebom:    '김준식: 새봄터. 봄은 무슨, 아직 아침 공기가 차다.',
  saeeum:    '김준식: 새음터. 새소리가 나는 방은 아니다. …아마도.',
  dorandoran:'김준식: 도란도란. 이름만 불러도 마음이 도란도란해지는군.',
  prep1:     '김준식: 준비실. 뭘 준비하는진 몰라도 항상 잠겨 있다.',
  prep2:     '김준식: 또 준비실. 이 학교는 준비할 게 많은 모양이다.',
  stairNE:   '김준식: 이 계단은 아래층행. 조회 중에 한눈팔지 말자.',
  stairSE:   '김준식: 계단 난간에 타고 내려오는 녀석, 언젠가 꼭 잡는다.',
  stairNW:   '김준식: 서쪽 끝 계단. 여기서 한 층 내려가면 1학년 구역이지.',
};

// ── 교내방송 멘트 풀 ──
const PA_LINES = [
  '📢 [교내방송] 알림. 2학년 교복지도가 진행 중입니다. 후드티는… 이미 늦었습니다.',
  '📢 [교내방송] 행정실에서 알립니다. 3층 자판기 밀크커피가 보충되었습니다.',
  '📢 [교내방송] 도서관에서 알립니다. 대출 도서는 제발… 반납해 주세요. 제발.',
  '📢 [교내방송] 오늘 급식은 돈까스입니다. 뛰지 마세요. 어차피 충분합니다.',
  '📢 [교내방송] 김준식 부장님, 2학년부 교무실에서 커피가 식어가고 있습니다.',
  '📢 [교내방송] 운동장 조기축구 공이 3층 창문까지 도달했습니다. 창가 주의 바랍니다.',
  '📢 [교내방송] 명찰 미착용 학생은 오늘따라 복도가 길게 느껴질 것입니다.',
];

// ── 달리기 헐떡임(쉰 살 무릎) ──
const PANT_LINES = [
  '김준식: 헉… 헉… 무릎에서 결재 반려 소리가 난다…',
  '김준식: 후… 쉰 살의 전력질주다. 아무도 못 막는다. 무릎 빼고.',
  '김준식: 헉헉… 내일 계단은… 승강기를 알아봐야겠어…',
];

const SPOT_RADIUS = 2.1;     // 문 앞 트리거 반경(m)
const SPOT_GLOBAL_GAP = 7;   // 혼잣말 간 최소 간격(초) — 토스트 도배 방지
const PA_FIRST = 40;         // 첫 방송까지(초)
const PA_MIN = 75, PA_MAX = 115; // 이후 방송 간격(초)
const PANT_AFTER = 5;        // 연속 달리기 n초 후 헐떡임
const PANT_COOLDOWN = 45;    // 헐떡임 토스트 쿨다운(초)
const NINE_AM = 9 * 60;      // 540분

export function createFunEvents({ toast, audio, setClockLabel }) {
  // 문 앞 스팟: ROOMS 데이터에서 자동 생성(문 위치에서 복도 쪽으로 1m)
  const spots = [];
  for (const r of ROOMS) {
    const line = SPOT_LINES[r.id];
    if (!line || !r.door) continue;
    let sx = r.door.x, sz = r.door.z;
    if (r.door.dir === 'W') sx -= 1.0;
    else if (r.door.dir === 'E') sx += 1.0;
    else if (r.door.dir === 'S') sz += 1.0;
    else if (r.door.dir === 'N') sz -= 1.0;
    spots.push({ id: r.id, x: sx, z: sz, line, fired: false });
  }

  let spotGap = 0;        // 혼잣말 글로벌 쿨다운(초)
  let paTimer = PA_FIRST; // 다음 방송까지(초)
  let paPool = [];        // 셔플된 방송 큐(소진되면 다시 셔플)
  let runAccum = 0;       // 연속 달리기 누적(초)
  let pantCd = 0;         // 헐떡임 쿨다운(초)
  let nineFired = false;  // 9시 종 1회 가드

  function refillPA() {
    paPool = PA_LINES.slice();
    for (let i = paPool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [paPool[i], paPool[j]] = [paPool[j], paPool[i]];
    }
  }
  refillPA();

  function update(dt, pos, opts) {
    const paused = !!(opts && opts.paused);
    const onFloor = !!(opts && opts.onFloor);
    const running = !!(opts && opts.running);
    const clockMinutes = (opts && opts.clockMinutes) || 0;

    if (spotGap > 0) spotGap -= dt;
    if (pantCd > 0) pantCd -= dt;

    // ── 교내방송: 대화 중이 아니면 어디서든(옥상에서도 들린다) ──
    if (!paused) {
      paTimer -= dt;
      if (paTimer <= 0) {
        paTimer = PA_MIN + Math.random() * (PA_MAX - PA_MIN);
        if (!paPool.length) refillPA();
        const line = paPool.pop();
        if (audio.paChime) audio.paChime();
        toast(line, 4200);
        spotGap = Math.max(spotGap, 5); // 방송 직후 혼잣말이 덮지 않게
      }
    }

    // ── 9시 종(1회): 종소리 + 마음이 급해지는 부장 ──
    if (!nineFired && clockMinutes >= NINE_AM) {
      nineFired = true;
      audio.bell();
      toast('🕘 9시!! 조회 끝나간다… 발걸음이 빨라진다.', 3400);
      if (setClockLabel) setClockLabel('조회 연장전');
    }

    // ── 문 앞 혼잣말(3층에서만, 방마다 1회) ──
    if (!paused && onFloor && pos && spotGap <= 0) {
      for (const s of spots) {
        if (s.fired) continue;
        const dx = pos.x - s.x;
        const dz = pos.z - s.z;
        if (dx * dx + dz * dz < SPOT_RADIUS * SPOT_RADIUS) {
          s.fired = true;
          spotGap = SPOT_GLOBAL_GAP;
          toast(s.line, 3200);
          if (s.id === 'music' && audio.piano) audio.piano(); // 음악실: 진짜 피아노 소리
          break;
        }
      }
    }

    // ── 달리기 헐떡임 ──
    if (!paused && running) {
      runAccum += dt;
      if (runAccum >= PANT_AFTER && pantCd <= 0) {
        pantCd = PANT_COOLDOWN;
        runAccum = 0;
        toast(PANT_LINES[(Math.random() * PANT_LINES.length) | 0], 2600);
      }
    } else {
      runAccum = 0;
    }
  }

  // 재시작 시 호출 — 모든 1회성 상태 복구
  function reset() {
    for (const s of spots) s.fired = false;
    spotGap = 0;
    paTimer = PA_FIRST;
    refillPA();
    runAccum = 0;
    pantCd = 0;
    nineFired = false;
  }

  return { update, reset };
}
