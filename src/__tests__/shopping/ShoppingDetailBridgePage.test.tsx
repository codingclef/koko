import { render, waitFor } from '@testing-library/react'
import ShoppingDetailBridgePage from '@/app/shopping/[id]/page'

const mockReplace = jest.fn()
let mockId = 'list-1'

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: mockId }),
  useRouter: () => ({ replace: mockReplace }),
}))

describe('ShoppingDetailBridgePage', () => {
  beforeEach(() => {
    mockReplace.mockClear()
    mockId = 'list-1'
  })

  it('유효한 id면 canonical shopping detail URL로 전이한다', async () => {
    render(<ShoppingDetailBridgePage />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/calendar?tab=shopping&list=list-1', {
        scroll: false,
      })
    })
  })

  it('trim 후 빈 문자열이면 shopping 리스트 URL로 fallback 한다', async () => {
    mockId = '   '

    render(<ShoppingDetailBridgePage />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/calendar?tab=shopping', {
        scroll: false,
      })
    })
  })
})
