# "대시보드" 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 모든 사용자가 `/dashboard`에서 자신의 역할(`SUPER_ADMIN`/`APPROVER`/
`FREELANCER`)에 맞는 현황 요약을 한눈에 보고, 관련 화면으로 바로 이동할 수 있게 한다.

**Architecture:** `/dashboard` 단일 라우트가 세션의 role을 보고 세 하위 컴포넌트
(`FreelancerDashboard`/`ApproverDashboard`/`AdminDashboard`) 중 하나를 렌더링한다. 서버는
`GET /api/dashboard` 하나만 두고 호출자의 role에 맞는 요약 데이터를 계산해 반환한다. 데이터
계층은 전부 신규 파일 `lib/db/dashboard.ts`의 경량 COUNT류 함수(비즈니스 로직 없음, 기존
`getMyDocumentSummary`만 재사용)로 구성한다.

**Tech Stack:** Next.js 16(App Router), NextAuth v5(JWT 세션), Drizzle ORM + postgres,
Tailwind CSS + shadcn/ui(Button), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-dashboard-design.md` (+ 원 설계 문서
`docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md` 8·9장)

## Global Constraints

- 커밋 메시지·코드 주석은 한국어, 변수명·함수명은 영어로 작성한다 (전역 CLAUDE.md).
- 이 저장소는 `app/`·API 라우트·`lib/db/*`에 자동화 테스트를 두지 않는다 — 순수 함수
  (`lib/domain/*`)만 Vitest 대상이고, 나머지는 "구현 → 수동 검증 → 커밋" 순서를 따른다. 이번
  작업은 새 순수 함수를 추가하지 않는다(전부 단순 COUNT 조회, 기존 `getMyDocumentSummary` 재사용).
- 인증 게이트는 `requireApprovedUser()`(기존, `lib/auth/session.ts`) — 전 역할 통과. 이 화면은
  `/documents`·`/approvals`와 달리 리다이렉트 없이 모든 역할이 접근한다.
- 차트/그래프를 쓰지 않는다. 기존 화면(`/documents`)과 동일한 테두리 박스 컨벤션
  (`rounded-lg border p-4` + `grid` + `text-xs text-muted-foreground` 라벨/값)만 사용한다.
- 처리완료(processedCount)는 `APPROVED`+`REJECTED`만 集계하고 `CANCELED`(신청인이 직접 취소)는
  제외한다 — 결재자가 처리한 게 아니므로.
- `leaveRequests.type === 'ADJUSTMENT'`인 행은 실제 신청 문서가 아니므로 모든 카운트에서
  제외한다.
- 새 UI는 기존 컴포넌트(`Button`, `PageHeader`, `LoadingSpinner`)를 그대로 재사용한다. 새 npm
  패키지를 추가하지 않는다.

---

### Task 1: 데이터 계층 — 대시보드 카운트 함수

**배경**: 세 역할이 필요로 하는 숫자를 각각 계산하는 경량 함수들. 이 파일의 함수들은 오직
대시보드 API에서만 쓰이므로 신규 파일 하나(`lib/db/dashboard.ts`)에 모아둔다(기존
`lib/db/leave-requests.ts`/`lib/db/freelancers.ts`에 흩어 넣지 않음 — 이 기능 전용 파일로
응집도를 유지). 이 저장소의 기존 DB 함수들(`getApprovedFreelancers` 등)과 동일하게, 별도
`COUNT(*)` SQL 대신 필요한 최소 컬럼만 골라 조회한 뒤 `.length`로 개수를 센다.

**Files:**
- Create: `lib/db/dashboard.ts`

**Interfaces:**
- Consumes: `db`(기존, `lib/db/client`), `leaveRequests`/`users`(기존, `lib/db/schema`),
  `and`/`eq`/`ne`/`inArray`(drizzle-orm).
- Produces:
  - `getPendingRequestCountForRequester(userId: number): Promise<number>`
  - `getApprovalCounts(approverId: number): Promise<{ pending: number; processed: number }>`
  - `getAssignedFreelancerCount(approverId: number): Promise<number>`
  - `getActiveFreelancerCount(): Promise<number>`
  - `getApproverCount(): Promise<number>`
  - `getPendingSignupCount(): Promise<number>`
  - Task 2(API 라우트)가 이 여섯 함수를 그대로 소비한다.

- [ ] **Step 1: 파일 작성**

```ts
// lib/db/dashboard.ts
import { and, eq, inArray, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leaveRequests, users } from '@/lib/db/schema'

// 본인이 신청한 문서 중 결재 대기(PENDING) 건수. type='ADJUSTMENT'(관리자 수동 조정 기록)는
// 실제 신청 문서가 아니므로 제외한다.
export async function getPendingRequestCountForRequester(userId: number): Promise<number> {
  const rows = await db
    .select({ id: leaveRequests.id })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.userId, userId),
        eq(leaveRequests.status, 'PENDING'),
        ne(leaveRequests.type, 'ADJUSTMENT')
      )
    )
  return rows.length
}

// 본인이 결재자로 지정된 문서 중 대기/처리완료 건수. 처리완료는 본인이 직접 승인·반려한
// 것만 집계한다 — 신청인이 스스로 취소(CANCELED)한 문서는 본인이 처리한 게 아니므로 제외한다.
export async function getApprovalCounts(approverId: number): Promise<{ pending: number; processed: number }> {
  const rows = await db
    .select({ status: leaveRequests.status })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.approverId, approverId), ne(leaveRequests.type, 'ADJUSTMENT')))
  let pending = 0
  let processed = 0
  for (const row of rows) {
    if (row.status === 'PENDING') pending += 1
    else if (row.status === 'APPROVED' || row.status === 'REJECTED') processed += 1
  }
  return { pending, processed }
}

// 본인이 기본 결재자로 지정된 재직(APPROVED) 프리랜서 수.
export async function getAssignedFreelancerCount(approverId: number): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.role, 'FREELANCER'),
        eq(users.signupStatus, 'APPROVED'),
        eq(users.defaultApproverId, approverId)
      )
    )
  return rows.length
}

// 재직 중인 프리랜서 전체 수(SUPER_ADMIN "전체 현황"용).
export async function getActiveFreelancerCount(): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'FREELANCER'), eq(users.signupStatus, 'APPROVED')))
  return rows.length
}

// 결재자(APPROVER+SUPER_ADMIN) 전체 수(재직 상태만).
export async function getApproverCount(): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ['APPROVER', 'SUPER_ADMIN']), eq(users.signupStatus, 'APPROVED')))
  return rows.length
}

// 가입 승인 대기(PENDING) 계정 수.
export async function getPendingSignupCount(): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.signupStatus, 'PENDING'))
  return rows.length
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add lib/db/dashboard.ts
git commit -m "feat: 대시보드 카운트 데이터 계층 추가"
```

---

### Task 2: API 라우트 — `GET /api/dashboard`

**배경**: Task 1의 함수들을 role별로 조합해 하나의 엔드포인트로 노출한다.
`requireApprovedUser()`는 전 역할을 통과시키므로, 라우트 내부에서 role을 보고 분기한다.
SUPER_ADMIN은 본인이 결재자로 지정된 프리랜서가 1명 이상일 때만 `approver` 필드를 채우고,
없으면 `null`을 반환한다.

**Files:**
- Create: `app/api/dashboard/route.ts`

**Interfaces:**
- Consumes: `getPendingRequestCountForRequester`, `getApprovalCounts`,
  `getAssignedFreelancerCount`, `getActiveFreelancerCount`, `getApproverCount`,
  `getPendingSignupCount`(Task 1), `getMyDocumentSummary`(기존, `lib/db/leave-requests.ts`),
  `requireApprovedUser`/`toAuthErrorResponse`(기존, `lib/auth/session.ts`).
- Produces: `GET /api/dashboard` → 아래 세 형태 중 하나(JSON):
  - `{ role: 'FREELANCER', freelancer: { granted: number, used: number, remaining: number, pendingCount: number } }`
  - `{ role: 'APPROVER', approver: { pendingCount: number, processedCount: number, assignedFreelancerCount: number } }`
  - `{ role: 'SUPER_ADMIN', admin: { activeFreelancerCount: number, approverCount: number, pendingSignupCount: number }, approver: { pendingCount: number, processedCount: number, assignedFreelancerCount: number } | null }`

  Task 3(UI 컴포넌트)와 Task 4(페이지)가 이 응답 형태를 그대로 소비한다.

- [ ] **Step 1: 라우트 작성**

```ts
// app/api/dashboard/route.ts
import { NextResponse } from 'next/server'
import { requireApprovedUser, toAuthErrorResponse } from '@/lib/auth/session'
import { getMyDocumentSummary } from '@/lib/db/leave-requests'
import {
  getActiveFreelancerCount,
  getApprovalCounts,
  getApproverCount,
  getAssignedFreelancerCount,
  getPendingRequestCountForRequester,
  getPendingSignupCount,
} from '@/lib/db/dashboard'

export async function GET() {
  try {
    const session = await requireApprovedUser()
    const userId = Number((session.user as { id?: string }).id)
    const role = (session.user as { role?: string }).role

    if (role === 'FREELANCER') {
      const [summary, pendingCount] = await Promise.all([
        getMyDocumentSummary(userId),
        getPendingRequestCountForRequester(userId),
      ])
      return NextResponse.json({
        role: 'FREELANCER',
        freelancer: {
          granted: summary.granted,
          used: summary.used,
          remaining: summary.remaining,
          pendingCount,
        },
      })
    }

    if (role === 'APPROVER') {
      const [counts, assignedFreelancerCount] = await Promise.all([
        getApprovalCounts(userId),
        getAssignedFreelancerCount(userId),
      ])
      return NextResponse.json({
        role: 'APPROVER',
        approver: {
          pendingCount: counts.pending,
          processedCount: counts.processed,
          assignedFreelancerCount,
        },
      })
    }

    // SUPER_ADMIN
    const [activeFreelancerCount, approverCount, pendingSignupCount, assignedFreelancerCount] = await Promise.all([
      getActiveFreelancerCount(),
      getApproverCount(),
      getPendingSignupCount(),
      getAssignedFreelancerCount(userId),
    ])
    let approver: { pendingCount: number; processedCount: number; assignedFreelancerCount: number } | null = null
    if (assignedFreelancerCount > 0) {
      const counts = await getApprovalCounts(userId)
      approver = { pendingCount: counts.pending, processedCount: counts.processed, assignedFreelancerCount }
    }
    return NextResponse.json({
      role: 'SUPER_ADMIN',
      admin: { activeFreelancerCount, approverCount, pendingSignupCount },
      approver,
    })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

- [ ] **Step 2: 수동 검증**

`npm run dev` 실행 후, 세 역할 계정으로 각각 로그인해 `GET /api/dashboard`를 호출(브라우저
개발자 도구 Network 탭 또는 `curl`)해 role에 맞는 형태로 응답이 오는지 확인한다. 세션 쿠키
없이 호출하면 401인지도 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add app/api/dashboard
git commit -m "feat: 대시보드 요약 API 추가"
```

---

### Task 3: 대시보드 UI 컴포넌트

**배경**: 역할별 화면을 독립된 파일로 나눈다. "내 결재 정보" 박스는 결재자와 최고관리자(결재자로
지정된 경우) 양쪽에서 동일하게 쓰이므로 별도 컴포넌트로 뽑아 재사용한다.

**Files:**
- Create: `components/dashboard/approver-summary-box.tsx`
- Create: `components/dashboard/freelancer-dashboard.tsx`
- Create: `components/dashboard/approver-dashboard.tsx`
- Create: `components/dashboard/admin-dashboard.tsx`

**Interfaces:**
- Consumes: `Button`(기존, `components/ui/button`), Next.js `Link`.
- Produces:
  - `ApproverSummaryBox({ pendingCount, processedCount, assignedFreelancerCount }: { pendingCount: number; processedCount: number; assignedFreelancerCount: number })`
  - `FreelancerDashboard({ granted, used, remaining, pendingCount }: { granted: number; used: number; remaining: number; pendingCount: number })`
  - `ApproverDashboard({ pendingCount, processedCount, assignedFreelancerCount }: { pendingCount: number; processedCount: number; assignedFreelancerCount: number })`
  - `AdminDashboard({ activeFreelancerCount, approverCount, pendingSignupCount, approver }: { activeFreelancerCount: number; approverCount: number; pendingSignupCount: number; approver: { pendingCount: number; processedCount: number; assignedFreelancerCount: number } | null })`
  - Task 4(페이지)가 이 네 컴포넌트를 그대로 사용한다.

- [ ] **Step 1: 공용 결재 정보 박스**

```tsx
// components/dashboard/approver-summary-box.tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface ApproverSummaryBoxProps {
  pendingCount: number
  processedCount: number
  assignedFreelancerCount: number
}

export function ApproverSummaryBox({ pendingCount, processedCount, assignedFreelancerCount }: ApproverSummaryBoxProps) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">내 결재 정보</h2>
        <Button asChild variant="outline" size="sm">
          <Link href="/approvals">결재함으로</Link>
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">결재대기</p>
          <p>{pendingCount}건</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">처리완료</p>
          <p>{processedCount}건</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">담당 프리랜서</p>
          <p>{assignedFreelancerCount}명</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 프리랜서 대시보드**

```tsx
// components/dashboard/freelancer-dashboard.tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface FreelancerDashboardProps {
  granted: number
  used: number
  remaining: number
  pendingCount: number
}

export function FreelancerDashboard({ granted, used, remaining, pendingCount }: FreelancerDashboardProps) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">내 휴가 정보</h2>
        <Button asChild variant="outline" size="sm">
          <Link href="/documents">내 문서로</Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">발생</p>
          <p>{granted}일</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">사용</p>
          <p>{used}일</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">잔여</p>
          <p className={remaining < 0 ? 'text-destructive' : undefined}>{remaining}일</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">결재대기</p>
          <p>{pendingCount}건</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 결재자 대시보드**

```tsx
// components/dashboard/approver-dashboard.tsx
import { ApproverSummaryBox } from '@/components/dashboard/approver-summary-box'

interface ApproverDashboardProps {
  pendingCount: number
  processedCount: number
  assignedFreelancerCount: number
}

export function ApproverDashboard(props: ApproverDashboardProps) {
  return <ApproverSummaryBox {...props} />
}
```

- [ ] **Step 4: 최고관리자 대시보드**

```tsx
// components/dashboard/admin-dashboard.tsx
import Link from 'next/link'
import { ApproverSummaryBox } from '@/components/dashboard/approver-summary-box'

interface AdminDashboardProps {
  activeFreelancerCount: number
  approverCount: number
  pendingSignupCount: number
  approver: { pendingCount: number; processedCount: number; assignedFreelancerCount: number } | null
}

export function AdminDashboard({
  activeFreelancerCount,
  approverCount,
  pendingSignupCount,
  approver,
}: AdminDashboardProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-medium">전체 현황</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">재직 프리랜서</p>
            <p>{activeFreelancerCount}명</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">결재자</p>
            <p>{approverCount}명</p>
          </div>
        </div>
      </div>
      {pendingSignupCount > 0 && (
        <Link
          href="/admin/users-manage"
          className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:hover:bg-amber-900"
        >
          <span>가입 승인 대기 {pendingSignupCount}건</span>
          <span>→</span>
        </Link>
      )}
      {approver && <ApproverSummaryBox {...approver} />}
    </div>
  )
}
```

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add components/dashboard
git commit -m "feat: 역할별 대시보드 UI 컴포넌트 추가"
```

---

### Task 4: 페이지 — `/dashboard`

**배경**: Task 2의 API와 Task 3의 컴포넌트를 하나의 화면으로 묶는 마지막 태스크. 이 화면은
`/documents`·`/approvals`와 달리 역할 리다이렉트가 없다 — 모든 역할의 공통 홈이다.

**Files:**
- Create: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `GET /api/dashboard`(Task 2), `FreelancerDashboard`/`ApproverDashboard`/
  `AdminDashboard`(Task 3), `PageHeader`/`LoadingSpinner`(기존).
- Produces: 없음(최종 화면).

- [ ] **Step 1: 페이지 작성**

```tsx
// app/dashboard/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { LoadingSpinner } from '@/components/loading-spinner'
import { PageHeader } from '@/components/page-header'
import { FreelancerDashboard } from '@/components/dashboard/freelancer-dashboard'
import { ApproverDashboard } from '@/components/dashboard/approver-dashboard'
import { AdminDashboard } from '@/components/dashboard/admin-dashboard'

type DashboardData =
  | { role: 'FREELANCER'; freelancer: { granted: number; used: number; remaining: number; pendingCount: number } }
  | { role: 'APPROVER'; approver: { pendingCount: number; processedCount: number; assignedFreelancerCount: number } }
  | {
      role: 'SUPER_ADMIN'
      admin: { activeFreelancerCount: number; approverCount: number; pendingSignupCount: number }
      approver: { pendingCount: number; processedCount: number; assignedFreelancerCount: number } | null
    }

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  function loadDashboard() {
    setLoading(true)
    setLoadError(null)
    fetch('/api/dashboard')
      .then((res) => {
        if (!res.ok) throw new Error('대시보드를 불러오지 못했습니다.')
        return res.json()
      })
      .then((json: DashboardData) => setData(json))
      .catch(() => setLoadError('대시보드를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboard()
  }, [])

  return (
    <div className="w-full">
      <PageHeader title="대시보드" description="내 현황을 한눈에 확인합니다." />
      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : data?.role === 'FREELANCER' ? (
        <FreelancerDashboard {...data.freelancer} />
      ) : data?.role === 'APPROVER' ? (
        <ApproverDashboard {...data.approver} />
      ) : data?.role === 'SUPER_ADMIN' ? (
        <AdminDashboard {...data.admin} approver={data.approver} />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: 타입 체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 없음(이 저장소에 이미 존재하는 `app/documents/page.tsx`,
`components/leave-request-sheet.tsx`의 무관한 기존 lint 오류 2건은 그대로 남아있어도 정상 —
이번 변경과 무관).

- [ ] **Step 3: 수동 검증**

`npm run dev` 실행 후:
1. FREELANCER 계정으로 `/dashboard` 진입 → "내 휴가 정보" 박스의 발생/사용/잔여/결재대기
   숫자가 `/documents` 화면과 일치하는지, "내 문서로" 버튼이 `/documents`로 이동하는지.
2. APPROVER 계정으로 진입 → 결재대기/처리완료/담당 프리랜서 숫자가 `/approvals`,
   `/admin/users`(담당 프리랜서만 보기)와 일치하는지, "결재함으로" 버튼이 `/approvals`로
   이동하는지.
3. SUPER_ADMIN 계정으로 진입 → 재직 프리랜서 수/결재자 수가 실제 목록과 일치하는지.
4. 가입 승인 대기가 0건인 SUPER_ADMIN 계정에서는 "가입 승인 대기" 카드가 안 보이고, 대기
   신청을 하나 만들면 카드가 나타나며 클릭 시 `/admin/users-manage`로 이동하는지.
5. 아무에게도 기본 결재자로 지정되지 않은 SUPER_ADMIN 계정에서는 "내 결재 정보" 박스가 안
   보이고, 프리랜서 정보 관리 화면에서 본인을 누군가의 기본 결재자로 지정하면 나타나는지.
6. 세 역할 모두 `/dashboard` 직접 접근 시 리다이렉트 없이 정상 진입하는지, 사이드바 "대시보드"
   메뉴 클릭도 정상 동작하는지.

- [ ] **Step 4: 커밋**

```bash
git add app/dashboard
git commit -m "feat: 대시보드 화면 추가"
```

---

## 최종 self-review 체크리스트 (실행자 참고용)

- 스펙 커버리지: `2026-09-04-dashboard-design.md` 2~7장(화면 범위/구성/API/데이터 계층/컴포넌트
  구조/테스트) 전부 Task 1~4로 매핑됨. 8장(범위 제외: 실시간 알림 UI, 차트, 전체 메뉴 바로가기
  나열)은 이번 계획에 포함하지 않음 — 의도된 제외.
- 플레이스홀더 없음, 모든 코드 블록은 실제 동작하는 내용.
- 타입 일관성: Task 1의 반환 타입(`{ pending, processed }` 등) → Task 2 API 응답 필드명
  (`pendingCount`/`processedCount`/`assignedFreelancerCount`) → Task 3 컴포넌트 props →
  Task 4 페이지의 `DashboardData` 유니언 타입까지 필드명이 서로 맞물림.
