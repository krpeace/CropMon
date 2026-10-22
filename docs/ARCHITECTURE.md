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
