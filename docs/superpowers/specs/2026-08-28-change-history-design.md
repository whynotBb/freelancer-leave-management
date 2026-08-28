# 변경 이력 조회 화면 Design

- 작성일: 2026-08-28
- 상태: 승인 대기 (사용자 리뷰 전)
- 기준 문서:
  - `docs/superpowers/specs/2026-08-26-freelancer-detail-panel-design.md` (프리랜서별 연차·결재자 이력 —
    이 문서의 전제가 되는 기존 기능)
  - `docs/superpowers/specs/2026-08-27-user-management-consolidation-design.md` (가입 승인/거절 API)
  - `docs/superpowers/specs/2026-08-27-departed-user-management-design.md` (퇴사자 관리, 완전삭제)

## 1. 배경 및 목적

최고관리자가 사이트 전체에서 발생한 변경 액션(가입 승인/거절, 퇴사, 연차 발생·조정, 입사일 변경,
결재자 변경, 만근 예외 등록)을 한 화면에서 시간순으로 조회할 수 있게 한다. 지금은 이런 이력이
프리랜서 상세 패널(사용자 1명 단위)에만 일부 존재하고, 가입 승인/거절/퇴사는 이력이 전혀 남지 않아
"누가 언제 이 계정을 승인/거절/퇴사 처리했는지" 되짚어볼 방법이 없다.

## 2. 범위

**포함**
- 신규 "변경 이력" 화면(`/admin/history`), 최고관리자 전용
- 사이트 전체 변경 이력 조회: 가입 승인/거절, 퇴사, 연차 자동 발생/조정, 입사일 변경, 사용, 결재자
  변경, 만근 예외
- 작업 종류/대상/기간 필터, 페이지네이션
- 가입 승인/거절/퇴사 이력을 새로 남기기 위한 최소 데이터 모델 추가

**제외 (추후 별도 작업)**
- 프리랜서 상세 패널(사용자별 이력)에 가입 승인/거절/퇴사 추가 — 필요해지면 별도 요청으로 진행
- 퇴사자 관리 화면의 "복구"/"완전삭제" 액션 자체를 이력 항목으로 남기는 것 — 이번엔 완전삭제 시
  아래 3.1의 FK 정합성만 처리하고, 그 액션들의 로깅은 포함하지 않는다(필요해지면 `account_events`의
  `action` 값에 `RESTORED`/`PURGED`를 추가하는 방식으로 확장 가능)
- 결재함(휴가 신청 제출/승인/반려/취소) 워크플로 자체 구현 — 아직 이 저장소에 없다. 이 설계는 그
  기능이 나중에 붙어도 3.2/4장의 확장 지점만 채우면 자연스럽게 이력에 나타나도록 만들어 두지만,
  워크플로 자체를 만들지는 않는다
- DB 레벨 페이지네이션(진짜 대규모 트래픽 대비) — 6장 참고, 지금 규모에선 불필요

## 3. 데이터 모델

### 3.1 신규 테이블: `account_events`

가입 승인/거절, 퇴사는 지금 `users` 테이블의 현재 상태(`signupStatus`, `resignedAt`,
`resignReason`)만 남고 "이벤트가 언제·누구에 의해 일어났는지"의 이력이 전혀 없다. 이 세 가지만
다루는 좁은 테이블을 추가한다(사이트 전체를 다 담는 범용 로그 테이블이 아니다 — 연차/결재자/만근
예외는 이미 자기 테이블이 있으므로 그대로 재사용한다, 3.2절 참고).

```ts
export const accountEvents = pgTable('account_events', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id), // 대상 계정
  actorId: integer('actor_id').notNull().references(() => users.id), // 처리한 관리자
  action: varchar('action', { length: 20 }).notNull(), // 'SIGNUP_APPROVED' | 'SIGNUP_REJECTED' | 'RESIGNED'
  role: varchar('role', { length: 20 }), // SIGNUP_APPROVED일 때만: 'FREELANCER' | 'APPROVER'
  hireDate: date('hire_date', { mode: 'string' }), // SIGNUP_APPROVED + role='FREELANCER'일 때만
  reason: text('reason'), // RESIGNED일 때만 — 퇴사 사유 스냅샷(users.resignReason은 복구 후
                           // 재퇴사하면 덮어써지므로, 과거 시점 값을 여기 별도로 남긴다)
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

### 3.2 기존 테이블 재사용 (스키마 변경 없음)

연차 자동 발생/조정, 입사일 변경, 사용은 `leave_grants`·`leave_requests`에, 결재자 변경은
`approver_changes`에, 만근 예외는 `attendance_exceptions`에 이미 기록되고 있다. 이 화면은 이
네 테이블을 **그대로 읽기만** 하고 아무것도 바꾸지 않는다 — 프리랜서 상세 패널이 쓰는 것과 완전히
같은 원본 데이터를 같은 분류 로직으로 읽으므로, 두 화면의 내용이 어긋날 수 없다. 향후 결재함
워크플로가 추가되면 `leave_requests`에 남을 제출/승인/반려/취소 상태 전이도 같은 방식으로 이
화면에 자동으로 포함될 수 있게 4장에서 확장 지점을 열어 둔다.

## 4. 도메인 로직 확장 — `lib/domain/user-history.ts`

기존 함수·테스트는 그대로 두고 다음만 추가한다:

- `HistoryEntry.category` 유니언에 `'가입 승인' | '가입 거절' | '퇴사'` 추가
- `HistoryEntry`에 선택 필드 `targetUserId?: number`, `targetUserName?: string` 추가 — 사이트
  전체 조회(5장)에서만 채워지고, 기존 사용자별 조회(`getUserHistory`)는 지금처럼 이 필드 없이
  호출해 동작이 바뀌지 않는다
- 기존 네 Row 인터페이스(`GrantHistoryRow`, `UsageHistoryRow`, `ApproverChangeHistoryRow`,
  `AttendanceExceptionHistoryRow`)에도 동일하게 선택 필드 `targetUserId?`, `targetUserName?` 추가
- 신규 `AccountEventHistoryRow` 인터페이스:

```ts
export interface AccountEventHistoryRow {
  action: 'SIGNUP_APPROVED' | 'SIGNUP_REJECTED' | 'RESIGNED'
  role: 'FREELANCER' | 'APPROVER' | null
  hireDate: string | null
  reason: string | null
  actorName: string | null
  createdAt: string
  targetUserId?: number
  targetUserName?: string
}
```

- `buildHistoryTimeline`에 5번째 선택 파라미터 `accountEvents?: AccountEventHistoryRow[]` 추가,
  매핑 규칙:
  - `SIGNUP_APPROVED` → category `'가입 승인'`, detail: `role === 'FREELANCER'`이면
    `` `프리랜서 승인 (입사일 ${hireDate})` ``, 아니면 `'결재자 승인'`, reason은 `'-'`
  - `SIGNUP_REJECTED` → category `'가입 거절'`, detail `'-'`, reason `'-'`
  - `RESIGNED` → category `'퇴사'`, detail `'-'`, reason은 스냅샷된 퇴사 사유

## 5. 사이트 전체 조회 — 신규 `lib/db/history.ts`

```ts
export interface HistoryFilters {
  targetGroup?: 'ACCOUNT' | 'LEAVE' | 'APPROVER' | 'ATTENDANCE' // 향후 'LEAVE_REQUEST' 추가 가능
  category?: HistoryEntry['category']
  from?: string // ISO 날짜(KST 기준 그 날 00:00부터)
  to?: string   // ISO 날짜(KST 기준 그 날 23:59:59까지)
  page: number    // 1-based, 기본 1
  pageSize: number // 기본 50, 최대 100
}

export interface HistoryPage {
  items: HistoryEntry[] // targetUserId/targetUserName이 채워진 상태
  total: number
  page: number
  pageSize: number
}

export async function getSiteWideHistory(filters: HistoryFilters): Promise<HistoryPage>
```

동작:
1. `targetGroup`으로 어떤 소스를 조회할지 정한다(미지정이면 5개 소스 전체: `leave_grants`,
   `leave_requests`(APPROVED만), `approver_changes`, `attendance_exceptions`, `account_events`).
   대상 그룹이 좁혀지면 그만큼 쿼리 수도 줄어든다(예: `APPROVER`면 `approver_changes` 하나만 조회).
2. 각 소스 쿼리에 `createdAt`이 `from`~`to` 범위 안인지 SQL에서 필터링하고, 대상 사용자 이름을
   join해 `targetUserId`/`targetUserName`을 채운다.
3. `buildHistoryTimeline`으로 병합·정렬(내림차순, 기존 로직 그대로 재사용).
4. `category` 필터가 있으면 병합 결과에서 한 번 더 필터링한다(예: "연차 자동 발생"과 "연차 조정"은
   같은 `leave_grants` 테이블 안에서 `created_by` 유무로만 구분되므로, 소스 쿼리 단계가 아니라
   병합 후 애플리케이션 단계에서 분리한다).
5. `total`은 필터링된 전체 길이, `items`는 `(page-1)*pageSize`부터 `pageSize`개 슬라이스.

**알려진 한계**: 필터링·정렬·페이지네이션을 애플리케이션 메모리에서 처리한다. 프리랜서 수
수십~수백 명 규모의 소규모 관리 도구에서는 문제가 없지만, 이력이 수만 건 이상 누적되면 DB 레벨
페이지네이션(예: 이 5개 소스를 합친 SQL 뷰, 또는 진짜 append-only 로그 테이블로의 재구조화)이
필요해진다. 지금은 그 정도 규모가 아니므로 이번 범위에서는 다루지 않는다(2장에서도 명시).

## 6. 조회 API — `GET /api/admin/history`

- 권한: `requireSuperAdmin()`
- 쿼리 파라미터: `targetGroup`, `category`, `from`, `to`, `page`(기본 1), `pageSize`(기본 50,
  최대 100) — 5장의 `HistoryFilters`에 그대로 대응
- 응답: `HistoryPage` JSON 그대로

## 7. 기존 코드 변경 — 로깅 삽입 지점

**7.1 가입 승인 — `app/api/admin/users-manage/[id]/approve/route.ts`**
- `requireSuperAdmin()` 세션에서 `actorId`를 추출(현재 코드엔 없음 — 추가).
- `.update(...)`를 `.returning({ id: users.id })`로 바꿔, 실제로 갱신된 행이 있을 때만(대상이
  진짜 `PENDING`이었을 때만) `account_events`에 `SIGNUP_APPROVED`(role, hireDate 포함) 삽입.
  갱신된 행이 없으면(이미 처리된 계정) 지금처럼 조용히 무시하고 로그도 남기지 않는다.

**7.2 가입 거절 — `.../reject/route.ts`**
- 7.1과 동일하게 `.returning()`으로 실제 갱신 여부를 확인한 뒤에만 `SIGNUP_REJECTED` 삽입.

**7.3 퇴사 — `lib/db/departures.ts`의 `resignUser`**
- 함수 시그니처에 `actorId: number` 파라미터 추가. 호출부(`app/api/admin/users/[id]/resign/route.ts`)는
  이미 세션에서 `callerId`를 뽑아 두고 있으므로 그대로 전달만 하면 된다.
- 위임 재배정이 있는 분기(결재자 퇴사, 이미 트랜잭션 사용 중)와 없는 분기(일반 퇴사) 양쪽 모두,
  `users` 갱신이 성공하면 같은 트랜잭션 안에서 `account_events`에 `RESIGNED`(퇴사 사유 스냅샷)
  삽입.

**7.4 완전삭제 — `lib/db/departures.ts`의 `deleteDepartedUser`**
- FREELANCER 하드 삭제 트랜잭션에 `tx.delete(accountEvents).where(eq(accountEvents.userId, userId))`
  추가 필수. 안 하면 `account_events.user_id`의 FK 제약 때문에 완전삭제 자체가 실패한다 — 이번에
  새 테이블을 추가하면서 생기는 정합성 문제이므로 반드시 같이 처리한다.
- APPROVER 익명화 분기는 `users` row를 지우지 않으므로(다른 사람의 기록이 참조 중) 변경이
  필요 없다 — `account_events`도 그대로 남고, 대상 이름은 조회 시 "사용자#N(퇴사)"로 자연스럽게
  보인다(기존 익명화 패턴과 동일).

이 4곳 외에 연차 조정/입사일 변경/결재자 변경/만근 예외는 이미 각자 테이블에 기록되고 있으므로
**코드 변경이 필요 없다** — `getSiteWideHistory`가 그 테이블들을 그대로 읽기만 한다.

## 8. 화면 — `/admin/history`

- 사이드바: `components/app-sidebar.tsx`의 `ADMIN_LINKS`에
  `{ href: '/admin/history', label: '변경 이력', icon: HistoryIcon, roles: ['SUPER_ADMIN'] }` 추가,
  관리자 메뉴 맨 아래(퇴사자 관리 다음)에 배치
- `app/admin/history/layout.tsx`(타이틀 "변경 이력"), `app/admin/history/page.tsx`(신규)
- 필터 바: 작업 종류 드롭다운(전체/가입 승인/가입 거절/퇴사/연차 자동 발생/연차 조정/입사일
  변경/사용/결재자 변경/만근 예외), 대상 드롭다운(전체/계정/연차/결재자/만근 예외), 시작일·종료일
  `DatePicker`(기존 컴포넌트 재사용)
- 테이블 컬럼: 일시 / 작업자 / 작업(배지) / 대상(대상자 이름) / 내용 / 사유
- 배지 색상: 기존 `components/user-history-panel.tsx`의 `CATEGORY_BADGE_CLASS` 팔레트(연차 자동
  발생=emerald, 연차 조정=amber, 사용=sky, 결재자 변경=violet, 입사일 변경=slate, 만근 예외=rose)를
  그대로 확장하고, 신규 3종은 겹치지 않는 색으로: 가입 승인=teal, 가입 거절=orange, 퇴사=red
- 하단 페이지네이션: 이전/다음 버튼 + "페이지 X / Y" — 이 프로젝트에서 페이지네이션이 필요한 첫
  화면이라 기존 참고 패턴이 없음, 단순하게 시작
- 로딩/빈 상태: 기존 화면들과 동일하게 `LoadingSpinner`, 빈 결과 안내 문구
- 모바일: 다른 관리자 화면처럼 카드형 레이아웃으로 별도 렌더링

## 9. 권한

메뉴·페이지·신규 API(`GET /api/admin/history`) 모두 `requireSuperAdmin()`으로 통일한다. 결재자는
자신이 담당하지 않는 다른 프리랜서/결재자의 승인·거절·퇴사 이력까지 보게 되는 것을 피하기 위해
열람할 수 없다(사용자와 논의해 확정).

## 10. 테스트 방침

- `lib/domain/user-history.ts`의 `buildHistoryTimeline` 확장분(가입 승인/거절/퇴사 분류,
  `targetUserName` 포함 여부)에 대한 유닛 테스트를 기존 `lib/domain/user-history.test.ts`에 추가
- API 라우트는 이 프로젝트 관례상 자동화 테스트 대신 수동/curl 검증
- 수동 검증 항목:
  - 가입 승인/거절/퇴사 처리 직후 변경 이력에 즉시 반영되는지
  - 작업 종류/대상/기간 필터가 각각 올바르게 좁혀지는지, 페이지네이션 이동이 정상인지
  - 완전삭제(퇴사자 관리 화면) 실행 시 `account_events` FK 정합성 문제 없이 성공하는지
  - 결재자 계정으로 메뉴/페이지/API 접근 시 차단되는지
  - 프리랜서 상세 패널의 기존 이력 표시가 이번 변경으로 그대로인지(회귀 없음)
