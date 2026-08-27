# 사용자 관리 화면 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "가입 승인"과 "결재담당자 관리" 화면을 "사용자 관리" 화면 하나로 통합하고, "프리랜서
정보 관리"에 있던 퇴사 액션도 이 화면으로 옮긴다.

**Architecture:** 신규 API(`/api/admin/users-manage*`)가 승인대기+활성 사용자를 단일 쿼리로
조회하고, 신규 화면(`/admin/users-manage`)이 역할별로 다른 액션(승인/거절 vs 퇴사)을 같은
테이블에서 렌더링한다. 기존 "가입 승인"·"결재담당자 관리" 화면과 전용 API는 삭제한다.

**Tech Stack:** Next.js App Router, Drizzle ORM, zod, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-08-27-user-management-consolidation-design.md`

## Global Constraints

- 신규 화면/API는 전부 `requireSuperAdmin()`으로 보호한다.
- 목록 조회 대상은 `signupStatus IN ('PENDING','APPROVED')`뿐이다(퇴사자·거절자는 별도 화면).
- 승인 시 `role` 필수, `role === 'FREELANCER'`면 `hireDate` 필수 — 없으면 400
  `"프리랜서 승인 시 입사일은 필수입니다."`.
- 거절은 `signupStatus='REJECTED'`로만 갱신한다(행 삭제 금지).
- `app/api/admin/approvers/route.ts`는 삭제하지 않는다 — 프리랜서 정보 관리의 기본 결재자
  콤보박스가 계속 사용한다.
- 비밀번호 초기화 버튼은 이번 범위에서 `disabled`로만 배치한다. 실제 동작은 이 스펙의 범위가
  아니다.
- 이 프로젝트 관례상 `app/`·API 라우트는 자동화 테스트 대신 `npx tsc --noEmit`/수동 브라우저
  확인으로 검증한다(자동화 테스트 대상은 `lib/domain/**`뿐인데, 이번 작업은 그 영역에 새 로직을
  추가하지 않는다).

---

### Task 1: 목록 조회 API — `GET /api/admin/users-manage`

**Files:**
- Create: `app/api/admin/users-manage/route.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin`/`toAuthErrorResponse`(`lib/auth/session.ts`), `db`(`lib/db/client.ts`), `users`(`lib/db/schema.ts`)
- Produces: `GET /api/admin/users-manage` → 200 배열, 각 원소
  `{ id: number; name: string; email: string; role: 'SUPER_ADMIN'|'APPROVER'|'FREELANCER'; signupStatus: 'PENDING'|'APPROVED'; hireDate: string | null; createdAt: string }`.
  `signupStatus='PENDING'`인 행이 먼저, 그다음 `createdAt` 내림차순. Task 3의 화면이 이 응답을
  그대로 소비한다.

- [ ] **Step 1: API 라우트 작성**

`app/api/admin/users-manage/route.ts` 신규 생성:

```ts
import { NextResponse } from 'next/server'
import { desc, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'

export async function GET() {
  try {
    await requireSuperAdmin()

    const list = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        signupStatus: users.signupStatus,
        hireDate: users.hireDate,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(inArray(users.signupStatus, ['PENDING', 'APPROVED']))
      .orderBy(sql`case when ${users.signupStatus} = 'PENDING' then 0 else 1 end`, desc(users.createdAt))

    return NextResponse.json(list)
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
git add app/api/admin/users-manage/route.ts
git commit -m "feat: 사용자 관리 목록 조회 API 추가"
```

---

### Task 2: 승인 / 거절 API

**Files:**
- Create: `app/api/admin/users-manage/[id]/approve/route.ts`
- Create: `app/api/admin/users-manage/[id]/reject/route.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin`/`toAuthErrorResponse`, `db`, `users`
- Produces:
  - `PATCH /api/admin/users-manage/[id]/approve` — body `{ role: 'FREELANCER'|'APPROVER'; hireDate?: string }`. 성공 200 `{ ok: true }`, 검증 실패 400 `{ error: string }`.
  - `PATCH /api/admin/users-manage/[id]/reject` — body 없음. 성공 200 `{ ok: true }`.
  - Task 3의 승인/거절 버튼이 호출한다.

- [ ] **Step 1: 승인 API 작성**

`app/api/admin/users-manage/[id]/approve/route.ts` 신규 생성:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'

const bodySchema = z.object({
  role: z.enum(['FREELANCER', 'APPROVER']),
  hireDate: z.string().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin()
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
    await db
      .update(users)
      .set({
        signupStatus: 'APPROVED',
        role: parsed.data.role,
        hireDate: isFreelancer ? parsed.data.hireDate : null,
      })
      .where(eq(users.id, Number(id)))

    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

- [ ] **Step 2: 거절 API 작성**

`app/api/admin/users-manage/[id]/reject/route.ts` 신규 생성:

```ts
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin()
    const { id } = await params

    await db.update(users).set({ signupStatus: 'REJECTED' }).where(eq(users.id, Number(id)))

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

- [ ] **Step 4: 커밋**

```bash
git add app/api/admin/users-manage/[id]/approve/route.ts app/api/admin/users-manage/[id]/reject/route.ts
git commit -m "feat: 사용자 관리 승인/거절 API 추가"
```

---

### Task 3: 사용자 관리 화면 + 사이드바 메뉴

**Files:**
- Create: `app/admin/users-manage/page.tsx`
- Create: `app/admin/users-manage/layout.tsx`
- Modify: `components/app-sidebar.tsx`

**Interfaces:**
- Consumes: `GET/PATCH /api/admin/users-manage*`(Task 1, 2), `POST /api/admin/users/[id]/resign`(기존), `ResignDialog`(`components/resign-dialog.tsx`, 기존), `LoadingSpinner`(`components/loading-spinner.tsx`, 기존), `PageHeader`(`components/page-header.tsx`, 기존)
- Produces: `/admin/users-manage` 화면. 사이드바 "사용자 관리" 링크(SUPER_ADMIN 전용).

- [ ] **Step 1: 페이지 타이틀용 layout 작성**

`app/admin/users-manage/layout.tsx` 신규 생성:

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '사용자 관리',
}

export default function Layout({ children }: LayoutProps<'/admin/users-manage'>) {
  return children
}
```

- [ ] **Step 2: 사용자 관리 페이지 작성**

`app/admin/users-manage/page.tsx` 신규 생성:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/date-picker'
import { LoadingSpinner } from '@/components/loading-spinner'
import { PageHeader } from '@/components/page-header'
import { ResignDialog } from '@/components/resign-dialog'
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

interface ManagedUser {
  id: number
  name: string
  email: string
  role: 'SUPER_ADMIN' | 'APPROVER' | 'FREELANCER'
  signupStatus: 'PENDING' | 'APPROVED'
  hireDate: string | null
  createdAt: string
}

type PendingRole = 'FREELANCER' | 'APPROVER'
type Tab = 'all' | 'pending'

const ROLE_LABEL: Record<ManagedUser['role'], string> = {
  SUPER_ADMIN: '최고관리자',
  APPROVER: '결재자',
  FREELANCER: '프리랜서',
}

const ROLE_BADGE_CLASS: Record<ManagedUser['role'], string> = {
  SUPER_ADMIN:
    'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  APPROVER:
    'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  FREELANCER:
    'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
}

const STATUS_LABEL: Record<ManagedUser['signupStatus'], string> = {
  PENDING: '승인대기',
  APPROVED: '활성',
}

const STATUS_BADGE_CLASS: Record<ManagedUser['signupStatus'], string> = {
  PENDING:
    'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  APPROVED:
    'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
}

export default function AdminUsersManagePage() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [tab, setTab] = useState<Tab>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingRoles, setPendingRoles] = useState<Record<number, PendingRole>>({})
  const [pendingHireDates, setPendingHireDates] = useState<Record<number, string>>({})
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [decidingId, setDecidingId] = useState<number | null>(null)
  const [resignTarget, setResignTarget] = useState<{ id: number; name: string } | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/admin/users-manage')
      .then((res) => {
        if (!res.ok) throw new Error('목록을 불러오지 못했습니다.')
        return res.json()
      })
      .then(setUsers)
      .catch(() => setLoadError('목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [])

  const pendingCount = users.filter((u) => u.signupStatus === 'PENDING').length
  const visible = tab === 'pending' ? users.filter((u) => u.signupStatus === 'PENDING') : users

  function getPendingRole(id: number): PendingRole {
    return pendingRoles[id] ?? 'FREELANCER'
  }

  async function decide(user: ManagedUser, decision: 'approve' | 'reject') {
    setDecidingId(user.id)
    const role = getPendingRole(user.id)
    const hireDate = pendingHireDates[user.id]
    const body = decision === 'approve' ? { role, hireDate: role === 'FREELANCER' ? hireDate : undefined } : {}
    try {
      const res = await fetch(`/api/admin/users-manage/${user.id}/${decision}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setRowErrors((prev) => ({ ...prev, [user.id]: data?.error ?? '처리에 실패했습니다.' }))
        return
      }
      setRowErrors((prev) => {
        const next = { ...prev }
        delete next[user.id]
        return next
      })
      load()
    } finally {
      setDecidingId(null)
    }
  }

  function renderPendingFields(user: ManagedUser, layout: 'row' | 'stack') {
    const role = getPendingRole(user.id)
    const wrapClass = layout === 'row' ? 'flex items-center gap-2' : 'space-y-1'
    return (
      <div className={wrapClass}>
        <Select
          value={role}
          onValueChange={(value) => setPendingRoles((prev) => ({ ...prev, [user.id]: value as PendingRole }))}
        >
          <SelectTrigger className={layout === 'row' ? 'w-32' : 'w-full'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FREELANCER">프리랜서</SelectItem>
            <SelectItem value="APPROVER">결재담당자</SelectItem>
          </SelectContent>
        </Select>
        {role === 'FREELANCER' && (
          <DatePicker
            value={pendingHireDates[user.id]}
            onChange={(value) => setPendingHireDates((prev) => ({ ...prev, [user.id]: value }))}
            placeholder="입사일 선택"
            className={layout === 'row' ? 'w-40' : 'w-full'}
          />
        )}
      </div>
    )
  }

  function renderActions(user: ManagedUser, layout: 'row' | 'stack') {
    const wrapClass = layout === 'row' ? 'flex items-center justify-end gap-2' : 'flex gap-2'
    const btnClass = layout === 'stack' ? 'flex-1' : undefined
    if (user.signupStatus === 'PENDING') {
      return (
        <div className={wrapClass}>
          <Button className={btnClass} disabled={decidingId === user.id} onClick={() => decide(user, 'approve')}>
            승인
          </Button>
          <Button
            className={btnClass}
            variant="outline"
            disabled={decidingId === user.id}
            onClick={() => decide(user, 'reject')}
          >
            거절
          </Button>
        </div>
      )
    }
    return (
      <div className={wrapClass}>
        <Button className={btnClass} variant="outline" disabled>
          비밀번호 초기화
        </Button>
        <Button
          className={btnClass}
          variant="destructive"
          onClick={() => setResignTarget({ id: user.id, name: user.name })}
        >
          퇴사
        </Button>
      </div>
    )
  }

  return (
    <div className="w-full">
      <PageHeader title="사용자 관리" description="가입 승인, 권한, 퇴사 처리를 한 화면에서 관리합니다." />

      <div className="mb-4 flex items-center gap-2">
        <Button variant={tab === 'all' ? 'default' : 'outline'} onClick={() => setTab('all')}>
          전체 {users.length}
        </Button>
        <Button variant={tab === 'pending' ? 'default' : 'outline'} onClick={() => setTab('pending')}>
          승인대기 {pendingCount}
        </Button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tab === 'pending' ? '승인 대기 중인 사용자가 없습니다.' : '표시할 사용자가 없습니다.'}
        </p>
      ) : (
        <>
          <Table className="hidden lg:table" containerClassName="hidden lg:block">
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>권한</TableHead>
                <TableHead>입사일</TableHead>
                <TableHead>가입일</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    {user.signupStatus === 'PENDING' ? (
                      renderPendingFields(user, 'row')
                    ) : (
                      <Badge variant="outline" className={ROLE_BADGE_CLASS[user.role]}>
                        {ROLE_LABEL[user.role]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.role === 'FREELANCER' ? (user.hireDate ?? '-') : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.createdAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_BADGE_CLASS[user.signupStatus]}>
                      {STATUS_LABEL[user.signupStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {renderActions(user, 'row')}
                    {rowErrors[user.id] && (
                      <p className="mt-1 text-right text-sm text-destructive">{rowErrors[user.id]}</p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {visible.map((user) => (
              <div key={user.id} className="space-y-3 rounded-lg border p-4">
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex items-center justify-between">
                  {user.signupStatus === 'PENDING' ? (
                    renderPendingFields(user, 'stack')
                  ) : (
                    <Badge variant="outline" className={ROLE_BADGE_CLASS[user.role]}>
                      {ROLE_LABEL[user.role]}
                    </Badge>
                  )}
                  <Badge variant="outline" className={STATUS_BADGE_CLASS[user.signupStatus]}>
                    {STATUS_LABEL[user.signupStatus]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  입사일: {user.role === 'FREELANCER' ? (user.hireDate ?? '-') : '-'} · 가입일: {user.createdAt.slice(0, 10)}
                </p>
                {renderActions(user, 'stack')}
                {rowErrors[user.id] && <p className="text-sm text-destructive">{rowErrors[user.id]}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      <ResignDialog
        open={resignTarget !== null}
        onOpenChange={(open) => !open && setResignTarget(null)}
        userId={resignTarget?.id ?? null}
        userName={resignTarget?.name ?? ''}
      />
    </div>
  )
}
```

- [ ] **Step 3: 사이드바 메뉴 갱신**

`components/app-sidebar.tsx` 상단 import에서 `UserCheckIcon`을 제거(더 이상 쓰이지 않음):

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
} from 'lucide-react'
```

`ADMIN_LINKS` 배열을 아래로 교체:

```ts
const ADMIN_LINKS = [
  { href: '/admin/users-manage', label: '사용자 관리', icon: UserCogIcon, roles: ['SUPER_ADMIN'] },
  { href: '/admin/users', label: '프리랜서 정보 관리', icon: UsersIcon, roles: ['SUPER_ADMIN', 'APPROVER'] },
  { href: '/admin/departures', label: '퇴사자 관리', icon: UserMinusIcon, roles: ['SUPER_ADMIN'] },
]
```

- [ ] **Step 4: 타입체크 및 린트**

Run: `npx tsc --noEmit && npx eslint`
Expected: 에러 없음

- [ ] **Step 5: 브라우저로 동작 확인**

Run: `npm run dev`(이미 떠 있다면 재사용)

최고관리자로 로그인해:
- 사이드바에 "사용자 관리"만 보이고 "가입 승인"/"결재담당자 관리"는 더 이상 보이지 않는지
- `/admin/users-manage`에서 전체/승인대기 탭이 정상 동작하는지
- 승인대기 사용자를 프리랜서로 승인(입사일 입력) → 목록에서 사라지고 프리랜서 정보 관리에
  나타나는지
- 승인대기 사용자를 입사일 없이 프리랜서로 승인 시도 → 에러 문구가 표시되는지
- 승인대기 사용자 거절 → 목록에서 사라지는지
- 활성 사용자의 퇴사 버튼 → 기존 퇴사 처리 다이얼로그가 그대로 뜨는지

Task 5에서 기존 화면을 지우기 전까지는 `/admin/signups`, `/admin/approvers`도 함께 남아있으니
비교하며 확인할 수 있다.

- [ ] **Step 6: 커밋**

```bash
git add app/admin/users-manage components/app-sidebar.tsx
git commit -m "feat: 사용자 관리 화면 및 사이드바 메뉴 추가"
```

---

### Task 4: 프리랜서 정보 관리에서 퇴사 액션 제거

**Files:**
- Modify: `app/admin/users/page.tsx`

**Interfaces:**
- Consumes: 없음(기존 컴포넌트 제거만 수행)
- Produces: 없음 — Task 3의 사용자 관리 화면이 퇴사 액션의 유일한 진입점이 된다

- [ ] **Step 1: `ResignDialog` import 제거**

`app/admin/users/page.tsx` 상단에서 아래 줄을 삭제:

```tsx
import { ResignDialog } from '@/components/resign-dialog'
```

- [ ] **Step 2: `resignTarget` 상태 제거**

아래 줄을 삭제:

```tsx
  const [resignTarget, setResignTarget] = useState<{ id: number; name: string } | null>(null)
```

- [ ] **Step 3: 데스크톱 테이블의 퇴사 버튼 제거**

아래 블록을 삭제(만근 예외 버튼 바로 다음):

```tsx
                          {role === 'SUPER_ADMIN' && (
                            <Button
                              variant="destructive"
                              onClick={() => setResignTarget({ id: user.id, name: user.name })}
                            >
                              퇴사
                            </Button>
                          )}
```

- [ ] **Step 4: 모바일 카드의 퇴사 버튼 제거**

아래 블록을 삭제(모바일 레이아웃의 동일한 위치):

```tsx
                    {role === 'SUPER_ADMIN' && (
                      <Button
                        variant="destructive"
                        onClick={() => setResignTarget({ id: user.id, name: user.name })}
                      >
                        퇴사
                      </Button>
                    )}
```

- [ ] **Step 5: `ResignDialog` 렌더 블록 제거**

파일 하단, `<AttendanceExceptionDialog .../>` 바로 위에 있는 아래 블록을 삭제:

```tsx
      <ResignDialog
        open={resignTarget !== null}
        onOpenChange={(open) => !open && setResignTarget(null)}
        userId={resignTarget?.id ?? null}
        userName={resignTarget?.name ?? ''}
      />

```

- [ ] **Step 6: 타입체크 및 린트**

Run: `npx tsc --noEmit && npx eslint`
Expected: 에러 없음(미사용 `role` 변수 경고가 나면 — `role`은 "담당 프리랜서만 보기" 버튼과
기본 결재자 콤보박스 조건에서도 쓰이므로 그대로 유지)

- [ ] **Step 7: 브라우저로 동작 확인**

Run: `npm run dev`(이미 떠 있다면 재사용)

`/admin/users` 접속 시 퇴사 버튼이 더 이상 보이지 않고, 만근 예외/저장 버튼은 정상 동작하는지
확인.

- [ ] **Step 8: 커밋**

```bash
git add app/admin/users/page.tsx
git commit -m "refactor: 프리랜서 정보 관리에서 퇴사 액션 제거(사용자 관리로 이관)"
```

---

### Task 5: 기존 가입 승인 / 결재담당자 관리 화면·API 삭제

**Files:**
- Delete: `app/admin/signups/page.tsx`, `app/admin/signups/layout.tsx`
- Delete: `app/api/admin/signups/route.ts`, `app/api/admin/signups/[id]/route.ts`
- Delete: `app/admin/approvers/page.tsx`, `app/admin/approvers/layout.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 — `app/api/admin/approvers/route.ts`(목록 GET)는 프리랜서 정보 관리가 계속
  쓰므로 **삭제하지 않는다**

- [ ] **Step 1: 가입 승인 화면·API 삭제**

```bash
git rm app/admin/signups/page.tsx app/admin/signups/layout.tsx
git rm app/api/admin/signups/route.ts "app/api/admin/signups/[id]/route.ts"
```

- [ ] **Step 2: 결재담당자 관리 화면 삭제(API는 유지)**

```bash
git rm app/admin/approvers/page.tsx app/admin/approvers/layout.tsx
```

`app/api/admin/approvers/route.ts`는 그대로 둔다 — 삭제하지 않는다.

- [ ] **Step 3: 타입체크 및 린트**

Run: `npx tsc --noEmit && npx eslint`
Expected: 에러 없음(다른 파일에서 삭제된 경로를 참조하는 곳이 없어야 함)

- [ ] **Step 4: 브라우저로 동작 확인**

Run: `npm run dev`(이미 떠 있다면 재사용)

`/admin/signups`, `/admin/approvers`에 직접 접속 시 404가 뜨는지, 프리랜서 정보 관리의 기본
결재자 콤보박스는 여전히 정상 동작하는지(=`/api/admin/approvers` 살아있음) 확인.

- [ ] **Step 5: 커밋**

```bash
git commit -m "chore: 가입 승인/결재담당자 관리 화면 삭제(사용자 관리로 통합)"
```

---

### Task 6: 수동 End-to-End 검증

**Files:** 없음(코드 변경 없음, 검증만 수행)

**Interfaces:** 없음

- [ ] **Step 1: 가입 승인 플로우**

새 계정으로 `/signup`에서 가입 신청 → 최고관리자로 로그인해 `/admin/users-manage`
승인대기 탭에서 확인 → 프리랜서로 승인(입사일 입력) → 목록에서 사라지고 프리랜서 정보 관리에
정상 노출되는지 확인.

- [ ] **Step 2: 거절 플로우**

또 다른 가입 신청 생성 → 사용자 관리에서 거절 → 목록에서 사라지는지, 거절된 이메일로 재가입
시도 시(선택) 어떻게 동작하는지 확인(기존 동작과 동일해야 함 — 이번 작업으로 바뀌지 않음).

- [ ] **Step 3: 결재자 승인 플로우**

가입 신청 하나를 결재담당자로 승인 → 사용자 관리 "전체" 탭에서 배지가 "결재자"로 표시되는지,
프리랜서 정보 관리의 기본 결재자 콤보박스에 새 결재자가 나타나는지 확인.

- [ ] **Step 4: 퇴사 플로우(회귀 확인)**

사용자 관리에서 활성 프리랜서/결재자 각각 퇴사 처리 → 기존과 동일하게 퇴사자 관리 화면으로
이동하고 목록에 나타나는지 확인. 대기 결재 건이 있는 결재자 퇴사 시 위임 모달이 뜨는지도 함께
확인.

- [ ] **Step 5: 권한 확인**

결재자(APPROVER) 계정으로 `/admin/users-manage` 직접 접속 시 접근이 차단되는지 확인.

- [ ] **Step 6: 최종 타입체크 및 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음
