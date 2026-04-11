import { render, screen } from '@testing-library/react'
import PrivacyPage from '@/app/privacy/page'
import TermsPage from '@/app/terms/page'

describe('Legal pages', () => {
  it('renders the privacy policy page', () => {
    render(<PrivacyPage />)

    expect(screen.getByRole('heading', { name: '개인정보처리방침' })).toBeInTheDocument()
    expect(screen.getByText('이메일: codingclef@gmail.com')).toBeInTheDocument()
  })

  it('renders the terms page', () => {
    render(<TermsPage />)

    expect(screen.getByRole('heading', { name: '이용약관' })).toBeInTheDocument()
    expect(screen.getByText('이메일: codingclef@gmail.com')).toBeInTheDocument()
  })
})
