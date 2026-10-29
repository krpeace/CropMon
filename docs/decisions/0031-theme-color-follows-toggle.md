# 0031: 휴대폰 주소창 색이 직접 고른 테마를 따르게 (이슈 #15)

- 날짜: 2026-10-29
- 상태: 확정

## 배경

`layout.tsx` 의 `viewport.themeColor` 는 `(prefers-color-scheme: light|dark)` 로 나뉜 meta 두 개였다. 그래서 휴대폰 설정은 라이트인데 해·달 버튼으로 다크를 고르면, 화면은 검은데 주소창·상태 표시줄은 밝은 회색으로 남았다(반대도 마찬가지).

## 결정

1. **주소창 색(theme-color)을 휴대폰 설정이 아니라 화면 테마(`<html data-theme>`)에 묶는다.** meta 는 `media` 없이 **정확히 한 개**이고, 값은 현재 테마를 따른다. 처음 열 때(저장된 선택 → 휴대폰 설정 → 라이트), 해·달 버튼을 누를 때, 저장된 선택이 없고 휴대폰 설정이 바뀔 때 모두 바로 바뀐다.
2. **색 값은 0024 그대로**: 라이트 `rgb(242 242 247)`, 다크 `#000`. `src/domain/theme.ts` 의 `THEME_COLOR` 한 곳에 둔다.
3. **`viewport.themeColor` 는 쓰지 않는다.** 넣으면 Next 가 `media` 가 붙은 meta 를 따로 만들어 meta 가 두 개가 된다. 이 규칙은 `layout.tsx` 주석과 e2e("meta 정확히 1개, `media` 없음"을 7개 화면 전체에서 라이트·다크 각각)로 지킨다. 화면마다 `viewport` 설정이 추가돼도 잡힌다.
4. **meta 는 React 가 아니라 `THEME_SCRIPT` 가 만든다.** 처음에는 `<head>` 에 `<meta>` 를 직접 쓰고 스크립트가 값만 바꾸게 했는데, React 19 는 `<meta>` 를 직접 관리(hoisting)해서 스크립트가 값을 바꾼 뒤 화면을 붙일 때(hydration) 값이 다른 meta 를 하나 더 만들었다(다크에서 meta 2개). `suppressHydrationWarning` 으로는 막을 수 없었다. 스크립트가 meta 를 만들고(`document.createElement`) 같은 스크립트가 값을 정하면 React 는 이 meta 를 모르므로 건드리지 않는다. `ThemeToggle` 의 `applyTheme` 이 `data-theme` 와 meta 를 함께 바꾼다(meta 가 없으면 화면 테마만 바꾸고 오류는 던지지 않는다). 자바스크립트가 꺼진 브라우저에서는 meta 가 없지만, 그 경우는 테마 자체가 라이트 고정이라 영향이 없다.
5. **아이폰 사파리(iOS 26)는 이번 변경과 무관하다.** theme-color 대신 페이지 `body` 배경색으로 칠하는데, `body` 배경이 이미 테마 토큰(`--color-bg`)이라 토글을 따른다. 하단 탭바 쪽 색 조정은 이번 범위 밖이다.
