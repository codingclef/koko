import { NextRequest } from 'next/server'

export function isAuthorizedCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`
}
