# 비밀번호 초기화 기능 Design

- 작성일: 2026-08-28
- 상태: 승인 대기 (사용자 리뷰 전)
- 기준 문서:
  - `docs/superpowers/specs/2026-08-27-user-management-consolidation-design.md` (4.3절에 "비밀번호
    초기화 버튼 자리만 배치, 실제 동작은 별도 스펙"으로 이번 문서를 예고해 둠)
  - `docs/superpowers/specs/2026-08-28-change-history-design.md` (감사 로그 통합 대상)

## 1. 배경 및 목적

프리랜서가 비밀번호를 잊으면 로그인 화면에 안내된 대로 최고관리자에게 메일로 문의하고,
최고관리자가 "사용자 관리" 화면에서 해당 계정의 비밀번호를 초기화한다. 지금은 이 화면에
"비밀번호 초기화" 버튼 자리만 있고 비활성 상태다 — 이 문서에서 실제 동작(임시 비밀번호
발급, 강제 비밀번호 변경 플로우)을 정의한다.

## 2. 범위

**포함**
- "사용자 관리" 화면의 "비밀번호 초기화" 버튼 활성화 + 확인 모달 + 임시 비밀번호 발급
- 임시 비밀번호 화면 표시(1회성) + 클립보드 복사(임시 비밀번호만 / 이메일 회신용 본문 전체)
- 임시 비밀번호로 로그인 시 비밀번호 변경 화면으로 강제 이동
- 비밀번호 변경 화면 + 완료 후 정상 이용 전환
- 비밀번호 초기화 시 다른 기기의 기존 세션 무효화(관리자 API 호출 시점 기준)
- 세션 최대 유지 시간을 8시간으로 단축(활동 시 슬라이딩 연장) — 이번 작업과 같은
  세션 검증 지점을 건드리는 김에 함께 처리
- "변경 이력" 화면에 비밀번호 초기화 이벤트 노출

**제외**
- 사용자가 이메일로 직접 "비밀번호 찾기" 요청을 보내는 셀프서비스 플로우(로그인 화면 문구
  그대로 유지 — 관리자에게 메일로 문의)
- 실제 이메일 발송 자동화(회신 본문 텍스트를 만들어 복사만 제공, 발송은 관리자가 자기
  메일 클라이언트로 수동 진행)
- 미들웨어(`proxy.ts`) 레벨의 매 페이지 이동마다 DB 재확인 — 관리자 API 호출 시점 확인으로
  충분하다고 판단(6장 참고), 필요해지면 후속 작업으로 확장 가능

## 3. 데이터 모델

`lib/db/schema.ts`의 `users` 테이블에 컬럼 2개 추가:

```ts
mustChangePassword: boolean('must_change_password').notNull().default(false),
passwordChangedAt: timestamp('password_changed_at'),
```

- `mustChangePassword`: 관리자가 초기화하면 `true`. 로그인 후 비밀번호 변경 화면으로 강제
  이동시키는 트리거. 변경 완료 시 `false`로 되돌린다.
- `passwordChangedAt`: 초기화든 사용자 본인의 변경(변경 화면 제출)이든, 비밀번호가 실제로
  바뀔 때마다 갱신한다. 세션 무효화 판단 기준(6장)으로 쓰인다.

## 4. 임시 비밀번호 생성 규칙

`lib/domain/password-policy.ts`의 기존 `PASSWORD_REQUIREMENTS`(8자 이상, 대문자·숫자·특수문자
포함)를 그대로 통과하도록 생성한다. 신규 함수 `generateTempPassword()`를 `lib/domain/
password-policy.ts`에 추가:

- 길이 12자
- 대문자 1개 이상, 숫자 1개 이상, 특수문자 1개 이상을 반드시 포함하도록 각 카테고리에서
  최소 1글자씩 뽑은 뒤 나머지를 채우고 섞는다
- 화면에 표시되고 사람이 옮겨 적을 수도 있는 값이므로, 혼동되기 쉬운 문자(`0`/`O`, `1`/`l`/`I`)는
  후보 문자셋에서 제외한다
- 소문자를 포함한 전체 알파벳 대소문자 + 숫자 + 특수문자(정책이 요구하는 범위 내)에서 뽑는다

## 5. 관리자 흐름

### 5.1 버튼 → 확인 모달

`app/admin/users-manage/page.tsx`의 "비밀번호 초기화" 버튼(현재 `disabled`)을 활성화하고
클릭 시 확인 모달을 연다. 기존 `components/confirm-dialog.tsx`를 그대로 재사용(첨부 이미지와
동일한 문구):

- title: `비밀번호를 초기화하시겠습니까?`
- description: `임시 비밀번호가 새로 발급되며 기존 비밀번호는 더 이상 사용할 수 없습니다.`
- confirmLabel: `초기화`

버튼은 `signupStatus === 'APPROVED'`인 모든 행(SUPER_ADMIN 본인 포함)에 노출한다 — 이 계정
체계에서 유일한 비밀번호 복구 경로이므로 최고관리자 본인도 초기화할 수 있어야 한다(다른
최고관리자가 대신 처리하거나, 자기 자신을 초기화하는 경우 모두 허용).

### 5.2 API — `PATCH /api/admin/users-manage/[id]/reset-password`

- 권한: `requireSuperAdmin()`
- 대상이 `signupStatus === 'APPROVED'`가 아니면 400
- 처리:
  1. `generateTempPassword()`로 임시 비밀번호 생성
  2. bcrypt 해시 후 `passwordHash` 갱신, `mustChangePassword=true`, `passwordChangedAt=now()`
  3. `account_events`에 `action='PASSWORD_RESET'` 행 삽입(7장)
- 응답: `{ ok: true, tempPassword: string }` — 평문 임시 비밀번호는 이 응답에만 담기고
  서버 어디에도 저장하지 않는다

### 5.3 결과 표시

확인 모달이 닫히면 신규 컴포�너트(예: `components/temp-password-dialog.tsx`)를 연다:

- 발급된 임시 비밀번호를 읽기 전용 필드로 표시
- **복사 버튼 1**: 임시 비밀번호만 클립보드에 복사
- **복사 버튼 2**: 아래 템플릿으로 완성한 이메일 회신 본문 전체를 클립보드에 복사

```
[사용자 이름]님, 안녕하세요.

요청하신 비밀번호가 아래와 같이 초기화되었습니다.

임시 비밀번호: [임시 비밀번호]

아래 링크로 접속해 로그인하시면 새 비밀번호를 설정하는 화면으로 자동 연결됩니다.
[로그인 URL]

감사합니다.
```

`[로그인 URL]`은 `window.location.origin + '/login'`으로 클라이언트에서 계산한다(배포
도메인을 하드코딩하지 않는다). 이 다이얼로그는 닫으면 임시 비밀번호를 다시 볼 방법이
없다(재발급만 가능) — 새로고침해도 값이 사라지도록 컴포넌트 상태로만 들고 있고 별도
저장/캐시하지 않는다.

## 6. 세션 정책

### 6.1 최대 세션 유지 시간

`lib/auth/auth-options.ts`의 `session` 설정에 `maxAge`/`updateAge`를 추가:

```ts
session: {
  strategy: 'jwt',
  maxAge: 8 * 60 * 60, // 8시간
  updateAge: 10 * 60,  // 10분 이상 지난 뒤 요청이 오면 만료 시각을 연장(활동 시 슬라이딩)
},
```

### 6.2 비밀번호 변경 시 다른 세션 무효화

`lib/auth/session.ts`의 `requireApprovedUser()`(관리자 API 라우트 14곳이 이미 공통으로 거치는
지점)에 캐시 없는 확인을 추가한다. 기존 `signupStatus` 확인은 5분 캐시를 그대로 유지하고,
비밀번호 유효성 확인만 별도로 매 요청 확인한다:

1. `session` 콜백에서 JWT의 `iat`(발급 시각)를 `session.user.iat`로 노출하도록
   `lib/auth/auth-options.ts`의 `session` 콜백을 확장한다
2. `requireApprovedUser()`에서 `users.passwordChangedAt`을 매번(캐시 없이) 조회해, 그 값이
   `session.user.iat`보다 최신이면(= 이 세션이 발급된 뒤에 비밀번호가 바뀌었으면)
   `UnauthorizedError`를 던진다

**한계(정직하게 명시)**: 이 앱은 JWT 기반 세션이라 서버가 활성 세션 목록을 들고 있지 않다.
따라서 진짜 0초 즉시 차단은 구조적으로 불가능하고, 이 설계는 "그 세션으로 다음 관리자 API를
호출하는 시점"에 차단된다. 다만 이 앱의 실제 기능이 전부 관리자 API를 거치므로(2장 제외
항목 참고), 화면이 열려 있어도 다음 조작 시 즉시 로그인 화면으로 밀려나는 수준의 체감을
준다. 더 강한 차단(페이지 이동마다 미들웨어에서 확인)은 이번 범위에서 제외했다(2장).

## 7. 사용자 흐름

### 7.1 로그인 후 강제 이동

`proxy.ts`에 새 가드를 추가한다. 인증된 요청이고 `req.auth.user.mustChangePassword === true`이면
`/change-password`가 아닌 모든 경로를 `/change-password`로 리다이렉트한다(기존 `PUBLIC_PATHS`
처리와 같은 위치, 그 다음 단계). `mustChangePassword`는 `session` 콜백에서 `role`/`id`와
같은 방식으로 세션에 노출한다.

### 7.2 비밀번호 변경 화면 — `/change-password`

- 새 비밀번호 + 새 비밀번호 확인 입력만 받는다(임시 비밀번호 재입력 없음 — 이미 그 값으로
  인증된 세션이므로 생략)
- 회원가입 화면(`app/signup/page.tsx`)의 실시간 정책 체크리스트 UI를 재사용
- 제출 → `POST /api/auth/change-password` (`requireApprovedUser()`로 게이트, 세션의 사용자
  본인만 대상) → bcrypt 해시 후 `passwordHash` 갱신, `mustChangePassword=false`,
  `passwordChangedAt=now()`
- **성공 후 자동으로 로그인 화면으로 보내고 새 비밀번호로 다시 로그인하게 한다(`/dashboard`로
  바로 들여보내지 않는다).** 이유: 세션은 JWT라 발급 시점의 `mustChangePassword=true` 값이
  세션에 그대로 박혀 있어서, DB만 `false`로 바꿔도 세션 토큰 자체는 갱신되지 않는다 — 그대로
  두면 6.2절의 강제 이동 게이트가 계속 `/change-password`로 되돌려보내는 무한 루프가 된다.
  같은 이유로 6.2절의 세션 무효화 규칙도 자기 자신이 방금 바꾼 비밀번호에 대해 그대로
  적용된다(예외 없음). 그러니 변경 성공 시 클라이언트에서 로그아웃 처리 후 로그인 화면으로
  이동시키고, 로그인 화면에 "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요"
  안내를 보여준다

## 8. 감사 로그 통합

`docs/superpowers/specs/2026-08-28-change-history-design.md`에서 만든 `account_events`/
`buildHistoryTimeline`을 그대로 확장한다:

- `lib/db/schema.ts`의 `accountEvents.action` 주석에 `'PASSWORD_RESET'` 추가(컬럼 타입은
  이미 `varchar`라 스키마 변경 불필요)
- `lib/domain/user-history.ts`의 `AccountEventHistoryRow.action` 유니언에 `'PASSWORD_RESET'`
  추가, `buildHistoryTimeline`에 분류 규칙 추가: category `'비밀번호 초기화'`, detail `'-'`,
  reason `'-'`
- `app/admin/history/page.tsx`의 `Category`/`CATEGORY_OPTIONS`/`CATEGORY_BADGE_CLASS`에
  `'비밀번호 초기화'` 추가 — 기존 9색과 겹치지 않는 `indigo` 사용
- 5.2절 API에서 `account_events`에 `{userId: 대상, actorId: 처리한 관리자, action:
  'PASSWORD_RESET'}` 삽입(트랜잭션으로 `passwordHash` 갱신과 함께 묶는다 — 최종 리뷰에서
  확정한 "감사 기록은 상태 변경과 하나의 트랜잭션" 원칙을 그대로 따른다)

## 9. 보안 메모

- 임시 비밀번호는 응답 payload에만 존재하고 DB/로그 어디에도 평문으로 남지 않는다(해시만
  저장). 관리자가 다이얼로그를 닫거나 새로고침하면 다시 볼 수 없고, 필요하면 재발급(새
  임시 비밀번호로 다시 덮어씀)만 가능하다
- 최고관리자 본인이 자기 계정을 초기화하면 6.2절 규칙에 따라 본인의 현재 세션도 다음
  API 호출 시점에 무효화된다 — 화면에 뜬 임시 비밀번호로 다시 로그인해야 한다(의도된
  동작, 별도 예외 처리하지 않는다)
- `POST /api/auth/change-password`는 세션의 본인 계정만 바꿀 수 있어야 한다(대상 id를
  파라미터로 받지 않고 세션에서 추출)

## 10. 테스트 방침

이 저장소 관례상 `app/`·API 라우트는 자동화 테스트 대신 수동/curl 검증, 순수 함수만
Vitest 대상이다.

- `lib/domain/password-policy.ts`의 `generateTempPassword()`에 유닛 테스트 추가: 매 호출마다
  `isValidPassword()`를 통과하는지, 혼동 문자(`0O1lI`)가 섞이지 않는지, 길이가 항상 12인지
- `lib/domain/user-history.ts`의 `PASSWORD_RESET` 분류 규칙 유닛 테스트 추가
- 수동 검증:
  - 초기화 → 임시 비밀번호로 로그인 → `/change-password` 강제 이동 확인(다른 경로 직접
    접근 시도해도 리다이렉트되는지)
  - 비밀번호 변경 완료 후 정상 화면 진입, 재로그인 시 새 비밀번호로만 로그인되는지(임시
    비밀번호는 더 이상 안 먹는지)
  - 초기화 직후 그 계정으로 다른 브라우저(또는 시크릿 창)에 이미 로그인돼 있던 세션이,
    관리자 API를 호출하는 시점에 401로 막히는지
  - 8시간 `maxAge` 설정이 반영됐는지(코드 확인 수준 — 실제 8시간 대기는 비현실적이므로
    설정값 확인 + `updateAge` 짧게 임시로 바꿔 슬라이딩 연장 동작만 별도로 스팟 체크)
  - "변경 이력" 화면에 `비밀번호 초기화` 항목이 올바른 작업자/대상으로 나타나는지, 배지
    색이 기존 9종과 겹치지 않는지
