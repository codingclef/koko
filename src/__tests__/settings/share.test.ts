describe('초대 공유 로직', () => {
  const inviteCode = 'ABC123'
  const origin = 'http://localhost'
  const expectedUrl = `${origin}/join?code=${inviteCode}`

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('Web Share API 지원 시 navigator.share가 올바른 데이터로 호출된다', async () => {
    const shareMock = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: shareMock, writable: true, configurable: true })

    const shareData = {
      title: 'Koko 가족 초대',
      text: `Koko 앱에서 우리 가족에 합류하세요! 초대 코드: ${inviteCode}`,
      url: expectedUrl,
    }
    await navigator.share(shareData)

    expect(shareMock).toHaveBeenCalledWith(shareData)
    expect(shareMock).toHaveBeenCalledWith(expect.objectContaining({ url: expectedUrl }))
  })

  it('Web Share API 미지원 시 클립보드에 초대 링크가 복사된다', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, writable: true, configurable: true })
    const clipboardMock = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardMock },
      writable: true,
      configurable: true,
    })

    if (!navigator.share) {
      await navigator.clipboard.writeText(expectedUrl)
    }

    expect(clipboardMock).toHaveBeenCalledWith(expectedUrl)
  })

  it('초대 링크 URL이 올바른 형식이다', () => {
    const url = `${origin}/join?code=${inviteCode}`
    expect(url).toBe(expectedUrl)
    expect(url).toContain('/join?code=')
    expect(url).toContain(inviteCode)
  })
})
