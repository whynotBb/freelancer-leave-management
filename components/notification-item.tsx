'use client'

import { usePathname, useRouter } from 'next/navigation'
import {
  BellIcon,
  CheckCircleIcon,
  HistoryIcon,
  InboxIcon,
  SlidersHorizontalIcon,
  UserCogIcon,
  UserPlusIcon,
  XCircleIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NotificationItem as NotificationItemType } from '@/hooks/use-notifications'

const TYPE_CONFIG: Record<string, { icon: React.ElementType; href: string }> = {
  SIGNUP_PENDING: { icon: UserPlusIcon, href: '/admin/users-manage' },
  SIGNUP_APPROVED: { icon: CheckCircleIcon, href: '/dashboard' },
  SIGNUP_REJECTED: { icon: XCircleIcon, href: '/dashboard' },
  LEAVE_SUBMITTED: { icon: InboxIcon, href: '/approvals' },
  LEAVE_APPROVED: { icon: CheckCircleIcon, href: '/documents' },
  LEAVE_REJECTED: { icon: XCircleIcon, href: '/documents' },
  LEAVE_ADJUSTED: { icon: SlidersHorizontalIcon, href: '/documents' },
  APPROVER_CHANGED: { icon: UserCogIcon, href: '/documents' },
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

interface Props {
  item: NotificationItemType
  onRead: (id: number) => void
}

export function NotificationItem({ item, onRead }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const config = TYPE_CONFIG[item.type] ?? { icon: BellIcon, href: '/dashboard' }
  const Icon = config.icon

  function handleClick() {
    if (!item.read) onRead(item.id)

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('app:refresh-data'))
    }

    if (pathname === config.href) {
      router.refresh()
    } else {
      router.push(config.href)
    }
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent',
        !item.read && 'bg-accent/50'
      )}
    >
      <div
        className={cn(
          'mt-0.5 shrink-0 rounded-full p-1',
          !item.read ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
        )}
      >
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm leading-snug', !item.read && 'font-medium')}>
          {item.message}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatRelativeTime(item.createdAt)}
        </p>
      </div>
      {!item.read && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      )}
    </button>
  )
}
