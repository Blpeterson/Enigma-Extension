import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  LockKeyhole,
  PanelRightOpen,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { sendMessage } from "../shared/chrome";
import {
  DEFAULT_AUTO_LOCK_MINUTES,
  DEFAULT_SITES,
  MAX_AUTO_LOCK_MINUTES,
  MIN_AUTO_LOCK_MINUTES,
  type SharedSecret,
  type VaultSecrets,
  type VaultStatus,
} from "../shared/protocol";
import "../ui.css";

type StorageChoice = "session" | "stored";

type CurrentSite = {
  tabId: number | null;
  origin: string;
  hostname: string;
  eligible: boolean;
  enabled: boolean;
  builtIn: boolean;
};

type ExtendedVaultStatus = VaultStatus;

type SharedDraft = SharedSecret & {
  localId: string;
};

const AUTO_LOCK_OPTIONS = Array.from(
  { length: MAX_AUTO_LOCK_MINUTES - MIN_AUTO_LOCK_MINUTES + 1 },
  (_, index) => MIN_AUTO_LOCK_MINUTES + index,
);

const EMPTY_SITE: CurrentSite = {
  tabId: null,
  origin: "",
  hostname: "This page",
  eligible: false,
  enabled: false,
  builtIn: false,
};

function newSharedDraft(): SharedDraft {
  return {
    id: "",
    localId: crypto.randomUUID(),
    name: "",
    password: "",
  };
}

function asError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

function formatRemaining(expiresAt: number | null, now: number): string {
  if (!expiresAt) return "No inactivity timer";
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return "Locks in " + minutes + ":" + String(remainder).padStart(2, "0");
}

async function readCurrentSite(): Promise<CurrentSite> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return { ...EMPTY_SITE, tabId: tab?.id ?? null };

  try {
    const url = new URL(tab.url);
    const eligible = url.protocol === "https:" || url.protocol === "http:";
    const origin = eligible ? url.origin : "";
    const fallbackBuiltIn = DEFAULT_SITES.has(origin);
    let enabled = fallbackBuiltIn;
    let builtIn = fallbackBuiltIn;

    if (eligible) {
      try {
        const siteStatus = await sendMessage<{
          origin: string;
          enabled: boolean;
          builtIn: boolean;
        }>({
          type: "CURRENT_SITE_STATUS",
          url: tab.url,
        });
        enabled = siteStatus.enabled;
        builtIn = siteStatus.builtIn;
      } catch {
        // The fallback still gives built-in sites an accurate initial state.
      }
    }

    return {
      tabId: tab.id ?? null,
      origin,
      hostname: eligible ? url.hostname : url.protocol.replace(":", ""),
      eligible,
      enabled,
      builtIn,
    };
  } catch {
    return EMPTY_SITE;
  }
}

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  autoComplete?: string;
};

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  disabled,
  autoComplete = "new-password",
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="input-with-action">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          autoComplete={autoComplete}
          spellCheck={false}
        />
        <button
          className="icon-button input-action"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          title={visible ? "Hide password" : "Show password"}
          disabled={disabled}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
    </label>
  );
}

function AutoLockSelect({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field" htmlFor="auto-lock-minutes">
      <span className="field-label">Auto-lock after</span>
      <span className="select-with-icon">
        <Clock3 size={16} />
        <select
          id="auto-lock-minutes"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          disabled={disabled}
        >
          {AUTO_LOCK_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} {minutes === 1 ? "minute" : "minutes"}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "error" | "success" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <div className={"notice " + tone} role={tone === "error" ? "alert" : "status"}>
      {tone === "error" ? <AlertCircle size={16} /> : <Check size={16} />}
      <span>{children}</span>
    </div>
  );
}

function PopupApp() {
  const [status, setStatus] = useState<ExtendedVaultStatus | null>(null);
  const [site, setSite] = useState<CurrentSite>(EMPTY_SITE);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    setError("");
    try {
      const nextStatus = await sendMessage<ExtendedVaultStatus>({ type: "VAULT_STATUS" });
      setStatus(nextStatus);
      setSite(await readCurrentSite());
    } catch (refreshError) {
      setError(asError(refreshError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (status?.expiresAt && status.expiresAt <= now && !status.locked) {
      void refresh();
    }
  }, [now, refresh, status?.expiresAt, status?.locked]);

  const runAction = useCallback(
    async (action: () => Promise<void>, successMessage?: string) => {
      setBusy(true);
      setError("");
      setSuccess("");
      try {
        await action();
        if (successMessage) setSuccess(successMessage);
      } catch (actionError) {
        setError(asError(actionError));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  async function setSiteAccess(enabled: boolean) {
    if (!site.eligible || !site.origin) return;
    await runAction(async () => {
      if (enabled && !site.builtIn) {
        const granted = await chrome.permissions.request({
          origins: [`${site.origin}/*`],
        });
        if (!granted) throw new Error("Site access was not granted.");
      }
      await sendMessage<void>({
        type: enabled ? "ENABLE_CURRENT_SITE" : "DISABLE_CURRENT_SITE",
        url: site.origin,
      });
      setSite((current) => ({ ...current, enabled }));
    }, enabled ? "Live decryption enabled for this site." : "Live decryption disabled for this site.");
  }

  if (loading) {
    return (
      <div className="popup-shell loading-state">
        <RefreshCw className="spin" size={20} />
        <span>Opening vault</span>
      </div>
    );
  }

  const view = !status?.configured ? "setup" : status.locked ? "locked" : "unlocked";

  return (
    <div className="popup-shell">
      <header className="app-header popup-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <ShieldCheck size={19} />
          </span>
          <span>
            <strong>Drive Vault</strong>
            <small>
              {view === "setup"
                ? "Set up encryption"
                : view === "locked"
                  ? "Vault locked"
                  : "Vault unlocked"}
            </small>
          </span>
        </div>
        {view === "unlocked" && (
          <button
            className="icon-button"
            type="button"
            title="Lock vault"
            aria-label="Lock vault"
            disabled={busy}
            onClick={() =>
              void runAction(async () => {
                await sendMessage<void>({ type: "LOCK_VAULT" });
                await refresh();
              })
            }
          >
            <LockKeyhole size={17} />
          </button>
        )}
      </header>

      <div className="popup-scroll">
        {error && <Notice tone="error">{error}</Notice>}
        {success && <Notice tone="success">{success}</Notice>}
        {view === "setup" && (
          <SetupView
            busy={busy}
            onSubmit={(choice, vault, masterPassword, autoLockMinutes) =>
              runAction(async () => {
                if (choice === "session") {
                  await sendMessage<VaultStatus>({
                    type: "SET_SESSION_VAULT",
                    vault,
                    autoLockMinutes,
                  });
                } else {
                  await sendMessage<VaultStatus>({
                    type: "CREATE_STORED_VAULT",
                    vault,
                    masterPassword,
                    autoLockMinutes,
                  });
                }
                await refresh();
              }, choice === "session" ? "Session vault ready." : "Encrypted vault created.")
            }
          />
        )}
        {view === "locked" && (
          <LockedView
            busy={busy}
            autoLockMinutes={status?.autoLockMinutes ?? DEFAULT_AUTO_LOCK_MINUTES}
            onAutoLockChange={(autoLockMinutes) =>
              runAction(async () => {
                await sendMessage<VaultStatus>({
                  type: "SET_AUTO_LOCK_MINUTES",
                  autoLockMinutes,
                });
                await refresh();
              }, "Auto-lock timer updated.")
            }
            onUnlock={(masterPassword) =>
              runAction(async () => {
                await sendMessage<VaultStatus>({ type: "UNLOCK_VAULT", masterPassword });
                await refresh();
              })
            }
          />
        )}
        {view === "unlocked" && status && (
          <UnlockedView
            status={status}
            busy={busy}
            timerLabel={formatRemaining(status.expiresAt, now)}
            onUpdate={async (message, successMessage) => {
              let succeeded = false;
              await runAction(async () => {
                await sendMessage<VaultStatus>(message);
                await refresh();
                succeeded = true;
              }, successMessage);
              return succeeded;
            }}
          />
        )}

        {view !== "setup" && (
          <section className="popup-section site-section" aria-labelledby="site-access-heading">
            <div className="section-heading">
              <span className="section-icon"><Globe2 size={16} /></span>
              <span>
                <h2 id="site-access-heading">{site.hostname}</h2>
                <p>
                  {site.builtIn
                    ? "Built-in Google integration"
                    : site.enabled
                      ? "Live decryption allowed"
                      : "Live decryption not allowed"}
                </p>
              </span>
            </div>
            <button
              className={site.enabled ? "button secondary" : "button"}
              type="button"
              disabled={busy || !site.eligible || site.builtIn}
              onClick={() => void setSiteAccess(!site.enabled)}
            >
              {site.enabled ? "Disable on site" : "Enable on site"}
            </button>
          </section>
        )}
      </div>

      {view === "unlocked" && (
        <footer className="popup-footer">
          <button
            className="button primary wide"
            type="button"
            disabled={busy}
            onClick={() =>
              void runAction(async () => {
                await sendMessage<void>({ type: "OPEN_SIDE_PANEL", tabId: site.tabId });
                window.close();
              })
            }
          >
            <PanelRightOpen size={17} />
            Open secure workspace
            <ChevronRight size={16} />
          </button>
        </footer>
      )}
    </div>
  );
}

function SetupView({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (
    choice: StorageChoice,
    vault: VaultSecrets,
    masterPassword: string,
    autoLockMinutes: number,
  ) => Promise<void>;
}) {
  const [choice, setChoice] = useState<StorageChoice>("stored");
  const [personal, setPersonal] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [autoLockMinutes, setAutoLockMinutes] = useState(DEFAULT_AUTO_LOCK_MINUTES);
  const [shared, setShared] = useState<SharedDraft[]>([]);
  const [formError, setFormError] = useState("");

  function updateShared(localId: string, patch: Partial<SharedDraft>) {
    setShared((current) =>
      current.map((entry) => (entry.localId === localId ? { ...entry, ...patch } : entry)),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const incomplete = shared.some(
      (entry) => Boolean(entry.name.trim()) !== Boolean(entry.password),
    );

    if (!personal) {
      setFormError("Enter a personal password.");
      return;
    }
    if (incomplete) {
      setFormError("Each shared profile needs both a name and password.");
      return;
    }
    if (choice === "stored" && masterPassword.length < 8) {
      setFormError("The vault password must be at least 8 characters.");
      return;
    }

    setFormError("");
    await onSubmit(
      choice,
      {
        personal,
        shared: shared
          .filter((entry) => entry.name.trim() && entry.password)
          .map(({ id, name, password }) => ({
            id: id || crypto.randomUUID(),
            name: name.trim(),
            password,
          })),
      },
      masterPassword,
      autoLockMinutes,
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <section className="popup-section">
        <div className="section-title-row">
          <div>
            <h2>Vault storage</h2>
            <p>Choose how passwords remain available.</p>
          </div>
        </div>
        <div className="segmented" role="group" aria-label="Vault storage">
          <button
            className={choice === "session" ? "active" : ""}
            type="button"
            onClick={() => setChoice("session")}
          >
            Session only
          </button>
          <button
            className={choice === "stored" ? "active" : ""}
            type="button"
            onClick={() => setChoice("stored")}
          >
            Encrypted local
          </button>
        </div>
        <AutoLockSelect
          value={autoLockMinutes}
          onChange={setAutoLockMinutes}
          disabled={busy}
        />
        {choice === "stored" && (
          <PasswordField
            id="setup-master-password"
            label="Vault password"
            value={masterPassword}
            onChange={setMasterPassword}
            placeholder="Unlocks saved passwords"
            disabled={busy}
          />
        )}
      </section>

      <section className="popup-section">
        <div className="section-heading compact">
          <span className="section-icon"><UserRound size={16} /></span>
          <span>
            <h2>Personal</h2>
            <p>Your default encryption password</p>
          </span>
        </div>
        <PasswordField
          id="setup-personal-password"
          label="Personal password"
          value={personal}
          onChange={setPersonal}
          placeholder="Required"
          disabled={busy}
        />
      </section>

      <section className="popup-section">
        <div className="section-title-row">
          <div className="section-heading compact">
            <span className="section-icon"><UsersRound size={16} /></span>
            <span>
              <h2>Shared profiles</h2>
              <p>Passwords used with other people</p>
            </span>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Add shared profile"
            aria-label="Add shared profile"
            disabled={busy}
            onClick={() => setShared((current) => [...current, newSharedDraft()])}
          >
            <Plus size={17} />
          </button>
        </div>

        {shared.length === 0 ? (
          <button
            className="empty-action"
            type="button"
            disabled={busy}
            onClick={() => setShared([newSharedDraft()])}
          >
            <Plus size={16} />
            Add a shared password
          </button>
        ) : (
          <div className="profile-editor-list">
            {shared.map((entry, index) => (
              <div className="profile-editor" key={entry.localId}>
                <label className="field" htmlFor={"profile-name-" + entry.localId}>
                  <span className="field-label">Profile name</span>
                  <input
                    id={"profile-name-" + entry.localId}
                    value={entry.name}
                    onChange={(event) =>
                      updateShared(entry.localId, { name: event.target.value })
                    }
                    placeholder="Name or group"
                    disabled={busy}
                  />
                </label>
                <PasswordField
                  id={"profile-password-" + entry.localId}
                  label="Shared password"
                  value={entry.password}
                  onChange={(password) => updateShared(entry.localId, { password })}
                  placeholder="Shared password"
                  disabled={busy}
                />
                <button
                  className="icon-button danger profile-remove"
                  type="button"
                  title={"Remove profile " + (index + 1)}
                  aria-label={"Remove profile " + (index + 1)}
                  disabled={busy}
                  onClick={() =>
                    setShared((current) =>
                      current.filter((candidate) => candidate.localId !== entry.localId),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        {formError && <Notice tone="error">{formError}</Notice>}
      </section>

      <div className="form-actions">
        <button className="button primary wide" type="submit" disabled={busy}>
          {choice === "stored" ? <ShieldCheck size={17} /> : <KeyRound size={17} />}
          {busy ? "Creating vault..." : choice === "stored" ? "Create encrypted vault" : "Start session"}
        </button>
      </div>
    </form>
  );
}

function LockedView({
  busy,
  autoLockMinutes,
  onAutoLockChange,
  onUnlock,
}: {
  busy: boolean;
  autoLockMinutes: number;
  onAutoLockChange: (autoLockMinutes: number) => Promise<void>;
  onUnlock: (masterPassword: string) => Promise<void>;
}) {
  const [masterPassword, setMasterPassword] = useState("");

  return (
    <form
      className="locked-view"
      onSubmit={(event) => {
        event.preventDefault();
        if (masterPassword) void onUnlock(masterPassword);
      }}
    >
      <div className="lock-illustration" aria-hidden="true">
        <LockKeyhole size={25} />
      </div>
      <div className="center-copy">
        <h2>Unlock local vault</h2>
        <p>Saved passwords are encrypted on this device.</p>
      </div>
      <PasswordField
        id="unlock-master-password"
        label="Vault password"
        value={masterPassword}
        onChange={setMasterPassword}
        placeholder="Enter vault password"
        autoFocus
        autoComplete="current-password"
        disabled={busy}
      />
      <AutoLockSelect
        value={autoLockMinutes}
        onChange={(minutes) => void onAutoLockChange(minutes)}
        disabled={busy}
      />
      <button className="button primary wide" type="submit" disabled={busy || !masterPassword}>
        <KeyRound size={17} />
        {busy ? "Unlocking..." : "Unlock vault"}
      </button>
    </form>
  );
}

function UnlockedView({
  status,
  busy,
  timerLabel,
  onUpdate,
}: {
  status: ExtendedVaultStatus;
  busy: boolean;
  timerLabel: string;
  onUpdate: (message: Record<string, unknown>, successMessage: string) => Promise<boolean>;
}) {
  const [personalPassword, setPersonalPassword] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const sharedKeys = useMemo(
    () => status.keys.filter((key) => key.kind === "shared"),
    [status.keys],
  );
  const personalConfigured = status.keys.some((key) => key.kind === "personal");

  async function savePersonal(event: FormEvent) {
    event.preventDefault();
    if (!personalPassword) return;
    const updated = await onUpdate(
      {
        type: "UPDATE_VAULT",
        action: "set-personal",
        password: personalPassword,
      },
      personalConfigured ? "Personal password updated." : "Personal password added.",
    );
    if (updated) setPersonalPassword("");
  }

  async function addProfile(event: FormEvent) {
    event.preventDefault();
    if (!profileName.trim() || !profilePassword) return;
    const updated = await onUpdate(
      {
        type: "UPDATE_VAULT",
        action: "upsert-shared",
        shared: {
          id: crypto.randomUUID(),
          name: profileName.trim(),
          password: profilePassword,
        },
      },
      "Shared profile added.",
    );
    if (updated) {
      setProfileName("");
      setProfilePassword("");
    }
  }

  return (
    <>
      <section className="vault-status-strip">
        <span className="status-dot" aria-hidden="true" />
        <span>
          <strong>{status.storageMode === "stored" ? "Encrypted local vault" : "Session vault"}</strong>
          <small>
            {status.storageMode === "stored"
              ? timerLabel
              :
                timerLabel +
                ` (${status.autoLockMinutes}-minute inactivity); clears when the browser closes`}
          </small>
        </span>
        {status.storageMode === "stored" && <Clock3 size={16} />}
      </section>

      <section className="popup-section">
        <div className="section-heading compact">
          <span className="section-icon"><Clock3 size={16} /></span>
          <span>
            <h2>Auto-lock timer</h2>
            <p>Activity restarts the countdown</p>
          </span>
        </div>
        <AutoLockSelect
          value={status.autoLockMinutes}
          onChange={(autoLockMinutes) =>
            void onUpdate(
              { type: "SET_AUTO_LOCK_MINUTES", autoLockMinutes },
              "Auto-lock timer updated.",
            )
          }
          disabled={busy}
        />
      </section>

      <section className="popup-section">
        <div className="section-heading compact">
          <span className="section-icon"><UserRound size={16} /></span>
          <span>
            <h2>Personal password</h2>
            <p>{personalConfigured ? "Configured" : "Not configured"}</p>
          </span>
        </div>
        <form className="inline-save-form" onSubmit={(event) => void savePersonal(event)}>
          <PasswordField
            id="replace-personal-password"
            label={personalConfigured ? "Replace password" : "Add password"}
            value={personalPassword}
            onChange={setPersonalPassword}
            placeholder={personalConfigured ? "Enter a new password" : "Enter password"}
            disabled={busy}
          />
          <button
            className="button secondary"
            type="submit"
            disabled={busy || !personalPassword}
          >
            Save
          </button>
        </form>
      </section>

      <section className="popup-section">
        <div className="section-heading compact">
          <span className="section-icon"><UsersRound size={16} /></span>
          <span>
            <h2>Shared profiles</h2>
            <p>{sharedKeys.length + " saved"}</p>
          </span>
        </div>

        {sharedKeys.length > 0 && (
          <div className="key-list" aria-label="Shared profiles">
            {sharedKeys.map((key) => (
              <div className="key-row" key={key.id}>
                <span className="key-avatar" aria-hidden="true">
                  {key.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="key-name">{key.name}</span>
                <button
                  className="icon-button danger"
                  type="button"
                  title={"Remove " + key.name}
                  aria-label={"Remove " + key.name}
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm('Remove the shared profile "' + key.name + '"?')) return;
                    void onUpdate(
                      {
                        type: "UPDATE_VAULT",
                        action: "remove-shared",
                        id: key.id,
                      },
                      "Shared profile removed.",
                    );
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form className="add-profile-form" onSubmit={(event) => void addProfile(event)}>
          <label className="field" htmlFor="new-profile-name">
            <span className="field-label">Profile name</span>
            <input
              id="new-profile-name"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Name or group"
              disabled={busy}
            />
          </label>
          <PasswordField
            id="new-profile-password"
            label="Shared password"
            value={profilePassword}
            onChange={setProfilePassword}
            placeholder="Shared password"
            disabled={busy}
          />
          <button
            className="button secondary wide"
            type="submit"
            disabled={busy || !profileName.trim() || !profilePassword}
          >
            <Plus size={16} />
            Add profile
          </button>
        </form>
      </section>
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Popup root element was not found");
createRoot(root).render(<PopupApp />);

export { PopupApp };
