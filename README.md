# farmos-cropwater-web

노지 작물 물수지(FAO-56) 결과를 농업인이 휴대폰으로 쉽게 볼 수 있게 보여 주는 공개 웹 서비스입니다.

## 목적

- 작물이 쓰는 물과 토양에 남은 물을 보여 주어 물 주기 판단을 돕습니다.
- 화면마다 자료 출처, 발표 회차, 마지막 갱신 시각을 함께 표시하고, 값이 없으면 "자료 없음"으로 보여 줍니다.

## 구조

```
cropwater (Python, 별도 저장소)  →  Supabase (DB)  →  이 저장소 (Next.js 화면)  →  Vercel (배포)
        계산                          저장                    보여 주기                   공개
```

- 이 저장소는 **계산하지 않습니다.** 계산은 cropwater 저장소가 맡고, 여기서는 DB에 저장된 값을 보여 주기만 합니다.
- 이 저장소가 맡는 것: 화면, DB 구조(`supabase/migrations/`), 데이터 약속 문서(`docs/DATA_CONTRACT.md`)

## 기술 스택

- Next.js
- Supabase
- Vercel

## 시작하기

1. `.env.example` 을 `.env.local` 로 복사합니다.
2. Supabase 대시보드에서 값을 확인해 `.env.local` 에 채웁니다. 이 파일은 git에 올라가지 않습니다.

## 작업 규칙

작업 규칙은 [CLAUDE.md](CLAUDE.md)를 참고하세요. 변경 기록은 [CHANGELOG.md](CHANGELOG.md)에 있습니다.
