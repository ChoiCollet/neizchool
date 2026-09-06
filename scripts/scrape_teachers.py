"""
scrape_teachers.py
-------------------------------------------------------------
컴시간알리미에서 "담당 교사 이름"만 가져와서 data/teachers.json을 갱신합니다.
GitHub Actions가 주기적으로 이 스크립트를 실행하고, 결과가 바뀌면 자동 커밋합니다.

주의:
- 이 환경(샌드박스)에서는 comci.net 접근이 막혀 있어서 실제 응답 구조를 확인하지
  못했습니다. 로컬 PC나 GitHub Actions에서 아래 pip install 후 한 번 직접
  실행해서 결과 JSON 구조를 확인해보고, 실제 필드명에 맞게 조정해주세요.
- 컴시간 쪽 사이트 구조가 바뀌면 이 스크립트가 깨질 수 있습니다. 실패하면
  data/teachers.json은 건드리지 않고 그대로 두도록 만들어서, 사이트 쪽에는
  영향이 가지 않게 했습니다.

실행:
    pip install comci
    python scripts/scrape_teachers.py
-------------------------------------------------------------
"""

import json
import sys
from pathlib import Path

SCHOOL_CODE = 90313  # 컴시간 내부 학교코드 (js/config.js의 comciSchoolCode와 동일해야 함)
OUTPUT_PATH = Path(__file__).parent.parent / "data" / "teachers.json"

DAYS = ["월", "화", "수", "목", "금"]


def fetch_all_classes():
    """
    comci 패키지로 전체 학년/반 시간표를 가져와서
    {"1-1": {"월": [{"teacher": "김진", "group": "E"}, ...], ...}, ...} 형태로 반환.

    group은 컴시간이 선택과목 이동수업에 붙이는 그룹 문자(예: "E_역학" -> "E")입니다.
    일반 과목(그룹 문자 없음)은 group을 null로 둡니다.

    TODO: 아래는 comci 패키지의 일반적인 사용 패턴을 기준으로 작성한
    골격입니다. 실제 반환 필드명(teacher, subject 등)은 패키지 버전에 따라
    다를 수 있으니, 처음 한 번은 print(raw)로 실제 구조를 찍어보고 맞춰주세요.
    """
    import re
    from comci import Comcigan  # pip install comci

    GROUP_PATTERN = re.compile(r"^([A-Za-z])_")

    comci = Comcigan()
    school = comci.school(str(SCHOOL_CODE))

    result = {}
    for grade in range(1, 4):
        for class_num in range(1, 12):
            try:
                timetable = school.timetable(grade=grade, class_=class_num)
            except Exception:
                continue  # 존재하지 않는 반이면 건너뜀

            if not timetable:
                continue

            key = f"{grade}-{class_num}"
            by_day = {d: [None] * 8 for d in DAYS}  # 최대 8교시까지 자리 확보
            for entry in timetable:
                day = DAYS[entry["day"] - 1] if isinstance(entry.get("day"), int) else entry.get("day")
                period = entry.get("period")  # 1부터 시작한다고 가정
                teacher = entry.get("teacher", "") or ""
                subject = entry.get("subject", "") or ""

                match = GROUP_PATTERN.match(subject)
                group = match.group(1) if match else None

                if day in by_day and isinstance(period, int) and 1 <= period <= 8:
                    by_day[day][period - 1] = {"teacher": teacher, "group": group}

            # None으로 남은 빈 교시는 빈 값으로 채움
            for day in DAYS:
                by_day[day] = [
                    slot if slot else {"teacher": "", "group": None}
                    for slot in by_day[day]
                ]

            if any(any(slot["teacher"] for slot in by_day[d]) for d in DAYS):
                result[key] = by_day

    return result


def main():
    try:
        classes = fetch_all_classes()
    except Exception as e:
        print(f"[경고] 파싱 실패, 기존 teachers.json 유지: {e}", file=sys.stderr)
        return 1

    if not classes:
        print("[경고] 파싱 결과가 비어있어 기존 파일을 유지합니다.", file=sys.stderr)
        return 1

    payload = {
        "_설명": "이 파일은 scripts/scrape_teachers.py가 자동으로 갱신합니다.",
        "updatedAt": __import__("datetime").date.today().isoformat(),
        "source": "comci-auto",
        "classes": classes,
    }

    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"업데이트 완료: {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
