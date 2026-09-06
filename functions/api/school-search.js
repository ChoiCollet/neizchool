/**
 * /api/school-search?name=검색어
 * -------------------------------------------------------------
 * NEIS 학교기본정보(schoolInfo) API를 대신 호출해서
 * 학교명으로 검색한 결과(지역/학교명/코드)를 돌려줍니다.
 * 컴시간알리미의 "검색할 학교명" 화면과 같은 역할을 합니다.
 * -------------------------------------------------------------
 */

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name");

  if (!name || name.trim().length < 2) {
    return jsonResponse(
      { ok: false, error: "학교명을 2글자 이상 입력해주세요." },
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

  const neisUrl = new URL("https://open.neis.go.kr/hub/schoolInfo");
  neisUrl.searchParams.set("KEY", key);
  neisUrl.searchParams.set("Type", "json");
  neisUrl.searchParams.set("SCHUL_NM", name.trim());
  neisUrl.searchParams.set("pSize", "30");

  try {
    const upstream = await fetch(neisUrl.toString());
    const data = await upstream.json();

    const rows = data?.schoolInfo?.[1]?.row ?? [];
    const schools = rows.map((r) => ({
      officeCode: r.ATPT_OFCDC_SC_CODE,
      officeName: r.ATPT_OFCDC_SC_NM,
      schoolCode: r.SD_SCHUL_CODE,
      schoolName: r.SCHUL_NM,
      schoolKind: r.SCHUL_KND_SC_NM,
      address: r.ORG_RDNMA,
    }));

    return jsonResponse({ ok: true, schools }, 200);
  } catch (err) {
    return jsonResponse(
      { ok: false, error: "학교 검색 중 오류가 발생했습니다.", detail: String(err) },
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
