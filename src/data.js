// =============================================================
//  마석고 교복지도 — 공유 데이터 모듈 (src/data.js)
//  좌표계: X = 동(+)/서(-), Z = 남(+)/북(-), Y = 위. 단위 미터.
//  AABB(평면 충돌/트리거): { minX, maxX, minZ, maxZ } (Y 무시)
//  이 파일은 순수 데이터만 — import 없음, 로직 없음.
//  3층 평면도(3층.png)의 상대 배치를 게임 친화적으로 재구성:
//    - 2-1,2-2,2-3 : 우하단 (rightDn 복도)
//    - 2-4..2-8    : 우측 (rightUp 복도)
//    - 2-9,2-10,2-11: 중앙하단 (centerDn 복도)
//    - 2학년부 교무실: 중앙 메인 복도, 스폰 근처
//  모든 색상은 hex NUMBER (0xRRGGBB).
// =============================================================

// 학교 테마 색상 팔레트
export const PALETTE = {
  floor:      0xc9bca6, // 복도/실내 바닥 (오래된 리놀륨 베이지)
  wall:       0xe7e2d6, // 벽면 (미색 페인트)
  wallTrim:   0x9aa7b0, // 걸레받이/몰딩 (청회색)
  ceiling:    0xf2f0ea, // 천장 (밝은 흰)
  corridor:   0xb8c2b0, // 복도 바닥 강조 (연녹색 장판)
  doorFrame:  0x7a5a3a, // 문틀 (짙은 목재)
  nameplate:  0x2b3a4a, // 명패 바탕 (남색)
  chalkboard: 0x214034, // 칠판 (짙은 녹색)
  desk:       0xd8b27a, // 책상 상판 (밝은 목재)
  accent:     0xd94f4f, // 포인트 색 (마석고 적색)
};

// 월드 전역 설정
export const WORLD = {
  wallHeight: 3.0,
  // 중앙 메인 복도, 2학년부 교무실(문 x=17.5) 바로 옆에서 시작.
  // heading = 라디안(0 = +Z 남쪽 바라봄). 교실 쪽(남/동)을 향해 출발.
  spawn: { x: 15, z: 0, heading: 0 },
  bounds: { minX: -60, maxX: 72, minZ: -48, maxZ: 42 },
};

// 보행 가능한 복도(직사각형). x,z = 중심, w = X폭, d = Z깊이.
// 메인 동서 복도(spine)에 4개의 남북/지선 복도가 붙어 하나로 연결됨.
export const CORRIDORS = [
  { x: 8,   z: 0,   w: 116, d: 3   }, // main     : 동서 메인 복도  X[-50,66]  Z[-1.5,1.5]
  { x: 34,  z: -19, w: 3,   d: 41  }, // rightUp  : 우측 남북 (2-4~2-8) Z[-39.5,1.5]
  { x: 28,  z: 16,  w: 3,   d: 35  }, // rightDn  : 우하단 남북 (2-1~2-3) Z[-1.5,33.5]
  { x: -10, z: 16,  w: 3,   d: 35  }, // centerDn : 중앙하단 남북 (2-9~2-11) Z[-1.5,33.5]
  { x: -34, z: -13, w: 3,   d: 29  }, // leftUp   : 좌측 남북 지선 Z[-27.5,1.5]
  { x: -39, z: -26, w: 22,  d: 3   }, // leftTop  : 좌상단 동서 지선 X[-50,-28] Z[-27.5,-24.5]
];

// 모든 방. door.x/door.z = 복도와 맞닿은 벽 중앙의 출입구 좌표.
// door.dir = 문이 난 벽면(복도를 바라보는 쪽). 검증 완료: 방끼리 겹치지 않고,
// 복도와는 출입구 모서리만 공유하며, 모든 문 좌표가 어느 복도 사각형 위에 있음.
export const ROOMS = [
  // ── 우측 wing : 2-4 ~ 2-8 (rightUp 동편, 문 W) ──
  { id: '2-4', label: '2-4', type: 'classroom', x: 39, z: -5,  w: 7, d: 7, color: 0xe9d9c2, door: { x: 35.5, z: -5,  dir: 'W' } },
  { id: '2-5', label: '2-5', type: 'classroom', x: 39, z: -12, w: 7, d: 7, color: 0xe9d9c2, door: { x: 35.5, z: -12, dir: 'W' } },
  { id: '2-6', label: '2-6', type: 'classroom', x: 39, z: -19, w: 7, d: 7, color: 0xe9d9c2, door: { x: 35.5, z: -19, dir: 'W' } },
  { id: '2-7', label: '2-7', type: 'classroom', x: 39, z: -26, w: 7, d: 7, color: 0xe9d9c2, door: { x: 35.5, z: -26, dir: 'W' } },
  { id: '2-8', label: '2-8', type: 'classroom', x: 39, z: -33, w: 7, d: 7, color: 0xe9d9c2, door: { x: 35.5, z: -33, dir: 'W' } },

  // ── 우측 wing 서편 부속실 (rightUp 서편, 문 E) ──
  { id: 'jinro',     label: '진로교육부 교무실', type: 'office',   x: 28,   z: -30,   w: 9, d: 7,   color: 0xd6dbe6, door: { x: 32.5, z: -30,   dir: 'E' } },
  { id: 'toiletM_n', label: '화장실(남)',        type: 'restroom', x: 29,   z: -23.5, w: 7, d: 4,   color: 0xc6d2dc, door: { x: 32.5, z: -23.5, dir: 'E' } },
  { id: 'toiletF_n', label: '화장실(여)',        type: 'restroom', x: 29,   z: -19,   w: 7, d: 4,   color: 0xe0c6d2, door: { x: 32.5, z: -19,   dir: 'E' } },
  // 우상단 계단 (rightUp 북단, 문 S)
  { id: 'stairNE',   label: '계단',              type: 'stairs',   x: 34,   z: -42,   w: 7, d: 5,   color: 0xb9b2a6, door: { x: 34,   z: -39.5, dir: 'S' } },

  // ── 우하단 wing : 2-1 ~ 2-3 (rightDn 동편, 문 W) ──
  { id: '2-3', label: '2-3', type: 'classroom', x: 33, z: 5,  w: 7, d: 7, color: 0xe9d9c2, door: { x: 29.5, z: 5,  dir: 'W' } },
  { id: '2-2', label: '2-2', type: 'classroom', x: 33, z: 12, w: 7, d: 7, color: 0xe9d9c2, door: { x: 29.5, z: 12, dir: 'W' } },
  { id: '2-1', label: '2-1', type: 'classroom', x: 33, z: 19, w: 7, d: 7, color: 0xe9d9c2, door: { x: 29.5, z: 19, dir: 'W' } },
  { id: 'dongari', label: '동아리준비실', type: 'facility', x: 33, z: 26, w: 7, d: 6, color: 0xd9d3c4, door: { x: 29.5, z: 26, dir: 'W' } },
  // 우하단 계단 (rightDn 남단, 문 N)
  { id: 'stairSE', label: '계단', type: 'stairs', x: 28, z: 36, w: 7, d: 5, color: 0xb9b2a6, door: { x: 28, z: 33.5, dir: 'N' } },

  // ── 우하단 wing 서편 부속실 (rightDn 서편, 문 E) ──
  { id: 'elevator',  label: '승강기',     type: 'elevator', x: 23.5, z: 5,    w: 6, d: 5, color: 0xb0bcc6, door: { x: 26.5, z: 5,    dir: 'E' } },
  { id: 'toiletF_s', label: '화장실(여)', type: 'restroom', x: 23.5, z: 11,   w: 6, d: 4, color: 0xe0c6d2, door: { x: 26.5, z: 11,   dir: 'E' } },
  { id: 'toiletM_s', label: '화장실(남)', type: 'restroom', x: 23.5, z: 15.5, w: 6, d: 4, color: 0xc6d2dc, door: { x: 26.5, z: 15.5, dir: 'E' } },
  { id: 'jinhak',    label: '진학지도실', type: 'office',   x: 22.5, z: 22,   w: 8, d: 6, color: 0xd6dbe6, door: { x: 26.5, z: 22,   dir: 'E' } },

  // ── 중앙하단 wing : 2-9 ~ 2-11 (centerDn 동편, 문 W) ──
  { id: '2-11', label: '2-11', type: 'classroom', x: -5, z: 5,  w: 7, d: 7, color: 0xe9d9c2, door: { x: -8.5, z: 5,  dir: 'W' } },
  { id: '2-10', label: '2-10', type: 'classroom', x: -5, z: 12, w: 7, d: 7, color: 0xe9d9c2, door: { x: -8.5, z: 12, dir: 'W' } },
  { id: '2-9',  label: '2-9',  type: 'classroom', x: -5, z: 19, w: 7, d: 7, color: 0xe9d9c2, door: { x: -8.5, z: 19, dir: 'W' } },

  // ── 중앙하단 wing 서편 (centerDn 서편, 문 E) ──
  { id: 'sahoe', label: '사회Cafe',         type: 'special', x: -16, z: 5,  w: 9, d: 6, color: 0xe6d2b8, door: { x: -11.5, z: 5,  dir: 'E' } },
  { id: 'jachi', label: '학생자치부 교무실', type: 'office',  x: -16, z: 13, w: 9, d: 7, color: 0xd6dbe6, door: { x: -11.5, z: 13, dir: 'E' } },

  // ── 메인 복도 북편 중앙 줄 (문 S) ──
  { id: 'stairC',  label: '계단',          type: 'stairs',  x: -4,   z: -4.5, w: 6, d: 6, color: 0xb9b2a6, door: { x: -4,   z: -1.5, dir: 'S' } },
  { id: 'wee',     label: 'wee클래스',      type: 'special', x: 9,    z: -4.5, w: 6, d: 6, color: 0xd8e6cf, door: { x: 9,    z: -1.5, dir: 'S' } },
  { id: '2hak',    label: '2학년부 교무실', type: 'office',  x: 17.5, z: -5,   w: 7, d: 7, color: 0xd0d8e8, door: { x: 17.5, z: -1.5, dir: 'S' } },
  { id: 'chaeum',  label: '채움실',         type: 'special', x: 24,   z: -4.5, w: 5, d: 6, color: 0xe6dccf, door: { x: 24,   z: -1.5, dir: 'S' } },
  { id: 'sogyumo', label: '소규모강의실',   type: 'special', x: 48,   z: -4.5, w: 7, d: 6, color: 0xe6dccf, door: { x: 48,   z: -1.5, dir: 'S' } },
  { id: 'irum',    label: '이룸터',         type: 'special', x: 56,   z: -4.5, w: 6, d: 6, color: 0xd8e6cf, door: { x: 56,   z: -1.5, dir: 'S' } },
  { id: 'oreum',   label: '오름실(학년회의실)', type: 'facility', x: 64, z: -4.5, w: 7, d: 6, color: 0xd9d3c4, door: { x: 64, z: -1.5, dir: 'S' } },

  // ── 메인 복도 북편 서측 줄 (문 S) ──
  { id: 'seogo', label: '서고',    type: 'special', x: -22, z: -4.5, w: 6, d: 6, color: 0xe6dccf, door: { x: -22, z: -1.5, dir: 'S' } },
  { id: 'music', label: '음악실',  type: 'special', x: -46, z: -4.5, w: 6, d: 6, color: 0xe6cfe0, door: { x: -46, z: -1.5, dir: 'S' } },
  { id: 'prep1', label: '준비실',  type: 'special', x: -39, z: -4.5, w: 5, d: 6, color: 0xded0c2, door: { x: -39, z: -1.5, dir: 'S' } },

  // ── 좌측 지선(leftUp) 주변 ──
  { id: 'dorandoran', label: '도란도란', type: 'special', x: -29.5, z: -12, w: 6, d: 6, color: 0xd8e6cf, door: { x: -32.5, z: -12, dir: 'W' } }, // leftUp 동편 → 문 서쪽
  { id: 'saebom',     label: '새봄터',   type: 'special', x: -39,   z: -11, w: 7, d: 5, color: 0xd8e6cf, door: { x: -35.5, z: -11, dir: 'E' } }, // leftUp 서편 → 문 동쪽
  { id: 'saeeum',     label: '새음터',   type: 'special', x: -39,   z: -17, w: 7, d: 5, color: 0xd8e6cf, door: { x: -35.5, z: -17, dir: 'E' } },
  { id: 'jegwa',      label: '제과제빵', type: 'special', x: -29.5, z: -20, w: 6, d: 6, color: 0xe6dccf, door: { x: -32.5, z: -20, dir: 'W' } }, // leftUp 동편 → 문 서쪽

  // ── 좌상단 지선(leftTop) 주변 ──
  { id: 'art',       label: '미술실',     type: 'special',  x: -44, z: -30,   w: 7, d: 5, color: 0xe6cfe0, door: { x: -44, z: -27.5, dir: 'S' } }, // leftTop 북편 → 문 남쪽
  { id: 'prep2',     label: '준비실',     type: 'special',  x: -37, z: -30,   w: 5, d: 5, color: 0xded0c2, door: { x: -37, z: -27.5, dir: 'S' } },
  { id: 'toiletF_w', label: '화장실(여)', type: 'restroom', x: -47, z: -22.5, w: 5, d: 4, color: 0xe0c6d2, door: { x: -47, z: -24.5, dir: 'N' } }, // leftTop 남편 → 문 북쪽
  { id: 'toiletM_w', label: '화장실(남)', type: 'restroom', x: -42, z: -22.5, w: 5, d: 4, color: 0xc6d2dc, door: { x: -42, z: -24.5, dir: 'N' } },
  { id: 'stairNW',   label: '계단',       type: 'stairs',   x: -53, z: -26,   w: 6, d: 5, color: 0xb9b2a6, door: { x: -50, z: -26,   dir: 'E' } }, // leftTop 서단 → 문 동쪽
];

// 교실 정규 순서 — index i 의 담임이 곧 TEACHERS[i].
export const CLASSROOMS = ['2-1','2-2','2-3','2-4','2-5','2-6','2-7','2-8','2-9','2-10','2-11'];

// 11명 담임 교사. age/gender 는 외형 설계 전용(게임 UI 미표기).
export const TEACHERS = [
  {
    idx: 0, name: '김성규', age: 40, gender: '남',
    homeroom: '2-1', persona: '깐깐한 베테랑 — 단추 하나까지 본다',
    appearance: { skin: 0xe8c4a0, hair: 0x2b2b2b, hairStyle: 'short', build: 'average', height: 1.74, top: 0x35506b, bottom: 0x2a2f38, accessory: 'glasses' },
    lines: { accept: [
      '셔츠 둘째 단추, 명찰 각도 15도, 바지 밑단 1cm. 제 눈이 곧 줄자입니다, 부장님.',
      '교복 검사 20년 차입니다. 이젠 복도 발소리만 들어도 후드티가 들립니다.',
      '어젯밤 꿈에서도 단추를 잠갔습니다. 7개 중 하나가 모조 단추더군요. …가보겠습니다.',
      '남의 반이요? 오히려 좋습니다. 정 떨어질 일이 없으니 한 치도 안 봐줍니다.',
      '돋보기, 줄자, 체크리스트. …농담 같으십니까? 가방 열어 보여드릴까요, 부장님?',
      '제가 훑고 지나가면 단추들이 알아서 잠깁니다. 과학으로 설명이 안 되는 현상이죠.',
    ] },
  },
  {
    idx: 1, name: '최낙훈', age: 45, gender: '남',
    homeroom: '2-2', persona: '호탕한 큰형님 — 군기반장 자처',
    appearance: { skin: 0xd9a878, hair: 0x1f1f1f, hairStyle: 'short', build: 'stocky', height: 1.80, top: 0x5a6b3a, bottom: 0x33352f, accessory: 'none' },
    lines: { accept: [
      '하하! 맡겨주십시오! 문 여는 소리만으로 군기가 잡히게 하겠습니다!',
      '걱정 붙들어 매십시오~ 제 다림질 경력이 군 생활 2년에 교직 20년입니다!',
      '제가 들어서면 애들이 자동으로 \'전체 차렷\'을 합니다. 조교 출신은 못 속입니다, 하하!',
      '교복은 군기죠! 옷깃 각 잡다가 제 인생도 잡혔습니다만… 후회는 없습니다!',
      '애들은 절 \'낙훈이 형\'이라 부릅니다만, 오늘은 \'낙훈 교관님\'으로 갑니다. 출동!',
      '소리만 들어보십시오, 부장님. 복도 끝까지 \'단추 잠가!\'가 울려 퍼질 겁니다, 으하하!',
    ] },
  },
  {
    idx: 2, name: '위현진', age: 39, gender: '여',
    homeroom: '2-3', persona: '원칙주의 FM — 봐주기 없음',
    appearance: { skin: 0xf0d2b4, hair: 0x3a2c22, hairStyle: 'bob', build: 'slim', height: 1.65, top: 0x6b3a4a, bottom: 0x2e3138, accessory: 'glasses' },
    lines: { accept: [
      '규정집 17페이지 3항, 외투는 학교 지정만. …네, 전 규정집을 자기 전에 읽습니다. 재밌거든요.',
      '한 명 봐주면 둑이 무너집니다. 전 둑을 지키는 사람입니다, 부장님.',
      '체크리스트 30항목 준비했습니다. 양말 색은 28번 항목입니다.',
      '\'쌤 오늘만요\'라는 말, 올해 437번 들었습니다. 전부 기각했습니다.',
      '눈물로 호소하면 접수는 해줍니다. 반영을 안 할 뿐이죠. 다녀오겠습니다.',
      '예외요? 좋은 질문입니다. 규정집에 \'예외 없음\'이라고 명시돼 있습니다.',
    ] },
  },
  {
    idx: 3, name: '박지훈', age: 31, gender: '남',
    homeroom: '2-4', persona: '의욕만 앞서는 신입티 — 살짝 긴장',
    appearance: { skin: 0xe9c6a2, hair: 0x241c14, hairStyle: 'short', build: 'slim', height: 1.76, top: 0x4a8ca0, bottom: 0x3a3f48, accessory: 'none' },
    lines: { accept: [
      '네!! 맡겨주셔서 영광입니… 어, 어느 반이라고 하셨죠? 죄송합니다, 한 번만 더…!',
      '어젯밤에 교복지도 시뮬레이션 돌려봤습니다! 머릿속으로요! 3패 1무지만 오늘은 다릅니다!',
      '무, 무섭게 보이는 연습을 해왔습니다. (미간 찌푸림) …부장님, 지금 무섭습니까?',
      '심호흡 하겠습니다. 후우— 스읍— 네! 갈 수 있습니다! 아마도요!',
      '애들이 \'쌤 몇 살이에요?\' 물으면 어떡하죠? …아, 아닙니다! 잘 다녀오겠습니다!',
      '메모했습니다: 단추, 명찰, 후드, 양말… 그리고 \'침착\'. 침착도 메모했습니다!',
    ] },
  },
  {
    idx: 4, name: '이재희', age: 33, gender: '남',
    homeroom: '2-5', persona: '외향 만렙 쇼맨 — 기타와 노래, 인사성 바른 무대 체질',
    appearance: { skin: 0xddb088, hair: 0x2a2622, hairStyle: 'medium', build: 'average', height: 1.78, top: 0x8a3550, bottom: 0x303338, accessory: 'none' },
    lines: { accept: [
      '좋습니다, 부장님! 오늘의 무대는 그 반이군요. 기타는… 아쉽지만 두고 가겠습니다.',
      '단추를 잠가요~ 명찰을 달아요~ ♪ 방금 만든 \'교복지도 송\'입니다. 후렴 들어보시겠습니까?',
      '검사도 공연처럼 갑니다. 도입–전개–클라이맥스 순으로요. 앵콜은 벌점입니다.',
      '제가 들어가면 애들이 박수부터 칩니다. 인사가 먼저, 검사는 그 다음입니다!',
      '지난주 점심 버스킹에서 약속했거든요 — 교복 단정한 반은 신청곡을 받아준다고요!',
      '목 좀 풀고 가겠습니다. 도레미파~♪ …검사에 목이 왜 필요하냐고요? 부장님, 모든 일은 목에서 시작됩니다.',
    ] },
  },
  {
    idx: 5, name: '강현정', age: 43, gender: '여',
    homeroom: '2-6', persona: '따뜻한 엄마스타일 — 그래도 핵심은 챙김',
    appearance: { skin: 0xf2d6ba, hair: 0x4a3526, hairStyle: 'medium', build: 'average', height: 1.62, top: 0xc98a5a, bottom: 0x4a4036, accessory: 'none' },
    lines: { accept: [
      '아이고 우리 애기들~ 혼내러 가서 결국 또 챙겨주고 올 것 같지만… 다녀올게요, 호호.',
      '후드 보면 \'춥구나\' 싶고, 명찰 없으면 \'또 흘렸구나\' 싶고… 그래도 잡긴 잡아요!',
      '잔소리 보따리 쌌어요. 단추 잔소리, 명찰 잔소리, 마지막은 \'아침은 먹었니\' 잔소리.',
      '지난번엔 혼내다가 애가 배고프다길래 빵을 줬는데… 이번엔 진짜 안 그럴 거예요. 아마도요.',
      '엄하게 하라고 하셨죠, 부장님? 네, 엄하게… 다정할게요~ 호호.',
      '우리 반 애들이 \'쌤 다른 반 가지 마요\' 하고 매달리는데… 어머, 인기 부담스러워라~',
    ] },
  },
  {
    idx: 6, name: '유혜주', age: 31, gender: '여',
    homeroom: '2-7', persona: '텐션 만렙 분위기메이커 — 자칭 패션경찰',
    appearance: { skin: 0xf4d4b6, hair: 0x5a3a2a, hairStyle: 'ponytail', build: 'slim', height: 1.66, top: 0xff7aa2, bottom: 0x3a3f56, accessory: 'none' },
    lines: { accept: [
      '패션경찰 출동입니다~! 삐뽀삐뽀!! 줄임바지는 현행범으로 체포합니다!',
      '교복 위에 후드는 레이어드가 아니라 범죄예요, 범죄! 단속 다녀올게요~',
      '오늘의 워스트드레서, 제가 직접 시상하고 오겠습니다! 상품은 벌점이에요~',
      '핏이 무너지면 기강도 무너집니다! …방금 멘트 좀 멋있지 않았나요, 부장님?',
      '손거울 들고 갑니다! 본인 상태를 직접 보여주는 게 제일 효과 좋거든요~',
      '복도가 런웨이라면 오늘 심사위원은 저예요~ 교복 핏 10점 만점 심사 갑니다!',
    ] },
  },
  {
    idx: 7, name: '이제연', age: 37, gender: '여',
    homeroom: '2-8', persona: '차분 논리파 — 규정 취지부터 설명',
    appearance: { skin: 0xead0b2, hair: 0x322620, hairStyle: 'long', build: 'slim', height: 1.68, top: 0x3a5a52, bottom: 0x2e3236, accessory: 'glasses' },
    lines: { accept: [
      'PPT 12장 준비했습니다. 1장: 교복의 정의. 12장: 그래서 단추를 잠가야 하는 이유.',
      '강압은 비효율적입니다. 논리로 설득하면 애들이 스스로 단추를 잠그면서 웁니다.',
      '\'왜 입어야 하는데요?\'라는 질문을 기다리고 있습니다. 제 18번이거든요.',
      '지난번엔 30분 설명했더니 한 명이 \'그냥 잠글게요\' 하며 항복했습니다. 논리의 승리죠.',
      '교복 규정의 역사부터 차근차근… 요약본이 40분짜리입니다. 다녀오겠습니다.',
      '반박하러 오는 학생이 제일 반갑습니다. 모든 반박에 각주 달린 답변이 준비돼 있거든요.',
    ] },
  },
  {
    idx: 8, name: '고승주', age: 33, gender: '남',
    homeroom: '2-9', persona: '게임덕 친구쌤 — 퀘스트/보상 드립',
    appearance: { skin: 0xe6c09a, hair: 0x1e1a16, hairStyle: 'medium', build: 'slim', height: 1.75, top: 0x6a4aa0, bottom: 0x2c2f3a, accessory: 'glasses' },
    lines: { accept: [
      '데일리 퀘스트 수락입니다! 보상은… 부장님 커피 맞죠? 확정 드랍인 거죠?',
      '명찰 미착용은 네임드 몬스터죠. 어그로 끌어서 정리하고 오겠습니다.',
      '줄임바지는 밸런스 붕괴입니다. 핫픽스 적용하러 갑니다.',
      '맵 숙지 완료, 동선 최적화 완료. 타임어택으로 속공 클리어하겠습니다.',
      '후드 입은 애들은 자기가 은신 캐릭인 줄 아는데, 제 탐지 스킬이 만렙입니다.',
      '교복 풀세트가 방어력 +10인 걸 애들이 모르더라고요. 알려주고 오겠습니다.',
    ] },
  },
  {
    idx: 9, name: '조용균', age: 33, gender: '남',
    homeroom: '2-10', persona: '이름값 하는 조용한 츤',
    appearance: { skin: 0xddb48c, hair: 0x262220, hairStyle: 'short', build: 'average', height: 1.77, top: 0x44505a, bottom: 0x2e3034, accessory: 'none' },
    lines: { accept: [
      '…네. (조용히 일어선다)',
      '…(끄덕). 시끄러운 건 싫어서, 조용히 끝내고 오겠습니다.',
      '제가 교실 문을 열면… 말 안 해도 단추 잠그는 소리가 납니다. 똑딱… 똑딱…',
      '말은 아끼고, 눈빛은 아끼지 않겠습니다.',
      '…애들이 그러더군요. 제 침묵이 제일 무섭다고. …칭찬으로 접수했습니다.',
      '(말없이 넥타이를 고쳐 매고 일어선다) …다녀오겠습니다.',
    ] },
  },
  {
    idx: 10, name: '박하나', age: 41, gender: '여',
    homeroom: '2-11', persona: '카리스마 보스 — 풀착장 검사',
    appearance: { skin: 0xf0cdb0, hair: 0x1c1c1c, hairStyle: 'long', build: 'average', height: 1.70, top: 0x202632, bottom: 0x202632, accessory: 'none' },
    lines: { accept: [
      '풀착장 검사입니다. 넥타이, 벨트, 양말, 실내화… 영혼의 단정함까지 봅니다.',
      '제가 복도에 서면 조용해집니다. 걷기만 해도 단속이 되죠. 효율적입니다.',
      '대충 입은 애들은 제 눈을 못 마주칩니다. 마주치면 단추가 저절로 잠기거든요.',
      '웃으면서 검사합니다. 애들 말로는 그게 제일 무섭답니다. …칭찬이죠, 부장님?',
      '어떤 녀석이 \'하나쌤은 절대 못 피한다\'고 했다더군요. 정확한 정보 전달력, 마음에 듭니다.',
      '그 반에 제 이름만 미리 흘려주세요. 검사 시간이 절반으로 줄어듭니다.',
    ] },
  },
];

// 부장(플레이어가 모시는 상사). 게임 시작/배정/완료 대사 담당.
export const BOSS = {
  name: '김준식', age: 50, gender: '남',
  appearance: { skin: 0xe2bd94, hair: 0xb8b2a6, hairStyle: 'medium', build: 'average', height: 1.73, top: 0x3a3f4a, bottom: 0x3a3f4a, accessory: 'glasses' },
  lines: {
    greet: [
      '어이~ 좋은 아침! 우리 선생님들 얼굴 좀 보세, 허허.',
      '커피 한 잔씩들 했나? 자, 오늘 교복지도 명단 한번 돌려보자고.',
      '날도 좋구먼~ 애들 교복도 좀 단정하게 해줘야지, 안 그런가들?',
      '자자, 조회 시간 코앞이야. 오늘 누가 어느 반 갈지 정해보세.',
    ],
    // {teacher}, {class} 플레이스홀더 필수. (호칭은 '선생님')
    assign: [
      '{teacher} 선생님, 오늘 {class} 교복지도 좀 부탁하네. 자네만 믿어, 허허.',
      '{teacher} 선생님~ {class} 한번 슥 둘러봐 주게. 어렵지 않지? 응?',
      '이거 참 미안한데, {teacher} 선생님이 {class} 좀 봐주면 딱이겠어.',
      '{teacher} 선생님, {class} 애들 단추 좀 챙겨주고 오게. 내 인심 쓴 셈 치고 말이야~',
      '{teacher} 선생님이면 {class} 정도야 눈 감고도 하지. 부탁 좀 함세.',
      '오늘 {class}는 {teacher} 선생님께 맡기겠네. 끝나고 커피는 내가 사지.',
      '{teacher} 선생님, {class} 잠깐만 다녀와 주게. \'잠깐\'이라고 했네, 분명히. 허허.',
      '{teacher} 선생님, {class} 부탁하네. 자네 반 아니라고 살살 하면… 안 되네, 알지?',
      '딱 봐도 {teacher} 선생님이 적임이야. {class}, 깔끔하게 한번 부탁함세.',
    ],
    done: [
      '허허, 다 돌았구먼! 역시 우리 선생님들이 최고야. 수고 많았네.',
      '깔끔하게 마무리됐어. 오늘 점심은 내가 쏘지. 고생했네 다들!',
      '완벽해, 완벽해! 이래서 내가 발 뻗고 잔다니까. 다들 고마워~',
      '교복지도 끝! 우리 학교 복도가 다 환해졌구먼. 허허.',
      '역시 마석고 선생님들이야. 자, 다들 따뜻한 커피 한 잔씩 하자고!',
    ],
    // 순찰 중인 교장/교감을 만났을 때 부장(플레이어)의 굽신 리액션.
    toPrincipal: [
      '넵! 여부가 있겠습니까, 빈틈없이 하겠습니다!',
      '아이고, 안 그래도 지금 나가는 길입니다. 맡겨만 주십시오!',
      '명심하겠습니다! …커피는 제가 사겠습니다, 하하.',
      '네네, 단추부터 양말까지 싹 다 보고 오겠습니다!',
      '걱정 붙들어 매십시오. 마석고 복도, 오늘부로 각 잡힙니다!',
    ],
  },
};

// ── 순찰 NPC: 교장/교감 선생님(여) — 복도를 돌며 부장에게 당부/잔소리 ──
// 부장이 가까이 가면(부딪히면) 대화가 열린다. color = 미니맵 점 색.
export const PRINCIPALS = [
  {
    id: 'principal', role: '교장 선생님', gender: '여',
    color: 0xc9a0ff,
    appearance: { skin: 0xf0d2b4, hair: 0xbfb8ad, hairStyle: 'bob', build: 'average', height: 1.63, top: 0x6d4a6b, bottom: 0x3a3340, accessory: 'glasses' },
    lines: [
      '김 부장~ 요즘 애들 교복을 통 안 입어. 우리 때는 단추 하나만 풀어도 불호령이었는데, 호호.',
      '교복지도 잘 부탁해요. 학교 첫인상은 결국 옷매무새거든.',
      '복도를 돌다 보면 후드티가 그렇게 많아. 김 부장만 믿어요~',
      '규칙 준수! 그게 교육의 기본이지. 김 부장 어깨가 무겁겠어.',
      '오늘도 수고가 많네. 끝나고 교장실에서 차 한 잔 어때요?',
    ],
  },
  {
    id: 'vice', role: '교감 선생님', gender: '여',
    color: 0x66e0c0,
    appearance: { skin: 0xe9c6a2, hair: 0x2e2622, hairStyle: 'medium', build: 'slim', height: 1.66, top: 0x3a5566, bottom: 0x2e3338, accessory: 'glasses' },
    lines: [
      '김 부장, 명찰! 명찰부터 챙기라고 누누이 말했죠?',
      '치마 줄이고 바지 줄이고… 요즘 애들 손재주가 좋아요. 단속 부탁해요.',
      '규정집 6조 3항, 외투는 교복 위에. 외우고 계시죠? 호호.',
      '교복지도는 타이밍이에요. 조회 놓치면 다 도망가요. 서둘러요!',
      '내가 1층부터 4층까지 다 돈다니까. 김 부장도 발품 좀 팔아요~',
    ],
  },
];
