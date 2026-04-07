/**
 * @jest-environment jsdom
 */
import { registerPushSubscription } from '@/lib/push'

const mockPostJsonWithAuth = jest.fn()

jest.mock('@/lib/api-client', () => ({
  postJsonWithAuth: (...args: unknown[]) => mockPostJsonWithAuth(...args),
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
  mockPostJsonWithAuth.mockResolvedValue(undefined)

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
    value: { permission: 'default', requestPermission: jest.fn().mockResolvedValue('granted') },
    configurable: true,
  })

})

describe('registerPushSubscription', () => {
  it('기존 구독이 있으면 재구독 없이 서버로 전송한다', async () => {
    const mockSub = { toJSON: () => mockSubscriptionJSON }
    mockGetSubscription.mockResolvedValue(mockSub)

    await registerPushSubscription('user-1')

    expect(mockSubscribe).not.toHaveBeenCalled()
    expect(mockPostJsonWithAuth).toHaveBeenCalledWith(
      '/api/push/subscribe',
      expect.objectContaining({
        endpoint: mockSubscriptionJSON.endpoint,
        p256dh: mockSubscriptionJSON.keys.p256dh,
        auth: mockSubscriptionJSON.keys.auth,
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
    expect(mockPostJsonWithAuth).toHaveBeenCalled()
  })

  it('이미 알림이 허용되어 있으면 권한 요청 없이 서버로 전송한다', async () => {
    const mockSub = { toJSON: () => mockSubscriptionJSON }
    mockGetSubscription.mockResolvedValue(mockSub)
    const requestPermission = jest.fn()

    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted', requestPermission },
      configurable: true,
    })

    await registerPushSubscription('user-1')

    expect(requestPermission).not.toHaveBeenCalled()
    expect(mockPostJsonWithAuth).toHaveBeenCalled()
  })

  it('알림 권한 거부 시 fetch를 호출하지 않는다', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'default', requestPermission: jest.fn().mockResolvedValue('denied') },
      configurable: true,
    })

    await registerPushSubscription('user-1')

    expect(mockPostJsonWithAuth).not.toHaveBeenCalled()
  })

  it('Notification 미지원 환경에서는 아무것도 하지 않는다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).Notification

    await registerPushSubscription('user-1')

    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('PushManager 미지원 환경에서는 아무것도 하지 않는다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).PushManager

    await registerPushSubscription('user-1')

    expect(mockRegister).not.toHaveBeenCalled()
  })
})
