import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '이용약관 | Koko',
  description: 'Koko 이용약관',
}

const sections = [
  {
    title: '1. 목적',
    body: [
      '본 약관은 Koko가 제공하는 가족 일정 및 리마인더 협업 서비스의 이용 조건과 절차, 이용자와 운영자의 권리 및 의무를 정하는 것을 목적으로 합니다.',
    ],
  },
  {
    title: '2. 서비스 내용',
    body: [
      'Koko는 가족 단위 일정 관리, 리마인더 목록 관리, 설정 관리, 초대 및 알림 기능을 제공합니다.',
      '서비스 내용은 운영상 필요에 따라 변경될 수 있습니다.',
    ],
  },
  {
    title: '3. 이용자 책임',
    body: [
      '이용자는 자신의 계정 및 인증 수단을 적절히 관리해야 하며, 타인의 권리를 침해하거나 서비스 운영을 방해하는 행위를 해서는 안 됩니다.',
    ],
  },
  {
    title: '4. 서비스 제한 및 중단',
    body: [
      '운영자는 시스템 점검, 장애 대응, 보안상 필요, 외부 플랫폼 정책 변경 등의 사유로 서비스의 일부 또는 전부를 제한하거나 중단할 수 있습니다.',
    ],
  },
  {
    title: '5. 면책',
    body: [
      '운영자는 천재지변, 외부 서비스 장애, 이용자 귀책 등 운영자가 합리적으로 통제할 수 없는 사유로 발생한 손해에 대해 책임을 지지 않습니다.',
    ],
  },
  {
    title: '6. 문의처',
    body: [
      '이메일: codingclef@gmail.com',
    ],
  },
]

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8">
        <p className="text-sm font-semibold text-accent-500">Koko</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 dark:text-stone-100">이용약관</h1>
        <p className="mt-3 text-sm leading-6 text-stone-500 dark:text-stone-400">
          시행일: 2026년 4월 11일
        </p>
        <p className="mt-6 text-sm leading-7 text-stone-600 dark:text-stone-300">
          본 약관은 Koko 서비스 이용과 관련한 기본 규칙을 안내합니다. 서비스를 이용하는 경우 본 약관에 동의한 것으로 봅니다.
        </p>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-stone-600 dark:text-stone-300">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
