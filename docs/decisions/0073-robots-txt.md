# 결정 0073: robots.txt — AI 학습 로봇 막기 · 조합 주소는 검색 로봇이 따라가지 않게 (이슈 #209)

- 날짜: 2026-11-25
- 상태: 확정 (DB 변경 없음 · 데이터 계약 v2.4 그대로 · 사용자 SQL 실행 없음)

## 왜

11/21 새 도메인(cropmon.kr, cropmon.co.kr)을 연결한 뒤 11/22부터 Supabase egress가 하루 200MB 안팎으로 늘었다. 11/25 기록:

- Vercel Firewall(최근 하루): 접속 상위가 Scaleway 2.3k, Amazon 1.3k, Tencent 161 같은 서버 임대 회사들. 사용자 에이전트 1위는 Linux 크롬 2.2k이고, `/font-size`까지 모든 메뉴가 210~250번씩 고르게 불렸다 → 로봇이 링크를 빠짐없이 따라간 모양.
- Supabase 로그(최근 24시간): 모두 `node`(CropMon 웹 서버)가 읽었다. croplib-dp는 원인이 아니다.

메뉴 링크마다 `?st=…&crop=…`가 붙고, 물 화면에는 `&d=` 날짜 링크도 있어서 로봇이 지점 × 작물 × 날짜 조합을 끝없이 따라갈 수 있다. 처음 보는 주소는 화면 캐시가 비어 있어 DB를 새로 읽는다.

## 정책 (사용자 결정 11/25)

`src/app/robots.ts` 가 `/robots.txt` 를 만든다.

1. **AI 학습용 로봇은 전부 `Disallow: /`**: GPTBot, ClaudeBot, anthropic-ai, CCBot, Google-Extended, Applebot-Extended, Bytespider, Amazonbot, meta-externalagent, cohere-ai.
2. **그 밖의 모든 로봇(`*`)** — 구글 · 네이버(Yeti) · 다음 검색, AI 검색 · 도우미 포함:
   - 허용: `/` 와 메뉴 기본 주소(물음표 없는 주소).
   - 막기: `/*?` (물음표가 붙은 모든 조합: 지점 · 작물 · 날짜 · 흙 · kc), `/api/`, `/auth/`, `/account`, `/consent`, `/my-farm`.
   - **`/farm` 은 `Disallow: /farm$` 와 `Disallow: /farm/` 두 줄**로 쓴다. `Disallow: /farm` 으로 쓰면 앞부분이 같은 `/farminfo`(농사정보 메뉴, 검색에 남겨야 함)까지 막힌다.
3. 사이트맵은 넣지 않는다(범위 밖).

단위 시험이 "메뉴 기본 주소(`/farminfo`, `/market`, `/water` …)는 어떤 Disallow 규칙에도 걸리지 않는다"를 접두어 · `*` · `$` 규칙으로 맞춰 본다.

## 남는 한계

- robots.txt 는 **이름을 밝히는 로봇만** 지킨다. 이름을 밝히지 않는 수집기(위 기록의 서버 임대 회사 접속 대부분)는 무시한다 → 사용자가 Vercel Firewall / Bot Management 에서 따로 막는다(사용자 설정, 이 저장소 밖).
- `/*?` 와 `/farm$` 의 `*` · `$` 는 표준 원본에는 없는 확장 표기다. 구글 · 네이버 등 주요 검색 로봇은 읽지만, 읽지 못하는 작은 로봇은 이 줄들을 무시할 수 있다.
- 이미 쌓인 검색 결과 · 예전에 따라간 주소는 이 파일로 지워지지 않는다.

## 범위 밖

날짜 링크에 `rel="nofollow"` 달기, 도메인 하나로 모으기(Redirect), canonical — 필요하면 따로 이슈를 낸다.
