export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedUser(email: string, allowedUsers: string[]): boolean {
  if (allowedUsers.length === 0) {
    return false;
  }

  const normalizedEmail = normalizeEmail(email);
  return allowedUsers.map(normalizeEmail).includes(normalizedEmail);
}
