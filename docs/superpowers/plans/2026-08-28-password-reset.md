# 비밀번호 초기화 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최고관리자가 "사용자 관리" 화면에서 임시 비밀번호를 발급하고, 사용자가 그 임시
비밀번호로 로그인하면 강제로 비밀번호를 변경하게 하는 전체 흐름을 구현한다. 곁들여 세션
최대 유지 시간을 8시간으로 단축하고, 비밀번호가 바뀌면 그 계정의 기존 세션을 무효화한다.

**Architecture:** `users` 테이블에 `mustChangePassword`/`passwordChangedAt` 컬럼을 추가하고,
JWT 세션의 `iat`(발급 시각)를 이 값과 비교해 "세션 발급 이후 비밀번호가 바뀌었는지"를 판단한다.
이 판단은 관리자 API 라우트 14곳이 이미 공통으로 거치는 `requireApprovedUser()`에 캐시 없이
추가한다. 로그인 후 강제 이동은 `proxy.ts`에 새 가드를 추가해 처리하고, 임시 비밀번호
생성·검증은 기존 `lib/domain/password-policy.ts`를 확장해 재사용한다. 감사 로그는 이미 만들어
둔 `account_events`/`buildHistoryTimeline`을 그대로 확장한다(새 테이블 없음).

**Tech Stack:** Next.js (App Router), NextAuth v5(beta, JWT 세션), Drizzle ORM + Postgres,
bcryptjs, Zod, shadcn/ui(Dialog), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-28-password-reset-design.md`

## Global Constraints

- 변수명/함수명은 영어, 커밋 메시지/주석/문서는 한국어 (`CLAUDE.md`)
- 임시 비밀번호는 서버 어디에도 평문 저장하지 않는다 — bcrypt 해시만 DB에 남고, 평문은
  초기화 API 응답 payload에 1회만 담긴다
- 비밀번호 변경 시 세션 무효화 확인은 캐시하지 않는다(가입상태 확인의 5분 캐시와는 별개) —
  보안 민감도가 더 높다고 판단했다(스펙 6.2절)
- **알려진 범위 한계**: `requireApprovedUser()`는 지금 `/api/admin/**` 라우트에서만 쓰이고,
  이 프로젝트에 프리랜서(FREELANCER) 역할이 실제로 쓸 수 있는 기능은 아직 없다(대시보드/내
  문서/결재함 모두 Task 18~22 미구현 placeholder). 따라서 이번에 만드는 "즉시 무효화"는
  현재로선 SUPER_ADMIN/APPROVER 계정에만 실질적 효과가 있고, FREELANCER 계정은 애초에
  세션으로 할 수 있는 일이 없어 무효화 여부가 체감되지 않는다. 프리랜서 기능이 생기면 그
  기능의 API도 `requireApprovedUser()`(또는 동급 게이트)를 거치도록 해서 이 메커니즘이
  자동으로 커버하게 된다 — 지금 범위에서 추가로 할 일은 없다
- 비밀번호 변경 성공 시 `/dashboard`로 바로 보내지 않고 로그아웃 후 `/login`으로 보낸다 —
  JWT 세션의 `mustChangePassword` 값이 발급 시점에 고정되어, DB만 바꿔서는 세션에 반영되지
  않기 때문이다(스펙 7.2절)
- 이 저장소는 `app/`·API 라우트에 자동 테스트를 두지 않는 기존 관례를 따른다 — 순수 함수
  (`lib/domain/**`)는 Vitest로, DB/API/세션 계층은 브라우저 + 직접 DB 조회로 수동 검증한다
- No Placeholders: 실제 동작하는 코드만, TODO/TBD 금지

---

### Task 1: DB 스키마 — `mustChangePassword`, `passwordChangedAt` 컬럼 추가

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `drizzle/0006_<generated-name>.sql` (drizzle-kit generate로 자동 생성)

**Interfaces:**
- Consumes: 없음
- Produces: `users.mustChangePassword`(boolean, notNull, default false),
  `users.passwordChangedAt`(timestamp, nullable) — Task 5(초기화 API), Task 4(세션 정책),
  Task 8(비밀번호 변경 API)이 이 컬럼들을 쓴다.

- [ ] **Step 1: 스키마 수정**

`lib/db/schema.ts`의 `users` 테이블 정의에서 `resignReason` 다음, `createdAt` 앞에 두 줄을
추가한다:

```ts
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('FREELANCER'), // 'SUPER_ADMIN' | 'APPROVER' | 'FREELANCER'
  signupStatus: varchar('signup_status', { length: 20 }).notNull().default('PENDING'), // 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESIGNED' | 'DELETED'
  hireDate: date('hire_date', { mode: 'string' }),
  defaultApproverId: integer('default_approver_id'),
  resignedAt: timestamp('resigned_at'),
  resignReason: text('resign_reason'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  passwordChangedAt: timestamp('password_changed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

`boolean`은 이미 파일 상단 import 줄에 포함돼 있으므로(`boolean, date, integer, numeric,
pgTable, serial, text, timestamp, uniqueIndex, varchar`) import 수정은 필요 없다.

- [ ] **Step 2: 마이그레이션 생성**

Run: `npx drizzle-kit generate --name password-reset`

Expected: `drizzle/0006_password-reset.sql` 생성. 다음과 의미가 같은 내용이어야 한다:

```sql
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_changed_at" timestamp;
```

- [ ] **Step 3: 마이그레이션 적용**

Run: `npx dotenv -e .env.local -- npx drizzle-kit migrate`
Expected: 에러 없이 완료.

```bash
npx dotenv -e .env.local -- node -e "
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING);
sql\`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='users' AND column_name IN ('must_change_password','password_changed_at')\`.then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `must_change_password`(boolean, NOT NULL, default false), `password_changed_at`
(timestamp, nullable) 두 컬럼이 출력됨.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat: 비밀번호 초기화 강제 플래그와 변경 시각 컬럼 추가"
```

---

### Task 2: 임시 비밀번호 생성 순수 함수

**Files:**
- Modify: `lib/domain/password-policy.ts`
- Test: `lib/domain/password-policy.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수)
- Produces: `generateTempPassword(): string` — Task 5(초기화 API)가 이 함수를 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/domain/password-policy.test.ts` 파일 끝(마지막 `describe` 블록 다음)에 추가:

```ts
describe('generateTempPassword', () => {
  it('항상 기존 비밀번호 정책(isValidPassword)을 통과한다', () => {
    for (let i = 0; i < 200; i++) {
      expect(isValidPassword(generateTempPassword())).toBe(true)
    }
  })

  it('길이가 항상 12자다', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateTempPassword()).toHaveLength(12)
    }
  })

  it('혼동되기 쉬운 문자(0, O, 1, l, I)를 포함하지 않는다', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTempPassword()).not.toMatch(/[0O1lI]/)
    }
  })

  it('호출할 때마다 다른 값을 생성한다(완전히 결정적이지 않음)', () => {
    const results = new Set(Array.from({ length: 20 }, () => generateTempPassword()))
    expect(results.size).toBeGreaterThan(1)
  })
})
```

파일 맨 위 import 줄을 다음으로 교체(테스트 대상 함수 추가):

```ts
import { describe, expect, it } from 'vitest'
import { generateTempPassword, isValidPassword, PASSWORD_REQUIREMENTS } from './password-policy'
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `npx vitest run lib/domain/password-policy.test.ts`
Expected: FAIL — `generateTempPassword`를 찾을 수 없다는 에러

- [ ] **Step 3: 구현**

`lib/domain/password-policy.ts` 파일 끝에 추가:

```ts
// 화면에 표시되고 사람이 옮겨 적을 수도 있는 값이므로, 혼동되기 쉬운 문자
// (0/O, 1/l/I)는 후보 문자셋에서 제외한다.
const TEMP_PASSWORD_UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const TEMP_PASSWORD_LOWERCASE = 'abcdefghjkmnpqrstuvwxyz'
const TEMP_PASSWORD_DIGITS = '23456789'
const TEMP_PASSWORD_SPECIALS = '!@#$%^&*'
const TEMP_PASSWORD_ALL =
  TEMP_PASSWORD_UPPERCASE + TEMP_PASSWORD_LOWERCASE + TEMP_PASSWORD_DIGITS + TEMP_PASSWORD_SPECIALS
const TEMP_PASSWORD_LENGTH = 12

function pickRandomChar(charset: string): string {
  return charset[Math.floor(Math.random() * charset.length)]
}

// isValidPassword가 요구하는 대문자/숫자/특수문자를 각각 최소 1개씩 먼저 뽑아 넣고
// 나머지 길이를 전체 문자셋에서 채운 뒤 섞는다 — 순서만으로 어느 자리가 어떤 종류인지
// 유추되지 않게 한다.
export function generateTempPassword(): string {
  const required = [
    pickRandomChar(TEMP_PASSWORD_UPPERCASE),
    pickRandomChar(TEMP_PASSWORD_DIGITS),
    pickRandomChar(TEMP_PASSWORD_SPECIALS),
  ]
  const rest = Array.from({ length: TEMP_PASSWORD_LENGTH - required.length }, () =>
    pickRandomChar(TEMP_PASSWORD_ALL)
  )
  const chars = [...required, ...rest]

  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }

  return chars.join('')
}
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `npx vitest run lib/domain/password-policy.test.ts`
Expected: PASS (기존 테스트 포함 전체)

- [ ] **Step 5: 커밋**

```bash
git add lib/domain/password-policy.ts lib/domain/password-policy.test.ts
git commit -m "feat: 정책을 통과하는 임시 비밀번호 생성 함수 추가"
```

---

### Task 3: 감사 로그 도메인 확장 — 비밀번호 초기화 카테고리

**Files:**
- Modify: `lib/domain/user-history.ts`
- Modify: `lib/domain/user-history.test.ts`
- Modify: `lib/db/history.ts`
- Modify: `app/admin/history/page.tsx`

**Interfaces:**
- Consumes: 없음(도메인 로직 확장), `lib/db/history.ts`/`app/admin/history/page.tsx`는
  기존 파일 수정
- Produces: `AccountEventHistoryRow.action`에 `'PASSWORD_RESET'` 추가,
  `HistoryEntry.category`에 `'비밀번호 초기화'` 추가 — Task 5(초기화 API)가 `account_events`에
  이 action 값으로 행을 삽입한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/domain/user-history.test.ts`의 `describe('buildHistoryTimeline', ...)` 블록 안,
마지막 `it(...)` 다음(블록이 닫히기 전)에 추가:

```ts
  it('PASSWORD_RESET 행은 "비밀번호 초기화"로 분류하고 detail은 "-"이다', () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [],
      approverChanges: [],
      accountEvents: [
        {
          action: 'PASSWORD_RESET',
          role: null,
          hireDate: null,
          reason: null,
          actorName: '관리자',
          createdAt: '2026-08-28T03:00:00.000Z',
        },
      ],
    })
    expect(result[0]).toEqual({
      category: '비밀번호 초기화',
      date: '2026-08-28 12:00',
      detail: '-',
      reason: '-',
      actorName: '관리자',
      targetUserId: undefined,
      targetUserName: undefined,
    })
  })
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `npx vitest run lib/domain/user-history.test.ts`
Expected: FAIL — 타입 에러(`'PASSWORD_RESET'`이 `action` 유니언에 없음) 또는 category가
`'퇴사'`로 잘못 나옴

- [ ] **Step 3: `lib/domain/user-history.ts` 수정**

`AccountEventHistoryRow`의 `action` 유니언을 교체:

```ts
export interface AccountEventHistoryRow {
  action: 'SIGNUP_APPROVED' | 'SIGNUP_REJECTED' | 'RESIGNED' | 'PASSWORD_RESET'
  role: 'FREELANCER' | 'APPROVER' | null
  hireDate: string | null
  reason: string | null
  actorName: string | null
  createdAt: string
  targetUserId?: number
  targetUserName?: string
}
```

`HistoryEntry.category` 유니언에 `'비밀번호 초기화'` 추가:

```ts
export interface HistoryEntry {
  category:
    | '연차 자동 발생'
    | '연차 조정'
    | '사용'
    | '결재자 변경'
    | '입사일 변경'
    | '만근 예외'
    | '가입 승인'
    | '가입 거절'
    | '퇴사'
    | '비밀번호 초기화'
  date: string
  detail: string
  reason: string
  actorName: string | null
  targetUserId?: number
  targetUserName?: string
}
```

`interface SortableEntry` 정의 바로 다음, `const KST_OFFSET_MS = ...` 앞에 매핑 상수를
추가:

```ts
const ACCOUNT_EVENT_CATEGORY: Record<AccountEventHistoryRow['action'], HistoryEntry['category']> = {
  SIGNUP_APPROVED: '가입 승인',
  SIGNUP_REJECTED: '가입 거절',
  RESIGNED: '퇴사',
  PASSWORD_RESET: '비밀번호 초기화',
}
```

`buildHistoryTimeline` 안의 `accountEventEntries` 계산 블록에서 `category` 줄을 교체:

기존:
```ts
  const accountEventEntries: SortableEntry[] = (params.accountEvents ?? []).map((a) => {
    const category: HistoryEntry['category'] =
      a.action === 'SIGNUP_APPROVED' ? '가입 승인' : a.action === 'SIGNUP_REJECTED' ? '가입 거절' : '퇴사'
```

변경 후:
```ts
  const accountEventEntries: SortableEntry[] = (params.accountEvents ?? []).map((a) => {
    const category = ACCOUNT_EVENT_CATEGORY[a.action]
```

나머지(`detail` 계산, `return` 문)는 그대로 둔다 — `PASSWORD_RESET`은 `SIGNUP_APPROVED`가
아니므로 기존 삼항연산 그대로 `detail = '-'`가 나온다.

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `npx vitest run lib/domain/user-history.test.ts`
Expected: PASS (기존 테스트 포함 전체, 20개)

- [ ] **Step 5: `lib/db/history.ts`의 타입 캐스트 갱신**

`getSiteWideHistory` 함수 안, `buildHistoryTimeline` 호출부의 `accountEvents` 매핑에서
`action` 캐스트를 교체:

기존:
```ts
    accountEvents: accountEventRows.map((a) => ({
      ...a,
      action: a.action as 'SIGNUP_APPROVED' | 'SIGNUP_REJECTED' | 'RESIGNED',
      role: a.role as 'FREELANCER' | 'APPROVER' | null,
      createdAt: a.createdAt.toISOString(),
      actorName: a.actorName ?? '-',
    })),
```

변경 후:
```ts
    accountEvents: accountEventRows.map((a) => ({
      ...a,
      action: a.action as 'SIGNUP_APPROVED' | 'SIGNUP_REJECTED' | 'RESIGNED' | 'PASSWORD_RESET',
      role: a.role as 'FREELANCER' | 'APPROVER' | null,
      createdAt: a.createdAt.toISOString(),
      actorName: a.actorName ?? '-',
    })),
```

- [ ] **Step 6: `app/admin/history/page.tsx` 수정**

`Category` 타입에 `'비밀번호 초기화'` 추가:

```ts
type Category =
  | '가입 승인'
  | '가입 거절'
  | '퇴사'
  | '비밀번호 초기화'
  | '연차 자동 발생'
  | '연차 조정'
  | '입사일 변경'
  | '사용'
  | '결재자 변경'
  | '만근 예외'
```

`CATEGORY_OPTIONS`에 추가:

```ts
const CATEGORY_OPTIONS: Category[] = [
  '가입 승인',
  '가입 거절',
  '퇴사',
  '비밀번호 초기화',
  '연차 자동 발생',
  '연차 조정',
  '입사일 변경',
  '사용',
  '결재자 변경',
  '만근 예외',
]
```

`CATEGORY_BADGE_CLASS`에 항목 추가(기존 9색과 겹치지 않는 `indigo` 사용):

```ts
const CATEGORY_BADGE_CLASS: Record<Category, string> = {
  '연차 자동 발생':
    'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  '연차 조정':
    'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  사용: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  '결재자 변경':
    'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300',
  '입사일 변경':
    'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300',
  '만근 예외':
    'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
  '가입 승인':
    'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300',
  '가입 거절':
    'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300',
  퇴사: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
  '비밀번호 초기화':
    'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
}
```

`PageHeader`의 `description`을 갱신:

기존:
```tsx
      <PageHeader title="변경 이력" description="가입 승인/거절, 퇴사, 연차, 결재자, 만근 예외 변경 이력을 조회합니다." />
```

변경 후:
```tsx
      <PageHeader title="변경 이력" description="가입 승인/거절, 퇴사, 비밀번호 초기화, 연차, 결재자, 만근 예외 변경 이력을 조회합니다." />
```

- [ ] **Step 7: 타입체크 & 린트**

Run: `npx tsc --noEmit && npx eslint lib/db/history.ts app/admin/history/page.tsx`
Expected: 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add lib/domain/user-history.ts lib/domain/user-history.test.ts lib/db/history.ts app/admin/history/page.tsx
git commit -m "feat: 변경 이력에 비밀번호 초기화 카테고리 추가"
```

---

### Task 4: 세션 정책 — 최대 유지 시간 + 비밀번호 변경 시 무효화

**Files:**
- Modify: `lib/auth/auth-options.ts`
- Modify: `lib/auth/session.ts`

**Interfaces:**
- Consumes: `users.mustChangePassword`, `users.passwordChangedAt`(Task 1)
- Produces: `session.user`에 `mustChangePassword: boolean`, `iat: number` 노출(Task 7의
  `proxy.ts`가 `mustChangePassword`를 읽는다). `requireApprovedUser()`가 비밀번호 변경 이후
  발급된 세션을 거부하는 동작(Task 5/8이 만드는 `passwordChangedAt` 갱신과 짝을 이룬다).

- [ ] **Step 1: `lib/auth/auth-options.ts` 전체 교체**

```ts
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

export const authConfig: NextAuthConfig = {
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8시간 — 활동이 없으면 이 시간 뒤 자동 로그아웃
    updateAge: 10 * 60, // 10분 이상 지난 뒤 요청이 오면 만료 시각을 슬라이딩 연장
  },
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

        if (user.signupStatus === 'RESIGNED') {
          throw new Error('퇴사 처리된 계정입니다.')
        }
        if (user.signupStatus !== 'APPROVED') {
          throw new Error('가입 승인 대기 중이거나 거절된 계정입니다.')
        }

        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        }
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.role = (user as { role: string }).role
        token.id = (user as { id: string }).id
        token.mustChangePassword = (user as { mustChangePassword: boolean }).mustChangePassword
      }
      return token
    },
    session: async ({ session, token }) => {
      if (session.user) {
        const sessionUser = session.user as {
          role?: string
          id?: string
          mustChangePassword?: boolean
          iat?: number
        }
        sessionUser.role = token.role as string
        sessionUser.id = token.id as string
        sessionUser.mustChangePassword = token.mustChangePassword as boolean
        sessionUser.iat = token.iat
      }
      return session
    },
  },
}
```

- [ ] **Step 2: `lib/auth/session.ts`의 `requireApprovedUser` 수정**

`requireApprovedUser` 함수 전체를 아래로 교체(가입상태 확인 로직은 그대로 두고, 앞부분에
비밀번호 무효화 확인을 추가):

```ts
export async function requireApprovedUser() {
  const session = await auth()
  if (!session?.user) {
    throw new UnauthorizedError('로그인이 필요합니다.')
  }
  const userId = Number((session.user as { id?: string }).id)

  // 비밀번호가 이 세션이 발급된 뒤에 바뀌었으면(관리자 초기화 포함) 그 세션은 더 이상
  // 유효하지 않다. 가입상태 확인(아래)과 달리 캐시하지 않고 매 요청 확인한다 — 비밀번호
  // 초기화는 보안 민감도가 더 높아 지연을 두지 않기로 했다(스펙 6.2절).
  const tokenIssuedAt = (session.user as { iat?: number }).iat
  const [passwordRow] = await db
    .select({ passwordChangedAt: users.passwordChangedAt })
    .from(users)
    .where(eq(users.id, userId))
  if (
    passwordRow?.passwordChangedAt &&
    tokenIssuedAt !== undefined &&
    passwordRow.passwordChangedAt.getTime() > tokenIssuedAt * 1000
  ) {
    throw new UnauthorizedError('비밀번호가 변경되어 다시 로그인해야 합니다.')
  }

  const cached = statusCache.get(userId)
  const now = Date.now()
  if (cached && now - cached.checkedAt < STATUS_CHECK_INTERVAL_MS) {
    if (!cached.approved) {
      throw new UnauthorizedError('로그인이 필요합니다.')
    }
    return session
  }

  const [current] = await db.select({ signupStatus: users.signupStatus }).from(users).where(eq(users.id, userId))
  const approved = !!current && current.signupStatus === 'APPROVED'
  statusCache.set(userId, { approved, checkedAt: now })

  if (!approved) {
    throw new UnauthorizedError('로그인이 필요합니다.')
  }
  return session
}
```

파일의 나머지(`requireSuperAdmin`, `requireApproverOrAbove`, `toAuthErrorResponse`, import
줄, 클래스 선언, `statusCache`)는 그대로 둔다.

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 수동 검증**

이 시점에는 `mustChangePassword`/`passwordChangedAt`을 실제로 바꾸는 API가 아직 없으므로
(Task 5), 전체 흐름은 검증할 수 없다. 이 태스크에서는 설정값과 세션 노출만 확인한다:

`npm run dev` 실행 후 SUPER_ADMIN으로 로그인 → 브라우저 개발자 도구 콘솔에서
`await fetch('/api/auth/session').then(r => r.json())` 실행 → 응답의 `user` 객체에
`mustChangePassword: false`, `iat`(숫자)가 포함되는지 확인. 기존 관리자 화면(예: 사용자
관리)이 평소처럼 정상 동작하는지도 확인(비밀번호 확인 로직 추가로 회귀가 없는지).

- [ ] **Step 5: 커밋**

```bash
git add lib/auth/auth-options.ts lib/auth/session.ts
git commit -m "feat: 세션 8시간 만료 설정, 비밀번호 변경 시 세션 무효화 확인 추가"
```

---

### Task 5: 관리자 API — 비밀번호 초기화

**Files:**
- Create: `app/api/admin/users-manage/[id]/reset-password/route.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin`/`toAuthErrorResponse`(기존), `generateTempPassword`(Task 2),
  `users.mustChangePassword`/`passwordChangedAt`(Task 1), `accountEvents` 테이블(기존)
- Produces: `PATCH /api/admin/users-manage/[id]/reset-password` → `{ok: true, tempPassword:
  string}` — Task 6(관리자 UI)이 이 응답을 소비한다.

- [ ] **Step 1: 라우트 작성**

```ts
// app/api/admin/users-manage/[id]/reset-password/route.ts
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accountEvents, users } from '@/lib/db/schema'
import { generateTempPassword } from '@/lib/domain/password-policy'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSuperAdmin()
    const actorId = Number((session.user as { id?: string }).id)
    const { id } = await params
    const targetId = Number(id)

    const tempPassword = generateTempPassword()
    const passwordHash = await bcrypt.hash(tempPassword, 10)

    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(users)
        .set({ passwordHash, mustChangePassword: true, passwordChangedAt: new Date() })
        .where(and(eq(users.id, targetId), eq(users.signupStatus, 'APPROVED')))
        .returning({ id: users.id })

      if (rows.length > 0) {
        await tx.insert(accountEvents).values({
          userId: targetId,
          actorId,
          action: 'PASSWORD_RESET',
        })
      }
      return rows
    })

    if (updated.length === 0) {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, tempPassword })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
```

`signupStatus === 'APPROVED'`인 행만 대상이다(스펙 5.2절) — SUPER_ADMIN 본인을 포함해 승인된
계정이면 누구든 초기화할 수 있다(스펙 5.1절, 이 계정 체계의 유일한 복구 경로이므로 예외를
두지 않는다).

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 수동 검증**

`npm run dev` 실행 후 SUPER_ADMIN으로 로그인해 curl 또는 브라우저 콘솔에서 승인된 프리랜서
계정 하나의 id로 `PATCH /api/admin/users-manage/{id}/reset-password` 호출(빈 바디) →
`{"ok":true,"tempPassword":"..."}` 형태 응답 확인. 아래로 DB를 직접 조회해 확인:

```bash
npx dotenv -e .env.local -- node -e "
const postgres = require('postgres');
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING);
sql\`SELECT id, must_change_password, password_changed_at FROM users WHERE id=\${대상_id}\`.then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `must_change_password=true`, `password_changed_at`이 방금 시각으로 채워짐. 이어서
`account_events` 최근 행이 `action='PASSWORD_RESET'`, `user_id`=대상, `actor_id`=로그인한
SUPER_ADMIN인지 확인. 마지막으로 그 계정으로 원래 비밀번호로 로그인 시도 → 실패, 응답받은
`tempPassword`로 로그인 시도 → 성공하는지 확인(이 시점엔 Task 7이 아직 없어 `/change-password`
게이트는 동작하지 않는다 — 로그인 자체만 확인).

**세션 무효화 확인(스펙 6.2절, 별도 시나리오)**: `requireApprovedUser()`는 `/api/admin/**`
에서만 쓰이므로(Global Constraints 참고), 이 확인은 APPROVER 또는 SUPER_ADMIN 계정으로 해야
의미가 있다 — 프리랜서 계정은 호출할 관리자 API가 없어 무효화 여부를 관찰할 수 없다.
1. APPROVER 역할 계정 하나를 브라우저 A에서 로그인시켜 둔다
2. 그 계정으로 브라우저 A에서 `GET /api/admin/users`(프리랜서 정보 관리 목록 API,
   `requireApproverOrAbove` 게이트)를 호출 → 200 확인(무효화 전 정상 동작 확인)
3. 브라우저 B(또는 SUPER_ADMIN 세션)에서 그 APPROVER 계정을 "비밀번호 초기화"
4. 다시 브라우저 A에서 같은 `GET /api/admin/users` 호출 → 401(`비밀번호가 변경되어 다시
   로그인해야 합니다.`)로 막히는지 확인 — 로그아웃 없이 세션 쿠키만 그대로 있는 상태에서
   막혀야 한다

- [ ] **Step 4: 커밋**

```bash
git add "app/api/admin/users-manage/[id]/reset-password/route.ts"
git commit -m "feat: 관리자 비밀번호 초기화 API 추가"
```

---

### Task 6: 관리자 UI — 확인 모달 + 임시 비밀번호 결과 다이얼로그

**Files:**
- Modify: `app/admin/users-manage/page.tsx`
- Create: `components/temp-password-dialog.tsx`

**Interfaces:**
- Consumes: `PATCH /api/admin/users-manage/[id]/reset-password`(Task 5),
  `components/confirm-dialog.tsx`(기존)
- Produces: 없음(리프 UI)

- [ ] **Step 1: `components/temp-password-dialog.tsx` 작성**

```tsx
'use client'

import { useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
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

interface TempPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userName: string
  tempPassword: string
}

function buildEmailBody(userName: string, tempPassword: string, loginUrl: string): string {
  return `${userName}님, 안녕하세요.

요청하신 비밀번호가 아래와 같이 초기화되었습니다.

임시 비밀번호: ${tempPassword}

아래 링크로 접속해 로그인하시면 새 비밀번호를 설정하는 화면으로 자동 연결됩니다.
${loginUrl}

감사합니다.`
}

export function TempPasswordDialog({ open, onOpenChange, userName, tempPassword }: TempPasswordDialogProps) {
  const [copiedField, setCopiedField] = useState<'password' | 'email' | null>(null)

  async function copy(text: string, field: 'password' | 'email') {
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1500)
  }

  const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : ''
  const emailBody = buildEmailBody(userName, tempPassword, loginUrl)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>임시 비밀번호가 발급되었습니다</DialogTitle>
          <DialogDescription>
            이 창을 닫으면 다시 확인할 수 없습니다. {userName}님에게 아래 내용을 전달해 주세요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">임시 비밀번호</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm">
                {tempPassword}
              </code>
              <Button type="button" variant="outline" size="icon" onClick={() => copy(tempPassword, 'password')}>
                {copiedField === 'password' ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">이메일 회신 본문</p>
            <Textarea value={emailBody} readOnly rows={7} className="text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => copy(emailBody, 'email')}>
            {copiedField === 'email' ? '복사됨' : '이메일 본문 복사'}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: `app/admin/users-manage/page.tsx` 수정**

파일 상단 import 블록에 세 줄 추가(`ConfirmDialog`, `TempPasswordDialog` — 이 파일은 지금
`ConfirmDialog`를 쓰고 있지 않으므로 새로 추가):

```ts
import { ConfirmDialog } from '@/components/confirm-dialog'
import { TempPasswordDialog } from '@/components/temp-password-dialog'
```

`resignTarget` state 선언 바로 다음에 상태 3개 추가:

```ts
  const [resetTarget, setResetTarget] = useState<{ id: number; name: string } | null>(null)
  const [resetSubmitting, setResetSubmitting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [tempPasswordResult, setTempPasswordResult] = useState<{ name: string; tempPassword: string } | null>(null)
```

`decide` 함수 다음에 초기화 처리 함수를 추가:

```ts
  async function confirmResetPassword() {
    if (!resetTarget) return
    setResetSubmitting(true)
    try {
      const res = await fetch(`/api/admin/users-manage/${resetTarget.id}/reset-password`, {
        method: 'PATCH',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setResetError(body?.error ?? '처리에 실패했습니다.')
        return
      }
      const data = await res.json()
      setTempPasswordResult({ name: resetTarget.name, tempPassword: data.tempPassword })
      setResetTarget(null)
      setResetError(null)
    } finally {
      setResetSubmitting(false)
    }
  }
```

`renderActions` 함수 안, 비활성화된 버튼을 활성 버튼으로 교체:

기존:
```tsx
    return (
      <div className={wrapClass}>
        <Button className={btnClass} variant="outline" disabled>
          비밀번호 초기화
        </Button>
```

변경 후:
```tsx
    return (
      <div className={wrapClass}>
        <Button
          className={btnClass}
          variant="outline"
          onClick={() => setResetTarget({ id: user.id, name: user.name })}
        >
          비밀번호 초기화
        </Button>
```

JSX 맨 아래, `<ResignDialog .../>` 다음에 두 다이얼로그를 추가:

```tsx
      <ConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null)
            setResetError(null)
          }
        }}
        title="비밀번호를 초기화하시겠습니까?"
        description="임시 비밀번호가 새로 발급되며 기존 비밀번호는 더 이상 사용할 수 없습니다."
        confirmLabel="초기화"
        onConfirm={confirmResetPassword}
        submitting={resetSubmitting}
        error={resetError}
      />

      <TempPasswordDialog
        open={tempPasswordResult !== null}
        onOpenChange={(open) => !open && setTempPasswordResult(null)}
        userName={tempPasswordResult?.name ?? ''}
        tempPassword={tempPasswordResult?.tempPassword ?? ''}
      />
```

- [ ] **Step 3: 타입체크 & 린트**

Run: `npx tsc --noEmit && npx eslint app/admin/users-manage/page.tsx components/temp-password-dialog.tsx`
Expected: 에러 없음

- [ ] **Step 4: 수동 검증**

`npm run dev` 실행 후 SUPER_ADMIN으로 로그인 → "사용자 관리" 화면에서 승인된 계정 하나의
"비밀번호 초기화" 클릭 → 확인 모달(첨부 이미지와 동일한 문구)이 뜨는지 확인 → "초기화" 클릭 →
확인 모달이 닫히고 임시 비밀번호 다이얼로그가 뜨는지 확인. 임시 비밀번호 옆 복사 버튼 클릭 →
아이콘이 체크로 잠깐 바뀌는지, 실제로 클립보드에 복사됐는지(붙여넣기로 확인) 확인. "이메일
본문 복사" 클릭 → 버튼 라벨이 "복사됨"으로 잠깐 바뀌는지, 복사된 텍스트에 대상자 이름/임시
비밀번호/로그인 URL이 올바르게 채워졌는지 확인. 다이얼로그를 닫고 다시 열 방법이 없는지(재발급만
가능) 확인.

- [ ] **Step 5: 커밋**

```bash
git add app/admin/users-manage/page.tsx components/temp-password-dialog.tsx
git commit -m "feat: 사용자 관리 화면에 비밀번호 초기화 UI 연결"
```

---

### Task 7: 로그인 후 강제 이동 게이트

**Files:**
- Modify: `proxy.ts`
- Modify: `components/app-sidebar.tsx`

**Interfaces:**
- Consumes: `session.user.mustChangePassword`(Task 4)
- Produces: 인증된 상태에서 `mustChangePassword=true`면 `/change-password` 외 모든 경로가
  그 페이지로 리다이렉트된다 — Task 8(비밀번호 변경 화면)이 이 경로를 실제로 만든다.

- [ ] **Step 1: `proxy.ts` 수정**

전체 파일을 아래로 교체:

```ts
// Next.js 16부터 `middleware.ts` 파일 규약은 deprecated 되었고 `proxy.ts`로 이름이 변경되었다.
// 기능은 동일하며 파일/함수 이름만 바뀌었다.
// (https://nextjs.org/docs/app/api-reference/file-conventions/proxy#migration-to-proxy)
import { auth } from '@/lib/auth'

// '/api/signup'은 '/signup'으로 시작하지 않으므로 별도로 명시해야 한다.
// (누락 시 Task 11에서 구현한 회원가입 API가 이 프록시에 의해 막힘)
// '/api/cron'도 세션 쿠키가 없는 Vercel Cron 호출이 사용하므로 공개 경로로 등록한다.
// 인증은 라우트 내부에서 Authorization: Bearer $CRON_SECRET 헤더로 별도 검증한다.
const PUBLIC_PATHS = ['/login', '/signup', '/api/signup', '/api/cron']
const CHANGE_PASSWORD_PATH = '/change-password'

export default auth((req) => {
  const isPublic = PUBLIC_PATHS.some((path) => req.nextUrl.pathname.startsWith(path))
  if (!req.auth && !isPublic) {
    const loginUrl = new URL('/login', req.nextUrl.origin)
    return Response.redirect(loginUrl)
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

- [ ] **Step 2: `components/app-sidebar.tsx`의 `NO_CHROME_ROUTES` 수정**

기존:
```ts
const NO_CHROME_ROUTES = ['/login', '/signup']
```

변경 후:
```ts
const NO_CHROME_ROUTES = ['/login', '/signup', '/change-password']
```

`/change-password`도 로그인/회원가입 화면과 같은 카드 레이아웃으로 보여야 하고(강제 이동
중인 화면에 사이드바를 보여주면 다른 메뉴로 도망갈 수 있어 보이는 게 부자연스럽다), 이
경로 자체가 프록시에서 사이드바 유무와 무관하게 강제되므로 사이드바를 숨겨도 접근 제어에는
영향이 없다.

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 수동 검증**

이 시점에는 `/change-password` 페이지가 아직 없다(Task 8에서 생성). `npm run dev` 실행 후:
1. Task 5에서 초기화한 계정(또는 새로 초기화한 계정)의 임시 비밀번호로 로그인 →
   `/change-password`로 리다이렉트되는지 확인(페이지 자체는 아직 없어 404가 뜨는 게
   정상 — 리다이렉트 자체가 일어나는지만 확인)
2. 그 상태에서 브라우저 주소창에 `/admin/users-manage` 등 다른 경로를 직접 입력 →
   `/change-password`로 다시 리다이렉트되는지 확인
3. 일반적으로 초기화되지 않은 계정으로 로그인 → 리다이렉트 없이 정상 진입되는지 확인
   (회귀 확인)

- [ ] **Step 5: 커밋**

```bash
git add proxy.ts components/app-sidebar.tsx
git commit -m "feat: 비밀번호 강제 변경 대상 계정을 change-password로 리다이렉트"
```

---

### Task 8: 비밀번호 변경 화면 + API

**Files:**
- Create: `app/api/auth/change-password/route.ts`
- Create: `app/change-password/page.tsx`
- Modify: `app/login/page.tsx`

**Interfaces:**
- Consumes: `requireApprovedUser`/`toAuthErrorResponse`(기존), `isValidPassword`/
  `PASSWORD_REQUIREMENTS`/`PASSWORD_POLICY_HINT`(기존, `lib/domain/password-policy.ts`)
- Produces: `POST /api/auth/change-password` — Task 7이 만든 게이트가 이 화면으로 보낸
  사용자가 최종적으로 도달하는 종착점(이 태스크로 전체 플로우가 완성된다)

- [ ] **Step 1: API 라우트 작성**

```ts
// app/api/auth/change-password/route.ts
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
})

export async function POST(request: Request) {
  try {
    const session = await requireApprovedUser()
    const userId = Number((session.user as { id?: string }).id)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: PASSWORD_POLICY_HINT }, { status: 400 })
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

`requireApprovedUser()`만 쓰고 역할 제한은 두지 않는다 — 세션의 본인 계정만 대상이라(파라미터로
id를 받지 않고 세션에서 추출) FREELANCER/APPROVER/SUPER_ADMIN 누구나 자기 비밀번호를 바꿀 수
있어야 한다(스펙 9장).

- [ ] **Step 2: 비밀번호 변경 화면 작성**

```tsx
// app/change-password/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { CheckIcon } from 'lucide-react'
import { AuthLayout } from '@/components/auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { isValidPassword, PASSWORD_REQUIREMENTS } from '@/lib/domain/password-policy'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const passwordValid = isValidPassword(password)
  const passwordConfirmMatches = passwordConfirm.length === 0 || passwordConfirm === password
  const canSubmit = passwordValid && passwordConfirm.length > 0 && passwordConfirm === password

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!canSubmit) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? '비밀번호 변경에 실패했습니다.')
        return
      }
      // JWT 세션은 발급 시점의 mustChangePassword 값이 고정되어 DB만 바꿔서는 반영되지
      // 않는다 — 로그아웃 후 새 비밀번호로 다시 로그인하게 한다(스펙 7.2절).
      await signOut({ redirect: false })
      router.push('/login?passwordChanged=1')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">비밀번호 변경</h1>
        <p className="text-sm text-muted-foreground">
          임시 비밀번호로 로그인하셨습니다. 계속 이용하려면 새 비밀번호를 설정해 주세요.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">새 비밀번호</Label>
          <Input
            id="password"
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
          <Label htmlFor="passwordConfirm">새 비밀번호 확인</Label>
          <Input
            id="passwordConfirm"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            aria-invalid={!passwordConfirmMatches}
            required
          />
          {!passwordConfirmMatches && <p className="text-xs text-destructive">비밀번호가 일치하지 않습니다.</p>}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={!canSubmit || submitting}>
          {submitting ? '변경 중...' : '비밀번호 변경'}
        </Button>
      </form>
    </AuthLayout>
  )
}
```

- [ ] **Step 3: 로그인 화면에 변경 완료 안내 추가**

`app/login/page.tsx`의 import 줄을 교체(`useSearchParams` 추가):

기존:
```ts
import { useRouter } from 'next/navigation'
```

변경 후:
```ts
import { useRouter, useSearchParams } from 'next/navigation'
```

컴포넌트 본문 상단, `const [email, setEmail] = useState('')` 앞에 한 줄 추가:

```ts
  const searchParams = useSearchParams()
  const passwordChanged = searchParams.get('passwordChanged') === '1'
```

`<h1>`이 포함된 안내 블록(`<div className="space-y-1">...</div>`) 바로 다음에 조건부 안내
문구를 추가:

```tsx
      {passwordChanged && (
        <p className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.
        </p>
      )}
```

- [ ] **Step 4: 타입체크 & 린트**

Run: `npx tsc --noEmit && npx eslint app/api/auth/change-password/route.ts app/change-password/page.tsx app/login/page.tsx`
Expected: 에러 없음. `useSearchParams`를 쓰는 클라이언트 페이지가 빌드 시
"missing Suspense boundary" 경고/에러를 내는지도 `npx tsc --noEmit`과는 별도로 다음 단계
(Step 5)의 실제 개발 서버 구동으로 확인한다.

- [ ] **Step 5: 수동 검증(전체 플로우 종단 확인)**

`npm run dev` 실행 후:
1. SUPER_ADMIN으로 승인된 프리랜서 계정 하나를 "비밀번호 초기화" → 임시 비밀번호 확보
2. 로그아웃 → 그 임시 비밀번호로 로그인 → `/change-password`로 자동 이동하는지 확인
3. 정책에 안 맞는 비밀번호 입력 시 제출 버튼이 비활성 상태인지, 체크리스트가 실시간으로
   갱신되는지 확인
4. 유효한 새 비밀번호 입력 후 제출 → 로그인 화면(`/login?passwordChanged=1`)으로 이동하고
   "비밀번호가 변경되었습니다" 안내가 보이는지 확인
5. 방금 설정한 새 비밀번호로 로그인 → 이번엔 `/change-password`로 리다이렉트되지 않고
   정상 진입하는지 확인(더 이상 강제 대상이 아님)
6. 이전 임시 비밀번호로는 더 이상 로그인이 안 되는지 확인
7. "변경 이력" 화면에서 이번 초기화 건이 `비밀번호 초기화` 카테고리로, 올바른 작업자/대상
   으로 나타나는지 확인

- [ ] **Step 6: 커밋**

```bash
git add app/api/auth/change-password/route.ts app/change-password/page.tsx app/login/page.tsx
git commit -m "feat: 비밀번호 변경 화면과 API 추가로 초기화 플로우 완성"
```

---

## Post-Plan Suggestions (범위 밖, 제안만)

- `requireApprovedUser()`의 비밀번호 무효화 확인은 지금 `/api/admin/**`에서만 실질적 효과가
  있다(Global Constraints 참고) — 프리랜서 기능(결재함 등)이 생기면 그 API들도 반드시
  `requireApprovedUser()`(또는 동급 게이트)를 거치게 해서 이 메커니즘이 계속 유효하도록
  해야 한다.
- 지금은 관리자 API 호출 시점에만 세션을 무효화한다 — 더 강한 즉시성이 필요해지면
  `proxy.ts` 레벨에서 페이지 이동마다 확인하는 방식으로 확장할 수 있다(스펙 2장에서 이번
  범위 제외로 명시).
- 이메일 실제 발송 자동화(회신 본문을 복사가 아니라 바로 발송)는 이번 범위에서 제외했다
  (스펙 2장).
