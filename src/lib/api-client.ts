import { supabase } from '@/lib/supabase'

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
