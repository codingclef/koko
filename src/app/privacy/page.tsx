import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '개인정보처리방침 | Koko',
  description: 'Koko 개인정보처리방침',
}

const sections = [
  {
    title: '1. 수집하는 정보',
    body: [
      'Koko는 Google 로그인 과정에서 계정 식별을 위한 기본 프로필 정보와 이메일 주소를 수집합니다.',
      '서비스 사용 과정에서 가족 정보, 일정, 장보기 목록, 사용자 설정, 알림 구독 정보가 저장될 수 있습니다.',
    ],
  },
  {
    title: '2. 정보의 이용 목적',
    body: [
      '수집한 정보는 가족 구성원 식별, 일정 및 장보기 데이터 동기화, 알림 제공, 서비스 운영과 보안 유지 목적으로 사용합니다.',
    ],
  },
  {
    title: '3. 보관 기간',
    body: [
      '서비스 데이터는 사용자가 직접 삭제하거나 서비스 운영이 종료될 때까지 보관될 수 있습니다.',
      '관련 법령상 보존이 필요한 정보가 있는 경우에는 해당 기간 동안 별도로 보관합니다.',
    ],
  },
  {
    title: '4. 제3자 제공 및 처리 위탁',
    body: [
      'Koko는 서비스 제공을 위해 Google OAuth, Supabase, Vercel 등 외부 인프라를 사용할 수 있습니다.',
      '법령에 근거한 경우를 제외하고, 이용자의 개인정보를 임의로 제3자에게 판매하거나 제공하지 않습니다.',
    ],
  },
  {
    title: '5. 이용자 권리',
    body: [
      '이용자는 자신의 개인정보에 대한 열람, 수정, 삭제를 요청할 수 있습니다.',
      '문의가 필요한 경우 아래 연락처로 요청할 수 있습니다.',
    ],
  },
  {
    title: '6. 문의처',
    body: [
      '이메일: codingclef@gmail.com',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8">
        <p className="text-sm font-semibold text-accent-500">Koko</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 dark:text-stone-100">개인정보처리방침</h1>
        <p className="mt-3 text-sm leading-6 text-stone-500 dark:text-stone-400">
          시행일: 2026년 4월 11일
        </p>
        <p className="mt-6 text-sm leading-7 text-stone-600 dark:text-stone-300">
          Koko는 가족 일정 및 장보기 협업 서비스를 제공하기 위해 필요한 최소한의 개인정보를 처리합니다.
          본 방침은 Koko 서비스에서 수집하는 정보와 이용 목적, 보관 및 보호 방식에 대해 설명합니다.
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
