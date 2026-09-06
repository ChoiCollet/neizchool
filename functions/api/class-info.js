/**
 * /api/class-info?office=..&school=..&ay=2026
 * -------------------------------------------------------------
 * 선택된 학교의 실제 학년/반 목록을 NEIS classInfo API로 가져옵니다.
 * 이걸로 "학급 수를 직접 입력"하지 않아도 드롭다운을 자동으로 채울 수 있습니다.
 * -------------------------------------------------------------
 */

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const office = url.searchParams.get("office");
  const school = url.searchParams.get("school");
  const ay = url.searchParams.get("ay");

  if (!office || !school || !ay) {
    return jsonResponse(
      { ok: false, error: "필수 파라미터 누락 (office, school, ay)" },
      400
    );
  }

  const key = env.NEIS_API_KEY;
  if (!key) {
    return jsonResponse(
      { ok: false, error: "서버에 NEIS_API_KEY 환경변수가 설정되지 않았습니다." },
      500
    );
  }

  const neisUrl = new URL("https://open.neis.go.kr/hub/classInfo");
  neisUrl.searchParams.set("KEY", key);
  neisUrl.searchParams.set("Type", "json");
  neisUrl.searchParams.set("ATPT_OFCDC_SC_CODE", office);
  neisUrl.searchParams.set("SD_SCHUL_CODE", school);
  neisUrl.searchParams.set("AY", ay);
  neisUrl.searchParams.set("pSize", "500");

  try {
    const upstream = await fetch(neisUrl.toString());
    const data = await upstream.json();
    const rows = data?.classInfo?.[1]?.row ?? [];

    // grade -> Set of class names, 정렬해서 배열로
    const byGrade = {};
    rows.forEach((r) => {
      const g = r.GRADE;
      if (!byGrade[g]) byGrade[g] = new Set();
      byGrade[g].add(r.CLASS_NM);
    });

    const grades = {};
    Object.keys(byGrade)
      .sort((a, b) => Number(a) - Number(b))
      .forEach((g) => {
        grades[g] = Array.from(byGrade[g]).sort(
          (a, b) => Number(a) - Number(b)
        );
      });

    return jsonResponse({ ok: true, grades }, 200);
  } catch (err) {
    return jsonResponse(
      { ok: false, error: "학급 정보를 가져오지 못했습니다.", detail: String(err) },
      502
    );
  }
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
