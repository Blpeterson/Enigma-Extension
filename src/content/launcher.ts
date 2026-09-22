import { OWNED_ATTRIBUTE } from "./dom";
import { sendRuntimeMessage } from "./runtime";

type LauncherTarget = "gmail" | "calendar";

type LauncherOptions = {
  root: Element;
  mount: Element;
  before?: Node | null;
  kind: string;
  label: string;
  target: LauncherTarget;
  context: () => Record<string, unknown>;
  onBeforeOpen?: () => void;
};

type OpenPanelResponse = {
  ok?: boolean;
  error?: string;
};

export function ensureSidePanelLauncher(options: LauncherOptions): HTMLElement {
  const existing = options.root.querySelector<HTMLElement>(
    `[data-gvdv-control="${options.kind}"]`,
  );
  if (existing) {
    return existing;
  }

  const host = document.createElement("span");
  host.setAttribute(OWNED_ATTRIBUTE, "true");
  host.dataset.gvdvControl = options.kind;
  host.style.setProperty("display", "block", "important");
  host.style.setProperty("margin", "6px 0", "important");

  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; display: block; color-scheme: light dark; }
    button {
      align-items: center;
      background: #ffffff;
      border: 1px solid #aeb4bc;
      border-radius: 6px;
      color: #202124;
      cursor: pointer;
      display: inline-flex;
      font: 600 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      gap: 7px;
      letter-spacing: 0;
      min-height: 30px;
      padding: 5px 10px;
    }
    button:hover { background: #f3f6f8; border-color: #7f8790; }
    button:focus-visible { outline: 2px solid #0b57d0; outline-offset: 2px; }
    button:disabled { cursor: wait; opacity: .7; }
    .mark {
      align-items: center;
      background: #116149;
      border-radius: 4px;
      color: #ffffff;
      display: inline-flex;
      font-size: 9px;
      height: 18px;
      justify-content: center;
      width: 22px;
    }
    @media (prefers-color-scheme: dark) {
      button { background: #27292c; border-color: #676c72; color: #f1f3f4; }
      button:hover { background: #35383c; }
    }
  `;

  const button = document.createElement("button");
  button.type = "button";
  button.title = `${options.label}. Plaintext stays in the extension side panel.`;

  const mark = document.createElement("span");
  mark.className = "mark";
  mark.textContent = "DV";
  mark.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.textContent = options.label;
  button.append(mark, text);

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onBeforeOpen?.();
    button.disabled = true;
    const original = text.textContent;
    try {
      const response = await sendRuntimeMessage<OpenPanelResponse>({
        type: "OPEN_SIDE_PANEL",
        target: options.target,
        site: options.target,
        context: options.context(),
      });
      if (response?.ok === false) {
        throw new Error(response.error || "The side panel could not be opened.");
      }
    } catch {
      text.textContent = "Open the extension panel";
      window.setTimeout(() => {
        text.textContent = original;
      }, 1800);
    } finally {
      button.disabled = false;
    }
  });

  shadow.append(style, button);
  options.mount.insertBefore(host, options.before ?? null);
  return host;
}
