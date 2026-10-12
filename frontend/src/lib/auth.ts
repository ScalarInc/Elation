/** Where each role lands after sign-in or when visiting the other role's area. */
export function homeFor(role: 'admin' | 'client') {
  return role === 'admin' ? '/admin' : '/dashboard'
}

export const MIN_PASSWORD_LENGTH = 8
