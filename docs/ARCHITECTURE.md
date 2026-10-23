# 구조 (ARCHITECTURE)

## 큰 그림

```
cropwater (Python, 별도 저장소)  →  Supabase (DB)  →  이 저장소 (Next.js 화면)  →  Vercel (배포)
        계산                          저장                    보여 주기                   공개
```

이 저장소는 계산하지 않습니다. DB에 저장된 값을 읽어서 보여 주기만 합니다.

## 폴더 4개

| 폴더           | 하는 일                                       | 예                                 |
| -------------- | --------------------------------------------- | ---------------------------------- |
| `src/domain`   | 표시·판정 규칙. 순수 함수만 둡니다.           | "13시간 넘게 갱신이 없으면 멈춤"   |
| `src/services` | 일의 순서. 자료를 읽고 화면용으로 정리합니다. | "관측소 자료 읽기 → 신선도 붙이기" |
| `src/infra`    | 바깥 연결. Supabase 같은 외부 서비스.         | "Supabase에서 표 읽기"             |
| `src/app`      | Next.js 화면과 API.                           | 홈 페이지                          |

그 밖에:

- `src/mocks` — 예시 값. DB가 채워지기 전까지 화면 숫자를 여기서 가져옵니다. 화면은 직접 읽지 않고 `src/services`를 거칩니다. Supabase로 바꿀 때는 services 안의 읽는 곳만 고칩니다.
- `src/app/_components` — 여러 쪽이 함께 쓰는 화면 부품. `shell/`(헤더·바닥글·쪽 제목·자료 상자·가운데 창), `ui/`(아이콘·배지), `home/`(종합 화면 조각).
- `e2e` — 실제 브라우저로 쪽을 열어 보는 화면 테스트(Playwright).

## 화면 공통 규칙

- **디자인 토큰**: 색·글꼴·글자 크기·모서리·그림자·배치 기준 폭은 `src/app/tokens.css` 한 곳에 둡니다. 화면은 토큰 이름(`bg-brand`, `text-15`, `rounded-card` …)만 씁니다. Tailwind 기본 색·글자 크기·모서리는 지워 두어, 토큰에 없는 값은 효과가 없습니다.
- **지역·작물 선택**: 주소창 `?st=<지점 번호>&crop=<apple|cabbage>`에 남겨 모든 메뉴에 이어집니다. 읽고 쓰는 규칙은 `src/domain/selection.ts`에 있습니다. 값이 없거나 잘못되면 춘천(101)·사과입니다.
- **주소창 읽기**: `cacheComponents` 설정 때문에 주소창 값을 읽는 부분은 `<Suspense>` 안에 둡니다. 쪽 파일은 `ShellPage`/`HomeHead`에 `searchParams`를 넘기기만 합니다.
- **폭**: px로 고정하지 않습니다. 내용 최대 폭(`--page-max` 1296)과 가장자리 여백(`--page-gutter`)은 토큰에 있고, 2열→1열이 바뀌는 폭은 `--breakpoint-desktop` 하나입니다.
- **밝은 화면만** 씁니다 (시안 기준).

## 방향: 안쪽은 바깥을 모른다

```
app  →  services  →  domain
             ↓
           infra
```

- 화살표는 "불러다 쓴다"는 뜻입니다. 거꾸로는 불러다 쓰지 않습니다.
- **domain은 바깥을 모릅니다.** 화면(React, Next.js), DB(Supabase), 네트워크를 불러오지 않습니다. 시각이 필요하면 직접 시계를 보지 않고 값으로 받습니다. 예를 들어 `getFreshness(마지막갱신, 지금)`은 "지금"을 인자로 받습니다.
- 이렇게 하면 domain 규칙은 DB나 화면 없이 테스트만으로 확인할 수 있고, DB나 화면이 바뀌어도 규칙은 그대로 남습니다.
- 이 원칙은 ESLint가 자동으로 검사합니다. `src/domain`에서 화면·DB·다른 폴더 코드를 불러오면 `npm run lint`가 실패합니다.

## 기술

- Next.js (App Router, TypeScript strict), Tailwind CSS
- 품질 도구: ESLint, Prettier, Vitest
- Node 버전은 `.nvmrc`에 적힌 값을 쓰고, 자동 검사(CI)도 같은 값을 씁니다.
