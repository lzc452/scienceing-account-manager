export const PASSWORD_MIN_CHARACTERS: 8;
export const PASSWORD_MAX_UTF8_BYTES: 72;
export function passwordCharacterLength(password: unknown): number;
export function passwordUtf8ByteLength(password: unknown): number;
export function isPasswordAllowed(password: unknown): password is string;
export function passwordPolicyMessage(label?: string): string;
