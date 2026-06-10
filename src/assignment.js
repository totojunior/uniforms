// =============================================================
//  마석고 교복지도 — 배정 로직 모듈 (src/assignment.js)
//  교실(2-1..2-11)에 담임 교사를 한 명씩 배정한다.
//  규칙: 어떤 교사도 자기 반(homeroom)은 지도할 수 없다.
//    -> CLASSROOMS[i] 의 담임이 TEACHERS[i] 이므로,
//       배정 a[i] !== i 인 완전순열(derangement)을 만들면 된다.
// =============================================================

import { CLASSROOMS, TEACHERS } from './data.js';

/**
 * 길이 11의 완전순열(derangement)을 생성한다.
 * a[classIdx] = teacherIdx, 모든 i 에 대해 a[i] !== i 보장.
 * Fisher-Yates 셔플 후 고정점(자기 반)이 하나라도 있으면 재시도.
 * @returns {number[]} 길이 11의 number 배열
 */
export function generateAssignment() {
  const n = CLASSROOMS.length; // 11

  // 0..n-1 을 채운 배열을 셔플 → 고정점 없을 때까지 반복.
  while (true) {
    const a = Array.from({ length: n }, (_, i) => i);

    // Fisher-Yates 셔플
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }

    // 고정점(자기 반 배정) 검사 — 하나라도 있으면 reject 후 재시도.
    if (a.every((teacherIdx, classIdx) => teacherIdx !== classIdx)) {
      return a;
    }
  }
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
