import {
  collectScannableTextNodes,
  isExtensionOwnedNode,
  isScannableTextNode,
  OWNED_ATTRIBUTE,
} from "./dom";
import {
  extractCompleteTextPayloadMatches,
  TEXT_PAYLOAD_PREFIX,
} from "./payload";
import { sendRuntimeMessage } from "./runtime";

type ScannerOptions = {
  onDomSettled?: () => void;
};

type ScannerController = {
  clearCacheAndRescan: () => void;
  rescan: () => void;
  stop: () => void;
};

type MarkerState = {
  source: string;
  host: HTMLElement | null;
  shadow: ShadowRoot | null;
};

const DEBOUNCE_MS = 160;
const MAX_CONTAINER_DEPTH = 12;
const SOFT_BREAK_PATTERN = /[\u200B\u200C\u200D\u2060\uFEFF]/g;

function logicalText(value: string): string {
  return value.replace(SOFT_BREAK_PATTERN, "");
}

function textOffsetWithin(root: Element, target: Text): number | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    const text = current as Text;
    if (text === target) return offset;
    offset += logicalText(text.data).length;
  }
  return null;
}

function payloadsStartingIn(node: Text): string[] {
  const localText = logicalText(node.data);
  const starts: number[] = [];
  let searchFrom = 0;
  while (searchFrom < localText.length) {
    const start = localText.indexOf(TEXT_PAYLOAD_PREFIX, searchFrom);
    if (start < 0) break;
    starts.push(start);
    searchFrom = start + TEXT_PAYLOAD_PREFIX.length;
  }
  if (!starts.length) return [];

  const found: string[] = [];
  for (const localStart of starts) {
    let container = node.parentElement;
    for (let depth = 0; container && depth < MAX_CONTAINER_DEPTH; depth += 1) {
      if (isExtensionOwnedNode(container)) break;
      const nodeOffset = textOffsetWithin(container, node);
      if (nodeOffset === null) break;
      const text = logicalText(container.textContent ?? "");
      const expectedStart = nodeOffset + localStart;
      const match = extractCompleteTextPayloadMatches(text).find(
        (candidate) => candidate.start === expectedStart,
      );
      if (match) {
        found.push(match.payload);
        break;
      }
      container = container.parentElement;
    }
  }

  return [...new Set(found)];
}

function createHost(state: MarkerState): void {
  if (state.host?.isConnected && state.shadow) return;
  const host = document.createElement("span");
  host.setAttribute(OWNED_ATTRIBUTE, "true");
  host.dataset.gvdvOverlay = "true";
  host.style.setProperty("display", "inline-flex", "important");
  host.style.setProperty("margin", "3px 4px", "important");
  host.style.setProperty("vertical-align", "middle", "important");
  state.host = host;
  state.shadow = host.attachShadow({ mode: "closed" });
}

function responseError(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const record = response as Record<string, unknown>;
  return record.ok === false && typeof record.error === "string" ? record.error : null;
}

function renderDecryptButtons(node: Text, state: MarkerState, payloads: string[]): void {
  if (!payloads.length || !node.parentNode) {
    state.host?.remove();
    state.host = null;
    state.shadow = null;
    return;
  }

  createHost(state);
  const host = state.host;
  const shadow = state.shadow;
  if (!host || !shadow) return;

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; color-scheme: light dark; }
    .actions { display: inline-flex; flex-wrap: wrap; gap: 5px; }
    button {
      align-items: center;
      background: #116149;
      border: 1px solid #0d513d;
      border-radius: 6px;
      color: #ffffff;
      cursor: pointer;
      display: inline-flex;
      font: 650 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      gap: 6px;
      letter-spacing: 0;
      min-height: 30px;
      padding: 5px 10px;
    }
    button:hover { background: #0d513d; }
    button:focus-visible { outline: 2px solid #0b57d0; outline-offset: 2px; }
    button:disabled { cursor: wait; opacity: .72; }
    .lock { font-size: 13px; line-height: 1; }
    @media (prefers-color-scheme: dark) {
      button { background: #257b60; border-color: #62a58d; }
      button:hover { background: #1f6b53; }
    }
  `;

  const actions = document.createElement("span");
  actions.className = "actions";
  actions.setAttribute("role", "group");
  actions.setAttribute("aria-label", "Drive Vault encrypted text actions");

  for (const [index, payload] of payloads.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.title = "Decrypt this message in the Drive Vault side panel";

    const lock = document.createElement("span");
    lock.className = "lock";
    lock.textContent = "\uD83D\uDD12";
    lock.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = payloads.length > 1 ? `Decrypt ${index + 1}` : "Decrypt";
    button.append(lock, label);

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      label.textContent = "Opening...";
      try {
        const response = await sendRuntimeMessage({
          type: "OPEN_DECRYPT_IN_SIDE_PANEL",
          payload,
          sourceUrl: location.href,
        });
        const error = responseError(response);
        if (error) throw new Error(error);
        label.textContent = "Opened";
      } catch (error) {
        label.textContent = error instanceof Error && /locked/i.test(error.message)
          ? "Unlock vault"
          : "Try again";
      } finally {
        window.setTimeout(() => {
          button.disabled = false;
          label.textContent = payloads.length > 1 ? `Decrypt ${index + 1}` : "Decrypt";
        }, 1400);
      }
    });
    actions.append(button);
  }

  shadow.replaceChildren(style, actions);
  if (host.parentNode !== node.parentNode || host.nextSibling !== node) {
    node.parentNode.insertBefore(host, node);
  }
}

export function startPayloadScanner(options: ScannerOptions = {}): ScannerController {
  const markers = new WeakMap<Text, MarkerState>();
  const pendingRoots = new Set<Node>();
  let debounceTimer: number | null = null;

  const scanTextNode = (node: Text, force = false): void => {
    const existing = markers.get(node);
    if (!isScannableTextNode(node)) {
      existing?.host?.remove();
      if (existing) markers.delete(node);
      return;
    }

    const payloads = payloadsStartingIn(node);
    const source = payloads.join("\n");
    if (!force && existing?.source === source && existing.host?.isConnected) return;
    if (!payloads.length) {
      existing?.host?.remove();
      if (existing) markers.delete(node);
      return;
    }

    const state: MarkerState = existing ?? {
      source,
      host: null,
      shadow: null,
    };
    state.source = source;
    markers.set(node, state);
    renderDecryptButtons(node, state, payloads);
  };

  const scanRoot = (root: Node, force = false): void => {
    if (root.nodeType === Node.TEXT_NODE) {
      scanTextNode(root as Text, force);
      return;
    }
    for (const textNode of collectScannableTextNodes(root)) scanTextNode(textNode, force);
  };

  const flush = (): void => {
    debounceTimer = null;
    const roots = [...pendingRoots];
    pendingRoots.clear();
    for (const root of roots) {
      if (
        root.nodeType === Node.DOCUMENT_NODE ||
        root.nodeType === Node.TEXT_NODE ||
        (root as Element).isConnected
      ) {
        scanRoot(root);
      }
    }
    options.onDomSettled?.();
  };

  const schedule = (root: Node): void => {
    pendingRoots.add(root);
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(flush, DEBOUNCE_MS);
  };

  const observer = new MutationObserver((mutations) => {
    let controlsMayNeedRefresh = false;
    for (const mutation of mutations) {
      if (isExtensionOwnedNode(mutation.target)) continue;
      if (mutation.type === "characterData") {
        schedule(mutation.target);
        if (mutation.target.parentNode) schedule(mutation.target.parentNode);
        continue;
      }
      if (mutation.type === "attributes") {
        schedule(mutation.target);
        controlsMayNeedRefresh = true;
        continue;
      }
      const pageNodes = [...mutation.addedNodes].filter((node) => !isExtensionOwnedNode(node));
      schedule(mutation.target);
      for (const node of mutation.removedNodes) schedule(node);
      if (pageNodes.length || mutation.removedNodes.length) controlsMayNeedRefresh = true;
    }
    if (controlsMayNeedRefresh && debounceTimer === null) schedule(document.documentElement);
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden", "contenteditable"],
  });

  const rescan = (): void => {
    scanRoot(document.documentElement);
    options.onDomSettled?.();
  };

  const clearCacheAndRescan = (): void => {
    scanRoot(document.documentElement, true);
    options.onDomSettled?.();
  };

  rescan();
  return {
    clearCacheAndRescan,
    rescan,
    stop() {
      observer.disconnect();
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    },
  };
}
