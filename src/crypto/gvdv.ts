import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { argon2id } from "hash-wasm";

export type VaultAlgorithm = "aes-256-gcm" | "chacha20-poly1305";

export interface VaultMetadata {
  originalName: string;
  originalMime: string;
}

export interface VaultHeader {
  version: 1;
  algorithm: VaultAlgorithm;
  kdf: "argon2id-default";
  salt_b64: string;
  nonce_b64: string;
  original_name: string;
  original_mime: string;
}

export interface ParsedVaultPackage {
  header: VaultHeader;
  ciphertext: Uint8Array;
}

export interface DecryptBytesResult {
  bytes: Uint8Array;
  header: VaultHeader;
  metadata: VaultMetadata;
}

export type VaultCryptoErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_BASE64"
  | "INVALID_PACKAGE"
  | "UNSUPPORTED_VERSION"
  | "UNSUPPORTED_ALGORITHM"
  | "UNSUPPORTED_KDF"
  | "CRYPTO_UNAVAILABLE"
  | "KEY_DERIVATION_FAILED"
  | "ENCRYPTION_FAILED"
  | "DECRYPTION_FAILED"
  | "INVALID_TEXT";

export class VaultCryptoError extends Error {
  readonly code: VaultCryptoErrorCode;

  constructor(code: VaultCryptoErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "VaultCryptoError";
    this.code = code;
  }
}

export const GVDV_MAGIC = "GVDV1\n";
export const GVDV_TEXT_PREFIX = "GVDV1:";
export const GVDV_VERSION = 1 as const;
export const GVDV_KDF = "argon2id-default" as const;

export const ARGON2ID_PARAMETERS = Object.freeze({
  memorySizeKiB: 19_456,
  iterations: 2,
  parallelism: 1,
  version: 0x13,
  keyLength: 32,
});

const SALT_LENGTH = 16;
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const HEADER_LENGTH_SIZE = 4;
const DEFAULT_ALGORITHM: VaultAlgorithm = "aes-256-gcm";
const DEFAULT_TEXT_METADATA: VaultMetadata = {
  originalName: "encrypted-text.txt",
  originalMime: "text/plain",
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const magicBytes = textEncoder.encode(GVDV_MAGIC);
const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function bytesToBase64(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) {
    throw new VaultCryptoError("INVALID_ARGUMENT", "Expected a Uint8Array.");
  }

  if (typeof globalThis.btoa !== "function") {
    throw new VaultCryptoError(
      "CRYPTO_UNAVAILABLE",
      "This environment does not provide the browser base64 encoder.",
    );
  }

  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, bytes.length);
    let chunk = "";
    for (let index = offset; index < end; index += 1) {
      chunk += String.fromCharCode(bytes[index]);
    }
    chunks.push(chunk);
  }
  return globalThis.btoa(chunks.join(""));
}

export function base64ToBytes(encoded: string): Uint8Array {
  if (
    typeof encoded !== "string" ||
    encoded.length % 4 !== 0 ||
    !base64Pattern.test(encoded)
  ) {
    throw new VaultCryptoError("INVALID_BASE64", "Value is not valid standard base64.");
  }

  if (typeof globalThis.atob !== "function") {
    throw new VaultCryptoError(
      "CRYPTO_UNAVAILABLE",
      "This environment does not provide the browser base64 decoder.",
    );
  }

  let binary: string;
  try {
    binary = globalThis.atob(encoded);
  } catch (cause) {
    throw new VaultCryptoError("INVALID_BASE64", "Value is not valid standard base64.", {
      cause,
    });
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function encryptText(
  plaintext: string,
  password: string,
  algorithm: VaultAlgorithm = DEFAULT_ALGORITHM,
): Promise<string> {
  if (typeof plaintext !== "string") {
    throw new VaultCryptoError("INVALID_ARGUMENT", "Plaintext must be a string.");
  }

  const packageBytes = await encryptBytes(
    textEncoder.encode(plaintext),
    password,
    DEFAULT_TEXT_METADATA,
    algorithm,
  );
  return `${GVDV_TEXT_PREFIX}${bytesToBase64(packageBytes)}`;
}

export async function decryptText(payload: string, password: string): Promise<string> {
  if (typeof payload !== "string") {
    throw new VaultCryptoError("INVALID_ARGUMENT", "Encrypted payload must be a string.");
  }

  const trimmed = payload.trim();
  const encoded = trimmed.startsWith(GVDV_TEXT_PREFIX)
    ? trimmed.slice(GVDV_TEXT_PREFIX.length)
    : trimmed;

  let packageBytes: Uint8Array;
  try {
    packageBytes = base64ToBytes(encoded);
  } catch (cause) {
    if (cause instanceof VaultCryptoError && cause.code === "CRYPTO_UNAVAILABLE") {
      throw cause;
    }
    throw new VaultCryptoError(
      "INVALID_PACKAGE",
      "Text is not a Drive Vault encrypted payload.",
      { cause },
    );
  }

  const decrypted = await decryptBytes(packageBytes, password);
  try {
    return textDecoder.decode(decrypted.bytes);
  } catch (cause) {
    throw new VaultCryptoError("INVALID_TEXT", "Decrypted payload is not valid UTF-8 text.", {
      cause,
    });
  }
}

export async function encryptBytes(
  bytes: Uint8Array,
  password: string,
  metadata: VaultMetadata,
  algorithm: VaultAlgorithm = DEFAULT_ALGORITHM,
): Promise<Uint8Array> {
  requireBytes(bytes);
  requirePassword(password);
  requireMetadata(metadata);
  requireAlgorithm(algorithm);

  const salt = randomBytes(SALT_LENGTH);
  const nonce = randomBytes(NONCE_LENGTH);
  const key = await deriveKey(password, salt);

  let ciphertext: Uint8Array;
  try {
    ciphertext = await encryptWithAlgorithm(bytes, key, nonce, algorithm);
  } finally {
    key.fill(0);
  }

  const header: VaultHeader = {
    version: GVDV_VERSION,
    algorithm,
    kdf: GVDV_KDF,
    salt_b64: bytesToBase64(salt),
    nonce_b64: bytesToBase64(nonce),
    original_name: metadata.originalName,
    original_mime: metadata.originalMime,
  };
  const headerBytes = textEncoder.encode(JSON.stringify(header));
  if (headerBytes.length > 0xffff_ffff) {
    throw new VaultCryptoError("INVALID_ARGUMENT", "Vault header is too large.");
  }

  const output = new Uint8Array(
    magicBytes.length + HEADER_LENGTH_SIZE + headerBytes.length + ciphertext.length,
  );
  output.set(magicBytes, 0);
  new DataView(output.buffer).setUint32(magicBytes.length, headerBytes.length, false);
  output.set(headerBytes, magicBytes.length + HEADER_LENGTH_SIZE);
  output.set(ciphertext, magicBytes.length + HEADER_LENGTH_SIZE + headerBytes.length);
  return output;
}

export async function decryptBytes(
  packageBytes: Uint8Array,
  password: string,
): Promise<DecryptBytesResult> {
  requireBytes(packageBytes);
  requirePassword(password);

  const parsed = parseVaultPackage(packageBytes);
  const salt = decodeHeaderBase64(parsed.header.salt_b64, "salt");
  const nonce = decodeHeaderBase64(parsed.header.nonce_b64, "nonce");
  const key = await deriveKey(password, salt);

  let bytes: Uint8Array;
  try {
    bytes = await decryptWithAlgorithm(
      parsed.ciphertext,
      key,
      nonce,
      parsed.header.algorithm,
    );
  } finally {
    key.fill(0);
  }

  return {
    bytes,
    header: parsed.header,
    metadata: {
      originalName: parsed.header.original_name,
      originalMime: parsed.header.original_mime,
    },
  };
}

export function parseVaultPackage(packageBytes: Uint8Array): ParsedVaultPackage {
  requireBytes(packageBytes);

  const headerLengthOffset = magicBytes.length;
  const headerOffset = headerLengthOffset + HEADER_LENGTH_SIZE;
  if (packageBytes.length < headerOffset || !startsWith(packageBytes, magicBytes)) {
    throw invalidPackage();
  }

  const headerLength = new DataView(
    packageBytes.buffer,
    packageBytes.byteOffset + headerLengthOffset,
    HEADER_LENGTH_SIZE,
  ).getUint32(0, false);
  const headerEnd = headerOffset + headerLength;
  if (headerLength === 0 || headerEnd > packageBytes.length) {
    throw invalidPackage();
  }

  let value: unknown;
  try {
    value = JSON.parse(textDecoder.decode(packageBytes.subarray(headerOffset, headerEnd)));
  } catch (cause) {
    throw invalidPackage(cause);
  }

  const header = validateHeader(value);
  const salt = decodeHeaderBase64(header.salt_b64, "salt");
  const nonce = decodeHeaderBase64(header.nonce_b64, "nonce");
  if (salt.length !== SALT_LENGTH || nonce.length !== NONCE_LENGTH) {
    throw invalidPackage();
  }

  const ciphertext = packageBytes.slice(headerEnd);
  if (ciphertext.length < AUTH_TAG_LENGTH) {
    throw invalidPackage();
  }

  return { header, ciphertext };
}

function validateHeader(value: unknown): VaultHeader {
  if (!isRecord(value)) {
    throw invalidPackage();
  }
  if (value.version !== GVDV_VERSION) {
    throw new VaultCryptoError(
      "UNSUPPORTED_VERSION",
      "Unsupported vault package version.",
    );
  }
  if (value.algorithm !== "aes-256-gcm" && value.algorithm !== "chacha20-poly1305") {
    throw new VaultCryptoError(
      "UNSUPPORTED_ALGORITHM",
      `Unsupported vault algorithm: ${String(value.algorithm)}.`,
    );
  }
  if (value.kdf !== GVDV_KDF) {
    throw new VaultCryptoError("UNSUPPORTED_KDF", `Unsupported vault KDF: ${String(value.kdf)}.`);
  }
  if (
    typeof value.salt_b64 !== "string" ||
    typeof value.nonce_b64 !== "string" ||
    typeof value.original_name !== "string" ||
    typeof value.original_mime !== "string"
  ) {
    throw invalidPackage();
  }

  return {
    version: GVDV_VERSION,
    algorithm: value.algorithm,
    kdf: GVDV_KDF,
    salt_b64: value.salt_b64,
    nonce_b64: value.nonce_b64,
    original_name: value.original_name,
    original_mime: value.original_mime,
  };
}

async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  try {
    const key = await argon2id({
      password: textEncoder.encode(password),
      salt,
      parallelism: ARGON2ID_PARAMETERS.parallelism,
      iterations: ARGON2ID_PARAMETERS.iterations,
      memorySize: ARGON2ID_PARAMETERS.memorySizeKiB,
      hashLength: ARGON2ID_PARAMETERS.keyLength,
      outputType: "binary",
    });
    if (!(key instanceof Uint8Array) || key.length !== ARGON2ID_PARAMETERS.keyLength) {
      throw new Error("Argon2id returned an invalid key.");
    }
    return key;
  } catch (cause) {
    throw new VaultCryptoError(
      "KEY_DERIVATION_FAILED",
      "Could not derive the Drive Vault encryption key with Argon2id v=19, m=19456, t=2, p=1.",
      { cause },
    );
  }
}

async function encryptWithAlgorithm(
  plaintext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  algorithm: VaultAlgorithm,
): Promise<Uint8Array> {
  try {
    if (algorithm === "aes-256-gcm") {
      const webCrypto = requireWebCrypto();
      const cryptoKey = await webCrypto.subtle.importKey(
        "raw",
        toArrayBuffer(key),
        { name: "AES-GCM" },
        false,
        ["encrypt"],
      );
      const encrypted = await webCrypto.subtle.encrypt(
        { name: "AES-GCM", iv: toArrayBuffer(nonce), tagLength: 128 },
        cryptoKey,
        toArrayBuffer(plaintext),
      );
      return new Uint8Array(encrypted);
    }

    const factory = getChaChaFactory();
    return factory(key, nonce).encrypt(plaintext);
  } catch (cause) {
    if (cause instanceof VaultCryptoError) {
      throw cause;
    }
    throw new VaultCryptoError("ENCRYPTION_FAILED", "Drive Vault encryption failed.", {
      cause,
    });
  }
}

async function decryptWithAlgorithm(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  algorithm: VaultAlgorithm,
): Promise<Uint8Array> {
  try {
    if (algorithm === "aes-256-gcm") {
      const webCrypto = requireWebCrypto();
      const cryptoKey = await webCrypto.subtle.importKey(
        "raw",
        toArrayBuffer(key),
        { name: "AES-GCM" },
        false,
        ["decrypt"],
      );
      const decrypted = await webCrypto.subtle.decrypt(
        { name: "AES-GCM", iv: toArrayBuffer(nonce), tagLength: 128 },
        cryptoKey,
        toArrayBuffer(ciphertext),
      );
      return new Uint8Array(decrypted);
    }

    const factory = getChaChaFactory();
    return factory(key, nonce).decrypt(ciphertext);
  } catch (cause) {
    if (cause instanceof VaultCryptoError) {
      throw cause;
    }
    throw new VaultCryptoError(
      "DECRYPTION_FAILED",
      "Decryption failed. Check the password and encrypted payload.",
      { cause },
    );
  }
}

type ChaChaFactory = (
  key: Uint8Array,
  nonce: Uint8Array,
) => {
  encrypt: (plaintext: Uint8Array) => Uint8Array;
  decrypt: (ciphertext: Uint8Array) => Uint8Array;
};

function getChaChaFactory(): ChaChaFactory {
  if (typeof chacha20poly1305 !== "function") {
    throw new VaultCryptoError(
      "UNSUPPORTED_ALGORITHM",
      "ChaCha20-Poly1305 is unavailable. Install a compatible @noble/ciphers build; the package can still be parsed without decrypting it.",
    );
  }
  return chacha20poly1305 as ChaChaFactory;
}

function requireWebCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== "function") {
    throw new VaultCryptoError(
      "CRYPTO_UNAVAILABLE",
      "WebCrypto is unavailable; AES-256-GCM requires a secure Chromium extension context.",
    );
  }
  return globalThis.crypto;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  requireWebCrypto().getRandomValues(bytes);
  return bytes;
}

function decodeHeaderBase64(value: string, field: string): Uint8Array {
  try {
    return base64ToBytes(value);
  } catch (cause) {
    if (cause instanceof VaultCryptoError && cause.code === "CRYPTO_UNAVAILABLE") {
      throw cause;
    }
    throw new VaultCryptoError(
      "INVALID_PACKAGE",
      `Vault header contains invalid ${field} base64.`,
      { cause },
    );
  }
}

function requirePassword(password: string): void {
  if (typeof password !== "string" || password.length === 0) {
    throw new VaultCryptoError("INVALID_ARGUMENT", "Password is required.");
  }
}

function requireBytes(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array)) {
    throw new VaultCryptoError("INVALID_ARGUMENT", "Expected a Uint8Array.");
  }
}

function requireMetadata(metadata: VaultMetadata): void {
  if (
    !metadata ||
    typeof metadata.originalName !== "string" ||
    typeof metadata.originalMime !== "string"
  ) {
    throw new VaultCryptoError(
      "INVALID_ARGUMENT",
      "Metadata must contain originalName and originalMime strings.",
    );
  }
}

function requireAlgorithm(algorithm: string): asserts algorithm is VaultAlgorithm {
  if (algorithm !== "aes-256-gcm" && algorithm !== "chacha20-poly1305") {
    throw new VaultCryptoError(
      "UNSUPPORTED_ALGORITHM",
      `Unsupported vault algorithm: ${algorithm}.`,
    );
  }
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) {
    return false;
  }
  for (let index = 0; index < prefix.length; index += 1) {
    if (bytes[index] !== prefix[index]) {
      return false;
    }
  }
  return true;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidPackage(cause?: unknown): VaultCryptoError {
  return new VaultCryptoError("INVALID_PACKAGE", "Invalid vault package.", { cause });
}
