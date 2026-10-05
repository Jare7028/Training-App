export const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,39}$/;
export const normalizeUsername = (value: string) => value.trim().toLowerCase();
