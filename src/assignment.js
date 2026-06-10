// =============================================================
//  마석고 교복지도 — 배정 로직 모듈 (src/assignment.js)
//  교실(2-1..2-11)에 담임 교사를 한 명씩 배정한다.
//  규칙:
//   1) 어떤 교사도 자기 반(homeroom)은 지도할 수 없다.
//   2) 배정은 '같은 구역(복도 동)' 안에서만 이루어진다 — 멀리 안 가게.
//        구역 A: 2-1 ~ 2-3   (우하단 동)
//        구역 B: 2-4 ~ 2-8   (우측 동)
//        구역 C: 2-9 ~ 2-11  (중앙 동)
//      예) 2-1 김성규 선생님은 2-2 또는 2-3 만 배정될 수 있다.
//   -> CLASSROOMS[i] 의 담임이 TEACHERS[i] 이므로,
//      구역별로 a[i] !== i 인 완전순열(derangement)을 만들어 합친다.
// =============================================================

import { CLASSROOMS, TEACHERS } from './data.js';

// 같은 동(구역)끼리만 교차 배정 — CLASSROOMS 인덱스 기준.
const ZONES = [
  [0, 1, 2],       // 2-1, 2-2, 2-3
  [3, 4, 5, 6, 7], // 2-4 ~ 2-8
  [8, 9, 10],      // 2-9, 2-10, 2-11
];

/**
 * 인덱스 배열의 완전순열을 생성한다(자기 자리 금지).
 * Fisher-Yates 셔플 후 고정점이 하나라도 있으면 재시도.
 * @param {number[]} indices 구역에 속한 교실(=교사) 인덱스들
 * @returns {number[]} indices 와 같은 길이 — k번째 칸의 담당 교사 인덱스
 */
function derangeZone(indices) {
  while (true) {
    const p = indices.slice();
    for (let i = p.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    if (p.every((teacherIdx, k) => teacherIdx !== indices[k])) {
      return p;
    }
  }
}

/**
 * 구역 내 완전순열들을 합쳐 전체 배정을 만든다.
 * a[classIdx] = teacherIdx 보장 사항:
 *   · a[i] !== i (자기 반 금지)
 *   · a[i] 는 i 와 같은 구역(ZONES) 소속 (자기 동에서만 이동)
 * @returns {number[]} 길이 11의 number 배열
 */
export function generateAssignment() {
  const a = new Array(CLASSROOMS.length);
  for (const zone of ZONES) {
    const perm = derangeZone(zone);
    for (let k = 0; k < zone.length; k++) {
      a[zone[k]] = perm[k];
    }
  }
  return a;
}

/**
 * 배정 배열을 화면/요약 표에 쓸 행 데이터로 변환한다.
 * 교실 index 순서(2-1..2-11)로 정렬되어 반환된다.
 * @param {number[]} assignment generateAssignment() 결과
 * @returns {{classId:string, classLabel:string, teacherName:string, teacherIdx:number}[]}
 */
export function buildTable(assignment) {
  return CLASSROOMS.map((classId, classIdx) => {
    const teacherIdx = assignment[classIdx];
    const teacher = TEACHERS[teacherIdx];
    return {
      classId,
      classLabel: classId,
      teacherName: teacher.name,
      teacherIdx,
    };
  });
}
