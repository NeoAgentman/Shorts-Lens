const ShortsLensLicense = (() => {
  const LICENSE_PREFIX = "SL";
  const LICENSE_ID_LENGTH = 12;
  const SIGNATURE_LENGTH = 6;
  const SIGNING_SALT = "shorts-lens-local-license-v1";

  function normalizeKey(key) {
    return String(key || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function formatKey(normalizedKey) {
    const body = normalizeKey(normalizedKey);
    if (!body.startsWith(LICENSE_PREFIX)) return body;

    const payload = body.slice(LICENSE_PREFIX.length, LICENSE_PREFIX.length + LICENSE_ID_LENGTH);
    const signature = body.slice(
      LICENSE_PREFIX.length + LICENSE_ID_LENGTH,
      LICENSE_PREFIX.length + LICENSE_ID_LENGTH + SIGNATURE_LENGTH
    );

    if (!payload || !signature) return body;
    return `${LICENSE_PREFIX}-${payload.slice(0, 4)}-${payload.slice(4, 8)}-${payload.slice(8, 12)}-${signature}`;
  }

  async function signPayload(payload) {
    const encoder = new TextEncoder();
    const input = encoder.encode(`${SIGNING_SALT}:${payload}`);
    const digest = await crypto.subtle.digest("SHA-256", input);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, SIGNATURE_LENGTH)
      .toUpperCase();
  }

  async function validateKey(key) {
    const normalized = normalizeKey(key);
    const expectedLength = LICENSE_PREFIX.length + LICENSE_ID_LENGTH + SIGNATURE_LENGTH;

    if (!normalized.startsWith(LICENSE_PREFIX) || normalized.length !== expectedLength) {
      return { valid: false, normalizedKey: normalized };
    }

    const payload = normalized.slice(LICENSE_PREFIX.length, LICENSE_PREFIX.length + LICENSE_ID_LENGTH);
    const signature = normalized.slice(LICENSE_PREFIX.length + LICENSE_ID_LENGTH);
    const expectedSignature = await signPayload(payload);

    return {
      valid: signature === expectedSignature,
      normalizedKey: normalized,
      formattedKey: formatKey(normalized),
      payload
    };
  }

  return {
    formatKey,
    normalizeKey,
    validateKey
  };
})();
