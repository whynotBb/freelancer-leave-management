# 공휴일 관리 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 공휴일을 등록/삭제하는 화면을 만들고(반복/비반복 구분), 연차 신청
달력에 토요일/일요일/공휴일을 색으로 표시한다.

**Architecture:** `holidays` 테이블에 `isRecurring` 컬럼을 추가하고, 순수 함수
`expandHolidayDates`로 반복 공휴일의 월/일을 필요한 연도 범위에 투영해 기존
`getHolidayDates()`가 반환하는 `Set<string>`을 채운다. 이 Set은 이미 신청일수 계산과
`LeaveRequestSheet`에 흘러가고 있으므로, 계산 로직과 데이터 흐름은 그대로 두고 (1)
관리 화면/API를 새로 얹고 (2) 날짜 선택기에 색상 표시만 추가한다.

**Tech Stack:** Next.js App Router, Drizzle ORM(Postgres), Zod, react-day-picker,
Tailwind CSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-holiday-management-design.md`

## Global Constraints

- 공휴일 관리 메뉴/API는 `SUPER_ADMIN`만 접근 가능(`APPROVER` 제외).
- 주말은 `isWeekend`(date-fns)로 이미 자동 제외되므로 `holidays` 테이블에 저장하지
  않는다.
- 반복 공휴일도 `date` 컬럼에는 최초 등록 연도의 실제 날짜를 저장하고, `isRecurring`
  플래그로 월/일만 매년 재사용한다 — `date`의 `unique()` 제약은 그대로 유지.
- 연차 신청 가능 범위(오늘 기준 1개월 전 ~ 내년 말)를 덮도록 반복 공휴일은 올해
  기준 -1년 ~ +2년 범위로 투영한다.
- 공휴일이어도 날짜 선택 자체는 막지 않는다(표시만 바꾼다) — `disabled` matcher는
  건드리지 않는다.
- 커밋 메시지·주석은 한국어, 변수/함수명은 영어.

---

### Task 1: 스키마에 `isRecurring` 컬럼 추가

**Files:**
- Modify: `lib/db/schema.ts` (`holidays` 테이블, 58-62번째 줄)
- Create: `drizzle/0007_holiday-recurrence.sql` (drizzle-kit generate로 자동 생성)

**Interfaces:**
- Consumes: 없음
- Produces: `holidays.isRecurring: boolean` 컬럼 (이후 모든 Task가 이 컬럼을 읽고 씀)

- [ ] **Step 1: 스키마 수정**

`lib/db/schema.ts`의 `holidays` 정의를 다음으로 교체한다:

```ts
export const holidays = pgTable('holidays', {
  id: serial('id').primaryKey(),
  date: date('date', { mode: 'string' }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  isRecurring: boolean('is_recurring').notNull().default(false),
})
```

(`boolean`은 이 파일 1번째 줄에서 이미 import되어 있어 추가 import 불필요.)

- [ ] **Step 2: 마이그레이션 생성**

Run: `npx drizzle-kit generate --name holiday-recurrence`

Expected: `drizzle/0007_holiday-recurrence.sql` 생성, 다음과 의미가 같은 내용:

```sql
ALTER TABLE "holidays" ADD COLUMN "is_recurring" boolean DEFAULT false NOT NULL;
```

- [ ] **Step 3: 마이그레이션 적용**

Run: `npx dotenv -e .env.local -- npx drizzle-kit migrate`
Expected: 에러 없이 완료.

- [ ] **Step 4: 커밋**

```bash
git add lib/db/schema.ts drizzle/0007_holiday-recurrence.sql drizzle/meta
git commit -m "feat: holidays 테이블에 매년 반복 여부(isRecurring) 컬럼 추가"
```

---

### Task 2: `expandHolidayDates` 순수 함수 (TDD)

**Files:**
- Create: `lib/domain/holidays.ts`
- Test: `lib/domain/holidays.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수, DB 접근 없음)
- Produces:
  ```ts
  export interface HolidayRow {
    date: string       // 'YYYY-MM-DD'
    name: string
    isRecurring: boolean
  }
  export function expandHolidayDates(
    rows: HolidayRow[],
    asOfYear: number,
    yearsBefore: number,
    yearsAfter: number
  ): Set<string>
  ```
  Task 3이 이 함수와 타입을 그대로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/domain/holidays.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { expandHolidayDates, type HolidayRow } from './holidays'

describe('expandHolidayDates', () => {
  it('비반복 공휴일은 저장된 날짜 그대로 포함한다', () => {
    const rows: HolidayRow[] = [{ date: '2026-09-25', name: '추석', isRecurring: false }]
    const result = expandHolidayDates(rows, 2026, 1, 2)
    expect(result.has('2026-09-25')).toBe(true)
    expect(result.size).toBe(1)
  })

  it('반복 공휴일은 지정된 연도 범위 전체에 같은 월/일로 투영된다', () => {
    const rows: HolidayRow[] = [{ date: '2026-01-01', name: '신정', isRecurring: true }]
    const result = expandHolidayDates(rows, 2026, 1, 2)
    expect(result.has('2025-01-01')).toBe(true)
    expect(result.has('2026-01-01')).toBe(true)
    expect(result.has('2027-01-01')).toBe(true)
    expect(result.has('2028-01-01')).toBe(true)
    expect(result.size).toBe(4)
  })

  it('반복 공휴일이 2월 29일이면 윤년에만 포함하고 평년에는 건너뛴다', () => {
    const rows: HolidayRow[] = [{ date: '2024-02-29', name: '테스트', isRecurring: true }]
    const result = expandHolidayDates(rows, 2025, 1, 2) // 범위: 2024~2027
    expect([...result]).toEqual(['2024-02-29'])
  })

  it('반복과 비반복 공휴일이 섞여 있으면 모두 포함한다', () => {
    const rows: HolidayRow[] = [
      { date: '2026-01-01', name: '신정', isRecurring: true },
      { date: '2026-09-25', name: '추석', isRecurring: false },
    ]
    const result = expandHolidayDates(rows, 2026, 0, 0)
    expect(result.has('2026-01-01')).toBe(true)
    expect(result.has('2026-09-25')).toBe(true)
    expect(result.size).toBe(2)
  })
})
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx vitest run lib/domain/holidays.test.ts`
Expected: FAIL — `Cannot find module './holidays'` (아직 구현 파일이 없음)

- [ ] **Step 3: 구현**

`lib/domain/holidays.ts`:

```ts
import { parseISO } from 'date-fns'
import { toISODate } from './date-utils'

export interface HolidayRow {
  date: string
  name: string
  isRecurring: boolean
}

// 반복 공휴일의 월/일을 [asOfYear - yearsBefore, asOfYear + yearsAfter] 범위의 매 연도에
// 투영한다. 2월 29일처럼 대상 연도에 존재하지 않는 날짜는 그 연도만 건너뛴다(3/1 등으로
// 보정하지 않음) — new Date(year, month, day)가 오버플로우되면 getMonth()가 원래 month와
// 달라지는 것으로 감지한다.
export function expandHolidayDates(
  rows: HolidayRow[],
  asOfYear: number,
  yearsBefore: number,
  yearsAfter: number
): Set<string> {
  const result = new Set<string>()
  for (const row of rows) {
    if (!row.isRecurring) {
      result.add(row.date)
      continue
    }
    const original = parseISO(row.date)
    const month = original.getMonth()
    const day = original.getDate()
    for (let year = asOfYear - yearsBefore; year <= asOfYear + yearsAfter; year++) {
      const projected = new Date(year, month, day)
      if (projected.getMonth() !== month) continue
      result.add(toISODate(projected))
    }
  }
  return result
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npx vitest run lib/domain/holidays.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/domain/holidays.ts lib/domain/holidays.test.ts
git commit -m "feat: 반복 공휴일을 연도 범위에 투영하는 expandHolidayDates 추가"
```

---

### Task 3: DB 레이어 — 조회/생성/삭제

**Files:**
- Modify: `lib/db/holidays.ts` (전체 교체)

**Interfaces:**
- Consumes: `expandHolidayDates`, `HolidayRow` (Task 2), `isUniqueViolation`
  (`lib/db/postgres-errors.ts`, 기존)
- Produces:
  ```ts
  export interface HolidayListItem {
    id: number
    date: string
    name: string
    isRecurring: boolean
  }
  export async function getHolidayDates(): Promise<Set<string>>          // 기존 시그니처 유지
  export async function listHolidays(): Promise<HolidayListItem[]>
  export async function createHoliday(params: {
    date: string
    name: string
    isRecurring: boolean
  }): Promise<{ ok: true; id: number } | { error: string }>
  export async function deleteHoliday(id: number): Promise<boolean>
  ```
  Task 4(API 라우트)가 이 4개 함수를 그대로 가져다 쓴다.

- [ ] **Step 1: 구현**

`lib/db/holidays.ts` 전체를 다음으로 교체한다:

```ts
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { holidays } from '@/lib/db/schema'
import { expandHolidayDates } from '@/lib/domain/holidays'
import { isUniqueViolation } from '@/lib/db/postgres-errors'

export async function getHolidayDates(): Promise<Set<string>> {
  const rows = await db
    .select({ date: holidays.date, name: holidays.name, isRecurring: holidays.isRecurring })
    .from(holidays)
  const currentYear = new Date().getFullYear()
  return expandHolidayDates(rows, currentYear, 1, 2)
}

export interface HolidayListItem {
  id: number
  date: string
  name: string
  isRecurring: boolean
}

export async function listHolidays(): Promise<HolidayListItem[]> {
  return db.select().from(holidays).orderBy(holidays.date)
}

export async function createHoliday(params: {
  date: string
  name: string
  isRecurring: boolean
}): Promise<{ ok: true; id: number } | { error: string }> {
  try {
    const [row] = await db.insert(holidays).values(params).returning({ id: holidays.id })
    return { ok: true, id: row.id }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: '이미 등록된 날짜입니다.' }
    }
    throw error
  }
}

export async function deleteHoliday(id: number): Promise<boolean> {
  const rows = await db.delete(holidays).where(eq(holidays.id, id)).returning({ id: holidays.id })
  return rows.length > 0
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/db/holidays.ts
git commit -m "feat: 공휴일 목록 조회/생성/삭제 DB 함수 추가, getHolidayDates에 반복 확장 적용"
```

---

### Task 4: 관리자 API 라우트

**Files:**
- Create: `app/api/admin/holidays/route.ts`
- Create: `app/api/admin/holidays/[id]/route.ts`

**Interfaces:**
- Consumes: `listHolidays`, `createHoliday`, `deleteHoliday` (Task 3),
  `requireSuperAdmin`/`toAuthErrorResponse` (`lib/auth/session.ts`, 기존)
- Produces: `GET/POST /api/admin/holidays`, `DELETE /api/admin/holidays/[id]` — Task 6(관리
  화면)이 이 3개 엔드포인트를 fetch로 호출한다.

- [ ] **Step 1: 목록 조회 + 생성 라우트**

`app/api/admin/holidays/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'
import { createHoliday, listHolidays } from '@/lib/db/holidays'

export async function GET() {
  try {
    await requireSuperAdmin()
    const list = await listHolidays()
    return NextResponse.json(list)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const bodySchema = z.object({
  date: z.string().regex(DATE_REGEX, '날짜 형식이 올바르지 않습니다.'),
  name: z.string().min(1),
  isRecurring: z.boolean(),
})

export async function POST(request: Request) {
  try {
    await requireSuperAdmin()

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

    const result = await createHoliday(parsed.data)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ ok: true, id: result.id })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

- [ ] **Step 2: 삭제 라우트**

`app/api/admin/holidays/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'
import { deleteHoliday } from '@/lib/db/holidays'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin()
    const { id } = await params
    const deleted = await deleteHoliday(Number(id))
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

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npx next build`
Expected: 에러 없음, `/api/admin/holidays`, `/api/admin/holidays/[id]` 라우트가 빌드
출력에 나타남

- [ ] **Step 4: 커밋**

```bash
git add app/api/admin/holidays
git commit -m "feat: 공휴일 관리 API 라우트 추가(GET/POST/DELETE, SUPER_ADMIN 전용)"
```

---

### Task 5: 공휴일 추가 다이얼로그 컴포넌트

**Files:**
- Create: `components/holiday-form-dialog.tsx`

**Interfaces:**
- Consumes: `Dialog`/`DialogContent`/`DialogDescription`/`DialogFooter`/`DialogHeader`/
  `DialogTitle`(`@/components/ui/dialog`), `Checkbox`(`@/components/ui/checkbox`),
  `DatePicker`(`@/components/date-picker`), `Input`, `Label`, `Button` — 모두 기존
  컴포넌트
- Produces:
  ```ts
  interface HolidayFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: (date: string, name: string, isRecurring: boolean) => void
    submitting?: boolean
    error?: string | null
  }
  export function HolidayFormDialog(props: HolidayFormDialogProps): JSX.Element
  ```
  Task 6이 이 컴포넌트를 렌더링하고 `onConfirm`에서 `POST /api/admin/holidays`를 호출한다.

- [ ] **Step 1: 구현**

`components/holiday-form-dialog.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DatePicker } from '@/components/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface HolidayFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (date: string, name: string, isRecurring: boolean) => void
  submitting?: boolean
  error?: string | null
}

export function HolidayFormDialog({
  open,
  onOpenChange,
  onConfirm,
  submitting = false,
  error = null,
}: HolidayFormDialogProps) {
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setDate('')
      setName('')
      setIsRecurring(false)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>공휴일 추가</DialogTitle>
          <DialogDescription>
            신정처럼 매년 같은 날짜인 공휴일은 &quot;매년 반복&quot;을 선택하세요. 선택한
            날짜의 월/일이 매년 반복 적용됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="holiday-recurring"
              checked={isRecurring}
              onCheckedChange={(v) => setIsRecurring(v === true)}
            />
            <Label htmlFor="holiday-recurring">매년 반복</Label>
          </div>
          <div className="space-y-1.5">
            <Label>날짜</Label>
            <DatePicker value={date || undefined} onChange={setDate} className="w-full" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="holiday-name">이름</Label>
            <Input
              id="holiday-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 신정"
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            닫기
          </Button>
          <Button
            onClick={() => onConfirm(date, name, isRecurring)}
            disabled={submitting || date.length === 0 || name.trim().length === 0}
          >
            {submitting ? '저장 중...' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (아직 아무 데서도 import하지 않아 미사용 경고는 없음 — 컴포넌트
파일 자체는 export만 하므로 정상)

- [ ] **Step 3: 커밋**

```bash
git add components/holiday-form-dialog.tsx
git commit -m "feat: 공휴일 추가 다이얼로그 컴포넌트 추가"
```

---

### Task 6: 관리자 화면(`/admin/holidays`) + 사이드바 메뉴

**Files:**
- Create: `app/admin/holidays/page.tsx`
- Modify: `components/app-sidebar.tsx` (`ADMIN_LINKS` 배열, 70-75번째 줄)

**Interfaces:**
- Consumes: `HolidayFormDialog`(Task 5), `GET/POST/DELETE /api/admin/holidays*`(Task 4),
  `ConfirmDialog`(`@/components/confirm-dialog`, 기존), `PageHeader`, `LoadingSpinner`,
  `Table`류, `Select`류, `Button`, `Badge` — 모두 기존 컴포넌트
- Produces: 없음 (최종 화면)

- [ ] **Step 1: 사이드바에 메뉴 추가**

`components/app-sidebar.tsx`의 import 목록에 `CalendarDaysIcon`을 추가하고(9-22번째
줄의 lucide-react import에 포함), `ADMIN_LINKS` 배열(70-75번째 줄)을 다음으로
교체한다:

```ts
const ADMIN_LINKS = [
  { href: '/admin/users-manage', label: '사용자 관리', icon: UserCogIcon, roles: ['SUPER_ADMIN'] },
  { href: '/admin/users', label: '프리랜서 정보 관리', icon: UsersIcon, roles: ['SUPER_ADMIN', 'APPROVER'] },
  { href: '/admin/holidays', label: '공휴일 관리', icon: CalendarDaysIcon, roles: ['SUPER_ADMIN'] },
  { href: '/admin/departures', label: '퇴사자 관리', icon: UserMinusIcon, roles: ['SUPER_ADMIN'] },
  { href: '/admin/history', label: '변경 이력', icon: HistoryIcon, roles: ['SUPER_ADMIN'] },
]
```

- [ ] **Step 2: 관리자 화면 구현**

`app/admin/holidays/page.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingSpinner } from '@/components/loading-spinner'
import { PageHeader } from '@/components/page-header'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { HolidayFormDialog } from '@/components/holiday-form-dialog'

interface HolidayItem {
  id: number
  date: string
  name: string
  isRecurring: boolean
}

function monthDay(date: string): string {
  const [, month, day] = date.split('-')
  return `${month}/${day}`
}

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<HolidayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [yearFilter, setYearFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  function loadHolidays() {
    setLoading(true)
    setLoadError(null)
    fetch('/api/admin/holidays')
      .then((res) => {
        if (!res.ok) throw new Error('불러오지 못했습니다.')
        return res.json()
      })
      .then(setHolidays)
      .catch(() => setLoadError('공휴일 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadHolidays()
  }, [])

  const recurring = useMemo(
    () => [...holidays].filter((h) => h.isRecurring).sort((a, b) => monthDay(a.date).localeCompare(monthDay(b.date))),
    [holidays]
  )
  const oneTime = useMemo(() => holidays.filter((h) => !h.isRecurring), [holidays])
  const yearOptions = useMemo(() => {
    const years = new Set(oneTime.map((h) => h.date.slice(0, 4)))
    return [...years].sort((a, b) => (a < b ? 1 : -1))
  }, [oneTime])
  const filteredOneTime = useMemo(
    () =>
      oneTime
        .filter((h) => yearFilter === 'all' || h.date.slice(0, 4) === yearFilter)
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [oneTime, yearFilter]
  )
  const deleteTarget = holidays.find((h) => h.id === deleteTargetId) ?? null

  async function handleCreate(date: string, name: string, isRecurring: boolean) {
    setFormSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/admin/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, name, isRecurring }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setFormError(body?.error ?? '등록에 실패했습니다.')
        return
      }
      setFormOpen(false)
      loadHolidays()
    } finally {
      setFormSubmitting(false)
    }
  }

  async function handleDelete() {
    if (deleteTargetId === null) return
    setDeleteSubmitting(true)
    try {
      const res = await fetch(`/api/admin/holidays/${deleteTargetId}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteTargetId(null)
        loadHolidays()
      }
    } finally {
      setDeleteSubmitting(false)
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="공휴일 관리"
        description="연차 신청일수 계산에서 제외할 공휴일을 등록합니다. 주말은 자동으로 제외되어 별도 등록이 필요 없습니다."
        action={<Button onClick={() => setFormOpen(true)}>+ 공휴일 추가</Button>}
      />

      <p className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
        신정처럼 매년 같은 날짜인 공휴일은 &quot;매년 반복&quot;으로 등록하면 이후
        연도에도 자동 적용됩니다. 설날·추석처럼 음력 기준이라 매년 날짜가 바뀌는
        공휴일은 매년 새로 등록해야 합니다.
      </p>

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 font-medium">매년 반복 공휴일</h2>
            {recurring.length === 0 ? (
              <p className="text-sm text-muted-foreground">등록된 반복 공휴일이 없습니다.</p>
            ) : (
              <>
                <div className="hidden xl:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">월/일</TableHead>
                        <TableHead>이름</TableHead>
                        <TableHead className="w-24 text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recurring.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell>{monthDay(h.date)}</TableCell>
                          <TableCell>{h.name}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" className="text-destructive" onClick={() => setDeleteTargetId(h.id)}>
                              삭제
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-2 xl:hidden">
                  {recurring.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                      <div>
                        <Badge variant="outline" className="mr-2">
                          매년 반복
                        </Badge>
                        {monthDay(h.date)} · {h.name}
                      </div>
                      <Button variant="ghost" className="text-destructive" onClick={() => setDeleteTargetId(h.id)}>
                        삭제
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">특정 연도 공휴일</h2>
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
            </div>
            {filteredOneTime.length === 0 ? (
              <p className="text-sm text-muted-foreground">등록된 공휴일이 없습니다.</p>
            ) : (
              <>
                <div className="hidden xl:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-32">날짜</TableHead>
                        <TableHead>이름</TableHead>
                        <TableHead className="w-24 text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOneTime.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell>{h.date}</TableCell>
                          <TableCell>{h.name}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" className="text-destructive" onClick={() => setDeleteTargetId(h.id)}>
                              삭제
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-2 xl:hidden">
                  {filteredOneTime.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                      <div>
                        {h.date} · {h.name}
                      </div>
                      <Button variant="ghost" className="text-destructive" onClick={() => setDeleteTargetId(h.id)}>
                        삭제
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <HolidayFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onConfirm={handleCreate}
        submitting={formSubmitting}
        error={formError}
      />
      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
        title="공휴일 삭제"
        description={
          deleteTarget?.isRecurring
            ? '이 공휴일을 삭제하시겠습니까? 매년 반복 적용도 함께 삭제됩니다.'
            : '이 공휴일을 삭제하시겠습니까?'
        }
        confirmLabel="삭제"
        onConfirm={handleDelete}
        submitting={deleteSubmitting}
        destructive
      />
    </div>
  )
}
```

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npx next build`
Expected: 에러 없음, `/admin/holidays` 라우트가 빌드 출력에 나타남

- [ ] **Step 4: 브라우저 확인**

`run` 스킬 또는 `npx next dev`로 개발 서버를 띄우고, SUPER_ADMIN 계정으로 로그인해
`/admin/holidays`에서: 공휴일 추가(반복 체크 켬/끔 각각), 목록에 두 섹션으로
분리돼 표시되는지, 연도 필터, 삭제(반복/비반복 각각 확인 문구가 다르게 뜨는지)를
직접 클릭해 확인한다. 중복 날짜로 추가를 시도해 "이미 등록된 날짜입니다" 에러가
뜨는지도 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add app/admin/holidays components/app-sidebar.tsx
git commit -m "feat: 공휴일 관리 화면(/admin/holidays) 및 사이드바 메뉴 추가"
```

---

### Task 7: 연차 신청 달력에 주말/공휴일 색상 표시

**Files:**
- Modify: `components/date-picker.tsx` (`DatePicker`/`DateRangePicker` 둘 다)
- Modify: `components/leave-request-sheet.tsx` (301-327번째 줄 부근,
  `DateRangePicker`/`DatePicker` 호출부)

**Interfaces:**
- Consumes: 없음 (기존 `holidayDates: string[]` prop을 `LeaveRequestSheet`에서 이미
  받고 있고, 101번째 줄에서 `holidaySet`으로 변환도 이미 하고 있음 — 그 변수를
  내려주기만 한다)
- Produces: `DatePicker`/`DateRangePicker`에 `holidayDates?: Set<string>` prop 추가

- [ ] **Step 1: `DatePicker`에 색상 표시 추가**

`components/date-picker.tsx`의 `DatePickerProps`(12-20번째 줄)에 필드를 추가한다:

```ts
interface DatePickerProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  minDate?: string
  maxDate?: string
  holidayDates?: Set<string>
}
```

`DatePicker` 함수 시그니처(33-41번째 줄)에 `holidayDates`를 받도록 추가하고, 85-96번째
줄의 `<Calendar>`에 `modifiers`/`modifiersClassNames`를 추가한다:

```tsx
<Calendar
  mode="single"
  selected={selected}
  startMonth={new Date(startYear, 0)}
  endMonth={new Date(endYear, 11)}
  disabled={disabledMatchers.length > 0 ? disabledMatchers : undefined}
  modifiers={{
    saturday: (date) => date.getDay() === 6,
    sundayOrHoliday: (date) => date.getDay() === 0 || (holidayDates?.has(format(date, 'yyyy-MM-dd')) ?? false),
  }}
  modifiersClassNames={{
    saturday: 'text-blue-600 dark:text-blue-400',
    sundayOrHoliday: 'text-red-600 dark:text-red-400',
  }}
  onSelect={(date) => {
    if (!date) return
    onChange(format(date, 'yyyy-MM-dd'))
    setOpen(false)
  }}
/>
```

- [ ] **Step 2: `DateRangePicker`에도 동일하게 추가**

`DateRangePickerProps`(102-111번째 줄)에도 `holidayDates?: Set<string>`을 추가하고,
`DateRangePicker` 함수 시그니처(115-124번째 줄)에서 받도록 한 뒤, 182-203번째 줄의
`<Calendar>`에 Step 1과 동일한 `modifiers`/`modifiersClassNames`를 추가한다(속성
이름과 값은 완전히 동일하게 재사용).

- [ ] **Step 3: `LeaveRequestSheet`에서 실제로 내려주기**

`components/leave-request-sheet.tsx`의 `DateRangePicker` 호출(305-313번째 줄)과
`DatePicker` 호출(320-327번째 줄) 각각에 `holidayDates={holidaySet}`을 추가한다(101번째
줄에 이미 정의된 `holidaySet` 변수를 그대로 전달).

```tsx
<DateRangePicker
  startValue={startDate}
  endValue={endDate}
  onChange={handleRangeChange}
  minDate={minLeaveDate}
  maxDate={maxLeaveDate}
  disabled={!canEditFields}
  holidayDates={holidaySet}
  className="w-full"
/>
```

```tsx
<DatePicker
  value={startDate}
  onChange={handleStartDateChange}
  minDate={minLeaveDate}
  maxDate={maxLeaveDate}
  disabled={!canEditFields}
  holidayDates={holidaySet}
  className="w-full"
/>
```

- [ ] **Step 4: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npx next build`
Expected: 에러 없음

- [ ] **Step 5: 브라우저 확인**

연차 신청 모달에서 "연차" 유형으로 기간 선택기를 열어, 토요일 글자가 파란색,
일요일 글자가 빨간색으로 보이는지 확인한다. `/admin/holidays`에서 임의의 평일에
공휴일을 하나 등록한 뒤 같은 달력을 다시 열어 그 날짜도 빨간색으로 보이는지, 그리고
여전히 클릭해서 선택할 수 있는지(막히지 않는지) 확인한다. 오전/오후 반차의 단일
날짜 선택기에서도 동일하게 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add components/date-picker.tsx components/leave-request-sheet.tsx
git commit -m "feat: 연차 신청 달력에 토요일/일요일/공휴일 색상 표시 추가"
```

---

## Self-Review 메모 (계획 작성자용, 실행 시 참고)

- **스펙 커버리지**: 1장(범위) → Task 1-7 전체, 2장(데이터 모델) → Task 1, 3장(휴일
  판정 로직) → Task 2-3, 4장(관리자 화면) → Task 5-6, 5장(API) → Task 4, 6장(달력
  색상) → Task 7, 7장(권한) → Task 4/6에서 `requireSuperAdmin` + `roles:
  ['SUPER_ADMIN']`으로 반영, 8장(에러/엣지케이스) → Task 3의 `isUniqueViolation`
  처리와 Task 6의 삭제 확인 문구, 9장(테스트) → Task 2. 누락 없음.
- **타입 일관성**: `HolidayRow`(Task 2) ↔ `getHolidayDates` 내부에서 select하는 컬럼
  형태가 일치하는지, `HolidayListItem`(Task 3) ↔ `HolidayItem`(Task 6, 관리 화면)의
  필드 구성이 동일한지 확인 완료 — 둘 다 `{ id, date, name, isRecurring }`.
