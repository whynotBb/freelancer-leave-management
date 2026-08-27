# 퇴사자 관리 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프리랜서 정보 관리·결재담당자 관리 화면에서 대상자를 "퇴사" 처리하고, 퇴사자 관리
화면에서 복구하거나 정보를 영구 삭제(프리랜서: 완전 삭제 / 결재자: 익명화)할 수 있게 한다.

**Architecture:** `users.signupStatus`에 `'RESIGNED'` 값을 추가해 이 코드베이스가 이미 쓰고
있는 `signupStatus === 'APPROVED'` 필터(목록 조회, 자동 연차 발생 배치, 로그인 게이트)가
퇴사자를 자동으로 제외하게 한다. 정보 삭제는 역할별로 다르게 동작한다 — 프리랜서는 본인
소유 데이터를 전부 cascade 삭제하고, 결재자는 다른 사람의 이력(승인 이력 등)이 그 id를
참조하고 있으므로 행은 남기고 개인정보만 익명화한다.

**Tech Stack:** Next.js (App Router), Drizzle ORM + Postgres, Zod, shadcn/ui(Dialog/Table),
Vitest.

**Spec:** `docs/superpowers/specs/2026-08-27-departed-user-management-design.md`

## Global Constraints

- 변수명/함수명은 영어, 커밋 메시지/주석/문서는 한국어 (`CLAUDE.md`)
- 퇴사 처리 / 복구 / 정보 삭제는 전부 최고관리자(SUPER_ADMIN) 전용 기능이다
- 결재자를 "정보 삭제"할 때는 `users` 행을 삭제하지 않는다 — 이름/이메일/비밀번호만
  스크럽하고, 담당하던 프리랜서의 `defaultApproverId`는 `null`로 바꾼다(스펙 3장)
- 프리랜서를 "정보 삭제"할 때는 본인 소유 데이터(연차 발생/사용/알림/결재자 변경 이력/만근
  예외)를 전부 삭제한 뒤 `users` 행을 삭제한다(스펙 3장)
- 결재자를 퇴사 처리하려는데 대기(PENDING) 상태 휴가 신청이 남아있으면, 위임 없이는 차단하고
  "지금 로그인한 최고관리자에게 위임" 옵션으로만 진행 가능하다(스펙 5.1절)
- 이 저장소는 `app/`·API 라우트에 자동 테스트를 두지 않는 기존 관례를 따른다 — 순수 함수는
  Vitest로, DB/API 계층은 수동(curl) 검증으로 확인한다
- No Placeholders: 실제 동작하는 코드만, TODO/TBD 금지

---

### Task 1: DB 스키마 — `users`에 퇴사 관련 컬럼 추가

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `drizzle/0004_<generated-name>.sql` (drizzle-kit generate로 자동 생성)

**Interfaces:**
- Consumes: 없음
- Produces: `users.resignedAt`(timestamp, nullable), `users.resignReason`(text, nullable) —
  Task 2가 사용한다. `signupStatus`의 유효값에 `'RESIGNED'`가 추가된다(컬럼 타입은 이미
  varchar라 스키마 변경 불필요, 주석만 갱신).

- [ ] **Step 1: 스키마 수정**

`lib/db/schema.ts`의 `users` 테이블 정의를 아래로 교체:

```ts
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('FREELANCER'), // 'SUPER_ADMIN' | 'APPROVER' | 'FREELANCER'
  signupStatus: varchar('signup_status', { length: 20 }).notNull().default('PENDING'), // 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESIGNED'
  hireDate: date('hire_date', { mode: 'string' }),
  defaultApproverId: integer('default_approver_id'),
  resignedAt: timestamp('resigned_at'),
  resignReason: text('resign_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

- [ ] **Step 2: 마이그레이션 생성**

Run: `npx drizzle-kit generate --name departed-user-management`

Expected: `drizzle/0004_departed-user-management.sql` 생성, 다음과 의미가 같은 내용:

```sql
ALTER TABLE "users" ADD COLUMN "resigned_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "resign_reason" text;
```

- [ ] **Step 3: 마이그레이션 적용**

Run: `npx dotenv -e .env.local -- npx drizzle-kit migrate`
Expected: 에러 없이 완료.

```bash
npx dotenv -e .env.local -- node -e "
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING);
sql\`SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name IN ('resigned_at','resign_reason')\`.then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `resigned_at`, `resign_reason` 두 컬럼이 출력됨.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat: users 테이블에 퇴사 관련 컬럼(resigned_at, resign_reason) 추가"
```

---

### Task 2: DB 레이어 — 퇴사 처리

**Files:**
- Create: `lib/db/departures.ts`

**Interfaces:**
- Consumes: `users`/`leaveRequests`(Task 1, `lib/db/schema.ts`), `createNotification`(기존
  `lib/db/notifications.ts`)
- Produces: `resignUser(params: { userId: number; reason: string; delegateTo?: number }):
  Promise<{ ok: true } | { error: 'NOT_FOUND' } | { error: 'PENDING_APPROVALS'; pendingCount:
  number }>` — Task 3의 API 라우트가 호출한다.

- [ ] **Step 1: 퇴사 처리 함수 작성**

`lib/db/departures.ts` 신규 생성:

```ts
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leaveRequests, users } from '@/lib/db/schema'
import { createNotification } from '@/lib/db/notifications'

export async function resignUser(params: {
  userId: number
  reason: string
  delegateTo?: number
}): Promise<
  { ok: true } | { error: 'NOT_FOUND' } | { error: 'PENDING_APPROVALS'; pendingCount: number }
> {
  const [target] = await db.select().from(users).where(eq(users.id, params.userId))
  if (!target) {
    return { error: 'NOT_FOUND' }
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
      await db
        .update(leaveRequests)
        .set({ approverId: params.delegateTo })
        .where(and(eq(leaveRequests.approverId, params.userId), eq(leaveRequests.status, 'PENDING')))

      for (const row of pending) {
        await createNotification({
          recipientId: row.userId,
          type: 'APPROVER_CHANGED',
          refId: row.id,
          message: '담당 결재자의 퇴사 처리로 인해 이 신청의 결재자가 변경되었습니다.',
        })
      }
    }
  }

  await db
    .update(users)
    .set({ signupStatus: 'RESIGNED', resignedAt: new Date(), resignReason: params.reason })
    .where(eq(users.id, params.userId))

  return { ok: true }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/db/departures.ts
git commit -m "feat: 퇴사 처리 DB 레이어 추가 - 결재자 대기 건 위임 포함"
```

---

### Task 3: 퇴사 처리 API 라우트

**Files:**
- Create: `app/api/admin/users/[id]/resign/route.ts`

**Interfaces:**
- Consumes: `resignUser`(Task 2), `requireSuperAdmin`/`toAuthErrorResponse`(기존
  `lib/auth/session.ts`)
- Produces: `POST /api/admin/users/[id]/resign` — body `{ reason: string; delegate?: boolean
  }`. 성공 시 200 `{ ok: true }`, 대상 없음 404, 대기 결재 건이 있고 `delegate`가 없으면 409
  `{ error: string; pendingCount: number }`. Task 5의 다이얼로그가 호출한다.

- [ ] **Step 1: API 라우트 작성**

`app/api/admin/users/[id]/resign/route.ts` 신규 생성:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'
import { resignUser } from '@/lib/db/departures'

const bodySchema = z.object({
  reason: z.string().min(1),
  delegate: z.boolean().optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSuperAdmin()
    const callerId = Number((session.user as { id?: string }).id)
    const { id } = await params

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

    const result = await resignUser({
      userId: Number(id),
      reason: parsed.data.reason,
      delegateTo: parsed.data.delegate ? callerId : undefined,
    })

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') {
        return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
      }
      return NextResponse.json(
        { error: '대기 중인 결재 건이 있습니다.', pendingCount: result.pendingCount },
        { status: 409 }
      )
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

- [ ] **Step 3: 커밋**

```bash
git add app/api/admin/users/[id]/resign/route.ts
git commit -m "feat: 퇴사 처리 API 라우트 추가"
```

---

### Task 4: 기존 로직 통합 — 로그인 게이트 메시지 + 결재자 목록에서 퇴사자 제외

**Files:**
- Modify: `lib/auth/auth-options.ts`
- Modify: `app/api/admin/approvers/route.ts`

**Interfaces:**
- Consumes: 없음(기존 파일 수정)
- Produces: 없음(동작 변경만)

- [ ] **Step 1: 로그인 게이트에 퇴사 상태 분기 추가**

`lib/auth/auth-options.ts`에서 아래 블록을:

```ts
        if (user.signupStatus !== 'APPROVED') {
          throw new Error('가입 승인 대기 중이거나 거절된 계정입니다.')
        }
```

아래로 교체:

```ts
        if (user.signupStatus === 'RESIGNED') {
          throw new Error('퇴사 처리된 계정입니다.')
        }
        if (user.signupStatus !== 'APPROVED') {
          throw new Error('가입 승인 대기 중이거나 거절된 계정입니다.')
        }
```

- [ ] **Step 2: 결재자 목록 API에서 퇴사자 제외**

`app/api/admin/approvers/route.ts`를 아래로 교체(이 엔드포인트는 결재담당자 관리 화면 목록과
기본 결재자 콤보박스가 공유해서 쓰므로, 여기서 한 번만 고치면 둘 다 반영된다):

```ts
import { and, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'

export async function GET() {
  try {
    await requireSuperAdmin()
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

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add lib/auth/auth-options.ts app/api/admin/approvers/route.ts
git commit -m "fix: 로그인 게이트에 퇴사 계정 메시지 분기 추가, 결재자 목록에서 퇴사자 제외"
```

---

### Task 5: 프리랜서 정보 관리 / 결재담당자 관리 화면에 퇴사 액션 추가

**Files:**
- Create: `components/resign-dialog.tsx`
- Modify: `app/admin/users/page.tsx`
- Modify: `app/admin/approvers/page.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/users/[id]/resign`(Task 3)
- Produces: `ResignDialog` 컴포넌트 — Task 8도 재사용하지 않음(퇴사자 관리 화면은 별도
  `ConfirmDialog`를 쓴다, Task 8 참조)

- [ ] **Step 1: 퇴사 확인 다이얼로그 작성**

`components/resign-dialog.tsx` 신규 생성:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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

interface ResignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: number | null
  userName: string
}

export function ResignDialog({ open, onOpenChange, userId, userName }: ResignDialogProps) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setReason('')
      setError(null)
      setPendingCount(null)
    }
    onOpenChange(next)
  }

  async function submit(delegate: boolean) {
    if (!userId) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}/resign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, delegate }),
      })
      if (res.status === 409) {
        const body = await res.json()
        setPendingCount(body.pendingCount ?? 0)
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? '처리에 실패했습니다.')
        return
      }
      handleOpenChange(false)
      router.push('/admin/departures')
    } catch {
      setError('처리에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>퇴사 처리</DialogTitle>
          <DialogDescription>
            {userName}을(를) 퇴사 처리합니다. 처리 즉시 로그인이 차단되며, 퇴사자 관리 화면에서
            복구하거나 정보를 삭제할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="퇴사 사유를 입력하세요"
            rows={3}
          />
          {pendingCount !== null && (
            <p className="text-sm text-destructive">
              대기 중인 결재 건 {pendingCount}건이 있습니다. 먼저 처리하거나, 지금 로그인한
              최고관리자에게 위임하고 퇴사 처리를 진행할 수 있습니다.
            </p>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          {pendingCount !== null ? (
            <Button onClick={() => submit(true)} disabled={submitting || reason.trim().length === 0}>
              {submitting ? '처리 중...' : '나에게 위임하고 퇴사 처리'}
            </Button>
          ) : (
            <Button onClick={() => submit(false)} disabled={submitting || reason.trim().length === 0}>
              {submitting ? '처리 중...' : '퇴사 처리'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: 프리랜서 정보 관리 화면에 연결**

`app/admin/users/page.tsx` 상단 import에 추가:

```ts
import { ResignDialog } from '@/components/resign-dialog'
```

컴포넌트 최상단 상태 선언부(`const [attendanceExceptionError, ...] = useState<string | null>(null)`
다음 줄)에 추가:

```ts
  const [resignTarget, setResignTarget] = useState<{ id: number; name: string } | null>(null)
```

이 화면은 최고관리자와 결재자가 함께 쓰지만, 퇴사 처리는 최고관리자 전용이다(스펙 6장) —
`role === 'SUPER_ADMIN'`일 때만 버튼을 노출한다.

데스크톱 테이블의 액션 셀(`만근 예외` 버튼이 있는 `<TableCell>` 안, 그 버튼 바로 다음)에
버튼 추가:

```tsx
                        {role === 'SUPER_ADMIN' && (
                          <Button
                            variant="outline"
                            onClick={() => setResignTarget({ id: user.id, name: user.name })}
                          >
                            퇴사
                          </Button>
                        )}
```

모바일 카드의 같은 액션 영역(만근 예외 버튼 다음)에도 동일하게 추가:

```tsx
                    {role === 'SUPER_ADMIN' && (
                      <Button
                        variant="outline"
                        onClick={() => setResignTarget({ id: user.id, name: user.name })}
                      >
                        퇴사
                      </Button>
                    )}
```

파일 맨 아래, `<PolicyInfoSheet .../>` 다음에 추가:

```tsx
      <ResignDialog
        open={resignTarget !== null}
        onOpenChange={(open) => !open && setResignTarget(null)}
        userId={resignTarget?.id ?? null}
        userName={resignTarget?.name ?? ''}
      />
```

- [ ] **Step 3: 결재담당자 관리 화면 전면 수정**

`app/admin/approvers/page.tsx`를 아래로 교체(기존엔 행 액션이 전혀 없던 읽기 전용 목록이라,
퇴사 버튼을 넣으면서 파일 전체를 다시 작성한다):

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { ResignDialog } from '@/components/resign-dialog'
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
  const [resignTarget, setResignTarget] = useState<{ id: number; name: string } | null>(null)

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
                <TableHead className="text-right"></TableHead>
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
                  <TableCell className="text-right">
                    {a.role === 'APPROVER' && (
                      <Button variant="outline" onClick={() => setResignTarget({ id: a.id, name: a.name })}>
                        퇴사
                      </Button>
                    )}
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
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{roleLabel(a.role)}</Badge>
                  {a.role === 'APPROVER' && (
                    <Button variant="outline" onClick={() => setResignTarget({ id: a.id, name: a.name })}>
                      퇴사
                    </Button>
                  )}
                </div>
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

최고관리자(`role === 'SUPER_ADMIN'`) 행에는 퇴사 버튼을 노출하지 않는다 — 최고관리자 본인을
퇴사 처리하는 흐름은 스펙 범위 밖이다.

- [ ] **Step 4: 타입체크 및 린트**

Run: `npx tsc --noEmit && npx eslint`
Expected: 에러 없음

- [ ] **Step 5: 브라우저로 동작 확인**

Run: `npm run dev`(이미 떠 있다면 재사용)

`/admin/users`, `/admin/approvers`에서 각각 임의 대상에 "퇴사" 버튼 클릭 → 사유 입력 →
확인 시 `/admin/departures`로 이동하는지(아직 화면이 없어 404가 뜨는 게 정상 — Task 8에서
해결) 확인. 결재자 행에서 대기 결재 건이 있는 대상을 고르면 위임 안내 문구가 뜨는지는
Task 9에서 데이터를 준비해 검증한다.

- [ ] **Step 6: 커밋**

```bash
git add components/resign-dialog.tsx app/admin/users/page.tsx app/admin/approvers/page.tsx
git commit -m "feat: 프리랜서 정보 관리·결재담당자 관리 화면에 퇴사 액션 추가"
```

---

### Task 6: DB 레이어 — 퇴사자 목록 조회 / 복구 / 정보 삭제

**Files:**
- Modify: `lib/db/departures.ts`

**Interfaces:**
- Consumes: `leaveGrants`/`leaveRequests`/`notifications`/`approverChanges`/
  `attendanceExceptions`/`users`(`lib/db/schema.ts`)
- Produces:
  - `listDepartedUsers(): Promise<DepartedUser[]>`
  - `restoreUser(userId: number): Promise<{ ok: true } | { error: string }>`
  - `deleteDepartedUser(userId: number): Promise<{ ok: true } | { error: string }>`
  - Task 7의 API 라우트 3개가 각각 호출한다.

- [ ] **Step 1: import 및 목록 조회 함수 추가**

`lib/db/departures.ts` 상단 import 블록을 아래로 교체:

```ts
import { and, eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db/client'
import {
  approverChanges,
  attendanceExceptions,
  leaveGrants,
  leaveRequests,
  notifications,
  users,
} from '@/lib/db/schema'
import { createNotification } from '@/lib/db/notifications'
```

파일 끝에 아래 코드 추가:

```ts
export interface DepartedUser {
  id: number
  name: string
  email: string
  role: 'FREELANCER' | 'APPROVER'
  resignedAt: string | null
  resignReason: string | null
}

export async function listDepartedUsers(): Promise<DepartedUser[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      resignedAt: users.resignedAt,
      resignReason: users.resignReason,
    })
    .from(users)
    .where(eq(users.signupStatus, 'RESIGNED'))

  return rows.map((r) => ({
    ...r,
    role: r.role as 'FREELANCER' | 'APPROVER',
    resignedAt: r.resignedAt ? r.resignedAt.toISOString() : null,
  }))
}
```

- [ ] **Step 2: 복구 함수 추가**

파일 끝에 추가:

```ts
export async function restoreUser(userId: number): Promise<{ ok: true } | { error: string }> {
  const [target] = await db.select().from(users).where(eq(users.id, userId))
  if (!target || target.signupStatus !== 'RESIGNED') {
    return { error: '퇴사 처리된 사용자가 아닙니다.' }
  }
  await db
    .update(users)
    .set({ signupStatus: 'APPROVED', resignedAt: null, resignReason: null })
    .where(eq(users.id, userId))
  return { ok: true }
}
```

- [ ] **Step 3: 정보 삭제 함수 추가**

파일 끝에 추가:

```ts
export async function deleteDepartedUser(userId: number): Promise<{ ok: true } | { error: string }> {
  const [target] = await db.select().from(users).where(eq(users.id, userId))
  if (!target || target.signupStatus !== 'RESIGNED') {
    return { error: '퇴사 처리된 사용자가 아닙니다.' }
  }

  if (target.role === 'FREELANCER') {
    await db.delete(leaveGrants).where(eq(leaveGrants.userId, userId))
    await db.delete(leaveRequests).where(eq(leaveRequests.userId, userId))
    await db.delete(notifications).where(eq(notifications.recipientId, userId))
    await db.delete(approverChanges).where(eq(approverChanges.userId, userId))
    await db.delete(attendanceExceptions).where(eq(attendanceExceptions.userId, userId))
    await db.delete(users).where(eq(users.id, userId))
    return { ok: true }
  }

  // 결재자는 leave_requests.approver_id 등 다른 사람의 이력에 이 id가 참조되어 있으므로
  // row는 남기고 개인정보만 익명화한다(스펙 3장).
  await db
    .update(users)
    .set({
      name: `사용자#${userId}(퇴사)`,
      email: `deleted-${userId}@deleted.local`,
      passwordHash: await bcrypt.hash(randomUUID(), 10),
    })
    .where(eq(users.id, userId))
  await db.update(users).set({ defaultApproverId: null }).where(eq(users.defaultApproverId, userId))
  return { ok: true }
}
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add lib/db/departures.ts
git commit -m "feat: 퇴사자 목록 조회, 복구, 정보 삭제(익명화 포함) DB 레이어 추가"
```

---

### Task 7: 퇴사자 관리 API 라우트

**Files:**
- Create: `app/api/admin/departures/route.ts`
- Create: `app/api/admin/departures/[id]/restore/route.ts`
- Create: `app/api/admin/departures/[id]/route.ts`

**Interfaces:**
- Consumes: `listDepartedUsers`/`restoreUser`/`deleteDepartedUser`(Task 6)
- Produces:
  - `GET /api/admin/departures` → `DepartedUser[]`
  - `POST /api/admin/departures/[id]/restore` → `{ ok: true }`
  - `DELETE /api/admin/departures/[id]` → `{ ok: true }`
  - Task 8의 화면이 호출한다.

- [ ] **Step 1: 목록 조회 라우트**

`app/api/admin/departures/route.ts` 신규 생성:

```ts
import { NextResponse } from 'next/server'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'
import { listDepartedUsers } from '@/lib/db/departures'

export async function GET() {
  try {
    await requireSuperAdmin()
    const list = await listDepartedUsers()
    return NextResponse.json(list)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

- [ ] **Step 2: 복구 라우트**

`app/api/admin/departures/[id]/restore/route.ts` 신규 생성:

```ts
import { NextResponse } from 'next/server'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'
import { restoreUser } from '@/lib/db/departures'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin()
    const { id } = await params
    const result = await restoreUser(Number(id))
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

- [ ] **Step 3: 삭제 라우트**

`app/api/admin/departures/[id]/route.ts` 신규 생성:

```ts
import { NextResponse } from 'next/server'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'
import { deleteDepartedUser } from '@/lib/db/departures'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin()
    const { id } = await params
    const result = await deleteDepartedUser(Number(id))
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
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

- [ ] **Step 5: 커밋**

```bash
git add app/api/admin/departures
git commit -m "feat: 퇴사자 관리 목록/복구/삭제 API 라우트 추가"
```

---

### Task 8: 퇴사자 관리 화면 + 사이드바 메뉴

**Files:**
- Create: `components/confirm-dialog.tsx`
- Create: `app/admin/departures/page.tsx`
- Create: `app/admin/departures/layout.tsx`
- Modify: `components/app-sidebar.tsx`

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/admin/departures*`(Task 7)
- Produces: `ConfirmDialog` 컴포넌트(범용 확인 다이얼로그, 이후 다른 기능도 재사용 가능)

- [ ] **Step 1: 범용 확인 다이얼로그 작성**

`components/confirm-dialog.tsx` 신규 생성:

```tsx
'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  submitting?: boolean
  error?: string | null
  destructive?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  submitting = false,
  error = null,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={submitting}>
            {submitting ? '처리 중...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: 퇴사자 관리 페이지 작성**

`app/admin/departures/page.tsx` 신규 생성:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface DepartedUser {
  id: number
  name: string
  email: string
  role: 'FREELANCER' | 'APPROVER'
  resignedAt: string | null
  resignReason: string | null
}

function roleLabel(role: DepartedUser['role']) {
  return role === 'FREELANCER' ? '프리랜서' : '결재자'
}

export default function AdminDeparturesPage() {
  const [users, setUsers] = useState<DepartedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<DepartedUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DepartedUser | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/admin/departures')
      .then((res) => {
        if (!res.ok) throw new Error('목록을 불러오지 못했습니다.')
        return res.json()
      })
      .then(setUsers)
      .catch(() => setLoadError('목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function confirmRestore() {
    if (!restoreTarget) return
    setSubmitting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/departures/${restoreTarget.id}/restore`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setActionError(body?.error ?? '복구에 실패했습니다.')
        return
      }
      setRestoreTarget(null)
      load()
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setSubmitting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/departures/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setActionError(body?.error ?? '삭제에 실패했습니다.')
        return
      }
      setDeleteTarget(null)
      load()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="퇴사자 관리"
        description="퇴사 처리된 프리랜서·결재자를 복구하거나 정보를 삭제합니다."
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          불러오는 중...
        </div>
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground">퇴사 처리된 사용자가 없습니다.</p>
      ) : (
        <>
          <Table className="hidden lg:table" containerClassName="hidden lg:block">
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>퇴사일</TableHead>
                <TableHead>퇴사 사유</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{roleLabel(u.role)}</Badge>
                  </TableCell>
                  <TableCell>{u.resignedAt ? u.resignedAt.slice(0, 10) : '-'}</TableCell>
                  <TableCell className="max-w-64 truncate" title={u.resignReason ?? ''}>
                    {u.resignReason ?? '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setRestoreTarget(u)}>
                        복구
                      </Button>
                      <Button variant="destructive" onClick={() => setDeleteTarget(u)}>
                        정보 삭제
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {users.map((u) => (
              <div key={u.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{u.name}</p>
                  <Badge variant="outline">{roleLabel(u.role)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{u.email}</p>
                <p className="text-sm text-muted-foreground">
                  퇴사일: {u.resignedAt ? u.resignedAt.slice(0, 10) : '-'}
                </p>
                <p className="text-sm text-muted-foreground">사유: {u.resignReason ?? '-'}</p>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setRestoreTarget(u)}>
                    복구
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={() => setDeleteTarget(u)}>
                    정보 삭제
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title="퇴사자 복구"
        description={`${restoreTarget?.name ?? ''}을(를) 다시 활성 계정으로 되돌립니다. 즉시 로그인이 가능해집니다.`}
        confirmLabel="복구"
        onConfirm={confirmRestore}
        submitting={submitting}
        error={actionError}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="정보 삭제"
        description={
          deleteTarget?.role === 'FREELANCER'
            ? `${deleteTarget?.name ?? ''}의 계정과 연차 발생/사용 이력이 모두 삭제됩니다. 되돌릴 수 없습니다.`
            : `${deleteTarget?.name ?? ''}의 이름·이메일 등 개인정보가 삭제되고, 담당하던 프리랜서의 기본 결재자는 공란으로 바뀝니다. 되돌릴 수 없습니다.`
        }
        confirmLabel="영구 삭제"
        onConfirm={confirmDelete}
        submitting={submitting}
        error={actionError}
        destructive
      />
    </div>
  )
}
```

- [ ] **Step 3: 페이지 타이틀 레이아웃 추가**

`app/admin/departures/layout.tsx` 신규 생성(기존 관리자 페이지들과 동일한 패턴 —
`app/admin/users/layout.tsx` 참고):

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '퇴사자 관리',
}

export default function Layout({ children }: LayoutProps<'/admin/departures'>) {
  return children
}
```

- [ ] **Step 4: 사이드바 메뉴 추가**

`components/app-sidebar.tsx`의 lucide-react import 줄을:

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

아래로 교체(`UserMinusIcon` 추가):

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
  UserMinusIcon,
} from 'lucide-react'
```

`ADMIN_LINKS` 배열을 아래로 교체:

```ts
const ADMIN_LINKS = [
  { href: '/admin/signups', label: '가입 승인', icon: UserCheckIcon, roles: ['SUPER_ADMIN'] },
  { href: '/admin/users', label: '프리랜서 정보 관리', icon: UsersIcon, roles: ['SUPER_ADMIN', 'APPROVER'] },
  { href: '/admin/approvers', label: '결재담당자 관리', icon: UserCogIcon, roles: ['SUPER_ADMIN'] },
  { href: '/admin/departures', label: '퇴사자 관리', icon: UserMinusIcon, roles: ['SUPER_ADMIN'] },
]
```

- [ ] **Step 5: 타입체크 및 린트**

Run: `npx tsc --noEmit && npx eslint`
Expected: 에러 없음

- [ ] **Step 6: 브라우저로 동작 확인**

Run: `npm run dev`(이미 떠 있다면 재사용)

최고관리자로 로그인해 사이드바에 "퇴사자 관리" 메뉴가 보이는지, `/admin/departures` 접속 시
목록/타이틀이 정상 렌더링되는지 확인. 실제 퇴사 데이터가 없으므로 빈 상태 메시지가 보이는 게
정상 — Task 9에서 실데이터로 검증한다.

- [ ] **Step 7: 커밋**

```bash
git add components/confirm-dialog.tsx app/admin/departures components/app-sidebar.tsx
git commit -m "feat: 퇴사자 관리 화면 및 사이드바 메뉴 추가"
```

---

### Task 9: 수동 End-to-End 검증

개발 서버(`npm run dev`)가 실행 중이어야 하고, `admin@example.com` 계정으로 로그인해
관리자 화면에서 조작한다(이 저장소 관례상 API 라우트는 자동 테스트 없이 수동 검증한다).

**Files:** 없음(코드 변경 없음, 기존 기능의 실제 동작 확인)

- [ ] **Step 1: 프리랜서 퇴사 → 복구 → 완전 삭제 확인**

`/signup`에서 임의 이메일(예: `departure-test-freelancer@example.com`)로 회원가입 →
`/admin/signups`에서 프리랜서로 승인(입사일 아무 날짜) → `/admin/users`에서 해당 행 "퇴사"
클릭, 사유 입력 후 확인.

Expected: `/admin/departures`로 이동, 방금 처리한 프리랜서가 목록에 보임. `/admin/users`
목록에는 더 이상 보이지 않음.

로그인 시도(로그아웃 후 방금 만든 계정으로 로그인):
Expected: "퇴사 처리된 계정입니다" 에러로 로그인 거부.

`/admin/departures`에서 해당 행 "복구" 클릭:
Expected: 목록에서 사라짐. `/admin/users`에 다시 나타남. 방금 만든 계정으로 재로그인 성공.

다시 "퇴사" 처리한 뒤 `/admin/departures`에서 "정보 삭제" 클릭:
Expected: 목록에서 사라짐. 아래 쿼리로 실제 DB에서 삭제됐는지 확인:

```bash
npx dotenv -e .env.local -- node -e "
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING);
sql\`SELECT id FROM users WHERE email = 'departure-test-freelancer@example.com'\`.then(r => { console.log('rows:', r.length); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `rows: 0`

- [ ] **Step 2: 결재자 퇴사 — 대기 결재 건 위임 경로 확인**

테스트 결재자 회원가입 + 승인(`/admin/signups`에서 역할을 결재자로 승인 — 결재자는 입사일
불필요). 테스트 프리랜서 하나 더 만들어 기본 결재자를 방금 만든 테스트 결재자로 지정.

아래 스크립트로 그 프리랜서의 대기(PENDING) 휴가 신청을 하나 직접 삽입한다(이 저장소에는
아직 휴가 신청 제출 화면/API가 없어 수동 삽입으로 대체):

```bash
npx dotenv -e .env.local -- node -e "
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING);
(async () => {
  const [freelancer] = await sql\`SELECT id, default_approver_id FROM users WHERE role = 'FREELANCER' AND default_approver_id IS NOT NULL ORDER BY id DESC LIMIT 1\`;
  await sql\`INSERT INTO leave_requests (user_id, approver_id, title, start_date, end_date, type, requested_days, reason, status, submitted_at) VALUES (\${freelancer.id}, \${freelancer.default_approver_id}, '테스트 연차', '2026-09-01', '2026-09-01', 'FULL', 1, '테스트', 'PENDING', now())\`;
  console.log('inserted for approver', freelancer.default_approver_id);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
"
```

`/admin/approvers`에서 그 결재자 행 "퇴사" 클릭, 사유 입력 후 "퇴사 처리" 클릭:
Expected: "대기 중인 결재 건 1건이 있습니다" 안내와 함께 버튼이 "나에게 위임하고 퇴사 처리"로
바뀜.

그 버튼 클릭:
Expected: `/admin/departures`로 이동. 방금 삽입한 `leave_requests.approver_id`가 최고관리자
id로 바뀌었는지 확인:

```bash
npx dotenv -e .env.local -- node -e "
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING);
sql\`SELECT approver_id FROM leave_requests WHERE reason = '테스트' ORDER BY id DESC LIMIT 1\`.then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `approver_id`가 admin@example.com의 id(보통 1)와 같음.

- [ ] **Step 3: 결재자 정보 삭제 — 익명화 확인**

Step 2에서 퇴사 처리한 결재자를 `/admin/departures`에서 "정보 삭제" 클릭.

Expected: 목록에서 사라짐. `/admin/users`에서 그 결재자가 기본 결재자였던 프리랜서 행을 열어
"기본 결재자"가 공란(결재자 선택)으로 바뀌었는지 확인. DB에서 익명화됐는지 확인:

```bash
npx dotenv -e .env.local -- node -e "
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING);
sql\`SELECT id, name, email FROM users WHERE name LIKE '사용자#%(퇴사)' ORDER BY id DESC LIMIT 1\`.then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: 방금 삭제한 결재자의 id로 된 행이 하나 나오고, `name`이 `사용자#{id}(퇴사)`,
`email`이 `deleted-{id}@deleted.local` 형태.

- [ ] **Step 4: 자동 연차 발생 배치가 퇴사자를 건너뛰는지 확인**

퇴사 처리(복구하지 않은) 상태의 프리랜서 하나를 남겨두고(Step 1에서 완전 삭제했다면 새로
하나 만들어 퇴사 처리):

```bash
SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)
curl -s -H "Authorization: Bearer $SECRET" http://localhost:3000/api/cron/attendance-grant
```

Expected: 응답에 에러 없음. 해당 퇴사자의 `/admin/departures` 상 표시가 그대로이고(발생 연차
항목이 이 화면엔 없지만), 배치 실행 전후로 `leave_grants`에 새 행이 생기지 않았는지 확인:

```bash
npx dotenv -e .env.local -- node -e "
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING);
sql\`SELECT lg.id FROM leave_grants lg JOIN users u ON u.id = lg.user_id WHERE u.signup_status = 'RESIGNED'\`.then(r => { console.log('rows:', r.length); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `rows: 0` (배치 실행 시점 이후 생성된 행이 없어야 함 — 배치 자체가 RESIGNED를
후보에서 제외하므로 애초에 생기지 않는다)

- [ ] **Step 5: 테스트 데이터 정리 여부 확인**

이번 단계에서 만든 테스트 계정/휴가 신청을 실제 운영 DB에 남겨둘지 삭제할지 사용자에게
확인한다.

- [ ] **Step 6: 전체 테스트 스위트 + 타입체크 + 린트 최종 확인**

Run: `npx vitest run && npx tsc --noEmit && npx eslint`
Expected: 전부 에러 없음.
