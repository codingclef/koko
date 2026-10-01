/**
 * @jest-environment node
 */
import { dispatchPushNotifications } from '@/lib/push-utils'

const mockRpc = jest.fn()
const mockFrom = jest.fn()
const mockSend = jest.fn()
jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { rpc: (...args: unknown[]) => mockRpc(...args), from: (...args: unknown[]) => mockFrom(...args) },
}))
jest.mock('@/lib/webpush', () => ({ __esModule: true, default: { sendNotification: (...args: unknown[]) => mockSend(...args) } }))

const subscriptions = ['active', 'revoked'].map((id) => ({ id, endpoint: `https://push.example/${id}`, p256dh: 'key', auth: 'auth' }))
beforeEach(() => {
  jest.clearAllMocks()
  mockRpc.mockResolvedValue({ data: ['active'], error: null })
  mockSend.mockResolvedValue({ statusCode: 201 })
  mockFrom.mockReturnValue({ update: jest.fn().mockReturnThis(), in: jest.fn().mockResolvedValue({ error: null }) })
})

it('권한이 회수된 구독은 발송/삭제하지 않고 활성 구독만 발송한다', async () => {
  expect(await dispatchPushNotifications(subscriptions, 'payload')).toEqual({ sent: 1, removed: 0, failed: 0 })
  expect(mockRpc).toHaveBeenCalledWith('get_active_push_subscription_ids', { p_subscription_ids: ['active', 'revoked'] })
  expect(mockSend).toHaveBeenCalledTimes(1)
  expect(mockSend.mock.calls[0][0].endpoint).toBe('https://push.example/active')
  expect(mockFrom().in).toHaveBeenCalledWith('id', ['active'])
})

it('전체 구독이 회수되면 발송이나 구독 변경을 하지 않는다', async () => {
  mockRpc.mockResolvedValue({ data: [], error: null })
  expect(await dispatchPushNotifications(subscriptions, 'payload')).toEqual({ sent: 0, removed: 0, failed: 0 })
  expect(mockSend).not.toHaveBeenCalled()
  expect(mockFrom).not.toHaveBeenCalled()
})

it('권한 조회 실패 시 발송을 중단한다', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'DB unavailable' } })
  await expect(dispatchPushNotifications(subscriptions, 'payload')).rejects.toThrow('Push recipient access lookup failed')
  expect(mockSend).not.toHaveBeenCalled()
  expect(mockFrom).not.toHaveBeenCalled()
})

it('구독이 없으면 추가 조회를 하지 않는다', async () => {
  expect(await dispatchPushNotifications([], 'payload')).toEqual({ sent: 0, removed: 0, failed: 0 })
  expect(mockRpc).not.toHaveBeenCalled()
})
