import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '퇴사자 관리',
}

export default function Layout({ children }: LayoutProps<'/admin/departures'>) {
  return children
}
