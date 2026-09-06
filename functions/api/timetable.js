/**
 * /api/timetable
 * -------------------------------------------------------------
 * Cloudflare Pages Function.
 * 브라우저 대신 이 함수가 NEIS hisTimetable API를 호출합니다.
 * 이유:
 *  1) NEIS API의 CORS 허용 여부가 불확실해서, 서버 쪽에서 대신 불러오면 확실히 동작합니다.
 *  2) API 키를 클라이언트 JS에 노출하지 않을 수 있습니다.
 *
 * 환경변수 NEIS_API_KEY 를 Cloudflare Pages 프로젝트 설정 >
 * Settings > Environment variables 에 등록해서 사용하세요.
 * -------------------------------------------------------------
 * 요청 예:
 *   /api/timetable?office=J10&school=7530174&ay=2026&sem=2&grade=2&classNm=3&date=20260906
 */

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const office = url.searchParams.get("office");
  const school = url.searchParams.get("school");
  const ay = url.searchParams.get("ay");
  const sem = url.searchParams.get("sem");
  const grade = url.searchParams.get("grade");
  const classNm = url.searchParams.get("classNm");
  const date = url.searchParams.get("date"); // YYYYMMDD, optional

  if (!office || !school || !ay || !sem || !grade || !classNm) {
    return jsonResponse(
      { error: "필수 파라미터 누락 (office, school, ay, sem, grade, classNm)" },
      400
    );
  }

  const key = env.NEIS_API_KEY;
  if (!key) {
    return jsonResponse(
      { error: "서버에 NEIS_API_KEY 환경변수가 설정되지 않았습니다." },
      500
    );
  }

  const neisUrl = new URL("https://open.neis.go.kr/hub/hisTimetable");
  neisUrl.searchParams.set("KEY", key);
  neisUrl.searchParams.set("Type", "json");
  neisUrl.searchParams.set("ATPT_OFCDC_SC_CODE", office);
  neisUrl.searchParams.set("SD_SCHUL_CODE", school);
  neisUrl.searchParams.set("AY", ay);
  neisUrl.searchParams.set("SEM", sem);
  neisUrl.searchParams.set("GRADE", grade);
  neisUrl.searchParams.set("CLASS_NM", classNm);
  if (date) neisUrl.searchParams.set("ALL_TI_YMD", date);

  try {
    const upstream = await fetch(neisUrl.toString());
    const data = await upstream.json();

    const rows = data?.hisTimetable?.[1]?.row ?? [];
    const simplified = rows.map((r) => ({
      date: r.ALL_TI_YMD,
      period: Number(r.PERIO),
      subject: r.ITRT_CNTNT,
      grade: r.GRADE,
      classNm: r.CLASS_NM,
      updatedAt: r.LOAD_DTM,
    }));

    return jsonResponse({ ok: true, rows: simplified }, 200);
  } catch (err) {
    return jsonResponse(
      { ok: false, error: "NEIS 응답 처리 실패", detail: String(err) },
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
