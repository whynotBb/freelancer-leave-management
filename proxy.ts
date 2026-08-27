// Next.js 16부터 `middleware.ts` 파일 규약은 deprecated 되었고 `proxy.ts`로 이름이 변경되었다.
// 기능은 동일하며 파일/함수 이름만 바뀌었다.
// (https://nextjs.org/docs/app/api-reference/file-conventions/proxy#migration-to-proxy)
import { auth } from '@/lib/auth'

// '/api/signup'은 '/signup'으로 시작하지 않으므로 별도로 명시해야 한다.
// (누락 시 Task 11에서 구현한 회원가입 API가 이 프록시에 의해 막힘)
// '/api/cron'도 세션 쿠키가 없는 Vercel Cron 호출이 사용하므로 공개 경로로 등록한다.
// 인증은 라우트 내부에서 Authorization: Bearer $CRON_SECRET 헤더로 별도 검증한다.
const PUBLIC_PATHS = ['/login', '/signup', '/api/signup', '/api/cron']

export default auth((req) => {
  const isPublic = PUBLIC_PATHS.some((path) => req.nextUrl.pathname.startsWith(path))
  if (!req.auth && !isPublic) {
    const loginUrl = new URL('/login', req.nextUrl.origin)
    return Response.redirect(loginUrl)
  }
})

export const config = {
  // public/ 아래 정적 자산(로고 등)도 이 프록시 대상이라, 제외하지 않으면 비로그인 상태로
  // 이미지를 요청할 때 이미지 대신 /login으로 리다이렉트되어 깨진 것처럼 보인다.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)'],
}
