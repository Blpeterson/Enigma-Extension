import {
  base64ToBytes,
  bytesToBase64,
  decryptBytes,
  decryptText,
  encryptBytes,
  encryptText,
  type VaultAlgorithm,
} from "../crypto";
import {
  DEFAULT_SITES,
  DEFAULT_AUTO_LOCK_MINUTES,
  MAX_AUTO_LOCK_MINUTES,
  MIN_AUTO_LOCK_MINUTES,
  PANEL_CONTEXT_STORAGE_KEY,
  READ_ITEM_STORAGE_KEY,
  normalizeVault,
  publicKeys,
  type FileResult,
  type PanelContext,
  type PanelRoute,
  type ReadItem,
  type RuntimeResponse,
  type VaultSecrets,
  type VaultStatus,
} from "../shared/protocol";

const SESSION_KEY = "driveVaultSession";
const STORED_VAULT_KEY = "storedVault";
const ENABLED_SITES_KEY = "enabledSites";
const AUTO_LOCK_MINUTES_KEY = "autoLockMinutes";
const LOCK_ALARM = "drive-vault-auto-lock";

type SessionState = {
  vault: VaultSecrets;
  storageMode: "session" | "stored";
  expiresAt: number;
  autoLockMinutes: number;
  masterPassword?: string;
};

type Message = Record<string, unknown> & { type: string };
let decryptQueue: Promise<void> = Promise.resolve();

function fail(message: string): never {
  throw new Error(message);
}

async function storedVaultPayload(): Promise<string | null> {
  const values = await chrome.storage.local.get(STORED_VAULT_KEY);
  return typeof values[STORED_VAULT_KEY] === "string" ? values[STORED_VAULT_KEY] : null;
}

function validAutoLockMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_AUTO_LOCK_MINUTES &&
    value <= MAX_AUTO_LOCK_MINUTES
  );
}

function assertAutoLockMinutes(value: unknown): number {
  if (!validAutoLockMinutes(value)) {
    fail(
      `Auto-lock must be a whole number from ${MIN_AUTO_LOCK_MINUTES} to ${MAX_AUTO_LOCK_MINUTES} minutes`,
    );
  }
  return value;
}

async function readAutoLockMinutes(): Promise<number> {
  const values = await chrome.storage.local.get(AUTO_LOCK_MINUTES_KEY);
  const value = values[AUTO_LOCK_MINUTES_KEY];
  return validAutoLockMinutes(value) ? value : DEFAULT_AUTO_LOCK_MINUTES;
}

async function saveAutoLockMinutes(value: unknown): Promise<number> {
  const autoLockMinutes = assertAutoLockMinutes(value);
  await chrome.storage.local.set({ [AUTO_LOCK_MINUTES_KEY]: autoLockMinutes });
  return autoLockMinutes;
}

async function readSession(): Promise<SessionState | null> {
  const values = await chrome.storage.session.get(SESSION_KEY);
  const state = values[SESSION_KEY] as SessionState | undefined;
  if (!state) return null;
  if (state.expiresAt <= Date.now()) {
    await lockVault();
    return null;
  }
  if (validAutoLockMinutes(state.autoLockMinutes)) return state;
  return { ...state, autoLockMinutes: await readAutoLockMinutes() };
}

async function writeSession(
  vault: VaultSecrets,
  storageMode: SessionState["storageMode"],
  masterPassword?: string,
  requestedAutoLockMinutes?: number,
): Promise<SessionState> {
  const autoLockMinutes =
    requestedAutoLockMinutes === undefined
      ? await readAutoLockMinutes()
      : assertAutoLockMinutes(requestedAutoLockMinutes);
  const state: SessionState = {
    vault: normalizeVault(vault),
    storageMode,
    expiresAt: Date.now() + autoLockMinutes * 60 * 1000,
    autoLockMinutes,
    ...(masterPassword ? { masterPassword } : {}),
  };
  await chrome.storage.session.set({ [SESSION_KEY]: state });
  await chrome.alarms.create(LOCK_ALARM, { when: state.expiresAt });
  return state;
}

async function touchSession(state: SessionState): Promise<SessionState> {
  return writeSession(
    state.vault,
    state.storageMode,
    state.masterPassword,
    state.autoLockMinutes,
  );
}

async function requireSession(touch = false): Promise<SessionState> {
  const state = await readSession();
  if (!state) fail("Drive Vault is locked");
  return touch ? touchSession(state) : state;
}

async function lockVault(): Promise<void> {
  await chrome.storage.session.remove([SESSION_KEY, READ_ITEM_STORAGE_KEY]);
  await chrome.alarms.clear(LOCK_ALARM);
}

function assertVault(value: unknown): VaultSecrets {
  if (!value || typeof value !== "object") fail("Invalid vault data");
  const candidate = value as Partial<VaultSecrets>;
  if (typeof candidate.personal !== "string" || !Array.isArray(candidate.shared)) {
    fail("Invalid vault data");
  }
  for (const entry of candidate.shared) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      typeof entry.name !== "string" ||
      typeof entry.password !== "string"
    ) {
      fail("Invalid shared password entry");
    }
  }
  return normalizeVault(candidate as VaultSecrets);
}

async function vaultStatus(): Promise<VaultStatus> {
  const [session, stored, savedAutoLockMinutes] = await Promise.all([
    readSession(),
    storedVaultPayload(),
    readAutoLockMinutes(),
  ]);
  return {
    configured: Boolean(stored || session),
    locked: !session,
    storageMode: session?.storageMode ?? (stored ? "stored" : "none"),
    expiresAt: session?.expiresAt ?? null,
    autoLockMinutes: session?.autoLockMinutes ?? savedAutoLockMinutes,
    keys: publicKeys(session?.vault ?? null),
  };
}

function keyPassword(vault: VaultSecrets, keyId: string): string {
  if (keyId === "personal") {
    if (!vault.personal) fail("The personal password is not configured");
    return vault.personal;
  }
  const shared = vault.shared.find((entry) => entry.id === keyId);
  if (!shared) fail("That shared password is no longer available");
  return shared.password;
}

async function decryptWithVault(payload: string, keyId?: string) {
  const state = await requireSession(false);
  const available = [
    ...(state.vault.personal
      ? [{ id: "personal", name: "Personal", kind: "personal" as const, password: state.vault.personal }]
      : []),
    ...state.vault.shared.map((entry) => ({ ...entry, kind: "shared" as const })),
  ];
  const candidates = keyId
    ? available.filter((candidate) => candidate.id === keyId)
    : available;
  if (!candidates.length) {
    fail("That decryption key is no longer available");
  }
  for (const candidate of candidates) {
    try {
      const text = await decryptText(payload, candidate.password);
      return { text, keyId: candidate.id, keyName: candidate.name, kind: candidate.kind };
    } catch {
      // A payload is expected to fail for every non-matching password.
    }
  }
  fail(
    keyId
      ? "The selected Drive Vault key could not decrypt this payload"
      : "No active Drive Vault password could decrypt this payload",
  );
}

function queuedDecrypt(
  payload: string,
  keyId?: string,
): ReturnType<typeof decryptWithVault> {
  const operation = decryptQueue.then(() => decryptWithVault(payload, keyId));
  decryptQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

function messageTabId(message: Message, sender: chrome.runtime.MessageSender): number | null {
  if (sender.tab?.id) return sender.tab.id;
  const requested = Number(message.tabId);
  return Number.isInteger(requested) && requested > 0 ? requested : null;
}

async function openSidePanelForTab(tabId: number): Promise<void> {
  // Invoke open before yielding so Chromium retains the click's user activation.
  const configure = chrome.sidePanel.setOptions({
    tabId,
    path: "sidepanel.html",
    enabled: true,
  });
  const opening = chrome.sidePanel.open({ tabId });
  await Promise.all([configure, opening]);
}

async function readItem(): Promise<ReadItem | null> {
  const values = await chrome.storage.session.get(READ_ITEM_STORAGE_KEY);
  return (values[READ_ITEM_STORAGE_KEY] as ReadItem | undefined) ?? null;
}

function siteFromUrl(url: string | undefined): PanelContext["site"] {
  try {
    const hostname = new URL(url ?? "").hostname;
    if (hostname === "mail.google.com") return "gmail";
    if (hostname === "calendar.google.com") return "calendar";
  } catch {
    // Extension and browser-internal pages have no applicable site route.
  }
  return "other";
}

function routeForSite(site: PanelContext["site"]): PanelRoute {
  if (site === "gmail") return "compose";
  if (site === "calendar") return "calendar";
  return "files";
}

async function writePanelContext(
  tabId: number,
  route: PanelRoute,
  site: PanelContext["site"],
): Promise<PanelContext> {
  const context: PanelContext = { tabId, route, site, updatedAt: Date.now() };
  await chrome.storage.session.set({ [PANEL_CONTEXT_STORAGE_KEY]: context });
  return context;
}

async function readPanelContext(): Promise<PanelContext | null> {
  const values = await chrome.storage.session.get(PANEL_CONTEXT_STORAGE_KEY);
  return (values[PANEL_CONTEXT_STORAGE_KEY] as PanelContext | undefined) ?? null;
}

async function decryptReadItem(item: ReadItem): Promise<ReadItem> {
  const requestedKeyId =
    item.requestedKeyId && item.requestedKeyId !== "auto"
      ? item.requestedKeyId
      : undefined;
  try {
    const decrypted = await queuedDecrypt(item.payload, requestedKeyId);
    const ready: ReadItem = {
      ...item,
      status: "ready",
      text: decrypted.text,
      keyId: decrypted.keyId,
      keyName: decrypted.keyName,
      kind: decrypted.kind,
      requestedKeyId: item.requestedKeyId ?? "auto",
      error: undefined,
    };
    await chrome.storage.session.set({ [READ_ITEM_STORAGE_KEY]: ready });
    return ready;
  } catch (error) {
    const failed: ReadItem = {
      ...item,
      status: "error",
      text: undefined,
      keyId: undefined,
      keyName: undefined,
      kind: undefined,
      error: error instanceof Error ? error.message : "This message could not be decrypted",
    };
    await chrome.storage.session.set({ [READ_ITEM_STORAGE_KEY]: failed });
    return failed;
  }
}

function sitePattern(url: string): { origin: string; pattern: string } {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fail("Drive Vault can only be enabled on web pages");
  }
  return { origin: parsed.origin, pattern: `${parsed.origin}/*` };
}

function siteScriptId(origin: string): string {
  let hash = 2166136261;
  for (let index = 0; index < origin.length; index += 1) {
    hash ^= origin.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `drive-vault-${(hash >>> 0).toString(16)}`;
}

async function enabledSites(): Promise<string[]> {
  const values = await chrome.storage.local.get(ENABLED_SITES_KEY);
  return Array.isArray(values[ENABLED_SITES_KEY]) ? values[ENABLED_SITES_KEY] : [];
}

async function registerSite(origin: string): Promise<void> {
  const id = siteScriptId(origin);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length) return;
  await chrome.scripting.registerContentScripts([
    {
      id,
      matches: [`${origin}/*`],
      js: ["content.js"],
      runAt: "document_idle",
      persistAcrossSessions: true,
    },
  ]);
}

async function restoreSiteRegistrations(): Promise<void> {
  const sites = await enabledSites();
  await Promise.all(
    sites.map(async (origin) => {
      try {
        const allowed = await chrome.permissions.contains({ origins: [`${origin}/*`] });
        if (allowed) await registerSite(origin);
      } catch {
        // A stale or malformed site entry should not prevent service-worker startup.
      }
    }),
  );
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) fail("No active browser tab is available");
  return tab;
}

async function enableSite(rawUrl?: string): Promise<{ origin: string; enabled: boolean; builtIn: boolean }> {
  const tab = await activeTab();
  const { origin, pattern } = sitePattern(rawUrl ?? tab?.url ?? "");
  if (DEFAULT_SITES.has(origin)) return { origin, enabled: true, builtIn: true };
  let granted = await chrome.permissions.contains({ origins: [pattern] });
  if (!granted) granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) fail("Site access was not granted");
  const sites = new Set(await enabledSites());
  sites.add(origin);
  await chrome.storage.local.set({ [ENABLED_SITES_KEY]: [...sites].sort() });
  await registerSite(origin);
  if (tab?.id && tab.url && new URL(tab.url).origin === origin) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    } catch {
      // Registration applies on the next navigation if this page cannot be injected now.
    }
  }
  return { origin, enabled: true, builtIn: false };
}

async function disableSite(rawUrl?: string): Promise<{ origin: string; enabled: boolean; builtIn: boolean }> {
  const tab = rawUrl ? null : await activeTab();
  const { origin, pattern } = sitePattern(rawUrl ?? tab?.url ?? "");
  if (DEFAULT_SITES.has(origin)) fail("Gmail and Google Calendar access is built in");
  const sites = new Set(await enabledSites());
  sites.delete(origin);
  await chrome.storage.local.set({ [ENABLED_SITES_KEY]: [...sites].sort() });
  const id = siteScriptId(origin);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [id] });
  await chrome.permissions.remove({ origins: [pattern] });
  return { origin, enabled: false, builtIn: false };
}

async function siteStatus(rawUrl?: string) {
  const tab = rawUrl ? null : await activeTab();
  const { origin, pattern } = sitePattern(rawUrl ?? tab?.url ?? "");
  const builtIn = DEFAULT_SITES.has(origin);
  const enabled = builtIn || (await chrome.permissions.contains({ origins: [pattern] }));
  return { origin, enabled, builtIn };
}

async function handleMessage(message: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case "VAULT_STATUS":
    case "GET_VAULT_STATUS":
      return vaultStatus();
    case "SET_SESSION_VAULT": {
      const vault = assertVault(message.vault);
      const autoLockMinutes =
        message.autoLockMinutes === undefined
          ? await readAutoLockMinutes()
          : await saveAutoLockMinutes(message.autoLockMinutes);
      await chrome.storage.local.remove(STORED_VAULT_KEY);
      await writeSession(vault, "session", undefined, autoLockMinutes);
      return vaultStatus();
    }
    case "CREATE_STORED_VAULT": {
      const vault = assertVault(message.vault);
      const masterPassword = String(message.masterPassword ?? "");
      if (!masterPassword) fail("A master password is required");
      const autoLockMinutes =
        message.autoLockMinutes === undefined
          ? await readAutoLockMinutes()
          : assertAutoLockMinutes(message.autoLockMinutes);
      const payload = await encryptText(JSON.stringify(vault), masterPassword, "aes-256-gcm");
      await chrome.storage.local.set({
        [STORED_VAULT_KEY]: payload,
        [AUTO_LOCK_MINUTES_KEY]: autoLockMinutes,
      });
      await writeSession(vault, "stored", masterPassword, autoLockMinutes);
      return vaultStatus();
    }
    case "UNLOCK_VAULT": {
      const masterPassword = String(message.masterPassword ?? "");
      const payload = await storedVaultPayload();
      if (!payload) fail("No stored password vault exists");
      if (!masterPassword) fail("Enter the master password");
      const plaintext = await decryptText(payload, masterPassword);
      const vault = assertVault(JSON.parse(plaintext) as unknown);
      await writeSession(vault, "stored", masterPassword);
      return vaultStatus();
    }
    case "SET_AUTO_LOCK_MINUTES": {
      const autoLockMinutes = await saveAutoLockMinutes(message.autoLockMinutes);
      const state = await readSession();
      if (state) {
        await writeSession(
          state.vault,
          state.storageMode,
          state.masterPassword,
          autoLockMinutes,
        );
      }
      return vaultStatus();
    }
    case "UPDATE_VAULT": {
      const state = await requireSession(false);
      let vault: VaultSecrets;
      if (message.vault) {
        vault = assertVault(message.vault);
      } else {
        vault = {
          personal: state.vault.personal,
          shared: state.vault.shared.map((entry) => ({ ...entry })),
        };
        switch (message.action) {
          case "set-personal": {
            const password = String(message.password ?? "");
            if (!password) fail("Enter a personal password");
            vault.personal = password;
            break;
          }
          case "upsert-shared": {
            const shared = message.shared as Partial<VaultSecrets["shared"][number]> | undefined;
            if (!shared || typeof shared.name !== "string" || typeof shared.password !== "string") {
              fail("A shared profile needs a name and password");
            }
            const next = {
              id: typeof shared.id === "string" && shared.id ? shared.id : crypto.randomUUID(),
              name: shared.name.trim(),
              password: shared.password,
            };
            if (!next.name || !next.password) fail("A shared profile needs a name and password");
            const index = vault.shared.findIndex((entry) => entry.id === next.id);
            if (index >= 0) vault.shared[index] = next;
            else vault.shared.push(next);
            break;
          }
          case "remove-shared":
            vault.shared = vault.shared.filter((entry) => entry.id !== String(message.id ?? ""));
            break;
          default:
            fail("Unknown password-vault update");
        }
      }
      vault = normalizeVault(vault);
      if (state.storageMode === "stored") {
        const masterPassword = String(message.masterPassword ?? state.masterPassword ?? "");
        if (!masterPassword) fail("Unlock the stored vault again before changing it");
        const payload = await encryptText(JSON.stringify(vault), masterPassword, "aes-256-gcm");
        await chrome.storage.local.set({ [STORED_VAULT_KEY]: payload });
        await writeSession(vault, "stored", masterPassword, state.autoLockMinutes);
      } else {
        await writeSession(vault, "session", undefined, state.autoLockMinutes);
      }
      return vaultStatus();
    }
    case "LOCK_VAULT":
      await lockVault();
      return vaultStatus();
    case "DELETE_STORED_VAULT":
      await lockVault();
      await chrome.storage.local.remove(STORED_VAULT_KEY);
      return vaultStatus();
    case "LIST_KEYS": {
      const state = await requireSession(false);
      return publicKeys(state.vault);
    }
    case "ENCRYPT_TEXT": {
      const state = await requireSession(true);
      const text = String(message.text ?? "");
      if (!text) fail("Enter text to encrypt");
      const keyId = String(message.keyId ?? "personal");
      const algorithm = (message.algorithm ?? "aes-256-gcm") as VaultAlgorithm;
      return {
        ciphertext: await encryptText(text, keyPassword(state.vault, keyId), algorithm),
      };
    }
    case "DECRYPT_TEXT": {
      const requestedKeyId =
        typeof message.keyId === "string" && message.keyId && message.keyId !== "auto"
          ? message.keyId
          : undefined;
      return queuedDecrypt(
        String(message.payload ?? message.ciphertext ?? ""),
        requestedKeyId,
      );
    }
    case "GET_READ_ITEM":
      return readItem();
    case "GET_PANEL_CONTEXT":
      return readPanelContext();
    case "GET_ACTIVE_SITE": {
      const tab = await activeTab();
      const site = siteFromUrl(tab.url);
      return { tabId: tab.id, site, route: routeForSite(site), url: tab.url ?? "" };
    }
    case "CLEAR_READ_ITEM":
      await chrome.storage.session.remove(READ_ITEM_STORAGE_KEY);
      return { cleared: true };
    case "RETRY_READ_ITEM": {
      const existing = await readItem();
      if (!existing) fail("No encrypted message is selected");
      const requestedKeyId =
        typeof message.keyId === "string" && message.keyId
          ? message.keyId
          : "auto";
      const pending: ReadItem = {
        ...existing,
        status: "decrypting",
        text: undefined,
        keyId: undefined,
        keyName: undefined,
        kind: undefined,
        requestedKeyId,
        error: undefined,
      };
      await chrome.storage.session.set({ [READ_ITEM_STORAGE_KEY]: pending });
      return decryptReadItem(pending);
    }
    case "OPEN_DECRYPT_IN_SIDE_PANEL": {
      const tabId = messageTabId(message, sender);
      if (!tabId) fail("No source tab is available for the side panel");
      const payload = String(message.payload ?? "").trim();
      if (!payload.startsWith("GVDV1:")) fail("No Drive Vault payload was provided");
      const item: ReadItem = {
        id: crypto.randomUUID(),
        status: "decrypting",
        payload,
        sourceUrl: String(message.sourceUrl ?? sender.url ?? ""),
        requestedAt: Date.now(),
        requestedKeyId: "auto",
      };
      const context: PanelContext = {
        tabId,
        route: "read",
        site: siteFromUrl(String(message.sourceUrl ?? sender.url ?? "")),
        updatedAt: Date.now(),
      };
      const store = chrome.storage.session.set({
        [READ_ITEM_STORAGE_KEY]: item,
        [PANEL_CONTEXT_STORAGE_KEY]: context,
      });
      const opening = openSidePanelForTab(tabId);
      await Promise.all([store, opening]);
      return decryptReadItem(item);
    }
    case "ENCRYPT_FILE": {
      const state = await requireSession(true);
      const keyId = String(message.keyId ?? "personal");
      const name = String(message.name ?? "encrypted-file");
      const mime = String(message.mime ?? "application/octet-stream");
      const encrypted = await encryptBytes(
        base64ToBytes(String(message.dataBase64 ?? "")),
        keyPassword(state.vault, keyId),
        { originalName: name, originalMime: mime },
        (message.algorithm ?? "aes-256-gcm") as VaultAlgorithm,
      );
      return {
        dataBase64: bytesToBase64(encrypted),
        name: `${name}.gvdv`,
        mime: "application/octet-stream",
      } satisfies FileResult;
    }
    case "DECRYPT_FILE": {
      const state = await requireSession(true);
      const keyId = String(message.keyId ?? "personal");
      const decrypted = await decryptBytes(
        base64ToBytes(String(message.dataBase64 ?? "")),
        keyPassword(state.vault, keyId),
      );
      return {
        dataBase64: bytesToBase64(decrypted.bytes),
        name: decrypted.header.original_name || "decrypted-file",
        mime: decrypted.header.original_mime || "application/octet-stream",
      } satisfies FileResult;
    }
    case "OPEN_SIDE_PANEL": {
      const tabId = messageTabId(message, sender) ?? (await activeTab()).id;
      if (!tabId) fail("No active browser tab is available");
      const requestedTarget = String(message.target ?? message.site ?? "");
      const explicitSite: PanelContext["site"] | null =
        requestedTarget === "gmail" || requestedTarget === "calendar"
          ? requestedTarget
          : null;
      const opening = openSidePanelForTab(tabId);
      const routing = (async () => {
        const site = explicitSite ?? siteFromUrl((await chrome.tabs.get(tabId)).url);
        return writePanelContext(tabId, routeForSite(site), site);
      })();
      await Promise.all([opening, routing]);
      return { opened: true };
    }
    case "INSERT_IN_ACTIVE_TAB": {
      const tab = await activeTab();
      const response = await chrome.tabs.sendMessage(tab.id!, {
        type: "INSERT_CIPHERTEXT",
        target: message.target,
        ciphertext: message.ciphertext,
        fields: message.fields,
      });
      if (response && typeof response === "object" && response.ok === false) {
        fail(typeof response.error === "string" ? response.error : "The page rejected the ciphertext");
      }
      return response ?? { inserted: true };
    }
    case "ENABLE_CURRENT_SITE":
      return enableSite(typeof message.url === "string" ? message.url : undefined);
    case "DISABLE_CURRENT_SITE":
      return disableSite(typeof message.url === "string" ? message.url : undefined);
    case "CURRENT_SITE_STATUS":
    case "GET_CURRENT_SITE_STATUS":
      return siteStatus(typeof message.url === "string" ? message.url : undefined);
    default:
      fail(`Unknown Drive Vault request: ${message.type}`);
  }
}

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((data) => sendResponse({ ok: true, data } satisfies RuntimeResponse))
    .catch((error: unknown) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Drive Vault request failed",
      } satisfies RuntimeResponse),
    );
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LOCK_ALARM) void lockVault();
});

chrome.runtime.onInstalled.addListener(() => {
  void restoreSiteRegistrations();
});

chrome.runtime.onStartup.addListener(() => {
  void restoreSiteRegistrations();
});

void restoreSiteRegistrations();
