import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '변경 이력',
}

export default function Layout({ children }: LayoutProps<'/admin/history'>) {
  return children
}
