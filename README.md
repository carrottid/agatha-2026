# 뮤지컬 〈아가사〉 2026 정산판

뮤지컬 〈아가사 AGATHA〉(2026.12.9 ~ 2027.2.28, NOL 서경스퀘어 스콘 1관) 관람 기록·정산표 웹페이지.

- 배우 필터(페어 필터 포함) · 캐스팅 스케줄표 · 좌석 입력
- 정산판 1종(가로형 1600px: 로고·공연 정보·관람 횟수 헤더 / 아가사·로이·레이몬드 크게 / 나머지 6역 작게 + 좌석배치도) → 고화질 PNG 저장(3200px)
- 좁은 화면에서는 스케줄표를 가로로 스크롤 (일정·좌석 칸은 왼쪽 고정, 한 회차 = 한 줄)
- 기록은 각자 브라우저에 자동 저장, JSON 저장/불러오기로 백업·이동

## 폴더 구조

```
site/
├── index.html
├── manifest.webmanifest     안드로이드 홈 화면 아이콘·이름
├── css/style.css
├── js/data.js               ← 캐스트·회차·좌석배치 데이터 (일정 추가는 여기)
├── js/app.js
└── images/
    ├── logo.svg             로고 (금색 그라데이션, 벡터) — 헤더·정산판
    ├── logo-flat.svg        로고 (단색 금색)
    ├── logo-white.svg       로고 (흰색)
    ├── bg-leather.jpg       정산판 배경 (가죽 질감, 1080 × 2160)
    ├── icon-32/180/192/512.png   파비콘·홈 화면 아이콘 (자주색 바탕 + 로고의 'A')
    └── cast/                배우 사진 (jpg, 640×870)
```

로고는 1차 티켓 오픈 안내 이미지에서 금색 영역만 잘라내(누끼) 4배 확대 후 potrace 로 외곽선을 벡터화한 SVG 입니다.
아이콘을 바꾼 뒤에는 이미 홈 화면에 추가된 아이콘은 지우고 다시 추가해야 새 아이콘이 보입니다.

## 이미지 파일 규격

| 파일 | 내용 | 규격 |
|---|---|---|
| `images/cast/agatha-1.jpg` ~ `agatha-3.jpg` | 최수진, 백은혜, 이정화 | 전부 **640 × 870px** |
| `images/cast/roy-1.jpg` ~ `roy-4.jpg` | 김재범, 고상호, 윤소호, 원태민 | " |
| `images/cast/raymond-1.jpg` ~ `raymond-3.jpg` | 홍나현, 정지우, 홍기범 | " |
| `images/cast/archibald-1.jpg`, `-2.jpg` | 정평, 김대식 | " |
| `images/cast/paul-1.jpg`, `-2.jpg` | 안두호, 박상준 | " |
| `images/cast/newman-1.jpg`, `-2.jpg` | 무현, 최반석 | " |
| `images/cast/beth-1.jpg`, `-2.jpg` | 한세라, 하미미 | " |
| `images/cast/nancy-1.jpg`, `-2.jpg` | 정다예, 김초하 | " |
| `images/cast/heritz-1.jpg`, `-2.jpg` | 강인대, 이찬렬 | " |

사진을 교체하려면 같은 이름의 jpg로 덮어쓰면 됩니다. 비율이 640:870이 아니면 가운데 기준으로 잘려서 표시됩니다.
사진은 공식 프로필(1080×1350)에서 얼굴 위치를 기준으로 같은 구도(얼굴 폭 = 사진 폭의 40%, 얼굴 상단 = 높이 17% 지점)로 잘랐습니다.

## 일정 추가 (2차 티켓 오픈 등)

`js/data.js`의 `SCHEDULE` 배열 끝에 같은 형식으로 행을 추가하면 표·집계·총 회차가 자동 반영됩니다.

```js
{ id: '1222-1930', d: '12.22', w: '화', t: '19:30',
  cast: ['최수진', '김재범', '홍나현', '정평', '안두호', '무현', '한세라', '정다예', '강인대'] },   // ROLES 순서
{ id: '1228-off', d: '12.28', w: '월', off: true },                                                // 공연 없는 날
```

- `id`는 `MMDD-HHMM`. 좌석 저장 키이므로 **한 번 정하면 바꾸지 않습니다.**
- `cast` 순서: 아가사, 로이, 레이몬드, 아치볼드, 폴, 뉴먼, 베스, 낸시, 헤리츠
- `mat: true` 마티네(초록), `hol: true` 공휴일(빨강), `tags: ['sign']` 이벤트 칩
- 첫공 뱃지는 배우별 첫 출연 회차에 자동으로 붙습니다. 막공은 전체 일정이 나온 뒤 `last: [역할 인덱스]`로 지정합니다.
- 추가한 뒤 아래 검증 스크립트로 오타를 확인합니다.

```bash
node -e "
const fs=require('fs'); const m={};
new Function('module', fs.readFileSync('js/data.js','utf8')+'\nmodule.exports={SCHEDULE,ROLES,TAGS,BANDS};')(m);
const {SCHEDULE,ROLES,TAGS,BANDS}=m.exports, shows=SCHEDULE.filter(r=>!r.off);
console.log('총', SCHEDULE.length, '행 /', shows.length, '회차');
const ids=new Set(); SCHEDULE.forEach(r=>{ if(ids.has(r.id)) console.log('중복 id', r.id); ids.add(r.id); });
shows.forEach(r=>r.cast.forEach((a,i)=>{ if(!ROLES[i].actors.includes(a)) console.log('이름 오류', r.id, a); }));
SCHEDULE.forEach(r=>(r.tags||[]).forEach(t=>{ if(!TAGS[t]) console.log('태그 오류', r.id, t); }));
"
```

## 태그 · 밴드

- `TAGS`: 사인회(sign), 스페셜 커튼콜(special), 첫공 무대 인사(firstGreet), 막공 무대 인사(lastGreet), 선물 EVENT(gift), 관객과의 대화(talk). 새 종류는 한 줄 추가.
- `BANDS`: 여러 회차에 걸치는 주간 이벤트. `{ key, label, color, col: 0|1, from: '회차id', to: '회차id' }`

## 좌석배치도

NOL 서경스퀘어 스콘 1관 (1층 0~13열, 2층 14~19열). 좌석 코드는 `층-구역-열-번호` (예: `1F-B-5-8`, `2F-C-15-9`).
A구역 좌석은 2~6번(1~5열은 5~6번), C구역은 4~8번(2층 일부 4~9번)처럼 번호가 1부터 시작하지 않는 열이 있어
`R(n, from)` 형식(from 번부터 n개)으로 정의되어 있습니다. 없는 좌석을 입력하면 저장되지 않고 안내가 뜹니다.
`0000`은 "좌석 비공개, 횟수만 집계" 예약어입니다.

## 배포

GitHub Pages(Source = GitHub Actions). `.github/workflows/pages.yml`과 `.nojekyll`이 포함되어 있습니다.
git 없이 올리려면 `tools/gh_push.py`의 `REPO`를 저장소 이름으로 바꾼 뒤:

```bash
cd site && python3 ../tools/gh_push.py "일정 추가" js/data.js
```

CSS/JS를 고친 뒤에는 반드시 `index.html`의 `?v=` 버전을 갱신해야 캐시가 풀립니다 (스크립트가 자동 처리).
