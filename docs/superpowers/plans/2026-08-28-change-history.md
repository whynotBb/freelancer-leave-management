# 변경 이력 조회 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최고관리자가 사이트 전체 변경 이력(가입 승인/거절, 퇴사, 연차 발생/조정, 입사일 변경,
사용, 결재자 변경, 만근 예외)을 필터·페이지네이션과 함께 한 화면(`/admin/history`)에서 조회할
수 있게 한다.

**Architecture:** 가입 승인/거절/퇴사만 신규 `account_events` 테이블에 기록하고, 나머지(연차/
결재자/만근예외)는 기존 `leave_grants`/`leave_requests`/`approver_changes`/
`attendance_exceptions` 테이블과 기존 `buildHistoryTimeline` 분류 로직을 그대로 재사용한다.
사이트 전체 조회는 이 5개 소스를 필터 조건에 맞게 각각 조회한 뒤 병합·정렬하고, 새로 추가하는
순수 함수 `paginateHistory`로 카테고리 필터링과 페이지 슬라이스를 적용한다.

**Tech Stack:** Next.js (App Router), Drizzle ORM + Postgres, Zod 없이 쿼리 파라미터 파싱,
shadcn/ui(Select/Table/Badge), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-28-change-history-design.md`

## Global Constraints

- 변수명/함수명은 영어, 커밋 메시지/주석/문서는 한국어 (`CLAUDE.md`)
- 이 화면과 관련 API는 전부 최고관리자(SUPER_ADMIN) 전용이다 — 결재자는 열람 불가
- 프리랜서 도메인 이력(연차 발생/조정, 입사일 변경, 사용, 결재자 변경, 만근 예외)은 기존
  테이블·기존 `buildHistoryTimeline` 로직을 그대로 재사용한다 — 새 테이블에 따로 쓰지 않는다.
  프리랜서 상세 패널(`components/user-history-panel.tsx`)이 보여주는 내용과 반드시 일치해야
  한다
- `account_events`는 가입 승인/거절/퇴사 세 가지만 담는 좁은 테이블이다 — 범용 로그 테이블이
  아니다
- 퇴사자 완전삭제(`deleteDepartedUser`의 FREELANCER 분기) 시 `account_events`도 같은 트랜잭션
  안에서 함께 삭제해야 한다 — 안 하면 FK 제약으로 완전삭제 자체가 실패한다
- 이 저장소는 `app/`·API 라우트에 자동 테스트를 두지 않는 기존 관례를 따른다 — 순수 함수
  (`lib/domain/**`)는 Vitest로, DB/API 계층은 브라우저 + 직접 DB 조회로 수동 검증한다
- No Placeholders: 실제 동작하는 코드만, TODO/TBD 금지

---

### Task 1: DB 스키마 — `account_events` 테이블 추가 + 마이그레이션

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `drizzle/0005_<generated-name>.sql` (drizzle-kit generate로 자동 생성)

**Interfaces:**
- Consumes: 없음
- Produces: `accountEvents` 테이블(drizzle 스키마 객체) — 컬럼 `id, userId, actorId, action,
  role, hireDate, reason, createdAt`. Task 3/4/5가 이 테이블을 import해서 쓴다.

- [ ] **Step 1: 스키마에 테이블 추가**

`lib/db/schema.ts` 파일 끝(`attendanceExceptions` 정의 다음)에 추가한다:

```ts
export const accountEvents = pgTable('account_events', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id), // 대상 계정
  actorId: integer('actor_id').notNull().references(() => users.id), // 처리한 관리자
  action: varchar('action', { length: 20 }).notNull(), // 'SIGNUP_APPROVED' | 'SIGNUP_REJECTED' | 'RESIGNED'
  role: varchar('role', { length: 20 }), // SIGNUP_APPROVED일 때만: 'FREELANCER' | 'APPROVER'
  hireDate: date('hire_date', { mode: 'string' }), // SIGNUP_APPROVED + role='FREELANCER'일 때만
  reason: text('reason'), // RESIGNED일 때만 — 퇴사 사유 스냅샷(users.resignReason은 복구 후
                           // 재퇴사하면 덮어써지므로 과거 시점 값을 여기 별도로 남긴다)
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

이 파일 상단 import 줄(`boolean, date, integer, numeric, pgTable, serial, text, timestamp,
uniqueIndex, varchar`)에는 이미 필요한 함수(`date`, `integer`, `pgTable`, `serial`, `text`,
`timestamp`, `varchar`)가 전부 포함되어 있으므로 import 수정은 필요 없다.

- [ ] **Step 2: 마이그레이션 생성**

Run: `npx drizzle-kit generate --name account-events`

Expected: `drizzle/0005_account-events.sql` 생성. 다음과 의미가 같은 내용이어야 한다(정확한
공백/줄바꿈은 drizzle-kit 버전에 따라 다를 수 있음):

```sql
CREATE TABLE "account_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"actor_id" integer NOT NULL,
	"action" varchar(20) NOT NULL,
	"role" varchar(20),
	"hire_date" date,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_events" ADD CONSTRAINT "account_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_events" ADD CONSTRAINT "account_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
```

- [ ] **Step 3: 마이그레이션 적용**

Run: `npx dotenv -e .env.local -- npx drizzle-kit migrate`
Expected: 에러 없이 완료.

```bash
npx dotenv -e .env.local -- node -e "
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING);
sql\`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='account_events' ORDER BY ordinal_position\`.then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `id, user_id, actor_id, action, role, hire_date, reason, created_at` 8개 컬럼이 출력됨.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat: 가입 승인/거절/퇴사 이력 저장용 account_events 테이블 추가"
```

---

### Task 2: 도메인 로직 확장 — 이력 카테고리·대상 필드·페이지네이션

**Files:**
- Modify: `lib/domain/user-history.ts`
- Modify: `lib/domain/user-history.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수, DB 의존 없음)
- Produces:
  - `HistoryEntry.category`에 `'가입 승인' | '가입 거절' | '퇴사'` 추가
  - `HistoryEntry`, `GrantHistoryRow`, `UsageHistoryRow`, `ApproverChangeHistoryRow`,
    `AttendanceExceptionHistoryRow`에 선택 필드 `targetUserId?: number`,
    `targetUserName?: string` 추가
  - 신규 `AccountEventHistoryRow` 인터페이스
  - `buildHistoryTimeline`에 5번째 선택 파라미터 `accountEvents?: AccountEventHistoryRow[]` 추가
  - 신규 `HistoryFilters { category?: HistoryEntry['category']; page: number; pageSize: number }`,
    `HistoryPage { items: HistoryEntry[]; total: number; page: number; pageSize: number }`,
    `paginateHistory(entries: HistoryEntry[], filters: HistoryFilters): HistoryPage`
  - Task 5가 이 파일의 타입과 함수를 그대로 import해서 쓴다.

기존 4개 소스(연차 자동 발생/조정, 사용, 결재자 변경, 만근 예외)의 분류 규칙과 기존 테스트는
그대로 유지한다 — 이번 확장은 순수 추가(additive)다.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/domain/user-history.test.ts` 파일 끝(마지막 `it(...)` 블록 다음, `describe`가 닫히기
전)에 추가한다:

```ts
  it('SIGNUP_APPROVED(FREELANCER) 행은 "가입 승인"으로 분류하고 detail에 입사일을 포함한다', () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [],
      approverChanges: [],
      accountEvents: [
        {
          action: 'SIGNUP_APPROVED',
          role: 'FREELANCER',
          hireDate: '2026-08-28',
          reason: null,
          actorName: '관리자',
          createdAt: '2026-08-28T00:30:00.000Z',
        },
      ],
    })
    expect(result).toEqual([
      {
        category: '가입 승인',
        date: '2026-08-28 09:30',
        detail: '프리랜서 승인 (입사일 2026-08-28)',
        reason: '-',
        actorName: '관리자',
        targetUserId: undefined,
        targetUserName: undefined,
      },
    ])
  })

  it('SIGNUP_APPROVED(APPROVER) 행은 detail이 "결재자 승인"이다', () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [],
      approverChanges: [],
      accountEvents: [
        {
          action: 'SIGNUP_APPROVED',
          role: 'APPROVER',
          hireDate: null,
          reason: null,
          actorName: '관리자',
          createdAt: '2026-08-28T00:30:00.000Z',
        },
      ],
    })
    expect(result[0].category).toBe('가입 승인')
    expect(result[0].detail).toBe('결재자 승인')
  })

  it('SIGNUP_REJECTED 행은 "가입 거절"로 분류하고 detail은 "-"이다', () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [],
      approverChanges: [],
      accountEvents: [
        {
          action: 'SIGNUP_REJECTED',
          role: null,
          hireDate: null,
          reason: null,
          actorName: '관리자',
          createdAt: '2026-08-28T01:00:00.000Z',
        },
      ],
    })
    expect(result[0]).toEqual({
      category: '가입 거절',
      date: '2026-08-28 10:00',
      detail: '-',
      reason: '-',
      actorName: '관리자',
      targetUserId: undefined,
      targetUserName: undefined,
    })
  })

  it('RESIGNED 행은 "퇴사"로 분류하고 reason에 퇴사 사유 스냅샷이 그대로 담긴다', () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [],
      approverChanges: [],
      accountEvents: [
        {
          action: 'RESIGNED',
          role: null,
          hireDate: null,
          reason: '계약 종료',
          actorName: '관리자',
          createdAt: '2026-08-28T02:00:00.000Z',
        },
      ],
    })
    expect(result[0].category).toBe('퇴사')
    expect(result[0].reason).toBe('계약 종료')
  })

  it('targetUserId/targetUserName이 있으면 결과에 그대로 포함된다', () => {
    const result = buildHistoryTimeline({
      grants: [
        {
          grantDate: '2026-04-01',
          amount: 1,
          note: null,
          createdBy: null,
          createdByName: null,
          createdAt: '2026-04-01T00:00:00.000Z',
          targetUserId: 7,
          targetUserName: '김프리랜서',
        },
      ],
      usages: [],
      approverChanges: [],
    })
    expect(result[0].targetUserId).toBe(7)
    expect(result[0].targetUserName).toBe('김프리랜서')
  })
})

describe('paginateHistory', () => {
  const entries: HistoryEntry[] = Array.from({ length: 5 }, (_, i) => ({
    category: i % 2 === 0 ? '연차 조정' : '만근 예외',
    date: `2026-08-0${i + 1} 09:00`,
    detail: `detail-${i}`,
    reason: '-',
    actorName: null,
  }))

  it('category 필터가 있으면 해당 카테고리만 남긴다', () => {
    const result = paginateHistory(entries, { category: '만근 예외', page: 1, pageSize: 10 })
    expect(result.total).toBe(2)
    expect(result.items.every((e) => e.category === '만근 예외')).toBe(true)
  })

  it('pageSize만큼 슬라이스하고 total은 필터링된 전체 개수를 반환한다', () => {
    const result = paginateHistory(entries, { page: 1, pageSize: 2 })
    expect(result.total).toBe(5)
    expect(result.items).toHaveLength(2)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(2)
  })

  it('page 2는 다음 슬라이스를 반환한다', () => {
    const result = paginateHistory(entries, { page: 2, pageSize: 2 })
    expect(result.items.map((e) => e.detail)).toEqual(['detail-2', 'detail-3'])
  })
```

파일 맨 위 import 줄을 다음으로 교체한다(테스트 대상 함수 추가):

```ts
import { describe, expect, it } from 'vitest'
import { buildHistoryTimeline, paginateHistory, type HistoryEntry } from './user-history'
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `npx vitest run lib/domain/user-history.test.ts`
Expected: FAIL — `accountEvents`/`paginateHistory`가 아직 없어서 타입 에러 또는 참조 에러

- [ ] **Step 3: 구현**

`lib/domain/user-history.ts` 파일 전체를 아래 내용으로 교체한다:

```ts
import { addMonthsISO } from './date-utils'

export interface GrantHistoryRow {
  grantDate: string
  amount: number
  note: string | null
  createdBy: number | null
  createdByName: string | null
  createdAt: string
  targetUserId?: number
  targetUserName?: string
}

export interface UsageHistoryRow {
  startDate: string
  requestedDays: number
  reason: string
  type: string
  approverName: string | null
  createdAt: string
  targetUserId?: number
  targetUserName?: string
}

export interface ApproverChangeHistoryRow {
  createdAt: string
  beforeApproverName: string | null
  afterApproverName: string
  reason: string
  changedByName: string
  targetUserId?: number
  targetUserName?: string
}

export interface AttendanceExceptionHistoryRow {
  periodStart: string
  reason: string
  createdByName: string | null
  createdAt: string
  targetUserId?: number
  targetUserName?: string
}

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

export interface HistoryEntry {
  category:
    | '연차 자동 발생'
    | '연차 조정'
    | '사용'
    | '결재자 변경'
    | '입사일 변경'
    | '만근 예외'
    | '가입 승인'
    | '가입 거절'
    | '퇴사'
  date: string
  detail: string
  reason: string
  actorName: string | null
  targetUserId?: number
  targetUserName?: string
}

interface SortableEntry {
  entry: HistoryEntry
  sortKey: string
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

// DB의 timestamp는 UTC로 저장되므로, 표시 직전에 KST(UTC+9, 서머타임 없음)로 변환한다.
// Date.prototype.get*(로컬 타임존 기준) 대신 getUTC*를 써서 실행 환경의 시스템 타임존과
// 무관하게 항상 동일한 결과가 나오도록 한다.
function formatDateTime(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`
}

function formatAmount(amount: number): string {
  return amount > 0 ? `+${amount}일` : `${amount}일`
}

export function buildHistoryTimeline(params: {
  grants: GrantHistoryRow[]
  usages: UsageHistoryRow[]
  approverChanges: ApproverChangeHistoryRow[]
  exceptions?: AttendanceExceptionHistoryRow[]
  accountEvents?: AccountEventHistoryRow[]
}): HistoryEntry[] {
  const grantEntries: SortableEntry[] = params.grants.map((g) => {
    const isAutoGrant = g.createdBy === null
    const category = isAutoGrant ? '연차 자동 발생' : g.amount === 0 ? '입사일 변경' : '연차 조정'
    return {
      entry: {
        category,
        date: formatDateTime(g.createdAt),
        detail: category === '입사일 변경' ? '-' : formatAmount(g.amount),
        reason: g.note ?? '-',
        // 자동 발생 배치는 createdBy를 남기지 않으므로(사람이 아닌 시스템 처리) 처리자를 "시스템"으로 표시한다.
        actorName: isAutoGrant ? '시스템' : g.createdByName,
        targetUserId: g.targetUserId,
        targetUserName: g.targetUserName,
      },
      sortKey: g.createdAt,
    }
  })

  const usageEntries: SortableEntry[] = params.usages.map((u) => ({
    entry: {
      category: u.type === 'ADJUSTMENT' ? '연차 조정' : '사용',
      date: formatDateTime(u.createdAt),
      detail: formatAmount(u.requestedDays),
      reason: u.reason,
      actorName: u.approverName,
      targetUserId: u.targetUserId,
      targetUserName: u.targetUserName,
    },
    sortKey: u.createdAt,
  }))

  const approverChangeEntries: SortableEntry[] = params.approverChanges.map((c) => ({
    entry: {
      category: '결재자 변경',
      date: formatDateTime(c.createdAt),
      detail: `${c.beforeApproverName ?? '미지정'} → ${c.afterApproverName}`,
      reason: c.reason,
      actorName: c.changedByName,
      targetUserId: c.targetUserId,
      targetUserName: c.targetUserName,
    },
    sortKey: c.createdAt,
  }))

  const exceptionEntries: SortableEntry[] = (params.exceptions ?? []).map((ex) => ({
    entry: {
      category: '만근 예외',
      date: formatDateTime(ex.createdAt),
      detail: `${ex.periodStart} ~ ${addMonthsISO(ex.periodStart, 1)} 미발생`,
      reason: ex.reason,
      actorName: ex.createdByName,
      targetUserId: ex.targetUserId,
      targetUserName: ex.targetUserName,
    },
    sortKey: ex.createdAt,
  }))

  const accountEventEntries: SortableEntry[] = (params.accountEvents ?? []).map((a) => {
    const category: HistoryEntry['category'] =
      a.action === 'SIGNUP_APPROVED' ? '가입 승인' : a.action === 'SIGNUP_REJECTED' ? '가입 거절' : '퇴사'
    const detail =
      a.action === 'SIGNUP_APPROVED'
        ? a.role === 'FREELANCER'
          ? `프리랜서 승인 (입사일 ${a.hireDate})`
          : '결재자 승인'
        : '-'
    return {
      entry: {
        category,
        date: formatDateTime(a.createdAt),
        detail,
        reason: a.reason ?? '-',
        actorName: a.actorName,
        targetUserId: a.targetUserId,
        targetUserName: a.targetUserName,
      },
      sortKey: a.createdAt,
    }
  })

  return [
    ...grantEntries,
    ...usageEntries,
    ...approverChangeEntries,
    ...exceptionEntries,
    ...accountEventEntries,
  ]
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))
    .map((s) => s.entry)
}

export interface HistoryFilters {
  category?: HistoryEntry['category']
  page: number
  pageSize: number
}

export interface HistoryPage {
  items: HistoryEntry[]
  total: number
  page: number
  pageSize: number
}

// 정렬·병합이 끝난 타임라인 위에서 카테고리 필터링과 페이지 슬라이스만 담당하는 순수 함수.
// DB 조회(lib/db/history.ts)는 이 함수를 호출하기 전에 이미 병합·정렬된 배열을 넘긴다.
export function paginateHistory(entries: HistoryEntry[], filters: HistoryFilters): HistoryPage {
  const filtered = filters.category ? entries.filter((e) => e.category === filters.category) : entries
  const start = (filters.page - 1) * filters.pageSize
  return {
    items: filtered.slice(start, start + filters.pageSize),
    total: filtered.length,
    page: filters.page,
    pageSize: filters.pageSize,
  }
}
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `npx vitest run lib/domain/user-history.test.ts`
Expected: PASS (기존 테스트 포함 전체)

- [ ] **Step 5: 커밋**

```bash
git add lib/domain/user-history.ts lib/domain/user-history.test.ts
git commit -m "feat: 이력 도메인 로직에 가입 승인/거절/퇴사 카테고리와 페이지네이션 추가"
```

---

### Task 3: 가입 승인/거절 API — `account_events` 기록

**Files:**
- Modify: `app/api/admin/users-manage/[id]/approve/route.ts`
- Modify: `app/api/admin/users-manage/[id]/reject/route.ts`

**Interfaces:**
- Consumes: `accountEvents` 테이블(Task 1)
- Produces: 두 라우트의 HTTP 계약(요청/응답)은 변경 없음 — 실제로 상태가 바뀐 요청에 한해
  `account_events`에 행이 하나 추가되는 부수효과만 생긴다.

- [ ] **Step 1: 승인 라우트 수정**

`app/api/admin/users-manage/[id]/approve/route.ts` 전체를 아래로 교체:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accountEvents, users } from '@/lib/db/schema'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'

const bodySchema = z.object({
  role: z.enum(['FREELANCER', 'APPROVER']),
  hireDate: z.string().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSuperAdmin()
    const actorId = Number((session.user as { id?: string }).id)
    const { id } = await params

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    if (parsed.data.role === 'FREELANCER' && !parsed.data.hireDate) {
      return NextResponse.json({ error: '프리랜서 승인 시 입사일은 필수입니다.' }, { status: 400 })
    }

    const isFreelancer = parsed.data.role === 'FREELANCER'
    const hireDate = isFreelancer ? (parsed.data.hireDate ?? null) : null

    const updated = await db
      .update(users)
      .set({
        signupStatus: 'APPROVED',
        role: parsed.data.role,
        hireDate,
      })
      .where(and(eq(users.id, Number(id)), eq(users.signupStatus, 'PENDING')))
      .returning({ id: users.id })

    // 이미 처리된(PENDING이 아닌) 계정이면 update가 0건이라 이력도 남기지 않는다.
    if (updated.length > 0) {
      await db.insert(accountEvents).values({
        userId: Number(id),
        actorId,
        action: 'SIGNUP_APPROVED',
        role: parsed.data.role,
        hireDate,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

- [ ] **Step 2: 거절 라우트 수정**

`app/api/admin/users-manage/[id]/reject/route.ts` 전체를 아래로 교체:

```ts
import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accountEvents, users } from '@/lib/db/schema'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSuperAdmin()
    const actorId = Number((session.user as { id?: string }).id)
    const { id } = await params

    const updated = await db
      .update(users)
      .set({ signupStatus: 'REJECTED' })
      .where(and(eq(users.id, Number(id)), eq(users.signupStatus, 'PENDING')))
      .returning({ id: users.id })

    if (updated.length > 0) {
      await db.insert(accountEvents).values({
        userId: Number(id),
        actorId,
        action: 'SIGNUP_REJECTED',
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 수동 검증**

`npm run dev` 실행 후, SUPER_ADMIN으로 로그인해 "사용자 관리" 화면에서 승인대기 계정 하나를
승인하고, 다른 승인대기 계정 하나를 거절한다. 각각 처리 직후 아래로 DB를 직접 조회해 확인한다:

```bash
npx dotenv -e .env.local -- node -e "
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING);
sql\`SELECT * FROM account_events ORDER BY id DESC LIMIT 5\`.then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: 방금 승인한 계정은 `action='SIGNUP_APPROVED'`, `role`/`hire_date`(프리랜서인 경우)가
채워진 행이, 방금 거절한 계정은 `action='SIGNUP_REJECTED'` 행이 각각 보인다. `actor_id`는
로그인한 SUPER_ADMIN 계정의 id와 일치해야 한다.

- [ ] **Step 5: 커밋**

```bash
git add "app/api/admin/users-manage/[id]/approve/route.ts" "app/api/admin/users-manage/[id]/reject/route.ts"
git commit -m "feat: 가입 승인/거절 시 account_events에 이력 기록"
```

---

### Task 4: 퇴사 처리 — `account_events` 기록 + 완전삭제 FK 정리

**Files:**
- Modify: `lib/db/departures.ts`
- Modify: `app/api/admin/users/[id]/resign/route.ts`

**Interfaces:**
- Consumes: `accountEvents` 테이블(Task 1)
- Produces: `resignUser` 시그니처에 필수 파라미터 `actorId: number` 추가 — 다른 소비자는 없음
  (호출부는 이 태스크 안에서 같이 갱신한다)

- [ ] **Step 1: `resignUser`에 actorId 파라미터와 이력 기록 추가**

`lib/db/departures.ts` 상단 import를 아래로 교체(`accountEvents` 추가):

```ts
import { and, eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db/client'
import {
  accountEvents,
  approverChanges,
  attendanceExceptions,
  leaveGrants,
  leaveRequests,
  notifications,
  users,
} from '@/lib/db/schema'
```

`resignUser` 함수 전체를 아래로 교체:

```ts
export async function resignUser(params: {
  userId: number
  reason: string
  delegateTo?: number
  actorId: number
}): Promise<
  | { ok: true }
  | { error: 'NOT_FOUND' }
  | { error: 'SUPER_ADMIN_PROTECTED' }
  | { error: 'PENDING_APPROVALS'; pendingCount: number }
> {
  const [target] = await db.select().from(users).where(eq(users.id, params.userId))
  if (!target || target.signupStatus !== 'APPROVED') {
    return { error: 'NOT_FOUND' }
  }
  if (target.role === 'SUPER_ADMIN') {
    return { error: 'SUPER_ADMIN_PROTECTED' }
  }

  if (target.role === 'APPROVER') {
    const pending = await db
      .select({ id: leaveRequests.id, userId: leaveRequests.userId })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.approverId, params.userId), eq(leaveRequests.status, 'PENDING')))

    if (pending.length > 0 && !params.delegateTo) {
      return { error: 'PENDING_APPROVALS', pendingCount: pending.length }
    }

    if (pending.length > 0 && params.delegateTo) {
      // 위임 재배정 + 알림 발송 + 퇴사 처리 + 이력 기록을 하나의 트랜잭션으로 묶어(스펙
      // 5.1절) 중간에 실패해도 일부만 반영되지 않도록 한다.
      const delegateTo = params.delegateTo
      await db.transaction(async (tx) => {
        await tx
          .update(leaveRequests)
          .set({ approverId: delegateTo })
          .where(and(eq(leaveRequests.approverId, params.userId), eq(leaveRequests.status, 'PENDING')))

        for (const row of pending) {
          await tx.insert(notifications).values({
            recipientId: row.userId,
            type: 'APPROVER_CHANGED',
            refId: row.id,
            message: '담당 결재자의 퇴사 처리로 인해 이 신청의 결재자가 변경되었습니다.',
          })
        }

        await tx
          .update(users)
          .set({ signupStatus: 'RESIGNED', resignedAt: new Date(), resignReason: params.reason })
          .where(eq(users.id, params.userId))

        await tx.insert(accountEvents).values({
          userId: params.userId,
          actorId: params.actorId,
          action: 'RESIGNED',
          reason: params.reason,
        })
      })

      return { ok: true }
    }
  }

  await db
    .update(users)
    .set({ signupStatus: 'RESIGNED', resignedAt: new Date(), resignReason: params.reason })
    .where(eq(users.id, params.userId))

  await db.insert(accountEvents).values({
    userId: params.userId,
    actorId: params.actorId,
    action: 'RESIGNED',
    reason: params.reason,
  })

  return { ok: true }
}
```

- [ ] **Step 2: `deleteDepartedUser`의 FREELANCER 완전삭제 트랜잭션에 `account_events` 삭제 추가**

같은 파일의 `deleteDepartedUser` 함수 안, FREELANCER 분기의 트랜잭션 블록을 아래로 교체:

```ts
  if (target.role === 'FREELANCER') {
    // 되돌릴 수 없는 완전 삭제이므로 일곱 개의 삭제 문을 하나의 트랜잭션으로 묶어
    // 중간에 실패해도 일부 테이블만 삭제된 상태로 남지 않도록 한다.
    await db.transaction(async (tx) => {
      await tx.delete(leaveGrants).where(eq(leaveGrants.userId, userId))
      await tx.delete(leaveRequests).where(eq(leaveRequests.userId, userId))
      await tx.delete(notifications).where(eq(notifications.recipientId, userId))
      await tx.delete(approverChanges).where(eq(approverChanges.userId, userId))
      await tx.delete(attendanceExceptions).where(eq(attendanceExceptions.userId, userId))
      await tx.delete(accountEvents).where(eq(accountEvents.userId, userId))
      await tx.delete(users).where(eq(users.id, userId))
    })
    return { ok: true }
  }
```

(주석의 "여섯 개"를 "일곱 개"로 바꾼 것 외에, `account_events` 삭제 한 줄만 추가됐다. 이걸
빼먹으면 `account_events.user_id`의 FK 제약 때문에 마지막 `users` 삭제 문에서 완전삭제
자체가 실패한다.)

- [ ] **Step 3: 호출부에 actorId 전달**

`app/api/admin/users/[id]/resign/route.ts`에서 `resignUser` 호출 부분을 찾아 교체:

기존:
```ts
    const result = await resignUser({
      userId: Number(id),
      reason: parsed.data.reason,
      delegateTo: parsed.data.delegate ? callerId : undefined,
    })
```

변경 후:
```ts
    const result = await resignUser({
      userId: Number(id),
      reason: parsed.data.reason,
      delegateTo: parsed.data.delegate ? callerId : undefined,
      actorId: callerId,
    })
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 수동 검증**

`npm run dev` 실행 후, SUPER_ADMIN으로 로그인해:

1. 프리랜서 한 명을 퇴사 처리(사유 입력) → 아래 조회로 `account_events`에
   `action='RESIGNED'`, 입력한 사유가 그대로 담긴 행이 생겼는지 확인:

```bash
npx dotenv -e .env.local -- node -e "
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING);
sql\`SELECT * FROM account_events WHERE action='RESIGNED' ORDER BY id DESC LIMIT 1\`.then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

2. 퇴사자 관리 화면에서 방금 퇴사 처리한 프리랜서를 "완전삭제" → 에러 없이 성공하는지 확인
   (성공하면 FK 정합성 처리가 제대로 된 것이다 — Step 2를 빠뜨렸다면 이 단계에서 FK 위반
   에러가 난다). 완전삭제 후 아래로 `account_events`에서도 해당 `user_id`가 사라졌는지 확인:

```bash
npx dotenv -e .env.local -- node -e "
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING);
sql\`SELECT count(*) FROM account_events WHERE user_id=\${대상_userId}\`.then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: count가 0.

- [ ] **Step 6: 커밋**

```bash
git add lib/db/departures.ts "app/api/admin/users/[id]/resign/route.ts"
git commit -m "feat: 퇴사 처리 시 account_events 기록, 완전삭제 시 함께 정리"
```

---

### Task 5: 사이트 전체 이력 조회 DB 헬퍼

**Files:**
- Create: `lib/db/history.ts`

**Interfaces:**
- Consumes: `buildHistoryTimeline`, `paginateHistory`, `HistoryEntry`, `HistoryPage`(Task 2),
  `leaveGrants`, `leaveRequests`, `approverChanges`, `attendanceExceptions`, `accountEvents`,
  `users` 테이블(Task 1 포함, 스키마)
- Produces: `SiteWideHistoryFilters { targetGroup?: 'ACCOUNT'|'LEAVE'|'APPROVER'|'ATTENDANCE';
  category?: HistoryEntry['category']; from?: string; to?: string; page: number; pageSize:
  number }`, `getSiteWideHistory(filters: SiteWideHistoryFilters): Promise<HistoryPage>` — Task
  6이 이 함수를 그대로 import해서 쓴다.

- [ ] **Step 1: 구현**

```ts
// lib/db/history.ts
import { and, eq, gte, lte } from 'drizzle-orm'
import { alias, type PgColumn } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'
import {
  accountEvents,
  approverChanges,
  attendanceExceptions,
  leaveGrants,
  leaveRequests,
  users,
} from '@/lib/db/schema'
import { buildHistoryTimeline, paginateHistory, type HistoryEntry, type HistoryPage } from '@/lib/domain/user-history'

export interface SiteWideHistoryFilters {
  targetGroup?: 'ACCOUNT' | 'LEAVE' | 'APPROVER' | 'ATTENDANCE'
  category?: HistoryEntry['category']
  from?: string
  to?: string
  page: number
  pageSize: number
}

// KST(UTC+9) 기준으로 그 날 00:00부터 23:59:59까지를 포함하도록 UTC로 환산해 조건을 만든다.
function dateRangeConditions(column: PgColumn, from?: string, to?: string) {
  const conditions = []
  if (from) conditions.push(gte(column, new Date(`${from}T00:00:00+09:00`)))
  if (to) conditions.push(lte(column, new Date(`${to}T23:59:59+09:00`)))
  return conditions
}

export async function getSiteWideHistory(filters: SiteWideHistoryFilters): Promise<HistoryPage> {
  const includeLeave = !filters.targetGroup || filters.targetGroup === 'LEAVE'
  const includeApprover = !filters.targetGroup || filters.targetGroup === 'APPROVER'
  const includeAttendance = !filters.targetGroup || filters.targetGroup === 'ATTENDANCE'
  const includeAccount = !filters.targetGroup || filters.targetGroup === 'ACCOUNT'

  const grantCreator = alias(users, 'grantCreator')
  const grantTarget = alias(users, 'grantTarget')
  const grantRows = includeLeave
    ? await db
        .select({
          grantDate: leaveGrants.grantDate,
          amount: leaveGrants.amount,
          note: leaveGrants.note,
          createdBy: leaveGrants.createdBy,
          createdByName: grantCreator.name,
          createdAt: leaveGrants.createdAt,
          targetUserId: leaveGrants.userId,
          targetUserName: grantTarget.name,
        })
        .from(leaveGrants)
        .leftJoin(grantCreator, eq(leaveGrants.createdBy, grantCreator.id))
        .innerJoin(grantTarget, eq(leaveGrants.userId, grantTarget.id))
        .where(
          (() => {
            const c = dateRangeConditions(leaveGrants.createdAt, filters.from, filters.to)
            return c.length > 0 ? and(...c) : undefined
          })()
        )
    : []

  const usageApprover = alias(users, 'usageApprover')
  const usageTarget = alias(users, 'usageTarget')
  const usageRows = includeLeave
    ? await db
        .select({
          startDate: leaveRequests.startDate,
          requestedDays: leaveRequests.requestedDays,
          reason: leaveRequests.reason,
          type: leaveRequests.type,
          approverName: usageApprover.name,
          createdAt: leaveRequests.createdAt,
          targetUserId: leaveRequests.userId,
          targetUserName: usageTarget.name,
        })
        .from(leaveRequests)
        .leftJoin(usageApprover, eq(leaveRequests.approverId, usageApprover.id))
        .innerJoin(usageTarget, eq(leaveRequests.userId, usageTarget.id))
        .where(
          and(
            eq(leaveRequests.status, 'APPROVED'),
            ...dateRangeConditions(leaveRequests.createdAt, filters.from, filters.to)
          )
        )
    : []

  const beforeApprover = alias(users, 'beforeApprover')
  const afterApprover = alias(users, 'afterApprover')
  const changer = alias(users, 'changer')
  const approverTarget = alias(users, 'approverTarget')
  const approverChangeRows = includeApprover
    ? await db
        .select({
          createdAt: approverChanges.createdAt,
          reason: approverChanges.reason,
          beforeApproverName: beforeApprover.name,
          afterApproverName: afterApprover.name,
          changedByName: changer.name,
          targetUserId: approverChanges.userId,
          targetUserName: approverTarget.name,
        })
        .from(approverChanges)
        .leftJoin(beforeApprover, eq(approverChanges.beforeApproverId, beforeApprover.id))
        .leftJoin(afterApprover, eq(approverChanges.afterApproverId, afterApprover.id))
        .leftJoin(changer, eq(approverChanges.changedBy, changer.id))
        .innerJoin(approverTarget, eq(approverChanges.userId, approverTarget.id))
        .where(
          (() => {
            const c = dateRangeConditions(approverChanges.createdAt, filters.from, filters.to)
            return c.length > 0 ? and(...c) : undefined
          })()
        )
    : []

  const exceptionCreator = alias(users, 'exceptionCreator')
  const exceptionTarget = alias(users, 'exceptionTarget')
  const exceptionRows = includeAttendance
    ? await db
        .select({
          periodStart: attendanceExceptions.periodStart,
          reason: attendanceExceptions.reason,
          createdByName: exceptionCreator.name,
          createdAt: attendanceExceptions.createdAt,
          targetUserId: attendanceExceptions.userId,
          targetUserName: exceptionTarget.name,
        })
        .from(attendanceExceptions)
        .leftJoin(exceptionCreator, eq(attendanceExceptions.createdBy, exceptionCreator.id))
        .innerJoin(exceptionTarget, eq(attendanceExceptions.userId, exceptionTarget.id))
        .where(
          (() => {
            const c = dateRangeConditions(attendanceExceptions.createdAt, filters.from, filters.to)
            return c.length > 0 ? and(...c) : undefined
          })()
        )
    : []

  const eventActor = alias(users, 'eventActor')
  const eventTarget = alias(users, 'eventTarget')
  const accountEventRows = includeAccount
    ? await db
        .select({
          action: accountEvents.action,
          role: accountEvents.role,
          hireDate: accountEvents.hireDate,
          reason: accountEvents.reason,
          actorName: eventActor.name,
          createdAt: accountEvents.createdAt,
          targetUserId: accountEvents.userId,
          targetUserName: eventTarget.name,
        })
        .from(accountEvents)
        .leftJoin(eventActor, eq(accountEvents.actorId, eventActor.id))
        .innerJoin(eventTarget, eq(accountEvents.userId, eventTarget.id))
        .where(
          (() => {
            const c = dateRangeConditions(accountEvents.createdAt, filters.from, filters.to)
            return c.length > 0 ? and(...c) : undefined
          })()
        )
    : []

  const timeline = buildHistoryTimeline({
    grants: grantRows.map((g) => ({ ...g, createdAt: g.createdAt.toISOString() })),
    usages: usageRows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    approverChanges: approverChangeRows.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      afterApproverName: c.afterApproverName ?? '-',
      changedByName: c.changedByName ?? '-',
    })),
    exceptions: exceptionRows.map((ex) => ({ ...ex, createdAt: ex.createdAt.toISOString() })),
    accountEvents: accountEventRows.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      actorName: a.actorName ?? '-',
    })),
  })

  return paginateHistory(timeline, {
    category: filters.category,
    page: filters.page,
    pageSize: filters.pageSize,
  })
}
```

`(() => {...})()` 즉시실행 함수로 감싼 부분은 "조건이 하나도 없으면 `.where()`에
`undefined`를 넘긴다"는 drizzle의 동적 쿼리 패턴을 위한 것이다(조건 배열이 비어 있는데
`and()`를 그대로 호출하면 타입/런타임 둘 다 문제가 될 수 있어 방어). `usageRows`처럼 이미
`eq(...)` 조건이 하나 있는 경우는 배열 스프레드로 자연스럽게 합친다.

만약 `PgColumn` 제네릭 타입 때문에 `npx tsc --noEmit`에서 `dateRangeConditions` 호출부에
타입 에러가 나면(drizzle-orm 버전에 따라 컬럼 제네릭 추론이 까다로울 수 있다), 공유 헬퍼
대신 각 쿼리 안에 `gte`/`lte` 조건을 인라인으로 직접 작성해도 무방하다 — 동작은 동일하다.

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음(위 안내대로 타입 에러가 나면 인라인 방식으로 조정 후 재확인)

- [ ] **Step 3: 커밋**

```bash
git add lib/db/history.ts
git commit -m "feat: 사이트 전체 변경 이력 조회 DB 헬퍼 추가"
```

---

### Task 6: 조회 API — `GET /api/admin/history`

**Files:**
- Create: `app/api/admin/history/route.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin`/`toAuthErrorResponse`(`lib/auth/session.ts`, 기존),
  `getSiteWideHistory`(Task 5)
- Produces: `GET /api/admin/history?targetGroup=&category=&from=&to=&page=&pageSize=` →
  `HistoryPage` JSON(`{items, total, page, pageSize}`) — Task 8이 이 응답을 소비한다.

- [ ] **Step 1: 라우트 작성**

```ts
// app/api/admin/history/route.ts
import { NextResponse } from 'next/server'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'
import { getSiteWideHistory } from '@/lib/db/history'
import type { HistoryEntry } from '@/lib/domain/user-history'

const TARGET_GROUPS = ['ACCOUNT', 'LEAVE', 'APPROVER', 'ATTENDANCE'] as const
type TargetGroup = (typeof TARGET_GROUPS)[number]

export async function GET(request: Request) {
  try {
    await requireSuperAdmin()
    const url = new URL(request.url)

    const targetGroupParam = url.searchParams.get('targetGroup')
    const targetGroup = (TARGET_GROUPS as readonly string[]).includes(targetGroupParam ?? '')
      ? (targetGroupParam as TargetGroup)
      : undefined

    const category = (url.searchParams.get('category') as HistoryEntry['category'] | null) ?? undefined
    const from = url.searchParams.get('from') ?? undefined
    const to = url.searchParams.get('to') ?? undefined
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? '50') || 50))

    const result = await getSiteWideHistory({ targetGroup, category, from, to, page, pageSize })
    return NextResponse.json(result)
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

- [ ] **Step 3: 수동 검증**

`npm run dev` 실행 후, SUPER_ADMIN으로 로그인한 브라우저에서 주소창에
`http://localhost:3000/api/admin/history`를 직접 입력해 접속한다.

Expected: `{"items":[...],"total":N,"page":1,"pageSize":50}` 형태의 JSON이 표시되고,
`items` 배열에 Task 3/4에서 만든 가입 승인/거절/퇴사 이력과 기존 연차/결재자 이력이 섞여
`date` 내림차순으로 나온다. `?targetGroup=ACCOUNT`를 붙이면 가입/퇴사 관련 항목만, `?category=
퇴사`를 붙이면(URL 인코딩 필요: `%ED%87%B4%EC%82%AC`) 퇴사 항목만 나오는지도 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add app/api/admin/history/route.ts
git commit -m "feat: 사이트 전체 변경 이력 조회 API 추가"
```

---

### Task 7: 화면 — `/admin/history`

**Files:**
- Create: `app/admin/history/layout.tsx`
- Create: `app/admin/history/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/history`(Task 6)
- Produces: 없음(리프 화면). Task 8이 사이드바에서 이 경로로 링크를 연결한다.

- [ ] **Step 1: 레이아웃(페이지 타이틀) 작성**

```tsx
// app/admin/history/layout.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '변경 이력',
}

export default function Layout({ children }: LayoutProps<'/admin/history'>) {
  return children
}
```

- [ ] **Step 2: 페이지 작성**

```tsx
// app/admin/history/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/date-picker'
import { LoadingSpinner } from '@/components/loading-spinner'
import { PageHeader } from '@/components/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Category =
  | '가입 승인'
  | '가입 거절'
  | '퇴사'
  | '연차 자동 발생'
  | '연차 조정'
  | '입사일 변경'
  | '사용'
  | '결재자 변경'
  | '만근 예외'

type TargetGroup = 'ACCOUNT' | 'LEAVE' | 'APPROVER' | 'ATTENDANCE'

interface HistoryEntry {
  category: Category
  date: string
  detail: string
  reason: string
  actorName: string | null
  targetUserId?: number
  targetUserName?: string
}

interface HistoryPage {
  items: HistoryEntry[]
  total: number
  page: number
  pageSize: number
}

const CATEGORY_OPTIONS: Category[] = [
  '가입 승인',
  '가입 거절',
  '퇴사',
  '연차 자동 발생',
  '연차 조정',
  '입사일 변경',
  '사용',
  '결재자 변경',
  '만근 예외',
]

const TARGET_GROUP_OPTIONS: { value: TargetGroup; label: string }[] = [
  { value: 'ACCOUNT', label: '계정' },
  { value: 'LEAVE', label: '연차' },
  { value: 'APPROVER', label: '결재자' },
  { value: 'ATTENDANCE', label: '만근 예외' },
]

const CATEGORY_BADGE_CLASS: Record<Category, string> = {
  '연차 자동 발생':
    'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  '연차 조정':
    'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  사용: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  '결재자 변경':
    'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300',
  '입사일 변경':
    'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300',
  '만근 예외':
    'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
  '가입 승인':
    'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300',
  '가입 거절':
    'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300',
  퇴사: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
}

const PAGE_SIZE = 50

export default function AdminHistoryPage() {
  const [data, setData] = useState<HistoryPage>({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE })
  const [category, setCategory] = useState<Category | 'ALL'>('ALL')
  const [targetGroup, setTargetGroup] = useState<TargetGroup | 'ALL'>('ALL')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setLoadError(null)
    const params = new URLSearchParams()
    if (category !== 'ALL') params.set('category', category)
    if (targetGroup !== 'ALL') params.set('targetGroup', targetGroup)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    params.set('page', String(page))
    params.set('pageSize', String(PAGE_SIZE))

    fetch(`/api/admin/history?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error('목록을 불러오지 못했습니다.')
        return res.json()
      })
      .then(setData)
      .catch(() => setLoadError('목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false))
  }, [category, targetGroup, from, to, page])

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  return (
    <div className="w-full">
      <PageHeader title="변경 이력" description="가입 승인/거절, 퇴사, 연차, 결재자, 만근 예외 변경 이력을 조회합니다." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={category}
          onValueChange={(value) => {
            setPage(1)
            setCategory(value as Category | 'ALL')
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="전체 작업" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 작업</SelectItem>
            {CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={targetGroup}
          onValueChange={(value) => {
            setPage(1)
            setTargetGroup(value as TargetGroup | 'ALL')
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="전체 대상" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 대상</SelectItem>
            {TARGET_GROUP_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DatePicker
          value={from || undefined}
          onChange={(value) => {
            setPage(1)
            setFrom(value)
          }}
          placeholder="시작일"
          className="w-40"
        />
        <DatePicker
          value={to || undefined}
          onChange={(value) => {
            setPage(1)
            setTo(value)
          }}
          placeholder="종료일"
          className="w-40"
        />
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">표시할 이력이 없습니다.</p>
      ) : (
        <>
          <Table className="hidden lg:table" containerClassName="hidden lg:block">
            <TableHeader>
              <TableRow>
                <TableHead>일시</TableHead>
                <TableHead>작업자</TableHead>
                <TableHead>작업</TableHead>
                <TableHead>대상</TableHead>
                <TableHead>내용</TableHead>
                <TableHead>사유</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((entry, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{entry.date}</TableCell>
                  <TableCell>{entry.actorName ?? '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={CATEGORY_BADGE_CLASS[entry.category]}>
                      {entry.category}
                    </Badge>
                  </TableCell>
                  <TableCell>{entry.targetUserName ?? '-'}</TableCell>
                  <TableCell>{entry.detail}</TableCell>
                  <TableCell className="text-muted-foreground">{entry.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 lg:hidden">
            {data.items.map((entry, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-4 text-sm">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={CATEGORY_BADGE_CLASS[entry.category]}>
                    {entry.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{entry.date}</span>
                </div>
                <p className="font-medium">{entry.targetUserName ?? '-'}</p>
                <p>{entry.detail}</p>
                <p className="text-xs text-muted-foreground">
                  사유: {entry.reason}
                  {entry.actorName && ` · 작업자: ${entry.actorName}`}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              이전
            </Button>
            <span className="text-sm text-muted-foreground">
              페이지 {data.page} / {totalPages}
            </span>
            <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              다음
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 타입체크 & 린트**

Run: `npx tsc --noEmit && npx eslint app/admin/history/page.tsx app/admin/history/layout.tsx`
Expected: 에러 없음

- [ ] **Step 4: 수동 검증**

이 시점에는 사이드바에 아직 링크가 없다(Task 8에서 연결). `npm run dev` 실행 후 SUPER_ADMIN
로그인 상태에서 주소창에 직접 `http://localhost:3000/admin/history`를 입력해 접속한다.

1. Task 3/4/6에서 만든 이력들이 테이블에 표시되는지, 배지 색이 카테고리별로 겹치지 않는지
   확인
2. "작업" 드롭다운에서 "퇴사"를 선택 → 퇴사 행만 남는지 확인
3. "대상" 드롭다운에서 "계정"을 선택 → 가입 승인/거절/퇴사 행만 남는지 확인
4. 시작일/종료일을 오늘 날짜로 지정 → 오늘 발생한 이력만 남는지 확인
5. 뷰포트를 375px로 좁혀 카드형 레이아웃으로 정상 전환되는지 확인
6. 데이터가 50건을 넘지 않아 페이지가 1개뿐이면 "이전"/"다음" 버튼이 둘 다 비활성인지만
   확인(실제 페이지 이동은 데이터가 쌓인 뒤 확인)

- [ ] **Step 5: 커밋**

```bash
git add app/admin/history/
git commit -m "feat: 변경 이력 조회 화면 추가"
```

---

### Task 8: 사이드바 메뉴 노출

**Files:**
- Modify: `components/app-sidebar.tsx`

**Interfaces:**
- Consumes: `/admin/history` 라우트(Task 7)
- Produces: 없음(최종 통합 단계)

- [ ] **Step 1: 아이콘 import 추가**

`components/app-sidebar.tsx` 상단 `lucide-react` import 블록에 `HistoryIcon`을 추가:

```ts
import {
  MoreVerticalIcon,
  LogOutIcon,
  LayoutDashboardIcon,
  FileTextIcon,
  InboxIcon,
  UsersIcon,
  ShieldIcon,
  KeyRoundIcon,
  HomeIcon,
  CircleHelpIcon,
  UserCogIcon,
  UserMinusIcon,
  HistoryIcon,
} from 'lucide-react'
```

- [ ] **Step 2: `ADMIN_LINKS`에 항목 추가**

```ts
const ADMIN_LINKS = [
  { href: '/admin/users-manage', label: '사용자 관리', icon: UserCogIcon, roles: ['SUPER_ADMIN'] },
  { href: '/admin/users', label: '프리랜서 정보 관리', icon: UsersIcon, roles: ['SUPER_ADMIN', 'APPROVER'] },
  { href: '/admin/departures', label: '퇴사자 관리', icon: UserMinusIcon, roles: ['SUPER_ADMIN'] },
  { href: '/admin/history', label: '변경 이력', icon: HistoryIcon, roles: ['SUPER_ADMIN'] },
]
```

`/admin/history`는 기존 세 경로(`/admin/users-manage`, `/admin/users`, `/admin/departures`)
어느 것과도 접두사 관계가 아니므로, 기존 `isLinkActive` 헬퍼(경로가 정확히 같거나 `/`로 이어지는
하위 경로일 때만 일치)가 그대로 문제없이 동작한다 — 이 헬퍼 자체는 수정하지 않는다.

- [ ] **Step 3: 타입체크 & 린트**

Run: `npx tsc --noEmit && npx eslint components/app-sidebar.tsx`
Expected: 에러 없음

- [ ] **Step 4: 수동 검증**

`npm run dev` 실행 후:
1. SUPER_ADMIN 로그인 → 사이드바 "관리자 메뉴"에 "변경 이력"이 퇴사자 관리 다음에 보이는지,
   클릭 시 `/admin/history`로 이동하고 그 메뉴만 활성 표시되는지 확인
2. 다른 관리자 메뉴 항목(사용자 관리/프리랜서 정보 관리/퇴사자 관리)을 클릭했을 때 "변경 이력"
   메뉴가 같이 활성화되지 않는지도 확인(회귀 확인)
3. APPROVER 계정으로 로그인 → 사이드바에 "변경 이력"이 보이지 않는지, `/admin/history`에
   직접 접근 시 API가 403을 반환해 빈 화면/에러로 처리되는지 확인

- [ ] **Step 5: 커밋**

```bash
git add components/app-sidebar.tsx
git commit -m "feat: 사이드바에 변경 이력 메뉴 노출"
```

---

## Post-Plan Suggestions (범위 밖, 제안만)

- 이력이 수만 건 이상 쌓이면 `lib/db/history.ts`의 애플리케이션 메모리 페이지네이션이
  느려진다 — 그때는 DB 레벨 페이지네이션(통합 SQL 뷰 등)으로 전환을 검토한다(스펙 5장에서
  명시적으로 범위 제외).
- 퇴사자 관리 화면의 "복구"/"완전삭제" 액션 자체를 이력으로 남기고 싶어지면, `account_events`의
  `action`에 `RESTORED`/`PURGED`를 추가하고 각 API에 기록 호출을 추가하는 방식으로 확장 가능
  하다(스펙 2장에서 이번 범위 제외로 명시).
- 결재함(휴가 신청 제출/승인/반려/취소) 워크플로가 나중에 만들어지면, `lib/db/history.ts`의
  `leave_requests` 조회 조건(현재 `status='APPROVED'`만)과
  `lib/domain/user-history.ts`의 분류 로직만 확장하면 이 화면에 자동으로 포함된다.
