# 비밀번호 초기화 기능 사용자 테스트 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비밀번호 초기화 기능 사용자 테스트에서 발견된 5건(원래 6건 중 실시간 알림 dot/토스트 1건은
별도 작업으로 분리, 이번 범위 제외)을 수정한다 — 마이페이지 비밀번호 재설정 메뉴 연계(자기서비스
기능 신규 구현), 비밀번호 초기화 시 세션 무효화가 화면 전환만으로는 반영되지 않던 버그 수정,
사용자 관리/퇴사자 관리 카드 레이아웃 반응형 버그, 로그인 화면 배경색 통일, 상태 배지 테두리 제거.

**Architecture:**
- 세션 무효화는 지금까지 `lib/auth/session.ts`의 `requireApprovedUser()`(관리자 API 호출 시점)에서만
  확인했다. 이 저장소는 Next.js 16이라 `middleware.ts`가 `proxy.ts`로 이름이 바뀌었고 **Node.js
  런타임에서 실행되므로 DB 조회가 가능하다** — `proxy.ts`에 동일한 확인 로직을 추가해 매 페이지
  이동(소프트 네비게이션 포함)마다 세션 유효성을 확인하고, 무효하면 세션 쿠키를 지우고 로그인
  화면으로 돌려보낸다.
- 자기서비스 비밀번호 변경은 기존 강제 초기화 종착점(`POST /api/auth/change-password`)을 확장해
  재사용한다 — `mustChangePassword`가 `false`인 세션에서는 `currentPassword`를 추가로 요구해
  검증한다. 새 엔드포인트를 만들지 않는다.
- 나머지 3건(그리드, 배경색, 배지 테두리)은 각 파일의 Tailwind 클래스만 바꾸는 순수 CSS 수정이다.

**Tech Stack:** Next.js 16(App Router, `proxy.ts`), NextAuth v5(beta, JWT 세션), Drizzle ORM +
postgres, Tailwind CSS, shadcn/ui(Dialog 등), bcryptjs, zod.

**Spec:** `docs/superpowers/specs/2026-08-28-password-reset-design.md` (이번 작업으로 6.2절 한계와
2장 제외 항목 일부가 갱신된다 — Task 7 참고)

## Global Constraints

- 커밋 메시지·코드 주석은 한국어, 변수명·함수명은 영어로 작성한다 (전역 CLAUDE.md).
- 이 저장소는 `app/`·API 라우트에 자동화 테스트를 두지 않는다 — **순수 함수만 Vitest 대상**이고,
  나머지는 수동 검증이 관례다(설계 문서 10장). 이번 계획의 작업은 새 순수 함수를 추가하지 않으므로
  각 작업 단계는 "구현 → 수동 검증 → 커밋" 순서를 따른다(TDD 유닛테스트 단계 없음).
- 비밀번호 정책은 `lib/domain/password-policy.ts`의 `PASSWORD_REQUIREMENTS`(8자 이상, 대문자·숫자·
  특수문자 포함)를 그대로 따른다 — 새 규칙을 만들지 않는다.
- 세션 전략은 JWT, `maxAge` 8시간(`lib/auth/auth-options.ts`) — 이번 작업에서 바꾸지 않는다.
- 설계 문서가 단일 진실 공급원이다 — 구현이 기존 문서 내용과 달라지면(이번 계획의 세션 무효화
  확장이 여기 해당) 문서를 함께 갱신한다(Task 7).
- 승인 대기 dot 표시와 실시간 토스트 알림(사용자 원 요청 5번 항목)은 사용자가 별도로 진행하기로
  결정했으므로 **이번 계획에 포함하지 않는다**.

---

### Task 1: 세션 무효화를 프록시 레벨로 확장 (화면 전환 시에도 즉시 로그아웃)

**배경**: `lib/auth/session.ts`의 `requireApprovedUser()`가 `passwordChangedAt`(DB) vs `loginAt`
(JWT 클레임)을 비교해 세션 무효화를 판단하지만, 이 함수는 관리자 API 라우트에서만 호출된다. 일반
페이지 이동(Next.js App Router의 `<Link>` 소프트 네비게이션)은 이 확인을 전혀 거치지 않고, JWT
세션 자체도 로그인 시점 값이 고정되어 있어(`mustChangePassword` 포함) DB만 바뀐 상태로는 아무 것도
바뀌지 않는다. 이 저장소는 Next.js 16이라 `proxy.ts`(구 `middleware.ts`)가 **Node.js 런타임**에서
실행되므로(설계 문서 작성 시점엔 이 확인이 안 됐던 것으로 보인다), 여기서 DB 조회를 해 매 요청마다
확인할 수 있다.

**Files:**
- Modify: `proxy.ts`
- Modify: `app/login/page.tsx`

**Interfaces:**
- Consumes: `lib/auth/index.ts`의 `auth`(기존 사용 중), `lib/db/client.ts`의 `db`, `lib/db/schema.ts`의
  `users`(`id`, `passwordChangedAt` 컬럼) — 모두 기존에 존재하는 것을 그대로 사용.
- Produces: 없음(다른 작업이 이 파일의 새 심볼을 참조하지 않음). 단, Task 3에서 만드는
  `SelfPasswordChangeDialog`도 이 작업이 만드는 무효화 규칙에 의해 로그아웃되므로, 성공 후
  `/login?passwordChanged=1`로 보내는 기존 패턴을 그대로 따르게 될 것이다.

- [ ] **Step 1: `proxy.ts`에 세션 무효화 확인 로직 추가**

`proxy.ts` 전체를 아래 내용으로 교체한다(기존 `mustChangePassword` 리다이렉트 로직은 그대로 유지하고
그 앞에 새 확인을 추가하는 구조):

```ts
// Next.js 16부터 `middleware.ts` 파일 규약은 deprecated 되었고 `proxy.ts`로 이름이 변경되었다.
// 기능은 동일하며 파일/함수 이름만 바뀌었다.
// (https://nextjs.org/docs/app/api-reference/file-conventions/proxy#migration-to-proxy)
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

// '/api/signup'은 '/signup'으로 시작하지 않으므로 별도로 명시해야 한다.
// (누락 시 Task 11에서 구현한 회원가입 API가 이 프록시에 의해 막힘)
// '/api/cron'도 세션 쿠키가 없는 Vercel Cron 호출이 사용하므로 공개 경로로 등록한다.
// 인증은 라우트 내부에서 Authorization: Bearer $CRON_SECRET 헤더로 별도 검증한다.
const PUBLIC_PATHS = ['/login', '/signup', '/api/signup', '/api/cron']
const CHANGE_PASSWORD_PATH = '/change-password'

// NextAuth v5의 JWT 세션 쿠키 이름. HTTPS 배포(useSecureCookies)에서는 '__Secure-' 접두사가
// 붙으므로(node_modules/@auth/core/lib/utils/cookie.js의 defaultCookies) 두 이름을 모두
// 지워야 어떤 환경에서도 확실히 로그아웃된다.
const SESSION_COOKIE_NAMES = ['authjs.session-token', '__Secure-authjs.session-token']

export default auth(async (req) => {
  const isPublic = PUBLIC_PATHS.some((path) => req.nextUrl.pathname.startsWith(path))
  if (!req.auth && !isPublic) {
    const loginUrl = new URL('/login', req.nextUrl.origin)
    return Response.redirect(loginUrl)
  }

  // 비밀번호 초기화(관리자) 또는 본인 변경으로 이 세션이 로그인된 뒤에 비밀번호가
  // 바뀌었으면, 화면 이동만으로는 감지되지 않던 문제(requireApprovedUser는 관리자 API
  // 호출 시점에만 실행됨)를 여기서 매 요청 확인해 즉시 로그인 화면으로 되돌린다. proxy.ts는
  // Next.js 16부터 Node.js 런타임에서 실행되므로 여기서도 DB 조회가 가능하다(스펙 6.2절
  // 작성 당시의 "미들웨어 레벨 확인 불가" 전제가 더 이상 유효하지 않다 — Task 7에서 문서
  // 갱신).
  if (req.auth && !isPublic) {
    const userId = Number((req.auth.user as { id?: string } | undefined)?.id)
    const loginAt = (req.auth.user as { loginAt?: number } | undefined)?.loginAt
    if (Number.isFinite(userId) && loginAt !== undefined) {
      const [row] = await db
        .select({ passwordChangedAt: users.passwordChangedAt })
        .from(users)
        .where(eq(users.id, userId))
      if (row?.passwordChangedAt && row.passwordChangedAt.getTime() > loginAt * 1000) {
        const response = NextResponse.redirect(new URL('/login?sessionExpired=1', req.nextUrl.origin))
        for (const name of SESSION_COOKIE_NAMES) {
          response.cookies.delete(name)
        }
        return response
      }
    }
  }

  // 관리자가 비밀번호를 초기화하면 세션에 mustChangePassword=true가 실려 온다 — 새
  // 비밀번호를 설정하기 전까지는 이 화면 외 다른 곳으로 못 가게 막는다.
  const mustChangePassword = (req.auth?.user as { mustChangePassword?: boolean } | undefined)?.mustChangePassword
  if (req.auth && mustChangePassword && !req.nextUrl.pathname.startsWith(CHANGE_PASSWORD_PATH)) {
    return Response.redirect(new URL(CHANGE_PASSWORD_PATH, req.nextUrl.origin))
  }
})

export const config = {
  // public/ 아래 정적 자산(로고 등)도 이 프록시 대상이라, 제외하지 않으면 비로그인 상태로
  // 이미지를 요청할 때 이미지 대신 /login으로 리다이렉트되어 깨진 것처럼 보인다.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)'],
}
```

- [ ] **Step 2: 로그인 화면에 세션 만료 안내 문구 추가**

`app/login/page.tsx`에서 `passwordChanged` 파싱 아래에 `sessionExpired`를 추가하고, 안내 문구
블록을 하나 더 추가한다.

```tsx
// app/login/page.tsx:15 아래에 추가
const sessionExpired = searchParams.get('sessionExpired') === '1'
```

```tsx
// app/login/page.tsx:40-44의 {passwordChanged && (...)} 블록 바로 다음에 추가
{sessionExpired && (
  <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
    비밀번호가 변경되어 로그아웃되었습니다. 다시 로그인해 주세요.
  </p>
)}
```

- [ ] **Step 3: 수동 검증**

1. `npm run dev`로 개발 서버 실행.
2. 브라우저 A에서 프리랜서 계정으로 로그인해 `/dashboard`에 머문다.
3. 브라우저 B(최고관리자)에서 "사용자 관리" 화면에 들어가 브라우저 A 계정의 "비밀번호 초기화"를
   실행한다.
4. 브라우저 A에서 사이드바의 다른 메뉴(예: "내 문서")를 클릭해 화면을 이동한다 — **API 호출 없이
   이동만 했는데도** `/login?sessionExpired=1`로 리다이렉트되고 안내 문구가 보이는지 확인한다.
5. 브라우저 A의 개발자 도구 > Application > Cookies에서 `authjs.session-token`(또는
   `__Secure-authjs.session-token`) 쿠키가 사라졌는지 확인한다.
6. 새로 발급된 임시 비밀번호로 다시 로그인하면 정상적으로 `/change-password`로 강제 이동하는지
   확인한다(기존 동작 회귀 없음).

- [ ] **Step 4: 커밋**

```bash
git add proxy.ts app/login/page.tsx
git commit -m "fix: 비밀번호 초기화 시 화면 전환만으로도 즉시 로그아웃되도록 프록시에서 세션 무효화 확인"
```

---

### Task 2: 자기서비스 비밀번호 변경 API 확장

**배경**: 최근 커밋(68d8370)에서 `POST /api/auth/change-password`는 `mustChangePassword=true`인
세션만 허용하도록 막혔다(관리자 강제 초기화 종착점 전용). 마이페이지 메뉴에서 로그인 상태의 사용자가
스스로(현재 비밀번호를 알고 있는 채로) 비밀번호를 바꿀 수 있어야 하므로, 같은 엔드포인트를 확장해
`mustChangePassword=false`인 세션에서는 `currentPassword`를 요구·검증하도록 바꾼다.

**Files:**
- Modify: `app/api/auth/change-password/route.ts`

**Interfaces:**
- Consumes: `lib/auth/session.ts`의 `requireApprovedUser()`, `toAuthErrorResponse()`(기존),
  `lib/domain/password-policy.ts`의 `isValidPassword`, `PASSWORD_POLICY_HINT`(기존).
- Produces: `POST /api/auth/change-password` 요청 바디가 `{ password: string, currentPassword?: string }`로
  바뀐다(기존 `{ password: string }` 호출부인 `app/change-password/page.tsx`는 `mustChangePassword=true`
  세션만 쓰므로 `currentPassword` 없이 호출해도 그대로 동작 — 하위 호환). Task 3의
  `SelfPasswordChangeDialog`가 `currentPassword`를 채워 호출한다.

- [ ] **Step 1: 라우트 구현 교체**

`app/api/auth/change-password/route.ts` 전체를 아래로 교체한다.

```ts
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireApprovedUser, toAuthErrorResponse } from '@/lib/auth/session'
import { isValidPassword, PASSWORD_POLICY_HINT } from '@/lib/domain/password-policy'

const bodySchema = z.object({
  password: z.string().refine(isValidPassword, { message: PASSWORD_POLICY_HINT }),
  currentPassword: z.string().min(1).optional(),
})

export async function POST(request: Request) {
  try {
    const session = await requireApprovedUser()
    const mustChangePassword = (session.user as { mustChangePassword?: boolean }).mustChangePassword
    const userId = Number((session.user as { id?: string }).id)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? PASSWORD_POLICY_HINT }, { status: 400 })
    }

    const [current] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId))
    if (!current) {
      return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 400 })
    }

    // 강제 초기화 대상(mustChangePassword=true)은 이미 임시 비밀번호로 인증된 세션이므로
    // 현재 비밀번호를 다시 물을 필요가 없다. 그 외(본인이 자발적으로 바꾸는 경우)에는 세션
    // 탈취만으로 비밀번호를 바꿔치기할 수 없도록 현재 비밀번호 확인을 요구한다.
    if (!mustChangePassword) {
      if (!parsed.data.currentPassword) {
        return NextResponse.json({ error: '현재 비밀번호를 입력해 주세요.' }, { status: 400 })
      }
      const matches = await bcrypt.compare(parsed.data.currentPassword, current.passwordHash)
      if (!matches) {
        return NextResponse.json({ error: '현재 비밀번호가 일치하지 않습니다.' }, { status: 400 })
      }
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10)
    await db
      .update(users)
      .set({ passwordHash, mustChangePassword: false, passwordChangedAt: new Date() })
      .where(eq(users.id, userId))

    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

- [ ] **Step 2: 수동 검증(curl)**

로그인 쿠키를 브라우저 개발자 도구에서 복사해 `Cookie` 헤더로 사용한다(둘 다 `mustChangePassword=false`
인 일반 세션 기준):

```bash
# 현재 비밀번호 누락 -> 400
curl -i -X POST http://localhost:3000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=<복사한 값>" \
  -d '{"password":"NewPass1!"}'

# 현재 비밀번호 오답 -> 400
curl -i -X POST http://localhost:3000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=<복사한 값>" \
  -d '{"password":"NewPass1!","currentPassword":"wrong"}'

# 정답 -> 200 {"ok":true}
curl -i -X POST http://localhost:3000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=<복사한 값>" \
  -d '{"password":"NewPass1!","currentPassword":"<실제 현재 비밀번호>"}'
```

기존 강제 초기화 플로우(임시 비밀번호로 로그인 → `/change-password`)도 그대로 동작하는지(currentPassword
없이 성공) 브라우저로 재확인한다.

- [ ] **Step 3: 커밋**

```bash
git add app/api/auth/change-password/route.ts
git commit -m "feat: 비밀번호 변경 API가 본인 자기서비스 변경(현재 비밀번호 검증)도 처리하도록 확장"
```

---

### Task 3: 자기서비스 비밀번호 변경 다이얼로그 UI + 사이드바 메뉴 연결

**Files:**
- Create: `components/self-password-change-dialog.tsx`
- Modify: `components/app-sidebar.tsx`

**Interfaces:**
- Consumes: Task 2에서 확장한 `POST /api/auth/change-password`(`{ currentPassword, password }`),
  `lib/domain/password-policy.ts`의 `isValidPassword`/`PASSWORD_REQUIREMENTS`(기존),
  `components/ui/dialog.tsx`의 `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/
  `DialogDescription`/`DialogFooter`(기존, `components/confirm-dialog.tsx`와 동일하게 사용).
- Produces: `SelfPasswordChangeDialog({ open: boolean, onOpenChange: (open: boolean) => void })` —
  `components/app-sidebar.tsx`가 소비한다.

- [ ] **Step 1: 다이얼로그 컴포넌트 작성**

`components/self-password-change-dialog.tsx` 신규 생성:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { isValidPassword, PASSWORD_REQUIREMENTS } from '@/lib/domain/password-policy'

interface SelfPasswordChangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SelfPasswordChangeDialog({ open, onOpenChange }: SelfPasswordChangeDialogProps) {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const passwordValid = isValidPassword(password)
  const passwordConfirmMatches = passwordConfirm.length === 0 || passwordConfirm === password
  const canSubmit =
    currentPassword.length > 0 && passwordValid && passwordConfirm.length > 0 && passwordConfirm === password

  function reset() {
    setCurrentPassword('')
    setPassword('')
    setPasswordConfirm('')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!canSubmit) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? '비밀번호 변경에 실패했습니다.')
        return
      }
      // 본인 비밀번호 변경도 세션 무효화 대상이다(Task 1) — 그대로 두면 다음 화면 이동 시
      // proxy.ts가 이 세션을 강제 로그아웃시킨다. 미리 로그아웃하고 새 비밀번호로 다시
      // 로그인하게 안내한다(app/change-password/page.tsx와 동일한 패턴).
      await signOut({ redirect: false })
      router.push('/login?passwordChanged=1')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>비밀번호 재설정</DialogTitle>
          <DialogDescription>현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">현재 비밀번호</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">새 비밀번호</Label>
            <Input
              id="newPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <ul className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
              {PASSWORD_REQUIREMENTS.map((req) => {
                const met = req.test(password)
                return (
                  <li
                    key={req.key}
                    className={cn(
                      'flex items-center gap-1 text-xs',
                      met ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/50'
                    )}
                  >
                    <CheckIcon className="size-3.5" />
                    {req.label}
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPasswordConfirm">새 비밀번호 확인</Label>
            <Input
              id="newPasswordConfirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              aria-invalid={!passwordConfirmMatches}
              required
            />
            {!passwordConfirmMatches && <p className="text-xs text-destructive">비밀번호가 일치하지 않습니다.</p>}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              취소
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? '변경 중...' : '비밀번호 변경'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: 사이드바 드롭다운 메뉴에 연결**

`components/app-sidebar.tsx`에서:

1. 최상단 import 블록에 `useState` 추가:

```tsx
// 기존: import Image from 'next/image'
'use client'

import { useState } from 'react'
import Image from 'next/image'
```

2. `SelfPasswordChangeDialog` import 추가(다른 컴포넌트 import들 근처):

```tsx
import { SelfPasswordChangeDialog } from '@/components/self-password-change-dialog'
```

3. `AppSidebar` 함수 본문 상단(`const { isMobile, setOpenMobile } = useSidebar()` 다음 줄)에 상태 추가:

```tsx
const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
```

4. 기존 TODO 주석과 비활성 메뉴 항목(`components/app-sidebar.tsx:208-212`)을 아래로 교체:

```tsx
<DropdownMenuItem onClick={() => setPasswordDialogOpen(true)}>
  <KeyRoundIcon />
  비밀번호 재설정
</DropdownMenuItem>
```

5. `</SidebarFooter>` 바로 다음, `</Sidebar>` 앞에 다이얼로그 렌더링 추가:

```tsx
      </SidebarFooter>
      <SelfPasswordChangeDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} />
    </Sidebar>
```

- [ ] **Step 3: 수동 검증**

1. 브라우저에서 로그인 후 사이드바 하단 계정 아바타 클릭 → "비밀번호 재설정" 클릭 → 다이얼로그가
   열리는지 확인.
2. 현재 비밀번호를 틀리게 입력 → 에러 메시지 표시 확인.
3. 새 비밀번호가 정책(8자 이상, 대문자·숫자·특수문자)을 만족하지 않을 때 체크리스트가 실시간으로
   반영되는지, 제출 버튼이 비활성 상태인지 확인.
4. 새 비밀번호/확인이 다를 때 "비밀번호가 일치하지 않습니다" 표시 확인.
5. 정상 입력 후 제출 → `/login?passwordChanged=1`로 이동하고 "비밀번호가 변경되었습니다..." 안내가
   보이는지 확인 → 새 비밀번호로 재로그인되는지 확인.
6. 모바일 너비(사이드바가 `Sheet`로 뜨는 경우)에서도 다이얼로그가 정상적으로 열리는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add components/self-password-change-dialog.tsx components/app-sidebar.tsx
git commit -m "feat: 사이드바 계정 메뉴의 비밀번호 재설정에 자기서비스 변경 기능 연결"
```

---

### Task 4: 사용자 관리 / 퇴사자 관리 카드 레이아웃을 태블릿에서도 1열로 고정

**배경**: 두 화면의 모바일 카드 뷰(`lg:hidden`)가 `sm:grid-cols-2`를 갖고 있어 태블릿 폭에서 2열로
배치된다. 사용자 요구는 데스크톱 테이블(`lg` 이상)로 전환되기 전까지는 항상 1열이어야 한다는 것이다.

**Files:**
- Modify: `app/admin/users-manage/page.tsx:322`
- Modify: `app/admin/departures/page.tsx:146`

**Interfaces:** 없음(클래스 문자열만 변경, 다른 파일이 참조하지 않음).

- [ ] **Step 1: `app/admin/users-manage/page.tsx` 수정**

```tsx
// before (line 322)
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
// after
<div className="grid grid-cols-1 gap-3 lg:hidden">
```

- [ ] **Step 2: `app/admin/departures/page.tsx` 수정**

```tsx
// before (line 146)
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
// after
<div className="grid grid-cols-1 gap-3 lg:hidden">
```

- [ ] **Step 3: 수동 검증**

브라우저 개발자 도구에서 뷰포트를 iPad 폭(768~1024px 사이 몇 지점)으로 바꿔가며 "사용자 관리"와
"퇴사자 관리" 화면이 항상 카드 1열로 보이는지 확인한다(`lg` 브레이크포인트 도달 전까지).

- [ ] **Step 4: 커밋**

```bash
git add app/admin/users-manage/page.tsx app/admin/departures/page.tsx
git commit -m "fix: 사용자 관리·퇴사자 관리 카드 뷰가 태블릿 폭에서도 1열로 배치되도록 수정"
```

---

### Task 5: 로그인 화면 좌측 배경색을 사이드바와 통일

**배경**: `components/auth-layout.tsx`의 브랜드 패널이 `bg-card`를 쓰는데, 사이드바는 `bg-sidebar`를
쓴다. 현재 두 토큰의 oklch 값은 우연히 같지만(`app/globals.css`), 의도를 명확히 하고 향후 토큰 값이
갈라져도 어긋나지 않도록 로그인 화면도 `bg-sidebar`를 직접 쓰도록 바꾼다.

**Files:**
- Modify: `components/auth-layout.tsx:16`

**Interfaces:** 없음.

- [ ] **Step 1: 클래스 변경**

```tsx
// before
<div className="flex flex-col justify-between gap-10 bg-card p-8 md:min-h-svh md:w-2/5 md:p-10">
// after
<div className="flex flex-col justify-between gap-10 bg-sidebar p-8 md:min-h-svh md:w-2/5 md:p-10">
```

- [ ] **Step 2: 수동 검증**

`/login`과 `/signup` 화면을 열어 좌측 브랜드 패널 배경색이 로그인 후 보이는 사이드바 배경색과
라이트/다크 모드 모두에서 동일하게 보이는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add components/auth-layout.tsx
git commit -m "fix: 로그인 화면 좌측 배경색을 사이드바 배경색과 통일"
```

---

### Task 6: 사용자 관리 화면의 승인대기/활성 상태 배지 테두리 제거

**Files:**
- Modify: `app/admin/users-manage/page.tsx:63-68`

**Interfaces:** `STATUS_BADGE_CLASS`는 이 파일 내부에서만 쓰인다(같은 파일의 `renderActions` 등이
아니라 JSX에서 직접 참조) — 다른 파일에서 import하지 않으므로 시그니처 영향 없음.

- [ ] **Step 1: 클래스에서 테두리 색 제거, `border-0`으로 교체**

```tsx
// before
const STATUS_BADGE_CLASS: Record<ManagedUser['signupStatus'], string> = {
  PENDING:
    'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  APPROVED:
    'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
}
// after
const STATUS_BADGE_CLASS: Record<ManagedUser['signupStatus'], string> = {
  PENDING: 'border-0 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  APPROVED: 'border-0 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
}
```

(역할 배지 `ROLE_BADGE_CLASS`는 사용자 요청 범위에 없으므로 그대로 둔다.)

- [ ] **Step 2: 수동 검증**

"사용자 관리" 화면의 데스크톱 테이블과 모바일 카드 뷰 양쪽에서 "승인대기"/"활성" 배지에 테두리가
보이지 않는지(배경색만 남는지) 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add app/admin/users-manage/page.tsx
git commit -m "fix: 사용자 관리 화면 승인대기/활성 배지의 테두리 제거"
```

---

### Task 7: 설계 문서 갱신 — 자기서비스 비밀번호 변경 + 세션 무효화 확장 반영

**배경**: CLAUDE.md 작업 원칙상 구현이 설계 문서와 달라지면 문서를 갱신해야 한다. 이번 계획은 (a)
6.2절이 "구조적으로 불가능"이라고 명시했던 즉시 로그아웃을 프록시 확장으로 사실상 구현했고, (b)
`POST /api/auth/change-password`를 강제 초기화 전용에서 자기서비스 변경까지 포함하도록 넓혔다.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-28-password-reset-design.md`

**Interfaces:** 없음(문서 변경).

- [ ] **Step 1: 6.2절 한계 문단 갱신**

`docs/superpowers/specs/2026-08-28-password-reset-design.md`의 143~147행(한계 문단)을 아래로
교체한다:

```markdown
**한계(2026-09-01 갱신)**: 최초 작성 시점에는 미들웨어가 Edge 런타임에서만 동작한다는 전제로 "매
페이지 이동마다 DB 재확인"을 범위 밖으로 뒀다. 이후 Next.js 16에서 `middleware.ts`가 `proxy.ts`로
바뀌며 Node.js 런타임이 기본이 되어 DB 조회가 가능해졌고, 사용자 테스트에서 "화면 전환만으로는
로그아웃되지 않는다"는 문제가 실제로 보고되어 `proxy.ts`에 동일한 `passwordChangedAt` vs `loginAt`
확인을 추가했다(세부 구현은 `docs/superpowers/plans/2026-09-01-password-reset-qa-fixes.md` Task 1
참고). 이제 화면 이동 시점에 즉시 세션 쿠키가 무효화되고 로그인 화면으로 돌아간다. 다만 이미 열려
있는 화면이 아무 요청도 보내지 않고 계속 떠 있는 경우(순수 클라이언트 상태만 보고 있는 탭)까지
막지는 못한다 — 다음 페이지 이동이나 API 호출 시점에 차단된다.
```

- [ ] **Step 2: 2장 "제외" 목록 갱신**

29~35행의 "제외" 목록 중 세 번째 항목("미들웨어(`proxy.ts`) 레벨의 매 페이지 이동마다 DB 재확인...")을
아래로 교체한다:

```markdown
- ~~미들웨어(`proxy.ts`) 레벨의 매 페이지 이동마다 DB 재확인~~ → 2026-09-01 갱신: 이제 포함됨(6.2절
  참고). Node.js 런타임 기반 `proxy.ts`로 구현.
```

- [ ] **Step 3: 자기서비스 비밀번호 변경 섹션 추가**

문서 맨 끝(10장 뒤)에 새 섹션을 추가한다:

```markdown

## 11. 후속 변경 — 자기서비스 비밀번호 변경 (2026-09-01)

로그인 상태에서 현재 비밀번호를 알고 있는 사용자가 자발적으로 비밀번호를 바꾸는 기능을 추가했다
(마이페이지/사이드바 계정 메뉴의 "비밀번호 재설정"). 이는 2장에서 제외한 "이메일로 비밀번호 찾기를
요청하는 셀프서비스 플로우"(비밀번호를 잊어버려 관리자에게 문의하는 경로)와는 다른 기능이다 —
현재 비밀번호를 알고 있는 사용자가 스스로 바꾸는 경우만 다룬다.

- 엔드포인트는 새로 만들지 않고 `POST /api/auth/change-password`를 확장했다: 요청 바디에
  `currentPassword`(선택)를 추가하고, 세션의 `mustChangePassword`가 `false`(=강제 초기화 대상이
  아님)일 때는 `currentPassword`를 필수로 요구·검증한다. `mustChangePassword`가 `true`인 기존
  강제 플로우는 그대로 `currentPassword` 없이 동작한다.
- UI는 전용 페이지가 아니라 `components/self-password-change-dialog.tsx` 다이얼로그로 제공한다
  (사이드바 계정 메뉴에서 열림). `/change-password` 전체 화면은 강제 초기화 플로우 전용으로 남는다.
- 변경 성공 시 6.2절 세션 무효화 규칙이 본인에게도 예외 없이 적용되므로, 클라이언트에서
  `signOut()` 후 `/login?passwordChanged=1`로 안내한다(기존 강제 변경 플로우와 동일 패턴).

세부 구현은 `docs/superpowers/plans/2026-09-01-password-reset-qa-fixes.md` Task 2~3 참고.
```

- [ ] **Step 4: 커밋**

```bash
git add docs/superpowers/specs/2026-08-28-password-reset-design.md
git commit -m "docs: 세션 무효화 프록시 확장과 자기서비스 비밀번호 변경 추가를 설계 문서에 반영"
```

---

### Task 8: 통합 검증 (단위 테스트 + 전체 수동 QA)

**배경**: 사용자가 "수정 완료 후 단위 테스트를 진행"하기로 했다. 이 저장소는 순수 함수만 Vitest
대상이므로, 기존 스위트 회귀 확인 + 타입체크 + 이번 계획 5건에 대한 수동 QA 체크리스트로 마무리한다.

**Files:** 없음(검증 전용 작업, 코드 변경 없음).

**Interfaces:** 없음.

- [ ] **Step 1: 기존 Vitest 스위트 실행(회귀 확인)**

```bash
npm run test
```

Expected: 기존 테스트(`lib/domain/password-policy.ts`의 `generateTempPassword` 등)가 모두 PASS —
이번 계획에서 `password-policy.ts`를 수정하지 않았으므로 실패하면 다른 원인(환경 문제 등)을 먼저
확인한다.

- [ ] **Step 2: 타입체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음. Task 1(`proxy.ts`), Task 2(API 라우트), Task 3(신규 컴포넌트)에서 타입 오류가
없는지 특히 확인한다.

- [ ] **Step 3: 전체 수동 QA 체크리스트 실행**

아래 5개 항목을 실제 브라우저(최고관리자 계정 + 테스트용 프리랜서 계정 2개)로 순서대로 확인하고,
실패 항목이 있으면 해당 Task로 돌아가 수정한다.

1. **마이페이지 비번 재설정 연계**: 사이드바 계정 메뉴 → "비밀번호 재설정" → 다이얼로그로 현재/새
   비밀번호 입력 → 변경 → 로그아웃 → 새 비밀번호로 재로그인 성공.
2. **초기화 시 로그아웃**: 관리자가 다른 사용자 비밀번호 초기화 → 그 사용자가 열어둔 화면에서
   메뉴만 클릭해도(추가 API 호출 없이) 즉시 로그인 화면으로 이동.
3. **태블릿 1열 레이아웃**: "사용자 관리", "퇴사자 관리" 화면을 768~1024px 폭에서 열어 카드가 항상
   1열인지 확인.
4. **로그인 배경색 통일**: `/login` 좌측 배경색이 로그인 후 사이드바 배경색과 라이트/다크 모두 동일.
5. **상태 배지 테두리 제거**: "사용자 관리" 화면의 "승인대기"/"활성" 배지에 테두리 없음(데스크톱 +
   모바일 카드 뷰 모두).

- [ ] **Step 4: 최종 보고**

체크리스트 결과와 `npm run test`/`tsc` 결과를 사용자에게 요약해 보고한다. 커밋은 이 작업 자체에서는
발생하지 않는다(검증 전용).
