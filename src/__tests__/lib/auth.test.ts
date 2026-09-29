import { parseInviteCodeFromNext, safeNextPath } from '@/lib/auth'

describe('safeNextPath', () => {
  it('초대 경로와 쿼리를 유지한다', () => {
    expect(safeNextPath('/join?code=ABC123')).toBe('/join?code=ABC123')
    expect(safeNextPath('/join-app?code=APP123')).toBe('/join-app?code=APP123')
  })

  it.each([null, '', 'javascript:alert(1)', '//evil.example', '/\\evil.example', '/join\n?code=ABC123'])(
    '외부 또는 잘못된 경로 %s를 기본 경로로 바꾼다',
    (next) => expect(safeNextPath(next)).toBe('/calendar')
  )
})

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
    expect(parseInviteCodeFromNext('/reminders')).toBeNull()
    expect(parseInviteCodeFromNext('/join')).toBeNull()
    expect(parseInviteCodeFromNext('')).toBeNull()
  })
})
