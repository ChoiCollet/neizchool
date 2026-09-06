# neizchool

나이스(NEIS) 교육정보 개방포털 데이터를 이용한 학급별 시간표 조회 사이트.
학교 검색 → 선택만 하면 별도 설정 없이 바로 시간표를 볼 수 있고,
원래 시간표와 달라진 수업은 자동으로 표시됩니다.

## 구조

```
index.html                   학교 검색 화면 + 시간표 화면 (+ 기능소개/사용법/FAQ/팁)
about.html / privacy.html / contact.html
css/style.css                 전체 공통 스타일
js/config.js                  사이트 전체 공통 설정 (요일/교시 수 등, 학교별 설정 없음)
js/app.js                     학교 검색·선택·시간표 조회·변경감지 로직
data/teachers.json            담당 교사 이름 매핑 (운영자 본인 학교 한정, 자동/수동 갱신)
functions/api/school-search.js   NEIS 학교기본정보 API 프록시 (학교 검색)
functions/api/class-info.js      NEIS classInfo API 프록시 (학년/반 자동 조회)
functions/api/timetable.js       NEIS hisTimetable API 프록시 (시간표 조회)
scripts/scrape_teachers.py       컴시간에서 교사 이름만 가져오는 스크립트
.github/workflows/update-teachers.yml   위 스크립트를 매일 자동 실행
```

## GitHub에 올리기

이미 `https://github.com/ChoiCollet/neizchool` 저장소를 만들어두셨다면:

```bash
# 1. 이 zip을 압축 해제한 폴더로 이동
cd neizchool-site

# 2. 방금 만든 GitHub 저장소를 원격 저장소로 연결
git init
git remote add origin https://github.com/ChoiCollet/neizchool.git

# 3. 전체 파일 커밋
git add .
git commit -m "feat: neizchool 초기 구현"

# 4. 기본 브랜치명을 main으로 맞추고 push
git branch -M main
git push -u origin main
```

이미 저장소에 README 등 파일이 하나라도 있다면 `git pull origin main --allow-unrelated-histories` 후 충돌을 해결하고 push하세요.

**절대 커밋하면 안 되는 것**: NEIS 인증키. 코드 어디에도 키를 직접 적지 않았는지 push 전에 한 번 확인해주세요. (이 프로젝트는 키를 Cloudflare 환경변수로만 사용하도록 만들어져 있어서, 기본 상태에서는 키가 코드에 없습니다.)

## Cloudflare Pages 설정

**Workers & Pages → 만들어두신 `neizchool` 프로젝트** 기준으로:

1. **Git 연결이 아직 안 되어 있다면**: 프로젝트 설정 → "Git" 또는 처음 생성 화면에서 "Connect to Git" 선택 → `ChoiCollet/neizchool` 저장소 선택 → 브랜치 `main`.
   - Framework preset: **None**
   - Build command: 비워둠
   - Build output directory: `/` (루트, 정적 파일이라 빌드 과정이 없음)
   - `functions/` 폴더는 Cloudflare Pages가 자동으로 감지해서 서버리스 함수로 배포합니다. 별도 설정 불필요.

2. **환경변수 등록** (가장 중요):
   - 프로젝트 → **Settings → Environment variables**
   - 이름: `NEIS_API_KEY`
   - 값: 발급받으신 인증키
   - **Production**과 **Preview** 두 환경 모두에 등록
   - 저장 후 반드시 **재배포(Retry deployment 또는 새 커밋 push)** 해야 반영됩니다.

3. **배포 확인**:
   - Deployments 탭에서 최신 배포가 성공(Success)했는지 확인
   - `https://neizchool.pages.dev` 접속 → 학교 검색 화면이 뜨는지 확인
   - 학교명 검색 → 결과가 나오면 정상 (안 나오면 환경변수 등록/재배포 여부 확인)

4. **커스텀 도메인을 나중에 연결하면**:
   - `index.html`, `about.html`, `privacy.html`, `contact.html`의 `<link rel="canonical">` / OG 태그
   - `sitemap.xml`, `robots.txt`
   - 위 파일들에 있는 `neizchool.pages.dev`를 실제 도메인으로 바꿔서 다시 push하세요.

## 처음 실행 시 사용자 경험 (설정 불필요)

`js/config.js`에 학교 코드를 직접 넣는 방식은 없앴습니다. 대신:

1. 사이트 첫 접속 시 컴시간알리미처럼 "검색할 학교명" 화면이 뜸
2. 학교명 검색 → 지역/학교명 결과 목록에서 클릭
3. 선택한 학교가 브라우저에 저장되고, 그 학교의 실제 학년/반 목록을 NEIS에서 자동으로 가져와 드롭다운을 채움
4. 다음 방문부터는 저장된 학교로 바로 시간표 화면이 뜸 (다시 검색하려면 "다른 학교 검색하기" 클릭)

## 담당 교사 이름 + 선택과목 그룹 문자 + 변경 감지 (선택 사항, 운영자 본인 학교 한정)

NEIS API는 담당 교사 이름, 선택과목 이동수업 그룹 문자(예: `E_역학과 에너지`의 `E`), 그리고 "이 교시가 원래 시간표와 다른지"를 제공하지 않아서 컴시간알리미 데이터를 별도로 가져와 보완합니다. 다행히 컴시간 자체가 `changed` 필드로 변경 여부를 이미 계산해주기 때문에, 저희가 직접 추측할 필요 없이 그 값을 그대로 신뢰합니다.

`data/teachers.json` 구조:
```json
{
  "weekOf": "2026-09-07",
  "classes": {
    "2-12": {
      "월": [
        { "teacher": "김진", "group": "E", "changed": false },
        ...
      ]
    }
  }
}
```
- `weekOf`: 이 데이터가 어느 주(월요일 날짜) 것인지. **사이트는 지금 보고 있는 주가 이 값과 같을 때만** 교사명/그룹문자/변경표시를 보여줍니다. 다른 주를 보면 NEIS 데이터만 나오고 이 정보는 자연스럽게 빠집니다 (에러 아님).
- `teacher`: 담당 교사 이름
- `group`: 이동수업 그룹 문자. 일반 과목이면 `null`
- `changed`: 컴시간이 판단한 "원래 시간표와 다른 교시" 여부

- `scripts/scrape_teachers.py`를 로컬에서 한 번 실행해보고 정상 동작하면 `.github/workflows/update-teachers.yml`이 매일 자동 갱신합니다.
- 자동 파싱이 불안정하면 `data/teachers.json`을 손으로 고쳐서 커밋해도 됩니다 (수동 폴백).
- 이 매핑은 지금 구조상 **한 학교**에만 적용됩니다. 다른 학교를 검색해서 들어온 학생에게는 자연스럽게 과목명까지만 보이고, 시간표 자체는 정상 동작합니다.

**참고**: 사이트 자체적으로도 "처음 본 시간표를 기준으로 달라진 칸을 표시"하는 보조 로직이 있어서, 컴시간 데이터가 없는 주(週)에도 어느 정도 변경 감지가 동작합니다. 다만 이건 그 브라우저가 그 학급을 처음 본 시점의 시간표를 "정상"으로 가정하는 방식이라, 처음 방문한 그 주에 이미 보강이 있었다면 그걸 기준으로 착각할 수 있습니다. 확실한 변경 감지는 항상 컴시간의 `changed` 값(이번 주 한정)이 우선이에요.

## 새 기능을 추가할 때

- 화면 요소는 `index.html`에 섹션 추가 + `style.css` 맨 아래에 새 블록 추가
- 조회 로직은 `js/app.js`에서 관련 함수만 수정 (검색 / 학급 자동조회 / 시간표 조회 / 변경 감지 / 렌더링이 함수 단위로 분리되어 있음)
- 새 API가 필요하면 `functions/api/`에 새 파일 하나 추가 (파일명이 곧 엔드포인트 경로가 됨)

## 애드센스 심사 체크리스트

- [x] 실제로 동작하는 기능 (학교 검색 + 시간표 조회 + 변경 자동 감지)
- [x] 콘텐츠가 풍부한 메인 페이지 (사용법 / 기능소개 / FAQ / 팁)
- [x] 사이트 소개, 문의, 개인정보처리방침 페이지
- [ ] `contact.html`의 이메일 주소를 실제 주소로 교체
- [ ] 커스텀 도메인 연결 시 canonical/sitemap 경로 업데이트
- [ ] 어느 정도 실사용 트래픽이 쌓인 뒤 심사 신청 권장
