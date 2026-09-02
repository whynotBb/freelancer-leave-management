# "내 문서" 화면(연차 신청 + 내 휴가정보 통합) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프리랜서가 연차를 신청·임시저장·수정·삭제·취소하고, 본인의 휴가현황 요약과 신청
문서·연차 발생/조정 내역을 하나의 통합 화면(`/documents`)에서 확인할 수 있게 한다.

**Architecture:** 신청일수 계산(`leave-day-count.ts`)·잔여연차 계산(`leave-adjustments.ts`의
`getLeaveBalance`)·상태 전이(`leave-workflow.ts`의 `applyTransition`)·기간 중복 검사
(`leave-validation.ts`)는 모두 기존에 구현·테스트된 순수 함수를 그대로 재사용한다. 이번에 새로
만드는 로직은 "본인 신청 문서(전체 상태) + 연차 발생/조정 내역"을 하나의 타임라인으로 병합하는
`buildMyDocumentTimeline` 뿐이다(관리자용 `buildHistoryTimeline`은 승인된 사용 내역만 다루므로
그대로 재사용할 수 없다 — 건드리지 않고 별도로 둔다). API는 `app/api/documents/`아래 REST
라우트 4개(GET/POST/PATCH/DELETE), UI는 `app/documents/page.tsx` + `LeaveRequestSheet`
컴포넌트 하나로 구성한다.

**Tech Stack:** Next.js 16(App Router), NextAuth v5(JWT 세션), Drizzle ORM + postgres,
Tailwind CSS + shadcn/ui(Sheet, Badge, Textarea 등), zod, date-fns, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-my-documents-design.md` (+ 원 설계 문서
`docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md` 6·7·9장)

## Global Constraints

- 커밋 메시지·코드 주석은 한국어, 변수명·함수명은 영어로 작성한다 (전역 CLAUDE.md).
- 이 저장소는 `app/`·API 라우트·`lib/db/*`에 자동화 테스트를 두지 않는다 — 순수 함수
  (`lib/domain/*`)만 Vitest 대상이고, 나머지는 "구현 → 수동 검증 → 커밋" 순서를 따른다(원 설계
  문서 12장, 여러 선행 계획 문서와 동일한 컨벤션).
- Next.js 16 동적 라우트의 `params`는 `Promise<{...}>`다 — `await params`로 꺼낸다(기존
  `app/api/admin/users/[id]/route.ts` 패턴).
- 신청일수·잔여연차·상태 전이·기간 중복 검사는 전부 기존 순수 함수를 재사용한다. 새 비즈니스
  로직(연차 계산 규칙 변경 등)을 추가하지 않는다.
- 새 UI는 기존 컴포넌트(`Sheet`, `ApproverCombobox`, `DatePicker`, `Badge`, `Textarea`,
  `LoadingSpinner`, `PageHeader`, `ConfirmDialog`)를 그대로 재사용한다. 새 npm 패키지를
  추가하지 않는다.
- `leaveRequests.type === 'ADJUSTMENT'`인 행은 실제 신청 문서가 아니라 관리자의 수동 사용량
  조정 기록이다(`lib/domain/leave-adjustment.ts:37-39` 경고 주석 참고) — 신청 문서 목록/기간
  중복 검사에서 반드시 제외한다.

---

### Task 1: 사이드바 "내 문서" 메뉴를 FREELANCER 전용으로 제한

**배경**: `components/app-sidebar.tsx`의 `COMMON_LINKS`는 역할 구분 없이 모두에게 "내 문서"를
보여준다. 이 화면은 본인 휴가계·연차 잔액이 있는 FREELANCER만 의미가 있다(APPROVER/
SUPER_ADMIN은 없음 — CLAUDE.md 핵심 비즈니스 규칙).

**Files:**
- Modify: `components/app-sidebar.tsx`

**Interfaces:** 없음(다른 파일이 `COMMON_LINKS`를 참조하지 않음).

- [ ] **Step 1: `COMMON_LINKS`에 선택적 `roles` 필드 추가, "내 문서"에만 지정**

```tsx
// components/app-sidebar.tsx — 기존 COMMON_LINKS 선언 교체
const COMMON_LINKS = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboardIcon },
  { href: '/documents', label: '내 문서', icon: FileTextIcon, roles: ['FREELANCER'] },
  { href: '/approvals', label: '결재함', icon: InboxIcon },
]
```

- [ ] **Step 2: 렌더링 시 role 필터 적용**

```tsx
// components/app-sidebar.tsx — COMMON_LINKS.map(...) 부분 교체
{COMMON_LINKS.filter((link) => !('roles' in link) || link.roles.includes(role ?? '')).map((link) => (
  <SidebarMenuItem key={link.href}>
    <SidebarMenuButton
      render={<Link href={link.href} />}
      isActive={isLinkActive(pathname, link.href)}
      onClick={closeOnMobile}
    >
      <link.icon />
      {link.label}
    </SidebarMenuButton>
  </SidebarMenuItem>
))}
```

- [ ] **Step 3: 수동 검증**

`npm run dev`로 실행 후, FREELANCER 계정으로 로그인하면 사이드바에 "내 문서"가 보이고,
APPROVER 또는 SUPER_ADMIN 계정으로 로그인하면 "내 문서"가 사라지는지(대시보드·결재함은 계속
보임) 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add components/app-sidebar.tsx
git commit -m "fix: 내 문서 메뉴를 프리랜서 전용으로 제한"
```

---

### Task 2: 순수 함수 — 근속 연차 계산 + 통합 타임라인 병합

**배경**: 요약 블록의 "N년차" 표시와, 신청 문서(전체 상태)+연차 발생/조정 내역을 하나로 병합해
날짜 내림차순으로 보여주는 로직이 필요하다. 관리자용 `buildHistoryTimeline`
(`lib/domain/user-history.ts`)은 `status='APPROVED'`인 사용 내역만 다루도록 만들어져 있어
대기/반려 문서를 표현할 수 없으므로 건드리지 않고 새 함수를 만든다. 날짜 포맷/금액 포맷 헬퍼는
이미 `user-history.ts`에 있으므로 export만 추가해 재사용한다(중복 구현 방지).

**Files:**
- Modify: `lib/domain/user-history.ts` (헬퍼 2개에 `export` 추가)
- Modify: `lib/domain/date-utils.ts` (`getYearsOfService` 추가)
- Modify: `lib/domain/date-utils.test.ts`
- Create: `lib/domain/my-document-timeline.ts`
- Create: `lib/domain/my-document-timeline.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수만 사용, date-fns).
- Produces: `getYearsOfService(hireDate: string, asOfDate: string): number`,
  `buildMyDocumentTimeline(params: { requests: MyLeaveRequestRow[], grants: MyGrantRow[] }): MyDocumentEntry[]`,
  `MyLeaveRequestRow`/`MyGrantRow`/`MyDocumentEntry` 타입 — Task 3에서 `lib/db/leave-requests.ts`가
  그대로 가져다 쓴다.

- [ ] **Step 1: `user-history.ts`의 날짜/금액 포맷 헬퍼를 export**

```ts
// lib/domain/user-history.ts — 기존 두 함수 선언에 export만 추가(본문 변경 없음)
export function formatDateTime(iso: string): string {
  // ...기존 구현 그대로
}

export function formatAmount(amount: number): string {
  // ...기존 구현 그대로
}
```

- [ ] **Step 2: `getYearsOfService`의 실패하는 테스트 작성**

```ts
// lib/domain/date-utils.test.ts — 기존 describe 블록들 아래에 추가
describe('getYearsOfService', () => {
  it('입사 1주년이 지나지 않았으면 1년차다', () => {
    expect(getYearsOfService('2026-01-29', '2026-09-02')).toBe(1)
  })

  it('입사일로부터 정확히 N번째 기념일이 지났으면 N+1년차다', () => {
    expect(getYearsOfService('2018-01-29', '2026-09-02')).toBe(9)
  })

  it('입사일 당일은 1년차다', () => {
    expect(getYearsOfService('2026-09-02', '2026-09-02')).toBe(1)
  })
})
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run: `npm run test -- date-utils`
Expected: FAIL — `getYearsOfService is not defined` (아직 구현 전)

- [ ] **Step 4: `getYearsOfService` 구현**

```ts
// lib/domain/date-utils.ts — 맨 위 import를 아래로 교체
import { addMonths, differenceInCalendarYears, format, isBefore, isEqual, parseISO, startOfDay } from 'date-fns'
```

```ts
// lib/domain/date-utils.ts — 파일 맨 아래에 추가
export function getYearsOfService(hireDate: string, asOfDate: string): number {
  return differenceInCalendarYears(parseISO(asOfDate), parseISO(hireDate)) + 1
}
```

- [ ] **Step 5: 테스트 실행해 통과 확인**

Run: `npm run test -- date-utils`
Expected: PASS (기존 테스트 포함 전부 통과)

- [ ] **Step 6: `buildMyDocumentTimeline`의 실패하는 테스트 작성**

```ts
// lib/domain/my-document-timeline.test.ts (신규)
import { describe, expect, it } from 'vitest'
import { buildMyDocumentTimeline } from './my-document-timeline'

describe('buildMyDocumentTimeline', () => {
  it('일반 신청 문서는 상태를 포함한 REQUEST 항목으로 매핑한다', () => {
    const result = buildMyDocumentTimeline({
      requests: [
        {
          id: 1,
          title: '여름 휴가',
          startDate: '2026-08-14',
          endDate: '2026-08-14',
          type: 'FULL',
          requestedDays: 1,
          status: 'PENDING',
          reason: '개인 사정',
          approverId: 3,
          approverName: '김결재',
          rejectReason: null,
          createdAt: '2026-08-13T01:00:00.000Z',
        },
      ],
      grants: [],
    })
    expect(result).toEqual([
      {
        kind: 'REQUEST',
        id: 1,
        date: '2026-08-13 10:00',
        title: '여름 휴가',
        startDate: '2026-08-14',
        endDate: '2026-08-14',
        type: 'FULL',
        requestedDays: 1,
        status: 'PENDING',
        reason: '개인 사정',
        approverId: 3,
        approverName: '김결재',
        rejectReason: null,
      },
    ])
  })

  it('type이 ADJUSTMENT인 신청 문서는 신청서가 아니라 조정 항목으로 매핑한다(상태 배지 없음)', () => {
    const result = buildMyDocumentTimeline({
      requests: [
        {
          id: 2,
          title: '연차 사용 수동 조정',
          startDate: '2026-07-01',
          endDate: '2026-07-01',
          type: 'ADJUSTMENT',
          requestedDays: -1,
          status: 'APPROVED',
          reason: '중복 신청 취소 보정',
          approverId: 9,
          approverName: '관리자',
          rejectReason: null,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      grants: [],
    })
    expect(result).toEqual([
      {
        kind: 'ADJUSTMENT',
        date: '2026-07-01 09:00',
        detail: '-1일',
        reason: '중복 신청 취소 보정',
        actorName: '관리자',
      },
    ])
  })

  it('연차 발생/조정 내역(leaveGrants)도 ADJUSTMENT 항목으로 매핑하고, 자동 발생은 처리자를 시스템으로 표시한다', () => {
    const result = buildMyDocumentTimeline({
      requests: [],
      grants: [
        {
          amount: 1,
          note: null,
          createdBy: null,
          createdByName: null,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    })
    expect(result).toEqual([
      {
        kind: 'ADJUSTMENT',
        date: '2026-04-01 09:00',
        detail: '+1일',
        reason: '-',
        actorName: '시스템',
      },
    ])
  })

  it('신청 문서와 발생/조정 내역을 날짜 내림차순으로 병합한다', () => {
    const result = buildMyDocumentTimeline({
      requests: [
        {
          id: 1,
          title: '오래된 신청',
          startDate: '2026-02-01',
          endDate: '2026-02-01',
          type: 'FULL',
          requestedDays: 1,
          status: 'APPROVED',
          reason: '-',
          approverId: 3,
          approverName: '김결재',
          rejectReason: null,
          createdAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      grants: [
        {
          amount: 1,
          note: null,
          createdBy: null,
          createdByName: null,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    })
    expect(result.map((e) => e.date)).toEqual(['2026-04-01 09:00', '2026-02-01 09:00'])
  })
})
```

- [ ] **Step 7: 테스트 실행해 실패 확인**

Run: `npm run test -- my-document-timeline`
Expected: FAIL — 모듈이 존재하지 않음

- [ ] **Step 8: `buildMyDocumentTimeline` 구현**

```ts
// lib/domain/my-document-timeline.ts (신규)
import { formatAmount, formatDateTime } from './user-history'

export type MyLeaveRequestType = 'FULL' | 'AM_HALF' | 'PM_HALF' | 'ADJUSTMENT'
export type MyLeaveRequestStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED'

export interface MyLeaveRequestRow {
  id: number
  title: string
  startDate: string
  endDate: string
  type: MyLeaveRequestType
  requestedDays: number
  status: MyLeaveRequestStatus
  reason: string
  approverId: number
  approverName: string | null
  rejectReason: string | null
  createdAt: string
}

export interface MyGrantRow {
  amount: number
  note: string | null
  createdBy: number | null
  createdByName: string | null
  createdAt: string
}

export type MyDocumentEntry =
  | {
      kind: 'REQUEST'
      id: number
      date: string
      title: string
      startDate: string
      endDate: string
      type: 'FULL' | 'AM_HALF' | 'PM_HALF'
      requestedDays: number
      status: MyLeaveRequestStatus
      reason: string
      approverId: number
      approverName: string | null
      rejectReason: string | null
    }
  | {
      kind: 'ADJUSTMENT'
      date: string
      detail: string
      reason: string
      actorName: string | null
    }

interface SortableEntry {
  entry: MyDocumentEntry
  sortKey: string
}

export function buildMyDocumentTimeline(params: {
  requests: MyLeaveRequestRow[]
  grants: MyGrantRow[]
}): MyDocumentEntry[] {
  const requestEntries: SortableEntry[] = params.requests
    .filter((r) => r.type !== 'ADJUSTMENT')
    .map((r) => ({
      entry: {
        kind: 'REQUEST',
        id: r.id,
        date: formatDateTime(r.createdAt),
        title: r.title,
        startDate: r.startDate,
        endDate: r.endDate,
        type: r.type as 'FULL' | 'AM_HALF' | 'PM_HALF',
        requestedDays: r.requestedDays,
        status: r.status,
        reason: r.reason,
        approverId: r.approverId,
        approverName: r.approverName,
        rejectReason: r.rejectReason,
      },
      sortKey: r.createdAt,
    }))

  // ADJUSTMENT 타입 신청 행(관리자 수동 사용량 조정)은 문서가 아니라 조정 이력이라
  // leaveGrants 쪽 조정 항목과 같은 모양(ADJUSTMENT kind)으로 합친다.
  const usageAdjustmentEntries: SortableEntry[] = params.requests
    .filter((r) => r.type === 'ADJUSTMENT')
    .map((r) => ({
      entry: {
        kind: 'ADJUSTMENT',
        date: formatDateTime(r.createdAt),
        detail: formatAmount(r.requestedDays),
        reason: r.reason,
        actorName: r.approverName,
      },
      sortKey: r.createdAt,
    }))

  const grantEntries: SortableEntry[] = params.grants.map((g) => {
    const isAutoGrant = g.createdBy === null
    return {
      entry: {
        kind: 'ADJUSTMENT',
        date: formatDateTime(g.createdAt),
        detail: formatAmount(g.amount),
        reason: g.note ?? '-',
        actorName: isAutoGrant ? '시스템' : g.createdByName,
      },
      sortKey: g.createdAt,
    }
  })

  return [...requestEntries, ...usageAdjustmentEntries, ...grantEntries]
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))
    .map((s) => s.entry)
}
```

- [ ] **Step 9: 테스트 실행해 통과 확인**

Run: `npm run test -- my-document-timeline`
Expected: PASS

- [ ] **Step 10: 전체 스위트 회귀 확인 + 커밋**

```bash
npm run test
git add lib/domain/user-history.ts lib/domain/date-utils.ts lib/domain/date-utils.test.ts lib/domain/my-document-timeline.ts lib/domain/my-document-timeline.test.ts
git commit -m "feat: 근속 연차 계산과 내 문서 통합 타임라인 병합 순수 함수 추가"
```

---

### Task 3: 데이터 계층(조회) — 공휴일, 요약, 통합 타임라인

**Files:**
- Create: `lib/db/holidays.ts`
- Create: `lib/db/leave-requests.ts`

**Interfaces:**
- Consumes: `lib/db/client.ts`의 `db`, `lib/db/schema.ts`의 `users`/`leaveGrants`/
  `leaveRequests`/`holidays`, `lib/domain/my-document-timeline.ts`의 `buildMyDocumentTimeline`,
  `lib/db/leave-adjustments.ts`의 `getLeaveBalance`(기존).
- Produces: `getHolidayDates(): Promise<Set<string>>`,
  `getMyDocumentSummary(userId: number): Promise<MyDocumentSummary>`,
  `getMyDocumentTimeline(userId: number): Promise<MyDocumentEntry[]>` — Task 5(GET 라우트)가
  소비한다. `MyDocumentSummary`는 `{ hireDate: string | null, yearsOfService: number | null,
  granted: number, used: number, remaining: number, defaultApproverId: number | null }`.

- [ ] **Step 1: `lib/db/holidays.ts` 작성**

```ts
// lib/db/holidays.ts (신규)
import { db } from '@/lib/db/client'
import { holidays } from '@/lib/db/schema'

export async function getHolidayDates(): Promise<Set<string>> {
  const rows = await db.select({ date: holidays.date }).from(holidays)
  return new Set(rows.map((r) => r.date))
}
```

- [ ] **Step 2: `lib/db/leave-requests.ts`에 조회 함수 작성**

```ts
// lib/db/leave-requests.ts (신규 — 이번 Task에서는 조회 함수만 작성한다)
import { and, eq, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'
import { leaveGrants, leaveRequests, users } from '@/lib/db/schema'
import { getLeaveBalance } from '@/lib/db/leave-adjustments'
import {
  buildMyDocumentTimeline,
  type MyDocumentEntry,
  type MyLeaveRequestRow,
} from '@/lib/domain/my-document-timeline'
import { getYearsOfService } from '@/lib/domain/date-utils'

export interface MyDocumentSummary {
  hireDate: string | null
  yearsOfService: number | null
  granted: number
  used: number
  remaining: number
  defaultApproverId: number | null
}

export async function getMyDocumentSummary(userId: number): Promise<MyDocumentSummary> {
  const [user] = await db
    .select({ hireDate: users.hireDate, defaultApproverId: users.defaultApproverId })
    .from(users)
    .where(eq(users.id, userId))

  if (!user?.hireDate) {
    return {
      hireDate: null,
      yearsOfService: null,
      granted: 0,
      used: 0,
      remaining: 0,
      defaultApproverId: user?.defaultApproverId ?? null,
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const balance = await getLeaveBalance(userId, user.hireDate, today)
  return {
    hireDate: user.hireDate,
    yearsOfService: getYearsOfService(user.hireDate, today),
    granted: balance.granted,
    used: balance.used,
    remaining: balance.remaining,
    defaultApproverId: user.defaultApproverId,
  }
}

export async function getMyDocumentTimeline(userId: number): Promise<MyDocumentEntry[]> {
  const approver = alias(users, 'approver')
  const requestRows = await db
    .select({
      id: leaveRequests.id,
      title: leaveRequests.title,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      type: leaveRequests.type,
      requestedDays: leaveRequests.requestedDays,
      status: leaveRequests.status,
      reason: leaveRequests.reason,
      approverId: leaveRequests.approverId,
      approverName: approver.name,
      rejectReason: leaveRequests.rejectReason,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .leftJoin(approver, eq(leaveRequests.approverId, approver.id))
    .where(eq(leaveRequests.userId, userId))

  const creator = alias(users, 'creator')
  const grantRows = await db
    .select({
      amount: leaveGrants.amount,
      note: leaveGrants.note,
      createdBy: leaveGrants.createdBy,
      createdByName: creator.name,
      createdAt: leaveGrants.createdAt,
    })
    .from(leaveGrants)
    .leftJoin(creator, eq(leaveGrants.createdBy, creator.id))
    .where(eq(leaveGrants.userId, userId))

  return buildMyDocumentTimeline({
    requests: requestRows.map(
      (r): MyLeaveRequestRow => ({
        ...r,
        type: r.type as MyLeaveRequestRow['type'],
        status: r.status as MyLeaveRequestRow['status'],
        createdAt: r.createdAt.toISOString(),
      })
    ),
    grants: grantRows.map((g) => ({ ...g, createdAt: g.createdAt.toISOString() })),
  })
}

// hasOverlappingActiveRequest(기존, PENDING/APPROVED만 걸러 비교)에 넘길 원본 목록이다.
// type='ADJUSTMENT'(관리자 수동 조정 기록, 실제 신청이 아님)만 제외하고 FULL/AM_HALF/PM_HALF는
// 전부 포함한다 — 반차도 기간 중복 검사 대상이다.
export async function getOwnActiveRequestRanges(
  userId: number
): Promise<{ startDate: string; endDate: string; status: string }[]> {
  return db
    .select({ startDate: leaveRequests.startDate, endDate: leaveRequests.endDate, status: leaveRequests.status })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.userId, userId), ne(leaveRequests.type, 'ADJUSTMENT')))
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add lib/db/holidays.ts lib/db/leave-requests.ts
git commit -m "feat: 공휴일/내 문서 요약/통합 타임라인 조회 함수 추가"
```

---

### Task 4: 데이터 계층(쓰기) — 신청 생성·수정·삭제·상태 전이

**Files:**
- Modify: `lib/db/leave-requests.ts`

**Interfaces:**
- Consumes: `lib/domain/leave-workflow.ts`의 `applyTransition`(기존),
  `lib/domain/leave-validation.ts`의 `hasOverlappingActiveRequest`(기존),
  `lib/db/leave-adjustments.ts`의 `getLeaveBalance`(기존).
- Produces: `createLeaveRequest`, `updateDraftLeaveRequest`, `deleteDraftLeaveRequest`,
  `getOwnLeaveRequestById`, `transitionOwnLeaveRequest`, `checkSubmissionEligibility` — Task
  6·7·8(API 라우트)이 소비한다.

- [ ] **Step 1: 쓰기 함수 추가**

```ts
// lib/db/leave-requests.ts — 파일 맨 위 import를 아래로 교체
import { and, eq, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'
import { leaveGrants, leaveRequests, users } from '@/lib/db/schema'
import { getLeaveBalance } from '@/lib/db/leave-adjustments'
import { applyTransition, type LeaveRequestStatus } from '@/lib/domain/leave-workflow'
import { hasOverlappingActiveRequest } from '@/lib/domain/leave-validation'
import {
  buildMyDocumentTimeline,
  type MyDocumentEntry,
  type MyLeaveRequestRow,
} from '@/lib/domain/my-document-timeline'
import { getYearsOfService } from '@/lib/domain/date-utils'
```

```ts
// lib/db/leave-requests.ts — 파일 맨 아래에 추가
export interface LeaveRequestFields {
  title: string
  approverId: number
  startDate: string
  endDate: string
  type: 'FULL' | 'AM_HALF' | 'PM_HALF'
  requestedDays: number
  reason: string
}

export async function createLeaveRequest(
  userId: number,
  fields: LeaveRequestFields,
  status: 'DRAFT' | 'PENDING'
): Promise<{ id: number }> {
  const [row] = await db
    .insert(leaveRequests)
    .values({
      userId,
      approverId: fields.approverId,
      title: fields.title,
      startDate: fields.startDate,
      endDate: fields.endDate,
      type: fields.type,
      requestedDays: fields.requestedDays,
      reason: fields.reason,
      status,
      submittedAt: status === 'PENDING' ? new Date() : null,
    })
    .returning({ id: leaveRequests.id })
  return row
}

// DRAFT 상태 + 본인 소유일 때만 갱신한다. 조건에 안 맞으면(이미 제출됐거나 남의 문서) 아무 것도
// 갱신하지 않고 false를 반환한다 — 호출부가 404로 처리한다.
export async function updateDraftLeaveRequest(
  id: number,
  userId: number,
  fields: LeaveRequestFields
): Promise<boolean> {
  const rows = await db
    .update(leaveRequests)
    .set({
      title: fields.title,
      approverId: fields.approverId,
      startDate: fields.startDate,
      endDate: fields.endDate,
      type: fields.type,
      requestedDays: fields.requestedDays,
      reason: fields.reason,
    })
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'DRAFT')))
    .returning({ id: leaveRequests.id })
  return rows.length > 0
}

export async function deleteDraftLeaveRequest(id: number, userId: number): Promise<boolean> {
  const rows = await db
    .delete(leaveRequests)
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'DRAFT')))
    .returning({ id: leaveRequests.id })
  return rows.length > 0
}

export async function getOwnLeaveRequestById(id: number, userId: number) {
  const [row] = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.userId, userId)))
  return row ?? null
}

// applyTransition(기존 순수 함수)이 상태 전이 자체의 유효성(DRAFT→PENDING, PENDING→CANCELED 등)을
// 검증하고, 잘못된 전이면 Error를 던진다 — 호출부(API 라우트)가 그 Error를 잡아 400으로 응답한다.
export async function transitionOwnLeaveRequest(
  id: number,
  userId: number,
  action: 'SUBMIT' | 'CANCEL'
): Promise<{ status: LeaveRequestStatus } | null> {
  const row = await getOwnLeaveRequestById(id, userId)
  if (!row) return null
  const nextStatus = applyTransition(row.status as LeaveRequestStatus, action, 'REQUESTER')
  await db
    .update(leaveRequests)
    .set({
      status: nextStatus,
      submittedAt: action === 'SUBMIT' ? new Date() : row.submittedAt,
    })
    .where(eq(leaveRequests.id, id))
  return { status: nextStatus }
}

// POST(신규 제출)와 PATCH(기존 DRAFT 제출) 양쪽에서 재사용하는 제출 시점 검증 — 잔여연차
// 초과면 차단(에러), 기간이 겹치면 경고만 반환하고 차단하지 않는다(원 설계 문서 6장).
export async function checkSubmissionEligibility(
  userId: number,
  startDate: string,
  endDate: string,
  requestedDays: number
): Promise<{ ok: true; overlapWarning: boolean } | { ok: false; error: string }> {
  const [me] = await db.select({ hireDate: users.hireDate }).from(users).where(eq(users.id, userId))
  if (!me?.hireDate) {
    return { ok: false, error: '입사일이 등록되지 않아 신청할 수 없습니다.' }
  }
  const today = new Date().toISOString().slice(0, 10)
  const balance = await getLeaveBalance(userId, me.hireDate, today)
  if (requestedDays > balance.remaining) {
    return { ok: false, error: '잔여 연차를 초과하여 제출할 수 없습니다.' }
  }
  const existing = await getOwnActiveRequestRanges(userId)
  const overlapWarning = hasOverlappingActiveRequest(existing, startDate, endDate)
  return { ok: true, overlapWarning }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음(특히 `applyTransition`의 `LeaveRequestStatus`가 `leaveRequests.status`
컬럼(varchar)과 캐스팅 없이 맞물리는지 확인)

- [ ] **Step 3: 커밋**

```bash
git add lib/db/leave-requests.ts
git commit -m "feat: 연차 신청 생성/수정/삭제/상태전이 데이터 계층 추가"
```

---

### Task 5: `requireFreelancer` 헬퍼 + 결재자 목록 API 개방 + `GET /api/documents`

**배경**: 신청서에서 결재자를 고르려면 결재자 목록이 필요한데, 기존 `GET /api/admin/approvers`는
`requireSuperAdmin()`으로 막혀 있어 프리랜서가 호출할 수 없다. 이 화면 전용의 별도 엔드포인트를
새로 만드는 대신, 이 목록 자체는 민감 정보가 아니므로(이름/이메일) 접근 조건을 "로그인 승인된
사용자"로 완화한다.

**Files:**
- Modify: `lib/auth/session.ts`
- Modify: `app/api/admin/approvers/route.ts`
- Create: `app/api/documents/route.ts` (이번 Step에서는 GET만 작성, POST는 Task 6)

**Interfaces:**
- Consumes: `lib/db/leave-requests.ts`의 `getMyDocumentSummary`/`getMyDocumentTimeline`,
  `lib/db/holidays.ts`의 `getHolidayDates`.
- Produces: `requireFreelancer()`(세션 헬퍼, Task 6·7·8이 소비), `GET /api/documents` 응답
  `{ summary: MyDocumentSummary, timeline: MyDocumentEntry[], holidayDates: string[] }`.

- [ ] **Step 1: `requireFreelancer` 헬퍼 추가**

```ts
// lib/auth/session.ts — requireApproverOrAbove 함수 다음에 추가
export async function requireFreelancer() {
  const session = await requireApprovedUser()
  if ((session.user as { role?: string }).role !== 'FREELANCER') {
    throw new ForbiddenError('프리랜서만 접근할 수 있습니다.')
  }
  return session
}
```

- [ ] **Step 2: 결재자 목록 API 접근 조건 완화**

```ts
// app/api/admin/approvers/route.ts — requireSuperAdmin import/호출을 requireApprovedUser로 교체
import { and, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireApprovedUser, toAuthErrorResponse } from '@/lib/auth/session'

export async function GET() {
  try {
    await requireApprovedUser()
    const list = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(and(inArray(users.role, ['APPROVER', 'SUPER_ADMIN']), eq(users.signupStatus, 'APPROVED')))
    return NextResponse.json(list)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

- [ ] **Step 3: `GET /api/documents` 작성**

```ts
// app/api/documents/route.ts (신규)
import { NextResponse } from 'next/server'
import { requireFreelancer, toAuthErrorResponse } from '@/lib/auth/session'
import { getHolidayDates } from '@/lib/db/holidays'
import { getMyDocumentSummary, getMyDocumentTimeline } from '@/lib/db/leave-requests'

export async function GET() {
  try {
    const session = await requireFreelancer()
    const userId = Number((session.user as { id?: string }).id)

    const [summary, timeline, holidayDates] = await Promise.all([
      getMyDocumentSummary(userId),
      getMyDocumentTimeline(userId),
      getHolidayDates(),
    ])

    return NextResponse.json({ summary, timeline, holidayDates: [...holidayDates] })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 수동 검증**

`npm run dev` 실행 후 FREELANCER 계정으로 로그인해 개발자 도구에서
`fetch('/api/documents').then(r => r.json()).then(console.log)`를 실행 — `summary`(입사일이
있는 계정이면 발생/사용/잔여가 채워짐), `timeline`(기존 연차 발생 내역이 있다면 표시됨),
`holidayDates`(빈 배열이어도 정상)가 반환되는지 확인. APPROVER/SUPER_ADMIN 계정으로는 403이
반환되는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add lib/auth/session.ts app/api/admin/approvers/route.ts app/api/documents/route.ts
git commit -m "feat: 내 문서 요약/타임라인 조회 API 및 결재자 목록 API 접근 완화"
```

---

### Task 6: `POST /api/documents` — 신규 작성(임시저장/제출)

**Files:**
- Modify: `app/api/documents/route.ts`

**Interfaces:**
- Consumes: `lib/domain/leave-day-count.ts`의 `calculateRequestedDays`(기존),
  `lib/db/leave-requests.ts`의 `createLeaveRequest`/`checkSubmissionEligibility`,
  `lib/db/holidays.ts`의 `getHolidayDates`.
- Produces: `POST /api/documents` — 요청 바디
  `{ action: 'save' | 'submit', title, approverId, startDate, endDate, type, reason }`, 응답
  `{ ok: true, id, requestedDays, overlapWarning }`. `LeaveRequestSheet`(Task 9)가 호출한다.

- [ ] **Step 1: POST 핸들러 추가**

```ts
// app/api/documents/route.ts — 기존 GET 아래에 추가
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { calculateRequestedDays } from '@/lib/domain/leave-day-count'
import { checkSubmissionEligibility, createLeaveRequest } from '@/lib/db/leave-requests'

const bodySchema = z.object({
  action: z.enum(['save', 'submit']),
  title: z.string().min(1),
  approverId: z.number(),
  startDate: z.string(),
  endDate: z.string(),
  type: z.enum(['FULL', 'AM_HALF', 'PM_HALF']),
  reason: z.string().min(1),
})

export async function POST(request: Request) {
  try {
    const session = await requireFreelancer()
    const userId = Number((session.user as { id?: string }).id)

    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const body = parsed.data

    if (body.type !== 'FULL' && body.startDate !== body.endDate) {
      return NextResponse.json({ error: '반차는 시작일과 종료일이 같아야 합니다.' }, { status: 400 })
    }

    const [approver] = await db.select().from(users).where(eq(users.id, body.approverId))
    if (!approver || (approver.role !== 'APPROVER' && approver.role !== 'SUPER_ADMIN')) {
      return NextResponse.json({ error: '유효하지 않은 결재자입니다.' }, { status: 400 })
    }

    const holidayDates = await getHolidayDates()
    const requestedDays = calculateRequestedDays(body.startDate, body.endDate, body.type, holidayDates)

    let overlapWarning = false
    if (body.action === 'submit') {
      const eligibility = await checkSubmissionEligibility(userId, body.startDate, body.endDate, requestedDays)
      if (!eligibility.ok) {
        return NextResponse.json({ error: eligibility.error }, { status: 400 })
      }
      overlapWarning = eligibility.overlapWarning
    }

    const created = await createLeaveRequest(
      userId,
      {
        title: body.title,
        approverId: body.approverId,
        startDate: body.startDate,
        endDate: body.endDate,
        type: body.type,
        requestedDays,
        reason: body.reason,
      },
      body.action === 'submit' ? 'PENDING' : 'DRAFT'
    )

    return NextResponse.json({ ok: true, id: created.id, requestedDays, overlapWarning })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 수동 검증(curl)**

로그인 쿠키를 복사해 사용(FREELANCER 계정, 유효한 `approverId`로 교체):

```bash
# 임시저장 -> 200, status DRAFT로 저장됨(DB에서 확인)
curl -i -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=<복사한 값>" \
  -d '{"action":"save","title":"테스트","approverId":<결재자ID>,"startDate":"2026-09-10","endDate":"2026-09-10","type":"FULL","reason":"테스트"}'

# 잔여연차 초과 시 제출 -> 400 "잔여 연차를 초과하여 제출할 수 없습니다."
# (잔여연차보다 긴 기간으로 action:"submit" 호출)

# 반차인데 시작일!=종료일 -> 400 "반차는 시작일과 종료일이 같아야 합니다."
```

- [ ] **Step 4: 커밋**

```bash
git add app/api/documents/route.ts
git commit -m "feat: 연차 신청 임시저장/제출 API 추가"
```

---

### Task 7: `PATCH /api/documents/[id]` — DRAFT 수정/제출, PENDING 취소

**Files:**
- Create: `app/api/documents/[id]/route.ts` (이번 Step에서는 PATCH만, DELETE는 Task 8)

**Interfaces:**
- Consumes: Task 4·6과 동일한 `lib/db/leave-requests.ts` 함수들 +
  `transitionOwnLeaveRequest`/`updateDraftLeaveRequest`.
- Produces: `PATCH /api/documents/[id]` — 바디 `{ action: 'save' | 'submit', title, approverId,
  startDate, endDate, type, reason }` 또는 `{ action: 'cancel' }`. 응답
  `{ ok: true, status, requestedDays?, overlapWarning? }`.

- [ ] **Step 1: PATCH 핸들러 작성**

```ts
// app/api/documents/[id]/route.ts (신규)
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireFreelancer, toAuthErrorResponse } from '@/lib/auth/session'
import { getHolidayDates } from '@/lib/db/holidays'
import { calculateRequestedDays } from '@/lib/domain/leave-day-count'
import {
  checkSubmissionEligibility,
  transitionOwnLeaveRequest,
  updateDraftLeaveRequest,
} from '@/lib/db/leave-requests'

const editFieldsSchema = z.object({
  title: z.string().min(1),
  approverId: z.number(),
  startDate: z.string(),
  endDate: z.string(),
  type: z.enum(['FULL', 'AM_HALF', 'PM_HALF']),
  reason: z.string().min(1),
})

const patchSchema = z.discriminatedUnion('action', [
  editFieldsSchema.extend({ action: z.literal('save') }),
  editFieldsSchema.extend({ action: z.literal('submit') }),
  z.object({ action: z.literal('cancel') }),
])

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireFreelancer()
    const userId = Number((session.user as { id?: string }).id)
    const { id } = await params
    const requestId = Number(id)
    if (!Number.isInteger(requestId)) {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
    }

    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const parsed = patchSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const body = parsed.data

    if (body.action === 'cancel') {
      try {
        const result = await transitionOwnLeaveRequest(requestId, userId, 'CANCEL')
        if (!result) {
          return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
        }
        return NextResponse.json({ ok: true, status: result.status })
      } catch (error) {
        const message = error instanceof Error ? error.message : '처리할 수 없습니다.'
        return NextResponse.json({ error: message }, { status: 400 })
      }
    }

    if (body.type !== 'FULL' && body.startDate !== body.endDate) {
      return NextResponse.json({ error: '반차는 시작일과 종료일이 같아야 합니다.' }, { status: 400 })
    }

    const [approver] = await db.select().from(users).where(eq(users.id, body.approverId))
    if (!approver || (approver.role !== 'APPROVER' && approver.role !== 'SUPER_ADMIN')) {
      return NextResponse.json({ error: '유효하지 않은 결재자입니다.' }, { status: 400 })
    }

    const holidayDates = await getHolidayDates()
    const requestedDays = calculateRequestedDays(body.startDate, body.endDate, body.type, holidayDates)

    const updated = await updateDraftLeaveRequest(requestId, userId, {
      title: body.title,
      approverId: body.approverId,
      startDate: body.startDate,
      endDate: body.endDate,
      type: body.type,
      requestedDays,
      reason: body.reason,
    })
    if (!updated) {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (body.action === 'save') {
      return NextResponse.json({ ok: true, status: 'DRAFT', requestedDays })
    }

    const eligibility = await checkSubmissionEligibility(userId, body.startDate, body.endDate, requestedDays)
    if (!eligibility.ok) {
      return NextResponse.json({ error: eligibility.error }, { status: 400 })
    }
    try {
      const result = await transitionOwnLeaveRequest(requestId, userId, 'SUBMIT')
      if (!result) {
        return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
      }
      return NextResponse.json({
        ok: true,
        status: result.status,
        requestedDays,
        overlapWarning: eligibility.overlapWarning,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '처리할 수 없습니다.'
      return NextResponse.json({ error: message }, { status: 400 })
    }
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 수동 검증(curl)**

```bash
# DRAFT 수정 재저장 -> 200
curl -i -X PATCH http://localhost:3000/api/documents/<DRAFT문서ID> \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=<복사한 값>" \
  -d '{"action":"save","title":"수정됨","approverId":<결재자ID>,"startDate":"2026-09-11","endDate":"2026-09-11","type":"FULL","reason":"수정 테스트"}'

# DRAFT 제출 -> 200, status PENDING으로 바뀜(DB 확인)
curl -i -X PATCH http://localhost:3000/api/documents/<DRAFT문서ID> \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=<복사한 값>" \
  -d '{"action":"submit","title":"수정됨","approverId":<결재자ID>,"startDate":"2026-09-11","endDate":"2026-09-11","type":"FULL","reason":"수정 테스트"}'

# PENDING 취소 -> 200, status CANCELED로 바뀜
curl -i -X PATCH http://localhost:3000/api/documents/<PENDING문서ID> \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=<복사한 값>" \
  -d '{"action":"cancel"}'

# 이미 APPROVED인 문서를 cancel 시도 -> 400(applyTransition이 던지는 에러 메시지)
```

- [ ] **Step 4: 커밋**

```bash
git add "app/api/documents/[id]/route.ts"
git commit -m "feat: 연차 신청 DRAFT 수정/제출, 대기 문서 취소 API 추가"
```

---

### Task 8: `DELETE /api/documents/[id]` — DRAFT 삭제

**Files:**
- Modify: `app/api/documents/[id]/route.ts`

**Interfaces:**
- Consumes: `lib/db/leave-requests.ts`의 `deleteDraftLeaveRequest`.
- Produces: `DELETE /api/documents/[id]` — 응답 `{ ok: true }` 또는 404.

- [ ] **Step 1: DELETE 핸들러 추가**

```ts
// app/api/documents/[id]/route.ts — 파일 맨 아래에 추가
import { deleteDraftLeaveRequest } from '@/lib/db/leave-requests'
// (기존 import 블록에 deleteDraftLeaveRequest 추가)

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireFreelancer()
    const userId = Number((session.user as { id?: string }).id)
    const { id } = await params
    const requestId = Number(id)
    if (!Number.isInteger(requestId)) {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
    }

    const deleted = await deleteDraftLeaveRequest(requestId, userId)
    if (!deleted) {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 수동 검증(curl)**

```bash
# DRAFT 삭제 -> 200
curl -i -X DELETE http://localhost:3000/api/documents/<DRAFT문서ID> \
  -H "Cookie: authjs.session-token=<복사한 값>"

# PENDING/APPROVED 문서 삭제 시도 -> 404(조건에 안 맞아 삭제되지 않음)
```

- [ ] **Step 4: 커밋**

```bash
git add "app/api/documents/[id]/route.ts"
git commit -m "feat: 임시저장 문서 삭제 API 추가"
```

---

### Task 9: `LeaveRequestSheet` 컴포넌트 (작성/수정/상세 겸용)

**Files:**
- Create: `components/leave-request-sheet.tsx`

**Interfaces:**
- Consumes: `components/ui/sheet.tsx`의 `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle`/
  `SheetDescription`/`SheetFooter`(기존), `components/approver-combobox.tsx`의
  `ApproverCombobox`(기존), `components/date-picker.tsx`의 `DatePicker`(기존),
  `components/ui/select.tsx`의 `Select`류(기존), `components/ui/textarea.tsx`의 `Textarea`(기존),
  `components/ui/badge.tsx`의 `Badge`(기존), `lib/domain/leave-day-count.ts`의
  `calculateRequestedDays`(기존, 클라이언트에서 실시간 미리보기 계산에 사용).
- Produces: `LeaveRequestSheet` — Task 10의 `app/documents/page.tsx`가 소비한다.

```ts
interface LeaveRequestSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'view'
  document: MyRequestDocument | null // mode==='view'일 때만 사용
  requesterName: string // 원 설계 문서 6장 "신청인(자동 표시, 읽기전용)"
  approvers: { id: number; name: string; email: string }[]
  defaultApproverId: number | null
  remaining: number
  holidayDates: string[]
  onSaved: () => void // 저장/제출/취소/삭제 성공 시 부모가 목록을 새로고침하도록 호출
}
```

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// components/leave-request-sheet.tsx (신규)
'use client'

import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/date-picker'
import { ApproverCombobox } from '@/components/approver-combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { calculateRequestedDays, type LeaveType } from '@/lib/domain/leave-day-count'

export interface MyRequestDocument {
  id: number
  title: string
  startDate: string
  endDate: string
  type: LeaveType
  requestedDays: number
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED'
  reason: string
  approverId: number
  approverName: string | null
  rejectReason: string | null
}

interface Approver {
  id: number
  name: string
  email: string
}

interface LeaveRequestSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'view'
  document: MyRequestDocument | null
  requesterName: string
  approvers: Approver[]
  defaultApproverId: number | null
  remaining: number
  holidayDates: string[]
  onSaved: () => void
}

const TYPE_LABEL: Record<LeaveType, string> = {
  FULL: '연차',
  AM_HALF: '오전 반차',
  PM_HALF: '오후 반차',
}

const STATUS_LABEL: Record<MyRequestDocument['status'], string> = {
  DRAFT: '임시저장',
  PENDING: '대기',
  APPROVED: '승인완료',
  REJECTED: '반려',
  CANCELED: '취소',
}

export function LeaveRequestSheet({
  open,
  onOpenChange,
  mode,
  document,
  requesterName,
  approvers,
  defaultApproverId,
  remaining,
  holidayDates,
  onSaved,
}: LeaveRequestSheetProps) {
  const [title, setTitle] = useState('')
  const [approverId, setApproverId] = useState<number | null>(null)
  const [type, setType] = useState<LeaveType>('FULL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [overlapWarning, setOverlapWarning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  const holidaySet = new Set(holidayDates)
  const canEditFields = mode === 'create' || (mode === 'view' && document?.status === 'DRAFT' && editing)
  const isExistingDraft = mode === 'view' && document?.status === 'DRAFT'

  useEffect(() => {
    if (!open) return
    setError(null)
    setOverlapWarning(false)
    setEditing(false)
    if (mode === 'create') {
      setTitle('')
      setApproverId(defaultApproverId)
      setType('FULL')
      setStartDate('')
      setEndDate('')
      setReason('')
    } else if (document) {
      setTitle(document.title)
      setApproverId(document.approverId)
      setType(document.type)
      setStartDate(document.startDate)
      setEndDate(document.endDate)
      setReason(document.reason)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, document])

  let requestedDays = 0
  try {
    requestedDays = startDate && endDate ? calculateRequestedDays(startDate, endDate, type, holidaySet) : 0
  } catch {
    requestedDays = 0
  }

  function handleTypeChange(next: LeaveType) {
    setType(next)
    if (next !== 'FULL') setEndDate(startDate)
  }

  function handleStartDateChange(value: string) {
    setStartDate(value)
    if (type !== 'FULL') setEndDate(value)
  }

  async function submitForm(action: 'save' | 'submit') {
    setError(null)
    setSubmitting(true)
    try {
      const body = { action, title, approverId, startDate, endDate, type, reason }
      const url = mode === 'create' ? '/api/documents' : `/api/documents/${document!.id}`
      const method = mode === 'create' ? 'POST' : 'PATCH'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? '처리에 실패했습니다.')
        return
      }
      if (data?.overlapWarning) setOverlapWarning(true)
      onSaved()
      if (action === 'submit') onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!document) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/documents/${document.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? '삭제에 실패했습니다.')
        return
      }
      setDeleteConfirmOpen(false)
      onSaved()
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel() {
    if (!document) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/documents/${document.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? '취소에 실패했습니다.')
        return
      }
      setCancelConfirmOpen(false)
      onSaved()
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = title.length > 0 && approverId !== null && startDate.length > 0 && endDate.length > 0 && reason.length > 0

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{mode === 'create' ? '연차 신청' : title}</SheetTitle>
            <SheetDescription>
              {mode === 'view' && document ? (
                <Badge variant="outline">{STATUS_LABEL[document.status]}</Badge>
              ) : (
                '결재자를 지정하고 연차를 신청합니다.'
              )}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label>신청인</Label>
              <Input value={requesterName} disabled readOnly />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-title">제목</Label>
              <Input
                id="leave-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!canEditFields}
              />
            </div>
            <div className="space-y-1.5">
              <Label>결재자</Label>
              <ApproverCombobox
                value={approverId}
                approvers={approvers}
                onChange={setApproverId}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label>유형</Label>
              <Select value={type} onValueChange={(v) => handleTypeChange(v as LeaveType)} disabled={!canEditFields}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL">연차</SelectItem>
                  <SelectItem value="AM_HALF">오전 반차</SelectItem>
                  <SelectItem value="PM_HALF">오후 반차</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type === 'FULL' ? (
              <div className="flex gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label>시작일</Label>
                  <DatePicker value={startDate} onChange={handleStartDateChange} disabled={!canEditFields} className="w-full" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label>종료일</Label>
                  <DatePicker value={endDate} onChange={setEndDate} minDate={startDate || undefined} disabled={!canEditFields} className="w-full" />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>날짜</Label>
                <DatePicker value={startDate} onChange={handleStartDateChange} disabled={!canEditFields} className="w-full" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">신청일수</p>
                <p>{requestedDays}일</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">잔여연차</p>
                <p>{remaining}일</p>
              </div>
            </div>
            {overlapWarning && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                같은 기간에 이미 대기 또는 승인된 신청이 있습니다.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="leave-reason">사유</Label>
              <Textarea
                id="leave-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={!canEditFields}
              />
            </div>
            {mode === 'view' && document?.status === 'REJECTED' && document.rejectReason && (
              <p className="text-sm text-destructive">반려 사유: {document.rejectReason}</p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <SheetFooter>
            {mode === 'create' && (
              <>
                <Button variant="outline" onClick={() => submitForm('save')} disabled={submitting || !canSubmit}>
                  임시저장
                </Button>
                <Button onClick={() => submitForm('submit')} disabled={submitting || !canSubmit}>
                  제출
                </Button>
              </>
            )}
            {isExistingDraft && !editing && (
              <>
                <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)} disabled={submitting}>
                  삭제
                </Button>
                <Button onClick={() => setEditing(true)}>수정</Button>
              </>
            )}
            {isExistingDraft && editing && (
              <>
                <Button variant="outline" onClick={() => submitForm('save')} disabled={submitting || !canSubmit}>
                  임시저장
                </Button>
                <Button onClick={() => submitForm('submit')} disabled={submitting || !canSubmit}>
                  제출
                </Button>
              </>
            )}
            {mode === 'view' && document?.status === 'PENDING' && (
              <Button variant="destructive" onClick={() => setCancelConfirmOpen(true)} disabled={submitting}>
                취소
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title="신청 취소"
        description="이 연차 신청을 취소하시겠습니까?"
        confirmLabel="취소하기"
        onConfirm={handleCancel}
        submitting={submitting}
        destructive
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="임시저장 삭제"
        description="이 임시저장 문서를 삭제하시겠습니까? 삭제하면 되돌릴 수 없습니다."
        confirmLabel="삭제"
        onConfirm={handleDelete}
        submitting={submitting}
        destructive
      />
    </>
  )
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add components/leave-request-sheet.tsx
git commit -m "feat: 연차 신청 작성/수정/상세 Sheet 컴포넌트 추가"
```

---

### Task 10: `app/documents/page.tsx` — 화면 조립

**Files:**
- Create: `app/documents/page.tsx`

**Interfaces:**
- Consumes: `GET /api/documents`(Task 5), `GET /api/admin/approvers`(Task 5에서 접근 완화),
  `components/leave-request-sheet.tsx`의 `LeaveRequestSheet`(Task 9),
  `components/loading-spinner.tsx`의 `LoadingSpinner`(기존), `components/page-header.tsx`의
  `PageHeader`(기존).
- Produces: `/documents` 라우트. 다른 태스크가 이 파일을 참조하지 않는다.

- [ ] **Step 1: 페이지 작성**

```tsx
// app/documents/page.tsx (신규)
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { SearchIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/loading-spinner'
import { PageHeader } from '@/components/page-header'
import { LeaveRequestSheet, type MyRequestDocument } from '@/components/leave-request-sheet'

interface MyDocumentSummary {
  hireDate: string | null
  yearsOfService: number | null
  granted: number
  used: number
  remaining: number
  defaultApproverId: number | null
}

type TimelineEntry =
  | {
      kind: 'REQUEST'
      id: number
      date: string
      title: string
      startDate: string
      endDate: string
      type: 'FULL' | 'AM_HALF' | 'PM_HALF'
      requestedDays: number
      status: MyRequestDocument['status']
      reason: string
      approverId: number
      approverName: string | null
      rejectReason: string | null
    }
  | { kind: 'ADJUSTMENT'; date: string; detail: string; reason: string; actorName: string | null }

interface Approver {
  id: number
  name: string
  email: string
}

const TYPE_LABEL: Record<'FULL' | 'AM_HALF' | 'PM_HALF', string> = {
  FULL: '연차',
  AM_HALF: '오전 반차',
  PM_HALF: '오후 반차',
}

const STATUS_LABEL: Record<MyRequestDocument['status'], string> = {
  DRAFT: '임시저장',
  PENDING: '대기',
  APPROVED: '승인완료',
  REJECTED: '반려',
  CANCELED: '취소',
}

export default function DocumentsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const role = (session?.user as { role?: string } | undefined)?.role

  const [summary, setSummary] = useState<MyDocumentSummary | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [holidayDates, setHolidayDates] = useState<string[]>([])
  const [approvers, setApprovers] = useState<Approver[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<'create' | 'view'>('create')
  const [selectedDocument, setSelectedDocument] = useState<MyRequestDocument | null>(null)
  const [yearFilter, setYearFilter] = useState('all')
  const [titleSearch, setTitleSearch] = useState('')

  const yearOptions = useMemo(() => {
    const years = new Set(timeline.map((e) => e.date.slice(0, 4)))
    return [...years].sort((a, b) => (a < b ? 1 : -1))
  }, [timeline])

  const filteredTimeline = useMemo(() => {
    const query = titleSearch.toLowerCase()
    return timeline.filter((entry) => {
      if (yearFilter !== 'all' && entry.date.slice(0, 4) !== yearFilter) return false
      if (!query) return true
      const text = entry.kind === 'REQUEST' ? entry.title : entry.reason
      return text.toLowerCase().includes(query)
    })
  }, [timeline, yearFilter, titleSearch])

  useEffect(() => {
    if (session && role && role !== 'FREELANCER') {
      router.replace('/dashboard')
    }
  }, [session, role, router])

  function loadDocuments() {
    setLoading(true)
    fetch('/api/documents')
      .then((res) => {
        if (!res.ok) throw new Error('목록을 불러오지 못했습니다.')
        return res.json()
      })
      .then((data: { summary: MyDocumentSummary; timeline: TimelineEntry[]; holidayDates: string[] }) => {
        setSummary(data.summary)
        setTimeline(data.timeline)
        setHolidayDates(data.holidayDates)
      })
      .catch(() => setLoadError('목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadDocuments()
    fetch('/api/admin/approvers')
      .then((res) => res.json())
      .then(setApprovers)
  }, [])

  if (role && role !== 'FREELANCER') return null

  function openCreate() {
    setSheetMode('create')
    setSelectedDocument(null)
    setSheetOpen(true)
  }

  function openView(entry: TimelineEntry & { kind: 'REQUEST' }) {
    setSheetMode('view')
    setSelectedDocument({
      id: entry.id,
      title: entry.title,
      startDate: entry.startDate,
      endDate: entry.endDate,
      type: entry.type,
      requestedDays: entry.requestedDays,
      status: entry.status,
      reason: entry.reason,
      approverId: entry.approverId,
      approverName: entry.approverName,
      rejectReason: entry.rejectReason,
    })
    setSheetOpen(true)
  }

  return (
    <div className="w-full">
      <PageHeader
        title="내 문서"
        description="휴가현황과 연차 신청 내역을 확인하고 새 연차를 신청합니다."
        action={<Button onClick={openCreate}>+ 연차 신청</Button>}
      />

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : (
        <>
          <div className="mb-6 space-y-3 rounded-lg border p-4">
            <h2 className="font-medium">휴가현황</h2>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">입사일</p>
                <p>{summary?.hireDate ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">근속</p>
                <p>{summary?.yearsOfService ? `${summary.yearsOfService}년차` : '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">발생/사용</p>
                <p>{summary?.granted ?? 0}일 / {summary?.used ?? 0}일</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">잔여</p>
                <p>{summary?.remaining ?? 0}일</p>
              </div>
            </div>
          </div>

          <div className="mb-3 flex items-center justify-end gap-2">
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}년
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="제목 검색"
                value={titleSearch}
                onChange={(e) => setTitleSearch(e.target.value)}
                className="w-56 pl-8"
              />
            </div>
          </div>

          <div className="space-y-2">
            {filteredTimeline.length === 0 && <p className="text-sm text-muted-foreground">내역이 없습니다.</p>}
            {filteredTimeline.map((entry, index) =>
              entry.kind === 'REQUEST' ? (
                <button
                  key={`request-${entry.id}`}
                  type="button"
                  onClick={() => openView(entry)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-accent"
                >
                  <div>
                    <p className="font-medium">{entry.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {TYPE_LABEL[entry.type]} · {entry.startDate}
                      {entry.startDate !== entry.endDate ? ` ~ ${entry.endDate}` : ''} · {entry.requestedDays}일
                    </p>
                  </div>
                  <Badge variant="outline">{STATUS_LABEL[entry.status]}</Badge>
                </button>
              ) : (
                <div key={`adjustment-${index}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <div>
                    <p>{entry.reason}</p>
                    <p className="text-xs text-muted-foreground">{entry.date} · {entry.actorName ?? '-'}</p>
                  </div>
                  <span>{entry.detail}</span>
                </div>
              )
            )}
          </div>
        </>
      )}

      <LeaveRequestSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode={sheetMode}
        document={selectedDocument}
        requesterName={(session?.user as { name?: string } | undefined)?.name ?? ''}
        approvers={approvers}
        defaultApproverId={summary?.defaultApproverId ?? null}
        remaining={summary?.remaining ?? 0}
        holidayDates={holidayDates}
        onSaved={loadDocuments}
      />
    </div>
  )
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 수동 검증**

`npm run dev` 실행 후 FREELANCER 계정으로 로그인해 "내 문서" 메뉴로 이동:
1. 휴가현황 요약이 표시되는지 확인(입사일이 없는 계정이면 "-"로 표시).
2. "+ 연차 신청" 클릭 → Sheet가 열리고 결재자 기본값이 프리필되는지 확인.
3. 연차(FULL) 선택 시 시작일/종료일 두 필드, 반차 선택 시 단일 날짜 필드로 바뀌는지 확인.
4. 날짜를 고르면 "신청일수"가 즉시 갱신되는지 확인.
5. 임시저장 → 목록에 "임시저장" 배지로 나타나는지 확인.
6. 그 문서를 클릭 → 상세로 열림 → "수정" → 필드 변경 → "제출" → 목록에서 "대기"로 바뀌는지 확인.
7. "대기" 문서 클릭 → "취소" → 확인 다이얼로그 → 목록에서 "취소"로 바뀌는지 확인.
8. 새 임시저장 문서를 하나 더 만든 뒤 상세에서 "삭제" → 확인 다이얼로그 → 목록에서 사라지는지 확인.
9. 연도 필터를 다른 연도로 바꾸면 목록이 걸러지는지, 제목 검색에 존재하지 않는 단어를 입력하면
   "내역이 없습니다"가 표시되는지 확인.
10. APPROVER/SUPER_ADMIN 계정으로 `/documents` 직접 접근 시 `/dashboard`로 리다이렉트되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add app/documents/page.tsx
git commit -m "feat: 내 문서 화면(휴가현황 요약 + 통합 타임라인 + 연차 신청) 추가"
```

---

### Task 11: 통합 검증

**Files:** 없음(검증 전용 작업, 코드 변경 없음).

- [ ] **Step 1: 전체 Vitest 스위트 회귀 확인**

Run: `npm run test`
Expected: 기존 테스트 전부 + Task 2에서 추가한 테스트까지 모두 PASS.

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 전체 수동 QA 체크리스트**

스펙 문서(`docs/superpowers/specs/2026-09-02-my-documents-design.md`) 7절의 9개 항목을
FREELANCER 테스트 계정(입사일이 등록된 계정 + 아직 없는 계정 각 1개)으로 순서대로 확인하고,
실패 항목이 있으면 해당 Task로 돌아가 수정한다.

- [ ] **Step 4: 최종 보고**

체크리스트 결과와 `npm run test`/`tsc` 결과를 사용자에게 요약해 보고한다. 커밋은 이 작업
자체에서는 발생하지 않는다(검증 전용).
