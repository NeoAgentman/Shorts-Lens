#!/usr/bin/env node

const crypto = require("crypto");

const LICENSE_PREFIX = "SL";
const LICENSE_ID_LENGTH = 12;
const SIGNATURE_LENGTH = 6;
const SIGNING_SALT = "shorts-lens-local-license-v1";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createPayload() {
  let payload = "";
  const bytes = crypto.randomBytes(LICENSE_ID_LENGTH);

  for (const byte of bytes) {
    payload += ALPHABET[byte % ALPHABET.length];
  }

  return payload;
}

function signPayload(payload) {
  return crypto
    .createHash("sha256")
    .update(`${SIGNING_SALT}:${payload}`)
    .digest("hex")
    .slice(0, SIGNATURE_LENGTH)
    .toUpperCase();
}

function formatKey(payload, signature) {
  return `${LICENSE_PREFIX}-${payload.slice(0, 4)}-${payload.slice(4, 8)}-${payload.slice(8, 12)}-${signature}`;
}

const payload = createPayload();
const signature = signPayload(payload);

console.log(formatKey(payload, signature));
