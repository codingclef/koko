import { parseInviteCodeFromNext } from '@/lib/auth'

describe('parseInviteCodeFromNext', () => {
  it('초대 코드가 있으면 대문자로 반환', () => {
    expect(parseInviteCodeFromNext('/join?code=ABC123')).toBe('ABC123')
  })

  it('소문자 코드도 대문자로 변환', () => {
    expect(parseInviteCodeFromNext('/join?code=abc123')).toBe('ABC123')
  })

  it('다른 쿼리 파라미터와 함께 있어도 추출', () => {
    expect(parseInviteCodeFromNext('/join?foo=bar&code=XYZ999')).toBe('XYZ999')
  })

  it('초대 코드 없으면 null 반환', () => {
    expect(parseInviteCodeFromNext('/shopping')).toBeNull()
    expect(parseInviteCodeFromNext('/join')).toBeNull()
    expect(parseInviteCodeFromNext('')).toBeNull()
  })
})
