import {
  getReminderGroups,
  createReminderGroup,
  updateReminderGroup,
  deleteReminderGroup,
  getReminderGroupMembers,
  getReminderGroupMembersForGroups,
  setReminderGroupMembers,
  getReminderLists,
  createReminderList,
  deleteReminderList,
  getReminderList,
  getReminderItems,
  addReminderItem,
  checkReminderItem,
  deleteReminderItem,
  renameReminderList,
  updateReminderListGroup,
  renameReminderItem,
  reorderReminderLists,
  reorderReminderItems,
} from '@/lib/reminder-lists'

// Supabase 체이닝 쿼리 빌더 목업 팩토리
function makeChain(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result)
  const chain: Record<string, unknown> = {}
  ;['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'ilike', 'order'].forEach((m) => {
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
const mockRpc = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))
  mockRpc.mockResolvedValue({ data: null, error: null })
})

describe('getReminderGroups', () => {
  it('정렬된 리마인더 그룹을 반환한다', async () => {
    const mockData = [{ id: 'group-1', name: '집', sort_order: 0 }]
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getReminderGroups('fam-1')
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('reminder_groups')
  })

  it('data가 null이면 빈 배열을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const result = await getReminderGroups('fam-1')
    expect(result).toEqual([])
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'group fetch error' } }))
    await expect(getReminderGroups('fam-1')).rejects.toEqual({ message: 'group fetch error' })
  })
})

describe('createReminderGroup', () => {
  it('그룹 생성 후 owner와 멤버를 등록한다', async () => {
    const mockGroup = { id: 'group-1', name: '집', color: '#3b82f6' }
    const groupChain = makeChain({ data: mockGroup, error: null })
    const ownerChain = makeChain({ data: null, error: null })
    const memberChain = makeChain({ data: null, error: null })
    mockFrom
      .mockReturnValueOnce(groupChain)
      .mockReturnValueOnce(ownerChain)
      .mockReturnValueOnce(memberChain)

    const result = await createReminderGroup(
      'fam-1',
      'user-1',
      '집',
      '#3b82f6',
      ['user-1', 'user-2']
    )

    expect(result).toEqual(mockGroup)
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'reminder_groups')
    expect(groupChain.insert).toHaveBeenCalledWith({
      family_id: 'fam-1',
      created_by: 'user-1',
      name: '집',
      color: '#3b82f6',
    })
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'reminder_group_members')
    expect(ownerChain.insert).toHaveBeenCalledWith({
      reminder_group_id: 'group-1',
      user_id: 'user-1',
      role: 'owner',
    })
    expect(memberChain.insert).toHaveBeenCalledWith([
      { reminder_group_id: 'group-1', user_id: 'user-2', role: 'member' },
    ])
  })

  it('owner 등록 실패 시 throw한다', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: { id: 'group-1' }, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: { message: 'owner error' } }))

    await expect(createReminderGroup('fam-1', 'user-1', '집', '#3b82f6')).rejects.toEqual({
      message: 'owner error',
    })
  })
})

describe('updateReminderGroup', () => {
  it('updated_at과 함께 그룹 정보를 수정한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(updateReminderGroup('group-1', { name: '회사' })).resolves.toBeUndefined()
    expect(mockFrom).toHaveBeenCalledWith('reminder_groups')
  })
})

describe('deleteReminderGroup', () => {
  it('에러 없이 완료된다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(deleteReminderGroup('group-1')).resolves.toBeUndefined()
  })
})

describe('getReminderGroupMembers', () => {
  it('리마인더 그룹 멤버를 반환한다', async () => {
    const mockData = [{ reminder_group_id: 'group-1', user_id: 'user-1', role: 'owner' }]
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getReminderGroupMembers('group-1')
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('reminder_group_members')
  })
})

describe('getReminderGroupMembersForGroups', () => {
  it('그룹 id가 없으면 조회하지 않고 빈 배열을 반환한다', async () => {
    const result = await getReminderGroupMembersForGroups([])
    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('여러 그룹의 멤버를 조회한다', async () => {
    const mockData = [{ reminder_group_id: 'group-1', user_id: 'user-1', role: 'owner' }]
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getReminderGroupMembersForGroups(['group-1'])
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('reminder_group_members')
  })
})

describe('setReminderGroupMembers', () => {
  it('owner 제외 멤버를 교체한다', async () => {
    const deleteChain = makeChain({ data: null, error: null })
    const insertChain = makeChain({ data: null, error: null })
    mockFrom.mockReturnValueOnce(deleteChain).mockReturnValueOnce(insertChain)

    await expect(
      setReminderGroupMembers('group-1', 'user-1', ['user-1', 'user-2'])
    ).resolves.toBeUndefined()

    expect(deleteChain.neq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(insertChain.insert).toHaveBeenCalledWith([
      { reminder_group_id: 'group-1', user_id: 'user-2', role: 'member' },
    ])
  })
})

describe('getReminderLists', () => {
  it('정렬된 리스트를 반환한다', async () => {
    const mockData = [{ id: 'list-1', name: '이마트', sort_order: 0 }]
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getReminderLists('fam-1')
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('shopping_lists')
  })

  it('data가 null이면 빈 배열을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const result = await getReminderLists('fam-1')
    expect(result).toEqual([])
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'DB error' } }))
    await expect(getReminderLists('fam-1')).rejects.toEqual({ message: 'DB error' })
  })
})

describe('createReminderList', () => {
  it('생성된 리스트를 반환한다', async () => {
    const mockList = { id: 'list-1', name: '이마트', type: 'strikethrough' }
    mockRpc.mockResolvedValueOnce({ data: mockList, error: null })
    const result = await createReminderList('fam-1', 'user-1', '이마트', 'strikethrough')
    expect(result).toEqual(mockList)
    expect(mockRpc).toHaveBeenCalledWith('create_shopping_list_authorized', {
      p_actor_user_id: 'user-1',
      p_family_id: 'fam-1',
      p_name: '이마트',
      p_type: 'strikethrough',
      p_reminder_group_id: null,
    })
  })

  it('리마인더 그룹 id를 함께 저장할 수 있다', async () => {
    const mockList = {
      id: 'list-1',
      name: '이마트',
      type: 'strikethrough',
      reminder_group_id: 'group-1',
    }
    mockRpc.mockResolvedValueOnce({ data: mockList, error: null })

    const result = await createReminderList(
      'fam-1',
      'user-1',
      '이마트',
      'strikethrough',
      'group-1'
    )

    expect(result).toEqual(mockList)
    expect(mockRpc).toHaveBeenCalledWith('create_shopping_list_authorized', {
      p_actor_user_id: 'user-1',
      p_family_id: 'fam-1',
      p_name: '이마트',
      p_type: 'strikethrough',
      p_reminder_group_id: 'group-1',
    })
  })

  it('error가 있으면 throw한다', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'insert error' } })
    await expect(createReminderList('fam-1', 'user-1', '이마트', 'strikethrough')).rejects.toEqual({ message: 'insert error' })
  })
})

describe('updateReminderListGroup', () => {
  it('리마인더 그룹 변경 RPC를 호출하고 변경된 리스트를 반환한다', async () => {
    const mockList = {
      id: 'list-1',
      name: '이마트',
      reminder_group_id: 'group-1',
    }
    mockRpc.mockResolvedValueOnce({ data: mockList, error: null })

    const result = await updateReminderListGroup('list-1', 'user-1', 'group-1')

    expect(result).toEqual(mockList)
    expect(mockRpc).toHaveBeenCalledWith('update_shopping_list_group_authorized', {
      p_actor_user_id: 'user-1',
      p_list_id: 'list-1',
      p_reminder_group_id: 'group-1',
    })
  })

  it('가족 전체로 변경할 때 null을 전달한다', async () => {
    const mockList = {
      id: 'list-1',
      name: '이마트',
      reminder_group_id: null,
    }
    mockRpc.mockResolvedValueOnce({ data: mockList, error: null })

    await expect(updateReminderListGroup('list-1', 'user-1', null)).resolves.toEqual(mockList)

    expect(mockRpc).toHaveBeenCalledWith('update_shopping_list_group_authorized', {
      p_actor_user_id: 'user-1',
      p_list_id: 'list-1',
      p_reminder_group_id: null,
    })
  })

  it('error가 있으면 throw한다', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'group update error' } })

    await expect(updateReminderListGroup('list-1', 'user-1', 'group-1')).rejects.toEqual({
      message: 'group update error',
    })
  })
})

describe('deleteReminderList', () => {
  it('에러 없이 완료된다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(deleteReminderList('list-1')).resolves.toBeUndefined()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'delete error' } }))
    await expect(deleteReminderList('list-1')).rejects.toEqual({ message: 'delete error' })
  })
})

describe('getReminderList', () => {
  it('단일 리마인더를 반환한다', async () => {
    const mockData = { id: 'list-1', name: '이마트', type: 'strikethrough' }
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getReminderList('list-1')
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('shopping_lists')
  })

  it('data가 null이면 null을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const result = await getReminderList('list-1')
    expect(result).toBeNull()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'fetch error' } }))
    await expect(getReminderList('list-1')).rejects.toEqual({ message: 'fetch error' })
  })
})

describe('renameReminderList', () => {
  it('에러 없이 완료된다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(renameReminderList('list-1', '코스트코')).resolves.toBeUndefined()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'update error' } }))
    await expect(renameReminderList('list-1', '코스트코')).rejects.toEqual({ message: 'update error' })
  })
})

describe('reorderReminderLists', () => {
  it('각 항목에 대해 update를 호출한다', async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))
    await reorderReminderLists([
      { id: 'list-1', sort_order: 0 },
      { id: 'list-2', sort_order: 1 },
    ])
    expect(mockFrom).toHaveBeenCalledTimes(2)
    expect(mockFrom).toHaveBeenCalledWith('shopping_lists')
  })

  it('빈 배열이면 아무것도 호출하지 않는다', async () => {
    await reorderReminderLists([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('update 중 하나라도 error가 있으면 throw한다', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: { message: 'reorder error' } }))

    await expect(
      reorderReminderLists([
        { id: 'list-1', sort_order: 0 },
        { id: 'list-2', sort_order: 1 },
      ])
    ).rejects.toEqual({ message: 'reorder error' })
  })
})

describe('getReminderItems', () => {
  it('정렬된 아이템 목록을 반환한다', async () => {
    const mockData = [{ id: 'item-1', name: '우유', is_checked: false }]
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const result = await getReminderItems('list-1')
    expect(result).toEqual(mockData)
    expect(mockFrom).toHaveBeenCalledWith('shopping_items')
  })

  it('data가 null이면 빈 배열을 반환한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const result = await getReminderItems('list-1')
    expect(result).toEqual([])
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'fetch error' } }))
    await expect(getReminderItems('list-1')).rejects.toEqual({ message: 'fetch error' })
  })
})

describe('addReminderItem', () => {
  it('생성된 아이템을 반환한다', async () => {
    const mockItem = { id: 'item-1', name: '우유', is_checked: false }
    mockRpc.mockResolvedValue({ data: mockItem, error: null })
    const result = await addReminderItem('list-1', 'user-1', '우유', 'item-0')
    expect(result).toEqual(mockItem)
    expect(mockRpc).toHaveBeenCalledWith('add_shopping_item_authorized', {
      p_actor_user_id: 'user-1',
      p_list_id: 'list-1',
      p_name: '우유',
      p_after_item_id: 'item-0',
    })
  })

  it('error가 있으면 throw한다', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'insert error' } })
    await expect(addReminderItem('list-1', 'user-1', '우유')).rejects.toEqual({ message: 'insert error' })
  })
})

describe('checkReminderItem', () => {
  it('체크 상태를 업데이트한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(checkReminderItem('item-1', 'user-1', true)).resolves.toBeUndefined()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'update error' } }))
    await expect(checkReminderItem('item-1', 'user-1', true)).rejects.toEqual({ message: 'update error' })
  })
})

describe('deleteReminderItem', () => {
  it('에러 없이 완료된다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(deleteReminderItem('item-1')).resolves.toBeUndefined()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'delete error' } }))
    await expect(deleteReminderItem('item-1')).rejects.toEqual({ message: 'delete error' })
  })
})

describe('renameReminderItem', () => {
  it('에러 없이 완료된다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(renameReminderItem('item-1', '두유')).resolves.toBeUndefined()
  })

  it('error가 있으면 throw한다', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'update error' } }))
    await expect(renameReminderItem('item-1', '두유')).rejects.toEqual({ message: 'update error' })
  })
})

describe('reorderReminderItems', () => {
  it('각 아이템에 대해 update를 호출한다', async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))
    await reorderReminderItems([
      { id: 'item-1', sort_order: 0 },
      { id: 'item-2', sort_order: 1 },
      { id: 'item-3', sort_order: 2 },
    ])
    expect(mockFrom).toHaveBeenCalledTimes(3)
    expect(mockFrom).toHaveBeenCalledWith('shopping_items')
  })

  it('빈 배열이면 아무것도 호출하지 않는다', async () => {
    await reorderReminderItems([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('update 중 하나라도 error가 있으면 throw한다', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: { message: 'reorder error' } }))

    await expect(
      reorderReminderItems([
        { id: 'item-1', sort_order: 0 },
        { id: 'item-2', sort_order: 1 },
      ])
    ).rejects.toEqual({ message: 'reorder error' })
  })
})
