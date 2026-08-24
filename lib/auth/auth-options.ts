import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
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

        if (user.signupStatus !== 'APPROVED') {
          throw new Error('가입 승인 대기 중이거나 거절된 계정입니다.')
        }

        return { id: String(user.id), name: user.name, email: user.email, role: user.role }
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.role = (user as { role: string }).role
        token.id = (user as { id: string }).id
      }
      return token
    },
    session: async ({ session, token }) => {
      if (session.user) {
        ;(session.user as { role?: string; id?: string }).role = token.role as string
        ;(session.user as { role?: string; id?: string }).id = token.id as string
      }
      return session
    },
  },
}
