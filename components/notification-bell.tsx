'use client'

import { BellIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useNotifications } from '@/hooks/use-notifications'
import { NotificationItem } from '@/components/notification-item'

export function NotificationBell() {
  const { unreadCount, items, markAsRead, markAllAsRead } = useNotifications()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="알림">
          <BellIcon className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-sm font-semibold">알림</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={markAllAsRead}
            >
              모두 읽음
            </Button>
          )}
        </div>
        <Separator />
        {items.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">새 알림이 없습니다</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[360px]">
            <div className="flex flex-col gap-0.5 p-1">
              {items.map((item) => (
                <NotificationItem key={item.id} item={item} onRead={markAsRead} />
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  )
}
