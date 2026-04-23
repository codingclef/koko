import { NextRequest, NextResponse } from 'next/server'
import { getHolidaysForRange } from '@/lib/kasi-holidays'
import { getAuthenticatedUser } from '@/lib/api-auth'

const SUPPORTED_COUNTRIES = new Set(['KR', 'JP'])
const MIN_YEAR = 2020
const MAX_YEAR = 2035

function parseIntegerParam(searchParams: URLSearchParams, name: string): number | null {
  const raw = searchParams.get(name)
  if (raw === null || raw.trim() === '') return null
  if (!/^\d+$/.test(raw)) return null
  return Number(raw)
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const year = parseIntegerParam(searchParams, 'year')
  const month = parseIntegerParam(searchParams, 'month')
  const countries = (searchParams.get('countries') ?? '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)

  if (year === null || month === null || month < 0 || month > 11) {
    return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 })
  }

  if (year < MIN_YEAR || year > MAX_YEAR) {
    return NextResponse.json({ error: 'Unsupported year' }, { status: 400 })
  }

  if (countries.length === 0) {
    return NextResponse.json({ holidays: [] })
  }

  if (countries.some((country) => !SUPPORTED_COUNTRIES.has(country))) {
    return NextResponse.json({ error: 'Unsupported holiday country' }, { status: 400 })
  }

  const holidays = await getHolidaysForRange(year, month, countries)
  return NextResponse.json(
    { holidays },
    {
      headers: {
        'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
      },
    }
  )
}
