'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { AuthLayout } from '@/components/auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const result = await signIn('credentials', { email, password, redirect: false })
    if (result?.error) {
      // NextAuth v5 beta는 authorize() 내부에서 던진 커스텀 메시지를 그대로 전달하지 않고
      // 일반화된 에러 코드로 치환하므로, 실패 케이스(비밀번호 오류/승인 대기/거절/퇴사)를
      // 하나의 안내 문구로 통합해 보여준다.
      setError('이메일/비밀번호가 올바르지 않거나, 가입 승인이 완료되지 않았습니다.')
      return
    }
    router.push('/dashboard')
  }

  return (
    <AuthLayout>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">관리자 로그인</h1>
        <p className="text-sm text-muted-foreground">이메일과 비밀번호를 입력해주세요</p>
      </div>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">비밀번호</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full">
          로그인
        </Button>
      </form>
      <div className="mt-6 space-y-4 text-center text-sm">
        <p className="text-muted-foreground">
          계정이 없으신가요?{' '}
          <Link href="/signup" className="font-medium text-foreground hover:underline">
            회원가입
          </Link>
        </p>
        <p className="text-xs text-muted-foreground">
          비밀번호를 잊으셨나요?
          <br />
          관리자(
          <a href="mailto:whynot@hubilon.com" className="font-medium text-foreground hover:underline">
            whynot@hubilon.com
          </a>
          )에게 메일로 문의하시면 초기화해드립니다.
        </p>
      </div>
    </AuthLayout>
  )
}
