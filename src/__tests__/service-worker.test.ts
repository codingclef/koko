/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

type WorkerEvent = {
  data?: { json: () => Record<string, unknown> }
  waitUntil: (promise: Promise<unknown>) => void
}

describe('push service worker', () => {
  const listeners: Record<string, (event: WorkerEvent) => void> = {}
  const showNotification = jest.fn().mockResolvedValue(undefined)
  const skipWaiting = jest.fn().mockResolvedValue(undefined)
  const claim = jest.fn().mockResolvedValue(undefined)

  beforeAll(() => {
    const source = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8')
    const workerSelf = {
      addEventListener: (type: string, listener: (event: WorkerEvent) => void) => {
        listeners[type] = listener
      },
      skipWaiting,
      registration: { showNotification },
      location: { origin: 'https://koko.example.com' },
    }
    const workerClients = {
      claim,
      matchAll: jest.fn().mockResolvedValue([]),
      openWindow: jest.fn().mockResolvedValue(undefined),
    }

    new Function('self', 'clients', source)(workerSelf, workerClients)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('새 서비스 워커를 즉시 활성화한다', async () => {
    let installWork: Promise<unknown> = Promise.resolve()
    listeners.install({ waitUntil: (promise) => { installWork = promise } })
    await installWork

    let activateWork: Promise<unknown> = Promise.resolve()
    listeners.activate({ waitUntil: (promise) => { activateWork = promise } })
    await activateWork

    expect(skipWaiting).toHaveBeenCalledTimes(1)
    expect(claim).toHaveBeenCalledTimes(1)
  })

  it('tag가 없는 일정 알림은 기존 알림을 덮어쓰지 않는다', async () => {
    let pushWork: Promise<unknown> = Promise.resolve()
    listeners.push({
      data: { json: () => ({ title: '새 일정', body: '일정 내용', url: '/' }) },
      waitUntil: (promise) => { pushWork = promise },
    })
    await pushWork

    expect(showNotification).toHaveBeenCalledWith(
      '새 일정',
      expect.not.objectContaining({ tag: expect.anything() })
    )
  })

  it('명시한 tag는 일일 요약처럼 교체가 필요한 알림에 유지한다', async () => {
    let pushWork: Promise<unknown> = Promise.resolve()
    listeners.push({
      data: { json: () => ({ title: '오늘의 일정', tag: 'koko-daily-digest' }) },
      waitUntil: (promise) => { pushWork = promise },
    })
    await pushWork

    expect(showNotification).toHaveBeenCalledWith(
      '오늘의 일정',
      expect.objectContaining({ tag: 'koko-daily-digest' })
    )
  })
})
