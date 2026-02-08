import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'S4S Manager - Plush',
  description: 'Cross-promotional automation for OnlyFans',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
