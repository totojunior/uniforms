// =============================================================
//  마석고 교복지도 — 사운드 모듈 (src/audio.js)
//  Web Audio API 전용. 외부 음원 파일 없음(모두 합성).
//  - AudioContext 는 지연 생성(lazy). 첫 사용자 제스처에서 resume() 호출.
//  - 브라우저 autoplay 정책 대비: resume() 전에는 소리가 나지 않음.
//  - 음소거(mute) 상태에서는 어떤 소리도 재생하지 않음.
//
//  공개 API (계약 고정):
//    createAudio() -> {
//      resume(), footstep(), door(), bell(), blip(), reveal(),
//      ambientStart(), ambientStop(), setMuted(b), toggleMute()
//    }
// =============================================================

export function createAudio() {
  // --- 내부 상태 ---
  let ctx = null;        // AudioContext (지연 생성)
  let master = null;     // 마스터 게인 (음소거 토글용)
  let muted = false;     // 음소거 여부
  let ambient = null;    // 앰비언트 루프 노드 묶음 (재생 중이면 객체, 아니면 null)

  // 발소리 좌/우 번갈아 + 약간의 피치 변화를 위한 카운터
  let stepFlip = 0;

  // ---------------------------------------------------------
  //  컨텍스트/마스터 게인 지연 초기화
  // ---------------------------------------------------------
  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;            // Web Audio 미지원 환경 — 조용히 무시
    ctx = new AC();
    master = ctx.createGain();
    // 시작 시 음소거 상태를 즉시 반영
    master.gain.value = muted ? 0.0 : 1.0;
    master.connect(ctx.destination);
    return ctx;
  }

  // 소리를 낼 수 있는 상태인지(컨텍스트 존재 + running + 음소거 아님) 확인하고
  // 가능하면 [ctx, now] 를, 아니면 null 을 반환.
  function audible() {
    if (muted) return null;
    if (!ensureContext()) return null;
    // autoplay 가드: resume() 이전(suspended)에는 재생하지 않는다.
    if (ctx.state !== 'running') return null;
    return { ctx, now: ctx.currentTime };
  }

  // ---------------------------------------------------------
  //  공용 합성 헬퍼
  // ---------------------------------------------------------

  // 길이 sec 의 화이트노이즈 버퍼 생성(캐시)
  let noiseCache = null;
  function noiseBuffer(c) {
    if (noiseCache && noiseCache.ctx === c) return noiseCache.buf;
    const len = Math.floor(c.sampleRate * 1.2); // 1.2초 분량이면 충분
    const buf = c.createBuffer(1, len, c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    noiseCache = { ctx: c, buf };
    return buf;
  }

  // 노이즈 소스 생성(루프 옵션)
  function makeNoise(c, loop = false) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.loop = true; // 버퍼 재사용을 위해 항상 루프 가능하게 두고, 호출부에서 stop 으로 길이 제어
    if (!loop) src.loop = false;
    return src;
  }

  // 게인 엔벨로프: 즉시 peak 로 올렸다가 dur 동안 지수 감쇠
  function pluckGain(c, now, peak, dur) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    return g;
  }

  // 단일 사인/구형파 톤 + 엔벨로프
  function tone(c, now, freq, dur, peak, type = 'sine', dest = master) {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    const g = pluckGain(c, now, peak, dur);
    osc.connect(g).connect(dest);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  // ---------------------------------------------------------
  //  resume — 첫 사용자 제스처에서 호출 (autoplay 잠금 해제)
  // ---------------------------------------------------------
  function resume() {
    if (!ensureContext()) return Promise.resolve();
    if (ctx.state === 'suspended') {
      // resume 은 Promise 를 반환할 수 있음
      return ctx.resume().catch(() => {});
    }
    return Promise.resolve();
  }

  // ---------------------------------------------------------
  //  footstep — 짧게 필터된 노이즈 버스트 + 빠른 감쇠
  //  호출마다 피치(필터 컷오프) 살짝 변화 + 좌/우 패닝 느낌
  //  running=true 면 조금 더 크고/빠른 어택/높은 피치(달리기) 느낌
  // ---------------------------------------------------------
  function footstep(running = false) {
    const a = audible();
    if (!a) return;
    const { ctx: c, now } = a;

    const src = makeNoise(c, false);

    // 발걸음마다 미세하게 다른 음색
    stepFlip ^= 1;
    // 달리기일 때는 컷오프(피치 체감)를 올려 더 또렷하게
    const baseCut = (running ? 1150 : 900) + (stepFlip ? 120 : -80);
    const cut = baseCut + (Math.random() * 200 - 100);

    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(cut, now);
    bp.Q.value = 0.9;

    // 바닥 '쿵' 느낌을 더하는 로우패스
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(running ? 2000 : 1600, now);

    // 달리기: 짧고 빠른 어택, 약간 더 큰 게인
    const dur = (running ? 0.06 : 0.08) + Math.random() * 0.02;
    const peak = running ? 0.22 : 0.16;
    const attack = running ? 0.003 : 0.005;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(bp).connect(lp).connect(g).connect(master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  // ---------------------------------------------------------
  //  door — 나무문 '툭/쿵' (낮은 사인 + 노이즈 클릭)
  // ---------------------------------------------------------
  function door() {
    const a = audible();
    if (!a) return;
    const { ctx: c, now } = a;

    // 1) 낮은 목재 울림 (사인, 살짝 하강)
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.18);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.35, now + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    osc.connect(og).connect(master);
    osc.start(now);
    osc.stop(now + 0.3);

    // 2) 빗장/딸깍 노이즈 클릭
    const click = makeNoise(c, false);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const cg = c.createGain();
    cg.gain.setValueAtTime(0.0001, now);
    cg.gain.exponentialRampToValueAtTime(0.12, now + 0.004);
    cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    click.connect(hp).connect(cg).connect(master);
    click.start(now);
    click.stop(now + 0.07);
  }

  // ---------------------------------------------------------
  //  bell — 학교 종소리 차임 (사인 2~3음 아르페지오 + 종 같은 감쇠)
  // ---------------------------------------------------------
  function bell() {
    const a = audible();
    if (!a) return;
    const { ctx: c, now } = a;

    // 종 한 음: 기음 + 비배음(약간 디튠된 상배음)으로 금속성 부여
    function strike(freq, t0, peak) {
      const partials = [
        { mul: 1.0, gain: 1.0 },
        { mul: 2.01, gain: 0.5 },
        { mul: 2.97, gain: 0.28 },
      ];
      const dur = 1.4;
      const out = c.createGain();
      out.gain.setValueAtTime(0.0001, t0);
      out.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
      out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      out.connect(master);
      for (const p of partials) {
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq * p.mul;
        const pg = c.createGain();
        pg.gain.value = p.gain;
        osc.connect(pg).connect(out);
        osc.start(t0);
        osc.stop(t0 + dur + 0.1);
      }
    }

    // 익숙한 학교 차임풍 하강/상승 아르페지오 (E5, C5, G4)
    const notes = [659.25, 523.25, 392.0];
    notes.forEach((f, i) => strike(f, now + i * 0.28, 0.22 - i * 0.02));
  }

  // ---------------------------------------------------------
  //  blip — 대사 텍스트용 아주 짧은 구형파 틱
  // ---------------------------------------------------------
  function blip() {
    const a = audible();
    if (!a) return;
    const { ctx: c, now } = a;

    const osc = c.createOscillator();
    osc.type = 'square';
    // 글자마다 단조롭지 않게 미세한 피치 변화
    osc.frequency.value = 620 + Math.random() * 90;

    // 구형파의 거친 고역을 조금 깎아 부드럽게
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;

    const dur = 0.045;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(lp).connect(g).connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  // ---------------------------------------------------------
  //  reveal — '뽑기 결과 공개' 징글
  //  드럼롤 풍 노이즈 + 상승 아르페지오
  // ---------------------------------------------------------
  function reveal() {
    const a = audible();
    if (!a) return;
    const { ctx: c, now } = a;

    // 1) 드럼롤: 짧은 노이즈 버스트를 빠르게 반복하다 점점 커지며 멈춤
    const rollDur = 0.7;
    const hits = 16;
    const roll = makeNoise(c, false);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const rg = c.createGain();
    rg.gain.setValueAtTime(0.0001, now);
    for (let i = 0; i < hits; i++) {
      const t = now + (i / hits) * rollDur;
      const amp = 0.03 + (i / hits) * 0.08; // 점점 커짐
      rg.gain.setValueAtTime(amp, t);
      rg.gain.exponentialRampToValueAtTime(0.004, t + (rollDur / hits) * 0.6);
    }
    rg.gain.exponentialRampToValueAtTime(0.0001, now + rollDur);
    roll.connect(bp).connect(rg).connect(master);
    roll.start(now);
    roll.stop(now + rollDur + 0.05);

    // 2) 상승 아르페지오 (C5 E5 G5 C6) — 결과 '짠!'
    const arp = [523.25, 659.25, 783.99, 1046.5];
    arp.forEach((f, i) => {
      const t = now + rollDur - 0.05 + i * 0.1;
      tone(c, t, f, 0.5, 0.16, 'triangle', master);
    });

    // 3) 마무리 반짝임(하이 사인)
    tone(c, now + rollDur + 0.35, 1568.0, 0.7, 0.1, 'sine', master);
  }

  // ---------------------------------------------------------
  //  paChime — 교내방송 차임("딩-동-댕-동") — 방송 멘트 직전에 재생
  // ---------------------------------------------------------
  function paChime() {
    const a = audible();
    if (!a) return;
    const { ctx: c, now } = a;
    // 한국 학교 방송 특유의 4음 차임(G5 E5 C5 G4) — 부드러운 트라이앵글
    const notes = [783.99, 659.25, 523.25, 392.0];
    notes.forEach((f, i) => {
      tone(c, now + i * 0.22, f, 0.65, 0.12, 'triangle', master);
    });
  }

  // ---------------------------------------------------------
  //  piano — 음악실 앞을 지날 때 들리는 짧은 피아노 아르페지오
  // ---------------------------------------------------------
  function piano() {
    const a = audible();
    if (!a) return;
    const { ctx: c, now } = a;
    // C4-E4-G4-C5-E5 상행 + 마지막 화음 — 사인+트라이앵글 겹쳐 '건반' 느낌
    const arp = [261.63, 329.63, 392.0, 523.25, 659.25];
    arp.forEach((f, i) => {
      const t = now + i * 0.16;
      tone(c, t, f, 0.7, 0.07, 'sine', master);
      tone(c, t, f * 2, 0.45, 0.025, 'triangle', master);
    });
    // 마무리 화음(C5+E5+G5) 잔잔하게
    const chordT = now + arp.length * 0.16 + 0.1;
    [523.25, 659.25, 783.99].forEach((f) => tone(c, chordT, f, 1.1, 0.05, 'sine', master));
  }

  // ---------------------------------------------------------
  //  salute — 교실 입장 '차렷, 경례!' (의자 드르륵 + 학생들 합창 웅성)
  // ---------------------------------------------------------
  function salute() {
    const a = audible();
    if (!a) return;
    const { ctx: c, now } = a;

    // 1) 의자 드르륵(낮은 노이즈 러블)
    const scrape = makeNoise(c, false);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const sg = c.createGain();
    sg.gain.setValueAtTime(0.0001, now);
    sg.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    scrape.connect(lp).connect(sg).connect(master);
    scrape.start(now);
    scrape.stop(now + 0.35);

    // 2) "안녕하세요~" 합창 느낌: 목소리 대역의 짧은 톤 3개가 겹쳐 울림
    const t0 = now + 0.22;
    [196, 247, 294].forEach((f, i) => {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t0);
      osc.frequency.linearRampToValueAtTime(f * 0.93, t0 + 0.4); // 말끝 내려감
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 600 + i * 180;
      bp.Q.value = 3;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.035, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
      osc.connect(bp).connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.5);
    });
  }

  // ---------------------------------------------------------
  //  ambientStart / ambientStop — 한국 학교의 아침 분위기(전부 합성)
  //    · 룸 톤: 로우패스 노이즈 베드 + 희미한 험(저주파 허밍)
  //    · 복도 웅성거림: 밴드패스 노이즈 + 느린 LFO 스웰 + 가끔의 '목소리 블립' 군집
  //    · 새소리: 창밖에서 가끔 들리는 짧은 지저귐(상승 피치 슬라이드)
  //    · (드물게) 멀리서 들리는 문/발소리 틱
  //  모든 타이머 ID 와 노드를 저장하고 ambientStop() 에서 전부 정리.
  // ---------------------------------------------------------

  // 좌/우 패닝 노드 생성(StereoPanner 없으면 그냥 게인으로 폴백)
  function makePanner(c, pan) {
    if (typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      try { p.pan.value = Math.max(-1, Math.min(1, pan)); } catch (e) { /* 무시 */ }
      return p;
    }
    return c.createGain(); // 폴백: 패닝 없이 통과
  }

  function ambientStart() {
    // 이미 재생 중이면 중복 시작 방지(스택 방지)
    if (ambient) return;
    const a = audible();
    if (!a) return;
    const { ctx: c, now } = a;

    const bus = c.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.linearRampToValueAtTime(1.0, now + 1.5); // 부드럽게 페이드 인
    bus.connect(master);

    // 스케줄러가 사용할 노드/타이머 추적용 컨테이너
    const sources = [];   // start/stop 으로 제어하는 노드(오실레이터/버퍼소스)
    const timers = [];    // setInterval / setTimeout ID

    // (1) 룸 톤: 공기/공조 소음 — 루프 노이즈 + 로우패스
    const noise = makeNoise(c, true);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.3;
    const ng = c.createGain();
    ng.gain.value = 0.05; // 아주 낮게
    noise.connect(lp).connect(ng).connect(bus);
    noise.start(now);
    sources.push(noise);

    // (2) 희미한 험 — 60Hz 저주파 + 한 옥타브 위 약하게
    const hum1 = c.createOscillator();
    hum1.type = 'sine';
    hum1.frequency.value = 60;
    const hg1 = c.createGain();
    hg1.gain.value = 0.018;
    hum1.connect(hg1).connect(bus);
    hum1.start(now);
    sources.push(hum1);

    const hum2 = c.createOscillator();
    hum2.type = 'sine';
    hum2.frequency.value = 120;
    const hg2 = c.createGain();
    hg2.gain.value = 0.008;
    hum2.connect(hg2).connect(bus);
    hum2.start(now);
    sources.push(hum2);

    // (3) 느린 LFO 로 룸 톤 게인을 살짝 흔들어 '살아있는' 느낌
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.12;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(ng.gain);
    lfo.start(now);
    sources.push(lfo);

    // (4) 복도 웅성거림(murmur): 밴드패스 노이즈 + 느린 LFO 진폭 스웰
    //     사람 목소리 대역(대략 300~1200Hz)만 통과시켜 '말소리 같은' 색을 줌.
    const murmurSrc = makeNoise(c, true);
    const murmurBp = c.createBiquadFilter();
    murmurBp.type = 'bandpass';
    murmurBp.frequency.value = 600;
    murmurBp.Q.value = 0.7;
    const murmurLp = c.createBiquadFilter(); // 거친 고역 정리
    murmurLp.type = 'lowpass';
    murmurLp.frequency.value = 1400;
    const murmurGain = c.createGain();
    murmurGain.gain.value = 0.012; // 발소리/대사보다 한참 아래
    murmurSrc.connect(murmurBp).connect(murmurLp).connect(murmurGain).connect(bus);
    murmurSrc.start(now);
    sources.push(murmurSrc);

    // 느린 스웰 LFO 두 개를 겹쳐 불규칙해 보이는 진폭 변화
    const swell1 = c.createOscillator();
    swell1.type = 'sine';
    swell1.frequency.value = 0.07;
    const swellG1 = c.createGain();
    swellG1.gain.value = 0.008;
    swell1.connect(swellG1).connect(murmurGain.gain);
    swell1.start(now);
    sources.push(swell1);

    const swell2 = c.createOscillator();
    swell2.type = 'sine';
    swell2.frequency.value = 0.17;
    const swellG2 = c.createGain();
    swellG2.gain.value = 0.004;
    swell2.connect(swellG2).connect(murmurGain.gain);
    swell2.start(now);
    sources.push(swell2);

    // ---- 일회성(one-shot) 헬퍼들: 호출 시점에 노드를 만들고 알아서 정리 ----

    // 짧은 포먼트풍 톤 한 개(목소리 블립용)
    function voiceTone(t0, freq, dur, peak, pan) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth'; // 포먼트 필터링 전 풍부한 배음
      osc.frequency.setValueAtTime(freq, t0);
      // 말끝이 살짝 흔들리도록 미세한 피치 드리프트
      osc.frequency.linearRampToValueAtTime(freq * (0.96 + Math.random() * 0.08), t0 + dur);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 500 + Math.random() * 700; // 포먼트 위치
      bp.Q.value = 4 + Math.random() * 4;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const pn = makePanner(c, pan);
      osc.connect(bp).connect(g).connect(pn).connect(bus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    // 목소리 블립 군집: 2~5개의 짧은 톤이 좌/우 한쪽에서 또르르
    function voiceCluster() {
      if (!ambient) return;            // 이미 정지됐으면 중단
      if (c.state !== 'running') return;
      const t0 = c.currentTime + 0.02;
      const pan = (Math.random() * 2 - 1) * 0.8; // 좌/우 멀리
      const n = 2 + Math.floor(Math.random() * 4); // 2~5개
      let t = t0;
      for (let i = 0; i < n; i++) {
        const freq = 180 + Math.random() * 260;  // 낮은 회화 음역
        const dur = 0.08 + Math.random() * 0.1;
        const peak = 0.01 + Math.random() * 0.012; // 아주 작게
        voiceTone(t, freq, dur, peak, pan);
        t += dur * (0.7 + Math.random() * 0.6);
      }
    }

    // 새 지저귐: 2~4개의 빠른 삼각/사인 음 + 빠른 상승 슬라이드
    function birdChirp() {
      if (!ambient) return;
      if (c.state !== 'running') return;
      const t0 = c.currentTime + 0.02;
      const pan = (Math.random() * 2 - 1) * 0.6;
      const n = 2 + Math.floor(Math.random() * 3); // 2~4개
      let t = t0;
      const baseHi = 2400 + Math.random() * 1200;
      for (let i = 0; i < n; i++) {
        const osc = c.createOscillator();
        osc.type = Math.random() < 0.5 ? 'triangle' : 'sine';
        const f0 = baseHi + (Math.random() * 400 - 200);
        const f1 = f0 * (1.15 + Math.random() * 0.35); // 빠른 상승
        const dur = 0.06 + Math.random() * 0.05;
        osc.frequency.setValueAtTime(f0, t);
        osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.03 + Math.random() * 0.02, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const pn = makePanner(c, pan);
        osc.connect(g).connect(pn).connect(bus);
        osc.start(t);
        osc.stop(t + dur + 0.03);
        t += dur * (0.8 + Math.random() * 0.5);
      }
    }

    // 드물게 멀리서 들리는 문/발소리 틱(로우패스로 멀리 있는 느낌)
    function distantTick() {
      if (!ambient) return;
      if (c.state !== 'running') return;
      const t0 = c.currentTime + 0.02;
      const src = makeNoise(c, false);
      const lpf = c.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 500; // 멀리 = 고역 소실
      const g = c.createGain();
      const dur = 0.1 + Math.random() * 0.08;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.02, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const pn = makePanner(c, (Math.random() * 2 - 1) * 0.7);
      src.connect(lpf).connect(g).connect(pn).connect(bus);
      src.start(t0);
      src.stop(t0 + dur + 0.03);
    }

    // ---- 랜덤 간격 스케줄러: 매 발화마다 다음 타이머를 다시 잡는다 ----
    function scheduleRandom(fn, minMs, maxMs) {
      function tick() {
        fn();
        if (!ambient) return; // 정지됐으면 다음 예약 안 함
        const delay = minMs + Math.random() * (maxMs - minMs);
        const id = setTimeout(tick, delay);
        timers.push(id);
      }
      const delay = minMs + Math.random() * (maxMs - minMs);
      const id = setTimeout(tick, delay);
      timers.push(id);
    }

    scheduleRandom(voiceCluster, 1500, 5000); // 복도 말소리: 1.5~5s
    scheduleRandom(birdChirp, 3000, 8000);    // 새소리: 3~8s
    scheduleRandom(distantTick, 9000, 18000); // 멀리 문/발소리: 가끔

    ambient = { bus, sources, timers };
  }

  function ambientStop() {
    if (!ambient) return;
    const c = ctx;
    const { bus, sources, timers } = ambient;
    ambient = null; // 가장 먼저 비워 스케줄러가 다음 예약을 멈추도록

    // 모든 타이머 정리(누수 방지)
    for (const id of timers) clearTimeout(id);
    timers.length = 0;

    if (!c) return;
    const now = c.currentTime;

    // 부드럽게 페이드 아웃 후 정지
    try {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(0.0001, now + 0.8);
    } catch (e) { /* 무시 */ }

    const stopAt = now + 0.9;
    for (const node of sources) {
      try { node.stop(stopAt); } catch (e) { /* 이미 정지됨 */ }
    }
    // 페이드 아웃 후 버스를 완전히 분리해 노드 누수 방지
    const id = setTimeout(() => {
      try { bus.disconnect(); } catch (e) { /* 무시 */ }
    }, 1000);
    // 정지 직후의 이 단발 타이머는 추적할 컨테이너가 이미 비워졌으므로
    // 자체적으로 짧게 끝나도록만 둔다(부수효과 없음).
    void id;
  }

  // ---------------------------------------------------------
  //  음소거 제어
  // ---------------------------------------------------------
  function applyMute() {
    if (!master || !ctx) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(muted ? 0.0 : 1.0, now + 0.05);
  }

  function setMuted(b) {
    muted = !!b;
    // 컨텍스트가 아직 없으면 다음 ensureContext 에서 반영됨
    applyMute();
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  // ---------------------------------------------------------
  //  공개 인터페이스
  // ---------------------------------------------------------
  return {
    resume,
    footstep,
    door,
    bell,
    blip,
    reveal,
    paChime,
    piano,
    salute,
    ambientStart,
    ambientStop,
    setMuted,
    toggleMute,
  };
}
