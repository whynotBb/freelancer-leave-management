'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

// 공통 메뉴: 아직 Task 18~22가 구현되지 않아 대상 페이지가 없다(임시 404, 정상 — 브리프 참고).
const COMMON_LINKS = [
  { href: '/dashboard', label: '대시보드' },
  { href: '/documents', label: '내 문서' },
  { href: '/approvals', label: '결재함' },
]

// 관리자 전용 메뉴: 실제로 페이지가 존재하는 항목만 나열한다. Task 15(공휴일 관리),
// Task 24(연차 수동 조정)가 구현되면 이 배열에 항목을 추가한다.
const ADMIN_LINKS = [
  { href: '/admin/signups', label: '가입 승인' },
  { href: '/admin/users', label: '프리랜서 정보 관리' },
]

// 로그인/회원가입 화면은 비인증 화면 전용 카드 레이아웃(Task 13.6)을 그대로 써야 하므로,
// 세션이 남아있는 상태로 이 경로에 진입해도(뒤로가기, 남은 세션의 탭 재방문 등) 사이드바
// 셸을 절대 씌우지 않는다 — 세션 유무가 아니라 경로 자체로 판단한다.
const NO_CHROME_ROUTES = ['/login', '/signup']

export function AppSidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()

  if (!session?.user) return null
  const role = (session.user as { role?: string }).role

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-1 text-sm font-semibold">휴가관리시스템</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {COMMON_LINKS.map((link) => (
                <SidebarMenuItem key={link.href}>
                  <SidebarMenuButton
                    render={<Link href={link.href} />}
                    isActive={pathname?.startsWith(link.href)}
                  >
                    {link.label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {role === 'ADMIN' && (
          <SidebarGroup>
            <SidebarGroupLabel>관리자 메뉴</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ADMIN_LINKS.map((link) => (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton
                      render={<Link href={link.href} />}
                      isActive={pathname?.startsWith(link.href)}
                    >
                      {link.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-1 text-xs text-muted-foreground">
          {session.user.name} ({session.user.email})
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => signOut({ callbackUrl: '/login' })}>
              로그아웃
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

// 루트 레이아웃(서버 컴포넌트)은 useSession을 직접 쓸 수 없으므로, 로그인 여부에 따라
// 사이드바 셸을 씌울지 결정하는 역할을 이 클라이언트 컴포넌트가 담당한다.
// 세션이 없으면(=/login, /signup) children을 그대로 반환해 Task 13.6의 카드 중앙 정렬
// 레이아웃이 깨지지 않도록 한다. /login, /signup은 세션이 남아있는 상태(뒤로가기, 남은
// 세션의 탭 재방문 등)로 진입해도 항상 사이드바 없이 보여야 하므로 경로도 함께 확인한다.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()

  if (!session?.user || NO_CHROME_ROUTES.includes(pathname ?? '')) {
    return <>{children}</>
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <SidebarTrigger />
        </header>
        <main className="p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
