# 프리랜서 휴가 관리 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트에 투입된 프리랜서를 위한 연차 발생·소멸, 휴가계 제출·결재, 대시보드를 갖춘
휴가 관리 웹 애플리케이션을 구축한다.

**Architecture:** Next.js(App Router) 풀스택 단일 배포. 핵심 비즈니스 로직(연차 사이클, 만근
판정, 잔여연차 계산, 신청일수 계산, 결재 상태 전이)은 `lib/domain/`에 순수 함수로 분리해 DB나
프레임워크 없이 단위 테스트한다. API Route Handler가 이 순수 함수와 Drizzle ORM을 연결하고,
React 클라이언트 컴포넌트가 화면을 구성한다. 연차 발생/소멸은 Vercel Cron이 매일 호출하는
배치 API로 처리한다.

**Tech Stack:** Next.js 15 (App Router, TypeScript) · Postgres (Vercel Marketplace) · Drizzle ORM ·
Auth.js(NextAuth) v5 Credentials Provider · Tailwind CSS + shadcn/ui · date-fns · Zod · Vitest

**Spec:** `docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md`

## Global Constraints

- Next.js App Router 풀스택 단일 배포로 구성한다 (설계 문서 10장).
- DB는 Postgres이며 프로비저닝은 Vercel Marketplace 연동으로 진행한다 — 특정 벤더 SDK를
  임의로 하드코딩하지 않는다 (`CLAUDE.md`).
- 연차는 단순 카운터가 아닌 원장(`LeaveGrant`) 방식으로 관리하며 발생/사용 이력을 남긴다
  (설계 문서 5.1).
- 휴가 유형은 연차(전일)/오전반차/오후반차 3종, 0.5일 단위이며 시간 단위(분 단위) 계산은
  하지 않는다 (설계 문서 2, 6장).
- 신청일수 계산 시 주말과 등록된 공휴일은 제외한다 (설계 문서 6장).
- 결재는 단일 결재자 방식만 지원한다. 다단계 결재라인, 휴가계 예약 제출은 범위 밖이다
  (설계 문서 2장).
- 프리랜서는 자율 회원가입 후 관리자 승인이 있어야 로그인할 수 있다 (설계 문서 4장).
- 커밋 메시지와 코드 주석은 한국어로, 변수명/함수명은 영어로 작성한다 (`CLAUDE.md`).

## 설계 문서 대비 구체화한 결정 사항

설계 문서에 없던 세부 사항을 구현 가능한 수준으로 아래와 같이 구체화했다. 실행 중 이견이
생기면 여기부터 재검토한다.

1. **연차 만료 방식**: 설계 문서 5.3은 "입사 1년 시점에 잔여 연차 전체 소멸"이라고만
   명시한다. 이를 정확히 구현하기 위해 모든 `LeaveGrant`의 만료일(`cycleEnd`)은 발생일이
   속한 "입사기념일 사이클"의 종료일(다음 입사기념일)로 통일한다. 예: 입사일 3/15, 사이클 1은
   `[2026-03-15, 2027-03-15)`이며 이 사이클 안에서 발생한 모든 연차는 `cycleEnd = 2027-03-15`
   를 갖는다. 개별 발생일 기준 "발생 후 12개월"이 아니다.
2. **대시보드 집계 범위**: "발생 총 n / 사용 n / 미사용 n"은 **현재 사이클** 기준으로
   집계한다. 소멸된 이전 사이클 값은 현재 잔여연차와 무관하기 때문이다. 전체 이력은 "내
   휴가정보" 상세 화면에서 원장을 그대로 조회해 확인한다.
3. **사용량 반영 범위**: 잔여연차 계산 시 승인된 휴가 사용은 신청서의 `startDate`가 속한
   사이클에 귀속시킨다(사이클 경계를 넘나드는 신청은 범위 밖으로 간주).

## File Structure

```
lib/
  domain/
    date-utils.ts          # ISO 날짜 문자열 유틸 (프레임워크/DB 비의존)
    leave-cycle.ts          # 입사기념일 기준 사이클/월 평가기간 계산
    leave-grant.ts          # 만근 판정
    leave-balance.ts        # 잔여연차 계산
    leave-day-count.ts      # 신청일수 계산
    leave-workflow.ts       # 결재 상태 전이 규칙
    leave-validation.ts     # 기간 중복 경고 판정
    leave-request-context.ts # 잔여연차/공휴일 조회 헬퍼 (DB 접근)
  db/
    schema.ts               # Drizzle 테이블 정의
    client.ts               # DB 커넥션
  auth/
    auth-options.ts         # NextAuth Credentials 설정
    index.ts                # NextAuth 핸들러 export
    session.ts              # 세션 가드 헬퍼 (requireAdmin 등)
app/
  api/
    auth/[...nextauth]/route.ts
    signup/route.ts
    admin/signups/route.ts
    admin/signups/[id]/route.ts
    admin/users/route.ts
    admin/users/[id]/route.ts
    admin/holidays/route.ts
    admin/leave-adjustments/route.ts
    leave-requests/route.ts
    leave-requests/[id]/route.ts
    leave-requests/[id]/submit/route.ts
    leave-requests/[id]/approve/route.ts
    leave-requests/[id]/reject/route.ts
    leave-requests/[id]/cancel/route.ts
    approvals/route.ts
    me/route.ts
    dashboard/route.ts
    cron/leave-batch/route.ts
  signup/page.tsx
  login/page.tsx
  dashboard/page.tsx
  documents/page.tsx
  documents/new/page.tsx
  approvals/page.tsx
  approvals/[id]/page.tsx
  admin/signups/page.tsx
  admin/users/page.tsx
  admin/holidays/page.tsx
  layout.tsx               # GNB 포함 루트 레이아웃
components/
  gnb.tsx
  date-picker.tsx
  leave-request-form.tsx
vercel.ts                  # cron 등록
```

---

### Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: 프로젝트 루트 전체 (Next.js 스캐폴딩 산출물)
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, `npm run test` 스크립트. 이후 모든 태스크가 이
  스캐폴딩 위에서 작업한다.

- [ ] **Step 1: Next.js 프로젝트 생성**

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*" --use-npm --yes
```

- [ ] **Step 2: 필수 의존성 설치**

```bash
npm install drizzle-orm postgres next-auth@beta bcryptjs zod date-fns react-day-picker
npm install -D drizzle-kit vitest @vitejs/plugin-react vite-tsconfig-paths @types/bcryptjs
```

- [ ] **Step 3: shadcn/ui 초기화 및 기본 컴포넌트 추가**

```bash
npx shadcn@latest init --yes
npx shadcn@latest add button input label select textarea table badge card popover calendar
```

- [ ] **Step 4: Vitest 설정 파일 생성**

`vitest.config.ts` 생성:

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
```

`package.json`의 `scripts`에 추가:

```json
"test": "vitest run"
```

- [ ] **Step 5: 스캐폴딩 검증**

Run: `npm run dev` 로 로컬 서버가 `http://localhost:3000`에서 기본 페이지를 렌더링하는지
확인 후 `Ctrl+C`로 종료.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: Next.js 프로젝트 스캐폴딩 및 기본 의존성 설치"
```

---

### Task 2: 날짜 유틸 함수

**Files:**
- Create: `lib/domain/date-utils.ts`
- Test: `lib/domain/date-utils.test.ts`

**Interfaces:**
- Produces: `toISODate(date: Date): string`, `addMonthsISO(dateStr: string, months: number): string`,
  `isBeforeDate(a: string, b: string): boolean`, `isOnOrAfterDate(a: string, b: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// lib/domain/date-utils.test.ts
import { describe, expect, it } from 'vitest'
import { addMonthsISO, isBeforeDate, isOnOrAfterDate } from './date-utils'

describe('addMonthsISO', () => {
  it('일반적인 월 더하기', () => {
    expect(addMonthsISO('2026-03-15', 1)).toBe('2026-04-15')
  })

  it('말일 오버플로우는 대상 월의 마지막 날로 보정된다', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('연도를 넘어가는 12개월 더하기', () => {
    expect(addMonthsISO('2026-03-15', 12)).toBe('2027-03-15')
  })
})

describe('isBeforeDate / isOnOrAfterDate', () => {
  it('a가 b보다 이전이면 true', () => {
    expect(isBeforeDate('2026-01-01', '2026-01-02')).toBe(true)
    expect(isBeforeDate('2026-01-02', '2026-01-01')).toBe(false)
  })

  it('a가 b와 같거나 이후면 true', () => {
    expect(isOnOrAfterDate('2026-01-02', '2026-01-02')).toBe(true)
    expect(isOnOrAfterDate('2026-01-03', '2026-01-02')).toBe(true)
    expect(isOnOrAfterDate('2026-01-01', '2026-01-02')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/domain/date-utils.test.ts`
Expected: FAIL — `date-utils` 모듈을 찾을 수 없음

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/domain/date-utils.ts
import { addMonths, format, isBefore, isEqual, parseISO, startOfDay } from 'date-fns'

export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function addMonthsISO(dateStr: string, months: number): string {
  return toISODate(addMonths(parseISO(dateStr), months))
}

export function isBeforeDate(a: string, b: string): boolean {
  return isBefore(startOfDay(parseISO(a)), startOfDay(parseISO(b)))
}

export function isOnOrAfterDate(a: string, b: string): boolean {
  const da = startOfDay(parseISO(a))
  const db = startOfDay(parseISO(b))
  return isEqual(da, db) || isBefore(db, da)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/domain/date-utils.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/date-utils.ts lib/domain/date-utils.test.ts
git commit -m "feat: 날짜 유틸 함수 추가"
```

---

### Task 3: 연차 사이클 계산

**Files:**
- Create: `lib/domain/leave-cycle.ts`
- Test: `lib/domain/leave-cycle.test.ts`

**Interfaces:**
- Consumes: `addMonthsISO`, `isBeforeDate`, `isOnOrAfterDate` (Task 2)
- Produces: `getCurrentCycle(hireDate: string, asOfDate: string): { cycleIndex: number, start: string, end: string }`,
  `getMonthlyEvaluationPeriod(hireDate: string, monthIndex: number): { start: string, end: string }`,
  `getMonthlyAnniversaryIndex(hireDate: string, date: string): number | null`

- [ ] **Step 1: Write the failing test**

```ts
// lib/domain/leave-cycle.test.ts
import { describe, expect, it } from 'vitest'
import { getCurrentCycle, getMonthlyAnniversaryIndex, getMonthlyEvaluationPeriod } from './leave-cycle'

describe('getCurrentCycle', () => {
  it('입사 첫 해는 cycleIndex 0', () => {
    expect(getCurrentCycle('2026-03-15', '2026-06-01')).toEqual({
      cycleIndex: 0,
      start: '2026-03-15',
      end: '2027-03-15',
    })
  })

  it('입사기념일 당일부터 다음 사이클로 넘어간다', () => {
    expect(getCurrentCycle('2026-03-15', '2027-03-15')).toEqual({
      cycleIndex: 1,
      start: '2027-03-15',
      end: '2028-03-15',
    })
  })

  it('두 번째 해 중간', () => {
    expect(getCurrentCycle('2026-03-15', '2027-10-01')).toEqual({
      cycleIndex: 1,
      start: '2027-03-15',
      end: '2028-03-15',
    })
  })
})

describe('getMonthlyEvaluationPeriod', () => {
  it('1번째 달 평가 기간은 입사일부터 1개월', () => {
    expect(getMonthlyEvaluationPeriod('2026-03-15', 1)).toEqual({
      start: '2026-03-15',
      end: '2026-04-15',
    })
  })

  it('13번째 달 평가 기간은 두 번째 사이클로 자연스럽게 이어진다', () => {
    expect(getMonthlyEvaluationPeriod('2026-03-15', 13)).toEqual({
      start: '2027-03-15',
      end: '2027-04-15',
    })
  })
})

describe('getMonthlyAnniversaryIndex', () => {
  it('정확히 월 기념일이면 해당 monthIndex를 반환', () => {
    expect(getMonthlyAnniversaryIndex('2026-03-15', '2026-04-15')).toBe(1)
    expect(getMonthlyAnniversaryIndex('2026-03-15', '2027-03-15')).toBe(12)
  })

  it('기념일이 아니면 null', () => {
    expect(getMonthlyAnniversaryIndex('2026-03-15', '2026-04-16')).toBeNull()
    expect(getMonthlyAnniversaryIndex('2026-03-15', '2026-03-14')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/domain/leave-cycle.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/domain/leave-cycle.ts
import { differenceInCalendarMonths, parseISO } from 'date-fns'
import { addMonthsISO, isOnOrAfterDate } from './date-utils'

export interface LeaveCycle {
  cycleIndex: number
  start: string
  end: string
}

export function getCurrentCycle(hireDate: string, asOfDate: string): LeaveCycle {
  let cycleIndex = 0
  while (isOnOrAfterDate(asOfDate, addMonthsISO(hireDate, (cycleIndex + 1) * 12))) {
    cycleIndex++
  }
  return {
    cycleIndex,
    start: addMonthsISO(hireDate, cycleIndex * 12),
    end: addMonthsISO(hireDate, (cycleIndex + 1) * 12),
  }
}

export function getMonthlyEvaluationPeriod(hireDate: string, monthIndex: number) {
  return {
    start: addMonthsISO(hireDate, monthIndex - 1),
    end: addMonthsISO(hireDate, monthIndex),
  }
}

export function getMonthlyAnniversaryIndex(hireDate: string, date: string): number | null {
  const diff = differenceInCalendarMonths(parseISO(date), parseISO(hireDate))
  if (diff < 1) return null
  return addMonthsISO(hireDate, diff) === date ? diff : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/domain/leave-cycle.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/leave-cycle.ts lib/domain/leave-cycle.test.ts
git commit -m "feat: 입사기념일 기준 연차 사이클 계산 로직 추가"
```

---

### Task 4: 만근 판정 로직

**Files:**
- Create: `lib/domain/leave-grant.ts`
- Test: `lib/domain/leave-grant.test.ts`

**Interfaces:**
- Consumes: `getMonthlyEvaluationPeriod` (Task 3)
- Produces: `isFullAttendance(hireDate: string, monthIndex: number, approvedFullLeavePeriods: { startDate: string, endDate: string }[]): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// lib/domain/leave-grant.test.ts
import { describe, expect, it } from 'vitest'
import { isFullAttendance } from './leave-grant'

describe('isFullAttendance', () => {
  it('해당 평가월에 승인된 전일 연차가 없으면 만근', () => {
    expect(isFullAttendance('2026-03-15', 1, [])).toBe(true)
  })

  it('평가월 내부에 전일 연차가 있으면 만근 아님', () => {
    const periods = [{ startDate: '2026-03-20', endDate: '2026-03-21' }]
    expect(isFullAttendance('2026-03-15', 1, periods)).toBe(false)
  })

  it('평가월 밖의 전일 연차는 만근 판정에 영향 없음', () => {
    const periods = [{ startDate: '2026-05-01', endDate: '2026-05-02' }]
    expect(isFullAttendance('2026-03-15', 1, periods)).toBe(true)
  })

  it('경계에 걸치는 연차는 만근 아님으로 처리', () => {
    const periods = [{ startDate: '2026-04-14', endDate: '2026-04-16' }]
    expect(isFullAttendance('2026-03-15', 1, periods)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/domain/leave-grant.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/domain/leave-grant.ts
import { getMonthlyEvaluationPeriod } from './leave-cycle'

export interface DateRange {
  startDate: string
  endDate: string
}

export function isFullAttendance(
  hireDate: string,
  monthIndex: number,
  approvedFullLeavePeriods: DateRange[]
): boolean {
  const period = getMonthlyEvaluationPeriod(hireDate, monthIndex)
  return !approvedFullLeavePeriods.some((leave) => rangesOverlap(leave, period))
}

function rangesOverlap(leave: DateRange, evaluationPeriod: { start: string; end: string }): boolean {
  return leave.startDate < evaluationPeriod.end && evaluationPeriod.start <= leave.endDate
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/domain/leave-grant.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/leave-grant.ts lib/domain/leave-grant.test.ts
git commit -m "feat: 만근 판정 로직 추가"
```

---

### Task 5: 잔여연차 계산

**Files:**
- Create: `lib/domain/leave-balance.ts`
- Test: `lib/domain/leave-balance.test.ts`

**Interfaces:**
- Consumes: `getCurrentCycle` (Task 3)
- Produces: `calculateLeaveBalance(hireDate: string, asOfDate: string, grants: { amount: number, grantDate: string }[], approvedUsages: { requestedDays: number, startDate: string }[]): { cycleStart: string, cycleEnd: string, granted: number, used: number, remaining: number }`

- [ ] **Step 1: Write the failing test**

```ts
// lib/domain/leave-balance.test.ts
import { describe, expect, it } from 'vitest'
import { calculateLeaveBalance } from './leave-balance'

describe('calculateLeaveBalance', () => {
  it('현재 사이클 발생분에서 현재 사이클 사용분을 뺀다', () => {
    const grants = [
      { amount: 1, grantDate: '2026-04-15' },
      { amount: 1, grantDate: '2026-05-15' },
    ]
    const usages = [{ requestedDays: 0.5, startDate: '2026-05-20' }]
    const result = calculateLeaveBalance('2026-03-15', '2026-06-01', grants, usages)
    expect(result).toEqual({
      cycleStart: '2026-03-15',
      cycleEnd: '2027-03-15',
      granted: 2,
      used: 0.5,
      remaining: 1.5,
    })
  })

  it('이전 사이클의 발생/사용은 현재 잔여연차에 영향을 주지 않는다', () => {
    const grants = [
      { amount: 1, grantDate: '2026-04-15' }, // 이전 사이클
      { amount: 1, grantDate: '2027-04-15' }, // 현재 사이클
    ]
    const usages = [{ requestedDays: 1, startDate: '2026-05-01' }] // 이전 사이클 사용
    const result = calculateLeaveBalance('2026-03-15', '2027-06-01', grants, usages)
    expect(result.granted).toBe(1)
    expect(result.used).toBe(0)
    expect(result.remaining).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/domain/leave-balance.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/domain/leave-balance.ts
import { getCurrentCycle } from './leave-cycle'

export interface GrantRecord {
  amount: number
  grantDate: string
}

export interface UsageRecord {
  requestedDays: number
  startDate: string
}

export interface LeaveBalanceResult {
  cycleStart: string
  cycleEnd: string
  granted: number
  used: number
  remaining: number
}

export function calculateLeaveBalance(
  hireDate: string,
  asOfDate: string,
  grants: GrantRecord[],
  approvedUsages: UsageRecord[]
): LeaveBalanceResult {
  const cycle = getCurrentCycle(hireDate, asOfDate)
  const inCycle = (date: string) => date >= cycle.start && date < cycle.end

  const granted = grants
    .filter((g) => inCycle(g.grantDate))
    .reduce((sum, g) => sum + g.amount, 0)
  const used = approvedUsages
    .filter((u) => inCycle(u.startDate))
    .reduce((sum, u) => sum + u.requestedDays, 0)

  return { cycleStart: cycle.start, cycleEnd: cycle.end, granted, used, remaining: granted - used }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/domain/leave-balance.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/leave-balance.ts lib/domain/leave-balance.test.ts
git commit -m "feat: 현재 사이클 기준 잔여연차 계산 로직 추가"
```

---

### Task 6: 신청일수 계산

**Files:**
- Create: `lib/domain/leave-day-count.ts`
- Test: `lib/domain/leave-day-count.test.ts`

**Interfaces:**
- Consumes: `toISODate` (Task 2)
- Produces: `calculateRequestedDays(startDate: string, endDate: string, type: 'FULL' | 'AM_HALF' | 'PM_HALF', holidayDates: Set<string>): number`

- [ ] **Step 1: Write the failing test**

```ts
// lib/domain/leave-day-count.test.ts
import { describe, expect, it } from 'vitest'
import { calculateRequestedDays } from './leave-day-count'

describe('calculateRequestedDays', () => {
  it('평일로만 이루어진 전일 연차', () => {
    // 2026-08-24는 월요일
    expect(calculateRequestedDays('2026-08-24', '2026-08-26', 'FULL', new Set())).toBe(3)
  })

  it('주말이 포함된 기간은 주말을 제외한다', () => {
    // 2026-08-21(금) ~ 2026-08-24(월): 토/일 제외하고 2일
    expect(calculateRequestedDays('2026-08-21', '2026-08-24', 'FULL', new Set())).toBe(2)
  })

  it('공휴일이 포함된 기간은 공휴일을 제외한다', () => {
    const holidays = new Set(['2026-08-25'])
    expect(calculateRequestedDays('2026-08-24', '2026-08-26', 'FULL', holidays)).toBe(2)
  })

  it('반차는 평일이면 0.5일', () => {
    expect(calculateRequestedDays('2026-08-24', '2026-08-24', 'AM_HALF', new Set())).toBe(0.5)
    expect(calculateRequestedDays('2026-08-24', '2026-08-24', 'PM_HALF', new Set())).toBe(0.5)
  })

  it('반차인데 시작일과 종료일이 다르면 에러', () => {
    expect(() =>
      calculateRequestedDays('2026-08-24', '2026-08-25', 'AM_HALF', new Set())
    ).toThrow('반차는 시작일과 종료일이 같아야 합니다.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/domain/leave-day-count.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/domain/leave-day-count.ts
import { eachDayOfInterval, isWeekend, parseISO } from 'date-fns'
import { toISODate } from './date-utils'

export type LeaveType = 'FULL' | 'AM_HALF' | 'PM_HALF'

export function calculateRequestedDays(
  startDate: string,
  endDate: string,
  type: LeaveType,
  holidayDates: Set<string>
): number {
  if (type !== 'FULL') {
    if (startDate !== endDate) {
      throw new Error('반차는 시작일과 종료일이 같아야 합니다.')
    }
    return isBusinessDay(startDate, holidayDates) ? 0.5 : 0
  }

  const days = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
  return days.filter((d) => !isWeekend(d) && !holidayDates.has(toISODate(d))).length
}

function isBusinessDay(dateStr: string, holidayDates: Set<string>): boolean {
  return !isWeekend(parseISO(dateStr)) && !holidayDates.has(dateStr)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/domain/leave-day-count.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/leave-day-count.ts lib/domain/leave-day-count.test.ts
git commit -m "feat: 주말/공휴일/반차를 반영한 신청일수 계산 로직 추가"
```

---

### Task 7: 결재 워크플로 상태 전이

**Files:**
- Create: `lib/domain/leave-workflow.ts`
- Test: `lib/domain/leave-workflow.test.ts`

**Interfaces:**
- Produces: `type LeaveRequestStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED'`,
  `type LeaveWorkflowAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL'`,
  `type Actor = 'REQUESTER' | 'APPROVER' | 'ADMIN'`,
  `applyTransition(currentStatus: LeaveRequestStatus, action: LeaveWorkflowAction, actor: Actor): LeaveRequestStatus`

- [ ] **Step 1: Write the failing test**

```ts
// lib/domain/leave-workflow.test.ts
import { describe, expect, it } from 'vitest'
import { applyTransition } from './leave-workflow'

describe('applyTransition', () => {
  it('신청인이 임시저장 문서를 제출하면 대기 상태가 된다', () => {
    expect(applyTransition('DRAFT', 'SUBMIT', 'REQUESTER')).toBe('PENDING')
  })

  it('결재자가 대기 문서를 승인하면 승인 상태가 된다', () => {
    expect(applyTransition('PENDING', 'APPROVE', 'APPROVER')).toBe('APPROVED')
  })

  it('결재자가 대기 문서를 반려하면 반려 상태가 된다', () => {
    expect(applyTransition('PENDING', 'REJECT', 'APPROVER')).toBe('REJECTED')
  })

  it('신청인은 대기 상태를 취소할 수 있다', () => {
    expect(applyTransition('PENDING', 'CANCEL', 'REQUESTER')).toBe('CANCELED')
  })

  it('신청인은 승인된 문서를 취소할 수 없다', () => {
    expect(() => applyTransition('APPROVED', 'CANCEL', 'REQUESTER')).toThrow(
      '승인된 문서의 취소는 관리자만 가능합니다.'
    )
  })

  it('관리자는 승인된 문서를 취소할 수 있다', () => {
    expect(applyTransition('APPROVED', 'CANCEL', 'ADMIN')).toBe('CANCELED')
  })

  it('신청인은 승인/반려를 수행할 수 없다', () => {
    expect(() => applyTransition('PENDING', 'APPROVE', 'REQUESTER')).toThrow(
      'REQUESTER는 APPROVE을 수행할 권한이 없습니다.'
    )
  })

  it('반려된 문서는 더 이상 전이할 수 없다', () => {
    expect(() => applyTransition('REJECTED', 'CANCEL', 'REQUESTER')).toThrow(
      'REJECTED 상태에서는 CANCEL을 수행할 수 없습니다.'
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/domain/leave-workflow.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/domain/leave-workflow.ts
export type LeaveRequestStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED'
export type LeaveWorkflowAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL'
export type Actor = 'REQUESTER' | 'APPROVER' | 'ADMIN'

const TRANSITIONS: Record<LeaveRequestStatus, Partial<Record<LeaveWorkflowAction, LeaveRequestStatus>>> = {
  DRAFT: { SUBMIT: 'PENDING' },
  PENDING: { APPROVE: 'APPROVED', REJECT: 'REJECTED', CANCEL: 'CANCELED' },
  APPROVED: { CANCEL: 'CANCELED' },
  REJECTED: {},
  CANCELED: {},
}

const ALLOWED_ACTORS: Record<LeaveWorkflowAction, Actor[]> = {
  SUBMIT: ['REQUESTER'],
  APPROVE: ['APPROVER'],
  REJECT: ['APPROVER'],
  CANCEL: ['REQUESTER', 'ADMIN'],
}

export function applyTransition(
  currentStatus: LeaveRequestStatus,
  action: LeaveWorkflowAction,
  actor: Actor
): LeaveRequestStatus {
  const nextStatus = TRANSITIONS[currentStatus]?.[action]
  if (!nextStatus) {
    throw new Error(`${currentStatus} 상태에서는 ${action}을 수행할 수 없습니다.`)
  }
  if (!ALLOWED_ACTORS[action].includes(actor)) {
    throw new Error(`${actor}는 ${action}을 수행할 권한이 없습니다.`)
  }
  if (action === 'CANCEL' && currentStatus === 'PENDING' && actor !== 'REQUESTER') {
    throw new Error('대기 상태의 취소는 신청인만 가능합니다.')
  }
  if (action === 'CANCEL' && currentStatus === 'APPROVED' && actor !== 'ADMIN') {
    throw new Error('승인된 문서의 취소는 관리자만 가능합니다.')
  }
  return nextStatus
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/domain/leave-workflow.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/leave-workflow.ts lib/domain/leave-workflow.test.ts
git commit -m "feat: 결재 상태 전이 규칙 추가"
```

---

### Task 8: 기간 중복 경고 판정

**Files:**
- Create: `lib/domain/leave-validation.ts`
- Test: `lib/domain/leave-validation.test.ts`

**Interfaces:**
- Produces: `hasOverlappingActiveRequest(existing: { startDate: string, endDate: string, status: string }[], startDate: string, endDate: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// lib/domain/leave-validation.test.ts
import { describe, expect, it } from 'vitest'
import { hasOverlappingActiveRequest } from './leave-validation'

describe('hasOverlappingActiveRequest', () => {
  it('대기/승인 상태 문서와 기간이 겹치면 true', () => {
    const existing = [{ startDate: '2026-08-24', endDate: '2026-08-26', status: 'PENDING' }]
    expect(hasOverlappingActiveRequest(existing, '2026-08-25', '2026-08-27')).toBe(true)
  })

  it('반려/취소/임시저장 상태는 겹쳐도 무시한다', () => {
    const existing = [
      { startDate: '2026-08-24', endDate: '2026-08-26', status: 'REJECTED' },
      { startDate: '2026-08-24', endDate: '2026-08-26', status: 'CANCELED' },
      { startDate: '2026-08-24', endDate: '2026-08-26', status: 'DRAFT' },
    ]
    expect(hasOverlappingActiveRequest(existing, '2026-08-25', '2026-08-27')).toBe(false)
  })

  it('기간이 겹치지 않으면 false', () => {
    const existing = [{ startDate: '2026-08-24', endDate: '2026-08-26', status: 'APPROVED' }]
    expect(hasOverlappingActiveRequest(existing, '2026-08-27', '2026-08-28')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/domain/leave-validation.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/domain/leave-validation.ts
export interface ExistingRequestRange {
  startDate: string
  endDate: string
  status: string
}

const ACTIVE_STATUSES = new Set(['PENDING', 'APPROVED'])

export function hasOverlappingActiveRequest(
  existing: ExistingRequestRange[],
  startDate: string,
  endDate: string
): boolean {
  return existing
    .filter((r) => ACTIVE_STATUSES.has(r.status))
    .some((r) => r.startDate <= endDate && startDate <= r.endDate)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/domain/leave-validation.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/leave-validation.ts lib/domain/leave-validation.test.ts
git commit -m "feat: 휴가 기간 중복 경고 판정 로직 추가"
```

---

### Task 9: DB 프로비저닝 & 스키마 정의

**Files:**
- Create: `lib/db/schema.ts`
- Create: `lib/db/client.ts`
- Create: `drizzle.config.ts`
- Modify: `.env.local` (환경 변수)

**Interfaces:**
- Produces: `users`, `leaveGrants`, `leaveRequests`, `holidays`, `notifications` Drizzle 테이블
  정의, `db` (Drizzle client 인스턴스) — 이후 모든 API 태스크가 이 스키마와 `db`를 사용한다.

- [x] **Step 1: Supabase 데이터베이스 프로비저닝**

`vercel:marketplace` 스킬을 사용해 **Supabase** 통합을 프로비저닝한다(설계 문서 10장 — 실시간
알림을 위해 Neon 대신 Supabase Postgres를 채택). 인증은 Supabase Auth가 아닌 Task 10의
Auth.js로 별도 구현하므로, 여기서는 Postgres 연결 문자열만 사용한다.

```bash
vercel link --yes
vercel integration add   # marketplace 스킬 안내에 따라 Supabase 통합 선택
vercel env pull .env.local
```

`.env.local`에 Supabase 통합이 채워주는 변수(`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 등)가 채워졌는지 확인한다. 이후
Task 9~25 전체에서 `DATABASE_URL`이 아니라 다음 두 변수를 구분해서 사용한다:
- `POSTGRES_URL_NON_POOLING` — 세션 단위 연결이 필요한 `drizzle-kit generate/migrate`용
- `POSTGRES_URL` — 애플리케이션 런타임(Drizzle client, API 라우트)용 풀링 연결

- [x] **Step 2: Drizzle 설정 파일 작성**

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL_NON_POOLING!,
  },
})
```

- [x] **Step 3: 스키마 정의**

```ts
// lib/db/schema.ts
import { boolean, date, integer, numeric, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('FREELANCER'), // 'ADMIN' | 'FREELANCER'
  signupStatus: varchar('signup_status', { length: 20 }).notNull().default('PENDING'), // 'PENDING' | 'APPROVED' | 'REJECTED'
  hireDate: date('hire_date', { mode: 'string' }),
  position: varchar('position', { length: 50 }),
  department: varchar('department', { length: 100 }),
  defaultApproverId: integer('default_approver_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const leaveGrants = pgTable('leave_grants', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  grantDate: date('grant_date', { mode: 'string' }).notNull(),
  amount: numeric('amount', { precision: 4, scale: 1, mode: 'number' }).notNull(),
  cycleEnd: date('cycle_end', { mode: 'string' }).notNull(),
  expired: boolean('expired').notNull().default(false),
  note: text('note'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const leaveRequests = pgTable('leave_requests', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  approverId: integer('approver_id').notNull().references(() => users.id),
  title: varchar('title', { length: 200 }).notNull(),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }).notNull(),
  type: varchar('type', { length: 10 }).notNull(), // 'FULL' | 'AM_HALF' | 'PM_HALF'
  requestedDays: numeric('requested_days', { precision: 4, scale: 1, mode: 'number' }).notNull(),
  reason: text('reason').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('DRAFT'),
  rejectReason: text('reject_reason'),
  submittedAt: timestamp('submitted_at'),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const holidays = pgTable('holidays', {
  id: serial('id').primaryKey(),
  date: date('date', { mode: 'string' }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
})

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  recipientId: integer('recipient_id').notNull().references(() => users.id),
  type: varchar('type', { length: 30 }).notNull(), // 'SIGNUP_PENDING' | 'LEAVE_SUBMITTED' | 'LEAVE_APPROVED' | 'LEAVE_REJECTED'
  refId: integer('ref_id').notNull(), // userId(가입 알림) 또는 leaveRequestId(휴가 알림)
  message: text('message').notNull(),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

`notifications`는 설계 문서 7.1절의 실시간 알림 전용 테이블이다. 이벤트 발생 시점(Task 13
가입승인 대기 생성, Task 17 휴가계 제출, Task 20 승인/반려)에 이 테이블에 insert하고,
Supabase Realtime은 `users`/`leave_requests` 원본 테이블이 아닌 이 테이블만 구독한다
(Task 25에서 배선).

- [x] **Step 4: DB 클라이언트 작성**

```ts
// lib/db/client.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const queryClient = postgres(process.env.POSTGRES_URL!)
export const db = drizzle(queryClient, { schema })
```

- [x] **Step 5: 마이그레이션 생성 및 적용**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

- [x] **Step 6: 첫 관리자 계정 시드**

`lib/db/seed-admin.ts` 생성:

```ts
import bcrypt from 'bcryptjs'
import { db } from './client'
import { users } from './schema'

async function seedAdmin() {
  const passwordHash = await bcrypt.hash('changeme123!', 10)
  await db.insert(users).values({
    name: '관리자',
    email: 'admin@example.com',
    passwordHash,
    role: 'ADMIN',
    signupStatus: 'APPROVED',
  })
  console.log('관리자 계정 생성 완료: admin@example.com / changeme123!')
}

seedAdmin().then(() => process.exit(0))
```

Run: `npx tsx lib/db/seed-admin.ts` (필요 시 `npm install -D tsx`)
Expected: "관리자 계정 생성 완료" 출력

- [x] **Step 7: Commit**

```bash
git add lib/db drizzle.config.ts drizzle package.json package-lock.json
git commit -m "feat: Supabase Postgres 스키마 정의 및 관리자 계정 시드 추가"
```

---

### Task 10: 인증 설정 (Auth.js Credentials)

**Files:**
- Create: `lib/auth/auth-options.ts`
- Create: `lib/auth/index.ts`
- Create: `lib/auth/session.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Modify: `.env.local`

**Interfaces:**
- Consumes: `db`, `users` (Task 9)
- Produces: `auth()` (세션 조회), `signIn`, `signOut`, `requireAdmin(): Promise<Session>`,
  `requireApprovedUser(): Promise<Session>` — 이후 모든 API 라우트가 이 가드 함수를 사용한다.

- [x] **Step 1: 환경 변수 추가**

`.env.local`에 추가:

```
AUTH_SECRET=<npx auth secret 명령으로 생성한 값>
```

```bash
npx auth secret
```

> 완료 노트: 이 환경(Node v20.14.0)에서 `npx auth secret`이 chevrotain(Node ≥22 요구)
> 의존성 문제로 실패하여, 대신 `crypto.randomBytes(32).toString('base64')`로 동등한
> 256비트 엔트로피의 `AUTH_SECRET`을 생성해 채웠다(리뷰에서 안전성 확인됨).

- [x] **Step 2: NextAuth 설정 작성**

```ts
// lib/auth/auth-options.ts
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        const [user] = await db.select().from(users).where(eq(users.email, email))
        if (!user) return null

        const isValidPassword = await bcrypt.compare(password, user.passwordHash)
        if (!isValidPassword) return null

        if (user.signupStatus !== 'APPROVED') {
          throw new Error('가입 승인 대기 중이거나 거절된 계정입니다.')
        }

        return { id: String(user.id), name: user.name, email: user.email, role: user.role }
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.role = (user as { role: string }).role
        token.id = (user as { id: string }).id
      }
      return token
    },
    session: async ({ session, token }) => {
      if (session.user) {
        ;(session.user as { role?: string; id?: string }).role = token.role as string
        ;(session.user as { role?: string; id?: string }).id = token.id as string
      }
      return session
    },
  },
}
```

- [x] **Step 3: NextAuth 핸들러 export**

```ts
// lib/auth/index.ts
import NextAuth from 'next-auth'
import { authConfig } from './auth-options'

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
```

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/lib/auth'

export const { GET, POST } = handlers
```

- [x] **Step 4: 세션 가드 헬퍼 작성**

```ts
// lib/auth/session.ts
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

export async function requireAdmin() {
  const session = await requireApprovedUser()
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    throw new ForbiddenError('관리자만 접근할 수 있습니다.')
  }
  return session
}
```

- [x] **Step 5: 검증**

Run: `npm run build`
Expected: 타입 에러 없이 빌드 성공

- [x] **Step 6: Commit**

```bash
git add lib/auth app/api/auth .env.local.example
git commit -m "feat: Auth.js Credentials 인증 및 세션 가드 헬퍼 추가"
```

> 완료 노트: `.env.local.example` 파일은 브리프의 예시 파일 목록에 있었으나 저장소에
> 존재하지 않고 계획 Files 목록에도 없어 새로 만들지 않음(범위 확장 방지). 실제 커밋은
> `lib/auth`, `app/api/auth`만 포함.
>
> **Task 12에 인계할 사항**: `authorize()`가 평범한 `Error`를 던지므로 Auth.js v5가
> 이를 일반화된 에러 코드로 정규화할 가능성이 높다. `'가입 승인 대기 중이거나 거절된
> 계정입니다.'` 메시지가 로그인 화면에 그대로 도달하지 않을 수 있으므로, Task 12에서
> `CredentialsSignin` 서브클래싱 등으로 이 메시지를 노출하는 방법을 검토해야 한다.

---

### Task 11: 회원가입 API + 화면

**Files:**
- Create: `app/api/signup/route.ts`
- Create: `app/signup/page.tsx`

**Interfaces:**
- Consumes: `db`, `users` (Task 9)
- Produces: `POST /api/signup` — 성공 시 `{ id: number }` 반환, 이메일 중복 시 409

- [x] **Step 1: 회원가입 API 작성**

```ts
// app/api/signup/route.ts
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }
  const parsed = signupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  const [existing] = await db.select().from(users).where(eq(users.email, parsed.data.email))
  if (existing) {
    return NextResponse.json({ error: '이미 가입 신청된 이메일입니다.' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10)
  const [created] = await db
    .insert(users)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: 'FREELANCER',
      signupStatus: 'PENDING',
    })
    .returning({ id: users.id })

  return NextResponse.json({ id: created.id }, { status: 201 })
}
```

- [x] **Step 2: 회원가입 화면 작성**

```tsx
// app/signup/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? '가입 신청에 실패했습니다.')
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="mx-auto mt-20 max-w-sm text-center">
        <p>가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.</p>
        <Button className="mt-4" onClick={() => router.push('/login')}>
          로그인 화면으로
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-20 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">회원가입 신청</h1>
      <div>
        <Label htmlFor="name">이름</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="email">이메일</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="password">비밀번호</Label>
        <Input
          id="password"
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full">
        가입 신청
      </Button>
    </form>
  )
}
```

- [x] **Step 3: 수동 검증**

Run: `npm run dev`, 브라우저에서 `/signup`으로 이동해 신규 계정을 신청하고, DB에서
`signup_status = 'PENDING'`으로 저장되는지 확인.

```bash
npx drizzle-kit studio
```

> 완료 노트: curl + 실제 Supabase DB 조회로 검증(테스트 계정은 확인 후 삭제). 리뷰에서
> 발견된 "잘못된 JSON 본문 처리 누락"을 fix round 1에서 수정(위 코드에 반영됨).

- [x] **Step 4: Commit**

```bash
git add app/api/signup app/signup
git commit -m "feat: 프리랜서 회원가입 신청 API 및 화면 추가"
```

---

### Task 12: 로그인 화면 + 승인 게이트

**Files:**
- Create: `app/login/page.tsx`
- Modify: `middleware.ts` (신규 생성) — 실제로는 Next.js 16에서 `middleware.ts`가 deprecated되어
  `proxy.ts`로 이름이 바뀌었으므로 `proxy.ts`로 생성함 (기능은 동일)

**Interfaces:**
- Consumes: `signIn` (Task 10)
- Produces: 미인증 사용자가 보호 경로 접근 시 `/login`으로 리다이렉트하는 프록시(구 미들웨어)

- [x] **Step 1: 로그인 화면 작성**

```tsx
// app/login/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const result = await signIn('credentials', { email, password, redirect: false })
    if (result?.error) {
      setError('이메일/비밀번호가 올바르지 않거나, 가입 승인이 완료되지 않았습니다.')
      return
    }
    router.push('/dashboard')
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-20 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">로그인</h1>
      <div>
        <Label htmlFor="email">이메일</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="password">비밀번호</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full">
        로그인
      </Button>
    </form>
  )
}
```

- [x] **Step 2: 세션 프로바이더 연결**

```tsx
// app/providers.tsx
'use client'

import { SessionProvider } from 'next-auth/react'

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
```

`app/layout.tsx`의 `<body>` 내부를 `<Providers>{children}</Providers>`로 감싼다.

- [x] **Step 3: 보호 경로 프록시(구 미들웨어) 작성**

```ts
// proxy.ts (Next.js 16: middleware.ts가 deprecated되어 proxy.ts로 대체됨, 동작은 동일)
import { auth } from '@/lib/auth'

// /api/signup(Task 11의 공개 회원가입 API)을 빠뜨리면 이미 배포된 회원가입 기능이 깨지므로 포함
const PUBLIC_PATHS = ['/login', '/signup', '/api/signup']

export default auth((req) => {
  const isPublic = PUBLIC_PATHS.some((path) => req.nextUrl.pathname.startsWith(path))
  if (!req.auth && !isPublic) {
    const loginUrl = new URL('/login', req.nextUrl.origin)
    return Response.redirect(loginUrl)
  }
})

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
```

- [x] **Step 4: 수동 검증**

Run: `npm run dev`. 로그아웃 상태에서 `/dashboard` 접근 시 `/login`으로 리다이렉트되는지,
Task 9에서 시드한 관리자 계정(`admin@example.com` / `changeme123!`)으로 로그인이 성공하는지
확인.

> 완료 노트: curl + 헤드리스 브라우저로 검증. `authorize()`가 던지는 일반 `Error`가
> NextAuth v5에서 `Configuration` 등 일반화된 에러 코드로 정규화되어 클라이언트에
> 그대로 전달되지 않음을 확인(Task 10에서 인계된 이슈) — 브리프의 로그인 화면이 이미
> 단일 공용 에러 메시지로 모든 실패 케이스를 커버하고 있어 `auth-options.ts` 수정은
> 불필요했음.

- [x] **Step 5: Commit**

```bash
git add app/login app/providers.tsx app/layout.tsx proxy.ts
git commit -m "feat: 로그인 화면 및 인증 프록시(승인 게이트) 추가"
```

---

### Task 13: 관리자 — 가입 승인/거절

**Files:**
- Create: `app/api/admin/signups/route.ts`
- Create: `app/api/admin/signups/[id]/route.ts`
- Create: `app/admin/signups/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (Task 10), `db`, `users` (Task 9)
- Produces: `GET /api/admin/signups` (대기 목록), `PATCH /api/admin/signups/:id`
  `{ decision: 'APPROVED' | 'REJECTED', hireDate?, position?, department?, defaultApproverId? }`

- [ ] **Step 1: 대기 목록 조회 API**

```ts
// app/api/admin/signups/route.ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth/session'

export async function GET() {
  await requireAdmin()
  const pending = await db.select().from(users).where(eq(users.signupStatus, 'PENDING'))
  return NextResponse.json(pending)
}
```

- [ ] **Step 2: 승인/거절 처리 API**

```ts
// app/api/admin/signups/[id]/route.ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth/session'

const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  hireDate: z.string().optional(),
  position: z.string().optional(),
  department: z.string().optional(),
  defaultApproverId: z.number().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const body = await request.json()
  const parsed = decisionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  if (parsed.data.decision === 'APPROVED' && !parsed.data.hireDate) {
    return NextResponse.json({ error: '승인 시 입사일은 필수입니다.' }, { status: 400 })
  }

  await db
    .update(users)
    .set({
      signupStatus: parsed.data.decision,
      hireDate: parsed.data.hireDate,
      position: parsed.data.position,
      department: parsed.data.department,
      defaultApproverId: parsed.data.defaultApproverId,
    })
    .where(eq(users.id, Number(id)))

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: 관리자 승인 화면**

```tsx
// app/admin/signups/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface PendingUser {
  id: number
  name: string
  email: string
}

export default function AdminSignupsPage() {
  const [pending, setPending] = useState<PendingUser[]>([])
  const [hireDates, setHireDates] = useState<Record<number, string>>({})

  useEffect(() => {
    fetch('/api/admin/signups')
      .then((res) => res.json())
      .then(setPending)
  }, [])

  async function decide(id: number, decision: 'APPROVED' | 'REJECTED') {
    await fetch(`/api/admin/signups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, hireDate: hireDates[id] }),
    })
    setPending((prev) => prev.filter((u) => u.id !== id))
  }

  return (
    <div className="mx-auto mt-10 max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold">가입 승인 대기</h1>
      {pending.length === 0 && <p className="text-sm text-gray-500">대기 중인 신청이 없습니다.</p>}
      <ul className="space-y-3">
        {pending.map((user) => (
          <li key={user.id} className="flex items-center gap-3 rounded border p-3">
            <div className="flex-1">
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
            <Input
              type="date"
              className="w-40"
              onChange={(e) => setHireDates((prev) => ({ ...prev, [user.id]: e.target.value }))}
            />
            <Button onClick={() => decide(user.id, 'APPROVED')}>승인</Button>
            <Button variant="outline" onClick={() => decide(user.id, 'REJECTED')}>
              거절
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: 수동 검증**

Run: `npm run dev`, 관리자 계정으로 로그인 후 `/admin/signups`에서 Task 11에서 신청한 계정을
승인하고, 해당 계정으로 로그인이 가능해지는지 확인.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/signups app/admin/signups
git commit -m "feat: 관리자 가입 승인/거절 기능 추가"
```

---

### Task 14: 관리자 — 프리랜서 정보 관리

**Files:**
- Create: `app/api/admin/users/route.ts`
- Create: `app/api/admin/users/[id]/route.ts`
- Create: `app/admin/users/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (Task 10), `db`, `users` (Task 9)
- Produces: `GET /api/admin/users`, `PATCH /api/admin/users/:id`
  `{ position?, department?, defaultApproverId? }`

- [ ] **Step 1: 목록/수정 API 작성**

```ts
// app/api/admin/users/route.ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth/session'

export async function GET() {
  await requireAdmin()
  const list = await db.select().from(users).where(eq(users.signupStatus, 'APPROVED'))
  return NextResponse.json(list)
}
```

```ts
// app/api/admin/users/[id]/route.ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth/session'

const updateSchema = z.object({
  position: z.string().optional(),
  department: z.string().optional(),
  defaultApproverId: z.number().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }
  await db.update(users).set(parsed.data).where(eq(users.id, Number(id)))
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 관리자 프리랜서 관리 화면**

```tsx
// app/admin/users/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface FreelancerUser {
  id: number
  name: string
  email: string
  position: string | null
  department: string | null
  defaultApproverId: number | null
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<FreelancerUser[]>([])

  useEffect(() => {
    fetch('/api/admin/users')
      .then((res) => res.json())
      .then(setUsers)
  }, [])

  function updateField(id: number, field: keyof FreelancerUser, value: string) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, [field]: value } : u)))
  }

  async function save(user: FreelancerUser) {
    await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: user.position,
        department: user.department,
        defaultApproverId: user.defaultApproverId ? Number(user.defaultApproverId) : undefined,
      }),
    })
  }

  return (
    <div className="mx-auto mt-10 max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">프리랜서 정보 관리</h1>
      <ul className="space-y-3">
        {users.map((user) => (
          <li key={user.id} className="flex items-center gap-3 rounded border p-3">
            <div className="w-40">
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
            <Input
              placeholder="직급"
              value={user.position ?? ''}
              onChange={(e) => updateField(user.id, 'position', e.target.value)}
            />
            <Input
              placeholder="부서"
              value={user.department ?? ''}
              onChange={(e) => updateField(user.id, 'department', e.target.value)}
            />
            <Input
              placeholder="기본 결재자 ID"
              value={user.defaultApproverId ?? ''}
              onChange={(e) => updateField(user.id, 'defaultApproverId', e.target.value)}
            />
            <Button onClick={() => save(user)}>저장</Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: 수동 검증**

Run: `npm run dev`, `/admin/users`에서 직급/부서/기본 결재자를 저장하고 새로고침 후 값이
유지되는지 확인.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/users app/admin/users
git commit -m "feat: 관리자 프리랜서 정보 관리 기능 추가"
```

---

### Task 15: 관리자 — 공휴일 관리

**Files:**
- Create: `app/api/admin/holidays/route.ts`
- Create: `app/admin/holidays/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (Task 10), `db`, `holidays` (Task 9)
- Produces: `GET /api/admin/holidays`, `POST /api/admin/holidays` `{ date, name }`

- [ ] **Step 1: 공휴일 API 작성**

```ts
// app/api/admin/holidays/route.ts
import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { holidays } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth/session'

const holidaySchema = z.object({
  date: z.string(),
  name: z.string().min(1),
})

export async function GET() {
  await requireAdmin()
  const list = await db.select().from(holidays).orderBy(asc(holidays.date))
  return NextResponse.json(list)
}

export async function POST(request: Request) {
  await requireAdmin()
  const parsed = holidaySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }
  const [created] = await db.insert(holidays).values(parsed.data).returning()
  return NextResponse.json(created, { status: 201 })
}
```

- [ ] **Step 2: 공휴일 관리 화면**

```tsx
// app/admin/holidays/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Holiday {
  id: number
  date: string
  name: string
}

export default function AdminHolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [date, setDate] = useState('')
  const [name, setName] = useState('')

  function load() {
    fetch('/api/admin/holidays')
      .then((res) => res.json())
      .then(setHolidays)
  }

  useEffect(load, [])

  async function add() {
    await fetch('/api/admin/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, name }),
    })
    setDate('')
    setName('')
    load()
  }

  return (
    <div className="mx-auto mt-10 max-w-xl">
      <h1 className="mb-4 text-xl font-semibold">공휴일 관리</h1>
      <div className="mb-4 flex gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input placeholder="공휴일명" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={add}>추가</Button>
      </div>
      <ul className="space-y-1">
        {holidays.map((h) => (
          <li key={h.id} className="text-sm">
            {h.date} — {h.name}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: 수동 검증**

Run: `npm run dev`, `/admin/holidays`에서 공휴일을 추가하고 목록에 반영되는지 확인.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/holidays app/admin/holidays
git commit -m "feat: 관리자 공휴일 관리 기능 추가"
```

---

### Task 16: 연차 발생/소멸 배치 API + Cron 설정

**Files:**
- Create: `app/api/cron/leave-batch/route.ts`
- Create: `vercel.ts`
- Modify: `.env.local`

**Interfaces:**
- Consumes: `getMonthlyAnniversaryIndex`, `getCurrentCycle` (Task 3), `isFullAttendance` (Task 4),
  `db`, `users`, `leaveGrants`, `leaveRequests` (Task 9)
- Produces: `POST /api/cron/leave-batch` — 매일 1회 호출되어 만근 판정 후 `LeaveGrant` 생성,
  사이클 종료일이 오늘인 미소멸 `LeaveGrant`를 `expired = true`로 갱신

- [ ] **Step 1: 배치 API 작성**

```ts
// app/api/cron/leave-batch/route.ts
import { and, eq, lt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getMonthlyAnniversaryIndex, getMonthlyEvaluationPeriod, getCurrentCycle } from '@/lib/domain/leave-cycle'
import { isFullAttendance } from '@/lib/domain/leave-grant'
import { db } from '@/lib/db/client'
import { leaveGrants, leaveRequests, users } from '@/lib/db/schema'
import { toISODate } from '@/lib/domain/date-utils'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
  }

  const today = toISODate(new Date())
  const activeUsers = await db.select().from(users).where(eq(users.signupStatus, 'APPROVED'))

  let grantedCount = 0
  let expiredCount = 0

  for (const user of activeUsers) {
    if (!user.hireDate) continue

    const monthIndex = getMonthlyAnniversaryIndex(user.hireDate, today)
    if (monthIndex !== null) {
      const period = getMonthlyEvaluationPeriod(user.hireDate, monthIndex)
      const approvedFullLeaves = await db
        .select({ startDate: leaveRequests.startDate, endDate: leaveRequests.endDate })
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.userId, user.id),
            eq(leaveRequests.status, 'APPROVED'),
            eq(leaveRequests.type, 'FULL')
          )
        )

      if (isFullAttendance(user.hireDate, monthIndex, approvedFullLeaves)) {
        const cycle = getCurrentCycle(user.hireDate, today)
        await db.insert(leaveGrants).values({
          userId: user.id,
          grantDate: today,
          amount: 1,
          cycleEnd: cycle.end,
          expired: false,
        })
        grantedCount++
      }
    }

    const expireResult = await db
      .update(leaveGrants)
      .set({ expired: true })
      .where(
        and(
          eq(leaveGrants.userId, user.id),
          eq(leaveGrants.expired, false),
          lt(leaveGrants.cycleEnd, addOneDay(today))
        )
      )
      .returning({ id: leaveGrants.id })
    expiredCount += expireResult.length
  }

  return NextResponse.json({ granted: grantedCount, expired: expiredCount })
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
```

주: `cycleEnd < today + 1일`(즉 `cycleEnd <= today`) 조건으로 사이클 종료일이 오늘이거나
지난 미소멸 연차를 소멸 처리한다.

- [ ] **Step 2: Cron 시크릿 환경 변수 추가**

`.env.local`에 추가:

```
CRON_SECRET=<임의의 긴 랜덤 문자열>
```

- [ ] **Step 3: Vercel Cron 등록**

```ts
// vercel.ts
import type { VercelConfig } from '@vercel/config/v1'

export const config: VercelConfig = {
  crons: [{ path: '/api/cron/leave-batch', schedule: '0 0 * * *' }],
}
```

`@vercel/config`가 설치되어 있지 않다면 설치한다.

```bash
npm install -D @vercel/config
```

- [ ] **Step 4: 수동 검증**

Run:

```bash
npm run dev
curl -X POST http://localhost:3000/api/cron/leave-batch -H "Authorization: Bearer <CRON_SECRET 값>"
```

Expected: `{"granted":0,"expired":0}` 형태의 JSON 응답 (시드 데이터 상황에 따라 값은 달라짐).
Task 9에서 시드한 관리자 계정은 `hireDate`가 없으므로 스킵되는지 로그로 확인.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron vercel.ts package.json package-lock.json
git commit -m "feat: 연차 발생/소멸 배치 API 및 Vercel Cron 설정 추가"
```

---

### Task 17: 휴가계 제출 API

**Files:**
- Create: `app/api/me/route.ts`
- Create: `app/api/leave-requests/route.ts`
- Create: `app/api/leave-requests/[id]/route.ts`
- Create: `app/api/leave-requests/[id]/submit/route.ts`

**Interfaces:**
- Consumes: `calculateRequestedDays` (Task 6), `calculateLeaveBalance` (Task 5),
  `hasOverlappingActiveRequest` (Task 8), `applyTransition` (Task 7), `requireApprovedUser`
  (Task 10), `db`, `leaveRequests`, `leaveGrants`, `holidays`, `users` (Task 9)
- Produces: `GET /api/me` → `{ id, name, position, department, defaultApproverId }`,
  `POST /api/leave-requests` (임시저장 생성), `PATCH /api/leave-requests/:id` (내용
  수정, DRAFT 상태에서만), `POST /api/leave-requests/:id/submit` (제출)

- [ ] **Step 1: 내 프로필 조회 API — 휴가계 작성 화면의 신청인/직급/부서/기본결재자 자동 셋팅용**

```ts
// app/api/me/route.ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireApprovedUser } from '@/lib/auth/session'

export async function GET() {
  const session = await requireApprovedUser()
  const userId = Number((session.user as { id: string }).id)
  const [me] = await db
    .select({
      id: users.id,
      name: users.name,
      position: users.position,
      department: users.department,
      defaultApproverId: users.defaultApproverId,
    })
    .from(users)
    .where(eq(users.id, userId))
  return NextResponse.json(me)
}
```

- [ ] **Step 2: 공통 헬퍼 — 잔여연차/신청일수 계산에 필요한 데이터 조회**

```ts
// lib/domain/leave-request-context.ts
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { holidays, leaveGrants, leaveRequests, users } from '@/lib/db/schema'
import { calculateLeaveBalance } from './leave-balance'
import { toISODate } from './date-utils'

export async function loadHolidaySet(): Promise<Set<string>> {
  const rows = await db.select({ date: holidays.date }).from(holidays)
  return new Set(rows.map((r) => r.date))
}

export async function loadBalance(userId: number) {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user?.hireDate) {
    throw new Error('입사일이 등록되지 않은 사용자입니다.')
  }
  const grants = await db
    .select({ amount: leaveGrants.amount, grantDate: leaveGrants.grantDate })
    .from(leaveGrants)
    .where(eq(leaveGrants.userId, userId))
  const usages = await db
    .select({ requestedDays: leaveRequests.requestedDays, startDate: leaveRequests.startDate })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'APPROVED')))

  return calculateLeaveBalance(user.hireDate, toISODate(new Date()), grants, usages)
}
```

- [ ] **Step 3: 휴가계 생성(임시저장) API**

```ts
// app/api/leave-requests/route.ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { calculateRequestedDays } from '@/lib/domain/leave-day-count'
import { hasOverlappingActiveRequest } from '@/lib/domain/leave-validation'
import { loadBalance, loadHolidaySet } from '@/lib/domain/leave-request-context'
import { db } from '@/lib/db/client'
import { leaveRequests } from '@/lib/db/schema'
import { requireApprovedUser } from '@/lib/auth/session'

const createSchema = z.object({
  approverId: z.number(),
  title: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  type: z.enum(['FULL', 'AM_HALF', 'PM_HALF']),
  reason: z.string().min(1),
})

export async function GET() {
  const session = await requireApprovedUser()
  const userId = Number((session.user as { id: string }).id)
  const list = await db.select().from(leaveRequests).where(eq(leaveRequests.userId, userId))
  return NextResponse.json(list)
}

export async function POST(request: Request) {
  const session = await requireApprovedUser()
  const userId = Number((session.user as { id: string }).id)
  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  const holidaySet = await loadHolidaySet()
  const requestedDays = calculateRequestedDays(
    parsed.data.startDate,
    parsed.data.endDate,
    parsed.data.type,
    holidaySet
  )

  const [created] = await db
    .insert(leaveRequests)
    .values({
      userId,
      approverId: parsed.data.approverId,
      title: parsed.data.title,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      type: parsed.data.type,
      requestedDays,
      reason: parsed.data.reason,
      status: 'DRAFT',
    })
    .returning()

  const existing = await db.select().from(leaveRequests).where(eq(leaveRequests.userId, userId))
  const overlapWarning = hasOverlappingActiveRequest(
    existing.filter((r) => r.id !== created.id),
    parsed.data.startDate,
    parsed.data.endDate
  )
  const balance = await loadBalance(userId)

  return NextResponse.json({ ...created, overlapWarning, remainingBalance: balance.remaining }, { status: 201 })
}
```

- [ ] **Step 4: 제출 API (상태 전이 + 잔여연차 검증)**

```ts
// app/api/leave-requests/[id]/submit/route.ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { applyTransition } from '@/lib/domain/leave-workflow'
import { loadBalance } from '@/lib/domain/leave-request-context'
import { db } from '@/lib/db/client'
import { leaveRequests } from '@/lib/db/schema'
import { requireApprovedUser } from '@/lib/auth/session'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApprovedUser()
  const userId = Number((session.user as { id: string }).id)
  const { id } = await params

  const [leaveRequest] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, Number(id)))
  if (!leaveRequest || leaveRequest.userId !== userId) {
    return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })
  }
  if (!leaveRequest.approverId) {
    return NextResponse.json({ error: '결재자가 지정되지 않았습니다.' }, { status: 400 })
  }

  const balance = await loadBalance(userId)
  if (leaveRequest.requestedDays > balance.remaining) {
    return NextResponse.json({ error: '잔여연차를 초과하여 제출할 수 없습니다.' }, { status: 400 })
  }

  let nextStatus
  try {
    nextStatus = applyTransition(leaveRequest.status as never, 'SUBMIT', 'REQUESTER')
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }

  const [updated] = await db
    .update(leaveRequests)
    .set({ status: nextStatus, submittedAt: new Date() })
    .where(eq(leaveRequests.id, Number(id)))
    .returning()

  return NextResponse.json(updated)
}
```

- [ ] **Step 5: 단건 조회/수정 API**

```ts
// app/api/leave-requests/[id]/route.ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { calculateRequestedDays } from '@/lib/domain/leave-day-count'
import { loadHolidaySet } from '@/lib/domain/leave-request-context'
import { db } from '@/lib/db/client'
import { leaveRequests } from '@/lib/db/schema'
import { requireApprovedUser } from '@/lib/auth/session'

const updateSchema = z.object({
  approverId: z.number().optional(),
  title: z.string().min(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  type: z.enum(['FULL', 'AM_HALF', 'PM_HALF']).optional(),
  reason: z.string().min(1).optional(),
})

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApprovedUser()
  const userId = Number((session.user as { id: string }).id)
  const { id } = await params
  const [leaveRequest] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, Number(id)))
  if (!leaveRequest || leaveRequest.userId !== userId) {
    return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })
  }
  return NextResponse.json(leaveRequest)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApprovedUser()
  const userId = Number((session.user as { id: string }).id)
  const { id } = await params
  const [leaveRequest] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, Number(id)))
  if (!leaveRequest || leaveRequest.userId !== userId) {
    return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })
  }
  if (leaveRequest.status !== 'DRAFT') {
    return NextResponse.json({ error: '임시저장 상태에서만 수정할 수 있습니다.' }, { status: 400 })
  }

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  const merged = { ...leaveRequest, ...parsed.data }
  const holidaySet = await loadHolidaySet()
  const requestedDays = calculateRequestedDays(merged.startDate, merged.endDate, merged.type as never, holidaySet)

  const [updated] = await db
    .update(leaveRequests)
    .set({ ...parsed.data, requestedDays })
    .where(eq(leaveRequests.id, Number(id)))
    .returning()

  return NextResponse.json(updated)
}
```

- [ ] **Step 6: 수동 검증**

Run: `npm run build` 로 타입 에러가 없는지 확인 후, `npm run dev` 상태에서 승인된 프리랜서
계정으로 로그인해 다음을 `curl`로 확인한다.

```bash
curl -X POST http://localhost:3000/api/leave-requests \
  -H "Content-Type: application/json" \
  -b "<로그인 후 브라우저 개발자도구에서 복사한 쿠키>" \
  -d '{"approverId":1,"title":"여름 휴가","startDate":"2026-09-01","endDate":"2026-09-01","type":"FULL","reason":"개인 사유"}'
```

Expected: 생성된 문서와 `remainingBalance`가 JSON으로 반환됨

- [ ] **Step 7: Commit**

```bash
git add app/api/me app/api/leave-requests lib/domain/leave-request-context.ts
git commit -m "feat: 프로필 조회 API 및 휴가계 생성/수정/제출 API 추가"
```

---

### Task 18: 휴가계 작성 화면

**Files:**
- Create: `components/date-picker.tsx`
- Create: `components/leave-request-form.tsx`
- Create: `app/documents/new/page.tsx`

**Interfaces:**
- Consumes: `POST /api/leave-requests`, `POST /api/leave-requests/:id/submit` (Task 17)
- Produces: `<DatePicker value, onChange, placeholder />` — 클릭 시 달력 팝오버가 열리는
  입력 컴포넌트. 이후 휴가계 관련 화면에서 날짜 입력에 재사용한다.

- [ ] **Step 1: 클릭형 DatePicker 컴포넌트**

```tsx
// components/date-picker.tsx
'use client'

import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface DatePickerProps {
  value: string // 'yyyy-MM-dd' 또는 빈 문자열
  onChange: (value: string) => void
  placeholder?: string
}

export function DatePicker({ value, onChange, placeholder }: DatePickerProps) {
  const selected = value ? parseISO(value) : undefined

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start font-normal">
          {selected ? format(selected, 'yyyy-MM-dd (EEE)', { locale: ko }) : (placeholder ?? '날짜 선택')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => date && onChange(format(date, 'yyyy-MM-dd'))}
        />
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: 작성 폼 컴포넌트**

```tsx
// components/leave-request-form.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/date-picker'

type LeaveType = 'FULL' | 'AM_HALF' | 'PM_HALF'

interface MyProfile {
  id: number
  name: string
  position: string | null
  department: string | null
  defaultApproverId: number | null
}

export function LeaveRequestForm() {
  const router = useRouter()
  const { data: session } = useSession()
  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [title, setTitle] = useState('')
  const [approverId, setApproverId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [type, setType] = useState<LeaveType>('FULL')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{
    requestedDays: number
    remainingBalance: number
    overlapWarning: boolean
  } | null>(null)

  useEffect(() => {
    fetch('/api/me')
      .then((res) => res.json())
      .then((me: MyProfile) => {
        setProfile(me)
        if (me.defaultApproverId) {
          setApproverId(String(me.defaultApproverId))
        }
      })
  }, [])

  async function saveDraft() {
    setError(null)
    const res = await fetch('/api/leave-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approverId: Number(approverId), title, startDate, endDate, type, reason }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error)
      return null
    }
    setPreview({
      requestedDays: data.requestedDays,
      remainingBalance: data.remainingBalance,
      overlapWarning: data.overlapWarning,
    })
    return data.id as number
  }

  async function handleSubmit() {
    const id = await saveDraft()
    if (!id) return
    const res = await fetch(`/api/leave-requests/${id}/submit`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error)
      return
    }
    router.push('/documents')
  }

  return (
    <div className="mx-auto mt-10 max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">연차휴가계</h1>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label>신청인</Label>
          <Input disabled value={session?.user?.name ?? ''} />
        </div>
        <div>
          <Label>직급</Label>
          <Input disabled value={profile?.position ?? ''} />
        </div>
        <div>
          <Label>부서</Label>
          <Input disabled value={profile?.department ?? ''} />
        </div>
      </div>
      <div>
        <Label>제목</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <Label>결재자 ID (기본값: 프로필의 기본 결재자, 변경 가능)</Label>
        <Input value={approverId} onChange={(e) => setApproverId(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <Label>시작하는 날</Label>
          <DatePicker value={startDate} onChange={setStartDate} placeholder="시작하는 날" />
        </div>
        <div className="flex-1">
          <Label>끝나는 날</Label>
          <DatePicker value={endDate} onChange={setEndDate} placeholder="끝나는 날" />
        </div>
      </div>
      <div>
        <Label>휴가 유형</Label>
        <select
          className="w-full rounded border p-2"
          value={type}
          onChange={(e) => setType(e.target.value as LeaveType)}
        >
          <option value="FULL">연차(전일)</option>
          <option value="AM_HALF">오전반차</option>
          <option value="PM_HALF">오후반차</option>
        </select>
      </div>
      <div>
        <Label>사유</Label>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {preview && (
        <p className="text-sm text-gray-600">
          신청일수: {preview.requestedDays}일 / 잔여연차: {preview.remainingBalance}일
        </p>
      )}
      {preview?.overlapWarning && (
        <p className="text-sm text-amber-600">
          동일 기간에 이미 대기 또는 승인된 문서가 있습니다. 내용을 확인해 주세요.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button variant="outline" onClick={saveDraft}>
          임시저장
        </Button>
        <Button onClick={handleSubmit}>제출</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 작성 페이지**

```tsx
// app/documents/new/page.tsx
import { LeaveRequestForm } from '@/components/leave-request-form'

export default function NewDocumentPage() {
  return <LeaveRequestForm />
}
```

- [ ] **Step 4: 수동 검증**

Run: `npm run dev`, 프리랜서 계정으로 로그인해 `/documents/new`에서 날짜 입력을 클릭하면
달력 팝오버가 열리는지, 휴가계를 작성하고 "제출"까지 눌러 결재함에 반영되는지 다음
태스크(Task 20)와 연계해 확인한다(우선 임시저장까지 동작 확인).

- [ ] **Step 5: Commit**

```bash
git add components/date-picker.tsx components/leave-request-form.tsx app/documents/new
git commit -m "feat: 클릭형 DatePicker 및 휴가계 작성 화면 추가"
```

---

### Task 19: 내 문서 리스트 화면

**Files:**
- Create: `app/documents/page.tsx`

**Interfaces:**
- Consumes: `GET /api/leave-requests` (Task 17)

- [ ] **Step 1: 리스트 화면 작성**

```tsx
// app/documents/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface LeaveRequestRow {
  id: number
  title: string
  startDate: string
  endDate: string
  status: string
  requestedDays: number
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '임시저장',
  PENDING: '결재대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELED: '취소',
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<LeaveRequestRow[]>([])
  const [filter, setFilter] = useState<string>('ALL')

  useEffect(() => {
    fetch('/api/leave-requests')
      .then((res) => res.json())
      .then(setDocuments)
  }, [])

  const filtered = filter === 'ALL' ? documents : documents.filter((d) => d.status === filter)

  return (
    <div className="mx-auto mt-10 max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">내 문서</h1>
        <Link href="/documents/new">
          <Button>새 휴가계 작성</Button>
        </Link>
      </div>
      <div className="mb-4 flex gap-2">
        {['ALL', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELED'].map((s) => (
          <button
            key={s}
            className={`rounded px-2 py-1 text-sm ${filter === s ? 'bg-black text-white' : 'bg-gray-100'}`}
            onClick={() => setFilter(s)}
          >
            {s === 'ALL' ? '전체' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {filtered.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between rounded border p-3">
            <div>
              <p className="font-medium">{doc.title}</p>
              <p className="text-sm text-gray-500">
                {doc.startDate} ~ {doc.endDate} ({doc.requestedDays}일)
              </p>
            </div>
            <Badge>{STATUS_LABEL[doc.status]}</Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: 수동 검증**

Run: `npm run dev`, `/documents`에서 상태별 필터가 정상 동작하는지 확인.

- [ ] **Step 3: Commit**

```bash
git add app/documents/page.tsx
git commit -m "feat: 내 문서 리스트 화면 추가"
```

---

### Task 20: 결재함 리스트/상세 + 승인/반려 API

**Files:**
- Create: `app/api/leave-requests/[id]/approve/route.ts`
- Create: `app/api/leave-requests/[id]/reject/route.ts`
- Create: `app/api/approvals/route.ts`
- Create: `app/approvals/page.tsx`
- Create: `app/approvals/[id]/page.tsx`

**Interfaces:**
- Consumes: `applyTransition` (Task 7), `requireApprovedUser` (Task 10), `db`, `leaveRequests`
  (Task 9)
- Produces: `GET /api/approvals` (내가 결재자로 지정된 문서), `POST /api/leave-requests/:id/approve`,
  `POST /api/leave-requests/:id/reject` `{ rejectReason }`

- [ ] **Step 1: 결재 대상 목록 API**

```ts
// app/api/approvals/route.ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { leaveRequests } from '@/lib/db/schema'
import { requireApprovedUser } from '@/lib/auth/session'

export async function GET() {
  const session = await requireApprovedUser()
  const approverId = Number((session.user as { id: string }).id)
  const list = await db.select().from(leaveRequests).where(eq(leaveRequests.approverId, approverId))
  return NextResponse.json(list)
}
```

- [ ] **Step 2: 승인 API**

```ts
// app/api/leave-requests/[id]/approve/route.ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { applyTransition } from '@/lib/domain/leave-workflow'
import { db } from '@/lib/db/client'
import { leaveRequests } from '@/lib/db/schema'
import { requireApprovedUser } from '@/lib/auth/session'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApprovedUser()
  const approverId = Number((session.user as { id: string }).id)
  const { id } = await params

  const [leaveRequest] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, Number(id)))
  if (!leaveRequest || leaveRequest.approverId !== approverId) {
    return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })
  }

  let nextStatus
  try {
    nextStatus = applyTransition(leaveRequest.status as never, 'APPROVE', 'APPROVER')
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }

  const [updated] = await db
    .update(leaveRequests)
    .set({ status: nextStatus, processedAt: new Date() })
    .where(eq(leaveRequests.id, Number(id)))
    .returning()

  return NextResponse.json(updated)
}
```

- [ ] **Step 3: 반려 API**

```ts
// app/api/leave-requests/[id]/reject/route.ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { applyTransition } from '@/lib/domain/leave-workflow'
import { db } from '@/lib/db/client'
import { leaveRequests } from '@/lib/db/schema'
import { requireApprovedUser } from '@/lib/auth/session'

const rejectSchema = z.object({ rejectReason: z.string().min(1) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApprovedUser()
  const approverId = Number((session.user as { id: string }).id)
  const { id } = await params
  const parsed = rejectSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: '반려 사유를 입력해야 합니다.' }, { status: 400 })
  }

  const [leaveRequest] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, Number(id)))
  if (!leaveRequest || leaveRequest.approverId !== approverId) {
    return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })
  }

  let nextStatus
  try {
    nextStatus = applyTransition(leaveRequest.status as never, 'REJECT', 'APPROVER')
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }

  const [updated] = await db
    .update(leaveRequests)
    .set({ status: nextStatus, rejectReason: parsed.data.rejectReason, processedAt: new Date() })
    .where(eq(leaveRequests.id, Number(id)))
    .returning()

  return NextResponse.json(updated)
}
```

- [ ] **Step 4: 결재함 리스트 화면**

```tsx
// app/approvals/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface ApprovalRow {
  id: number
  title: string
  status: string
  startDate: string
  endDate: string
}

export default function ApprovalsPage() {
  const [rows, setRows] = useState<ApprovalRow[]>([])

  useEffect(() => {
    fetch('/api/approvals')
      .then((res) => res.json())
      .then(setRows)
  }, [])

  return (
    <div className="mx-auto mt-10 max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold">결재함</h1>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded border p-3">
            <Link href={`/approvals/${row.id}`} className="font-medium hover:underline">
              {row.title}
            </Link>
            <p className="text-sm text-gray-500">
              {row.startDate} ~ {row.endDate} · {row.status}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: 결재 상세 화면**

```tsx
// app/approvals/[id]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface LeaveRequestDetail {
  id: number
  title: string
  reason: string
  startDate: string
  endDate: string
  requestedDays: number
  status: string
}

export default function ApprovalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [doc, setDoc] = useState<LeaveRequestDetail | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/leave-requests/${id}`)
      .then((res) => res.json())
      .then(setDoc)
  }, [id])

  async function approve() {
    const res = await fetch(`/api/leave-requests/${id}/approve`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) return setError(data.error)
    router.push('/approvals')
  }

  async function reject() {
    const res = await fetch(`/api/leave-requests/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejectReason }),
    })
    const data = await res.json()
    if (!res.ok) return setError(data.error)
    router.push('/approvals')
  }

  if (!doc) return null

  return (
    <div className="mx-auto mt-10 max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">{doc.title}</h1>
      <p>
        {doc.startDate} ~ {doc.endDate} ({doc.requestedDays}일)
      </p>
      <p className="text-sm text-gray-600">{doc.reason}</p>
      <Textarea
        placeholder="반려 사유 (반려 시 필수)"
        value={rejectReason}
        onChange={(e) => setRejectReason(e.target.value)}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={approve}>승인</Button>
        <Button variant="outline" onClick={reject}>
          반려
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 수동 검증**

Run: `npm run dev`, 결재자 계정으로 로그인해 Task 18에서 제출한 문서를 `/approvals`에서 확인
하고 승인/반려 처리 후 신청인 계정의 `/documents`에 상태가 반영되는지 확인.

- [ ] **Step 7: Commit**

```bash
git add app/api/leave-requests/[id]/approve app/api/leave-requests/[id]/reject app/api/approvals app/approvals
git commit -m "feat: 결재함 리스트/상세 및 승인/반려 API 추가"
```

---

### Task 21: 취소 처리 API + UI

**Files:**
- Create: `app/api/leave-requests/[id]/cancel/route.ts`
- Modify: `app/documents/page.tsx`

**Interfaces:**
- Consumes: `applyTransition` (Task 7), `requireApprovedUser`, `requireAdmin` (Task 10)
- Produces: `POST /api/leave-requests/:id/cancel`

- [ ] **Step 1: 취소 API 작성**

```ts
// app/api/leave-requests/[id]/cancel/route.ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { applyTransition, type Actor } from '@/lib/domain/leave-workflow'
import { db } from '@/lib/db/client'
import { leaveRequests } from '@/lib/db/schema'
import { requireApprovedUser } from '@/lib/auth/session'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApprovedUser()
  const currentUserId = Number((session.user as { id: string }).id)
  const role = (session.user as { role: string }).role
  const { id } = await params

  const [leaveRequest] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, Number(id)))
  if (!leaveRequest) {
    return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })
  }

  const isOwner = leaveRequest.userId === currentUserId
  const isAdmin = role === 'ADMIN'
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: '취소 권한이 없습니다.' }, { status: 403 })
  }

  const actor: Actor = isAdmin ? 'ADMIN' : 'REQUESTER'

  let nextStatus
  try {
    nextStatus = applyTransition(leaveRequest.status as never, 'CANCEL', actor)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }

  const [updated] = await db
    .update(leaveRequests)
    .set({ status: nextStatus })
    .where(eq(leaveRequests.id, Number(id)))
    .returning()

  return NextResponse.json(updated)
}
```

- [ ] **Step 2: 내 문서 리스트에 취소 버튼 추가**

`app/documents/page.tsx`의 `<li>` 블록을 아래로 교체한다.

```tsx
        {filtered.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between rounded border p-3">
            <div>
              <p className="font-medium">{doc.title}</p>
              <p className="text-sm text-gray-500">
                {doc.startDate} ~ {doc.endDate} ({doc.requestedDays}일)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge>{STATUS_LABEL[doc.status]}</Badge>
              {doc.status === 'PENDING' && (
                <button
                  className="text-sm text-red-600 hover:underline"
                  onClick={async () => {
                    await fetch(`/api/leave-requests/${doc.id}/cancel`, { method: 'POST' })
                    setDocuments((prev) =>
                      prev.map((d) => (d.id === doc.id ? { ...d, status: 'CANCELED' } : d))
                    )
                  }}
                >
                  취소
                </button>
              )}
            </div>
          </li>
        ))}
```

- [ ] **Step 3: 수동 검증**

Run: `npm run dev`, `PENDING` 상태 문서를 신청인 계정에서 취소하고 상태가 `CANCELED`로
바뀌는지 확인.

- [ ] **Step 4: Commit**

```bash
git add app/api/leave-requests/[id]/cancel app/documents/page.tsx
git commit -m "feat: 휴가계 취소 처리 기능 추가"
```

---

### Task 22: 대시보드 API + 화면

**Files:**
- Create: `app/api/dashboard/route.ts`
- Create: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `loadBalance` (Task 17), `requireApprovedUser` (Task 10), `db`, `leaveRequests`
  (Task 9)
- Produces: `GET /api/dashboard` → `{ granted, used, remaining, myPending, approvalPending, approvalProcessed }`

- [ ] **Step 1: 대시보드 집계 API**

```ts
// app/api/dashboard/route.ts
import { and, eq, ne } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { loadBalance } from '@/lib/domain/leave-request-context'
import { db } from '@/lib/db/client'
import { leaveRequests } from '@/lib/db/schema'
import { requireApprovedUser } from '@/lib/auth/session'

export async function GET() {
  const session = await requireApprovedUser()
  const userId = Number((session.user as { id: string }).id)

  const balance = await loadBalance(userId)

  const myPending = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'PENDING')))

  const approvalPending = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.approverId, userId), eq(leaveRequests.status, 'PENDING')))

  const approvalProcessed = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.approverId, userId), ne(leaveRequests.status, 'PENDING'), ne(leaveRequests.status, 'DRAFT')))

  return NextResponse.json({
    granted: balance.granted,
    used: balance.used,
    remaining: balance.remaining,
    myPendingCount: myPending.length,
    approvalPendingCount: approvalPending.length,
    approvalProcessedCount: approvalProcessed.length,
  })
}
```

- [ ] **Step 2: 대시보드 화면**

```tsx
// app/dashboard/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'

interface DashboardData {
  granted: number
  used: number
  remaining: number
  myPendingCount: number
  approvalPendingCount: number
  approvalProcessedCount: number
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    fetch('/api/dashboard')
      .then((res) => res.json())
      .then(setData)
  }, [])

  if (!data) return null

  return (
    <div className="mx-auto mt-10 max-w-3xl space-y-6">
      <div>
        <h2 className="mb-2 text-lg font-semibold">내 휴가 정보</h2>
        <div className="grid grid-cols-4 gap-3">
          <Card className="p-4 text-center">
            <p className="text-sm text-gray-500">발생</p>
            <p className="text-2xl font-bold">{data.granted}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-sm text-gray-500">사용</p>
            <p className="text-2xl font-bold">{data.used}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-sm text-gray-500">미사용</p>
            <p className="text-2xl font-bold">{data.remaining}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-sm text-gray-500">결재 대기</p>
            <p className="text-2xl font-bold">{data.myPendingCount}</p>
          </Card>
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-lg font-semibold">내 결재 정보</h2>
        {data.approvalPendingCount > 0 && (
          <Link
            href="/approvals"
            className="mb-3 block rounded bg-yellow-100 p-3 text-sm text-yellow-800 hover:bg-yellow-200"
          >
            결재 대기 문서가 {data.approvalPendingCount}건 있습니다. 클릭해서 확인하세요.
          </Link>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 text-center">
            <p className="text-sm text-gray-500">결재 대기 문서</p>
            <p className="text-2xl font-bold">{data.approvalPendingCount}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-sm text-gray-500">처리 문서</p>
            <p className="text-2xl font-bold">{data.approvalProcessedCount}</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 수동 검증**

Run: `npm run dev`, 결재 대기 문서가 있는 결재자 계정으로 로그인해 대시보드에 알림 배너가
노출되고 클릭 시 `/approvals`로 이동하는지 확인.

- [ ] **Step 4: Commit**

```bash
git add app/api/dashboard app/dashboard
git commit -m "feat: 대시보드 집계 API 및 화면 추가"
```

---

### Task 23: GNB 레이아웃

**Files:**
- Create: `components/gnb.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `useSession` (next-auth/react)

- [ ] **Step 1: GNB 컴포넌트 작성**

```tsx
// components/gnb.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'

const LINKS = [
  { href: '/dashboard', label: '대시보드' },
  { href: '/documents', label: '내 문서' },
  { href: '/approvals', label: '결재함' },
]

const ADMIN_LINKS = [
  { href: '/admin/signups', label: '가입 승인' },
  { href: '/admin/users', label: '프리랜서 관리' },
  { href: '/admin/holidays', label: '공휴일 관리' },
]

export function Gnb() {
  const pathname = usePathname()
  const { data: session } = useSession()

  if (!session?.user) return null

  const role = (session.user as { role?: string }).role
  const links = role === 'ADMIN' ? [...LINKS, ...ADMIN_LINKS] : LINKS

  return (
    <nav className="flex items-center justify-between border-b px-6 py-3">
      <div className="flex gap-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={pathname?.startsWith(link.href) ? 'font-semibold' : 'text-gray-500'}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <button className="text-sm text-gray-500" onClick={() => signOut({ callbackUrl: '/login' })}>
        로그아웃
      </button>
    </nav>
  )
}
```

- [ ] **Step 2: 루트 레이아웃에 GNB 연결**

`app/layout.tsx`를 다음 구조로 갱신한다(기존 `<Providers>` 래핑 유지).

```tsx
import { Gnb } from '@/components/gnb'
import { Providers } from './providers'
import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Providers>
          <Gnb />
          {children}
        </Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: 수동 검증**

Run: `npm run dev`, 일반 프리랜서 계정과 관리자 계정 각각으로 로그인해 GNB 메뉴 구성이
역할에 맞게 달라지는지 확인.

- [ ] **Step 4: Commit**

```bash
git add components/gnb.tsx app/layout.tsx
git commit -m "feat: 역할 기반 GNB 레이아웃 추가"
```

---

### Task 24: 관리자 — 연차 수동 조정

**Files:**
- Create: `app/api/admin/leave-adjustments/route.ts`
- Modify: `app/admin/users/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (Task 10), `getCurrentCycle` (Task 3), `db`, `leaveGrants`,
  `users` (Task 9)
- Produces: `POST /api/admin/leave-adjustments` `{ userId, amount, note }`

- [ ] **Step 1: 수동 조정 API 작성**

```ts
// app/api/admin/leave-adjustments/route.ts
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentCycle } from '@/lib/domain/leave-cycle'
import { toISODate } from '@/lib/domain/date-utils'
import { db } from '@/lib/db/client'
import { leaveGrants, users } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth/session'

const adjustmentSchema = z.object({
  userId: z.number(),
  amount: z.number(),
  note: z.string().min(1),
})

export async function POST(request: Request) {
  await requireAdmin()
  const parsed = adjustmentSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  const [user] = await db.select().from(users).where(eq(users.id, parsed.data.userId))
  if (!user?.hireDate) {
    return NextResponse.json({ error: '입사일이 등록되지 않은 사용자입니다.' }, { status: 400 })
  }

  const today = toISODate(new Date())
  const cycle = getCurrentCycle(user.hireDate, today)

  const [created] = await db
    .insert(leaveGrants)
    .values({
      userId: parsed.data.userId,
      grantDate: today,
      amount: parsed.data.amount,
      cycleEnd: cycle.end,
      expired: false,
      note: parsed.data.note,
    })
    .returning()

  return NextResponse.json(created, { status: 201 })
}
```

주: 연차를 차감하려면 음수 `amount`(예: `-1`)를 전달한다. `calculateLeaveBalance`(Task 5)는
`amount`를 그대로 합산하므로 음수 조정도 그대로 반영된다.

- [ ] **Step 2: 관리자 화면에 조정 UI 추가**

`app/admin/users/page.tsx`의 각 사용자 `<li>` 안에 아래 블록을 추가한다.

```tsx
            <Input
              placeholder="조정 일수 (예: 1 또는 -1)"
              className="w-40"
              onChange={(e) => updateField(user.id, 'adjustmentAmount' as never, e.target.value)}
            />
            <Button
              variant="outline"
              onClick={async () => {
                const amount = Number((user as unknown as { adjustmentAmount?: string }).adjustmentAmount ?? '0')
                if (!amount) return
                await fetch('/api/admin/leave-adjustments', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: user.id, amount, note: '관리자 수동 조정' }),
                })
              }}
            >
              연차 조정
            </Button>
```

- [ ] **Step 3: 수동 검증**

Run: `npm run dev`, `/admin/users`에서 특정 사용자에게 `-1` 조정을 적용하고 해당 사용자의
대시보드 잔여연차가 감소하는지 확인.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/leave-adjustments app/admin/users/page.tsx
git commit -m "feat: 관리자 연차 수동 조정 기능 추가"
```

---

### Task 25: 실시간 알림 (Supabase Realtime)

**Files:**
- Create: `lib/notifications/create-notification.ts`
- Create: `lib/supabase/client.ts` (브라우저용 Supabase 클라이언트)
- Create: `components/notification-bell.tsx`
- Modify: `app/api/signup/route.ts` (Task 11)
- Modify: `app/api/leave-requests/[id]/submit/route.ts` (Task 17)
- Modify: `app/api/leave-requests/[id]/approve/route.ts`, `.../reject/route.ts` (Task 20)
- Modify: `components/gnb.tsx` (Task 23)
- Modify: Supabase 대시보드 설정 (RLS 정책, Realtime 발행 테이블 등록)

**Interfaces:**
- Consumes: `db`, `notifications` (Task 9), `requireAdmin`/세션 (Task 10)
- Produces: `createNotification({ recipientId, type, refId, message })`,
  `NotificationBell` 클라이언트 컴포넌트(관리자/프리랜서 GNB에 배치)

설계 문서 7.1절 기준: 관리자는 가입 대기·휴가 제출 알림을, 프리랜서 본인은 본인 휴가계의
승인/반려 알림을 접속 중에만 실시간으로 받는다. `users`/`leave_requests` 원본 테이블이 아닌
전용 `notifications` 테이블만 Realtime 구독 대상으로 삼는다.

- [ ] **Step 1: Supabase Realtime 활성화 및 RLS 정책 설정**

Supabase 대시보드(또는 SQL)에서 `notifications` 테이블을 Realtime publication에 추가하고,
RLS를 활성화한 뒤 "본인이 수신자인 행만 SELECT 가능" 정책을 추가한다. 관리자용 구독은 원본
행 대신 별도 API(`/api/admin/notifications`)로 폴백 조회하거나, 관리자 전용 정책을 추가한다.
Auth.js 세션과 Supabase RLS는 별개의 인증 체계이므로, 클라이언트는 **익명(anon) 키로 연결하되
쿼리 시 본인의 세션에서 얻은 `recipientId`로 필터링**하고, 서버(API 라우트)에서 생성되는
`notifications` row 자체를 신뢰 경계로 삼는다(클라이언트가 임의 recipientId를 조작해도 RLS가
행을 반환하지 않도록 설계). 세부 정책 문구는 구현 시점에 Supabase 문서를 참조해 확정한다.

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: 알림 생성 헬퍼 작성**

```ts
// lib/notifications/create-notification.ts
import { db } from '@/lib/db/client'
import { notifications } from '@/lib/db/schema'

type NotificationType = 'SIGNUP_PENDING' | 'LEAVE_SUBMITTED' | 'LEAVE_APPROVED' | 'LEAVE_REJECTED'

export async function createNotification(params: {
  recipientId: number
  type: NotificationType
  refId: number
  message: string
}) {
  await db.insert(notifications).values(params)
}
```

- [ ] **Step 3: 이벤트 발생 지점에 알림 생성 연결**

- `app/api/signup/route.ts`: 가입 신청 성공 후 관리자 전원에게 `SIGNUP_PENDING` 알림 생성.
- `app/api/leave-requests/[id]/submit/route.ts`: 제출 처리 후 지정된 결재자에게
  `LEAVE_SUBMITTED` 알림 생성.
- `app/api/leave-requests/[id]/approve/route.ts`, `.../reject/route.ts`: 처리 후 신청인에게
  `LEAVE_APPROVED`/`LEAVE_REJECTED` 알림 생성.

- [ ] **Step 4: 브라우저 Supabase 클라이언트 및 구독 컴포넌트 작성**

```ts
// lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js'

export const supabaseBrowserClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

`components/notification-bell.tsx`에서 로그인한 사용자의 `id`/`role`을 기준으로
`notifications` 테이블을 `postgres_changes` INSERT 이벤트로 구독하고, 토스트/뱃지로 표시한다.
관리자는 `type in ('SIGNUP_PENDING','LEAVE_SUBMITTED')` 전체를, 프리랜서는
`recipientId = 본인 id`인 행만 구독한다.

- [ ] **Step 5: GNB에 알림 벨 배치**

`components/gnb.tsx`에 `<NotificationBell />`을 추가한다.

- [ ] **Step 6: 수동 검증**

Run: `npm run dev`. 두 개의 브라우저 세션(관리자 1개, 프리랜서 1개)을 열어두고, 프리랜서가
휴가계를 제출하면 관리자 세션에 알림이 즉시 표시되는지, 관리자가 승인하면 프리랜서 세션에
알림이 즉시 표시되는지 확인한다.

- [ ] **Step 7: Commit**

```bash
git add lib/notifications lib/supabase components/notification-bell.tsx app/api/signup app/api/leave-requests components/gnb.tsx package.json package-lock.json
git commit -m "feat: Supabase Realtime 기반 실시간 알림 기능 추가"
```

---

## Post-Implementation Checklist

- [ ] `npm run test` — Task 2~8의 도메인 로직 단위 테스트 전체 통과
- [ ] `npm run build` — 타입 에러 없이 프로덕션 빌드 성공
- [ ] 회원가입 → 관리자 승인 → 로그인 → 휴가계 작성 → 제출 → 결재 → 대시보드 반영까지
      전체 흐름을 브라우저에서 수동으로 1회 통과
- [ ] 프리랜서 휴가계 제출 시 관리자 세션에, 관리자 승인/반려 시 프리랜서 세션에 실시간 알림이
      뜨는지 수동 확인 (Task 25)
- [ ] Vercel에 배포 후 `vercel:marketplace`로 프로비저닝한 Supabase의 `POSTGRES_URL`,
      `POSTGRES_URL_NON_POOLING`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `AUTH_SECRET`, `CRON_SECRET` 환경 변수가 프로덕션에도 설정되어 있는지 확인
