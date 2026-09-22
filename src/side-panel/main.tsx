import {
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  Copy,
  Download,
  FileKey2,
  FileLock2,
  FileOutput,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { sendMessage } from "../shared/chrome";
import {
  PANEL_CONTEXT_STORAGE_KEY,
  READ_ITEM_STORAGE_KEY,
  type FileResult,
  type PanelContext,
  type PanelRoute,
  type PublicKeyOption,
  type ReadItem,
} from "../shared/protocol";
import "../ui.css";

type WorkspaceTab = PanelRoute;
type FileMode = "encrypt" | "decrypt";
type CalendarField = "title" | "location" | "description";
type CalendarOutput = Partial<Record<CalendarField, string>>;
type InsertResult = { ok?: boolean; error?: string };
const AUTO_DECRYPT_KEY_ID = "auto";
const MAX_FILE_MIB = 40;
const MAX_FILE_BYTES = MAX_FILE_MIB * 1024 * 1024;

type ToastState = {
  id: number;
  tone: "success" | "error";
  message: string;
};

type CiphertextResponse = string | { ciphertext: string };
type KeysResponse = PublicKeyOption[] | { keys: PublicKeyOption[] };

const TABS: Array<{
  id: WorkspaceTab;
  label: string;
  icon: typeof Mail;
}> = [
  { id: "read", label: "Read", icon: BookOpenText },
  { id: "compose", label: "Compose", icon: Mail },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "files", label: "Files", icon: FileLock2 },
];

function asError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

function unwrapCiphertext(response: CiphertextResponse): string {
  return typeof response === "string" ? response : response.ciphertext;
}

async function encryptText(text: string, keyId: string): Promise<string> {
  const response = await sendMessage<CiphertextResponse>({
    type: "ENCRYPT_TEXT",
    keyId,
    text,
  });
  const ciphertext = unwrapCiphertext(response);
  if (!ciphertext) throw new Error("The service worker returned no ciphertext.");
  return ciphertext;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return value.toFixed(value >= 10 ? 1 : 2) + " " + units[unitIndex];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read the file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function downloadFile(result: FileResult) {
  const bytes = base64ToBytes(result.dataBase64);
  const data = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([data], {
    type: result.mime || "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SidePanelApp() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("compose");
  const [readItem, setReadItem] = useState<ReadItem | null>(null);
  const [keys, setKeys] = useState<PublicKeyOption[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [keyError, setKeyError] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);

  const notify = useCallback((tone: ToastState["tone"], message: string) => {
    setToast({ id: Date.now(), tone, message });
  }, []);

  const loadKeys = useCallback(async () => {
    setLoadingKeys(true);
    setKeyError("");
    try {
      const response = await sendMessage<KeysResponse>({ type: "LIST_KEYS" });
      const nextKeys = Array.isArray(response) ? response : response.keys;
      setKeys(nextKeys ?? []);
    } catch (error) {
      setKeys([]);
      setKeyError(asError(error));
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  const openVaultUnlock = useCallback(async () => {
    try {
      if (typeof chrome.action.openPopup === "function") {
        try {
          await chrome.action.openPopup();
          return;
        } catch {
          // Chrome 120-126 exposes no generally available openPopup support.
        }
      }

      await chrome.windows.create({
        url: chrome.runtime.getURL("popup.html"),
        type: "popup",
        width: 390,
        height: 600,
        focused: true,
      });
    } catch (error) {
      notify("error", `Could not open the vault: ${asError(error)}`);
    }
  }, [notify]);

  const syncActiveSite = useCallback(async () => {
    try {
      const active = await sendMessage<Pick<PanelContext, "site" | "route" | "tabId">>({
        type: "GET_ACTIVE_SITE",
      });
      if (active.site === "gmail") setActiveTab("compose");
      if (active.site === "calendar") setActiveTab("calendar");
    } catch {
      // The existing tab remains selected when the active page is inaccessible.
    }
  }, []);

  const loadPanelState = useCallback(async () => {
    const [item, context, active] = await Promise.all([
      sendMessage<ReadItem | null>({ type: "GET_READ_ITEM" }).catch(() => null),
      sendMessage<PanelContext | null>({ type: "GET_PANEL_CONTEXT" }).catch(() => null),
      sendMessage<Pick<PanelContext, "site" | "route" | "tabId">>({
        type: "GET_ACTIVE_SITE",
      }).catch(() => null),
    ]);
    setReadItem(item);
    if (context && active && context.tabId === active.tabId) {
      setActiveTab(context.route === "read" && !item ? active.route : context.route);
      return;
    }
    if (active?.site === "gmail") setActiveTab("compose");
    if (active?.site === "calendar") setActiveTab("calendar");
  }, []);

  useEffect(() => {
    void loadKeys();
    void loadPanelState();
  }, [loadKeys, loadPanelState]);

  useEffect(() => {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "session") return;
      if (changes.driveVaultSession) void loadKeys();
      const readChange = changes[READ_ITEM_STORAGE_KEY];
      if (readChange) {
        const next = (readChange.newValue as ReadItem | undefined) ?? null;
        setReadItem(next);
        if (next) setActiveTab("read");
      }
      const contextChange = changes[PANEL_CONTEXT_STORAGE_KEY];
      const nextContext = contextChange?.newValue as PanelContext | undefined;
      if (nextContext) setActiveTab(nextContext.route);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [loadKeys]);

  useEffect(() => {
    const onActivated = () => void syncActiveSite();
    const onUpdated = (
      _tabId: number,
      changeInfo: { url?: string; status?: string },
      tab: chrome.tabs.Tab,
    ) => {
      if (tab.active && (changeInfo.url || changeInfo.status === "complete")) {
        void syncActiveSite();
      }
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [syncActiveSite]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const feedback = toast ? (
    <PanelNotice toast={toast} onDismiss={() => setToast(null)} />
  ) : null;

  return (
    <div className="side-panel-shell">
      <header className="app-header side-panel-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <ShieldCheck size={19} />
          </span>
          <span>
            <strong>Drive Vault</strong>
            <small>Secure workspace</small>
          </span>
        </div>
        <span className={"vault-indicator " + (keys.length ? "ready" : "")}>
          <LockKeyhole size={14} />
          {loadingKeys ? "Loading" : keys.length ? "Unlocked" : "Locked"}
        </span>
      </header>

      <nav className="workspace-tabs" role="tablist" aria-label="Secure workspace">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={17} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {keyError && (
        <div className="workspace-alert" role="alert">
          <AlertCircle size={17} />
          <span>{keyError}</span>
          <button
            className="icon-button"
            type="button"
            title="Unlock vault"
            aria-label="Open vault unlock"
            onClick={() => void openVaultUnlock()}
          >
            <KeyRound size={16} />
          </button>
        </div>
      )}

      <main className="workspace-content">
        {activeTab === "read" && (
          <ReadPanel
            item={readItem}
            keys={keys}
            disabled={loadingKeys || !keys.length}
            onChange={setReadItem}
            notify={notify}
            feedback={feedback}
          />
        )}
        {activeTab === "compose" && (
          <ComposePanel keys={keys} notify={notify} disabled={loadingKeys || !keys.length} feedback={feedback} />
        )}
        {activeTab === "calendar" && (
          <CalendarPanel keys={keys} notify={notify} disabled={loadingKeys || !keys.length} feedback={feedback} />
        )}
        {activeTab === "files" && (
          <FilesPanel keys={keys} notify={notify} disabled={loadingKeys || !keys.length} feedback={feedback} />
        )}
      </main>
    </div>
  );
}

function PanelNotice({
  toast,
  onDismiss,
}: {
  toast: ToastState;
  onDismiss: () => void;
}) {
  return (
    <div className={"toast " + toast.tone} role="status" key={toast.id}>
      {toast.tone === "success" ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
      <span>{toast.message}</span>
      <button
        className="icon-button"
        type="button"
        title="Dismiss"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <X size={15} />
      </button>
    </div>
  );
}

function ReadPanel({
  item,
  keys,
  disabled,
  onChange,
  notify,
  feedback,
}: {
  item: ReadItem | null;
  keys: PublicKeyOption[];
  disabled: boolean;
  onChange: (item: ReadItem | null) => void;
  notify: (tone: ToastState["tone"], message: string) => void;
  feedback?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [keyId, setKeyId] = useState(AUTO_DECRYPT_KEY_ID);

  useEffect(() => {
    const nextKeyId =
      item?.status === "ready" && item.keyId
        ? item.keyId
        : item?.requestedKeyId ?? AUTO_DECRYPT_KEY_ID;
    setKeyId(
      nextKeyId === AUTO_DECRYPT_KEY_ID || keys.some((key) => key.id === nextKeyId)
        ? nextKeyId
        : AUTO_DECRYPT_KEY_ID,
    );
  }, [item?.id, item?.keyId, item?.requestedKeyId, item?.status, keys]);

  const selectedKey = keys.find((key) => key.id === keyId);
  let source = "Encrypted page text";
  if (item?.sourceUrl) {
    try {
      source = new URL(item.sourceUrl).hostname;
    } catch {
      source = "Encrypted page text";
    }
  }

  async function clearItem() {
    setBusy(true);
    try {
      await sendMessage({ type: "CLEAR_READ_ITEM" });
      onChange(null);
    } catch (error) {
      notify("error", asError(error));
    } finally {
      setBusy(false);
    }
  }

  async function retry(requestedKeyId = keyId) {
    setBusy(true);
    try {
      const next = await sendMessage<ReadItem>({
        type: "RETRY_READ_ITEM",
        keyId: requestedKeyId,
      });
      onChange(next);
    } catch (error) {
      notify("error", asError(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyPlaintext() {
    if (!item?.text) return;
    try {
      await navigator.clipboard.writeText(item.text);
      notify("success", "Decrypted text copied.");
    } catch (error) {
      notify("error", asError(error));
    }
  }

  return (
    <section className="workspace-panel read-panel">
      <PanelTitle icon={BookOpenText} title="Read" meta={source} />

      <KeyPicker
        id="read-key"
        label="Decryption key"
        keys={keys}
        value={keyId}
        autoOption={{ value: AUTO_DECRYPT_KEY_ID, label: "Try all keys" }}
        onChange={(value) => {
          setKeyId(value);
          if (item && item.status !== "decrypting") void retry(value);
        }}
        disabled={disabled || busy || item?.status === "decrypting"}
      />

      {!item && (
        <div className="read-state">
          <BookOpenText size={24} />
          <strong>No encrypted message selected</strong>
          <span>Use a Decrypt button beside encrypted page text.</span>
        </div>
      )}

      {item?.status === "decrypting" && (
        <div className="read-state" role="status">
          <LoaderCircle className="spin" size={24} />
          <strong>Decrypting message</strong>
          <span>
            {keyId === AUTO_DECRYPT_KEY_ID
              ? "Trying your active personal and shared passwords."
              : `Trying ${selectedKey?.name ?? "the selected key"}.`}
          </span>
        </div>
      )}

      {item?.status === "error" && (
        <div className="read-state error" role="alert">
          <AlertCircle size={24} />
          <strong>Could not decrypt</strong>
          <span>{item.error || "Try another decryption key or check the shared password."}</span>
          <div className="action-row">
            <button className="button primary" type="button" disabled={busy} onClick={() => void retry()}>
              <RefreshCw size={16} />
              Retry
            </button>
            <button className="button" type="button" disabled={busy} onClick={() => void clearItem()}>
              Clear
            </button>
          </div>
        </div>
      )}

      {item?.status === "ready" && (
        <>
          <div className="read-meta">
            <span className="format-badge">{item.kind === "personal" ? "Personal" : item.keyName || "Shared"}</span>
            <span>{source}</span>
          </div>
          <div className="read-output" role="document" tabIndex={0}>
            {item.text || "(empty message)"}
          </div>
          <div className="action-row split">
            <button className="button secondary" type="button" onClick={() => void copyPlaintext()}>
              <Copy size={16} />
              Copy
            </button>
            <button className="button" type="button" disabled={busy} onClick={() => void clearItem()}>
              <Trash2 size={16} />
              Clear
            </button>
          </div>
        </>
      )}
      {feedback}
    </section>
  );
}

function useSelectedKey(keys: PublicKeyOption[]) {
  const preferred = useMemo(
    () => keys.find((key) => key.kind === "personal")?.id ?? keys[0]?.id ?? "",
    [keys],
  );
  const [keyId, setKeyId] = useState(preferred);

  useEffect(() => {
    if (!keys.some((key) => key.id === keyId)) setKeyId(preferred);
  }, [keyId, keys, preferred]);

  return [keyId, setKeyId] as const;
}

function KeyPicker({
  id,
  label = "Encryption key",
  keys,
  value,
  onChange,
  disabled,
  autoOption,
}: {
  id: string;
  label?: string;
  keys: PublicKeyOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoOption?: { value: string; label: string };
}) {
  return (
    <label className="field key-picker" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="select-with-icon">
        <KeyRound size={16} />
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        >
          {keys.length === 0 && <option value={value}>Unlock the vault</option>}
          {keys.length > 0 && autoOption && (
            <option value={autoOption.value}>{autoOption.label}</option>
          )}
          {keys.map((key) => (
            <option value={key.id} key={key.id}>
              {key.kind === "personal" ? "Personal" : key.name}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

function PanelTitle({
  icon: Icon,
  title,
  meta,
}: {
  icon: typeof Mail;
  title: string;
  meta?: string;
}) {
  return (
    <div className="panel-title">
      <span className="section-icon"><Icon size={17} /></span>
      <span>
        <h1>{title}</h1>
        {meta && <p>{meta}</p>}
      </span>
    </div>
  );
}

function ComposePanel({
  keys,
  disabled,
  notify,
  feedback,
}: {
  keys: PublicKeyOption[];
  disabled: boolean;
  notify: (tone: ToastState["tone"], message: string) => void;
  feedback?: ReactNode;
}) {
  const [keyId, setKeyId] = useSelectedKey(keys);
  const [plaintext, setPlaintext] = useState("");
  const [ciphertext, setCiphertext] = useState("");
  const [busy, setBusy] = useState(false);

  function changePlaintext(value: string) {
    setPlaintext(value);
    setCiphertext("");
  }

  async function runEncrypt(event: FormEvent) {
    event.preventDefault();
    if (!plaintext.trim() || !keyId) return;
    setBusy(true);
    try {
      setCiphertext(await encryptText(plaintext, keyId));
      notify("success", "Message encrypted.");
    } catch (error) {
      notify("error", asError(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyCiphertext() {
    try {
      await navigator.clipboard.writeText(ciphertext);
      notify("success", "Ciphertext copied.");
    } catch (error) {
      notify("error", asError(error));
    }
  }

  async function insertIntoGmail() {
    if (!ciphertext) return;
    setBusy(true);
    try {
      const result = await sendMessage<InsertResult>({
        type: "INSERT_IN_ACTIVE_TAB",
        target: "gmail",
        ciphertext,
      });
      if (result?.ok === false) throw new Error(result.error || "Gmail rejected the insertion.");
      setPlaintext("");
      notify("success", "Encrypted message inserted. Plaintext cleared.");
    } catch (error) {
      notify("error", asError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="workspace-panel" onSubmit={(event) => void runEncrypt(event)}>
      <PanelTitle icon={Mail} title="Compose" meta="Gmail message" />

      <KeyPicker
        id="compose-key"
        keys={keys}
        value={keyId}
        onChange={(value) => {
          setKeyId(value);
          setCiphertext("");
        }}
        disabled={disabled || busy}
      />

      <label className="field grow-field" htmlFor="compose-message">
        <span className="field-label-row">
          <span className="field-label">Message</span>
          <span className="field-meta">{plaintext.length.toLocaleString()} characters</span>
        </span>
        <textarea
          id="compose-message"
          className="compose-input"
          value={plaintext}
          onChange={(event) => changePlaintext(event.target.value)}
          placeholder="Write a private message"
          disabled={disabled || busy}
          autoComplete="off"
          spellCheck
        />
      </label>

      <div className="action-row">
        <button
          className="button primary"
          type="submit"
          disabled={disabled || busy || !keyId || !plaintext.trim()}
        >
          {busy ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={17} />}
          Encrypt
        </button>
        <button
          className="icon-button danger"
          type="button"
          title="Clear message"
          aria-label="Clear message"
          disabled={busy || (!plaintext && !ciphertext)}
          onClick={() => {
            setPlaintext("");
            setCiphertext("");
          }}
        >
          <Trash2 size={17} />
        </button>
      </div>
      {feedback}

      {ciphertext && (
        <section className="result-section" aria-labelledby="compose-result-label">
          <div className="result-heading">
            <span>
              <CheckCircle2 size={16} />
              <strong id="compose-result-label">Encrypted output</strong>
            </span>
            <span className="format-badge">GVDV1</span>
          </div>
          <textarea
            className="cipher-output"
            value={ciphertext}
            readOnly
            aria-label="Encrypted output"
          />
          <div className="action-row split">
            <button className="button secondary" type="button" onClick={() => void copyCiphertext()}>
              <Copy size={16} />
              Copy
            </button>
            <button
              className="button primary"
              type="button"
              disabled={busy}
              onClick={() => void insertIntoGmail()}
            >
              <Send size={16} />
              Insert into Gmail
            </button>
          </div>
        </section>
      )}
    </form>
  );
}

type EncryptToggleProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

function EncryptToggle({ id, label, checked, onChange, disabled }: EncryptToggleProps) {
  return (
    <label className="toggle-control" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className="toggle-track" aria-hidden="true"><span /></span>
      <span>{label}</span>
    </label>
  );
}

function CalendarPanel({
  keys,
  disabled,
  notify,
  feedback,
}: {
  keys: PublicKeyOption[];
  disabled: boolean;
  notify: (tone: ToastState["tone"], message: string) => void;
  feedback?: ReactNode;
}) {
  const [keyId, setKeyId] = useSelectedKey(keys);
  const [values, setValues] = useState<Record<CalendarField, string>>({
    title: "",
    location: "",
    description: "",
  });
  const [encryptFields, setEncryptFields] = useState<Record<CalendarField, boolean>>({
    title: true,
    location: true,
    description: true,
  });
  const [output, setOutput] = useState<CalendarOutput | null>(null);
  const [busy, setBusy] = useState(false);

  function updateValue(field: CalendarField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setOutput(null);
  }

  function updateToggle(field: CalendarField, checked: boolean) {
    setEncryptFields((current) => ({ ...current, [field]: checked }));
    if (!checked) {
      setValues((current) => ({ ...current, [field]: "" }));
    }
    setOutput(null);
  }

  async function runEncrypt(event: FormEvent) {
    event.preventDefault();
    if (!keyId) return;
    setBusy(true);
    try {
      const fields = (["title", "location", "description"] as CalendarField[]);
      const includedFields = fields.filter(
        (field) => encryptFields[field] && Boolean(values[field].trim()),
      );
      if (!includedFields.length) throw new Error("Enter at least one enabled field.");
      const encrypted = await Promise.all(
        includedFields.map((field) => encryptText(values[field], keyId)),
      );
      setOutput(
        Object.fromEntries(
          includedFields.map((field, index) => [field, encrypted[index]]),
        ) as CalendarOutput,
      );
      notify("success", "Calendar fields prepared.");
    } catch (error) {
      notify("error", asError(error));
    } finally {
      setBusy(false);
    }
  }

  async function insertIntoCalendar() {
    if (!output) return;
    setBusy(true);
    try {
      const result = await sendMessage<InsertResult>({
        type: "INSERT_IN_ACTIVE_TAB",
        target: "calendar",
        fields: output,
      });
      if (result?.ok === false) {
        throw new Error(result.error || "Calendar rejected the insertion.");
      }
      setValues({ title: "", location: "", description: "" });
      notify("success", "Calendar fields inserted. Plaintext cleared.");
    } catch (error) {
      notify("error", asError(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyEncryptedField(field: CalendarField) {
    const ciphertext = output?.[field];
    if (!ciphertext) return;
    try {
      await navigator.clipboard.writeText(ciphertext);
      notify(
        "success",
        `${field[0].toUpperCase() + field.slice(1)} ciphertext copied.`,
      );
    } catch (error) {
      notify("error", asError(error));
    }
  }

  const encryptedCount = (Object.keys(encryptFields) as CalendarField[]).filter(
    (field) => encryptFields[field] && Boolean(values[field]),
  ).length;

  return (
    <form className="workspace-panel" onSubmit={(event) => void runEncrypt(event)}>
      <PanelTitle icon={CalendarDays} title="Calendar" meta="Event or task fields" />

      <KeyPicker
        id="calendar-key"
        keys={keys}
        value={keyId}
        onChange={(value) => {
          setKeyId(value);
          setOutput(null);
        }}
        disabled={disabled || busy}
      />

      <div className="calendar-field">
        <label className="field" htmlFor="calendar-title">
          <span className="field-label">Title</span>
          <input
            id="calendar-title"
            value={values.title}
            onChange={(event) => updateValue("title", event.target.value)}
            placeholder="Event title"
            disabled={disabled || busy || !encryptFields.title}
            autoComplete="off"
          />
        </label>
        <EncryptToggle
          id="encrypt-calendar-title"
          label="Encrypt title"
          checked={encryptFields.title}
          onChange={(checked) => updateToggle("title", checked)}
          disabled={disabled || busy}
        />
      </div>

      <div className="calendar-field">
        <label className="field" htmlFor="calendar-location">
          <span className="field-label">Location</span>
          <input
            id="calendar-location"
            value={values.location}
            onChange={(event) => updateValue("location", event.target.value)}
            placeholder="Location"
            disabled={disabled || busy || !encryptFields.location}
            autoComplete="off"
          />
        </label>
      </div>

      <div className="calendar-field">
        <label className="field" htmlFor="calendar-description">
          <span className="field-label">Description</span>
          <textarea
            id="calendar-description"
            value={values.description}
            onChange={(event) => updateValue("description", event.target.value)}
            placeholder="Notes or details"
            disabled={disabled || busy || !encryptFields.description}
            autoComplete="off"
            spellCheck
          />
        </label>
      </div>

      <div className="action-row">
        <button
          className="button primary"
          type="submit"
          disabled={disabled || busy || !keyId || encryptedCount === 0}
        >
          {busy ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={17} />}
          Prepare fields
        </button>
        <span className="action-meta">{encryptedCount} encrypted</span>
        <button
          className="icon-button danger"
          type="button"
          title="Clear fields"
          aria-label="Clear fields"
          disabled={busy || !Object.values(values).some(Boolean)}
          onClick={() => {
            setValues({ title: "", location: "", description: "" });
            setOutput(null);
          }}
        >
          <Trash2 size={17} />
        </button>
      </div>
      {feedback}

      {output && (
        <section className="result-section" aria-labelledby="calendar-result-label">
          <div className="result-heading">
            <span>
              <CheckCircle2 size={16} />
              <strong id="calendar-result-label">Fields ready</strong>
            </span>
            <span className="format-badge">GVDV1</span>
          </div>
          <div className="prepared-fields">
            {(Object.keys(output) as CalendarField[]).map((field) => (
              <div className="prepared-row" key={field}>
                <span>{field[0].toUpperCase() + field.slice(1)}</span>
                <code>{output[field] || "Empty"}</code>
                <button
                  className="icon-button prepared-copy"
                  type="button"
                  title={`Copy encrypted ${field}`}
                  aria-label={`Copy encrypted ${field}`}
                  onClick={() => void copyEncryptedField(field)}
                >
                  <Copy size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="button primary wide"
            type="button"
            disabled={busy}
            onClick={() => void insertIntoCalendar()}
          >
            <CalendarDays size={16} />
            Insert into Calendar
          </button>
        </section>
      )}
    </form>
  );
}

function FilesPanel({
  keys,
  disabled,
  notify,
  feedback,
}: {
  keys: PublicKeyOption[];
  disabled: boolean;
  notify: (tone: ToastState["tone"], message: string) => void;
  feedback?: ReactNode;
}) {
  const [keyId, setKeyId] = useSelectedKey(keys);
  const [mode, setMode] = useState<FileMode>("encrypt");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<FileResult | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function chooseMode(nextMode: FileMode) {
    setMode(nextMode);
    setFile(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function chooseFile(nextFile: File | null) {
    setFile(nextFile);
    setResult(null);
  }

  async function processFile(event: FormEvent) {
    event.preventDefault();
    if (!file || !keyId) return;
    setBusy(true);
    try {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error(
          `Choose a file no larger than ${MAX_FILE_MIB} MB for in-memory processing.`,
        );
      }
      const dataBase64 = await fileToBase64(file);
      const nextResult = await sendMessage<FileResult>({
        type: mode === "encrypt" ? "ENCRYPT_FILE" : "DECRYPT_FILE",
        keyId,
        dataBase64,
        name: file.name,
        mime: file.type || "application/octet-stream",
      });
      setResult(nextResult);
      notify("success", mode === "encrypt" ? "File encrypted." : "File decrypted.");
    } catch (error) {
      notify("error", asError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="workspace-panel" onSubmit={(event) => void processFile(event)}>
      <PanelTitle icon={FileLock2} title="Files" meta="Local file processing" />

      <div className="segmented" role="group" aria-label="File operation">
        <button
          className={mode === "encrypt" ? "active" : ""}
          type="button"
          onClick={() => chooseMode("encrypt")}
          disabled={busy}
        >
          <FileKey2 size={16} />
          Encrypt
        </button>
        <button
          className={mode === "decrypt" ? "active" : ""}
          type="button"
          onClick={() => chooseMode("decrypt")}
          disabled={busy}
        >
          <FileOutput size={16} />
          Decrypt
        </button>
      </div>

      <KeyPicker
        id="file-key"
        keys={keys}
        value={keyId}
        onChange={(value) => {
          setKeyId(value);
          setResult(null);
        }}
        disabled={disabled || busy}
      />

      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept={mode === "decrypt" ? ".gvdv,application/octet-stream" : undefined}
        onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
        disabled={disabled || busy}
        tabIndex={-1}
      />

      {file ? (
        <div className="selected-file">
          <span className="file-icon" aria-hidden="true">
            {mode === "encrypt" ? <FileKey2 size={21} /> : <FileOutput size={21} />}
          </span>
          <span className="file-details">
            <strong>{file.name}</strong>
            <small>{formatBytes(file.size)}</small>
          </span>
          <button
            className="icon-button"
            type="button"
            title="Choose another file"
            aria-label="Choose another file"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <RefreshCw size={16} />
          </button>
          <button
            className="icon-button danger"
            type="button"
            title="Remove file"
            aria-label="Remove file"
            disabled={busy}
            onClick={() => chooseFile(null)}
          >
            <X size={17} />
          </button>
        </div>
      ) : (
        <button
          className="file-picker"
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          <span className="file-picker-icon">
            <Upload size={21} />
          </span>
          <span>
            <strong>Choose one file</strong>
            <small>
              {mode === "decrypt" ? "Drive Vault .gvdv file" : "Any local file"}
              {` | Up to ${MAX_FILE_MIB} MB`}
            </small>
          </span>
        </button>
      )}

      <button
        className="button primary wide"
        type="submit"
        disabled={disabled || busy || !file || !keyId}
      >
        {busy ? (
          <LoaderCircle className="spin" size={17} />
        ) : mode === "encrypt" ? (
          <LockKeyhole size={17} />
        ) : (
          <FileOutput size={17} />
        )}
        {busy ? "Processing..." : mode === "encrypt" ? "Encrypt file" : "Decrypt file"}
      </button>
      {feedback}

      {result && (
        <section className="result-section file-result" aria-labelledby="file-result-label">
          <div className="result-heading">
            <span>
              <CheckCircle2 size={16} />
              <strong id="file-result-label">Ready to download</strong>
            </span>
          </div>
          <div className="download-row">
            <span className="file-icon" aria-hidden="true"><FileOutput size={20} /></span>
            <span className="file-details">
              <strong>{result.name}</strong>
              <small>{result.mime || "application/octet-stream"}</small>
            </span>
            <button className="button primary" type="button" onClick={() => downloadFile(result)}>
              <Download size={16} />
              Download
            </button>
          </div>
        </section>
      )}
    </form>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Side panel root element was not found");
createRoot(root).render(<SidePanelApp />);

export { SidePanelApp };
