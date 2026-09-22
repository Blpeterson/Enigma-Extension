import { describe, expect, it } from "vitest";

import {
  extractCompleteTextPayloadMatches,
  extractCompleteTextPayloads,
  isCompleteTextPayload,
  normalizeCompleteTextPayload,
} from "./payload";

const encoder = new TextEncoder();

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function samplePayload(): string {
  const header = encoder.encode(
    JSON.stringify({
      version: 1,
      algorithm: "aes-256-gcm",
      kdf: "argon2id-default",
      salt_b64: base64(new Uint8Array(16)),
      nonce_b64: base64(new Uint8Array(12)),
      original_name: "encrypted-text.txt",
      original_mime: "text/plain",
    }),
  );
  const magic = encoder.encode("GVDV1\n");
  const bytes = new Uint8Array(magic.length + 4 + header.length + 16);
  bytes.set(magic);
  new DataView(bytes.buffer).setUint32(magic.length, header.length, false);
  bytes.set(header, magic.length + 4);
  bytes.fill(7, magic.length + 4 + header.length);
  return `GVDV1:${base64(bytes)}`;
}

describe("content payload detection", () => {
  it("accepts a complete structurally valid text package", () => {
    const payload = samplePayload();
    expect(isCompleteTextPayload(payload)).toBe(true);
    expect(normalizeCompleteTextPayload(`  ${payload}\n`)).toBe(payload);
  });

  it("rejects truncated and prefix-only lookalikes", () => {
    const payload = samplePayload();
    expect(isCompleteTextPayload(payload.slice(0, -4))).toBe(false);
    expect(isCompleteTextPayload("GVDV1:R1ZEVjEK")).toBe(false);
  });

  it("extracts bounded payloads once without consuming page prose", () => {
    const payload = samplePayload();
    expect(
      extractCompleteTextPayloads(`Before (${payload}), after. ${payload}`),
    ).toEqual([payload]);
    expect(extractCompleteTextPayloads(`A${payload}`)).toEqual([]);
  });

  it("finds an envelope reconstructed from DOM text split around word-break elements", () => {
    const payload = samplePayload();
    const fragments = [
      payload.slice(0, 6),
      payload.slice(6, 43),
      payload.slice(43, 91),
      payload.slice(91),
    ];
    const logicalText = fragments.join("") + "\n-- signature";

    expect(extractCompleteTextPayloadMatches(logicalText)).toEqual([
      { payload, start: 0, end: payload.length },
    ]);
  });
});
