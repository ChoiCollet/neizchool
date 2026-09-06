/**
 * config.js
 * -------------------------------------------------------------
 * 학교마다 다르게 세팅해야 하는 값은 이제 여기 없습니다.
 * (학교 검색 → 선택 방식으로 브라우저에 저장되기 때문)
 * 여기 남은 값들은 "사이트 전체에 공통으로 적용되는" 설정입니다.
 * -------------------------------------------------------------
 */

window.SITE_CONFIG = {
  siteName: "neizchool",

  // 요일/교시 표시 범위 (대부분의 고등학교 기준 기본값)
  days: ["월", "화", "수", "목", "금"],
  periodsPerDay: 7,

  // API 엔드포인트 (Cloudflare Pages Functions)
  schoolSearchEndpoint: "/api/school-search",
  classInfoEndpoint: "/api/class-info",
  timetableEndpoint: "/api/timetable",

  // 담당 교사 이름 매핑 데이터 (컴시간에서 자동/수동으로 수집, data/teachers.json)
  // 지금은 사이트 운영자 본인 학교 한 곳만 지원합니다. 다른 학교를 선택한
  // 학생에게는 자연스럽게 표시되지 않을 뿐, 시간표 자체는 정상 동작합니다.
  teacherDataPath: "/data/teachers.json",
};
