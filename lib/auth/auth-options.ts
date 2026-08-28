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
    // NextAuth JWT 전략에서 updateAge는 실제로 적용되지 않는다(database 전략 전용) —
    // 매 세션 조회마다 쿠키가 새 iat로 재발급되며 만료 시각이 그때마다 maxAge만큼
    // 슬라이딩 연장되므로, 결과적으로 8시간 유휴 만료라는 의도는 그대로 충족된다.
    updateAge: 10 * 60,
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
        // JWT의 iat는 세션이 재조회될 때마다(페이지 이동, API 호출 등) 새 값으로
        // 재발급되어 "로그인 시점"의 의미를 잃는다 — 비밀번호 변경 시각과 비교할
        // 고정된 로그인 시각을 별도 클레임으로 보관한다. user가 있을 때(=로그인 시점)만
        // 이 블록이 실행되므로, 이후 세션이 재발급되어도 이 값은 그대로 유지된다.
        token.loginAt = Math.floor(Date.now() / 1000)
      }
      return token
    },
    session: async ({ session, token }) => {
      if (session.user) {
        const sessionUser = session.user as {
          role?: string
          id?: string
          mustChangePassword?: boolean
          loginAt?: number
        }
        sessionUser.role = token.role as string
        sessionUser.id = token.id as string
        sessionUser.mustChangePassword = token.mustChangePassword as boolean
        sessionUser.loginAt = token.loginAt as number | undefined
      }
      return session
    },
  },
}
