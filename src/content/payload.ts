export const TEXT_PAYLOAD_PREFIX = "GVDV1:";

const PACKAGE_MAGIC = "GVDV1\n";
const HEADER_LENGTH_OFFSET = PACKAGE_MAGIC.length;
const HEADER_OFFSET = HEADER_LENGTH_OFFSET + 4;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const NONCE_LENGTH = 12;
const MIN_BASE64_LENGTH = 40;
const MAX_BASE64_LENGTH = 2_000_000;
const CANDIDATE_PATTERN = /GVDV1:[A-Za-z0-9+/]+={0,2}/g;
const COMPLETE_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64_BOUNDARY_PATTERN = /[A-Za-z0-9+/=]/;

export type TextPayloadMatch = {
  payload: string;
  start: number;
  end: number;
};

function hasExpectedBase64Length(value: unknown, expectedLength: number): boolean {
  if (typeof value !== "string" || !COMPLETE_BASE64_PATTERN.test(value)) {
    return false;
  }
  try {
    return atob(value).length === expectedLength;
  } catch {
    return false;
  }
}

function hasCompletePackage(encoded: string): boolean {
  try {
    const binary = atob(encoded);
    if (
      binary.length < HEADER_OFFSET + AUTH_TAG_LENGTH ||
      binary.slice(0, PACKAGE_MAGIC.length) !== PACKAGE_MAGIC
    ) {
      return false;
    }

    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const headerLength = new DataView(bytes.buffer).getUint32(
      HEADER_LENGTH_OFFSET,
      false,
    );
    const headerEnd = HEADER_OFFSET + headerLength;
    if (
      headerLength === 0 ||
      headerEnd > bytes.length - AUTH_TAG_LENGTH
    ) {
      return false;
    }

    const header = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(HEADER_OFFSET, headerEnd),
      ),
    ) as Record<string, unknown>;
    return Boolean(
      header &&
        typeof header === "object" &&
        header.version === 1 &&
        (header.algorithm === "aes-256-gcm" ||
          header.algorithm === "chacha20-poly1305") &&
        header.kdf === "argon2id-default" &&
        hasExpectedBase64Length(header.salt_b64, SALT_LENGTH) &&
        hasExpectedBase64Length(header.nonce_b64, NONCE_LENGTH) &&
        typeof header.original_name === "string" &&
        typeof header.original_mime === "string",
    );
  } catch {
    return false;
  }
}

export function isCompleteTextPayload(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith(TEXT_PAYLOAD_PREFIX)) {
    return false;
  }

  const encoded = value.slice(TEXT_PAYLOAD_PREFIX.length);
  if (
    encoded.length < MIN_BASE64_LENGTH ||
    encoded.length > MAX_BASE64_LENGTH ||
    encoded.length % 4 !== 0 ||
    !COMPLETE_BASE64_PATTERN.test(encoded)
  ) {
    return false;
  }

  return hasCompletePackage(encoded);
}

export function normalizeCompleteTextPayload(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return isCompleteTextPayload(normalized) ? normalized : null;
}

export function extractCompleteTextPayloadMatches(text: string): TextPayloadMatch[] {
  const matches: TextPayloadMatch[] = [];
  CANDIDATE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(CANDIDATE_PATTERN)) {
    const payload = match[0];
    const start = match.index ?? 0;
    const end = start + payload.length;
    const left = start > 0 ? text[start - 1] : "";
    const right = end < text.length ? text[end] : "";

    if (
      (left && BASE64_BOUNDARY_PATTERN.test(left)) ||
      (right && BASE64_BOUNDARY_PATTERN.test(right)) ||
      !isCompleteTextPayload(payload)
    ) {
      continue;
    }

    matches.push({ payload, start, end });
  }

  return matches;
}

export function extractCompleteTextPayloads(text: string): string[] {
  const payloads: string[] = [];
  const seen = new Set<string>();
  for (const { payload } of extractCompleteTextPayloadMatches(text)) {
    if (seen.has(payload)) continue;
    seen.add(payload);
    payloads.push(payload);
  }

  return payloads;
}
