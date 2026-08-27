import Image from 'next/image'
import { ThemeToggle } from '@/components/theme-toggle'

interface AuthLayoutProps {
  children: React.ReactNode
}

// 로그인/회원가입 화면이 공유하는 좌(브랜드 패널)/우(폼) 2단 레이아웃. 모바일에서는
// 세로로 쌓인다.
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <div className="flex flex-col justify-between gap-10 bg-card p-8 md:min-h-svh md:w-2/5 md:p-10">
        <div className="flex items-center gap-2">
          <Image
            src="/logo_icon.png"
            alt="연차관리시스템 로고"
            width={32}
            height={32}
            unoptimized
            className="rounded-[.25rem]"
          />
          <span className="text-lg font-semibold">연차관리시스템</span>
        </div>
        <blockquote className="hidden md:block">
          <p className="text-lg font-medium text-foreground">
            &ldquo;프리랜서 연차를 간편하게 관리하는 통합 시스템입니다.&rdquo;
          </p>
          <footer className="mt-2 text-sm text-muted-foreground">hubilon</footer>
        </blockquote>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}
