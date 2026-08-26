# 만근 판정 정정 및 월별 자동 연차 발생 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 연차 사용은 만근 판정에 영향을 주지 않도록 로직을 정정하고, 관리자가 특정
프리랜서의 특정 평가월을 수동으로 "만근 아님"으로 예외 지정할 수 있게 하며, 예외가 없는 평가월은
매일 실행되는 Cron 배치가 자동으로 연차 1일을 발생시키도록 구현한다.

**Architecture:** `isFullAttendance` 순수 함수를 "관리자 예외만 확인" 방식으로 정정하고,
`leave_grants`에 자동 발생 건 멱등성 보장용 `period_start` 컬럼을, 신규 `attendance_exceptions`
테이블에 관리자가 등록한 예외를 저장한다. 매일 실행되는 Vercel Cron이 평가월 경계일에 해당하는
프리랜서를 찾아 예외가 없으면 `leave_grants`에 자동 발생 행(`createdBy: null`)을 삽입한다.
프리랜서 정보 관리 화면에는 행별로 "만근 예외 등록" 액션을 추가하고, 히스토리 타임라인에 새
카테고리로 노출한다.

**Tech Stack:** Next.js (App Router), Drizzle ORM + Postgres, Zod, shadcn/ui(Dialog/DatePicker),
Vitest, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-08-26-attendance-based-leave-grant-design.md`

## Global Constraints

- 변수명/함수명은 영어, 커밋 메시지/주석/문서는 한국어 (`CLAUDE.md`)
- 연차 관리는 원장(LeaveGrant) 방식 — 발생 이력 추적 필수, 자동 발생 건은 `createdBy: null`로
  저장해 기존 히스토리 분류 로직(`createdBy === null` → "발생")을 그대로 재사용한다
- 결근을 별도로 기록/관리하는 기능은 만들지 않는다 — 기본값은 항상 만근이고, 관리자가 수동으로
  등록한 예외만 그 달의 연차 발생을 막는다 (스펙 3.1절)
- 이미 종료된 평가월(자동 발생 배치가 이미 처리했을 시점)은 예외로 등록할 수 없다 — "오늘 이후
  평가월만 선택 가능"(스펙 6장)
- 배치는 멱등적이어야 한다 — 같은 (userId, periodStart)에 대해 두 번 이상 자동 발생 행을
  삽입하지 않는다(스펙 5.3절, DB unique 제약으로 보장)
- 결재자(APPROVER)의 예외 등록 권한은 기존 "본인이 기본 결재자로 지정된 프리랜서만 수정 가능"
  모델을 그대로 재사용한다(`2026-08-25-approver-role-and-freelancer-info-design.md` 4장)
- No Placeholders: 실제 동작하는 코드만, TODO/TBD 금지
- 이 저장소는 `app/`·API 라우트에 자동 테스트를 두지 않는 기존 관례를 따른다 — 순수 함수
  (`lib/domain/**`)는 Vitest로, DB/API 계층은 수동(curl) 검증으로 확인한다

---

### Task 1: 만근 판정 순수 함수 정정

**Files:**
- Modify: `lib/domain/leave-grant.ts`
- Modify: `lib/domain/leave-grant.test.ts`

**Interfaces:**
- Consumes: `getMonthlyEvaluationPeriod`(기존, `lib/domain/leave-cycle.ts`) — 변경 없음
- Produces: `isFullAttendance(hireDate: string, monthIndex: number, exceptionPeriodStarts:
  string[]): boolean` — Task 4가 이 시그니처로 호출한다. 기존 3번째 파라미터
  `approvedFullLeavePeriods: DateRange[]`와 `DateRange` 타입, `rangesOverlap` 함수는 제거된다.

- [ ] **Step 1: 실패하는 테스트로 전면 재작성**

`lib/domain/leave-grant.test.ts` 전체를 아래로 교체:

```ts
import { describe, expect, it } from 'vitest'
import { isFullAttendance } from './leave-grant'

describe('isFullAttendance', () => {
  it('예외가 없으면 만근이다', () => {
    expect(isFullAttendance('2026-03-15', 1, [])).toBe(true)
  })

  it('해당 평가월 시작일과 일치하는 예외가 있으면 만근이 아니다', () => {
    // monthIndex=1의 평가월은 2026-03-15 ~ 2026-04-15, 시작일은 2026-03-15
    expect(isFullAttendance('2026-03-15', 1, ['2026-03-15'])).toBe(false)
  })

  it('다른 평가월의 예외는 영향을 주지 않는다', () => {
    // monthIndex=1의 시작일(2026-03-15)이 아니라 monthIndex=2의 시작일(2026-04-15)에 대한 예외
    expect(isFullAttendance('2026-03-15', 1, ['2026-04-15'])).toBe(true)
  })

  it('승인된 연차 사용 데이터는 함수 시그니처에 존재하지 않으므로 만근 판정에 관여할 수 없다', () => {
    // 회귀 방지용: 세 번째 인자가 "예외 목록"만 받는다는 것 자체가 이 정책을 강제한다
    expect(isFullAttendance('2026-03-15', 1, [])).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx vitest run lib/domain/leave-grant.test.ts`
Expected: FAIL — `isFullAttendance`가 아직 옛 시그니처(`approvedFullLeavePeriods`)를 사용 중이라
두 번째 테스트("해당 평가월 시작일과 일치하는 예외가 있으면...")가 실패한다(문자열 배열을
`DateRange[]`로 잘못 다뤄 `TypeError`가 나거나 기대와 다른 결과가 나옴).

- [ ] **Step 3: 구현 정정**

`lib/domain/leave-grant.ts` 전체를 아래로 교체:

```ts
import { getMonthlyEvaluationPeriod } from './leave-cycle'

export function isFullAttendance(
  hireDate: string,
  monthIndex: number,
  exceptionPeriodStarts: string[]
): boolean {
  const period = getMonthlyEvaluationPeriod(hireDate, monthIndex)
  return !exceptionPeriodStarts.includes(period.start)
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npx vitest run lib/domain/leave-grant.test.ts`
Expected: PASS (4개 테스트)

- [ ] **Step 5: 커밋**

```bash
git add lib/domain/leave-grant.ts lib/domain/leave-grant.test.ts
git commit -m "fix: 만근 판정을 관리자 예외 지정 기준으로 정정"
```

---

### Task 2: 평가월 조회 헬퍼 추가

관리자가 임의의 날짜(그 달에 속하는 아무 날)를 고르면, 그 날짜가 속한 평가월의 시작일을 구해야
한다(Task 4의 예외 등록에서 사용). 기존 `getMonthlyAnniversaryIndex`는 "정확히 경계일인지"만
판정하므로 이 용도로는 쓸 수 없다.

**Files:**
- Modify: `lib/domain/leave-cycle.ts`
- Modify: `lib/domain/leave-cycle.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수)
- Produces: `findMonthlyEvaluationPeriod(hireDate: string, date: string): { monthIndex: number;
  start: string; end: string }` — Task 4의 `createAttendanceException`이 이 함수를 호출한다.

- [ ] **Step 1: 실패하는 테스트 추가**

`lib/domain/leave-cycle.test.ts` 파일 끝에 아래 `describe` 블록을 추가한다(기존 내용 아래,
파일 마지막에):

```ts
describe('findMonthlyEvaluationPeriod', () => {
  it('입사일 당일은 1번째 평가월(입사일~1개월 후)에 속한다', () => {
    expect(findMonthlyEvaluationPeriod('2026-03-15', '2026-03-15')).toEqual({
      monthIndex: 1,
      start: '2026-03-15',
      end: '2026-04-15',
    })
  })

  it('평가월 중간 날짜는 그 평가월에 속한다', () => {
    expect(findMonthlyEvaluationPeriod('2026-03-15', '2026-03-28')).toEqual({
      monthIndex: 1,
      start: '2026-03-15',
      end: '2026-04-15',
    })
  })

  it('경계일(다음 평가월 시작일)은 새로 시작하는 평가월에 속한다', () => {
    expect(findMonthlyEvaluationPeriod('2026-03-15', '2026-04-15')).toEqual({
      monthIndex: 2,
      start: '2026-04-15',
      end: '2026-05-15',
    })
  })

  it('몇 개월 뒤 날짜도 올바른 평가월로 매핑한다', () => {
    expect(findMonthlyEvaluationPeriod('2026-01-10', '2026-06-20')).toEqual({
      monthIndex: 6,
      start: '2026-06-10',
      end: '2026-07-10',
    })
  })
})
```

`leave-cycle.test.ts` 상단 import에 `findMonthlyEvaluationPeriod`를 추가한다(기존 import가
`import { ... } from './leave-cycle'` 형태라면 해당 줄에 이름만 추가).

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx vitest run lib/domain/leave-cycle.test.ts`
Expected: FAIL — `findMonthlyEvaluationPeriod is not a function` (또는 undefined 관련 에러)

- [ ] **Step 3: 구현 추가**

`lib/domain/leave-cycle.ts`의 `getMonthlyAnniversaryIndex` 함수 아래(파일 끝)에 추가:

```ts
export interface MonthlyEvaluationPeriod {
  monthIndex: number
  start: string
  end: string
}

// 관리자가 예외를 등록할 때 "그 달에 속하는 아무 날짜"를 고르면, 그 날짜가 속한 평가월(입사일
// 기준 앵커링)의 시작일을 역산하기 위한 함수. date는 hireDate 이후여야 한다(그 이전 날짜를
// 넘기면 monthIndex=1로 수렴한다 — 이 프로젝트에서는 호출부가 항상 hireDate 이후 날짜만 넘긴다).
export function findMonthlyEvaluationPeriod(hireDate: string, date: string): MonthlyEvaluationPeriod {
  let monthIndex = 1
  while (isOnOrAfterDate(date, addMonthsISO(hireDate, monthIndex))) {
    monthIndex++
  }
  return { monthIndex, ...getMonthlyEvaluationPeriod(hireDate, monthIndex) }
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npx vitest run lib/domain/leave-cycle.test.ts`
Expected: PASS (기존 테스트 포함 전체 통과)

- [ ] **Step 5: 커밋**

```bash
git add lib/domain/leave-cycle.ts lib/domain/leave-cycle.test.ts
git commit -m "feat: 임의 날짜가 속한 평가월을 찾는 findMonthlyEvaluationPeriod 추가"
```

---

### Task 3: DB 스키마 — `attendance_exceptions` 테이블 + `leave_grants.period_start` 컬럼

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `drizzle/0003_<generated-name>.sql` (drizzle-kit generate로 자동 생성)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `attendanceExceptions` 테이블(drizzle 스키마 객체) — 컬럼 `id, userId, periodStart, reason,
    createdBy, createdAt`. Task 4/7이 import해서 쓴다.
  - `leaveGrants.periodStart` 컬럼(nullable) — Task 4가 자동 발생 삽입 시 채운다.

- [ ] **Step 1: 스키마 수정**

`lib/db/schema.ts` 상단 import 줄을 아래로 교체(`uniqueIndex` 추가 + `sql` import 줄 신규
추가 — `sql`은 `drizzle-orm/pg-core`가 아니라 `drizzle-orm` 루트에서 export된다):

```ts
import { boolean, date, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
```

기존 `leaveGrants` 정의(파일의 `export const leaveGrants = pgTable('leave_grants', { ... })`
블록 전체)를 아래로 교체:

```ts
export const leaveGrants = pgTable(
  'leave_grants',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id),
    grantDate: date('grant_date', { mode: 'string' }).notNull(),
    amount: numeric('amount', { precision: 4, scale: 1, mode: 'number' }).notNull(),
    cycleEnd: date('cycle_end', { mode: 'string' }).notNull(),
    expired: boolean('expired').notNull().default(false),
    note: text('note'),
    createdBy: integer('created_by').references(() => users.id),
    periodStart: date('period_start', { mode: 'string' }), // 자동 발생 건에만 채움 — 배치 멱등성 보장용
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('leave_grants_user_period_unique')
      .on(t.userId, t.periodStart)
      .where(sql`${t.periodStart} IS NOT NULL`),
  ]
)
```

파일 끝(`approverChanges` 정의 다음)에 새 테이블 추가:

```ts
export const attendanceExceptions = pgTable(
  'attendance_exceptions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    reason: text('reason').notNull(),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('attendance_exceptions_user_period_unique').on(t.userId, t.periodStart)]
)
```

- [ ] **Step 2: 마이그레이션 생성**

Run: `npx drizzle-kit generate --name attendance-based-leave-grant`

Expected: `drizzle/0003_attendance-based-leave-grant.sql` 생성. 다음과 의미가 같은 내용이어야
한다(정확한 공백/줄바꿈은 drizzle-kit 버전에 따라 다를 수 있음):

```sql
CREATE TABLE "attendance_exceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"period_start" date NOT NULL,
	"reason" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leave_grants" ADD COLUMN "period_start" date;
--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_exceptions_user_period_unique" ON "attendance_exceptions" USING btree ("user_id","period_start");
--> statement-breakpoint
CREATE UNIQUE INDEX "leave_grants_user_period_unique" ON "leave_grants" USING btree ("user_id","period_start") WHERE "leave_grants"."period_start" IS NOT NULL;
```

만약 생성된 SQL이 partial unique index(`WHERE ... IS NOT NULL`) 구문을 누락했다면, 생성된
파일을 열어 `CREATE UNIQUE INDEX "leave_grants_user_period_unique" ON "leave_grants" USING
btree ("user_id","period_start");` 뒤에 `WHERE "leave_grants"."period_start" IS NOT NULL`를
직접 추가해 보강한다.

- [ ] **Step 3: 마이그레이션 적용**

Run: `npx dotenv -e .env.local -- npx drizzle-kit migrate`
Expected: 에러 없이 완료.

```bash
npx dotenv -e .env.local -- node -e "
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL || process.env.POSTGRES_URL);
sql\`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='attendance_exceptions' ORDER BY ordinal_position\`.then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `id, user_id, period_start, reason, created_by, created_at` 6개 컬럼 출력.

```bash
npx dotenv -e .env.local -- node -e "
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL || process.env.POSTGRES_URL);
sql\`SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('leave_grants','attendance_exceptions') AND indexname LIKE '%unique%'\`.then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `leave_grants_user_period_unique`의 `indexdef`에 `WHERE (period_start IS NOT NULL)`이
포함되어 있는지 확인.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat: attendance_exceptions 테이블과 leave_grants.period_start 컬럼 추가"
```

---

### Task 4: DB 레이어 — 만근 예외 등록 + 자동 발생 배치 실행

**Files:**
- Create: `lib/db/postgres-errors.ts`
- Create: `lib/db/attendance-exceptions.ts`
- Create: `lib/db/attendance-grant-batch.ts`

**Interfaces:**
- Consumes: `findMonthlyEvaluationPeriod`(Task 2), `isFullAttendance`(Task 1),
  `getMonthlyAnniversaryIndex`/`getMonthlyEvaluationPeriod`/`getCurrentCycle`(기존
  `lib/domain/leave-cycle.ts`), `attendanceExceptions`/`leaveGrants`/`users`(Task 3, `lib/db/schema.ts`)
- Produces:
  - `isUniqueViolation(error: unknown): boolean`
  - `createAttendanceException(params: { userId: number; hireDate: string; date: string; reason:
    string; createdBy: number }): Promise<{ periodStart: string } | { error: string }>` — Task 6의
    API 라우트가 호출한다.
  - `runDailyAttendanceGrantBatch(today: string): Promise<{ granted: number; skipped: number }>`
    — Task 5의 cron 라우트가 호출한다.

- [ ] **Step 1: Postgres unique violation 판별 헬퍼**

`lib/db/postgres-errors.ts` 신규 생성:

```ts
// postgres.js 드라이버는 unique 제약 위반 시 error.code에 Postgres 에러 코드를 그대로 담는다.
// 23505 = unique_violation.
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
}
```

- [ ] **Step 2: 만근 예외 등록 함수**

`lib/db/attendance-exceptions.ts` 신규 생성:

```ts
import { db } from '@/lib/db/client'
import { attendanceExceptions } from '@/lib/db/schema'
import { findMonthlyEvaluationPeriod } from '@/lib/domain/leave-cycle'
import { isUniqueViolation } from '@/lib/db/postgres-errors'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function createAttendanceException(params: {
  userId: number
  hireDate: string
  date: string
  reason: string
  createdBy: number
}): Promise<{ periodStart: string } | { error: string }> {
  const period = findMonthlyEvaluationPeriod(params.hireDate, params.date)
  if (period.end < today()) {
    return { error: '이미 종료된 평가월은 예외로 등록할 수 없습니다.' }
  }

  try {
    await db.insert(attendanceExceptions).values({
      userId: params.userId,
      periodStart: period.start,
      reason: params.reason,
      createdBy: params.createdBy,
    })
    return { periodStart: period.start }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: '이미 해당 평가월에 예외가 등록되어 있습니다.' }
    }
    throw error
  }
}
```

- [ ] **Step 3: 자동 발생 배치 실행 함수**

`lib/db/attendance-grant-batch.ts` 신규 생성:

```ts
import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendanceExceptions, leaveGrants, users } from '@/lib/db/schema'
import { getCurrentCycle, getMonthlyAnniversaryIndex, getMonthlyEvaluationPeriod } from '@/lib/domain/leave-cycle'
import { isFullAttendance } from '@/lib/domain/leave-grant'
import { isUniqueViolation } from '@/lib/db/postgres-errors'

export async function runDailyAttendanceGrantBatch(today: string): Promise<{ granted: number; skipped: number }> {
  const candidates = await db
    .select({ id: users.id, hireDate: users.hireDate })
    .from(users)
    .where(and(eq(users.signupStatus, 'APPROVED'), eq(users.role, 'FREELANCER'), isNotNull(users.hireDate)))

  const exceptionRows = await db
    .select({ userId: attendanceExceptions.userId, periodStart: attendanceExceptions.periodStart })
    .from(attendanceExceptions)

  const exceptionsByUser = new Map<number, string[]>()
  for (const row of exceptionRows) {
    const list = exceptionsByUser.get(row.userId) ?? []
    list.push(row.periodStart)
    exceptionsByUser.set(row.userId, list)
  }

  let granted = 0
  let skipped = 0

  for (const candidate of candidates) {
    const hireDate = candidate.hireDate
    if (!hireDate) continue

    const monthIndex = getMonthlyAnniversaryIndex(hireDate, today)
    if (monthIndex === null) continue

    const exceptions = exceptionsByUser.get(candidate.id) ?? []
    if (!isFullAttendance(hireDate, monthIndex, exceptions)) {
      skipped++
      continue
    }

    const periodStart = getMonthlyEvaluationPeriod(hireDate, monthIndex).start
    const cycle = getCurrentCycle(hireDate, today)

    try {
      await db.insert(leaveGrants).values({
        userId: candidate.id,
        grantDate: today,
        amount: 1,
        cycleEnd: cycle.end,
        periodStart,
        note: '자동 발생',
        createdBy: null,
      })
      granted++
    } catch (error) {
      if (isUniqueViolation(error)) {
        skipped++
        continue
      }
      throw error
    }
  }

  return { granted, skipped }
}
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add lib/db/postgres-errors.ts lib/db/attendance-exceptions.ts lib/db/attendance-grant-batch.ts
git commit -m "feat: 만근 예외 등록 및 자동 연차 발생 배치 DB 레이어 추가"
```

---

### Task 5: Cron 엔드포인트

**Files:**
- Create: `app/api/cron/attendance-grant/route.ts`
- Create: `vercel.json`
- Modify: `.env.local`

**Interfaces:**
- Consumes: `runDailyAttendanceGrantBatch`(Task 4)
- Produces: `GET /api/cron/attendance-grant` — `Authorization: Bearer $CRON_SECRET` 헤더 필요

- [ ] **Step 1: CRON_SECRET 발급 및 로컬 환경변수 추가**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

출력된 값을 `.env.local`에 추가한다(기존 내용 끝에 한 줄 추가):

```
CRON_SECRET=<위에서 생성된 값>
```

- [ ] **Step 2: Cron 라우트 작성**

`app/api/cron/attendance-grant/route.ts` 신규 생성:

```ts
import { NextResponse } from 'next/server'
import { runDailyAttendanceGrantBatch } from '@/lib/db/attendance-grant-batch'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const result = await runDailyAttendanceGrantBatch(today)
  return NextResponse.json({ ok: true, today, ...result })
}
```

- [ ] **Step 3: Vercel Cron 등록**

`vercel.json` 신규 생성(프로젝트 루트, 이미 존재한다면 `crons` 배열만 추가):

```json
{
  "crons": [
    {
      "path": "/api/cron/attendance-grant",
      "schedule": "0 18 * * *"
    }
  ]
}
```

`0 18 * * *`는 UTC 기준 매일 18시(대략 KST 새벽 3시)에 1회 실행한다는 뜻이다. 이 프로젝트의
날짜 계산은 기존 코드(`lib/db/leave-adjustments.ts`의 `today()`)와 동일하게 UTC 기준
`new Date().toISOString().slice(0, 10)`을 그대로 쓴다 — 시간대를 KST로 정밀 변환하지 않는
기존 관례를 그대로 따른다.

배포 시 Vercel 프로젝트의 환경변수에도 동일한 `CRON_SECRET` 값을 등록해야 실제 운영 환경에서
Cron이 정상 인증된다(Vercel이 Cron 호출 시 자동으로 `Authorization: Bearer $CRON_SECRET` 헤더를
붙여 보낸다). 이 등록은 배포 인프라 작업이라 이 계획의 범위 밖이며, 배포 전 별도로 처리한다.

- [ ] **Step 4: 로컬에서 인증 동작 확인**

개발 서버가 실행 중이어야 한다(`npm run dev`, 이미 떠 있다면 재사용).

인증 헤더 없이 호출 — 거부되는지 확인:

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/attendance-grant`
Expected: `401`

`.env.local`의 `CRON_SECRET` 값으로 정상 호출:

Run:
```bash
SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)
curl -s -H "Authorization: Bearer $SECRET" http://localhost:3000/api/cron/attendance-grant
```
Expected: `{"ok":true,"today":"YYYY-MM-DD","granted":0,"skipped":0}` 형태의 JSON(오늘이 실제로
아무도의 평가월 경계일이 아니라면 `granted`/`skipped`는 0일 수 있다 — Task 9에서 실제 발생
케이스를 별도로 검증한다).

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

`.env.local`은 커밋하지 않는다(이미 `.gitignore`에 포함되어 있을 것 — 포함 여부를
`git status`로 확인하고, 혹시 추적 대상이면 커밋에서 제외한다).

```bash
git add app/api/cron/attendance-grant/route.ts vercel.json
git commit -m "feat: 만근 예외 확인 후 자동 연차 발생하는 일일 Cron 엔드포인트 추가"
```

---

### Task 6: 만근 예외 등록 API 라우트

**Files:**
- Create: `app/api/admin/users/[id]/attendance-exceptions/route.ts`

**Interfaces:**
- Consumes: `requireApproverOrAbove`/`toAuthErrorResponse`(기존, `lib/auth/session.ts`),
  `createAttendanceException`(Task 4)
- Produces: `POST /api/admin/users/:id/attendance-exceptions` — body `{ date: string; reason:
  string }`, 응답 `{ ok: true; periodStart: string }` 또는 `{ error: string }`. Task 7의 UI가
  이 엔드포인트를 호출한다.

- [ ] **Step 1: API 라우트 작성**

`app/api/admin/users/[id]/attendance-exceptions/route.ts` 신규 생성:

```ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireApproverOrAbove, toAuthErrorResponse } from '@/lib/auth/session'
import { createAttendanceException } from '@/lib/db/attendance-exceptions'

const bodySchema = z.object({
  date: z.string().min(1),
  reason: z.string().min(1),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApproverOrAbove()
    const role = (session.user as { role?: string }).role
    const callerId = Number((session.user as { id?: string }).id)
    const { id } = await params
    const targetId = Number(id)

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

    const [target] = await db.select().from(users).where(eq(users.id, targetId))
    if (!target || target.role !== 'FREELANCER') {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
    }
    if (role !== 'SUPER_ADMIN' && target.defaultApproverId !== callerId) {
      return NextResponse.json({ error: '이 프리랜서를 수정할 권한이 없습니다.' }, { status: 403 })
    }
    if (!target.hireDate) {
      return NextResponse.json({ error: '입사일이 등록되지 않은 프리랜서입니다.' }, { status: 400 })
    }

    const result = await createAttendanceException({
      userId: targetId,
      hireDate: target.hireDate,
      date: parsed.data.date,
      reason: parsed.data.reason,
      createdBy: callerId,
    })
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ ok: true, periodStart: result.periodStart })
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

- [ ] **Step 3: 커밋**

```bash
git add app/api/admin/users/\[id\]/attendance-exceptions/route.ts
git commit -m "feat: 만근 예외 등록 API 라우트 추가"
```

---

### Task 7: DatePicker 확장 + 만근 예외 등록 다이얼로그 + 페이지 연동

**Files:**
- Modify: `components/date-picker.tsx`
- Create: `components/attendance-exception-dialog.tsx`
- Modify: `app/admin/users/page.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/users/:id/attendance-exceptions`(Task 6)
- Produces: `DatePicker`에 신규 선택적 prop `minDate?: string` 추가(기존 호출부는 영향 없음).
  `AttendanceExceptionDialog` 컴포넌트(props: `open, onOpenChange, userName, onConfirm(date,
  reason), submitting?, error?`).

- [ ] **Step 1: DatePicker에 `minDate` prop 추가**

`components/date-picker.tsx`를 아래로 교체:

```tsx
'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  minDate?: string
}

// 키보드로 직접 입력하지 못하도록 텍스트 인풋 대신 버튼 트리거 + 캘린더 팝오버로 구성한다.
export function DatePicker({ value, onChange, placeholder = '날짜 선택', className, minDate }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? parseISO(value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'w-40 justify-start gap-2 font-normal hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="size-4" />
          {selected ? format(selected, 'yyyy-MM-dd') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          disabled={minDate ? { before: parseISO(minDate) } : undefined}
          onSelect={(date) => {
            if (!date) return
            onChange(format(date, 'yyyy-MM-dd'))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
```

(변경점: `DatePickerProps`에 `minDate?: string` 추가, `Calendar`에 `disabled={minDate ? {
before: parseISO(minDate) } : undefined}` 추가. 그 외 동일.)

- [ ] **Step 2: 다이얼로그 컴포넌트 작성**

`components/attendance-exception-dialog.tsx` 신규 생성:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/date-picker'

interface AttendanceExceptionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userName: string
  onConfirm: (date: string, reason: string) => void
  submitting?: boolean
  error?: string | null
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AttendanceExceptionDialog({
  open,
  onOpenChange,
  userName,
  onConfirm,
  submitting = false,
  error = null,
}: AttendanceExceptionDialogProps) {
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')

  function handleOpenChange(next: boolean) {
    if (!next) {
      setDate('')
      setReason('')
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>만근 예외 등록</DialogTitle>
          <DialogDescription>
            {userName}의 특정 평가월을 만근 아님으로 지정합니다. 해당 평가월에는 자동 연차가
            발생하지 않습니다. 지정할 평가월에 속하는 날짜를 아무 날이나 선택하세요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <DatePicker value={date || undefined} onChange={setDate} minDate={today()} className="w-full" />
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예외 처리 사유를 입력하세요"
            rows={3}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button
            onClick={() => onConfirm(date, reason)}
            disabled={submitting || date.length === 0 || reason.trim().length === 0}
          >
            {submitting ? '저장 중...' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: 페이지에 상태·핸들러 추가**

`app/admin/users/page.tsx` 상단 import 목록에 추가:

```ts
import { AttendanceExceptionDialog } from '@/components/attendance-exception-dialog'
```

`const [policyOpen, setPolicyOpen] = useState(false)` 바로 아래에 상태 3개 추가:

```ts
  const [attendanceExceptionUserId, setAttendanceExceptionUserId] = useState<number | null>(null)
  const [attendanceExceptionSubmitting, setAttendanceExceptionSubmitting] = useState(false)
  const [attendanceExceptionError, setAttendanceExceptionError] = useState<string | null>(null)
```

`confirmSave` 함수 뒤(`renderMobileFields` 함수 앞)에 핸들러 추가:

```ts
  async function confirmAttendanceException(date: string, reason: string) {
    if (attendanceExceptionUserId === null) return
    setAttendanceExceptionSubmitting(true)
    setAttendanceExceptionError(null)
    try {
      const res = await fetch(`/api/admin/users/${attendanceExceptionUserId}/attendance-exceptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setAttendanceExceptionError(body?.error ?? '처리에 실패했습니다.')
        return
      }
      setAttendanceExceptionUserId(null)
    } finally {
      setAttendanceExceptionSubmitting(false)
    }
  }
```

- [ ] **Step 4: 데스크톱 테이블에 버튼 추가**

`<TableHead className="w-20 text-right"></TableHead>`를
`<TableHead className="w-44 text-right"></TableHead>`로 변경(버튼 2개가 들어가도록 폭 확장).

액션 셀(`<TableCell><div className="flex items-center justify-end">...저장 버튼...</div>` 부분)을
아래로 교체:

```tsx
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          disabled={!user.canEdit}
                          onClick={() => setAttendanceExceptionUserId(user.id)}
                        >
                          만근 예외
                        </Button>
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
```

- [ ] **Step 5: 모바일 카드에 버튼 추가**

카드의 저장 버튼 영역(`<div className="flex justify-end">...저장 버튼...</div>`)을 아래로 교체:

```tsx
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={!user.canEdit}
                    onClick={() => setAttendanceExceptionUserId(user.id)}
                  >
                    만근 예외
                  </Button>
                  <Button
                    disabled={!user.canEdit || !hasPendingChange(user)}
                    onClick={() => setPendingSave({ kind: 'fields', userId: user.id })}
                  >
                    저장
                  </Button>
                </div>
```

- [ ] **Step 6: 다이얼로그 렌더링 추가**

`<PolicyInfoSheet open={policyOpen} onOpenChange={setPolicyOpen} />` 바로 아래에 추가:

```tsx
      <AttendanceExceptionDialog
        open={attendanceExceptionUserId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAttendanceExceptionUserId(null)
            setAttendanceExceptionError(null)
          }
        }}
        userName={users.find((u) => u.id === attendanceExceptionUserId)?.name ?? ''}
        onConfirm={confirmAttendanceException}
        submitting={attendanceExceptionSubmitting}
        error={attendanceExceptionError}
      />
```

- [ ] **Step 7: 타입체크 및 린트**

Run: `npx tsc --noEmit && npx eslint components/date-picker.tsx components/attendance-exception-dialog.tsx app/admin/users/page.tsx`
Expected: 에러 없음

- [ ] **Step 8: 브라우저로 동작 확인**

개발 서버 실행 중인 상태에서 `/admin/users`에 로그인 후:
1. 아무 프리랜서 행의 "만근 예외" 버튼 클릭 → 다이얼로그가 열리는지 확인
2. 오늘 이전 날짜는 선택되지 않는지(비활성) 확인
3. 오늘 이후 날짜 + 사유 입력 후 "등록" 클릭 → 다이얼로그가 닫히고 에러가 없는지 확인
4. 같은 평가월(같은 날짜가 속한 달)에 대해 다시 등록 시도 → "이미 해당 평가월에 예외가
   등록되어 있습니다." 에러가 표시되는지 확인

- [ ] **Step 9: 커밋**

```bash
git add components/date-picker.tsx components/attendance-exception-dialog.tsx app/admin/users/page.tsx
git commit -m "feat: 프리랜서 정보 관리 화면에 만근 예외 등록 액션 추가"
```

---

### Task 8: 히스토리 타임라인에 "만근 예외" 반영

**Files:**
- Modify: `lib/domain/user-history.ts`
- Modify: `lib/domain/user-history.test.ts`
- Modify: `lib/db/user-history.ts`
- Modify: `components/user-history-panel.tsx`

**Interfaces:**
- Consumes: `addMonthsISO`(기존, `lib/domain/date-utils.ts`), `attendanceExceptions`(Task 3)
- Produces: `HistoryEntry.category`에 `'만근 예외'` 추가. `buildHistoryTimeline`의 `params`에
  선택적 필드 `exceptions?: AttendanceExceptionHistoryRow[]` 추가(기존 호출부와 하위 호환 —
  생략 시 빈 배열로 처리).

- [ ] **Step 1: 실패하는 테스트 추가**

`lib/domain/user-history.test.ts`의 마지막 `it(...)` 블록(`'세 출처를 합쳐...'`) 바로 뒤,
`})`(describe 닫는 괄호) 앞에 아래 테스트 2개 추가:

```ts
  it('만근 예외 행은 "만근 예외"로 분류하고 평가월 구간을 detail에 표시한다', () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [],
      approverChanges: [],
      exceptions: [
        {
          periodStart: '2026-08-25',
          reason: '개인 사정으로 결근',
          createdByName: '관리자',
          createdAt: '2026-08-20T09:00:00.000Z',
        },
      ],
    })
    expect(result).toEqual([
      {
        category: '만근 예외',
        date: '2026-08-20 18:00',
        detail: '2026-08-25 ~ 2026-09-25 미발생',
        reason: '개인 사정으로 결근',
        actorName: '관리자',
      },
    ])
  })

  it('exceptions를 생략해도 기존 호출부와 동일하게 동작한다', () => {
    const result = buildHistoryTimeline({ grants: [], usages: [], approverChanges: [] })
    expect(result).toEqual([])
  })
```

`'세 출처를 합쳐 createdAt 기준 내림차순으로 정렬한다'` 테스트를 아래로 교체(예외도 정렬
대상에 포함되는지 함께 검증하도록 확장):

```ts
  it('네 출처를 합쳐 createdAt 기준 내림차순으로 정렬한다', () => {
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
      exceptions: [
        {
          periodStart: '2026-07-01',
          reason: '결근',
          createdByName: '관리자',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    })
    expect(result.map((r) => r.category)).toEqual(['만근 예외', '사용', '결재자 변경', '발생'])
  })
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx vitest run lib/domain/user-history.test.ts`
Expected: FAIL — `exceptions` 프로퍼티가 타입에 없어 컴파일 에러가 나거나, 결과에 "만근 예외"
항목이 없어 assertion 실패.

- [ ] **Step 3: `buildHistoryTimeline` 구현**

`lib/domain/user-history.ts` 상단 import를 아래로 교체:

```ts
import { addMonthsISO } from './date-utils'
```

`HistoryEntry` 인터페이스의 `category` 유니온에 `'만근 예외'` 추가:

```ts
export interface HistoryEntry {
  category: '발생' | '연차 조정' | '사용' | '결재자 변경' | '입사일 변경' | '만근 예외'
  date: string
  detail: string
  reason: string
  actorName: string | null
}
```

`ApproverChangeHistoryRow` 인터페이스 아래에 새 인터페이스 추가:

```ts
export interface AttendanceExceptionHistoryRow {
  periodStart: string
  reason: string
  createdByName: string | null
  createdAt: string
}
```

`buildHistoryTimeline` 함수 시그니처와 본문을 아래로 교체:

```ts
export function buildHistoryTimeline(params: {
  grants: GrantHistoryRow[]
  usages: UsageHistoryRow[]
  approverChanges: ApproverChangeHistoryRow[]
  exceptions?: AttendanceExceptionHistoryRow[]
}): HistoryEntry[] {
  const grantEntries: SortableEntry[] = params.grants.map((g) => {
    const category = g.createdBy === null ? '발생' : g.amount === 0 ? '입사일 변경' : '연차 조정'
    return {
      entry: {
        category,
        date: formatDateTime(g.createdAt),
        detail: category === '입사일 변경' ? '-' : formatAmount(g.amount),
        reason: g.note ?? '-',
        actorName: g.createdByName,
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
    },
    sortKey: ex.createdAt,
  }))

  return [...grantEntries, ...usageEntries, ...approverChangeEntries, ...exceptionEntries]
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))
    .map((s) => s.entry)
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npx vitest run lib/domain/user-history.test.ts`
Expected: PASS (전체)

- [ ] **Step 5: DB 조회 계층에 예외 조회 추가**

`lib/db/user-history.ts`의 import 줄을 아래로 교체:

```ts
import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'
import { approverChanges, attendanceExceptions, leaveGrants, leaveRequests, users } from '@/lib/db/schema'
import { buildHistoryTimeline, type HistoryEntry } from '@/lib/domain/user-history'
```

`approverChangeRows` 조회 블록 뒤, `return buildHistoryTimeline(...)` 앞에 추가:

```ts
  const exceptionCreator = alias(users, 'exceptionCreator')
  const exceptionRows = await db
    .select({
      periodStart: attendanceExceptions.periodStart,
      reason: attendanceExceptions.reason,
      createdByName: exceptionCreator.name,
      createdAt: attendanceExceptions.createdAt,
    })
    .from(attendanceExceptions)
    .leftJoin(exceptionCreator, eq(attendanceExceptions.createdBy, exceptionCreator.id))
    .where(eq(attendanceExceptions.userId, userId))
```

`return buildHistoryTimeline({...})` 호출에 `exceptions` 필드 추가:

```ts
  return buildHistoryTimeline({
    grants: grantRows.map((g) => ({ ...g, createdAt: g.createdAt.toISOString() })),
    usages: usageRows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    approverChanges: approverChangeRows.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      afterApproverName: c.afterApproverName ?? '-',
      changedByName: c.changedByName ?? '-',
    })),
    exceptions: exceptionRows.map((ex) => ({ ...ex, createdAt: ex.createdAt.toISOString() })),
  })
```

- [ ] **Step 6: 히스토리 패널 배지 색상 추가**

`components/user-history-panel.tsx`의 로컬 `HistoryEntry` 인터페이스(`category` 유니온)에
`'만근 예외'` 추가:

```ts
interface HistoryEntry {
  category: '발생' | '연차 조정' | '사용' | '결재자 변경' | '입사일 변경' | '만근 예외'
  date: string
  detail: string
  reason: string
  actorName: string | null
}
```

`CATEGORY_BADGE_CLASS`에 항목 추가:

```ts
const CATEGORY_BADGE_CLASS: Record<HistoryEntry['category'], string> = {
  발생: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  '연차 조정': 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  사용: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  '결재자 변경': 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300',
  '입사일 변경': 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300',
  '만근 예외': 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
}
```

- [ ] **Step 7: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add lib/domain/user-history.ts lib/domain/user-history.test.ts lib/db/user-history.ts components/user-history-panel.tsx
git commit -m "feat: 히스토리 타임라인에 만근 예외 카테고리 반영"
```

---

### Task 9: 수동 End-to-End 검증

자동 발생 배치는 실제 날짜 경계에 의존하므로, "오늘"을 기준으로 정확히 평가월 경계가 되도록
입사일을 역산한 테스트 프리랜서를 만들어 검증한다. 개발 서버(`npm run dev`)가 실행 중이어야
하고, `admin@example.com` 계정으로 로그인해 관리자 화면에서 조작한다(이 저장소 관례상 API
라우트는 자동 테스트 없이 수동 검증한다).

**Files:** 없음(코드 변경 없음, 기존 기능의 실제 동작 확인)

- [ ] **Step 1: 오늘이 평가월 경계일이 되는 입사일 계산**

Run: `date -u -d "-1 month" +%F`
Expected: 오늘로부터 정확히 1개월 전 날짜(YYYY-MM-DD)가 출력된다. 이 값을 `HIRE_DATE`로
기억해 둔다 — 이 날짜를 입사일로 설정한 프리랜서는 오늘이 `monthIndex=1`의 평가월 경계일이
된다.

- [ ] **Step 2: 테스트 프리랜서 회원가입 + 승인**

`/signup`에서 임의 이메일(예: `attendance-test-1@example.com`)로 회원가입한다. 관리자로
`/admin/signups`에서 승인 처리하며, 입사일을 Step 1에서 계산한 `HIRE_DATE`로 지정하고 기본
결재자를 아무 결재자로 지정한다(가입 승인 화면에 입사일 입력 UI가 없다면, 승인 후
`/admin/users`에서 해당 프리랜서 행의 입사일을 `HIRE_DATE`로 수정 저장한다).

- [ ] **Step 3: 배치 실행 전 잔여 연차 확인**

`/admin/users`에서 해당 프리랜서의 "발생 연차"가 `0`인지 확인한다.

- [ ] **Step 4: 배치 1차 실행 — 연차 발생 확인**

Run:
```bash
SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)
curl -s -H "Authorization: Bearer $SECRET" http://localhost:3000/api/cron/attendance-grant
```
Expected: 응답의 `granted`가 1 이상. `/admin/users`를 새로고침해 해당 프리랜서의 "발생 연차"가
`1`로 늘었는지 확인. 해당 프리랜서 이름을 클릭해 히스토리 패널을 열고 "발생" 카테고리 항목이
추가되었는지 확인.

- [ ] **Step 5: 배치 2차 실행 — 멱등성 확인**

동일한 curl 명령을 다시 실행한다.

Expected: 서버 에러(500) 없이 정상 응답. `/admin/users`를 새로고침해 "발생 연차"가 여전히 `1`
(중복으로 `2`가 되지 않음)인지 확인.

- [ ] **Step 6: 만근 예외 경로 확인**

새 테스트 프리랜서를 하나 더 만든다(Step 1~2 반복, 다른 이메일). 이번에는 연차 발생 배치를
돌리기 전에 `/admin/users`에서 "만근 예외" 버튼으로 오늘 날짜를 선택해 예외를 등록한다(오늘은
`minDate` 제약상 선택 가능한 가장 이른 날짜이며, `HIRE_DATE + 1개월 = 오늘`이 정확히 그 평가월의
시작일이므로 오늘 날짜를 고르면 해당 평가월에 대한 예외가 등록된다).

Run:
```bash
curl -s -H "Authorization: Bearer $SECRET" http://localhost:3000/api/cron/attendance-grant
```

Expected: 응답의 `skipped`가 1 이상. `/admin/users`에서 이 프리랜서의 "발생 연차"가 `0`으로
유지되는지 확인. 히스토리 패널에 "만근 예외" 카테고리 항목이 표시되는지 확인.

- [ ] **Step 7: 테스트 데이터 정리 여부 확인**

Step 2, 6에서 만든 테스트 프리랜서 계정을 실제 운영 DB에 남겨둘지 삭제할지 사용자에게 확인한다
(이 저장소에는 사용자 삭제 API가 없으므로, 삭제가 필요하면 DB에서 직접 처리 여부를 논의한다).

- [ ] **Step 8: 전체 테스트 스위트 + 타입체크 최종 확인**

Run: `npx vitest run && npx tsc --noEmit && npx eslint`
Expected: 전부 에러 없음.
