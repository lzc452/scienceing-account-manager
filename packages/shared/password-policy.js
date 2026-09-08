/* global TextEncoder */

export const PASSWORD_MIN_CHARACTERS = 8;
export const PASSWORD_MAX_UTF8_BYTES = 72;

const utf8Encoder = new TextEncoder();

export function passwordCharacterLength(password) {
  return typeof password === 'string' ? Array.from(password).length : 0;
}

export function passwordUtf8ByteLength(password) {
  return typeof password === 'string' ? utf8Encoder.encode(password).byteLength : 0;
}

export function isPasswordAllowed(password) {
  return (
    typeof password === 'string'
    && passwordCharacterLength(password) >= PASSWORD_MIN_CHARACTERS
    && passwordUtf8ByteLength(password) <= PASSWORD_MAX_UTF8_BYTES
  );
}

export function passwordPolicyMessage(label = '密码') {
  return `${label}长度需至少 ${PASSWORD_MIN_CHARACTERS} 个字符，且不超过 ${PASSWORD_MAX_UTF8_BYTES} 个 UTF-8 字节`;
}
