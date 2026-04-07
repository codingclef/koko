/**
 * @jest-environment jsdom
 */
import { registerPushSubscription } from '@/lib/push'

const mockGetAuthHeaders = jest.fn()

jest.mock('@/lib/api-client', () => ({
  getAuthHeaders: (...args: unknown[]) => mockGetAuthHeaders(...args),
}))

const mockGetSubscription = jest.fn()
const mockSubscribe = jest.fn()
const mockRegister = jest.fn()

const mockSubscriptionJSON = {
  endpoint: 'https://push.example.com/sub',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
}

const mockPushManager = {
  getSubscription: mockGetSubscription,
  subscribe: mockSubscribe,
}

const mockRegistration = {
  pushManager: mockPushManager,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer token' })

  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
    'BDiltY7dC3CnNxamlejehgdculV7iorzypDSV1a2GDFc2d2FQoYyXcl_6J76J3HT-kTqQ7zB5hSNoKeTHxw_KvY'

  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      register: mockRegister.mockResolvedValue(mockRegistration),
      ready: Promise.resolve(mockRegistration),
    },
    configurable: true,
  })

  Object.defineProperty(window, 'PushManager', { value: class {}, configurable: true })

  Object.defineProperty(window, 'Notification', {
    value: { requestPermission: jest.fn().mockResolvedValue('granted') },
    configurable: true,
  })

  global.fetch = jest.fn().mockResolvedValue({ ok: true })
})

describe('registerPushSubscription', () => {
  it('기존 구독이 있으면 재구독 없이 서버로 전송한다', async () => {
    const mockSub = { toJSON: () => mockSubscriptionJSON }
    mockGetSubscription.mockResolvedValue(mockSub)

    await registerPushSubscription('user-1')

    expect(mockSubscribe).not.toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/push/subscribe',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        }),
      })
    )
  })

  it('구독이 없으면 새로 구독 후 서버로 전송한다', async () => {
    mockGetSubscription.mockResolvedValue(null)
    const mockSub = { toJSON: () => mockSubscriptionJSON }
    mockSubscribe.mockResolvedValue(mockSub)

    await registerPushSubscription('user-1')

    expect(mockSubscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true })
    )
    expect(global.fetch).toHaveBeenCalled()
  })

  it('알림 권한 거부 시 fetch를 호출하지 않는다', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { requestPermission: jest.fn().mockResolvedValue('denied') },
      configurable: true,
    })

    await registerPushSubscription('user-1')

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('PushManager 미지원 환경에서는 아무것도 하지 않는다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).PushManager

    await registerPushSubscription('user-1')

    expect(mockRegister).not.toHaveBeenCalled()
  })
})
