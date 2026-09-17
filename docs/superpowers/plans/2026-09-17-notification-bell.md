# NotificationBell 구현 플랜

> **에이전트 작업자에게:** 이 플랜은 `executing-plans` 스킬로 태스크 단위로 실행한다.
> 각 태스크는 독립적으로 테스트 가능하며, 완료 후 즉시 커밋한다.
> 커밋 메시지는 한국어, 변수명·함수명은 영어로 작성한다.

## 관련 스펙

- `docs/superpowers/specs/2026-09-17-notification-bell-design.md`

## 전제 조건

- [x] `notifications` 테이블 존재 (`lib/db/schema.ts`)
- [x] `createNotification()` 함수 존재 (`lib/db/notifications.ts`)
- [x] `requireApprovedUser()` 인증 헬퍼 사용 가능 (`lib/auth/session.ts`)
- [x] shadcn/ui Popover, Button, Badge 컴포넌트 사용 가능
- [x] lucide-react 아이콘 라이브러리 설치됨

## 파일 구조

| 파일 | 동작 | 책임 |
|------|------|------|
| `lib/db/notifications.ts` | **수정** | DB 쿼리 함수 4개 추가 |
| `app/api/notifications/stream/route.ts` | **생성** | SSE 엔드포인트 |
| `app/api/notifications/[id]/read/route.ts` | **생성** | 단건 읽음 처리 API |
| `app/api/notifications/read-all/route.ts` | **생성** | 전체 읽음 처리 API |
| `hooks/use-notifications.ts` | **생성** | SSE 연결·상태·액션 커스텀 훅 |
| `components/notification-item.tsx` | **생성** | 알림 한 건 렌더링 |
| `components/notification-bell.tsx` | **생성** | 벨 버튼 + Popover 전체 |
| `components/app-sidebar.tsx` | **수정** | 헤더에 `<NotificationBell />` 삽입 |

---

## 태스크 목록

### 태스크 1: DB 쿼리 함수 추가

**목표:** `lib/db/notifications.ts`에 조회·읽음 처리 함수 4개를 추가한다.
이 태스크 완료 후 알림 목록 조회와 읽음 처리 DB 작업이 가능해진다.

**스텝:**

1. `lib/db/notifications.ts` 파일 열기
2. 기존 `createNotification` 아래에 다음 함수 추가:

```ts
// notifications 테이블 타입 추출
export type Notification = typeof notifications.$inferSelect

// 최신 20건 조회 (읽음 여부 무관, 최신순)
export async function getNotifications(userId: number): Promise<Notification[]> {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(20)
}

// 미읽음 수
export async function getUnreadCount(userId: number): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(notifications)
    .where(and(eq(notifications.recipientId, userId), eq(notifications.read, false)))
  return result[0]?.count ?? 0
}

// 단건 읽음 처리 (본인 소유 검증)
export async function markAsRead(id: number, userId: number): Promise<boolean> {
  const result = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, id), eq(notifications.recipientId, userId)))
    .returning({ id: notifications.id })
  return result.length > 0
}

// 전체 읽음 처리 — 업데이트된 행 수 반환
export async function markAllAsRead(userId: number): Promise<number> {
  const result = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.recipientId, userId), eq(notifications.read, false)))
    .returning({ id: notifications.id })
  return result.length
}
```

3. 필요한 drizzle 임포트 추가: `eq`, `and`, `desc`, `count`
4. 파일 저장 후 TypeScript 컴파일 에러 없는지 확인:
   ```powershell
   npx tsc --noEmit
   ```
5. 커밋:
   ```
   feat: 알림 조회·읽음 처리 DB 쿼리 함수 추가
   ```

**완료 기준:**
- [ ] `getNotifications`, `getUnreadCount`, `markAsRead`, `markAllAsRead` 함수 존재
- [ ] TypeScript 컴파일 에러 없음
- [ ] `Notification` 타입이 export됨

---

### 태스크 2: SSE 엔드포인트 구현

**목표:** `GET /api/notifications/stream` — 3초마다 알림 데이터를 클라이언트에 push하는
SSE 스트림을 구현한다.

**스텝:**

1. `app/api/notifications/stream/` 디렉토리 생성
2. `app/api/notifications/stream/route.ts` 파일 생성:

```ts
import { NextRequest } from 'next/server'
import { requireApprovedUser } from '@/lib/auth/session'
import { getNotifications, getUnreadCount } from '@/lib/db/notifications'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  let session: Awaited<ReturnType<typeof requireApprovedUser>>
  try {
    session = await requireApprovedUser()
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }

  const userId = (session.user as { id?: number }).id
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(
          encoder.encode(`event: notifications\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }
      const keepalive = () => {
        controller.enqueue(encoder.encode(': keepalive\n\n'))
      }

      // 연결 즉시 1회 전송
      const [items, unreadCount] = await Promise.all([
        getNotifications(userId),
        getUnreadCount(userId),
      ])
      send({ unreadCount, items })

      // 3초 폴링 루프
      const pollInterval = setInterval(async () => {
        if (req.signal.aborted) {
          clearInterval(pollInterval)
          clearInterval(keepaliveInterval)
          controller.close()
          return
        }
        try {
          const [items, unreadCount] = await Promise.all([
            getNotifications(userId),
            getUnreadCount(userId),
          ])
          send({ unreadCount, items })
        } catch {
          // DB 오류는 무시하고 다음 폴링에서 재시도
        }
      }, 3000)

      // Vercel 25초 타임아웃 대응: 20초마다 keepalive 코멘트
      const keepaliveInterval = setInterval(keepalive, 20000)

      req.signal.addEventListener('abort', () => {
        clearInterval(pollInterval)
        clearInterval(keepaliveInterval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
```

3. TypeScript 컴파일 에러 확인:
   ```powershell
   npx tsc --noEmit
   ```
4. 개발 서버 실행 후 직접 엔드포인트 테스트:
   ```powershell
   npm run dev
   # 별도 터미널:
   # curl -N -H "Cookie: <세션 쿠키>" http://localhost:3000/api/notifications/stream
   # event: notifications 이벤트가 3초마다 출력되는지 확인
   ```
5. 커밋:
   ```
   feat: SSE 알림 스트림 엔드포인트 구현 (3초 폴링)
   ```

**완료 기준:**
- [ ] `GET /api/notifications/stream` 응답 헤더에 `Content-Type: text/event-stream` 포함
- [ ] 미인증 요청 시 401 반환
- [ ] 3초마다 `event: notifications` 이벤트 전송
- [ ] `runtime = 'nodejs'` 선언 존재

---

### 태스크 3: 읽음 처리 API 구현

**목표:** 단건 읽음(`PATCH /api/notifications/[id]/read`)과
전체 읽음(`PATCH /api/notifications/read-all`) API를 구현한다.

**스텝:**

1. `app/api/notifications/[id]/read/route.ts` 생성:

```ts
import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireApprovedUser } from '@/lib/auth/session'
import { markAsRead } from '@/lib/db/notifications'
import { toAuthErrorResponse } from '@/lib/auth/session'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApprovedUser()
    const userId = (session.user as { id?: number }).id
    if (!userId) return NextResponse.json({ error: '인증 오류' }, { status: 401 })

    const { id } = await params
    const notificationId = Number(id)
    if (isNaN(notificationId)) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })

    const updated = await markAsRead(notificationId, userId)
    if (!updated) return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

2. `app/api/notifications/read-all/route.ts` 생성:

```ts
import { NextResponse } from 'next/server'
import { requireApprovedUser } from '@/lib/auth/session'
import { markAllAsRead } from '@/lib/db/notifications'
import { toAuthErrorResponse } from '@/lib/auth/session'

export async function PATCH() {
  try {
    const session = await requireApprovedUser()
    const userId = (session.user as { id?: number }).id
    if (!userId) return NextResponse.json({ error: '인증 오류' }, { status: 401 })

    const updatedCount = await markAllAsRead(userId)
    return NextResponse.json({ ok: true, updatedCount })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

3. TypeScript 컴파일 에러 확인:
   ```powershell
   npx tsc --noEmit
   ```
4. 개발 서버에서 로그인 후 curl 또는 브라우저 DevTools로 확인:
   - `PATCH /api/notifications/1/read` → `{ ok: true }` 또는 404
   - `PATCH /api/notifications/read-all` → `{ ok: true, updatedCount: N }`
5. 커밋:
   ```
   feat: 알림 단건·전체 읽음 처리 API 구현
   ```

**완료 기준:**
- [ ] `PATCH /api/notifications/[id]/read` — 본인 알림 읽음 처리 성공, 타인 알림은 404
- [ ] `PATCH /api/notifications/read-all` — 본인 전체 미읽음 읽음 처리 성공
- [ ] 미인증 요청 시 401 반환

---

### 태스크 4: `useNotifications` 커스텀 훅

**목표:** SSE 연결 생명주기 관리, 알림 상태, 읽음 처리 액션을 하나의 훅으로 캡슐화한다.
이 훅을 사용하면 컴포넌트가 SSE 연결 세부 사항을 몰라도 된다.

**스텝:**

1. `hooks/use-notifications.ts` 생성:

```ts
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export interface NotificationItem {
  id: number
  type: string
  message: string
  read: boolean
  createdAt: string
}

interface NotificationState {
  unreadCount: number
  items: NotificationItem[]
}

export function useNotifications() {
  const [state, setState] = useState<NotificationState>({ unreadCount: 0, items: [] })
  const esRef = useRef<EventSource | null>(null)

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close()

    const es = new EventSource('/api/notifications/stream')
    esRef.current = es

    es.addEventListener('notifications', (e) => {
      try {
        const data = JSON.parse(e.data) as NotificationState
        setState(data)
      } catch {
        // 파싱 실패는 무시
      }
    })

    es.onerror = () => {
      es.close()
      esRef.current = null
      // 3초 후 재연결 (EventSource 자동 재연결에 추가로 명시적 처리)
      setTimeout(connect, 3000)
    }
  }, [])

  useEffect(() => {
    connect()

    // 탭 비활성화 시 연결 끊기, 활성화 시 재연결
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        connect()
      } else {
        esRef.current?.close()
        esRef.current = null
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      esRef.current?.close()
    }
  }, [connect])

  const markAsRead = useCallback(async (id: number) => {
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
    setState((prev) => ({
      ...prev,
      unreadCount: Math.max(0, prev.unreadCount - (prev.items.find((i) => i.id === id && !i.read) ? 1 : 0)),
      items: prev.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
    }))
  }, [])

  const markAllAsRead = useCallback(async () => {
    await fetch('/api/notifications/read-all', { method: 'PATCH' })
    setState((prev) => ({
      unreadCount: 0,
      items: prev.items.map((item) => ({ ...item, read: true })),
    }))
  }, [])

  return { ...state, markAsRead, markAllAsRead }
}
```

2. TypeScript 컴파일 에러 확인:
   ```powershell
   npx tsc --noEmit
   ```
3. 커밋:
   ```
   feat: 알림 SSE 연결 및 상태 관리 커스텀 훅 구현
   ```

**완료 기준:**
- [ ] `useNotifications()` 호출 시 `unreadCount`, `items`, `markAsRead`, `markAllAsRead` 반환
- [ ] 탭 비활성화/활성화 시 SSE 연결 관리 로직 존재
- [ ] TypeScript 에러 없음

---

### 태스크 5: `NotificationItem` 컴포넌트

**목표:** 알림 한 건을 렌더링하는 프레젠테이션 컴포넌트를 만든다.
타입별 아이콘, 메시지, 상대 시간, 읽음/미읽음 스타일을 담당한다.

**스텝:**

1. `components/notification-item.tsx` 생성:

```tsx
import { useRouter } from 'next/navigation'
import {
  UserPlusIcon,
  InboxIcon,
  CheckCircleIcon,
  XCircleIcon,
  SlidersHorizontalIcon,
  UserCogIcon,
  BellIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NotificationItem as NotificationItemType } from '@/hooks/use-notifications'

const TYPE_CONFIG: Record<string, { icon: React.ElementType; href: string }> = {
  SIGNUP_PENDING: { icon: UserPlusIcon, href: '/admin/users-manage' },
  LEAVE_SUBMITTED: { icon: InboxIcon, href: '/approvals' },
  LEAVE_APPROVED: { icon: CheckCircleIcon, href: '/documents' },
  LEAVE_REJECTED: { icon: XCircleIcon, href: '/documents' },
  LEAVE_ADJUSTED: { icon: SlidersHorizontalIcon, href: '/documents' },
  APPROVER_CHANGED: { icon: UserCogIcon, href: '/documents' },
}

function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

interface Props {
  item: NotificationItemType
  onRead: (id: number) => void
}

export function NotificationItem({ item, onRead }: Props) {
  const router = useRouter()
  const config = TYPE_CONFIG[item.type] ?? { icon: BellIcon, href: '/dashboard' }
  const Icon = config.icon

  function handleClick() {
    if (!item.read) onRead(item.id)
    router.push(config.href)
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent',
        !item.read && 'bg-accent/50'
      )}
    >
      <div className={cn('mt-0.5 shrink-0 rounded-full p-1', !item.read ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}>
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm leading-snug', !item.read && 'font-medium')}>{item.message}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatRelativeTime(item.createdAt)}</p>
      </div>
      {!item.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
    </button>
  )
}
```

2. TypeScript 컴파일 에러 확인:
   ```powershell
   npx tsc --noEmit
   ```
3. 커밋:
   ```
   feat: 알림 항목 컴포넌트 구현 (타입별 아이콘·링크·읽음 상태)
   ```

**완료 기준:**
- [ ] 타입별 아이콘이 올바르게 매핑됨 (6가지 + 폴백)
- [ ] 미읽음 항목이 강조 배경으로 표시됨
- [ ] 클릭 시 읽음 처리 콜백 호출 + 해당 페이지로 이동

---

### 태스크 6: `NotificationBell` 컴포넌트

**목표:** 벨 아이콘 버튼(미읽음 뱃지 포함) + Popover(목록 + 모두 읽음)를 조합한
최종 컴포넌트를 만든다.

**스텝:**

1. shadcn Popover 컴포넌트가 이미 설치되어 있는지 확인:
   ```powershell
   # components/ui/popover.tsx 존재 확인
   dir "D:\03. FE\04_휴가관리시스템\components\ui\popover.tsx"
   ```
   없으면 추가:
   ```powershell
   npx shadcn@latest add popover
   ```

2. `components/notification-bell.tsx` 생성:

```tsx
'use client'

import { BellIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useNotifications } from '@/hooks/use-notifications'
import { NotificationItem } from '@/components/notification-item'

export function NotificationBell() {
  const { unreadCount, items, markAsRead, markAllAsRead } = useNotifications()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="알림">
          <BellIcon className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold">알림</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs text-muted-foreground"
              onClick={markAllAsRead}
            >
              모두 읽음
            </Button>
          )}
        </div>
        <Separator />
        {items.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">새 알림이 없습니다</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[360px]">
            <div className="flex flex-col gap-0.5 p-1">
              {items.map((item) => (
                <NotificationItem key={item.id} item={item} onRead={markAsRead} />
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  )
}
```

3. `ScrollArea`가 없으면 추가:
   ```powershell
   npx shadcn@latest add scroll-area
   ```

4. TypeScript 컴파일 에러 확인:
   ```powershell
   npx tsc --noEmit
   ```
5. 커밋:
   ```
   feat: NotificationBell 컴포넌트 구현 (벨 아이콘·뱃지·Popover)
   ```

**완료 기준:**
- [ ] 미읽음 수 뱃지가 1 이상일 때만 표시됨
- [ ] 99 초과 시 "99+" 표시
- [ ] Popover 열림/닫힘 동작
- [ ] 알림 없을 때 빈 상태 메시지 표시

---

### 태스크 7: 헤더에 NotificationBell 삽입

**목표:** `AppShell` 헤더의 우측 버튼 영역에 `<NotificationBell />`을 추가한다.

**스텝:**

1. `components/app-sidebar.tsx` 열기
2. 파일 상단 import에 추가:
   ```ts
   import { NotificationBell } from '@/components/notification-bell'
   ```
3. `AppShell` 함수 내 헤더 우측 버튼 영역 찾기 (현재 위치):
   ```tsx
   <div className="ml-auto flex items-center gap-1">
     {/* 도움말: ... */}
     <Button variant="ghost" size="icon" aria-label="도움말">
       <CircleHelpIcon className="size-4" />
     </Button>
     <ThemeToggle />
   </div>
   ```
4. `<ThemeToggle />` 앞에 `<NotificationBell />` 추가:
   ```tsx
   <div className="ml-auto flex items-center gap-1">
     <Button variant="ghost" size="icon" aria-label="도움말">
       <CircleHelpIcon className="size-4" />
     </Button>
     <NotificationBell />
     <ThemeToggle />
   </div>
   ```
5. 개발 서버에서 헤더에 벨 아이콘이 보이는지 확인:
   ```powershell
   npm run dev
   ```
6. 브라우저에서 로그인 후 헤더 우측에 벨 아이콘 렌더링 확인
7. TypeScript 컴파일 에러 확인:
   ```powershell
   npx tsc --noEmit
   ```
8. 커밋:
   ```
   feat: 헤더에 NotificationBell 컴포넌트 통합
   ```

**완료 기준:**
- [ ] 로그인 상태에서 헤더 우측에 벨 아이콘이 보임
- [ ] 미읽음 알림이 있을 때 뱃지 숫자가 표시됨
- [ ] 벨 클릭 시 Popover가 열리고 알림 목록이 보임
- [ ] 로그아웃 상태(로그인·회원가입 페이지)에서는 벨 아이콘이 없음

---

## 수동 QA 체크리스트

### 기본 동작

- [ ] 1. FREELANCER 로그인 → 결재자가 승인/반려 → 3초 내 벨 뱃지 숫자 증가
- [ ] 2. 벨 클릭 → Popover 열림 → 미읽음 알림 강조 배경 표시
- [ ] 3. 알림 항목 클릭 → 해당 페이지 이동 + Popover 닫힘 + 다시 열면 읽음 상태
- [ ] 4. "모두 읽음" 클릭 → 모든 항목 읽음 + 뱃지 사라짐
- [ ] 5. 알림 0건 → Popover에 "새 알림이 없습니다" 표시

### 역할별

- [ ] 6. APPROVER 로그인 → 프리랜서 휴가 신청 시 `LEAVE_SUBMITTED` 알림 수신
- [ ] 7. SUPER_ADMIN 로그인 → 신규 가입 신청 시 `SIGNUP_PENDING` 알림 수신
- [ ] 8. FREELANCER 로그인 → 결재자 변경 시 `APPROVER_CHANGED` 알림 수신

### 연결 안정성

- [ ] 9. 탭 비활성화 → 활성화 시 SSE 재연결 + 최신 알림 표시
- [ ] 10. 로그아웃 상태에서 `/api/notifications/stream` 직접 접근 → 401

### 에지 케이스

- [ ] 11. 미읽음 100건 이상 → 뱃지 "99+" 표시
- [ ] 12. 타인의 알림 ID로 `PATCH /api/notifications/[id]/read` 요청 → 404
