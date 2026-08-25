// Next.js 16부터 `middleware.ts` 파일 규약은 deprecated 되었고 `proxy.ts`로 이름이 변경되었다.
// 기능은 동일하며 파일/함수 이름만 바뀌었다.
// (https://nextjs.org/docs/app/api-reference/file-conventions/proxy#migration-to-proxy)
import { auth } from '@/lib/auth'

// '/api/signup'은 '/signup'으로 시작하지 않으므로 별도로 명시해야 한다.
// (누락 시 Task 11에서 구현한 회원가입 API가 이 프록시에 의해 막힘)
const PUBLIC_PATHS = ['/login', '/signup', '/api/signup']

export default auth((req) => {
  const isPublic = PUBLIC_PATHS.some((path) => req.nextUrl.pathname.startsWith(path))
  if (!req.auth && !isPublic) {
    const loginUrl = new URL('/login', req.nextUrl.origin)
    return Response.redirect(loginUrl)
  }
})

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
