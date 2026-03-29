/**
 * Returns true if the given email is allowed to sign in.
 * When NEXT_PUBLIC_ALLOWED_EMAILS is not set or empty, all emails are allowed.
 */
export function isEmailAllowed(email: string): boolean {
  const raw = process.env.NEXT_PUBLIC_ALLOWED_EMAILS ?? ''
  const allowedEmails = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (allowedEmails.length === 0) return true
  return allowedEmails.includes(email.toLowerCase())
}
