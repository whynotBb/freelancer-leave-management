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
