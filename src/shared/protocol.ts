export type SharedSecret = {
  id: string;
  name: string;
  password: string;
};

export type VaultSecrets = {
  personal: string;
  shared: SharedSecret[];
};

export type PublicKeyOption = {
  id: string;
  name: string;
  kind: "personal" | "shared";
};

export type VaultStatus = {
  configured: boolean;
  locked: boolean;
  storageMode: "none" | "session" | "stored";
  expiresAt: number | null;
  autoLockMinutes: number;
  keys: PublicKeyOption[];
};

export type FileResult = {
  dataBase64: string;
  name: string;
  mime: string;
};

export type ReadItem = {
  id: string;
  status: "decrypting" | "ready" | "error";
  payload: string;
  sourceUrl: string;
  requestedAt: number;
  text?: string;
  keyId?: string;
  keyName?: string;
  kind?: "personal" | "shared";
  requestedKeyId?: string;
  error?: string;
};

export type PanelRoute = "read" | "compose" | "calendar" | "files";

export type PanelContext = {
  route: PanelRoute;
  site: "gmail" | "calendar" | "other";
  tabId: number;
  updatedAt: number;
};

export type RuntimeResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export const DEFAULT_AUTO_LOCK_MINUTES = 5;
export const MIN_AUTO_LOCK_MINUTES = 1;
export const MAX_AUTO_LOCK_MINUTES = 59;
export const AUTO_LOCK_MS = DEFAULT_AUTO_LOCK_MINUTES * 60 * 1000;
export const READ_ITEM_STORAGE_KEY = "driveVaultReadItem";
export const PANEL_CONTEXT_STORAGE_KEY = "driveVaultPanelContext";
export const DEFAULT_SITES = new Set(["https://mail.google.com", "https://calendar.google.com"]);

export function publicKeys(vault: VaultSecrets | null): PublicKeyOption[] {
  if (!vault) return [];
  const result: PublicKeyOption[] = [];
  if (vault.personal) result.push({ id: "personal", name: "Personal", kind: "personal" });
  result.push(...vault.shared.map(({ id, name }) => ({ id, name, kind: "shared" as const })));
  return result;
}

export function normalizeVault(input: VaultSecrets): VaultSecrets {
  return {
    personal: input.personal.trim(),
    shared: input.shared
      .map((entry) => ({
        id: entry.id || crypto.randomUUID(),
        name: entry.name.trim(),
        password: entry.password,
      }))
      .filter((entry) => entry.name && entry.password),
  };
}
