# "결재함" 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `APPROVER`/`SUPER_ADMIN`이 본인이 결재자로 지정된 휴가계 목록을 확인하고, 개별 문서를
승인 또는 반려(사유 필수) 처리할 수 있는 `/approvals` 화면을 만든다.

**Architecture:** 상태 전이는 기존 `lib/domain/leave-workflow.ts`의 `applyTransition`을 그대로
재사용한다(새 비즈니스 로직 없음). 데이터 계층은 "내 문서" 기능과 같은 파일
(`lib/db/leave-requests.ts`)에 결재자 관점의 조회/전이 함수 3개를 추가한다. API는 `내 문서`
API(`app/api/documents/`)와 동일하게 `action` 필드 기반 스타일을 따르는 `app/api/approvals/`
아래 REST 라우트 2개(GET/PATCH)로 구성한다. UI는 `app/documents/page.tsx`와 동일한
"목록 + Dialog 상세" 패턴으로 `app/approvals/page.tsx` + 신규 컴포넌트
`components/approval-request-sheet.tsx` 하나로 구성한다.

**Tech Stack:** Next.js 16(App Router), NextAuth v5(JWT 세션), Drizzle ORM + postgres,
Tailwind CSS + shadcn/ui(Dialog, Badge, Textarea, Select, Table 등), zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-approvals-design.md` (+ 원 설계 문서
`docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md` 7·9장)

## Global Constraints

- 커밋 메시지·코드 주석은 한국어, 변수명·함수명은 영어로 작성한다 (전역 CLAUDE.md).
- 이 저장소는 `app/`·API 라우트·`lib/db/*`에 자동화 테스트를 두지 않는다 — 순수 함수
  (`lib/domain/*`)만 Vitest 대상이고, 나머지는 "구현 → 수동 검증 → 커밋" 순서를 따른다(원 설계
  문서 12장, 선행 계획 문서들과 동일한 컨벤션). 이번 작업은 새 순수 함수를 추가하지 않는다
  (`applyTransition`을 그대로 재사용).
- Next.js 16 동적 라우트의 `params`는 `Promise<{...}>`다 — `await params`로 꺼낸다(기존
  `app/api/documents/[id]/route.ts` 패턴).
- 새 UI는 기존 컴포넌트(`Dialog`, `Table`, `Select`, `Input`, `Textarea`, `Button`, `Badge`,
  `StatusBadge`, `ConfirmDialog`, `LoadingSpinner`, `PageHeader`)를 그대로 재사용한다. 새 npm
  패키지를 추가하지 않는다.
- `leaveRequests.type === 'ADJUSTMENT'`인 행은 실제 신청 문서가 아니라 관리자의 수동 조정
  기록이다 — 결재함 목록/처리 대상에서 반드시 제외한다.
- 인증 게이트는 `requireApproverOrAbove()`(기존, `lib/auth/session.ts`)를 사용한다.
  `requireApprovedUser()`(범위가 더 넓음)를 쓰지 않는다.
- 승인/반려 처리 후 신청인에게 `createNotification()`(기존, `lib/db/notifications.ts`)으로
  `LEAVE_APPROVED`/`LEAVE_REJECTED` 알림 레코드를 남긴다(화면 표시 UI는 이번 범위 아님).

---

### Task 1: 사이드바 "결재함" 메뉴를 APPROVER/SUPER_ADMIN 전용으로 제한

**배경**: `components/app-sidebar.tsx`의 `COMMON_LINKS`는 "내 문서" 항목에만 `roles` 필드가
있고(이미 FREELANCER 전용으로 제한됨), "결재함" 항목에는 `roles`가 없어 전체 역할에 노출된다.
`FREELANCER`는 결재자로 지정될 수 없으므로(3-역할 체계 설계) 이 메뉴가 보이면 안 된다. 필터링
로직(`COMMON_LINKS.filter(...)`)은 이미 `roles` 필드 유무를 확인하도록 구현돼 있어 데이터만
추가하면 된다. 또한 "결재함" 페이지가 아직 없던 시절에 붙은 안내 주석도 이번에 실제 페이지가
생기므로 함께 정리한다.

**Files:**
- Modify: `components/app-sidebar.tsx`

**Interfaces:** 없음(다른 파일이 `COMMON_LINKS`를 참조하지 않음).

- [ ] **Step 1: "결재함" 항목에 `roles` 추가, 안내 주석 제거**

```tsx
// components/app-sidebar.tsx — 기존 주석+COMMON_LINKS 선언 교체
const COMMON_LINKS = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboardIcon },
  { href: '/documents', label: '내 문서', icon: FileTextIcon, roles: ['FREELANCER'] },
  { href: '/approvals', label: '결재함', icon: InboxIcon, roles: ['SUPER_ADMIN', 'APPROVER'] },
]
```

(바로 위에 있던 `// 공통 메뉴: 아직 Task 18~22가 구현되지 않아...` 주석 줄은 삭제한다 — 이제
사실이 아니다.)

- [ ] **Step 2: 수동 검증**

`npm run dev`로 실행 후, `FREELANCER` 계정으로 로그인하면 사이드바에서 "결재함"이 사라지고,
`APPROVER` 또는 `SUPER_ADMIN` 계정으로 로그인하면 계속 보이는지 확인한다(클릭하면 아직
404 — Task 5까지 정상).

- [ ] **Step 3: 커밋**

```bash
git add components/app-sidebar.tsx
git commit -m "fix: 결재함 메뉴를 결재자/최고관리자 전용으로 제한"
```

---

### Task 2: 데이터 계층 — 결재 대기열 조회 및 상태 전이

**배경**: 결재자 관점에서 "내가 결재자로 지정된 문서" 목록을 조회하고, 단건 소유권을 확인한 뒤
승인/반려로 전이시키는 함수가 필요하다. 상태 전이 검증 자체는 기존 `applyTransition`(actor
`'APPROVER'`)을 그대로 쓰고, 이 계층은 DB 조회/갱신만 담당한다. "내 문서" 기능의
`getOwnLeaveRequestById`/`transitionOwnLeaveRequest`와 동일한 구조를 결재자 관점으로 미러링한다.

**Files:**
- Modify: `lib/db/leave-requests.ts`

**Interfaces:**
- Consumes: `applyTransition`, `type LeaveRequestStatus`(기존 import, `lib/domain/leave-workflow.ts`),
  `alias`(기존 import, `drizzle-orm/pg-core`), `leaveRequests`/`users`(기존 import,
  `lib/db/schema.ts`).
- Produces:
  - `interface ApprovalQueueRow { id: number; title: string; startDate: string; endDate: string; type: 'FULL' | 'AM_HALF' | 'PM_HALF'; requestedDays: number; status: LeaveRequestStatus; reason: string; rejectReason: string | null; submittedAt: string | null; requesterName: string }`
  - `getApprovalQueue(approverId: number): Promise<ApprovalQueueRow[]>`
  - `getLeaveRequestForApprover(id: number, approverId: number)` — 원시 `leaveRequests` 행 또는 `null`
  - `transitionLeaveRequestAsApprover(id: number, approverId: number, action: 'APPROVE' | 'REJECT', rejectReason?: string): Promise<{ status: LeaveRequestStatus; userId: number; title: string } | null>`
  - 위 세 함수를 Task 3(API 라우트)이 그대로 소비한다.

- [ ] **Step 1: 결재 대기열 조회 함수**

```ts
// lib/db/leave-requests.ts — 파일 맨 아래에 추가
export interface ApprovalQueueRow {
  id: number
  title: string
  startDate: string
  endDate: string
  type: 'FULL' | 'AM_HALF' | 'PM_HALF'
  requestedDays: number
  status: LeaveRequestStatus
  reason: string
  rejectReason: string | null
  submittedAt: string | null
  requesterName: string
}

// 본인이 결재자로 지정된 문서 전체를 반환한다. type='ADJUSTMENT'(관리자 수동 조정 기록)는
// 실제 결재 대상이 아니므로 제외한다. 대기 상태를 항상 먼저 보여주고 그다음 제출일 역순으로
// 정렬해, 처리해야 할 문서를 목록 상단에서 놓치지 않도록 한다.
export async function getApprovalQueue(approverId: number): Promise<ApprovalQueueRow[]> {
  const requester = alias(users, 'requester')
  const rows = await db
    .select({
      id: leaveRequests.id,
      title: leaveRequests.title,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      type: leaveRequests.type,
      requestedDays: leaveRequests.requestedDays,
      status: leaveRequests.status,
      reason: leaveRequests.reason,
      rejectReason: leaveRequests.rejectReason,
      submittedAt: leaveRequests.submittedAt,
      requesterName: requester.name,
    })
    .from(leaveRequests)
    .innerJoin(requester, eq(leaveRequests.userId, requester.id))
    .where(and(eq(leaveRequests.approverId, approverId), ne(leaveRequests.type, 'ADJUSTMENT')))

  return rows
    .map(
      (r): ApprovalQueueRow => ({
        ...r,
        type: r.type as ApprovalQueueRow['type'],
        status: r.status as LeaveRequestStatus,
        submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
      })
    )
    .sort((a, b) => {
      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1
      if (a.status !== 'PENDING' && b.status === 'PENDING') return 1
      return (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '')
    })
}
```

- [ ] **Step 2: 단건 소유권 확인 + 상태 전이 함수**

```ts
// lib/db/leave-requests.ts — Step 1 아래에 이어서 추가
export async function getLeaveRequestForApprover(id: number, approverId: number) {
  const [row] = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.approverId, approverId)))
  return row ?? null
}

// applyTransition(기존 순수 함수)이 상태 전이 자체의 유효성(PENDING→APPROVED/REJECTED만 허용)을
// 검증하고, 잘못된 전이면 Error를 던진다 — 호출부(API 라우트)가 그 Error를 잡아 400으로
// 응답한다. 반환값의 userId/title은 승인/반려 알림 생성 시 재조회 없이 바로 쓰기 위함이다.
export async function transitionLeaveRequestAsApprover(
  id: number,
  approverId: number,
  action: 'APPROVE' | 'REJECT',
  rejectReason?: string
): Promise<{ status: LeaveRequestStatus; userId: number; title: string } | null> {
  const row = await getLeaveRequestForApprover(id, approverId)
  if (!row) return null
  const nextStatus = applyTransition(row.status as LeaveRequestStatus, action, 'APPROVER')
  await db
    .update(leaveRequests)
    .set({
      status: nextStatus,
      processedAt: new Date(),
      rejectReason: action === 'REJECT' ? (rejectReason ?? null) : row.rejectReason,
    })
    .where(eq(leaveRequests.id, id))
  return { status: nextStatus, userId: row.userId, title: row.title }
}
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음(특히 `ApprovalQueueRow`의 `type`/`status` 캐스팅, `import { ne }` 등 기존
import 목록에 이미 있는지 확인 — `ne`는 파일 상단에 이미 import돼 있다).

- [ ] **Step 4: 커밋**

```bash
git add lib/db/leave-requests.ts
git commit -m "feat: 결재함 데이터 계층(대기열 조회, 승인/반려 전이) 추가"
```

---

### Task 3: API 라우트 — 결재 목록/승인/반려

**배경**: Task 2에서 만든 데이터 계층을 노출하는 REST 엔드포인트 2개를 만든다. "내 문서" API
(`app/api/documents/`)와 동일하게 `requireApproverOrAbove()`로 게이트하고, PATCH는 `action`
필드로 승인/반려를 구분한다. 반려는 사유가 필수다.

**Files:**
- Create: `app/api/approvals/route.ts`
- Create: `app/api/approvals/[id]/route.ts`

**Interfaces:**
- Consumes: `getApprovalQueue`, `transitionLeaveRequestAsApprover`(Task 2),
  `requireApproverOrAbove`/`toAuthErrorResponse`(기존, `lib/auth/session.ts`),
  `createNotification`(기존, `lib/db/notifications.ts`).
- Produces: `GET /api/approvals` → `ApprovalQueueRow[]`, `PATCH /api/approvals/[id]` body
  `{ action: 'approve' } | { action: 'reject', rejectReason: string }` → `{ ok: true, status }`.
  Task 4/5(UI)가 이 두 엔드포인트를 그대로 호출한다.

- [ ] **Step 1: 목록 API**

```ts
// app/api/approvals/route.ts
import { NextResponse } from 'next/server'
import { requireApproverOrAbove, toAuthErrorResponse } from '@/lib/auth/session'
import { getApprovalQueue } from '@/lib/db/leave-requests'

export async function GET() {
  try {
    const session = await requireApproverOrAbove()
    const approverId = Number((session.user as { id?: string }).id)
    const queue = await getApprovalQueue(approverId)
    return NextResponse.json(queue)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

- [ ] **Step 2: 승인/반려 API**

```ts
// app/api/approvals/[id]/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApproverOrAbove, toAuthErrorResponse } from '@/lib/auth/session'
import { transitionLeaveRequestAsApprover } from '@/lib/db/leave-requests'
import { createNotification } from '@/lib/db/notifications'

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), rejectReason: z.string().min(1) }),
])

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApproverOrAbove()
    const approverId = Number((session.user as { id?: string }).id)
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
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const body = parsed.data

    try {
      const result = await transitionLeaveRequestAsApprover(
        requestId,
        approverId,
        body.action === 'approve' ? 'APPROVE' : 'REJECT',
        body.action === 'reject' ? body.rejectReason : undefined
      )
      if (!result) {
        return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
      }
      await createNotification({
        recipientId: result.userId,
        type: body.action === 'approve' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
        refId: requestId,
        message:
          body.action === 'approve'
            ? `"${result.title}" 신청이 승인되었습니다.`
            : `"${result.title}" 신청이 반려되었습니다: ${body.rejectReason}`,
      })
      return NextResponse.json({ ok: true, status: result.status })
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

- [ ] **Step 3: 수동 검증**

`npm run dev` 실행 후, 결재자 계정으로 로그인해 브라우저 개발자 도구 또는 `curl`로 확인:
1. `GET /api/approvals` — 세션 쿠키 없이 호출하면 401.
2. 결재자 세션으로 호출하면 본인 담당 문서 배열(대기 우선 정렬) 반환.
3. 타인 담당 문서 id로 `PATCH /api/approvals/[id]` 호출 시 404.
4. `{ action: 'reject' }`(사유 누락)로 호출 시 400.

(아직 실제 대기 문서가 없다면 "내 문서" 화면에서 프리랜서 계정으로 하나 제출해 둔다.)

- [ ] **Step 4: 커밋**

```bash
git add app/api/approvals
git commit -m "feat: 결재함 목록/승인/반려 API 추가"
```

---

### Task 4: 상세 Dialog 컴포넌트 — `ApprovalRequestSheet`

**배경**: 결재자가 문서 상세를 확인하고 승인/반려를 처리하는 UI. `components/leave-request-sheet.tsx`는
신청인 전용 편집 로직(임시저장/제출/취소)과 강하게 결합돼 있어 확장하지 않고, 읽기 전용
필드 + 승인/반려 액션만 있는 새 컴포넌트를 만든다. 승인은 되돌릴 수 없는 처리이므로 기존
`ConfirmDialog`로 한 번 확인시키고, 반려는 사유 입력이 필수이므로 이 파일 안에 작은 Dialog를
하나 더 둔다(재사용 대상이 아니므로 별도 컴포넌트로 분리하지 않는다).

**Files:**
- Create: `components/approval-request-sheet.tsx`

**Interfaces:**
- Consumes: `PATCH /api/approvals/[id]`(Task 3), `StatusBadge`(기존,
  `components/status-badge.tsx`), `ConfirmDialog`(기존, `components/confirm-dialog.tsx`),
  `Dialog`/`Button`/`Input`/`Label`/`Textarea`(기존 shadcn 컴포넌트).
- Produces:
  - `interface ApprovalDocument { id: number; title: string; requesterName: string; startDate: string; endDate: string; type: 'FULL' | 'AM_HALF' | 'PM_HALF'; requestedDays: number; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED'; reason: string; rejectReason: string | null }`
  - `ApprovalRequestSheet({ open, onOpenChange, document, onProcessed }: { open: boolean; onOpenChange: (open: boolean) => void; document: ApprovalDocument | null; onProcessed: () => void })`
  - Task 5(목록 페이지)가 이 컴포넌트를 그대로 사용한다.

- [ ] **Step 1: 컴포넌트 전체 작성**

```tsx
// components/approval-request-sheet.tsx
'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { StatusBadge } from '@/components/status-badge'

const TYPE_LABEL: Record<'FULL' | 'AM_HALF' | 'PM_HALF', string> = {
  FULL: '연차',
  AM_HALF: '오전 반차',
  PM_HALF: '오후 반차',
}

export interface ApprovalDocument {
  id: number
  title: string
  requesterName: string
  startDate: string
  endDate: string
  type: 'FULL' | 'AM_HALF' | 'PM_HALF'
  requestedDays: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED'
  reason: string
  rejectReason: string | null
}

interface ApprovalRequestSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: ApprovalDocument | null
  onProcessed: () => void
}

export function ApprovalRequestSheet({ open, onOpenChange, document, onProcessed }: ApprovalRequestSheetProps) {
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!document) return null

  async function process(action: 'approve' | 'reject') {
    setError(null)
    setSubmitting(true)
    try {
      const body = action === 'approve' ? { action } : { action, rejectReason }
      const res = await fetch(`/api/approvals/${document!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? '처리에 실패했습니다.')
        return
      }
      setApproveConfirmOpen(false)
      setRejectDialogOpen(false)
      setRejectReason('')
      onProcessed()
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[600px]">
          <DialogHeader className="shrink-0 border-b border-border pb-4">
            <DialogTitle className="flex items-start gap-2 border-b-0 pb-0 leading-snug">
              <StatusBadge status={document.status} className="mt-0.5 shrink-0" />
              <span>{document.title}</span>
            </DialogTitle>
            <DialogDescription>결재 대상 휴가계 상세입니다.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1">
            <div className="space-y-1.5">
              <Label>신청인</Label>
              <Input value={document.requesterName} disabled readOnly />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">유형</p>
                <p>{TYPE_LABEL[document.type]}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">신청일수</p>
                <p>{document.requestedDays}일</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>기간</Label>
              <Input
                value={
                  document.startDate === document.endDate
                    ? document.startDate
                    : `${document.startDate} ~ ${document.endDate}`
                }
                disabled
                readOnly
              />
            </div>
            <div className="space-y-1.5">
              <Label>사유</Label>
              <Textarea value={document.reason} disabled readOnly />
            </div>
            {document.status === 'REJECTED' && document.rejectReason && (
              <p className="text-sm text-destructive">반려 사유: {document.rejectReason}</p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="shrink-0">
            {document.status === 'PENDING' && (
              <>
                <Button variant="outline" onClick={() => setRejectDialogOpen(true)} disabled={submitting}>
                  반려
                </Button>
                <Button onClick={() => setApproveConfirmOpen(true)} disabled={submitting}>
                  승인
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={approveConfirmOpen}
        onOpenChange={setApproveConfirmOpen}
        title="휴가 신청 승인"
        description={`"${document.title}" 신청을 승인하시겠습니까? 승인 후에는 되돌릴 수 없습니다.`}
        confirmLabel="승인"
        onConfirm={() => process('approve')}
        submitting={submitting}
        error={error}
      />
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>휴가 신청 반려</DialogTitle>
            <DialogDescription className="py-2">반려 사유를 입력해 주세요.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="반려 사유 (필수)"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)} disabled={submitting}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => process('reject')}
              disabled={submitting || rejectReason.trim().length === 0}
            >
              반려
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음(특히 `document!.id`의 non-null 단언이 `if (!document) return null` 가드
이후라 안전한지 확인).

- [ ] **Step 3: 커밋**

```bash
git add components/approval-request-sheet.tsx
git commit -m "feat: 결재 상세/승인/반려 Dialog 컴포넌트 추가"
```

---

### Task 5: 목록 페이지 — `/approvals`

**배경**: Task 2~4에서 만든 API/컴포넌트를 하나의 화면으로 묶는다. `app/documents/page.tsx`와
동일한 구조(역할 가드 → 데이터 로드 → 필터/검색 → 반응형 테이블/카드 → Dialog 연결)를 따른다.

**Files:**
- Create: `app/approvals/page.tsx`

**Interfaces:**
- Consumes: `GET /api/approvals`(Task 3), `ApprovalRequestSheet`/`ApprovalDocument`(Task 4),
  `StatusBadge`(기존), `PageHeader`/`LoadingSpinner`(기존).
- Produces: 없음(최종 화면).

- [ ] **Step 1: 페이지 전체 작성**

```tsx
// app/approvals/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { SearchIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingSpinner } from '@/components/loading-spinner'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { ApprovalRequestSheet, type ApprovalDocument } from '@/components/approval-request-sheet'

interface ApprovalRow {
  id: number
  title: string
  startDate: string
  endDate: string
  type: 'FULL' | 'AM_HALF' | 'PM_HALF'
  requestedDays: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED'
  reason: string
  rejectReason: string | null
  submittedAt: string | null
  requesterName: string
}

const TYPE_LABEL: Record<'FULL' | 'AM_HALF' | 'PM_HALF', string> = {
  FULL: '연차',
  AM_HALF: '오전 반차',
  PM_HALF: '오후 반차',
}

type StatusFilter = 'PENDING' | 'DONE' | 'ALL'
const DONE_STATUSES = new Set(['APPROVED', 'REJECTED', 'CANCELED'])

export default function ApprovalsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const role = (session?.user as { role?: string } | undefined)?.role

  const [rows, setRows] = useState<ApprovalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING')
  const [nameSearch, setNameSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selected, setSelected] = useState<ApprovalDocument | null>(null)

  useEffect(() => {
    if (session && role && role !== 'SUPER_ADMIN' && role !== 'APPROVER') {
      router.replace('/dashboard')
    }
  }, [session, role, router])

  function loadQueue() {
    setLoading(true)
    setLoadError(null)
    fetch('/api/approvals')
      .then((res) => {
        if (!res.ok) throw new Error('목록을 불러오지 못했습니다.')
        return res.json()
      })
      .then((data: ApprovalRow[]) => setRows(data))
      .catch(() => setLoadError('목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadQueue()
  }, [])

  const filteredRows = useMemo(() => {
    const query = nameSearch.toLowerCase()
    return rows.filter((row) => {
      if (statusFilter === 'PENDING' && row.status !== 'PENDING') return false
      if (statusFilter === 'DONE' && !DONE_STATUSES.has(row.status)) return false
      if (!query) return true
      return row.requesterName.toLowerCase().includes(query)
    })
  }, [rows, statusFilter, nameSearch])

  if (role && role !== 'SUPER_ADMIN' && role !== 'APPROVER') return null

  function openDetail(row: ApprovalRow) {
    setSelected({
      id: row.id,
      title: row.title,
      requesterName: row.requesterName,
      startDate: row.startDate,
      endDate: row.endDate,
      type: row.type,
      requestedDays: row.requestedDays,
      status: row.status,
      reason: row.reason,
      rejectReason: row.rejectReason,
    })
    setSheetOpen(true)
  }

  return (
    <div className="w-full">
      <PageHeader title="결재함" description="내가 결재자로 지정된 휴가계를 확인하고 승인/반려 처리합니다." />

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-end gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">대기</SelectItem>
                <SelectItem value="DONE">처리완료</SelectItem>
                <SelectItem value="ALL">전체</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="신청인 검색"
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                className="w-56 pl-8"
              />
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">내역이 없습니다.</p>
          ) : (
            <>
              <div className="hidden xl:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>제출일</TableHead>
                      <TableHead>신청인</TableHead>
                      <TableHead>제목</TableHead>
                      <TableHead>기간·유형</TableHead>
                      <TableHead className="w-20">일수</TableHead>
                      <TableHead className="w-24">상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => (
                      <TableRow key={row.id} className="cursor-pointer" onClick={() => openDetail(row)}>
                        <TableCell className="text-muted-foreground">
                          {row.submittedAt ? row.submittedAt.slice(0, 10) : '-'}
                        </TableCell>
                        <TableCell>{row.requesterName}</TableCell>
                        <TableCell className="font-medium">{row.title}</TableCell>
                        <TableCell>
                          {TYPE_LABEL[row.type]} · {row.startDate}
                          {row.startDate !== row.endDate ? ` ~ ${row.endDate}` : ''}
                        </TableCell>
                        <TableCell>{row.requestedDays}일</TableCell>
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 xl:hidden">
                {filteredRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => openDetail(row)}
                    className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left text-sm hover:bg-accent"
                  >
                    <div>
                      <p className="font-medium">{row.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.requesterName} · {TYPE_LABEL[row.type]} · {row.startDate}
                        {row.startDate !== row.endDate ? ` ~ ${row.endDate}` : ''} · {row.requestedDays}일
                      </p>
                    </div>
                    <StatusBadge status={row.status} />
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <ApprovalRequestSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        document={selected}
        onProcessed={loadQueue}
      />
    </div>
  )
}
```

- [ ] **Step 2: 타입 체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 없음.

- [ ] **Step 3: 수동 검증**

`npm run dev` 실행 후:
1. `FREELANCER` 계정으로 `/approvals` 직접 접근 시 `/dashboard`로 리다이렉트.
2. 결재자 계정으로 접근 시 기본 필터("대기")로 본인 담당 대기 문서만 보이는지.
3. 상태 필터를 "처리완료"/"전체"로 바꿔 결과가 바뀌는지, 신청인 이름 검색이 동작하는지.
4. 대기 문서 행 클릭 → 상세 Dialog에서 "승인" → 확인 다이얼로그 → 승인 후 목록에서 상태가
   "승인완료"로 바뀌고 다이얼로그가 닫히는지. 프리랜서 계정의 `/documents`에서도 잔여연차가
   차감되고 상태가 반영되는지.
5. 다른 대기 문서에서 "반려" → 사유 미입력 시 버튼 비활성 확인 → 사유 입력 후 반려 → 프리랜서
   화면에 반려 사유가 노출되는지.
6. 이미 처리된(승인/반려/취소) 문서를 열면 승인/반려 버튼이 보이지 않는지.
7. 목록에 `type='ADJUSTMENT'` 행(관리자 연차 조정 기록)이 노출되지 않는지(프리랜서 정보
   관리 화면에서 연차 조정을 한 번 실행해 두고 확인).
8. `SUPER_ADMIN` 계정도 본인이 기본 결재자로 지정된 문서에 대해 동일하게 처리 가능한지.

- [ ] **Step 4: 커밋**

```bash
git add app/approvals
git commit -m "feat: 결재함 목록 화면 추가"
```

---

## 최종 self-review 체크리스트 (실행자 참고용)

- 스펙 커버리지: `2026-09-04-approvals-design.md` 2~7장(화면 범위/목록/상세/API/데이터
  계층/알림/사이드바) 전부 Task 1~5로 매핑됨. 8장(테스트 방향)은 각 Task의 수동 검증 단계로
  흡수됨. 9장(범위 제외: 대시보드, 알림 UI)은 이번 계획에 포함하지 않음 — 의도된 제외.
- 플레이스홀더 없음, 모든 코드 블록은 실제 동작하는 내용.
- 타입 일관성: `ApprovalQueueRow`(Task 2) → API 응답(Task 3) → `ApprovalRow`(Task 5, 페이지
  내부 표시용) → `ApprovalDocument`(Task 4, Dialog 상세용)로 이어지는 필드명이 서로 맞물림
  (`requesterName`, `rejectReason`, `submittedAt` 등).
