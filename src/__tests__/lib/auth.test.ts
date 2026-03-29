import { isEmailAllowed } from '@/lib/auth'

describe('isEmailAllowed', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    process.env = { ...OLD_ENV }
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  it('환경변수 미설정 시 모든 이메일 허용', () => {
    delete process.env.NEXT_PUBLIC_ALLOWED_EMAILS
    expect(isEmailAllowed('anyone@gmail.com')).toBe(true)
  })

  it('환경변수가 빈 문자열이면 모든 이메일 허용', () => {
    process.env.NEXT_PUBLIC_ALLOWED_EMAILS = ''
    expect(isEmailAllowed('anyone@gmail.com')).toBe(true)
  })

  it('허용 목록에 있는 이메일 허용', () => {
    process.env.NEXT_PUBLIC_ALLOWED_EMAILS = 'family1@gmail.com,family2@gmail.com'
    expect(isEmailAllowed('family1@gmail.com')).toBe(true)
    expect(isEmailAllowed('family2@gmail.com')).toBe(true)
  })

  it('허용 목록에 없는 이메일 거부', () => {
    process.env.NEXT_PUBLIC_ALLOWED_EMAILS = 'family1@gmail.com'
    expect(isEmailAllowed('stranger@gmail.com')).toBe(false)
  })

  it('대소문자 구분 없이 비교', () => {
    process.env.NEXT_PUBLIC_ALLOWED_EMAILS = 'Family@Gmail.com'
    expect(isEmailAllowed('family@gmail.com')).toBe(true)
    expect(isEmailAllowed('FAMILY@GMAIL.COM')).toBe(true)
  })

  it('목록 앞뒤 공백 무시', () => {
    process.env.NEXT_PUBLIC_ALLOWED_EMAILS = '  family@gmail.com  ,  other@gmail.com  '
    expect(isEmailAllowed('family@gmail.com')).toBe(true)
    expect(isEmailAllowed('other@gmail.com')).toBe(true)
  })
})
