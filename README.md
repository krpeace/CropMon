# CropMon

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

### 1. 환경변수(비밀 설정값) 넣기

1. `.env.example` 을 복사해 `.env.local` 을 만듭니다. (이미 있으면 건너뜁니다.)
2. Supabase 대시보드 → Project Settings → API 에서 값을 확인해 `.env.local` 에 직접 채웁니다.
   - `NEXT_PUBLIC_SUPABASE_URL`: Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: anon(공개) 키
   - `SUPABASE_SERVICE_ROLE_KEY`: 지금은 쓰지 않으니 비워 둡니다.
3. `.env.local` 은 git에 올라가지 않습니다. 값을 대화창이나 다른 파일에 적지 마세요.
4. 배포 화면(Vercel)에도 같은 두 값을 넣습니다: Vercel → 프로젝트 → Settings → Environment Variables.

### 2. 데이터베이스 표 만들기 (SQL 실행)

1. Supabase 대시보드에서 왼쪽 메뉴 SQL Editor 를 엽니다.
2. `supabase/migrations/` 안의 `.sql` 파일을 파일 이름 순서대로 하나씩 열어, 내용을 모두 붙여 넣고 Run 을 누릅니다.
3. 여러 번 실행해도 괜찮습니다.

### 3. 확인하기

1. `npm install` 후 `npm run dev` 를 실행하고 http://localhost:3000 을 엽니다.
2. 화면 아래쪽에 "데이터베이스 연결: 정상"이 보이면 성공입니다.
3. 자세한 상태는 http://localhost:3000/api/health 에서 볼 수 있습니다.

## 작업 규칙

작업 규칙은 [CLAUDE.md](CLAUDE.md)를 참고하세요. 변경 기록은 [CHANGELOG.md](CHANGELOG.md)에 있습니다.
