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
