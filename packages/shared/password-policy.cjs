'use strict';
/* global TextEncoder, module */

const PASSWORD_MIN_CHARACTERS = 8;
const PASSWORD_MAX_UTF8_BYTES = 72;
const utf8Encoder = new TextEncoder();

function passwordCharacterLength(password) {
  return typeof password === 'string' ? Array.from(password).length : 0;
}

function passwordUtf8ByteLength(password) {
  return typeof password === 'string' ? utf8Encoder.encode(password).byteLength : 0;
}

function isPasswordAllowed(password) {
  return (
    typeof password === 'string'
    && passwordCharacterLength(password) >= PASSWORD_MIN_CHARACTERS
    && passwordUtf8ByteLength(password) <= PASSWORD_MAX_UTF8_BYTES
  );
}

function passwordPolicyMessage(label = '密码') {
  return `${label}长度需至少 ${PASSWORD_MIN_CHARACTERS} 个字符，且不超过 ${PASSWORD_MAX_UTF8_BYTES} 个 UTF-8 字节`;
}

module.exports = {
  PASSWORD_MIN_CHARACTERS,
  PASSWORD_MAX_UTF8_BYTES,
  passwordCharacterLength,
  passwordUtf8ByteLength,
  isPasswordAllowed,
  passwordPolicyMessage,
};
