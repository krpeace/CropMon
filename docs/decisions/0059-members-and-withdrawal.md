# 결정 0059: 회원 DB — `members` 표 · 가입 트리거 · 탈퇴 (데이터 계약 v2.0) (이슈 #178, D1-1)

- 날짜: 2026-11-19
- 상태: 확정 (운영 DB 실행과 확인 SQL 통과는 사용자가 한 뒤 병합)
- 관련 이슈: #178 (순서표 #144 M2의 첫 작업). 이어지는 일: L2(로그인 배관), L4(동의 화면), L5(계정 저장), L6(회원 정보 · 탈퇴 화면), O1 · O2(백업 · 정리 작업), D1-2(농장 표, v2.1).

## 배경

1/1 회원제의 로그인 · 동의 · 계정 저장 · 탈퇴가 모두 회원 표와 탈퇴 함수를 기다린다. 원래 D1은 회원 표와 농장 표를 한 번에 만드는 일이었으나, 농장 쪽은 사용자 결정(작기 시작일 저장 방식 · 종료일 · "쓰는 물" 상태 값)을 기다린다.

## 결정

### 1. D1을 둘로 나눈다 — 회원 쪽 v2.0, 농장 쪽 v2.1

회원 쪽은 결정과 상관없이 만들 수 있다. 먼저 올려 L2 이후가 막히지 않게 하고, 농장 · 작기 · 관수 기록 · 계산 결과 표는 사용자 결정이 온 뒤 **v2.1**로 더한다(농장별 보정값 `crop_overrides`는 그 뒤 판). 데이터 계약 판 번호는 회원 표가 처음 들어가는 이번을 큰 판 **v2.0**으로 한다. 이 저장소가 DB 구조의 주인이고 croplib-dp는 회원 표를 쓰지 않는다.

### 2. 가입 트리거는 오류를 내지 않는다

`auth.users`에 줄이 생기면(`after insert`) 보안 정의 함수 `public.handle_new_user()`가 `members`에 한 줄을 넣는다. 여기서 오류가 나면 그 사람은 로그인 자체가 막히므로 세 겹으로 막는다.

1. **오류가 날 일이 없는 식**: 이름 · 공급자 고르기를 `public.member_seed(meta, app_meta)`(형 변환 없음, 모르는 값은 비움, 이름은 100자까지)로 따로 뺐다. 이름은 `name → full_name → nickname → preferred_username` 순으로 있는 것을 쓰고, 공급자는 `kakao` · `google` · `naver`와 `custom:naver…`(→ `naver`)만 받고 나머지는 비운다 — `check` 제약에 걸릴 값이 못 들어간다.
2. **그래도 나는 오류는 삼킨다**: `exception when others then raise warning …; return new;`. 경고에는 오류 원문(`sqlerrm`)을 쓰지 않는다 — 제약 위반 문구에 이름(개인 값)이 섞여 로그에 남을 수 있어서 `sqlstate`만 남긴다.
3. **줄이 빠져도 메운다**: `public.ensure_my_member()`(인자 없음, 회원만 실행)가 같은 식(`member_seed`)으로 자기 줄을 만든다. 로그인 직후 한 번 부르는 것이 약속이다(L2에서 이슈로 적음). 식이 두 곳에 있으면 어긋나므로 `member_seed`를 공유한다. 단점은 삼킨 오류가 조용히 지나가 줄이 빠질 수 있다는 것인데, 3번이 그 틈을 막는다.

세 공급자의 실제 응답 키는 아직 로그인으로 본 적이 없다. 이름 후보를 넓게 잡았고, 실제 값은 L2에서 보고 필요하면 `member_seed`만 고친다.

### 3. 권한은 열 단위 — 자기 줄만

RLS로 자기 줄(`auth.uid() = user_id`)만 읽고 고치게 하고, 고칠 수 있는 열은 `revoke update … ; grant update (열 9개)`로 막는다: `display_name`, 동의 다섯 열, `layout`, `font_scale`, `theme`. `role` · `role_verified_at` · `provider` · `user_id` · `created_at` · `updated_at`은 회원이 못 바꾼다. 넣기는 가입 트리거, 지우기는 탈퇴 함수만 하고 회원에게는 `insert` · `delete` 권한과 정책이 없다. `anon`에는 이 표의 권한을 하나도 주지 않는다. 계약 시험은 공개 표의 "읽기만" 검사(`PUBLIC_TABLES`)에 `members`를 섞지 않고 회원 표 전용 검사를 둔다 — 표 종류별로 나눈 것이지 기준을 낮춘 것이 아니다. **[결정 0065 · v2.3 갱신] 동의 다섯 열(`terms_version` · `terms_agreed_at` · `privacy_version` · `privacy_confirmed_at` · `age14_confirmed_at`)은 직접 고치기 권한을 회수해 함수 `record_my_consent`로만 쓴다 — 직접 고치는 열은 9개가 아니라 4개(`display_name` · `layout` · `font_scale` · `theme`).**

`jsonb` 칸(`layout` · `font_scale`)은 DB가 "객체인지"만 검사한다. 값의 범위는 화면 쪽 `parse…` 함수가 거르는 지금 규칙 그대로다(값 규칙을 고칠 때 DB를 바꾸지 않아도 된다).

### 4. 탈퇴 = 해시 한 줄 + `auth.users` 삭제 연쇄

`public.delete_my_account()`(인자 없음, 회원만 실행)가 ① `ops.withdrawn_accounts`에 `sha256(user_id)`의 16진 문자열 한 줄(이미 있으면 시각만 갱신) ② `delete from auth.users where id = auth.uid()`를 한다. `members`는 `on delete cascade`로 따라 지워지고, v2.1의 농장 표들도 같은 연쇄를 쓴다. 탈퇴 기록은 백업에서 되살릴 때 그 사이 탈퇴한 회원을 다시 지우기 위한 것이라 **원래 번호가 아니라 되돌릴 수 없는 해시**만 둔다(확장이 필요 없는 Postgres 기본 `sha256`). 표는 `ops` 스키마(이미 비회원 · 회원이 볼 수 없음)에 두고 RLS를 켜 정책을 두지 않는다. 7일 지난 줄 지우기는 O2(정리 작업), SNS 연결 끊기는 서버 키가 필요해 L6.

### 5. `font_scale` 열을 더했다

회원제 설계 7판의 `members`에는 `layout` · `theme`만 있었지만, 셸 설계 4-2는 "글씨 크기도 회원은 계정의 화면 설정에 저장"이라고 했다. 기기 값 `cropmon-font-scale` = `{ v: 1, step, follow }`와 같은 모양의 `font_scale jsonb` 열을 더했다(비면 기기 설정). **회원제 채팅 · croplib-dp 채팅의 7판 문서에도 이 열을 더해야 한다**(사용자에게 알림).

### 6. 확인은 SQL로, 시험용 DB가 없다

시험용 DB가 없고 읽기 전용 MCP로는 쓰기가 있는 확인을 돌릴 수 없어서, `supabase/checks/d1_1_members_check.sql`을 사용자가 마이그레이션 뒤 SQL Editor에서 돌린다. 가짜 회원(`@example.invalid`, 번호 `gen_random_uuid()`)을 만들어 가입 트리거 · 자기 줄만 보임 · 열 단위 권한 · 넣기/지우기 금지 · `anon` 차단 · 탈퇴 · `ensure_my_member()`를 보고 마지막 줄 `all_ok`를 낸다. `begin … rollback`으로 끝내면 SQL Editor가 마지막 문장의 결과(rollback)만 보여 줄 수 있고 임시표도 함께 사라져서, **DO 블록 안의 하위 트랜잭션을 일부러 오류로 되돌리는 방식**으로 바꿨다. 결과는 되돌려지지 않는 변수로 꺼내 임시표에 담아 마지막에 보여 준다. 되돌리기 SQL(`d1_1_members_rollback.sql`)은 트리거 → 함수 → 표 순서로 지우며 실행하지 않고 PR에만 적는다.

## 하지 않는 것

- 농장 · 작기 · 관수 기록 · 계산 결과 표, 로그인 · 동의 · 계정 저장 화면, SNS 연결 끊기, 정리 작업, 백업 전용 역할 (다른 이슈).
- 화면 코드와 가짜 Supabase(`e2e/fake-supabase.mjs`) 변경 (화면이 아직 `members`를 읽지 않음).
- 이메일 저장 (`auth.users`에 있음).

## 병합 뒤 사용자가 할 일

- Supabase 대시보드 → Authentication → Audit Logs의 "Write audit logs to the database"를 끈다(탈퇴 뒤에도 남는 기록을 만들지 않기 위해, 개인정보처리방침 "공개 전 필수"). 이미 쌓인 줄 수는 `select count(*) from auth.audit_log_entries;`로 본다(작업 시점 0줄).
