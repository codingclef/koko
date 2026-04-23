/**
 * @jest-environment node
 */
import { GET } from '@/app/api/holidays/route'
import { NextRequest } from 'next/server'
import { clearKasiHolidayCache } from '@/lib/kasi-holidays'

const mockGetAuthenticatedUser = jest.fn()

jest.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (...args: unknown[]) => mockGetAuthenticatedUser(...args),
}))

function makeRequest(url: string) {
  return new NextRequest(url, {
    method: 'GET',
    headers: { Authorization: 'Bearer token-123' },
  })
}

beforeEach(() => {
  jest.restoreAllMocks()
  clearKasiHolidayCache()
  mockGetAuthenticatedUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
  global.fetch = jest.fn()
  process.env.KASI_HOLIDAY_API_KEY = 'test-key'
  process.env.KASI_HOLIDAY_API_KEY_EXPIRES_AT = '2028-04-23'
})

describe('GET /api/holidays', () => {
  it('인증 사용자가 없으면 401을 반환한다', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null)
    const res = await GET(makeRequest('http://localhost/api/holidays?year=2026&month=4&countries=KR'))
    expect(res.status).toBe(401)
  })

  it('year/month가 누락되면 400을 반환한다', async () => {
    const res = await GET(makeRequest('http://localhost/api/holidays?countries=KR'))
    expect(res.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('year/month가 잘못되면 400을 반환한다', async () => {
    const res = await GET(makeRequest('http://localhost/api/holidays?year=2026&month=12&countries=KR'))
    expect(res.status).toBe(400)
  })

  it('지원하지 않는 연도는 400을 반환한다', async () => {
    const res = await GET(makeRequest('http://localhost/api/holidays?year=2050&month=4&countries=KR'))
    expect(res.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('지원하지 않는 국가는 400을 반환한다', async () => {
    const res = await GET(makeRequest('http://localhost/api/holidays?year=2026&month=4&countries=US'))
    expect(res.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('KASI KR 휴일을 정규화해서 반환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
          body: {
            items: {
              item: [
                { dateName: '노동절', isHoliday: 'Y', locdate: 20260501 },
                { dateName: '기독탄신일', isHoliday: 'Y', locdate: 20261225 },
                { dateName: '테스트', isHoliday: 'N', locdate: 20260502 },
              ],
            },
          },
        },
      }),
    } as Response)

    const res = await GET(makeRequest('http://localhost/api/holidays?year=2026&month=4&countries=KR'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.holidays).toContainEqual({
      date: '2026-05-01',
      localName: '노동절',
      countryCode: 'KR',
    })
    expect(body.holidays).not.toContainEqual(expect.objectContaining({ date: '2026-05-02' }))
  })

  it('KASI 호출 실패 시 로컬 KR fallback을 반환한다', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response)

    const res = await GET(makeRequest('http://localhost/api/holidays?year=2026&month=2&countries=KR'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.holidays).toContainEqual(expect.objectContaining({
      date: '2026-03-01',
      countryCode: 'KR',
    }))
  })
})
