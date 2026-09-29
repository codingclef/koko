/**
 * next 파라미터(/join?code=ABC123)에서 초대 코드를 추출한다.
 * 초대 코드가 없으면 null 반환.
 */
export function parseInviteCodeFromNext(next: string): string | null {
  const match = next.match(/[?&]code=([A-Z0-9]+)/i)
  return match?.[1]?.toUpperCase() ?? null
}

export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(next)) {
    return '/calendar'
  }
  return next
}
