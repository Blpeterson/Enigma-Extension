import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionPath = join(projectRoot, "dist");
const outputPath = join(projectRoot, "artifacts", "smoke");
const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

async function firstExistingPath(paths) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next Chromium installation.
    }
  }
  throw new Error("No Chromium executable found. Set CHROME_PATH and retry.");
}

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function waitForJson(port, path = "/json") {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw lastError ?? new Error("Chromium DevTools endpoint did not start.");
}

async function openTarget(port, url) {
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
    { method: "PUT" },
  );
  if (!response.ok) throw new Error(`Could not open ${url}: ${response.status}`);
  return response.json();
}

function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let sequence = 0;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  const ready = new Promise((resolveReady, rejectReady) => {
    socket.addEventListener("open", resolveReady, { once: true });
    socket.addEventListener("error", rejectReady, { once: true });
  });

  return {
    async send(method, params = {}) {
      await ready;
      const id = ++sequence;
      const result = new Promise((resolveResult, rejectResult) => {
        pending.set(id, { resolve: resolveResult, reject: rejectResult });
      });
      socket.send(JSON.stringify({ id, method, params }));
      return result;
    },
    close() {
      socket.close();
    },
  };
}

async function capturePage(
  port,
  extensionId,
  page,
  width,
  height,
  outputName = page,
  beforeCaptureExpression = null,
) {
  const target = await openTarget(port, `chrome-extension://${extensionId}/${page}.html`);
  const cdp = connectCdp(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  let inspection;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `({
        ready: document.readyState,
        text: document.body?.innerText || "",
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        calendarCopyButtons: document.querySelectorAll(".prepared-copy").length,
        vaultUnlockButtons: document.querySelectorAll('[aria-label="Open vault unlock"]').length,
        readKeyValue: document.querySelector("#read-key")?.value ?? null,
        readKeyOptions: [...document.querySelectorAll("#read-key option")].map(
          (option) => ({ value: option.value, text: option.textContent }),
        ),
        autoLockValue: document.querySelector("#auto-lock-minutes")?.value ?? null,
        autoLockOptions: [...document.querySelectorAll("#auto-lock-minutes option")].map(
          (option) => ({ value: option.value, text: option.textContent }),
        ),
      })`,
      returnByValue: true,
    });
    inspection = result.result.value;
    if (
      inspection.ready === "complete" &&
      inspection.text.trim() &&
      !inspection.text.includes("Opening vault") &&
      !inspection.text.split(/\r?\n/).includes("Loading")
    ) {
      break;
    }
    await delay(100);
  }

  if (beforeCaptureExpression) {
    await cdp.send("Runtime.evaluate", {
      expression: beforeCaptureExpression,
      awaitPromise: true,
    });
    await delay(100);
    const result = await cdp.send("Runtime.evaluate", {
      expression: `({
        ready: document.readyState,
        text: document.body?.innerText || "",
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        calendarCopyButtons: document.querySelectorAll(".prepared-copy").length,
        vaultUnlockButtons: document.querySelectorAll('[aria-label="Open vault unlock"]').length,
        readKeyValue: document.querySelector("#read-key")?.value ?? null,
        readKeyOptions: [...document.querySelectorAll("#read-key option")].map(
          (option) => ({ value: option.value, text: option.textContent }),
        ),
        autoLockValue: document.querySelector("#auto-lock-minutes")?.value ?? null,
        autoLockOptions: [...document.querySelectorAll("#auto-lock-minutes option")].map(
          (option) => ({ value: option.value, text: option.textContent }),
        ),
      })`,
      returnByValue: true,
    });
    inspection = result.result.value;
  }

  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(join(outputPath, `${outputName}.png`), Buffer.from(screenshot.data, "base64"));
  cdp.close();
  return inspection;
}

async function sendExtensionMessage(
  port,
  extensionId,
  message,
  { attachActiveTab = false, userGesture = false } = {},
) {
  const target = await openTarget(port, `chrome-extension://${extensionId}/popup.html`);
  const cdp = connectCdp(target.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");
  const serialized = JSON.stringify(message);
  const expression = attachActiveTab
    ? `new Promise(async (resolve) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((candidate) => candidate.url === "about:blank") || tabs.find((candidate) => candidate.active);
        chrome.runtime.sendMessage({ ...${serialized}, tabId: tab?.id }, resolve);
      })`
    : `new Promise((resolve) => chrome.runtime.sendMessage(${serialized}, resolve))`;
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture,
  });
  cdp.close();
  if (result.exceptionDetails) throw new Error("Extension smoke message raised an exception.");
  if (result.result.value?.ok !== true) {
    throw new Error(result.result.value?.error || "Extension smoke message failed.");
  }
  return result.result.value;
}

async function openContentFixture(port, html, source) {
  const target = await openTarget(port, "about:blank");
  const cdp = connectCdp(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.bringToFront");
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 900,
    height: 700,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const setup = await cdp.send("Runtime.evaluate", {
    expression: `
      document.body.innerHTML = ${JSON.stringify(html)};
      Object.defineProperty(globalThis, "chrome", {
        configurable: true,
        value: {
          runtime: {
            lastError: null,
            sendMessage(message, callback) {
              globalThis.__gvdvSentMessages ??= [];
              globalThis.__gvdvSentMessages.push(message);
              callback({ ok: true, data: {} });
            },
            onMessage: {
              addListener(listener) { globalThis.__gvdvMessageListener = listener; },
            },
          },
          storage: { onChanged: { addListener() {} } },
        },
      });
    `,
  });
  if (setup.exceptionDetails) throw new Error("Could not initialize a content-script fixture.");
  const loaded = await cdp.send("Runtime.evaluate", { expression: source });
  if (loaded.exceptionDetails) throw new Error("The bundled content script failed in a fixture.");
  await delay(350);
  return cdp;
}

async function evaluateFixture(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error("A content-script fixture raised an exception.");
  return result.result.value;
}

async function verifySplitPayloadDetector(port, payload, contentSource) {
  const encoded = payload.slice("GVDV1:".length);
  const chunks = encoded.match(/.{1,32}/g) ?? [encoded];
  const html = `<main><div id="gmail-message" style="font:14px Arial">GVDV1:<wbr>${chunks.join("<wbr>")}</div></main>`;
  const cdp = await openContentFixture(port, html, contentSource);
  try {
    const result = await evaluateFixture(
      cdp,
      `(() => {
        const message = document.querySelector("#gmail-message");
        const marker = message?.querySelector('[data-gvdv-overlay="true"]');
        return {
          markerCount: document.querySelectorAll('[data-gvdv-overlay="true"]').length,
          markerBeforePayload: Boolean(
            marker &&
            marker.nextSibling?.nodeType === Node.TEXT_NODE &&
            marker.nextSibling.data.startsWith("GVDV1:")
          ),
          markerRect: marker ? (() => {
            const rect = marker.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          })() : null,
        };
      })()`,
    );
    if (result.markerCount !== 1 || !result.markerBeforePayload) {
      throw new Error(`Split Gmail payload was not marked before its text: ${JSON.stringify(result)}`);
    }
    const rect = result.markerRect;
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      button: "left",
      clickCount: 1,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      button: "left",
      clickCount: 1,
    });
    await delay(50);
    const sent = await evaluateFixture(cdp, "globalThis.__gvdvSentMessages?.[0] ?? null");
    if (sent?.type !== "OPEN_DECRYPT_IN_SIDE_PANEL" || sent.payload !== payload) {
      throw new Error(`Split Gmail decrypt control sent the wrong message: ${JSON.stringify(sent)}`);
    }
  } finally {
    cdp.close();
  }
}

async function verifyCalendarEditors(port, payload, contentSource) {
  const calendarSource = contentSource.replace(
    "location.hostname===`calendar.google.com`",
    "true",
  );
  if (calendarSource === contentSource) {
    throw new Error("Could not configure the bundled content script for Calendar fixtures.");
  }

  const fixtures = [
    {
      name: "quick",
      fields: { title: payload, location: payload, description: payload },
      html: `
        <div role="dialog" id="editor" style="display:grid;gap:8px;padding:20px">
          <input aria-label="Add title" />
          <button id="add-location" type="button" aria-label="Add location">Add location</button>
          <button id="add-description" type="button" aria-label="Add description or attachments">Add description</button>
          <button id="more-options" type="button">More options</button>
        </div>`,
      setup: `
        globalThis.__moreOptionsClicked = false;
        document.querySelector("#more-options").addEventListener("click", () => {
          globalThis.__moreOptionsClicked = true;
        });
        document.querySelector("#add-location").addEventListener("click", () => {
          if (document.querySelector('[aria-label="Location"]')) return;
          const field = document.createElement("input");
          field.setAttribute("aria-label", "Location");
          document.querySelector("#editor").append(field);
        });
        document.querySelector("#add-description").addEventListener("click", () => {
          if (document.querySelector('[aria-label="Description"]')) return;
          const field = document.createElement("textarea");
          field.setAttribute("aria-label", "Description");
          document.querySelector("#editor").append(field);
        });
      `,
    },
    {
      name: "fullscreen",
      fields: { title: payload, location: payload, description: payload },
      html: `
        <main role="main" id="editor" style="display:grid;gap:8px;padding:20px">
          <input aria-label="Add title" />
          <input aria-label="Location" />
          <textarea aria-label="Description"></textarea>
          <button id="more-options" type="button">More options</button>
        </main>`,
      setup: `
        globalThis.__moreOptionsClicked = false;
        document.querySelector("#more-options").addEventListener("click", () => {
          globalThis.__moreOptionsClicked = true;
        });
      `,
    },
    {
      name: "task-title-only",
      fields: { title: payload },
      html: `
        <div role="dialog" id="editor" style="display:grid;gap:8px;padding:20px">
          <input aria-label="Add title" />
          <button id="save" type="button">Save</button>
        </div>`,
      setup: `globalThis.__moreOptionsClicked = false;`,
    },
  ];

  for (const fixture of fixtures) {
    const cdp = await openContentFixture(port, fixture.html, calendarSource);
    try {
      await evaluateFixture(cdp, fixture.setup);
      await evaluateFixture(
        cdp,
        `
          globalThis.__calendarModel = {};
          document.querySelector("#editor").addEventListener("focusout", (event) => {
            const field = event.target;
            if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
            const label = field.getAttribute("aria-label") || "";
            const name = /location/i.test(label)
              ? "location"
              : /description/i.test(label)
                ? "description"
                : "title";
            globalThis.__calendarModel[name] = field.value;
          }, true);
        `,
      );
      const fields = JSON.stringify(fixture.fields);
      const result = await evaluateFixture(
        cdp,
        `new Promise((resolve, reject) => {
          const listener = globalThis.__gvdvMessageListener;
          if (typeof listener !== "function") {
            reject(new Error("Calendar listener was not registered"));
            return;
          }
          listener(
            { type: "INSERT_CIPHERTEXT", target: "calendar", fields: ${fields} },
            { tab: { id: 1 } },
            (response) => {
              const title = document.querySelector('[aria-label="Add title"]')?.value;
              const location = document.querySelector('[aria-label="Location"]')?.value;
              const description = document.querySelector('[aria-label="Description"]')?.value;
              resolve({
                response,
                title,
                location,
                description,
                committed: globalThis.__calendarModel,
                moreOptionsClicked: globalThis.__moreOptionsClicked,
                editorConnected: document.querySelector("#editor")?.isConnected,
              });
            },
          );
        })`,
      );
      const expectedEntries = Object.entries(fixture.fields);
      const visibleValuesMatch = expectedEntries.every(
        ([name, value]) => result[name] === value,
      );
      const committedValuesMatch = expectedEntries.every(
        ([name, value]) => result.committed?.[name] === value,
      );
      if (
        result.response?.ok !== true ||
        !visibleValuesMatch ||
        !committedValuesMatch ||
        result.moreOptionsClicked ||
        !result.editorConnected
      ) {
        throw new Error(`Calendar ${fixture.name} insertion failed: ${JSON.stringify(result)}`);
      }
    } finally {
      cdp.close();
    }
  }
}

async function extensionIdFromPreferences(profilePath) {
  try {
    const raw = await readFile(join(profilePath, "Default", "Preferences"), "utf8");
    const preferences = JSON.parse(raw);
    const settings = preferences?.extensions?.settings ?? {};
    for (const [id, value] of Object.entries(settings)) {
      if (
        value &&
        typeof value === "object" &&
        (value.path === extensionPath || value.manifest?.name === "Drive Vault")
      ) {
        return id;
      }
    }
  } catch {
    // Chromium may not have flushed Preferences yet.
  }
  return null;
}

const executable = await firstExistingPath(candidates);
const profilePath = await mkdtemp(join(tmpdir(), "drive-vault-smoke-"));
const port = 9300 + Math.floor(Math.random() * 500);
await mkdir(outputPath, { recursive: true });

const chromium = spawn(
  executable,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profilePath}`,
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    `--remote-debugging-port=${port}`,
    "about:blank",
  ],
  { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);

let chromiumErrors = "";
chromium.stderr.on("data", (chunk) => {
  chromiumErrors += String(chunk);
});

try {
  let extensionTarget;
  let extensionId;
  let lastTargets = [];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const targets = await waitForJson(port);
    lastTargets = targets;
    extensionTarget = targets.find(
      (target) =>
        target.type === "service_worker" &&
        typeof target.url === "string" &&
        target.url.startsWith("chrome-extension://") &&
        target.url.endsWith("/background.js"),
    );
    extensionId = extensionTarget
      ? new URL(extensionTarget.url).hostname
      : await extensionIdFromPreferences(profilePath);
    if (extensionId) break;
    await delay(100);
  }
  if (!extensionId) {
    throw new Error(
      `Drive Vault did not load. Targets: ${JSON.stringify(lastTargets.map(({ type, url }) => ({ type, url })))}\n${chromiumErrors.slice(-2000)}`,
    );
  }
  const popup = await capturePage(port, extensionId, "popup", 380, 610);
  const sidepanel = await capturePage(port, extensionId, "sidepanel", 420, 800);
  if (
    popup.autoLockValue !== "5" ||
    popup.autoLockOptions.length !== 59 ||
    popup.autoLockOptions[0]?.value !== "1" ||
    popup.autoLockOptions.at(-1)?.value !== "59"
  ) {
    throw new Error("The setup auto-lock selector did not expose every minute from 1 to 59.");
  }
  await sendExtensionMessage(port, extensionId, {
    type: "SET_SESSION_VAULT",
    autoLockMinutes: 17,
    vault: {
      personal: "smoke-personal-password",
      shared: [
        { id: "smoke-shared", name: "Shared test", password: "smoke-shared-password" },
      ],
    },
  });
  const sessionStatus = await sendExtensionMessage(port, extensionId, {
    type: "VAULT_STATUS",
  });
  const sessionRemaining = sessionStatus.data?.expiresAt - Date.now();
  if (
    sessionStatus.data?.autoLockMinutes !== 17 ||
    sessionRemaining < 16 * 60 * 1000 ||
    sessionRemaining > 17 * 60 * 1000 + 5000
  ) {
    throw new Error("The configured session auto-lock duration was not applied.");
  }
  const popupUnlocked = await capturePage(
    port,
    extensionId,
    "popup",
    380,
    610,
    "popup-unlocked",
  );
  if (
    popupUnlocked.autoLockValue !== "17" ||
    popupUnlocked.autoLockOptions.length !== 59
  ) {
    throw new Error("The unlocked popup did not retain the selected auto-lock duration.");
  }
  const oneMinuteStatus = await sendExtensionMessage(port, extensionId, {
    type: "SET_AUTO_LOCK_MINUTES",
    autoLockMinutes: 1,
  });
  if (oneMinuteStatus.data?.autoLockMinutes !== 1) {
    throw new Error("The one-minute auto-lock boundary was not accepted.");
  }
  const maximumStatus = await sendExtensionMessage(port, extensionId, {
    type: "SET_AUTO_LOCK_MINUTES",
    autoLockMinutes: 59,
  });
  if (maximumStatus.data?.autoLockMinutes !== 59) {
    throw new Error("The 59-minute auto-lock boundary was not accepted.");
  }
  const sidepanelUnlocked = await capturePage(
    port,
    extensionId,
    "sidepanel",
    420,
    800,
    "sidepanel-unlocked",
  );
  const calendar = await capturePage(
    port,
    extensionId,
    "sidepanel",
    420,
    800,
    "sidepanel-calendar",
    `(async () => {
      document.querySelectorAll(".workspace-tabs button")[2]?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const setValue = (element, value) => {
        const prototype = element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
        element.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          data: value,
          inputType: "insertText",
        }));
      };
      setValue(document.querySelector("#calendar-title"), "Private planning");
      setValue(document.querySelector("#calendar-location"), "Conference room");
      setValue(document.querySelector("#calendar-description"), "Bring the draft");
      await new Promise((resolve) => setTimeout(resolve, 50));
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Prepare fields"))
        ?.click();
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (document.querySelectorAll(".prepared-copy").length === 3) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      document.querySelector(".result-section")?.scrollIntoView({ block: "end" });
    })()`,
  );
  if (sidepanel.vaultUnlockButtons !== 1) {
    throw new Error("The locked side panel did not expose its vault unlock button.");
  }
  if (calendar.calendarCopyButtons !== 3) {
    throw new Error("Calendar did not render a copy button for each encrypted field.");
  }
  const files = await capturePage(
    port,
    extensionId,
    "sidepanel",
    420,
    800,
    "sidepanel-files",
    `document.querySelectorAll(".workspace-tabs button")[3]?.click()`,
  );
  const smokeVault = {
    personal: "smoke-personal-password",
    shared: [
      { id: "smoke-shared", name: "Shared test", password: "smoke-shared-password" },
    ],
  };
  await sendExtensionMessage(port, extensionId, {
    type: "CREATE_STORED_VAULT",
    vault: smokeVault,
    masterPassword: "smoke-master-password",
    autoLockMinutes: 23,
  });
  await sendExtensionMessage(port, extensionId, { type: "LOCK_VAULT" });
  const lockedStatus = await sendExtensionMessage(port, extensionId, { type: "VAULT_STATUS" });
  if (
    !lockedStatus.data?.configured ||
    !lockedStatus.data?.locked ||
    lockedStatus.data?.autoLockMinutes !== 23
  ) {
    throw new Error("Stored vault did not remain configured while locked.");
  }
  const popupLocked = await capturePage(
    port,
    extensionId,
    "popup",
    380,
    610,
    "popup-locked-stored",
  );
  if (popupLocked.autoLockValue !== "23" || popupLocked.autoLockOptions.length !== 59) {
    throw new Error("The locked popup did not retain the selected auto-lock duration.");
  }
  const unlockedStatus = await sendExtensionMessage(port, extensionId, {
    type: "UNLOCK_VAULT",
    masterPassword: "smoke-master-password",
  });
  if (unlockedStatus.data?.autoLockMinutes !== 23) {
    throw new Error("Unlocking did not reuse the saved auto-lock duration.");
  }
  const encryptedText = await sendExtensionMessage(port, extensionId, {
    type: "ENCRYPT_TEXT",
    keyId: "personal",
    text: "Chromium runtime interoperability",
  });
  const touchedStatus = await sendExtensionMessage(port, extensionId, { type: "VAULT_STATUS" });
  if (touchedStatus.data?.autoLockMinutes !== 23) {
    throw new Error("Vault activity did not preserve the selected auto-lock duration.");
  }
  const decryptedText = await sendExtensionMessage(port, extensionId, {
    type: "DECRYPT_TEXT",
    payload: encryptedText.data.ciphertext,
  });
  if (decryptedText.data?.text !== "Chromium runtime interoperability") {
    throw new Error("Chromium text encryption roundtrip failed.");
  }
  const encryptedSharedText = await sendExtensionMessage(port, extensionId, {
    type: "ENCRYPT_TEXT",
    keyId: "smoke-shared",
    text: "Shared profile interoperability",
  });
  const contentSource = await readFile(join(extensionPath, "content.js"), "utf8");
  await verifySplitPayloadDetector(port, encryptedText.data.ciphertext, contentSource);
  await verifyCalendarEditors(port, encryptedText.data.ciphertext, contentSource);
  await sendExtensionMessage(
    port,
    extensionId,
    { type: "OPEN_SIDE_PANEL" },
    { attachActiveTab: true, userGesture: true },
  );
  await sendExtensionMessage(
    port,
    extensionId,
    { type: "OPEN_SIDE_PANEL", target: "calendar" },
    { attachActiveTab: true, userGesture: true },
  );
  const calendarContext = await sendExtensionMessage(port, extensionId, {
    type: "GET_PANEL_CONTEXT",
  });
  if (calendarContext.data?.route !== "calendar") {
    throw new Error("Calendar launcher did not route the side panel to Calendar.");
  }
  await sendExtensionMessage(
    port,
    extensionId,
    { type: "OPEN_SIDE_PANEL", target: "gmail" },
    { attachActiveTab: true, userGesture: true },
  );
  const gmailContext = await sendExtensionMessage(port, extensionId, {
    type: "GET_PANEL_CONTEXT",
  });
  if (gmailContext.data?.route !== "compose") {
    throw new Error("Gmail launcher did not route the side panel to Compose.");
  }
  await sendExtensionMessage(
    port,
    extensionId,
    { type: "OPEN_SIDE_PANEL" },
    { attachActiveTab: true, userGesture: true },
  );
  await sendExtensionMessage(
    port,
    extensionId,
    {
      type: "OPEN_DECRYPT_IN_SIDE_PANEL",
      payload: encryptedSharedText.data.ciphertext,
      sourceUrl: "https://mail.google.com/mail/u/0/#inbox/smoke",
    },
    { attachActiveTab: true, userGesture: true },
  );
  const readItem = await sendExtensionMessage(port, extensionId, { type: "GET_READ_ITEM" });
  if (
    readItem.data?.status !== "ready" ||
    readItem.data?.text !== "Shared profile interoperability" ||
    readItem.data?.keyId !== "smoke-shared"
  ) {
    throw new Error("Side-panel page decryption handoff failed.");
  }
  const wrongReadKey = await sendExtensionMessage(port, extensionId, {
    type: "RETRY_READ_ITEM",
    keyId: "personal",
  });
  if (
    wrongReadKey.data?.status !== "error" ||
    wrongReadKey.data?.requestedKeyId !== "personal"
  ) {
    throw new Error("Read-tab decryption did not honor the selected wrong key.");
  }
  const selectedReadKey = await sendExtensionMessage(port, extensionId, {
    type: "RETRY_READ_ITEM",
    keyId: "smoke-shared",
  });
  if (
    selectedReadKey.data?.status !== "ready" ||
    selectedReadKey.data?.text !== "Shared profile interoperability" ||
    selectedReadKey.data?.keyId !== "smoke-shared"
  ) {
    throw new Error("Read-tab decryption did not honor the selected shared key.");
  }
  const readContext = await sendExtensionMessage(port, extensionId, {
    type: "GET_PANEL_CONTEXT",
  });
  if (readContext.data?.route !== "read") {
    throw new Error("Decrypt handoff did not route the side panel to Read.");
  }
  const readPanel = await capturePage(
    port,
    extensionId,
    "sidepanel",
    420,
    800,
    "sidepanel-read",
    `document.querySelectorAll(".workspace-tabs button")[0]?.click()`,
  );
  const readKeyOptions = readPanel.readKeyOptions ?? [];
  if (
    readPanel.readKeyValue !== "smoke-shared" ||
    !readKeyOptions.some((option) => option.value === "auto") ||
    !readKeyOptions.some((option) => option.value === "personal") ||
    !readKeyOptions.some((option) => option.value === "smoke-shared")
  ) {
    throw new Error("Read tab did not render the automatic, personal, and shared key choices.");
  }
  const encryptedFile = await sendExtensionMessage(port, extensionId, {
    type: "ENCRYPT_FILE",
    keyId: "personal",
    dataBase64: "AAECA/7/",
    name: "smoke.bin",
    mime: "application/octet-stream",
  });
  const decryptedFile = await sendExtensionMessage(port, extensionId, {
    type: "DECRYPT_FILE",
    keyId: "personal",
    dataBase64: encryptedFile.data.dataBase64,
  });
  if (decryptedFile.data?.dataBase64 !== "AAECA/7/" || decryptedFile.data?.name !== "smoke.bin") {
    throw new Error("Chromium file encryption roundtrip failed.");
  }
  if (!files.text.includes("Up to 40 MB")) {
    throw new Error("Files tab did not show the 40 MB local-processing limit.");
  }
  console.log(
    JSON.stringify(
      {
        extensionId,
        popup,
        sidepanel,
        popupUnlocked,
        sidepanelUnlocked,
        calendar,
        files,
        readPanel,
        runtimeCrypto: "Gmail detection, Calendar insertion, selected-key Read retries, panel reopen, stored vault, text, and file roundtrips passed",
        outputPath,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`${message}\nChromium stderr:\n${chromiumErrors.slice(-4000)}`);
} finally {
  chromium.kill();
  await delay(150);
  await rm(profilePath, { recursive: true, force: true }).catch(() => undefined);
}
