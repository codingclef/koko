import {
  getShoppingLists,
  createShoppingList,
  deleteShoppingList,
  getShoppingItems,
  addShoppingItem,
  checkShoppingItem,
  deleteShoppingItem,
  renameShoppingList,
  renameShoppingItem,
  reorderShoppingLists,
  reorderShoppingItems,
} from '@/lib/shopping'

// Supabase 체이닝 쿼리 빌더 목업 팩토리
function makeChain(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result)
  const chain: Record<string, unknown> = {}
  ;['select', 'insert', 'update', 'delete', 'eq', 'ilike', 'order'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain)
  })
  chain.single = jest.fn().mockReturnValue(p)
  chain.maybeSingle = jest.fn().mockReturnValue(p)
  ;(chain as { then: unknown }).then = p.then.bind(p)
  ;(chain as { catch: unknown }).catch = p.catch.bind(p)
  ;(chain as { finally: unknown }).finally = p.finally.bind(p)
  return chain
}

const mockFrom = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))
})

describe('getShoppingLists', () => {
  it('정렬된 리스트를 반환한다', async () => {
    const mockData = [{ id: 'list-1', name: '이마트', sort_order: 0 }]
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getShoppingLists('fam-1')
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('shopping_lists')
  })

  it('data가 null이면 빈 배열을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const result = await getShoppingLists('fam-1')
    expect(result).toEqual([])
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'DB error' } }))
    await expect(getShoppingLists('fam-1')).rejects.toEqual({ message: 'DB error' })
  })
})

describe('createShoppingList', () => {
  it('생성된 리스트를 반환한다', async () => {
    const mockList = { id: 'list-1', name: '이마트', type: 'strikethrough' }
    mockFrom.mockReturnValue(makeChain({ data: mockList, error: null }))
    const result = await createShoppingList('fam-1', 'user-1', '이마트', 'strikethrough')
    expect(result).toEqual(mockList)
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'insert error' } }))
    await expect(createShoppingList('fam-1', 'user-1', '이마트', 'strikethrough')).rejects.toEqual({ message: 'insert error' })
  })
})

describe('deleteShoppingList', () => {
  it('에러 없이 완료된다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(deleteShoppingList('list-1')).resolves.toBeUndefined()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'delete error' } }))
    await expect(deleteShoppingList('list-1')).rejects.toEqual({ message: 'delete error' })
  })
})

describe('renameShoppingList', () => {
  it('에러 없이 완료된다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(renameShoppingList('list-1', '코스트코')).resolves.toBeUndefined()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'update error' } }))
    await expect(renameShoppingList('list-1', '코스트코')).rejects.toEqual({ message: 'update error' })
  })
})

describe('reorderShoppingLists', () => {
  it('각 항목에 대해 update를 호출한다', async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))
    await reorderShoppingLists([
      { id: 'list-1', sort_order: 0 },
      { id: 'list-2', sort_order: 1 },
    ])
    expect(mockFrom).toHaveBeenCalledTimes(2)
    expect(mockFrom).toHaveBeenCalledWith('shopping_lists')
  })

  it('빈 배열이면 아무것도 호출하지 않는다', async () => {
    await reorderShoppingLists([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('update 중 하나라도 error가 있으면 throw한다', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: { message: 'reorder error' } }))

    await expect(
      reorderShoppingLists([
        { id: 'list-1', sort_order: 0 },
        { id: 'list-2', sort_order: 1 },
      ])
    ).rejects.toEqual({ message: 'reorder error' })
  })
})

describe('getShoppingItems', () => {
  it('정렬된 아이템 목록을 반환한다', async () => {
    const mockData = [{ id: 'item-1', name: '우유', is_checked: false }]
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getShoppingItems('list-1')
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('shopping_items')
  })

  it('data가 null이면 빈 배열을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const result = await getShoppingItems('list-1')
    expect(result).toEqual([])
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'fetch error' } }))
    await expect(getShoppingItems('list-1')).rejects.toEqual({ message: 'fetch error' })
  })
})

describe('addShoppingItem', () => {
  it('생성된 아이템을 반환한다', async () => {
    const mockItem = { id: 'item-1', name: '우유', is_checked: false }
    mockFrom.mockReturnValue(makeChain({ data: mockItem, error: null }))
    const result = await addShoppingItem('list-1', 'user-1', '우유')
    expect(result).toEqual(mockItem)
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'insert error' } }))
    await expect(addShoppingItem('list-1', 'user-1', '우유')).rejects.toEqual({ message: 'insert error' })
  })
})

describe('checkShoppingItem', () => {
  it('체크 상태를 업데이트한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(checkShoppingItem('item-1', 'user-1', true)).resolves.toBeUndefined()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'update error' } }))
    await expect(checkShoppingItem('item-1', 'user-1', true)).rejects.toEqual({ message: 'update error' })
  })
})

describe('deleteShoppingItem', () => {
  it('에러 없이 완료된다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(deleteShoppingItem('item-1')).resolves.toBeUndefined()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'delete error' } }))
    await expect(deleteShoppingItem('item-1')).rejects.toEqual({ message: 'delete error' })
  })
})

describe('renameShoppingItem', () => {
  it('에러 없이 완료된다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(renameShoppingItem('item-1', '두유')).resolves.toBeUndefined()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'update error' } }))
    await expect(renameShoppingItem('item-1', '두유')).rejects.toEqual({ message: 'update error' })
  })
})

describe('reorderShoppingItems', () => {
  it('각 아이템에 대해 update를 호출한다', async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))
    await reorderShoppingItems([
      { id: 'item-1', sort_order: 0 },
      { id: 'item-2', sort_order: 1 },
      { id: 'item-3', sort_order: 2 },
    ])
    expect(mockFrom).toHaveBeenCalledTimes(3)
    expect(mockFrom).toHaveBeenCalledWith('shopping_items')
  })

  it('빈 배열이면 아무것도 호출하지 않는다', async () => {
    await reorderShoppingItems([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('update 중 하나라도 error가 있으면 throw한다', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: { message: 'reorder error' } }))

    await expect(
      reorderShoppingItems([
        { id: 'item-1', sort_order: 0 },
        { id: 'item-2', sort_order: 1 },
      ])
    ).rejects.toEqual({ message: 'reorder error' })
  })
})
