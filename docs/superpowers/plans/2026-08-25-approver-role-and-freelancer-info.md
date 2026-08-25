# 결재자 역할 도입 및 프리랜서 정보 관리 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `users.role`을 `SUPER_ADMIN`/`APPROVER`/`FREELANCER` 3종으로 확장하고, 그 위에 프리랜서
정보 관리 화면 개편(연차 표시/수정, 기본 결재자 검색 지정, 검색/필터), 가입 승인 시 권한 지정,
결재담당자 관리 신규 화면, 연차 조정 원장 기록 및 알림을 구현한다.

**Architecture:** 기존 원장 테이블(`leaveGrants`, `leaveRequests`)에 "조정 레코드"를 끼워 넣는
방식으로 연차 수동 조정을 구현하고(새 테이블 없음), 서버 권한 함수를 역할별로 분리해 API 라우트에서
행 단위 접근 제어를 수행한다. UI는 기존 Table/카드 반응형 패턴을 유지한 채 컬럼과 편집 로직만
교체한다.

**Tech Stack:** Next.js App Router, Drizzle ORM(Postgres), NextAuth v5, Zod, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-approver-role-and-freelancer-info-design.md`
(기준 문서: `docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md`)

## Global Constraints

- 커밋 메시지·코드 주석·문서는 한국어, 변수명·함수명은 영어로 작성한다.
- `lib/domain/**`의 순수 함수는 Vitest로 테스트한다(`vitest.config.ts`가 `lib/**/*.test.ts`만
  수집 — 이 레포의 기존 관례로, `app/`·API 라우트는 자동 테스트 없이 수동(curl/브라우저)으로
  검증한다).
- DB 스키마 변경은 `npx drizzle-kit generate` → 생성된 SQL 검토/보강 → `npx drizzle-kit migrate`
  순서로 진행한다(`drizzle.config.ts`의 `POSTGRES_URL_NON_POOLING` 사용).
- 연차 조정 시 실시간 알림은 `notifications` 테이블에 레코드를 **생성하는 것까지만** 한다.
  Supabase Realtime 구독/알림 벨 UI는 이 저장소에 아직 전혀 구현되어 있지 않으므로(스펙에
  "재사용"이라 적혀 있었지만 실제로는 스키마만 존재) 이번 계획에 포함하지 않는다 — 그 UI가
  나중에 만들어지면 바로 소비 가능한 레코드만 남겨둔다.
- SUPER_ADMIN 계정 생성 방식은 변경하지 않는다(시드 스크립트로만 생성).
- "내 휴가정보" 상세 조회 화면은 만들지 않는다(범위 밖).

---

### Task 1: 데이터 모델 마이그레이션 (역할 값 확장, 컬럼 정리)

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/seed-admin.ts`
- Create: `drizzle/0001_<generated-name>.sql` (drizzle-kit generate로 자동 생성 후 수동 보강)

**Interfaces:**
- Produces: `users` 테이블에서 `position`, `department` 컬럼 제거. `leaveGrants` 테이블에
  nullable `createdBy: integer` 컬럼(`created_by`) 추가. `users.role` 저장 가능한 문자열 값이
  `'SUPER_ADMIN' | 'APPROVER' | 'FREELANCER'`로 바뀜(컬럼 타입 자체는 기존과 동일한
  `varchar(20)`이라 DDL 변경 없음, 주석과 기존 데이터 값만 갱신).

- [ ] **Step 1: schema.ts에서 컬럼 제거/추가**

`lib/db/schema.ts`의 `users` 테이블 정의에서 `position`, `department` 줄을 삭제하고 `role` 주석을
갱신한다:

```ts
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('FREELANCER'), // 'SUPER_ADMIN' | 'APPROVER' | 'FREELANCER'
  signupStatus: varchar('signup_status', { length: 20 }).notNull().default('PENDING'), // 'PENDING' | 'APPROVED' | 'REJECTED'
  hireDate: date('hire_date', { mode: 'string' }),
  defaultApproverId: integer('default_approver_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

`leaveGrants` 테이블에 `createdBy` 컬럼을 추가한다(조정 레코드를 누가 만들었는지 추적):

```ts
export const leaveGrants = pgTable('leave_grants', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  grantDate: date('grant_date', { mode: 'string' }).notNull(),
  amount: numeric('amount', { precision: 4, scale: 1, mode: 'number' }).notNull(),
  cycleEnd: date('cycle_end', { mode: 'string' }).notNull(),
  expired: boolean('expired').notNull().default(false),
  note: text('note'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

`leaveRequests.type` 컬럼은 그대로 두되(varchar, DDL 변경 불필요), 주석에 `'ADJUSTMENT'` 값을
추가한다:

```ts
  type: varchar('type', { length: 10 }).notNull(), // 'FULL' | 'AM_HALF' | 'PM_HALF' | 'ADJUSTMENT'
```

- [ ] **Step 2: 마이그레이션 생성**

Run: `npx drizzle-kit generate --name approver-role-and-leave-adjustment`

`drizzle/` 아래 새 SQL 파일(예: `0001_approver-role-and-leave-adjustment.sql`)이 생성된다. 내용은
`ALTER TABLE users DROP COLUMN position; ALTER TABLE users DROP COLUMN department; ALTER TABLE
leave_grants ADD COLUMN created_by integer REFERENCES users(id);` 형태여야 한다. 생성된 파일을 열어
확인한다.

- [ ] **Step 3: 생성된 마이그레이션에 데이터 마이그레이션 문 추가**

생성된 SQL 파일 맨 끝에 기존 `'ADMIN'` role 값을 `'SUPER_ADMIN'`으로 옮기는 문장을 직접 추가한다
(이후 어떤 환경에 이 마이그레이션을 적용하든 동일하게 반영되도록):

```sql
UPDATE users SET role = 'SUPER_ADMIN' WHERE role = 'ADMIN';
```

- [ ] **Step 4: 마이그레이션 적용**

Run: `npx drizzle-kit migrate`

Expected: 에러 없이 완료. 완료 후 아래로 실제 반영 여부 확인:

```bash
node -e "
const { config } = require('dotenv');
config({ path: '.env.local' });
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL);
sql\`SELECT id, role FROM users\`.then(r => { console.log(r); return sql.end(); });
"
```

Expected: 기존 `role='ADMIN'`이었던 행이 `role='SUPER_ADMIN'`으로 보임. `position`/`department`
컬럼이 결과에 없음(SELECT *가 아니라 명시 컬럼이라 이 커맨드 자체로는 컬럼 삭제를 검증 못 하니,
아래로 한 번 더 확인).

```bash
node -e "
const { config } = require('dotenv');
config({ path: '.env.local' });
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL);
sql\`SELECT column_name FROM information_schema.columns WHERE table_name='users'\`.then(r => { console.log(r.map(x => x.column_name)); return sql.end(); });
"
```

Expected: 출력 배열에 `position`, `department`가 없어야 한다.

- [ ] **Step 5: seed-admin.ts 갱신**

`lib/db/seed-admin.ts`의 `role: 'ADMIN'`을 `role: 'SUPER_ADMIN'`으로 바꾼다:

```ts
  await db.insert(users).values({
    name: '관리자',
    email: 'admin@example.com',
    passwordHash,
    role: 'SUPER_ADMIN',
    signupStatus: 'APPROVED',
  })
```

- [ ] **Step 6: 타입체크 & 커밋**

Run: `npx tsc --noEmit`

Expected: `position`/`department`를 참조하던 곳(다음 태스크들에서 고칠 API/화면 코드)에서 에러가
날 수 있다 — 이 태스크 시점에는 `app/api/admin/users/route.ts` 등에서 에러가 나는 게 정상이다.
스키마/시드/마이그레이션 파일만 우선 커밋한다.

```bash
git add lib/db/schema.ts lib/db/seed-admin.ts drizzle/
git commit -m "feat: role을 SUPER_ADMIN/APPROVER/FREELANCER 3종으로 확장, 직급/부서 컬럼 제거"
```

---

### Task 2: 권한 헬퍼 함수 (`requireSuperAdmin`, `requireApproverOrAbove`)

**Files:**
- Modify: `lib/auth/session.ts`

**Interfaces:**
- Produces: `requireSuperAdmin(): Promise<Session>` (role !== 'SUPER_ADMIN'이면 `ForbiddenError`),
  `requireApproverOrAbove(): Promise<Session>` (role이 'APPROVER'도 'SUPER_ADMIN'도 아니면
  `ForbiddenError`). 기존 `requireAdmin`은 제거하고 이후 모든 태스크에서 위 두 함수로 대체한다.

- [ ] **Step 1: session.ts 수정**

```ts
import { auth } from '@/lib/auth'

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

export async function requireApprovedUser() {
  const session = await auth()
  if (!session?.user) {
    throw new UnauthorizedError('로그인이 필요합니다.')
  }
  return session
}

export async function requireSuperAdmin() {
  const session = await requireApprovedUser()
  if ((session.user as { role?: string }).role !== 'SUPER_ADMIN') {
    throw new ForbiddenError('최고관리자만 접근할 수 있습니다.')
  }
  return session
}

export async function requireApproverOrAbove() {
  const session = await requireApprovedUser()
  const role = (session.user as { role?: string }).role
  if (role !== 'SUPER_ADMIN' && role !== 'APPROVER') {
    throw new ForbiddenError('결재자 또는 최고관리자만 접근할 수 있습니다.')
  }
  return session
}
```

- [ ] **Step 2: 기존 사용처 치환**

`app/api/admin/signups/route.ts`, `app/api/admin/signups/[id]/route.ts`의 `requireAdmin` import와
호출을 `requireSuperAdmin`으로 바꾼다(이 두 라우트는 계속 SUPER_ADMIN 전용). `app/api/admin/users/
route.ts`, `app/api/admin/users/[id]/route.ts`는 Task 12/13에서 `requireApproverOrAbove`로 바꿀
것이므로 이 태스크에서는 건드리지 않는다.

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`

Expected: `requireAdmin`을 아직 쓰는 곳이 없어야 한다(위에서 다 치환했으므로 에러 없이 통과).

- [ ] **Step 4: 커밋**

```bash
git add lib/auth/session.ts app/api/admin/signups/route.ts "app/api/admin/signups/[id]/route.ts"
git commit -m "feat: 권한 함수를 requireSuperAdmin/requireApproverOrAbove로 분리"
```

---

### Task 3: 연차 조정 순수 로직 (TDD)

**Files:**
- Create: `lib/domain/leave-adjustment.ts`
- Test: `lib/domain/leave-adjustment.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수)
- Produces:
  - `calculateAdjustmentDelta(currentTotal: number, newTotal: number): number`
  - `buildGrantAdjustmentRow(params: { userId: number; currentGranted: number; newGranted: number; today: string; cycleEnd: string; reason: string; createdBy: number }): { userId: number; grantDate: string; amount: number; cycleEnd: string; expired: false; note: string; createdBy: number } | null`
  - `buildUsageAdjustmentRow(params: { userId: number; currentUsed: number; newUsed: number; today: string; reason: string; approverId: number }): { userId: number; approverId: number; title: string; startDate: string; endDate: string; type: 'ADJUSTMENT'; requestedDays: number; reason: string; status: 'APPROVED' } | null`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/domain/leave-adjustment.test.ts
import { describe, expect, it } from 'vitest'
import { calculateAdjustmentDelta, buildGrantAdjustmentRow, buildUsageAdjustmentRow } from './leave-adjustment'

describe('calculateAdjustmentDelta', () => {
  it('새 값이 더 크면 양수 델타를 반환한다', () => {
    expect(calculateAdjustmentDelta(5, 8)).toBe(3)
  })

  it('새 값이 더 작으면 음수 델타를 반환한다', () => {
    expect(calculateAdjustmentDelta(5, 2)).toBe(-3)
  })

  it('0.5 단위 소수를 정확히 계산한다', () => {
    expect(calculateAdjustmentDelta(5, 5.5)).toBe(0.5)
  })

  it('부동소수점 오차를 반올림으로 보정한다', () => {
    expect(calculateAdjustmentDelta(0.1, 0.2)).toBe(0.1)
  })
})

describe('buildGrantAdjustmentRow', () => {
  const base = {
    userId: 1,
    currentGranted: 5,
    newGranted: 8,
    today: '2026-09-01',
    cycleEnd: '2027-01-01',
    reason: '야근 보상 휴가',
    createdBy: 99,
  }

  it('변경분이 있으면 조정 레코드를 만든다', () => {
    expect(buildGrantAdjustmentRow(base)).toEqual({
      userId: 1,
      grantDate: '2026-09-01',
      amount: 3,
      cycleEnd: '2027-01-01',
      expired: false,
      note: '야근 보상 휴가',
      createdBy: 99,
    })
  })

  it('변경분이 없으면 null을 반환한다', () => {
    expect(buildGrantAdjustmentRow({ ...base, newGranted: 5 })).toBeNull()
  })

  it('감액도 음수 amount로 만든다', () => {
    const row = buildGrantAdjustmentRow({ ...base, newGranted: 2 })
    expect(row?.amount).toBe(-3)
  })
})

describe('buildUsageAdjustmentRow', () => {
  const base = {
    userId: 1,
    currentUsed: 2,
    newUsed: 5,
    today: '2026-09-01',
    reason: '시스템 도입 전 사용분 반영',
    approverId: 99,
  }

  it('변경분이 있으면 ADJUSTMENT 타입 레코드를 만든다', () => {
    expect(buildUsageAdjustmentRow(base)).toEqual({
      userId: 1,
      approverId: 99,
      title: '연차 사용 수동 조정',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
      type: 'ADJUSTMENT',
      requestedDays: 3,
      reason: '시스템 도입 전 사용분 반영',
      status: 'APPROVED',
    })
  })

  it('변경분이 없으면 null을 반환한다', () => {
    expect(buildUsageAdjustmentRow({ ...base, newUsed: 2 })).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/domain/leave-adjustment.test.ts`
Expected: FAIL — `Cannot find module './leave-adjustment'`

- [ ] **Step 3: 구현**

```ts
// lib/domain/leave-adjustment.ts
export function calculateAdjustmentDelta(currentTotal: number, newTotal: number): number {
  return Math.round((newTotal - currentTotal) * 10) / 10
}

export interface GrantAdjustmentRow {
  userId: number
  grantDate: string
  amount: number
  cycleEnd: string
  expired: false
  note: string
  createdBy: number
}

export function buildGrantAdjustmentRow(params: {
  userId: number
  currentGranted: number
  newGranted: number
  today: string
  cycleEnd: string
  reason: string
  createdBy: number
}): GrantAdjustmentRow | null {
  const amount = calculateAdjustmentDelta(params.currentGranted, params.newGranted)
  if (amount === 0) return null
  return {
    userId: params.userId,
    grantDate: params.today,
    amount,
    cycleEnd: params.cycleEnd,
    expired: false,
    note: params.reason,
    createdBy: params.createdBy,
  }
}

export interface UsageAdjustmentRow {
  userId: number
  approverId: number
  title: string
  startDate: string
  endDate: string
  type: 'ADJUSTMENT'
  requestedDays: number
  reason: string
  status: 'APPROVED'
}

export function buildUsageAdjustmentRow(params: {
  userId: number
  currentUsed: number
  newUsed: number
  today: string
  reason: string
  approverId: number
}): UsageAdjustmentRow | null {
  const requestedDays = calculateAdjustmentDelta(params.currentUsed, params.newUsed)
  if (requestedDays === 0) return null
  return {
    userId: params.userId,
    approverId: params.approverId,
    title: '연차 사용 수동 조정',
    startDate: params.today,
    endDate: params.today,
    type: 'ADJUSTMENT',
    requestedDays,
    reason: params.reason,
    status: 'APPROVED',
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/domain/leave-adjustment.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/domain/leave-adjustment.ts lib/domain/leave-adjustment.test.ts
git commit -m "feat: 연차 조정 델타 계산 및 원장 레코드 생성 순수 함수 추가"
```

---

### Task 4: 연차 조정 DB 헬퍼 & 알림 헬퍼

**Files:**
- Create: `lib/db/leave-adjustments.ts`
- Create: `lib/db/notifications.ts`

**Interfaces:**
- Consumes: `calculateLeaveBalance` (`lib/domain/leave-balance.ts`), `getCurrentCycle`
  (`lib/domain/leave-cycle.ts`), `buildGrantAdjustmentRow`/`buildUsageAdjustmentRow`
  (`lib/domain/leave-adjustment.ts`), `db`(`lib/db/client.ts`), `leaveGrants`/`leaveRequests`/
  `notifications`(`lib/db/schema.ts`)
- Produces:
  - `getLeaveBalance(userId: number, hireDate: string, asOfDate: string): Promise<LeaveBalanceResult>`
  - `applyGrantAdjustment(params: { userId: number; hireDate: string; newGranted: number; reason: string; createdBy: number }): Promise<GrantAdjustmentRow | null>`
  - `applyUsageAdjustment(params: { userId: number; hireDate: string; newUsed: number; reason: string; approverId: number }): Promise<UsageAdjustmentRow | null>`
  - `createNotification(params: { recipientId: number; type: string; refId: number; message: string }): Promise<void>`

이 파일들은 실제 DB에 접속하므로 자동 테스트 대상이 아니다(Global Constraints 참고). Task 13에서
API 라우트를 통해 수동으로 검증한다.

- [ ] **Step 1: leave-adjustments.ts 작성**

```ts
// lib/db/leave-adjustments.ts
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leaveGrants, leaveRequests } from '@/lib/db/schema'
import { calculateLeaveBalance, type LeaveBalanceResult } from '@/lib/domain/leave-balance'
import { buildGrantAdjustmentRow, buildUsageAdjustmentRow, type GrantAdjustmentRow, type UsageAdjustmentRow } from '@/lib/domain/leave-adjustment'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function getLeaveBalance(
  userId: number,
  hireDate: string,
  asOfDate: string
): Promise<LeaveBalanceResult> {
  const grants = await db
    .select({ amount: leaveGrants.amount, grantDate: leaveGrants.grantDate })
    .from(leaveGrants)
    .where(eq(leaveGrants.userId, userId))
  const usages = await db
    .select({ requestedDays: leaveRequests.requestedDays, startDate: leaveRequests.startDate })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'APPROVED')))
  return calculateLeaveBalance(hireDate, asOfDate, grants, usages)
}

export async function applyGrantAdjustment(params: {
  userId: number
  hireDate: string
  newGranted: number
  reason: string
  createdBy: number
}): Promise<GrantAdjustmentRow | null> {
  const asOfDate = today()
  const balance = await getLeaveBalance(params.userId, params.hireDate, asOfDate)
  const row = buildGrantAdjustmentRow({
    userId: params.userId,
    currentGranted: balance.granted,
    newGranted: params.newGranted,
    today: asOfDate,
    cycleEnd: balance.cycleEnd,
    reason: params.reason,
    createdBy: params.createdBy,
  })
  if (row) await db.insert(leaveGrants).values(row)
  return row
}

export async function applyUsageAdjustment(params: {
  userId: number
  hireDate: string
  newUsed: number
  reason: string
  approverId: number
}): Promise<UsageAdjustmentRow | null> {
  const asOfDate = today()
  const balance = await getLeaveBalance(params.userId, params.hireDate, asOfDate)
  const row = buildUsageAdjustmentRow({
    userId: params.userId,
    currentUsed: balance.used,
    newUsed: params.newUsed,
    today: asOfDate,
    reason: params.reason,
    approverId: params.approverId,
  })
  if (row) await db.insert(leaveRequests).values(row)
  return row
}
```

- [ ] **Step 2: notifications.ts 작성**

```ts
// lib/db/notifications.ts
import { db } from '@/lib/db/client'
import { notifications } from '@/lib/db/schema'

export async function createNotification(params: {
  recipientId: number
  type: string
  refId: number
  message: string
}): Promise<void> {
  await db.insert(notifications).values(params)
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add lib/db/leave-adjustments.ts lib/db/notifications.ts
git commit -m "feat: 연차 조정 DB 헬퍼와 알림 생성 헬퍼 추가"
```

---

### Task 5: 가입 승인 API — 권한(role) 선택 반영

**Files:**
- Modify: `app/api/admin/signups/[id]/route.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin`(Task 2)
- Produces: `PATCH /api/admin/signups/[id]` 요청 바디에 `role?: 'FREELANCER' | 'APPROVER'` 추가

- [ ] **Step 1: 라우트 수정**

```ts
// app/api/admin/signups/[id]/route.ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireSuperAdmin } from '@/lib/auth/session'

const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  role: z.enum(['FREELANCER', 'APPROVER']).optional(),
  hireDate: z.string().optional(),
  defaultApproverId: z.number().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin()
  const { id } = await params
  const body = await request.json()
  const parsed = decisionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  if (parsed.data.decision === 'APPROVED') {
    if (!parsed.data.role) {
      return NextResponse.json({ error: '승인 시 권한(프리랜서/결재담당자)을 선택해야 합니다.' }, { status: 400 })
    }
    if (parsed.data.role === 'FREELANCER' && !parsed.data.hireDate) {
      return NextResponse.json({ error: '프리랜서 승인 시 입사일은 필수입니다.' }, { status: 400 })
    }
  }

  const isFreelancer = parsed.data.role === 'FREELANCER'
  await db
    .update(users)
    .set({
      signupStatus: parsed.data.decision,
      role: parsed.data.role,
      hireDate: isFreelancer ? parsed.data.hireDate : undefined,
      defaultApproverId: isFreelancer ? parsed.data.defaultApproverId : undefined,
    })
    .where(eq(users.id, Number(id)))

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add "app/api/admin/signups/[id]/route.ts"
git commit -m "feat: 가입 승인 API에 프리랜서/결재담당자 권한 선택 반영"
```

---

### Task 6: 가입 승인 화면 — 권한 선택 UI

**Files:**
- Modify: `app/admin/signups/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/admin/signups/[id]` (Task 5, 바디에 `role` 포함)
- Produces: 없음(리프 화면)

- [ ] **Step 1: shadcn Select는 이미 설치되어 있음 확인**

`components/ui/select.tsx`가 이미 존재하므로 추가 설치 없이 사용한다.

- [ ] **Step 2: page.tsx에 역할 선택 상태 추가**

`app/admin/signups/page.tsx`의 `interface PendingUser`는 그대로 두고, 상태와 렌더링을 아래처럼
바꾼다(파일 전체를 이 내용으로 교체):

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/date-picker'
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

interface PendingUser {
  id: number
  name: string
  email: string
}

type SignupRole = 'FREELANCER' | 'APPROVER'

export default function AdminSignupsPage() {
  const [pending, setPending] = useState<PendingUser[]>([])
  const [roles, setRoles] = useState<Record<number, SignupRole>>({})
  const [hireDates, setHireDates] = useState<Record<number, string>>({})
  const [errors, setErrors] = useState<Record<number, string>>({})

  useEffect(() => {
    fetch('/api/admin/signups')
      .then((res) => res.json())
      .then(setPending)
  }, [])

  function getRole(id: number): SignupRole {
    return roles[id] ?? 'FREELANCER'
  }

  async function decide(id: number, decision: 'APPROVED' | 'REJECTED') {
    const role = getRole(id)
    const res = await fetch(`/api/admin/signups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision,
        role: decision === 'APPROVED' ? role : undefined,
        hireDate: decision === 'APPROVED' && role === 'FREELANCER' ? hireDates[id] : undefined,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setErrors((prev) => ({
        ...prev,
        [id]: body?.error ?? '처리에 실패했습니다.',
      }))
      return
    }
    setErrors((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setPending((prev) => prev.filter((u) => u.id !== id))
  }

  function renderFields(user: PendingUser, layout: 'row' | 'stack') {
    const role = getRole(user.id)
    const wrapClass = layout === 'row' ? 'flex items-center gap-2' : 'space-y-1'
    return (
      <div className={wrapClass}>
        {layout === 'stack' && <p className="text-xs text-muted-foreground">권한</p>}
        <Select value={role} onValueChange={(value) => setRoles((prev) => ({ ...prev, [user.id]: value as SignupRole }))}>
          <SelectTrigger className={layout === 'row' ? 'w-32' : 'w-full'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FREELANCER">프리랜서</SelectItem>
            <SelectItem value="APPROVER">결재담당자</SelectItem>
          </SelectContent>
        </Select>
        {role === 'FREELANCER' && (
          <div className={layout === 'stack' ? 'space-y-1' : undefined}>
            {layout === 'stack' && <p className="text-xs text-muted-foreground">입사일</p>}
            <DatePicker
              value={hireDates[user.id]}
              onChange={(value) => setHireDates((prev) => ({ ...prev, [user.id]: value }))}
              placeholder="입사일 선택"
              className={layout === 'stack' ? 'w-full' : 'w-40'}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full">
      <PageHeader title="가입 승인" description="프리랜서 가입 신청을 검토하고 승인 또는 거절합니다." />
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">대기 중인 신청이 없습니다.</p>
      ) : (
        <>
          <Table className="hidden lg:table" containerClassName="hidden lg:block">
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>권한 / 입사일</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>{renderFields(user, 'row')}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button onClick={() => decide(user.id, 'APPROVED')}>승인</Button>
                      <Button variant="outline" onClick={() => decide(user.id, 'REJECTED')}>
                        거절
                      </Button>
                    </div>
                    {errors[user.id] && (
                      <p className="mt-1 text-right text-sm text-destructive">{errors[user.id]}</p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {pending.map((user) => (
              <div key={user.id} className="space-y-3 rounded-lg border p-4">
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                {renderFields(user, 'stack')}
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => decide(user.id, 'APPROVED')}>
                    승인
                  </Button>
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() => decide(user.id, 'REJECTED')}
                  >
                    거절
                  </Button>
                </div>
                {errors[user.id] && <p className="text-sm text-destructive">{errors[user.id]}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 타입체크 & 린트**

Run: `npx tsc --noEmit && npx eslint app/admin/signups/page.tsx`
Expected: 에러 없음

- [ ] **Step 4: 수동 검증**

`npm run dev` 실행 후 SUPER_ADMIN으로 로그인 → 테스트 계정으로 `/signup`에서 신규 가입 →
`/admin/signups`에서 권한을 "결재담당자"로 바꾸면 입사일 필드가 사라지는지, "프리랜서"로 두면
입사일 DatePicker가 필수로 남아있는지 확인. 결재담당자로 승인 후 DB에서
`SELECT role, hire_date FROM users WHERE email='...'`로 `role='APPROVER'`, `hire_date=NULL` 확인.

- [ ] **Step 5: 커밋**

```bash
git add app/admin/signups/page.tsx
git commit -m "feat: 가입 승인 화면에 프리랜서/결재담당자 권한 선택 UI 추가"
```

---

### Task 7: 결재담당자 목록 API

**Files:**
- Create: `app/api/admin/approvers/route.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin`(Task 2)
- Produces: `GET /api/admin/approvers` → `Array<{ id: number; name: string; email: string; role: 'SUPER_ADMIN' | 'APPROVER' }>`

- [ ] **Step 1: 라우트 작성**

```ts
// app/api/admin/approvers/route.ts
import { inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireSuperAdmin } from '@/lib/auth/session'

export async function GET() {
  await requireSuperAdmin()
  const list = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(inArray(users.role, ['APPROVER', 'SUPER_ADMIN']))
  return NextResponse.json(list)
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 수동 검증**

`npm run dev` 실행 후 SUPER_ADMIN 세션 쿠키로 `curl http://localhost:3000/api/admin/approvers`
호출 — SUPER_ADMIN/APPROVER 계정만 배열로 나오는지 확인(FREELANCER 계정은 빠져야 함).

- [ ] **Step 4: 커밋**

```bash
git add app/api/admin/approvers/route.ts
git commit -m "feat: 결재담당자(APPROVER+SUPER_ADMIN) 목록 API 추가"
```

---

### Task 8: 결재담당자 관리 화면

**Files:**
- Create: `app/admin/approvers/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/approvers`(Task 7)
- Produces: 없음(리프 화면, 조회 전용)

- [ ] **Step 1: 화면 작성**

```tsx
// app/admin/approvers/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/page-header'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ApproverUser {
  id: number
  name: string
  email: string
  role: 'SUPER_ADMIN' | 'APPROVER'
}

function roleLabel(role: ApproverUser['role']) {
  return role === 'SUPER_ADMIN' ? '최고관리자' : '결재자'
}

export default function AdminApproversPage() {
  const [approvers, setApprovers] = useState<ApproverUser[]>([])

  useEffect(() => {
    fetch('/api/admin/approvers')
      .then((res) => res.json())
      .then(setApprovers)
  }, [])

  return (
    <div className="w-full">
      <PageHeader title="결재담당자 관리" description="결재 권한을 가진 계정 목록을 확인합니다." />
      {approvers.length === 0 ? (
        <p className="text-sm text-muted-foreground">등록된 결재담당자가 없습니다.</p>
      ) : (
        <>
          <Table className="hidden lg:table" containerClassName="hidden lg:block">
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>역할</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvers.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-muted-foreground">{a.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{roleLabel(a.role)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {approvers.map((a) => (
              <div key={a.id} className="space-y-2 rounded-lg border p-4">
                <p className="font-medium">{a.name}</p>
                <p className="text-sm text-muted-foreground">{a.email}</p>
                <Badge variant="outline">{roleLabel(a.role)}</Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입체크 & 린트**

Run: `npx tsc --noEmit && npx eslint app/admin/approvers/page.tsx`
Expected: 에러 없음

- [ ] **Step 3: 수동 검증**

`/admin/approvers` 접속 → SUPER_ADMIN 계정(과 있다면 APPROVER 계정)이 배지와 함께 나오는지 확인.
FREELANCER로 로그인한 세션으로 API를 직접 호출하면 403이 나는지 확인(`requireSuperAdmin` 검증).

- [ ] **Step 4: 커밋**

```bash
git add app/admin/approvers/page.tsx
git commit -m "feat: 결재담당자 관리 조회 화면 추가"
```

---

### Task 9: shadcn Dialog 설치 + 연차 조정 사유 모달 컴포넌트

**Files:**
- Create: `components/ui/dialog.tsx` (shadcn CLI로 생성)
- Create: `components/leave-adjustment-dialog.tsx`

**Interfaces:**
- Produces: `<LeaveAdjustmentDialog open onOpenChange changes={{label,before,after}[]} onConfirm={(reason:string)=>void} submitting? />`

- [ ] **Step 1: shadcn dialog 컴포넌트 설치**

Run: `npx shadcn@latest add dialog --yes`

Expected: `components/ui/dialog.tsx` 생성됨.

- [ ] **Step 2: LeaveAdjustmentDialog 작성**

```tsx
// components/leave-adjustment-dialog.tsx
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

interface Change {
  label: string
  before: string
  after: string
}

interface LeaveAdjustmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  changes: Change[]
  onConfirm: (reason: string) => void
  submitting?: boolean
}

export function LeaveAdjustmentDialog({
  open,
  onOpenChange,
  changes,
  onConfirm,
  submitting = false,
}: LeaveAdjustmentDialogProps) {
  const [reason, setReason] = useState('')

  function handleOpenChange(next: boolean) {
    if (!next) setReason('')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>변경 사유 입력</DialogTitle>
          <DialogDescription>아래 변경사항을 저장하려면 사유를 입력하세요.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1 text-sm">
          {changes.map((c) => (
            <div key={c.label} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{c.label}</span>
              <span>
                {c.before} → <span className="font-medium">{c.after}</span>
              </span>
            </div>
          ))}
        </div>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="변경 사유를 입력하세요"
          rows={3}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button
            onClick={() => onConfirm(reason)}
            disabled={submitting || reason.trim().length === 0}
          >
            {submitting ? '저장 중...' : '확인'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: 타입체크 & 린트**

Run: `npx tsc --noEmit && npx eslint components/leave-adjustment-dialog.tsx`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add components/ui/dialog.tsx components/leave-adjustment-dialog.tsx
git commit -m "feat: 연차/입사일 조정 사유 입력 모달 컴포넌트 추가"
```

---

### Task 10: 기본 결재자 검색 콤보박스 컴포넌트

**Files:**
- Create: `components/approver-combobox.tsx`

**Interfaces:**
- Consumes: 없음(목록은 부모가 prop으로 전달)
- Produces: `<ApproverCombobox value={number|null} approvers={{id,name,email}[]} onChange={(id:number)=>void} placeholder? />`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// components/approver-combobox.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface Approver {
  id: number
  name: string
  email: string
}

interface ApproverComboboxProps {
  value: number | null
  approvers: Approver[]
  onChange: (id: number) => void
  placeholder?: string
  className?: string
}

export function ApproverCombobox({
  value,
  approvers,
  onChange,
  placeholder = '결재자 선택',
  className,
}: ApproverComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = approvers.find((a) => a.id === value)
  const filtered = approvers.filter(
    (a) => a.name.includes(query) || a.email.includes(query)
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('w-48 justify-start font-normal', !selected && 'text-muted-foreground', className)}
        >
          {selected ? selected.name : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름/이메일 검색"
          className="mb-2"
        />
        <div className="max-h-60 space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">검색 결과가 없습니다.</p>
          )}
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onChange(a.id)
                setOpen(false)
                setQuery('')
              }}
            >
              <div className="font-medium">{a.name}</div>
              <div className="text-xs text-muted-foreground">{a.email}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: 타입체크 & 린트**

Run: `npx tsc --noEmit && npx eslint components/approver-combobox.tsx`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add components/approver-combobox.tsx
git commit -m "feat: 검색 가능한 기본 결재자 콤보박스 컴포넌트 추가"
```

---

### Task 11: 프리랜서 목록 API 개편 (GET)

**Files:**
- Modify: `app/api/admin/users/route.ts`

**Interfaces:**
- Consumes: `requireApproverOrAbove`(Task 2), `getLeaveBalance`(Task 4)
- Produces: `GET /api/admin/users` →
  `Array<{ id: number; name: string; email: string; hireDate: string|null; defaultApproverId: number|null; defaultApproverName: string|null; granted: number; used: number; remaining: number; canEdit: boolean }>`

- [ ] **Step 1: 라우트 재작성**

```ts
// app/api/admin/users/route.ts
import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireApproverOrAbove } from '@/lib/auth/session'
import { getLeaveBalance } from '@/lib/db/leave-adjustments'

export async function GET() {
  const session = await requireApproverOrAbove()
  const role = (session.user as { role?: string }).role
  const callerId = Number((session.user as { id?: string }).id)

  const approver = alias(users, 'approver')
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      hireDate: users.hireDate,
      defaultApproverId: users.defaultApproverId,
      defaultApproverName: approver.name,
    })
    .from(users)
    .leftJoin(approver, eq(users.defaultApproverId, approver.id))
    .where(and(eq(users.signupStatus, 'APPROVED'), eq(users.role, 'FREELANCER')))

  const today = new Date().toISOString().slice(0, 10)
  const result = await Promise.all(
    rows.map(async (u) => {
      const balance = u.hireDate
        ? await getLeaveBalance(u.id, u.hireDate, today)
        : { granted: 0, used: 0, remaining: 0 }
      return {
        ...u,
        granted: balance.granted,
        used: balance.used,
        remaining: balance.remaining,
        canEdit: role === 'SUPER_ADMIN' || u.defaultApproverId === callerId,
      }
    })
  )
  return NextResponse.json(result)
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음(이전까지 `position`/`department` 참조 에러가 있었다면 이 시점에 이 파일 관련
에러는 사라져야 함)

- [ ] **Step 3: 커밋**

```bash
git add app/api/admin/users/route.ts
git commit -m "feat: 프리랜서 목록 API에 연차 잔액/기본결재자명/canEdit 반영"
```

---

### Task 12: 프리랜서 수정 API 개편 (PATCH) — 권한 스코프 + 조정 + 알림

**Files:**
- Modify: `app/api/admin/users/[id]/route.ts`

**Interfaces:**
- Consumes: `requireApproverOrAbove`(Task 2), `applyGrantAdjustment`/`applyUsageAdjustment`
  (Task 4), `createNotification`(Task 4)
- Produces: `PATCH /api/admin/users/[id]` 바디
  `{ hireDate?: string; defaultApproverId?: number; grantedTotal?: number; usedTotal?: number; reason?: string }`
  → 응답 `{ ok: true; granted: number; used: number; remaining: number }`

- [ ] **Step 1: 라우트 재작성**

```ts
// app/api/admin/users/[id]/route.ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireApproverOrAbove } from '@/lib/auth/session'
import { applyGrantAdjustment, applyUsageAdjustment, getLeaveBalance } from '@/lib/db/leave-adjustments'
import { createNotification } from '@/lib/db/notifications'

const updateSchema = z.object({
  hireDate: z.string().optional(),
  defaultApproverId: z.number().optional(),
  grantedTotal: z.number().optional(),
  usedTotal: z.number().optional(),
  reason: z.string().min(1).optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApproverOrAbove()
  const role = (session.user as { role?: string }).role
  const callerId = Number((session.user as { id?: string }).id)
  const { id } = await params
  const targetId = Number(id)

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }
  const body = parsed.data

  const [target] = await db.select().from(users).where(eq(users.id, targetId))
  if (!target) {
    return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
  }

  if (role !== 'SUPER_ADMIN' && target.defaultApproverId !== callerId) {
    return NextResponse.json({ error: '이 프리랜서를 수정할 권한이 없습니다.' }, { status: 403 })
  }

  if (body.defaultApproverId !== undefined && role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: '기본 결재자 변경은 최고관리자만 가능합니다.' }, { status: 403 })
  }

  const needsReason = body.hireDate !== undefined || body.grantedTotal !== undefined || body.usedTotal !== undefined
  if (needsReason && !body.reason) {
    return NextResponse.json({ error: '입사일/연차 변경 시 사유는 필수입니다.' }, { status: 400 })
  }

  if (body.hireDate !== undefined) {
    await db.update(users).set({ hireDate: body.hireDate }).where(eq(users.id, targetId))
  }
  if (body.defaultApproverId !== undefined) {
    await db.update(users).set({ defaultApproverId: body.defaultApproverId }).where(eq(users.id, targetId))
  }

  const hireDate = body.hireDate ?? target.hireDate
  let adjusted = false
  if (hireDate) {
    if (body.grantedTotal !== undefined) {
      const grantRow = await applyGrantAdjustment({
        userId: targetId,
        hireDate,
        newGranted: body.grantedTotal,
        reason: body.reason!,
        createdBy: callerId,
      })
      if (grantRow) adjusted = true
    }
    if (body.usedTotal !== undefined) {
      const usageRow = await applyUsageAdjustment({
        userId: targetId,
        hireDate,
        newUsed: body.usedTotal,
        reason: body.reason!,
        approverId: callerId,
      })
      if (usageRow) adjusted = true
    }
  }

  if (adjusted) {
    await createNotification({
      recipientId: targetId,
      type: 'LEAVE_ADJUSTED',
      refId: targetId,
      message: `연차 정보가 조정되었습니다: ${body.reason}`,
    })
    const currentApproverId = body.defaultApproverId ?? target.defaultApproverId
    if (currentApproverId && currentApproverId !== callerId) {
      await createNotification({
        recipientId: currentApproverId,
        type: 'LEAVE_ADJUSTED',
        refId: targetId,
        message: `담당 프리랜서(${target.name})의 연차 정보가 조정되었습니다: ${body.reason}`,
      })
    }
  }

  const finalHireDate = hireDate
  const balance = finalHireDate
    ? await getLeaveBalance(targetId, finalHireDate, new Date().toISOString().slice(0, 10))
    : { granted: 0, used: 0, remaining: 0 }

  return NextResponse.json({ ok: true, ...balance })
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 수동 검증**

`npm run dev` 실행 후:
1. SUPER_ADMIN으로 로그인, 프리랜서 A의 `grantedTotal`을 늘려 저장(사유 포함) →
   `SELECT * FROM leave_grants WHERE user_id=<A id> ORDER BY id DESC LIMIT 1`로 새 행 확인,
   `SELECT * FROM notifications WHERE recipient_id=<A id>`로 알림 확인.
2. `reason` 없이 PATCH 호출(curl) 시 400 확인.
3. APPROVER 계정으로 로그인해 자신이 기본 결재자가 아닌 프리랜서를 수정 시도 → 403 확인.
4. APPROVER 계정으로 `defaultApproverId` 변경 시도 → 403 확인.

- [ ] **Step 4: 커밋**

```bash
git add "app/api/admin/users/[id]/route.ts"
git commit -m "feat: 프리랜서 수정 API에 권한 스코프, 연차 조정, 알림 발송 반영"
```

---

### Task 13: 프리랜서 정보 관리 화면 전면 개편

**Files:**
- Modify: `app/admin/users/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/users`(Task 11), `PATCH /api/admin/users/[id]`(Task 12),
  `GET /api/admin/approvers`(Task 7, SUPER_ADMIN일 때만 호출), `ApproverCombobox`(Task 10),
  `LeaveAdjustmentDialog`(Task 9), `useSession`(next-auth/react, 현재 role/id 판별용)

- [ ] **Step 1: 화면 전체 재작성**

```tsx
// app/admin/users/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/date-picker'
import { ApproverCombobox } from '@/components/approver-combobox'
import { LeaveAdjustmentDialog } from '@/components/leave-adjustment-dialog'
import { PageHeader } from '@/components/page-header'
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
  const [dialogUserId, setDialogUserId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
    return users
      .filter((u) => u.name.includes(search) || u.email.includes(search))
      .filter((u) => !onlyMine || u.defaultApproverId === callerId)
  }, [users, search, onlyMine, callerId])

  function updateDraft(id: number, field: keyof Draft, value: string) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function changeApprover(user: FreelancerUser, approverId: number) {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultApproverId: approverId }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setErrors((prev) => ({ ...prev, [user.id]: body?.error ?? '처리에 실패했습니다.' }))
      return
    }
    const approver = approvers.find((a) => a.id === approverId)
    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id
          ? { ...u, defaultApproverId: approverId, defaultApproverName: approver?.name ?? null }
          : u
      )
    )
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

  function buildChanges(user: FreelancerUser) {
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

  async function confirmSave(reason: string) {
    const user = users.find((u) => u.id === dialogUserId)
    if (!user) return
    const draft = drafts[user.id]
    setSubmitting(true)
    try {
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
      setErrors((prev) => {
        const next = { ...prev }
        delete next[user.id]
        return next
      })
      setDialogUserId(null)
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
              onChange={(id) => changeApprover(user, id)}
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
        <Input
          placeholder="이름/이메일 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />
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
                      <p className="font-medium">{user.name}</p>
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
                          onChange={(id) => changeApprover(user, id)}
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
                          onClick={() => setDialogUserId(user.id)}
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
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="space-y-2">{renderMobileFields(user)}</div>
                <Button
                  className="w-full"
                  disabled={!user.canEdit || !hasPendingChange(user)}
                  onClick={() => setDialogUserId(user.id)}
                >
                  저장
                </Button>
                {errors[user.id] && <p className="text-sm text-destructive">{errors[user.id]}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {dialogUserId !== null && (
        <LeaveAdjustmentDialog
          open={dialogUserId !== null}
          onOpenChange={(open) => !open && setDialogUserId(null)}
          changes={buildChanges(users.find((u) => u.id === dialogUserId)!)}
          onConfirm={confirmSave}
          submitting={submitting}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입체크 & 린트**

Run: `npx tsc --noEmit && npx eslint app/admin/users/page.tsx`
Expected: 에러 없음

- [ ] **Step 3: 수동 검증**

`npm run dev` 실행 후:
1. SUPER_ADMIN으로 로그인 → `/admin/users`에서 모든 행의 모든 필드가 편집 가능한지 확인
2. 사용가능 연차 값을 바꾸고 "저장" 클릭 → 모달에 변경 전/후 값이 뜨는지, 사유 없이 확인 버튼이
   비활성화되는지 확인 → 사유 입력 후 확인 → 값이 반영되고 미사용 연차가 자동 재계산되는지 확인
3. 기본 결재자 콤보박스에서 검색 후 선택 → 모달 없이 즉시 반영되는지 확인
4. APPROVER 계정으로 로그인 → 자신이 담당하지 않는 행은 인풋이 비활성화되어 있는지, 담당하는
   행만 수정 가능한지 확인. "담당 프리랜서만 보기" 토글이 보이고 정상 동작하는지 확인
5. 검색창에 이름 일부 입력 → 목록이 필터링되는지 확인
6. 데스크톱(1280px)과 모바일(375px) 뷰포트 모두에서 레이아웃 확인(카드/테이블 전환)

- [ ] **Step 4: 커밋**

```bash
git add app/admin/users/page.tsx
git commit -m "feat: 프리랜서 정보 관리 화면 개편 (연차 조정, 결재자 지정, 검색/필터)"
```

---

### Task 14: 사이드바 내비게이션 — 3-역할 반영 + 결재담당자 관리 메뉴

**Files:**
- Modify: `components/app-sidebar.tsx`

**Interfaces:**
- Produces: `getRoleLabel(role)`가 `'SUPER_ADMIN' → '최고관리자'`, `'APPROVER' → '결재자'`,
  그 외 `'프리랜서'` 반환. `ADMIN_LINKS`에 역할별 노출 조건과 `/admin/approvers` 항목 추가.

- [ ] **Step 1: import에 UserCogIcon 추가**

```ts
import {
  MoreVerticalIcon,
  LogOutIcon,
  LayoutDashboardIcon,
  FileTextIcon,
  InboxIcon,
  UserCheckIcon,
  UsersIcon,
  ShieldIcon,
  KeyRoundIcon,
  HomeIcon,
  CircleHelpIcon,
  UserCogIcon,
} from 'lucide-react'
```

- [ ] **Step 2: ADMIN_LINKS에 role 필드 추가, 결재담당자 관리 항목 추가**

```ts
// 관리자 전용 메뉴: 실제로 페이지가 존재하는 항목만 나열한다. 각 항목의 roles가 현재
// 로그인한 사용자의 role을 포함할 때만 노출한다.
const ADMIN_LINKS = [
  { href: '/admin/signups', label: '가입 승인', icon: UserCheckIcon, roles: ['SUPER_ADMIN'] },
  { href: '/admin/users', label: '프리랜서 정보 관리', icon: UsersIcon, roles: ['SUPER_ADMIN', 'APPROVER'] },
  { href: '/admin/approvers', label: '결재담당자 관리', icon: UserCogIcon, roles: ['SUPER_ADMIN'] },
]
```

- [ ] **Step 3: getRoleLabel을 3-역할로 변경**

```ts
function getRoleLabel(role: string | undefined) {
  if (role === 'SUPER_ADMIN') return '최고관리자'
  if (role === 'APPROVER') return '결재자'
  return '프리랜서'
}
```

- [ ] **Step 4: AppSidebar 렌더링 조건 수정**

`{role === 'ADMIN' && (` 블록을 찾아서 관리자 메뉴 그룹 노출 조건과 항목 필터링을 아래로 바꾼다:

```tsx
        {(role === 'SUPER_ADMIN' || role === 'APPROVER') && (
          <SidebarGroup>
            <SidebarGroupLabel>관리자 메뉴</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {ADMIN_LINKS.filter((link) => link.roles.includes(role ?? '')).map((link) => (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton
                      render={<Link href={link.href} />}
                      isActive={pathname?.startsWith(link.href)}
                      onClick={closeOnMobile}
                    >
                      <link.icon />
                      {link.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
```

- [ ] **Step 5: 타입체크 & 린트**

Run: `npx tsc --noEmit && npx eslint components/app-sidebar.tsx`
Expected: 에러 없음

- [ ] **Step 6: 수동 검증**

SUPER_ADMIN 로그인 시 "가입 승인/프리랜서 정보 관리/결재담당자 관리" 3개 모두 보이는지, APPROVER
로그인 시 "프리랜서 정보 관리"만 보이는지(가입 승인·결재담당자 관리는 안 보임) 확인. 브레드크럼도
`/admin/approvers` 진입 시 "결재담당자 관리"로 정상 표시되는지 확인(`ALL_LINKS`가 `ADMIN_LINKS`를
그대로 spread하므로 자동 반영됨).

- [ ] **Step 7: 커밋**

```bash
git add components/app-sidebar.tsx
git commit -m "feat: 사이드바에 3-역할 라벨과 결재담당자 관리 메뉴 반영"
```

---

### Task 15: 문서 갱신 (CLAUDE.md, 원 설계 문서)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md`

- [ ] **Step 1: CLAUDE.md 역할 설명 갱신**

"핵심 비즈니스 규칙" 절의 역할 관련 줄을 찾아 아래로 바꾼다:

```markdown
- **역할**: 최고관리자(SUPER_ADMIN) / 결재자(APPROVER) / 프리랜서(FREELANCER) 3가지. 결재자는
  순수 관리 역할로 본인 휴가계·연차 잔액이 없다. 상세는
  `docs/superpowers/specs/2026-08-25-approver-role-and-freelancer-info-design.md` 참고.
```

- [ ] **Step 2: 원 설계 문서 3장/5.1절/9장에 갱신 안내 추가**

`docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md`의 3장(사용자 역할) 표
바로 아래에 아래 문단을 추가한다:

```markdown

> **갱신 안내(2026-08-25):** 이 장의 2-역할 체계는
> `docs/superpowers/specs/2026-08-25-approver-role-and-freelancer-info-design.md`의 3장에서
> SUPER_ADMIN/APPROVER/FREELANCER 3-역할 체계로 대체되었다. 5.1절의 User 엔티티(직급/부서 제거)와
> 9장의 관리자 메뉴(결재담당자 관리 추가)도 함께 갱신되었으니 최신 내용은 해당 문서를 따른다.
```

- [ ] **Step 3: 커밋**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md
git commit -m "docs: 3-역할 체계 도입에 맞춰 CLAUDE.md와 원 설계 문서에 갱신 안내 반영"
```

---

## Post-Plan Suggestions (범위 밖, 제안만)

- COMMON_LINKS(대시보드/내 문서/결재함)도 역할별로 필터링할지 검토 필요 — APPROVER는 본인 휴가
  데이터가 없어 "대시보드"·"내 문서"가 의미 없고, FREELANCER는 이제 결재자가 될 수 없어 "결재함"이
  항상 비어있다. 이번 계획에서는 브레인스토밍 때 논의되지 않아 건드리지 않았다.
- 기본 결재자 변경 시에도(연차 조정처럼) 새/이전 결재자에게 알림을 보낼지 검토.
- `notifications` 테이블을 실제로 소비하는 실시간 UI(Supabase Realtime 구독, 알림 벨)는 이
  저장소에 전혀 없다 — 별도 작업으로 필요.
- `lib/domain/leave-workflow.ts`의 `Actor` 타입(`'REQUESTER' | 'APPROVER' | 'ADMIN'`)이 여전히
  `'ADMIN'`을 쓴다. 이건 아직 어디에도 연결되지 않은(결재함 미구현) 별도의 워크플로 전이 로직이라
  이번 계획 범위에 포함하지 않았지만, 나중에 결재함/휴가계 취소 기능을 구현하면서 실제
  `session.user.role`('SUPER_ADMIN')을 이 `Actor`에 매핑할 때 이름 불일치가 헷갈릴 수 있다 —
  그때 `'ADMIN'`을 `'SUPER_ADMIN'`으로 맞출지 확인 필요.
