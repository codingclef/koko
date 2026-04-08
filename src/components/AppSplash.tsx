import Image from 'next/image'

export function AppSplash() {
  return (
    <div role="status" aria-label="앱을 불러오는 중" className="fixed inset-0 flex items-center justify-center bg-[var(--background)]">
      <div className="rounded-full bg-[var(--surface-overlay)] ring-1 ring-[var(--surface-ring)] p-6">
        <Image
          src="/logo.webp"
          alt="Koko"
          width={96}
          height={96}
          priority
        />
      </div>
    </div>
  )
}
