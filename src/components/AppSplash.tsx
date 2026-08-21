import Image from 'next/image'

interface Props {
  animateLogo?: boolean
}

export function AppSplash({ animateLogo = false }: Props) {
  return (
    <div role="status" aria-label="앱을 불러오는 중" className="fixed inset-0 flex items-center justify-center bg-[var(--background)]">
      <Image
        src="/logo.webp"
        alt=""
        width={96}
        height={96}
        priority
        className={animateLogo ? 'splash-logo-fade-in' : undefined}
      />
    </div>
  )
}
