# 프리랜서 상세 패널 및 결재자 변경 이력 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프리랜서 정보 관리 테이블의 이름을 클릭하면 우측에서 슬라이드되는 조회 전용 상세
패널을 열어 연차 발생/사용/조정 + 결재자 변경 통합 이력을 보여주고, 기본 결재자 재배정을
사유 필수 모달 방식으로 바꿔 이력을 남기고 알림을 보낸다.

**Architecture:** 새 테이블(`approver_changes`)과 새 순수 함수(이력 병합·분류)를 추가하고,
기존 `leaveGrants`/`leaveRequests` 조회를 결합하는 신규 조회 API 1개를 만든다. 프리랜서
정보 관리 화면은 새 `UserHistoryPanel` 컴포넌트를 붙이고, 결재자 재배정 흐름을 기존
`LeaveAdjustmentDialog`를 재사용하는 사유 모달 방식으로 바꾼다. 나머지 연차 조정 로직·API는
변경하지 않는다.

**Tech Stack:** Next.js (App Router), Drizzle ORM + Postgres, Zod, shadcn/ui(Sheet/Badge),
Vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-freelancer-detail-panel-design.md` (이 문서가
`docs/superpowers/specs/2026-08-25-approver-role-and-freelancer-info-design.md` 4.1절의
"선택 즉시 반영, 사유 모달 없음"을 대체함)

## Global Constraints

- 변수명/함수명은 영어, 커밋 메시지/주석/문서는 한국어
- 연차 관리는 원장(LeaveGrant/LeaveRequest) 방식 — 발생/사용 이력 추적 필수(`CLAUDE.md`)
- 반차는 0.5일 단위만, 시간 단위 계산 없음 — 이번 계획에서 새로 추가하는 숫자 필드는 없음
- No Placeholders: 실제 동작하는 코드만, TODO/TBD 금지
- 패널은 조회 전용 — 입사일/사용가능·사용 연차 수정은 계속 기존 테이블 인라인 UI에서 한다
  (결재자 재배정만 예외적으로 모달을 거치되, 트리거는 여전히 테이블의 콤보박스다)
- 이력은 전체 기간 기준(현재 사이클로 필터링하지 않음). 요약의 "미사용 연차"만 현재 사이클
  기준 계산 유지
- 패널 너비: `lg:`(1024px) 이상 25%, 미만 95%. 이 저장소가 이미 데스크톱 테이블 ↔ 모바일
  카드 전환에 쓰고 있는 `lg:` 분기점과 통일한다

---

### Task 1: `approver_changes` 테이블 추가 + 마이그레이션

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `drizzle/0002_approver-changes-history.sql` (drizzle-kit가 생성)

**Interfaces:**
- Consumes: 없음
- Produces: `approverChanges` 테이블(drizzle 스키마 객체) — 컬럼 `id, userId, beforeApproverId
  (nullable), afterApproverId, reason, changedBy, createdAt`. Task 3/5가 이 테이블을 import해서
  쓴다.

- [ ] **Step 1: 스키마에 테이블 추가**

`lib/db/schema.ts`의 `notifications` 테이블 정의 바로 아래에 추가한다(파일 끝):

```ts
export const approverChanges = pgTable('approver_changes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  beforeApproverId: integer('before_approver_id').references(() => users.id),
  afterApproverId: integer('after_approver_id').notNull().references(() => users.id),
  reason: text('reason').notNull(),
  changedBy: integer('changed_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

`beforeApproverId`는 nullable이다 — 지금까지 결재자가 지정된 적 없는 프리랜서가 처음
배정되는 경우를 대비한다. 이 파일 상단 import 줄(`boolean, date, integer, numeric, pgTable,
serial, text, timestamp, varchar`)에는 이미 필요한 함수(`integer`, `pgTable`, `serial`,
`text`, `timestamp`)가 전부 포함되어 있으므로 import 수정은 필요 없다.

- [ ] **Step 2: 마이그레이션 생성**

Run: `npx drizzle-kit generate --name approver-changes-history`

Expected: `drizzle/0002_approver-changes-history.sql` 생성. 다음과 유사한 내용이어야 한다
(정확한 공백/줄바꿈은 drizzle-kit 버전에 따라 다를 수 있음 — 아래 내용과 의미가 같은지만
확인):

```sql
CREATE TABLE "approver_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"before_approver_id" integer,
	"after_approver_id" integer NOT NULL,
	"reason" text NOT NULL,
	"changed_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approver_changes" ADD CONSTRAINT "approver_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "approver_changes" ADD CONSTRAINT "approver_changes_before_approver_id_users_id_fk" FOREIGN KEY ("before_approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "approver_changes" ADD CONSTRAINT "approver_changes_after_approver_id_users_id_fk" FOREIGN KEY ("after_approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "approver_changes" ADD CONSTRAINT "approver_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
```

- [ ] **Step 3: 마이그레이션 적용**

Run: `npx dotenv -e .env.local -- npx drizzle-kit migrate`
Expected: 에러 없이 완료. 완료 후 아래로 테이블이 실제 생성됐는지 직접 확인한다.

```bash
npx dotenv -e .env.local -- node -e "
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL || process.env.POSTGRES_URL);
sql\`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='approver_changes' ORDER BY ordinal_position\`.then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `id, user_id, before_approver_id, after_approver_id, reason, changed_by, created_at`
7개 컬럼이 출력됨.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat: 결재자 변경 이력 저장용 approver_changes 테이블 추가"
```

---

### Task 2: 이력 병합/분류 순수 함수

**Files:**
- Create: `lib/domain/user-history.ts`
- Test: `lib/domain/user-history.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수, DB 의존 없음)
- Produces:
  - `HistoryEntry` 인터페이스: `{category: '발생' | '조정' | '사용' | '결재자 변경'; date:
    string; detail: string; reason: string; actorName: string | null}`
  - `GrantHistoryRow`, `UsageHistoryRow`, `ApproverChangeHistoryRow` 인터페이스(아래 코드 참고)
  - `buildHistoryTimeline(params: {grants: GrantHistoryRow[]; usages: UsageHistoryRow[];
    approverChanges: ApproverChangeHistoryRow[]}): HistoryEntry[]`
  - Task 3이 이 파일의 타입과 함수를 그대로 import해서 쓴다.

이 함수는 원 설계 문서의 이력 분류 기준(스펙 3.3절)을 그대로 코드화한다: `leaveGrants`는
`createdBy`가 `null`이면 "발생", 아니면 "조정". `leaveRequests`는 `type`이 `'ADJUSTMENT'`면
"조정", 아니면 "사용". `approverChanges`는 항상 "결재자 변경". 정렬은 각 출처의 `createdAt`
타임스탬프(ISO 문자열) 기준 내림차순 — `grantDate`/`startDate`는 날짜만 있어 같은 날 여러
건이면 순서가 뒤섞일 수 있으므로 화면 표시(`date`)와 정렬 기준(`createdAt`)을 분리한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/domain/user-history.test.ts
import { describe, expect, it } from 'vitest'
import { buildHistoryTimeline } from './user-history'

describe('buildHistoryTimeline', () => {
  it('createdBy가 없는 leaveGrants 행은 "발생"으로 분류한다', () => {
    const result = buildHistoryTimeline({
      grants: [
        {
          grantDate: '2026-04-01',
          amount: 1,
          note: null,
          createdBy: null,
          createdByName: null,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      usages: [],
      approverChanges: [],
    })
    expect(result).toEqual([
      {
        category: '발생',
        date: '2026-04-01',
        detail: '1일',
        reason: '-',
        actorName: null,
      },
    ])
  })

  it('createdBy가 있는 leaveGrants 행은 "조정"으로 분류한다', () => {
    const result = buildHistoryTimeline({
      grants: [
        {
          grantDate: '2026-05-01',
          amount: -2,
          note: '초과 지급 보정',
          createdBy: 1,
          createdByName: '관리자',
          createdAt: '2026-05-01T09:00:00.000Z',
        },
      ],
      usages: [],
      approverChanges: [],
    })
    expect(result).toEqual([
      {
        category: '조정',
        date: '2026-05-01',
        detail: '-2일',
        reason: '초과 지급 보정',
        actorName: '관리자',
      },
    ])
  })

  it("type이 'ADJUSTMENT'인 leaveRequests 행은 \"조정\"으로 분류한다", () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [
        {
          startDate: '2026-06-01',
          requestedDays: 3,
          reason: '수기 기록 반영',
          type: 'ADJUSTMENT',
          approverName: '관리자',
          createdAt: '2026-06-01T09:00:00.000Z',
        },
      ],
      approverChanges: [],
    })
    expect(result[0].category).toBe('조정')
  })

  it("type이 'FULL'인 leaveRequests 행은 \"사용\"으로 분류한다", () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [
        {
          startDate: '2026-06-10',
          requestedDays: 1,
          reason: '연차',
          type: 'FULL',
          approverName: '관리자',
          createdAt: '2026-06-10T09:00:00.000Z',
        },
      ],
      approverChanges: [],
    })
    expect(result[0].category).toBe('사용')
  })

  it('결재자 변경 행은 "결재자 변경"으로 분류하고 이전→이후 형식으로 표시한다', () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [],
      approverChanges: [
        {
          createdAt: '2026-07-01T09:00:00.000Z',
          beforeApproverName: null,
          afterApproverName: '김결재',
          reason: '신규 배정',
          changedByName: '관리자',
        },
      ],
    })
    expect(result[0]).toEqual({
      category: '결재자 변경',
      date: '2026-07-01',
      detail: '미지정 → 김결재',
      reason: '신규 배정',
      actorName: '관리자',
    })
  })

  it('세 출처를 합쳐 createdAt 기준 내림차순으로 정렬한다', () => {
    const result = buildHistoryTimeline({
      grants: [
        {
          grantDate: '2026-04-01',
          amount: 1,
          note: null,
          createdBy: null,
          createdByName: null,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      usages: [
        {
          startDate: '2026-06-01',
          requestedDays: 1,
          reason: '연차',
          type: 'FULL',
          approverName: '관리자',
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      approverChanges: [
        {
          createdAt: '2026-05-01T00:00:00.000Z',
          beforeApproverName: null,
          afterApproverName: '김결재',
          reason: '신규 배정',
          changedByName: '관리자',
        },
      ],
    })
    expect(result.map((r) => r.category)).toEqual(['사용', '결재자 변경', '발생'])
  })
})
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `npx vitest run lib/domain/user-history.test.ts`
Expected: FAIL — `Cannot find module './user-history'` 또는 유사한 에러

- [ ] **Step 3: 구현**

```ts
// lib/domain/user-history.ts
export interface GrantHistoryRow {
  grantDate: string
  amount: number
  note: string | null
  createdBy: number | null
  createdByName: string | null
  createdAt: string
}

export interface UsageHistoryRow {
  startDate: string
  requestedDays: number
  reason: string
  type: string
  approverName: string | null
  createdAt: string
}

export interface ApproverChangeHistoryRow {
  createdAt: string
  beforeApproverName: string | null
  afterApproverName: string
  reason: string
  changedByName: string
}

export interface HistoryEntry {
  category: '발생' | '조정' | '사용' | '결재자 변경'
  date: string
  detail: string
  reason: string
  actorName: string | null
}

interface SortableEntry {
  entry: HistoryEntry
  sortKey: string
}

export function buildHistoryTimeline(params: {
  grants: GrantHistoryRow[]
  usages: UsageHistoryRow[]
  approverChanges: ApproverChangeHistoryRow[]
}): HistoryEntry[] {
  const grantEntries: SortableEntry[] = params.grants.map((g) => ({
    entry: {
      category: g.createdBy === null ? '발생' : '조정',
      date: g.grantDate,
      detail: `${g.amount}일`,
      reason: g.note ?? '-',
      actorName: g.createdByName,
    },
    sortKey: g.createdAt,
  }))

  const usageEntries: SortableEntry[] = params.usages.map((u) => ({
    entry: {
      category: u.type === 'ADJUSTMENT' ? '조정' : '사용',
      date: u.startDate,
      detail: `${u.requestedDays}일`,
      reason: u.reason,
      actorName: u.approverName,
    },
    sortKey: u.createdAt,
  }))

  const approverChangeEntries: SortableEntry[] = params.approverChanges.map((c) => ({
    entry: {
      category: '결재자 변경',
      date: c.createdAt.slice(0, 10),
      detail: `${c.beforeApproverName ?? '미지정'} → ${c.afterApproverName}`,
      reason: c.reason,
      actorName: c.changedByName,
    },
    sortKey: c.createdAt,
  }))

  return [...grantEntries, ...usageEntries, ...approverChangeEntries]
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))
    .map((s) => s.entry)
}
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `npx vitest run lib/domain/user-history.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/domain/user-history.ts lib/domain/user-history.test.ts
git commit -m "feat: 연차/결재자 변경 이력 병합·분류 순수 함수 추가"
```

---

### Task 3: 결재자 변경 기록 + 통합 이력 조회 DB 헬퍼

**Files:**
- Create: `lib/db/approver-changes.ts`
- Create: `lib/db/user-history.ts`

**Interfaces:**
- Consumes: `approverChanges` 테이블(Task 1), `buildHistoryTimeline`/`HistoryEntry`(Task 2)
- Produces:
  - `recordApproverChange(params: {userId: number; beforeApproverId: number | null;
    afterApproverId: number; reason: string; changedBy: number}): Promise<void>` — Task 5가 씀
  - `getUserHistory(userId: number): Promise<HistoryEntry[]>` — Task 4가 씀

- [ ] **Step 1: 결재자 변경 기록 헬퍼 작성**

```ts
// lib/db/approver-changes.ts
import { db } from '@/lib/db/client'
import { approverChanges } from '@/lib/db/schema'

export async function recordApproverChange(params: {
  userId: number
  beforeApproverId: number | null
  afterApproverId: number
  reason: string
  changedBy: number
}): Promise<void> {
  await db.insert(approverChanges).values(params)
}
```

- [ ] **Step 2: 통합 이력 조회 헬퍼 작성**

```ts
// lib/db/user-history.ts
import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'
import { approverChanges, leaveGrants, leaveRequests, users } from '@/lib/db/schema'
import { buildHistoryTimeline, type HistoryEntry } from '@/lib/domain/user-history'

export async function getUserHistory(userId: number): Promise<HistoryEntry[]> {
  const creator = alias(users, 'creator')
  const grantRows = await db
    .select({
      grantDate: leaveGrants.grantDate,
      amount: leaveGrants.amount,
      note: leaveGrants.note,
      createdBy: leaveGrants.createdBy,
      createdByName: creator.name,
      createdAt: leaveGrants.createdAt,
    })
    .from(leaveGrants)
    .leftJoin(creator, eq(leaveGrants.createdBy, creator.id))
    .where(eq(leaveGrants.userId, userId))

  const approver = alias(users, 'approver')
  const usageRows = await db
    .select({
      startDate: leaveRequests.startDate,
      requestedDays: leaveRequests.requestedDays,
      reason: leaveRequests.reason,
      type: leaveRequests.type,
      approverName: approver.name,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .leftJoin(approver, eq(leaveRequests.approverId, approver.id))
    .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'APPROVED')))

  const beforeApprover = alias(users, 'beforeApprover')
  const afterApprover = alias(users, 'afterApprover')
  const changer = alias(users, 'changer')
  const approverChangeRows = await db
    .select({
      createdAt: approverChanges.createdAt,
      reason: approverChanges.reason,
      beforeApproverName: beforeApprover.name,
      afterApproverName: afterApprover.name,
      changedByName: changer.name,
    })
    .from(approverChanges)
    .leftJoin(beforeApprover, eq(approverChanges.beforeApproverId, beforeApprover.id))
    .leftJoin(afterApprover, eq(approverChanges.afterApproverId, afterApprover.id))
    .leftJoin(changer, eq(approverChanges.changedBy, changer.id))
    .where(eq(approverChanges.userId, userId))

  return buildHistoryTimeline({
    grants: grantRows.map((g) => ({ ...g, createdAt: g.createdAt.toISOString() })),
    usages: usageRows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    approverChanges: approverChangeRows.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      afterApproverName: c.afterApproverName ?? '-',
      changedByName: c.changedByName ?? '-',
    })),
  })
}
```

`afterApproverName`/`changedByName`은 스키마상 `NOT NULL` 참조라 실제로는 항상 값이 있지만,
`leftJoin` 결과 타입은 drizzle 기준 nullable로 추론되므로 TypeScript 타입을 맞추기 위해
`?? '-'`로 방어한다(실제 런타임에 `-`가 나타나는 경우는 없어야 정상).

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add lib/db/approver-changes.ts lib/db/user-history.ts
git commit -m "feat: 결재자 변경 기록과 통합 이력 조회 DB 헬퍼 추가"
```

---

### Task 4: 프리랜서 이력 조회 API

**Files:**
- Create: `app/api/admin/users/[id]/history/route.ts`

**Interfaces:**
- Consumes: `requireApproverOrAbove`/`toAuthErrorResponse`(`lib/auth/session.ts`, 기존),
  `getUserHistory`(Task 3)
- Produces: `GET /api/admin/users/[id]/history` → `HistoryEntry[]`(Task 2의 타입 그대로 JSON
  직렬화) — Task 6이 이 응답을 소비한다.

- [ ] **Step 1: 라우트 작성**

```ts
// app/api/admin/users/[id]/history/route.ts
import { NextResponse } from 'next/server'
import { requireApproverOrAbove, toAuthErrorResponse } from '@/lib/auth/session'
import { getUserHistory } from '@/lib/db/user-history'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApproverOrAbove()
    const { id } = await params
    const history = await getUserHistory(Number(id))
    return NextResponse.json(history)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

패널은 조회 전용이라 SUPER_ADMIN/APPROVER 모두 어떤 프리랜서의 이력이든 열람 가능하다(행
단위 소유권 제한 없음) — 메인 목록 API(`GET /api/admin/users`)와 동일한 게이트를 쓴다.

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 수동 검증**

`npm run dev` 실행 후, SUPER_ADMIN으로 로그인해 연차 조정을 한 번 이상 실행한 적 있는
프리랜서 id로 `GET /api/admin/users/{id}/history`를 실제 호출해(curl 또는 브라우저) 응답이
`[{category, date, detail, reason, actorName}, ...]` 형태인지, 이전에 실행한 조정 이력이
실제로 포함되는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add app/api/admin/users/[id]/history/route.ts
git commit -m "feat: 프리랜서 통합 이력 조회 API 추가"
```

---

### Task 5: 결재자 재배정 API — 사유 필수 + 이력 기록 + 알림

**Files:**
- Modify: `app/api/admin/users/[id]/route.ts`

**Interfaces:**
- Consumes: `recordApproverChange`(Task 3)
- Produces: `PATCH /api/admin/users/[id]` 계약 변경 — `defaultApproverId`가 바디에 있으면
  `reason`도 필수. 응답 형태(`{ok, granted, used, remaining}`)는 변경 없음. Task 7이 이
  계약을 소비한다.

- [ ] **Step 1: import 추가**

`app/api/admin/users/[id]/route.ts` 상단 import 블록에 한 줄 추가:

```ts
import { recordApproverChange } from '@/lib/db/approver-changes'
```

- [ ] **Step 2: needsReason 조건에 defaultApproverId 추가**

기존:
```ts
    const needsReason = body.hireDate !== undefined || body.grantedTotal !== undefined || body.usedTotal !== undefined
    if (needsReason && !body.reason) {
      return NextResponse.json({ error: '입사일/연차 변경 시 사유는 필수입니다.' }, { status: 400 })
    }
```

변경 후:
```ts
    const needsReason =
      body.hireDate !== undefined ||
      body.grantedTotal !== undefined ||
      body.usedTotal !== undefined ||
      body.defaultApproverId !== undefined
    if (needsReason && !body.reason) {
      return NextResponse.json({ error: '입사일/연차/결재자 변경 시 사유는 필수입니다.' }, { status: 400 })
    }
```

- [ ] **Step 3: defaultApproverId 업데이트 블록을 이력 기록 + 알림 포함하도록 교체**

기존:
```ts
    if (body.defaultApproverId !== undefined) {
      await db.update(users).set({ defaultApproverId: body.defaultApproverId }).where(eq(users.id, targetId))
    }
```

변경 후:
```ts
    if (body.defaultApproverId !== undefined && body.defaultApproverId !== target.defaultApproverId) {
      await db.update(users).set({ defaultApproverId: body.defaultApproverId }).where(eq(users.id, targetId))
      await recordApproverChange({
        userId: targetId,
        beforeApproverId: target.defaultApproverId,
        afterApproverId: body.defaultApproverId,
        reason: body.reason!,
        changedBy: callerId,
      })
      await createNotification({
        recipientId: targetId,
        type: 'APPROVER_CHANGED',
        refId: targetId,
        message: `담당 결재자가 변경되었습니다: ${body.reason}`,
      })
      await createNotification({
        recipientId: body.defaultApproverId,
        type: 'APPROVER_CHANGED',
        refId: targetId,
        message: `${target.name}의 담당 결재자로 지정되었습니다: ${body.reason}`,
      })
    }
```

값이 이전과 동일하면(같은 결재자 재선택) 이 블록 전체가 스킵된다 — 이력/알림 없이 무시하는
기존 연차 조정 델타 0 패턴과 동일하다. 이 블록은 5장(연차 조정 알림, `adjusted` 플래그
기반)과 독립적으로 동작한다 — 결재자 변경은 연차 조정이 아니므로 `LEAVE_ADJUSTED`가 아닌
`APPROVER_CHANGED`를 쓰고, `adjusted`를 건드리지 않는다.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 수동 검증**

`npm run dev` 실행 후:
1. SUPER_ADMIN 세션으로 `reason` 없이 `PATCH /api/admin/users/{id}` `{"defaultApproverId":
   N}` 호출 → 400("입사일/연차/결재자 변경 시 사유는 필수입니다.") 확인
2. `reason` 포함해 실제 다른 결재자로 변경 → 200 확인 → DB에서
   `SELECT * FROM approver_changes WHERE user_id={id} ORDER BY id DESC LIMIT 1`로 새 행(
   `before_approver_id`가 변경 전 값, `after_approver_id`가 새 값, `reason` 일치) 확인 →
   `SELECT * FROM notifications WHERE ref_id={id} AND type='APPROVER_CHANGED' ORDER BY id DESC
   LIMIT 2`로 알림 2건(대상 프리랜서 + 새 결재자) 확인
3. 같은 결재자를 다시 선택(값 동일)해 `reason`과 함께 호출 → 200이지만
   `SELECT count(*) FROM approver_changes WHERE user_id={id}`가 그대로(증가 없음), 알림도
   추가 생성되지 않는지 확인

- [ ] **Step 6: 커밋**

```bash
git add "app/api/admin/users/[id]/route.ts"
git commit -m "feat: 기본 결재자 재배정에 사유 필수, 이력 기록, 알림 발송 반영"
```

---

### Task 6: 프리랜서 상세 패널 컴포넌트

**Files:**
- Create: `components/user-history-panel.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/users/[id]/history`(Task 4), `components/ui/sheet.tsx`(기존,
  `Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription`), `components/ui/badge.tsx`
  (기존, `Badge`)
- Produces: `<UserHistoryPanel open={boolean} onOpenChange={(open:boolean)=>void} user={
  {id:number; name:string; email:string; hireDate:string|null; defaultApproverName:string|null;
  granted:number; used:number; remaining:number} | null} />` — Task 7이 이 컴포넌트를 쓴다.

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// components/user-history-panel.tsx
'use client'

import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'

interface HistoryUser {
  id: number
  name: string
  email: string
  hireDate: string | null
  defaultApproverName: string | null
  granted: number
  used: number
  remaining: number
}

interface HistoryEntry {
  category: '발생' | '조정' | '사용' | '결재자 변경'
  date: string
  detail: string
  reason: string
  actorName: string | null
}

interface UserHistoryPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: HistoryUser | null
}

export function UserHistoryPanel({ open, onOpenChange, user }: UserHistoryPanelProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !user) return
    setLoading(true)
    fetch(`/api/admin/users/${user.id}/history`)
      .then((res) => res.json())
      .then((list: HistoryEntry[]) => setHistory(list))
      .finally(() => setLoading(false))
  }, [open, user])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:w-[95vw] data-[side=right]:sm:max-w-none lg:data-[side=right]:w-1/4">
        <SheetHeader>
          <SheetTitle>{user?.name ?? ''}</SheetTitle>
          <SheetDescription>{user?.email ?? ''}</SheetDescription>
        </SheetHeader>
        {user && (
          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">입사일</p>
                <p>{user.hireDate ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">기본 결재자</p>
                <p>{user.defaultApproverName ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">사용가능 연차</p>
                <p>{user.granted}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">사용 연차</p>
                <p>{user.used}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">미사용 연차</p>
                <p>{user.remaining}</p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">이력</p>
              {loading ? (
                <p className="text-sm text-muted-foreground">불러오는 중...</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground">이력이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((entry, i) => (
                    <div key={i} className="rounded-md border p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{entry.category}</Badge>
                        <span className="text-xs text-muted-foreground">{entry.date}</span>
                      </div>
                      <p className="mt-1">{entry.detail}</p>
                      <p className="text-xs text-muted-foreground">
                        사유: {entry.reason}
                        {entry.actorName && ` · 처리자: ${entry.actorName}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: 타입체크 & 린트**

Run: `npx tsc --noEmit && npx eslint components/user-history-panel.tsx`
Expected: 에러 없음

- [ ] **Step 3: 수동 검증(패널 단독으로는 어느 화면도 아직 소비하지 않으므로, 최소한의 임시
      확인만 수행)**

이 태스크 시점에는 `app/admin/users/page.tsx`가 아직 이 컴포넌트를 쓰지 않는다(Task 7에서
연결). 브라우저로 직접 렌더링해서 볼 화면이 없으므로, 이 태스크의 검증은 타입체크/린트로
충분하다 — 실제 패널 동작(오픈/이력 표출/반응형 너비)은 Task 7에서 화면에 연결한 뒤
브라우저로 검증한다.

- [ ] **Step 4: 커밋**

```bash
git add components/user-history-panel.tsx
git commit -m "feat: 프리랜서 상세 패널 컴포넌트 추가(조회 전용, 요약+통합 이력)"
```

---

### Task 7: 프리랜서 정보 관리 화면 — 이름 클릭 패널 연결 + 결재자 재배정 모달화

**Files:**
- Modify: `app/admin/users/page.tsx`

**Interfaces:**
- Consumes: `UserHistoryPanel`(Task 6), `PATCH /api/admin/users/[id]`의 새 계약(Task 5,
  `defaultApproverId`와 `reason`을 함께 보내야 함)
- Produces: 없음(리프 화면)

- [ ] **Step 1: 화면 전체 재작성**

`app/admin/users/page.tsx` 파일 전체를 아래 내용으로 교체한다. 기존 `dialogUserId`/
`changeApprover`/`buildChanges`를 `pendingSave`(연차 필드 저장과 결재자 재배정을 하나의 모달
상태로 통합) + `historyUserId`(패널 오픈 상태)로 재구성했다:

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/date-picker'
import { ApproverCombobox } from '@/components/approver-combobox'
import { LeaveAdjustmentDialog } from '@/components/leave-adjustment-dialog'
import { PageHeader } from '@/components/page-header'
import { UserHistoryPanel } from '@/components/user-history-panel'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface FreelancerUser {
  id: number
  name: string
  email: string
  hireDate: string | null
  defaultApproverId: number | null
  defaultApproverName: string | null
  granted: number
  used: number
  remaining: number
  canEdit: boolean
}

interface Approver {
  id: number
  name: string
  email: string
}

interface Draft {
  hireDate: string
  grantedTotal: string
  usedTotal: string
}

type PendingSave =
  | { kind: 'fields'; userId: number }
  | { kind: 'approver'; userId: number; approverId: number }

function toDraft(user: FreelancerUser): Draft {
  return {
    hireDate: user.hireDate ?? '',
    grantedTotal: String(user.granted),
    usedTotal: String(user.used),
  }
}

export default function AdminUsersPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const callerId = Number((session?.user as { id?: string } | undefined)?.id)

  const [users, setUsers] = useState<FreelancerUser[]>([])
  const [approvers, setApprovers] = useState<Approver[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [search, setSearch] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [historyUserId, setHistoryUserId] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/admin/users')
      .then((res) => res.json())
      .then((list: FreelancerUser[]) => {
        setUsers(list)
        setDrafts(Object.fromEntries(list.map((u) => [u.id, toDraft(u)])))
      })
  }, [])

  useEffect(() => {
    if (role === 'SUPER_ADMIN') {
      fetch('/api/admin/approvers')
        .then((res) => res.json())
        .then(setApprovers)
    }
  }, [role])

  const filtered = useMemo(() => {
    const query = search.toLowerCase()
    return users
      .filter((u) => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query))
      .filter((u) => !onlyMine || u.defaultApproverId === callerId)
  }, [users, search, onlyMine, callerId])

  function updateDraft(id: number, field: keyof Draft, value: string) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  function requestApproverChange(user: FreelancerUser, approverId: number) {
    setPendingSave({ kind: 'approver', userId: user.id, approverId })
  }

  function hasPendingChange(user: FreelancerUser): boolean {
    const draft = drafts[user.id]
    if (!draft) return false
    return (
      draft.hireDate !== (user.hireDate ?? '') ||
      draft.grantedTotal !== String(user.granted) ||
      draft.usedTotal !== String(user.used)
    )
  }

  function buildFieldChanges(user: FreelancerUser) {
    const draft = drafts[user.id]
    const changes: { label: string; before: string; after: string }[] = []
    if (draft.hireDate !== (user.hireDate ?? '')) {
      changes.push({ label: '입사일', before: user.hireDate ?? '-', after: draft.hireDate || '-' })
    }
    if (draft.grantedTotal !== String(user.granted)) {
      changes.push({ label: '사용가능 연차', before: String(user.granted), after: draft.grantedTotal })
    }
    if (draft.usedTotal !== String(user.used)) {
      changes.push({ label: '사용 연차', before: String(user.used), after: draft.usedTotal })
    }
    return changes
  }

  function buildDialogChanges(): { label: string; before: string; after: string }[] {
    if (!pendingSave) return []
    const user = users.find((u) => u.id === pendingSave.userId)
    if (!user) return []
    if (pendingSave.kind === 'approver') {
      const newApprover = approvers.find((a) => a.id === pendingSave.approverId)
      return [
        {
          label: '기본 결재자',
          before: user.defaultApproverName ?? '미지정',
          after: newApprover?.name ?? '-',
        },
      ]
    }
    return buildFieldChanges(user)
  }

  async function confirmSave(reason: string) {
    if (!pendingSave) return
    const user = users.find((u) => u.id === pendingSave.userId)
    if (!user) return
    setSubmitting(true)
    try {
      if (pendingSave.kind === 'approver') {
        const res = await fetch(`/api/admin/users/${user.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ defaultApproverId: pendingSave.approverId, reason }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          setErrors((prev) => ({ ...prev, [user.id]: body?.error ?? '처리에 실패했습니다.' }))
          setPendingSave(null)
          return
        }
        const approver = approvers.find((a) => a.id === pendingSave.approverId)
        setUsers((prev) =>
          prev.map((u) =>
            u.id === user.id
              ? { ...u, defaultApproverId: pendingSave.approverId, defaultApproverName: approver?.name ?? null }
              : u
          )
        )
        setErrors((prev) => {
          const next = { ...prev }
          delete next[user.id]
          return next
        })
        setPendingSave(null)
        return
      }

      const draft = drafts[user.id]
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hireDate: draft.hireDate !== (user.hireDate ?? '') ? draft.hireDate : undefined,
          grantedTotal: draft.grantedTotal !== String(user.granted) ? Number(draft.grantedTotal) : undefined,
          usedTotal: draft.usedTotal !== String(user.used) ? Number(draft.usedTotal) : undefined,
          reason,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setErrors((prev) => ({ ...prev, [user.id]: body?.error ?? '처리에 실패했습니다.' }))
        setPendingSave(null)
        return
      }
      const updated = await res.json()
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, hireDate: draft.hireDate || null, granted: updated.granted, used: updated.used, remaining: updated.remaining }
            : u
        )
      )
      setDrafts((prev) => ({
        ...prev,
        [user.id]: {
          hireDate: draft.hireDate,
          grantedTotal: String(updated.granted),
          usedTotal: String(updated.used),
        },
      }))
      setErrors((prev) => {
        const next = { ...prev }
        delete next[user.id]
        return next
      })
      setPendingSave(null)
    } finally {
      setSubmitting(false)
    }
  }

  // 모바일 카드 레이아웃 전용(데스크톱 테이블은 셀 구조가 달라 아래에서 직접 JSX를 작성한다).
  function renderMobileFields(user: FreelancerUser) {
    const draft = drafts[user.id] ?? toDraft(user)
    const disabled = !user.canEdit
    const remaining = (Number(draft.grantedTotal) || 0) - (Number(draft.usedTotal) || 0)
    return (
      <>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">입사일</p>
          <DatePicker
            value={draft.hireDate || undefined}
            onChange={(value) => updateDraft(user.id, 'hireDate', value)}
            placeholder="입사일 선택"
            className="w-full"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">기본 결재자</p>
          {role === 'SUPER_ADMIN' ? (
            <ApproverCombobox
              value={user.defaultApproverId}
              approvers={approvers}
              onChange={(id) => requestApproverChange(user, id)}
              className="w-full"
            />
          ) : (
            <p className="text-sm">{user.defaultApproverName ?? '-'}</p>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">사용가능 연차</p>
          <Input
            type="number"
            step="0.5"
            disabled={disabled}
            value={draft.grantedTotal}
            onChange={(e) => updateDraft(user.id, 'grantedTotal', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">사용 연차</p>
          <Input
            type="number"
            step="0.5"
            disabled={disabled}
            value={draft.usedTotal}
            onChange={(e) => updateDraft(user.id, 'usedTotal', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">미사용 연차</p>
          <p className="text-sm text-muted-foreground">{remaining}</p>
        </div>
      </>
    )
  }

  return (
    <div className="w-full">
      <PageHeader title="프리랜서 정보 관리" description="프리랜서의 입사일, 기본 결재자, 연차 정보를 관리합니다." />

      <div className="mb-4 flex items-center justify-end gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="이름/이메일 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 pl-8"
          />
        </div>
        {role === 'APPROVER' && (
          <Button variant={onlyMine ? 'default' : 'outline'} onClick={() => setOnlyMine((v) => !v)}>
            담당 프리랜서만 보기
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">승인된 프리랜서가 없습니다.</p>
      ) : (
        <>
          <Table className="hidden lg:table" containerClassName="hidden lg:block">
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>입사일</TableHead>
                <TableHead>기본 결재자</TableHead>
                <TableHead>사용가능 연차</TableHead>
                <TableHead>사용 연차</TableHead>
                <TableHead>미사용 연차</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => {
                const draft = drafts[user.id] ?? toDraft(user)
                const remaining = (Number(draft.grantedTotal) || 0) - (Number(draft.usedTotal) || 0)
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="cursor-pointer text-left font-medium hover:underline"
                        onClick={() => setHistoryUserId(user.id)}
                      >
                        {user.name}
                      </button>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </TableCell>
                    <TableCell>
                      <DatePicker
                        value={draft.hireDate || undefined}
                        onChange={(value) => updateDraft(user.id, 'hireDate', value)}
                        placeholder="입사일 선택"
                      />
                    </TableCell>
                    <TableCell>
                      {role === 'SUPER_ADMIN' ? (
                        <ApproverCombobox
                          value={user.defaultApproverId}
                          approvers={approvers}
                          onChange={(id) => requestApproverChange(user, id)}
                        />
                      ) : (
                        <p className="text-sm">{user.defaultApproverName ?? '-'}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.5"
                        disabled={!user.canEdit}
                        value={draft.grantedTotal}
                        onChange={(e) => updateDraft(user.id, 'grantedTotal', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.5"
                        disabled={!user.canEdit}
                        value={draft.usedTotal}
                        onChange={(e) => updateDraft(user.id, 'usedTotal', e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{remaining}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end">
                        <Button
                          disabled={!user.canEdit || !hasPendingChange(user)}
                          onClick={() => setPendingSave({ kind: 'fields', userId: user.id })}
                        >
                          저장
                        </Button>
                      </div>
                      {errors[user.id] && (
                        <p className="mt-1 text-right text-sm text-destructive">{errors[user.id]}</p>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {filtered.map((user) => (
              <div key={user.id} className="space-y-3 rounded-lg border p-4">
                <div>
                  <button
                    type="button"
                    className="cursor-pointer text-left font-medium hover:underline"
                    onClick={() => setHistoryUserId(user.id)}
                  >
                    {user.name}
                  </button>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="space-y-2">{renderMobileFields(user)}</div>
                <Button
                  className="w-full"
                  disabled={!user.canEdit || !hasPendingChange(user)}
                  onClick={() => setPendingSave({ kind: 'fields', userId: user.id })}
                >
                  저장
                </Button>
                {errors[user.id] && <p className="text-sm text-destructive">{errors[user.id]}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {pendingSave !== null && (
        <LeaveAdjustmentDialog
          open={pendingSave !== null}
          onOpenChange={(open) => !open && setPendingSave(null)}
          changes={buildDialogChanges()}
          onConfirm={confirmSave}
          submitting={submitting}
        />
      )}

      <UserHistoryPanel
        open={historyUserId !== null}
        onOpenChange={(open) => !open && setHistoryUserId(null)}
        user={users.find((u) => u.id === historyUserId) ?? null}
      />
    </div>
  )
}
```

- [ ] **Step 2: 타입체크 & 린트**

Run: `npx tsc --noEmit && npx eslint app/admin/users/page.tsx`
Expected: 에러 없음

- [ ] **Step 3: 수동 검증**

`npm run dev` 실행 후 실제 브라우저로:
1. SUPER_ADMIN 로그인 → 이름에 마우스 올리면 밑줄이 생기는지, 커서가 포인터인지 확인
2. 이름 클릭 → 우측에서 패널이 슬라이드되며 열리는지, 요약 정보(입사일/기본결재자/연차)가
   해당 행 데이터와 일치하는지, 하단에 이력 테이블이 표시되는지 확인
3. 뷰포트를 1280px로 설정 → 패널이 열린 상태에서 브라우저 JS로 패널 요소의 실제 렌더링
   너비를 측정(`getBoundingClientRect().width`)해 뷰포트 너비의 약 25%인지 확인. 375px로
   변경해 재측정 → 약 95%인지 확인. **일치하지 않으면 `components/user-history-panel.tsx`의
   `SheetContent` className을 조정해 재확인한다** — Tailwind data 속성 변형 조합은 실제
   렌더링으로 검증하지 않으면 틀리기 쉽다
4. 배경이 딤 처리(블러)되는지 확인
5. 콤보박스에서 새 결재자를 선택 → 즉시 반영되지 않고 "기본 결재자: (이전) → (이후)" 요약과
   함께 사유 모달이 뜨는지, 사유 없이는 확인 버튼이 비활성인지 확인 → 사유 입력 후 확인 →
   반영되고 모달이 닫히는지 확인
6. 방금 바꾼 결재자 변경이 반영된 프리랜서의 이름을 다시 클릭해 패널을 열고, 이력 테이블
   최상단에 "결재자 변경" 항목이 방금 입력한 사유와 함께 나타나는지 확인
7. 기존 저장 버튼(입사일/연차 필드) 흐름이 그대로 동작하는지 회귀 확인 — 값 변경 → 저장 →
   기존과 동일한 사유 모달 → 저장 성공

- [ ] **Step 4: 커밋**

```bash
git add app/admin/users/page.tsx
git commit -m "feat: 프리랜서 정보 관리 화면에 상세 패널 연결, 결재자 재배정 사유 모달화"
```

---

### Task 8: 문서 갱신

**Files:**
- Modify: `docs/superpowers/specs/2026-08-25-approver-role-and-freelancer-info-design.md`

- [ ] **Step 1: 4.1절에 갱신 안내 추가**

`docs/superpowers/specs/2026-08-25-approver-role-and-freelancer-info-design.md`의 4.1절
("기본 결재자 | 검색 가능한 콤보박스... 선택 즉시 반영(사유 모달 없음)") 테이블 바로 아래에
추가한다:

```markdown

> **갱신 안내(2026-08-26):** 기본 결재자의 "선택 즉시 반영(사유 모달 없음)"은
> `docs/superpowers/specs/2026-08-26-freelancer-detail-panel-design.md`에서 사유 필수 모달
> 방식으로 대체되었다. 최신 내용은 해당 문서를 따른다.
```

- [ ] **Step 2: 커밋**

```bash
git add docs/superpowers/specs/2026-08-25-approver-role-and-freelancer-info-design.md
git commit -m "docs: 결재자 재배정 방식 변경에 맞춰 4.1절 갱신 안내 반영"
```

---

## Post-Plan Suggestions (범위 밖, 제안만)

- 이력 데이터가 많아지면(수백 건 이상) `GET /api/admin/users/[id]/history`에 페이지네이션
  또는 최근 N건 제한을 추가하는 게 좋다 — 이번 계획에서는 스펙 2장에서 명시적으로 범위
  제외했다.
- 결재자 변경 시 "이전 결재자에게도 알림을 보낼지"는 이번 브레인스토밍에서 "보내지 않는다"로
  확정했지만, 실사용 중 피드백이 오면 재검토 여지가 있다.
