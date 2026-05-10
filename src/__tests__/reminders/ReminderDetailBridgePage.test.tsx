import { render, waitFor } from '@testing-library/react'
import ReminderDetailBridgePage from '@/app/reminders/[id]/page'

const mockReplace = jest.fn()
let mockId = 'list-1'

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: mockId }),
  useRouter: () => ({ replace: mockReplace }),
}))

describe('ReminderDetailBridgePage', () => {
  beforeEach(() => {
    mockReplace.mockClear()
    mockId = 'list-1'
  })

  it('유효한 id면 canonical reminder detail URL로 전이한다', async () => {
    render(<ReminderDetailBridgePage />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/calendar?tab=reminders&list=list-1', {
        scroll: false,
      })
    })
  })

  it('trim 후 빈 문자열이면 reminder 리스트 URL로 fallback 한다', async () => {
    mockId = '   '

    render(<ReminderDetailBridgePage />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/calendar?tab=reminders', {
        scroll: false,
      })
    })
  })
})
