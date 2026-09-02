'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { CheckIcon } from 'lucide-react'
import { AuthLayout } from '@/components/auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { isValidPassword, PASSWORD_REQUIREMENTS } from '@/lib/domain/password-policy'

export default function ChangePasswordPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const mustChangePassword = (session?.user as { mustChangePassword?: boolean } | undefined)?.mustChangePassword

  // 강제 초기화 대상이 아닌 사용자가 URL을 직접 입력해 들어온 경우를 위한 UX 보완이다
  // (실제 보안 경계는 API 쪽의 mustChangePassword 검사).
  useEffect(() => {
    if (status === 'authenticated' && !mustChangePassword) {
      router.replace('/dashboard')
    }
  }, [status, mustChangePassword, router])

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

  if (status !== 'authenticated' || !mustChangePassword) {
    return null
  }

  return (
    <AuthLayout>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">비밀번호 변경</h1>
        <p className="text-sm text-muted-foreground">
          임시 비밀번호로 로그인하셨습니다.<br/>계속 이용하려면 새 비밀번호를 설정해 주세요.
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
