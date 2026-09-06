/**
 * app.js
 * -------------------------------------------------------------
 * 흐름:
 *  1) 저장된 학교 선택이 없으면 -> 학교 검색 화면을 보여줌
 *  2) 검색 결과에서 학교를 고르면 -> localStorage에 저장하고
 *     해당 학교의 실제 학년/반 목록을 NEIS classInfo로 가져와 채움
 *  3) 이후 방문부터는 저장된 학교로 바로 시간표를 보여줌
 *
 * 새 기능을 추가할 땐 이 파일 맨 아래에 새 모듈을 이어 붙이는 방식으로
 * 확장하세요 (기존 함수는 최대한 건드리지 않습니다).
 * -------------------------------------------------------------
 */

const CFG = window.SITE_CONFIG;
const SCHOOL_STORAGE_KEY = "neizchool-selected-school";

const state = {
  school: null, // { officeCode, officeName, schoolCode, schoolName }
  gradesMap: {}, // { "1": ["1","2","3"...], ... } NEIS classInfo 결과
  grade: null,
  classNm: null,
  teacherData: null,
};

// ---------- 초기화 ----------

document.addEventListener("DOMContentLoaded", async () => {
  initFaqAccordion();
  bindSchoolSearchUI();
  bindChangeSchoolButton();

  const saved = loadSelectedSchool();
  if (saved) {
    state.school = saved;
    await enterTimetableMode();
  } else {
    enterSearchMode();
  }
});

// ---------- 학교 검색 모드 ----------

function enterSearchMode() {
  document.getElementById("school-search-section").hidden = false;
  document.getElementById("timetable-section").hidden = true;
  document.getElementById("search-input").focus();
}

function bindSchoolSearchUI() {
  const form = document.getElementById("school-search-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = document.getElementById("search-input").value.trim();
    if (query.length < 2) {
      renderSearchStatus("학교명을 2글자 이상 입력해주세요.");
      return;
    }
    await runSchoolSearch(query);
  });
}

async function runSchoolSearch(query) {
  renderSearchStatus("검색 중이에요…");
  try {
    const res = await fetch(
      `${CFG.schoolSearchEndpoint}?name=${encodeURIComponent(query)}`
    );
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "검색 실패");
    renderSearchResults(data.schools);
  } catch (err) {
    renderSearchStatus(`검색 중 오류가 발생했어요. (${err.message})`);
  }
}

function renderSearchStatus(message) {
  document.getElementById("search-results").innerHTML =
    `<tr><td colspan="2" class="tt-status">${escapeHtml(message)}</td></tr>`;
}

function renderSearchResults(schools) {
  const tbody = document.getElementById("search-results");
  if (!schools.length) {
    tbody.innerHTML = `<tr><td colspan="2" class="tt-status">검색 결과가 없어요. 학교명을 다시 확인해주세요.</td></tr>`;
    return;
  }
  tbody.innerHTML = schools
    .map(
      (s, i) => `
      <tr class="school-row" tabindex="0" data-index="${i}">
        <td>${escapeHtml(s.officeName)}</td>
        <td>${escapeHtml(s.schoolName)}<span class="school-kind">${escapeHtml(s.schoolKind || "")}</span></td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll(".school-row").forEach((row) => {
    const select = () => selectSchool(schools[Number(row.dataset.index)]);
    row.addEventListener("click", select);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select();
      }
    });
  });
}

async function selectSchool(school) {
  state.school = school;
  saveSelectedSchool(school);
  await enterTimetableMode();
}

// ---------- 학교 저장/불러오기 ----------

function saveSelectedSchool(school) {
  localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(school));
}

function loadSelectedSchool() {
  try {
    const raw = localStorage.getItem(SCHOOL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function bindChangeSchoolButton() {
  document.getElementById("change-school-btn").addEventListener("click", () => {
    localStorage.removeItem(SCHOOL_STORAGE_KEY);
    state.school = null;
    document.getElementById("search-input").value = "";
    document.getElementById("search-results").innerHTML = "";
    enterSearchMode();
  });
}

// ---------- 시간표 모드 ----------

async function enterTimetableMode() {
  document.getElementById("school-search-section").hidden = true;
  document.getElementById("timetable-section").hidden = false;
  document.getElementById("school-name").textContent = state.school.schoolName;

  await loadTeacherData();
  await loadGradeClassOptions();

  document
    .getElementById("grade-select")
    .addEventListener("change", onSelectorChange);
  document
    .getElementById("class-select")
    .addEventListener("change", onSelectorChange);
  document
    .getElementById("refresh-btn")
    .addEventListener("click", loadAndRenderTimetable);

  await loadAndRenderTimetable();
}

async function loadGradeClassOptions() {
  const { ay } = currentAcademicPeriod();
  const params = new URLSearchParams({
    office: state.school.officeCode,
    school: state.school.schoolCode,
    ay: String(ay),
  });

  const gradeSelect = document.getElementById("grade-select");
  const classSelect = document.getElementById("class-select");
  gradeSelect.innerHTML = "";
  classSelect.innerHTML = "";

  try {
    const res = await fetch(`${CFG.classInfoEndpoint}?${params.toString()}`);
    const data = await res.json();
    if (!data.ok || !Object.keys(data.grades).length) {
      throw new Error(data.error || "학급 정보 없음");
    }
    state.gradesMap = data.grades;
  } catch (err) {
    // classInfo가 실패해도 시간표 자체는 시도할 수 있게 1~3학년/1~15반 기본값으로 대체
    console.warn("학급 목록 자동 조회 실패, 기본값 사용:", err);
    state.gradesMap = {
      1: Array.from({ length: 15 }, (_, i) => String(i + 1)),
      2: Array.from({ length: 15 }, (_, i) => String(i + 1)),
      3: Array.from({ length: 15 }, (_, i) => String(i + 1)),
    };
  }

  Object.keys(state.gradesMap).forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = `${g}학년`;
    gradeSelect.appendChild(opt);
  });

  state.grade = Number(gradeSelect.value);
  fillClassOptions(state.grade);
  state.classNm = Number(classSelect.value);
}

function fillClassOptions(grade) {
  const classSelect = document.getElementById("class-select");
  classSelect.innerHTML = "";
  (state.gradesMap[grade] || []).forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = `${c}반`;
    classSelect.appendChild(opt);
  });
}

function onSelectorChange(e) {
  if (e.target.id === "grade-select") {
    state.grade = Number(e.target.value);
    fillClassOptions(state.grade);
  }
  state.classNm = Number(document.getElementById("class-select").value);
  loadAndRenderTimetable();
}

// ---------- 데이터 불러오기 ----------

async function loadTeacherData() {
  try {
    const res = await fetch(CFG.teacherDataPath);
    state.teacherData = await res.json();
  } catch (e) {
    console.warn("교사 매핑 데이터를 불러오지 못했습니다.", e);
    state.teacherData = { classes: {} };
  }
}

async function loadAndRenderTimetable() {
  const grid = document.getElementById("timetable-grid");
  grid.setAttribute("aria-busy", "true");
  grid.innerHTML = `<p class="tt-status">시간표를 불러오는 중이에요…</p>`;

  const { ay, sem } = currentAcademicPeriod();
  const params = new URLSearchParams({
    office: state.school.officeCode,
    school: state.school.schoolCode,
    ay: String(ay),
    sem: String(sem),
    grade: String(state.grade),
    classNm: String(state.classNm),
  });

  try {
    const res = await fetch(`${CFG.timetableEndpoint}?${params.toString()}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "알 수 없는 오류");

    const table = buildTableFromRows(data.rows);
    const baseline = getBaselineFromStorage();
    if (!baseline) {
      saveBaselineToStorage(table);
    }
    const changedCells = baseline ? diffTables(baseline, table) : new Set();

    renderTimetable(table, changedCells);
  } catch (err) {
    grid.innerHTML = `<p class="tt-status tt-status--error">
      시간표를 불러오지 못했어요.<br><small>${escapeHtml(String(err.message || err))}</small>
    </p>`;
  } finally {
    grid.removeAttribute("aria-busy");
  }
}

function currentAcademicPeriod() {
  const now = new Date();
  const month = now.getMonth() + 1;
  if (month >= 3 && month <= 8) return { ay: now.getFullYear(), sem: 1 };
  if (month >= 9) return { ay: now.getFullYear(), sem: 2 };
  return { ay: now.getFullYear() - 1, sem: 2 };
}

// ---------- 표 구성 ----------

function buildTableFromRows(rows) {
  const table = {};
  CFG.days.forEach((d) => (table[d] = {}));
  rows.forEach((r) => {
    const day = dateToDayLabel(r.date);
    if (!day) return;
    table[day][r.period] = r.subject || "";
  });
  return table;
}

function dateToDayLabel(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6)) - 1;
  const d = Number(yyyymmdd.slice(6, 8));
  const dow = new Date(y, m, d).getDay();
  const map = { 1: "월", 2: "화", 3: "수", 4: "목", 5: "금" };
  return map[dow] || null;
}

function getTeacherName(day, period) {
  const key = `${state.grade}-${state.classNm}`;
  const dayList = state.teacherData?.classes?.[key]?.[day];
  if (!dayList) return "";
  return dayList[period - 1] || "";
}

// ---------- 변경 감지 (baseline diff, 학교+학년+반 별로 저장) ----------

function storageKey() {
  return `tt-baseline-${state.school.schoolCode}-${state.grade}-${state.classNm}`;
}

function getBaselineFromStorage() {
  try {
    const raw = localStorage.getItem(storageKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveBaselineToStorage(table) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(table));
  } catch {
    /* 저장 공간 문제는 무시 */
  }
}

function diffTables(baseline, current) {
  const changed = new Set();
  CFG.days.forEach((day) => {
    for (let p = 1; p <= CFG.periodsPerDay; p++) {
      const before = baseline[day]?.[p] ?? "";
      const after = current[day]?.[p] ?? "";
      if (before && after && before !== after) {
        changed.add(`${day}-${p}`);
      }
    }
  });
  return changed;
}

// ---------- 렌더링 ----------

function renderTimetable(table, changedCells) {
  const grid = document.getElementById("timetable-grid");
  const days = CFG.days;
  const periods = CFG.periodsPerDay;

  let html = `<table class="tt-table"><thead><tr><th scope="col" class="tt-corner">교시</th>`;
  days.forEach((d) => (html += `<th scope="col">${d}</th>`));
  html += `</tr></thead><tbody>`;

  for (let p = 1; p <= periods; p++) {
    html += `<tr><th scope="row">${p}</th>`;
    days.forEach((day) => {
      const subject = table[day]?.[p] || "";
      const teacher = getTeacherName(day, p);
      const isChanged = changedCells.has(`${day}-${p}`);
      html += `<td class="${isChanged ? "tt-changed" : ""}">
        <span class="tt-subject">${escapeHtml(subject) || "-"}</span>
        ${teacher ? `<span class="tt-teacher">${escapeHtml(teacher)}</span>` : ""}
      </td>`;
    });
    html += `</tr>`;
  }

  html += `</tbody></table>`;
  if (changedCells.size > 0) {
    html += `<p class="tt-legend"><span class="tt-swatch"></span> 원래 시간표와 달라진 수업이에요.</p>`;
  }
  grid.innerHTML = html;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- FAQ 아코디언 ----------

function initFaqAccordion() {
  document.querySelectorAll(".faq-item").forEach((item) => {
    const q = item.querySelector(".faq-question");
    q.addEventListener("click", () => {
      const isOpen = item.classList.contains("is-open");
      document
        .querySelectorAll(".faq-item.is-open")
        .forEach((el) => el.classList.remove("is-open"));
      if (!isOpen) item.classList.add("is-open");
    });
  });
}
