"""
scrape_teachers.py
-------------------------------------------------------------
컴시간알리미(comci.net)에서 담당 교사 이름, 선택과목 그룹 문자,
그리고 컴시간이 직접 계산해주는 "변경됨(changed)" 여부까지 가져와서
data/teachers.json을 갱신합니다.

comci 패키지(pip install comci)의 실제 사용법을 기준으로 작성했습니다.
(이전 버전은 API를 잘못 가정해서 동작하지 않았습니다 - 죄송합니다)

주의:
- 이 스크립트는 "이번 주" 데이터만 가져옵니다. 그래서 data/teachers.json에는
  이 데이터가 어느 주(월요일 날짜) 것인지 weekOf로 같이 저장하고,
  프론트엔드(js/app.js)는 지금 보고 있는 주가 이 weekOf와 같을 때만
  교사명/그룹문자/변경표시를 보여줍니다. 다른 주를 보면 NEIS 데이터만
  나오고 교사명 등은 자연스럽게 빠집니다 (에러 아님, 의도된 동작).
- GitHub Actions가 매일 이 스크립트를 실행하므로 weekOf는 항상 최신으로 유지됩니다.
- 컴시간 쪽 구조가 바뀌면 이 스크립트가 실패할 수 있습니다. 실패하면
  data/teachers.json은 건드리지 않고 그대로 두어 사이트에는 영향 없게 했습니다.

실행:
    pip install comci
    python scripts/scrape_teachers.py
-------------------------------------------------------------
"""

import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

SCHOOL_CODE = 90313  # 컴시간 내부 학교코드
OUTPUT_PATH = Path(__file__).parent.parent / "data" / "teachers.json"

CLASS_LABEL_PATTERN = re.compile(r"(\d+)학년\s*(\d+)반")
GROUP_PATTERN = re.compile(r"^([A-Za-z])_")


def monday_of(d: date) -> date:
    """d가 속한 주(월~일)의 월요일. 실제 comci 응답의 calendar_date에 쓰입니다."""
    return d - timedelta(days=d.weekday())


def reference_monday(today: date) -> date:
    """오늘 기준 "이번 주"의 월요일. 주말이면 다음 월요일 (js/app.js의 getMonday와 동일한 규칙).
    comci 응답에서 calendar_date를 못 찾았을 때의 폴백에만 씁니다."""
    weekday = today.weekday()  # 월=0 ... 일=6
    if weekday == 5:  # 토요일
        return today + timedelta(days=2)
    if weekday == 6:  # 일요일
        return today + timedelta(days=1)
    return today - timedelta(days=weekday)


def convert_entry(entry):
    """comci의 교시 항목 하나를 {teacher, group, changed}로 변환. 빈 칸은 None."""
    if not entry:
        return {"teacher": "", "group": None, "changed": False}

    subject = entry.get("subject") or ""
    teacher = entry.get("teacher") or ""
    changed = bool(entry.get("changed"))

    match = GROUP_PATTERN.match(subject)
    group = match.group(1) if match else None

    return {"teacher": teacher, "group": group, "changed": changed}


def _patch_comci_get_code():
    """
    comci 0.7.0의 timetable._get_code가 컴시간 원본 데이터에 섞인 비정상
    문자열(예: '>31029')을 int()로 바로 변환하려다 죽는 버그가 있어서,
    같은 로직에 안전장치만 추가한 버전으로 교체합니다.
    (라이브러리 자체를 수정하는 게 아니라 우리 스크립트 안에서만 적용됨)
    """
    import comci.timetable as _tt

    def _safe_get_code(data, grade, class_num, day, period):
        grade_data = _tt._safe_index(data, grade + 1)
        if grade_data is None:
            return 0
        class_data = _tt._safe_index(grade_data, class_num + 1)
        if class_data is None:
            return 0
        day_data = _tt._safe_index(class_data, day)
        if not isinstance(day_data, list) or period >= len(day_data):
            return 0
        val = day_data[period]
        if not val:
            return 0
        try:
            return int(val)
        except (TypeError, ValueError):
            # 컴시간 원본 응답에 숫자가 아닌 값이 섞여 들어온 경우:
            # 죽지 않고 "변경 없음"으로 안전하게 처리
            return 0

    _tt._get_code = _safe_get_code


def fetch_all_classes():
    """
    comci 패키지로 전체 학년/반의 "이번 주" 시간표를 한 번에 가져옵니다.
    반환: (classes_dict, monday_date)
    """
    from comci import get_timetable  # pip install comci

    _patch_comci_get_code()

    raw = get_timetable(SCHOOL_CODE)  # 학년/반 미지정 -> 전체
    if not raw:
        raise RuntimeError("comci가 빈 데이터를 반환했습니다.")

    classes = {}
    detected_monday = None

    for label, days in raw.items():
        match = CLASS_LABEL_PATTERN.match(label)
        if not match:
            continue
        key = f"{match.group(1)}-{match.group(2)}"

        by_day = {}
        for day_name, entries in (days or {}).items():
            slots = [convert_entry(e) for e in (entries or [])]
            by_day[day_name] = slots

            # 실제 날짜가 있으면 이 데이터가 어느 주(월요일) 것인지 계산
            if detected_monday is None:
                for e in entries or []:
                    if e and e.get("calendar_date"):
                        try:
                            d = date.fromisoformat(e["calendar_date"])
                            detected_monday = monday_of(d)
                        except ValueError:
                            pass
                        break

        classes[key] = by_day

    if detected_monday is None:
        detected_monday = reference_monday(date.today())

    return classes, detected_monday


def main():
    try:
        classes, monday = fetch_all_classes()
    except Exception as e:
        import traceback

        print(f"[경고] 파싱 실패, 기존 teachers.json 유지: {e}", file=sys.stderr)
        traceback.print_exc()
        return 1

    if not classes:
        print("[경고] 파싱 결과가 비어있어 기존 파일을 유지합니다.", file=sys.stderr)
        return 1

    payload = {
        "_설명": "이 파일은 scripts/scrape_teachers.py가 매일 자동으로 갱신합니다. weekOf와 다른 주를 보고 있으면 사이트는 이 데이터를 사용하지 않습니다.",
        "updatedAt": date.today().isoformat(),
        "weekOf": monday.isoformat(),
        "source": "comci-auto",
        "classes": classes,
    }

    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"업데이트 완료: {OUTPUT_PATH} (weekOf={monday.isoformat()}, 학급 수={len(classes)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
