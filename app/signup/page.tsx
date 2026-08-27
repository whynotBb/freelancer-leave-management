'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckIcon, CircleIcon } from 'lucide-react'
import { AuthLayout } from '@/components/auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { isValidPassword, PASSWORD_REQUIREMENTS } from '@/lib/domain/password-policy'

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const emailValid = email.length === 0 || EMAIL_FORMAT.test(email)
  const passwordValid = isValidPassword(password)
  const passwordConfirmMatches = passwordConfirm.length === 0 || passwordConfirm === password
  const canSubmit =
    name.trim().length > 0 &&
    EMAIL_FORMAT.test(email) &&
    passwordValid &&
    passwordConfirm.length > 0 &&
    passwordConfirm === password

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!canSubmit) return

    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? '가입 신청에 실패했습니다.')
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <AuthLayout>
        <div className="space-y-4 text-center">
          <p>가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.</p>
          <Button onClick={() => router.push('/login')}>로그인 화면으로</Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">회원가입 신청</h1>
        <p className="text-sm text-muted-foreground">아래 정보를 입력하여 계정을 만드세요</p>
      </div>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">이름</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={emailTouched && !emailValid}
            required
          />
          {emailTouched && !emailValid && (
            <p className="text-xs text-destructive">올바른 이메일 형식이 아닙니다.</p>
          )}
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
          <ul className="space-y-0.5 pt-1">
            {PASSWORD_REQUIREMENTS.map((req) => {
              const met = req.test(password)
              return (
                <li
                  key={req.key}
                  className={cn(
                    'flex items-center gap-1.5 text-xs',
                    met ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                  )}
                >
                  {met ? <CheckIcon className="size-3.5" /> : <CircleIcon className="size-3.5" />}
                  {req.label}
                </li>
              )
            })}
          </ul>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
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
        <Button type="submit" className="w-full" disabled={!canSubmit}>
          가입 신청
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          로그인
        </Link>
      </p>
    </AuthLayout>
  )
}
