import { supabase } from '@/lib/supabase'

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

export async function getAuthHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const accessToken = session?.access_token
  if (!accessToken) {
    throw new Error('No active session')
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const body = await response.json() as { error?: unknown }
      if (typeof body.error === 'string' && body.error) {
        return body.error
      }
    }

    const text = await response.text()
    if (text) return text
  } catch {
    // ignore parse failures and fall back to status text
  }

  return response.statusText || `Request failed with status ${response.status}`
}

async function requestJson<T>(
  input: string,
  init: RequestInit
): Promise<T> {
  const response = await fetch(input, init)

  if (!response.ok) {
    throw new ApiClientError(await parseApiError(response), response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return await response.json() as T
}

export async function postJson<TResponse>(
  input: string,
  body?: unknown,
  init?: Omit<RequestInit, 'body' | 'method'>
): Promise<TResponse> {
  return requestJson<TResponse>(input, {
    ...init,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export async function postJsonWithAuth<TResponse>(
  input: string,
  body?: unknown,
  init?: Omit<RequestInit, 'body' | 'method'>
): Promise<TResponse> {
  const authHeaders = await getAuthHeaders()

  return postJson<TResponse>(input, body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...authHeaders,
    },
  })
}
