/**
 * @jest-environment jsdom
 */
import {
  registerPushSubscription,
  repairPushSubscription,
  syncPushSubscriptionIfGranted,
} from '@/lib/push'

const mockPostJsonWithAuth = jest.fn()

jest.mock('@/lib/api-client', () => ({
  postJsonWithAuth: (...args: unknown[]) => mockPostJsonWithAuth(...args),
}))

const mockGetSubscription = jest.fn()
const mockSubscribe = jest.fn()
const mockRegister = jest.fn()
const mockUnsubscribe = jest.fn()

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
  mockUnsubscribe.mockResolvedValue(true)

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

    await registerPushSubscription()

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

    await registerPushSubscription()

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

    await registerPushSubscription()

    expect(requestPermission).not.toHaveBeenCalled()
    expect(mockPostJsonWithAuth).toHaveBeenCalled()
  })

  it('알림 권한 거부 시 fetch를 호출하지 않는다', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'default', requestPermission: jest.fn().mockResolvedValue('denied') },
      configurable: true,
    })

    await registerPushSubscription()

    expect(mockPostJsonWithAuth).not.toHaveBeenCalled()
  })

  it('Notification 미지원 환경에서는 아무것도 하지 않는다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).Notification

    await registerPushSubscription()

    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('PushManager 미지원 환경에서는 아무것도 하지 않는다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).PushManager

    await registerPushSubscription()

    expect(mockRegister).not.toHaveBeenCalled()
  })
})

describe('syncPushSubscriptionIfGranted', () => {
  it('권한이 default이면 권한 요청이나 서비스 워커 등록을 하지 않는다', async () => {
    const status = await syncPushSubscriptionIfGranted()

    expect(status).toBe('permission-required')
    expect(Notification.requestPermission).not.toHaveBeenCalled()
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('허용된 기존 구독을 현재 로그인 계정에 다시 저장한다', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted', requestPermission: jest.fn() },
      configurable: true,
    })
    mockGetSubscription.mockResolvedValue({ toJSON: () => mockSubscriptionJSON })

    const status = await syncPushSubscriptionIfGranted()

    expect(status).toBe('connected')
    expect(mockSubscribe).not.toHaveBeenCalled()
    expect(mockPostJsonWithAuth).toHaveBeenCalledWith(
      '/api/push/subscribe',
      expect.objectContaining({ endpoint: mockSubscriptionJSON.endpoint })
    )
  })

  it('권한은 허용됐지만 구독이 없으면 새 구독을 만든다', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted', requestPermission: jest.fn() },
      configurable: true,
    })
    mockGetSubscription.mockResolvedValue(null)
    mockSubscribe.mockResolvedValue({ toJSON: () => mockSubscriptionJSON })

    expect(await syncPushSubscriptionIfGranted()).toBe('connected')
    expect(mockSubscribe).toHaveBeenCalledTimes(1)
    expect(mockPostJsonWithAuth).toHaveBeenCalledTimes(1)
  })

  it('동시에 시작된 동기화는 하나의 구독 요청을 공유한다', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted', requestPermission: jest.fn() },
      configurable: true,
    })
    let resolveSubscription!: (subscription: { toJSON: () => typeof mockSubscriptionJSON }) => void
    mockGetSubscription.mockReturnValue(new Promise((resolve) => {
      resolveSubscription = resolve
    }))

    const first = syncPushSubscriptionIfGranted()
    const second = syncPushSubscriptionIfGranted()
    resolveSubscription({ toJSON: () => mockSubscriptionJSON })

    await expect(Promise.all([first, second])).resolves.toEqual(['connected', 'connected'])
    expect(mockRegister).toHaveBeenCalledTimes(1)
    expect(mockGetSubscription).toHaveBeenCalledTimes(1)
    expect(mockPostJsonWithAuth).toHaveBeenCalledTimes(1)
  })
})

describe('repairPushSubscription', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted', requestPermission: jest.fn() },
      configurable: true,
    })
  })

  it('기존 구독을 해제한 뒤 새 endpoint를 저장한다', async () => {
    const existing = {
      endpoint: mockSubscriptionJSON.endpoint,
      toJSON: () => mockSubscriptionJSON,
      unsubscribe: mockUnsubscribe,
    }
    const replacementJSON = {
      endpoint: 'https://push.example.com/replacement',
      keys: { p256dh: 'new-p256dh', auth: 'new-auth' },
    }
    mockGetSubscription.mockResolvedValue(existing)
    mockSubscribe.mockResolvedValue({ toJSON: () => replacementJSON })

    expect(await repairPushSubscription()).toBe('connected')
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
    expect(mockSubscribe).toHaveBeenCalledTimes(1)
    expect(mockPostJsonWithAuth).toHaveBeenCalledWith(
      '/api/push/subscribe',
      expect.objectContaining({
        endpoint: replacementJSON.endpoint,
        previousEndpoint: mockSubscriptionJSON.endpoint,
      })
    )
  })

  it('기존 구독 해제 실패 시 새 구독을 만들지 않는다', async () => {
    mockUnsubscribe.mockResolvedValue(false)
    mockGetSubscription.mockResolvedValue({
      endpoint: mockSubscriptionJSON.endpoint,
      toJSON: () => mockSubscriptionJSON,
      unsubscribe: mockUnsubscribe,
    })

    await expect(repairPushSubscription()).rejects.toThrow(
      'Failed to unsubscribe stale push subscription'
    )
    expect(mockSubscribe).not.toHaveBeenCalled()
    expect(mockPostJsonWithAuth).not.toHaveBeenCalled()
  })
})
