// Admin email whitelist — hardcoded for simplicity
// Update this list to add/remove admin access
const ADMIN_EMAILS = [
  // TODO: Replace with your actual admin email
  'xuzheran@hotmail.com',
]

/**
 * Check if the given email belongs to an admin user.
 */
export function isAdmin(email: string | undefined | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}
