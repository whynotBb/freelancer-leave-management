'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
  MoreVerticalIcon,
  LogOutIcon,
  LayoutDashboardIcon,
  FileTextIcon,
  InboxIcon,
  UserCheckIcon,
  UsersIcon,
  ShieldIcon,
  KeyRoundIcon,
  HomeIcon,
  CircleHelpIcon,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
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
  useSidebar,
} from '@/components/ui/sidebar'

// 공통 메뉴: 아직 Task 18~22가 구현되지 않아 대상 페이지가 없다(임시 404, 정상 — 브리프 참고).
const COMMON_LINKS = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboardIcon },
  { href: '/documents', label: '내 문서', icon: FileTextIcon },
  { href: '/approvals', label: '결재함', icon: InboxIcon },
]

// 관리자 전용 메뉴: 실제로 페이지가 존재하는 항목만 나열한다. Task 15(공휴일 관리),
// Task 24(연차 수동 조정)가 구현되면 이 배열에 항목을 추가한다.
const ADMIN_LINKS = [
  { href: '/admin/signups', label: '가입 승인', icon: UserCheckIcon },
  { href: '/admin/users', label: '프리랜서 정보 관리', icon: UsersIcon },
]

// 로그인/회원가입 화면은 비인증 화면 전용 카드 레이아웃(Task 13.6)을 그대로 써야 하므로,
// 세션이 남아있는 상태로 이 경로에 진입해도(뒤로가기, 남은 세션의 탭 재방문 등) 사이드바
// 셸을 절대 씌우지 않는다 — 세션 유무가 아니라 경로 자체로 판단한다.
const NO_CHROME_ROUTES = ['/login', '/signup']

const ALL_LINKS = [...COMMON_LINKS, ...ADMIN_LINKS]

function getPageTitle(pathname: string | null) {
  if (!pathname) return ''
  return ALL_LINKS.find((link) => pathname.startsWith(link.href))?.label ?? ''
}

function getInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase()
}

function getRoleLabel(role: string | undefined) {
  return role === 'ADMIN' ? '관리자' : '프리랜서'
}

export function AppSidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { isMobile, setOpenMobile } = useSidebar()

  if (!session?.user) return null
  const role = (session.user as { role?: string }).role

  function closeOnMobile() {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <Image
            src="/logo_icon.png"
            alt="연차관리시스템 로고"
            width={32}
            height={32}
            unoptimized
            className="rounded-[.25rem]"
          />
          <div className="grid leading-tight">
            <span className="text-sm font-semibold">연차관리시스템</span>
            <span className="text-xs text-muted-foreground/60">hubilon</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {COMMON_LINKS.map((link) => (
                <SidebarMenuItem key={link.href}>
                  <SidebarMenuButton
                    render={<Link href={link.href} />}
                    isActive={pathname?.startsWith(link.href)}
                    onClick={closeOnMobile}
                  >
                    <link.icon />
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
              <SidebarMenu className="gap-1">
                {ADMIN_LINKS.map((link) => (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton
                      render={<Link href={link.href} />}
                      isActive={pathname?.startsWith(link.href)}
                      onClick={closeOnMobile}
                    >
                      <link.icon />
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
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                <Avatar className="rounded-lg">
                  <AvatarFallback className="rounded-lg">
                    {getInitial(session.user.name ?? session.user.email ?? '?')}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{session.user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{session.user.email}</span>
                </div>
                <MoreVerticalIcon className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-(--anchor-width) min-w-56">
                <div className="flex items-center gap-2 px-1.5 py-1.5 text-sm">
                  <Avatar className="rounded-lg">
                    <AvatarFallback className="rounded-lg">
                      {getInitial(session.user.name ?? session.user.email ?? '?')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-medium">{session.user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{session.user.email}</span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <ShieldIcon />
                  {getRoleLabel(role)}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* TODO: 비밀번호 재설정 폼/API는 아직 없음 — UI만 우선 배치, 추후 연결 */}
                <DropdownMenuItem>
                  <KeyRoundIcon />
                  비밀번호 재설정
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => signOut({ callbackUrl: '/login' })}>
                  <LogOutIcon />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 bg-background px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={<Link href="/dashboard" />}
                  className="flex items-center gap-1 font-normal text-muted-foreground/60 hover:text-foreground"
                >
                  <HomeIcon className="size-4" />
                  홈
                </BreadcrumbLink>
              </BreadcrumbItem>
              {pathname !== '/dashboard' && (
                <>
                  <BreadcrumbSeparator className="text-muted-foreground/60" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{getPageTitle(pathname)}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-1">
            {/* 도움말: 개발 완료 후 react-joyride 가이드 투어 연결 예정, 지금은 아이콘만 배치 */}
            <Button variant="ghost" size="icon" aria-label="도움말">
              <CircleHelpIcon className="size-4" />
            </Button>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
