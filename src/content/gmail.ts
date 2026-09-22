import { insertCiphertextAtCaret, isElementVisible } from "./dom";
import { ensureSidePanelLauncher } from "./launcher";
import { normalizeCompleteTextPayload } from "./payload";

const COMPOSE_BODY_SELECTOR = [
  'div[aria-label="Message Body"][contenteditable="true"]',
  'div[role="textbox"][aria-multiline="true"][contenteditable="true"]',
  'div[g_editable="true"][contenteditable="true"]',
].join(",");

export type GmailInsertResult = {
  ok: boolean;
  target: "gmail";
  error?: string;
};

export type GmailIntegration = {
  refresh: () => void;
  insertCiphertext: (ciphertext: unknown) => GmailInsertResult;
  getContext: () => Record<string, unknown>;
  getFocusedComposeContext: () => Record<string, unknown>;
};

function isComposeBody(element: Element | null): element is HTMLElement {
  return Boolean(
    element instanceof HTMLElement &&
      element.matches(COMPOSE_BODY_SELECTOR) &&
      element.isContentEditable &&
      isElementVisible(element),
  );
}

function findComposeBodies(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(COMPOSE_BODY_SELECTOR)].filter(
    (element, index, all) =>
      isComposeBody(element) && all.indexOf(element) === index,
  );
}

function composeRootFor(body: HTMLElement): HTMLElement {
  return (
    body.closest<HTMLElement>('[role="dialog"]') ??
    body.closest<HTMLElement>(".M9") ??
    body.closest<HTMLElement>("form") ??
    body.parentElement ??
    body
  );
}

export function createGmailIntegration(): GmailIntegration {
  let lastFocusedBody: HTMLElement | null = null;

  const chooseComposeBody = (): HTMLElement | null => {
    if (isComposeBody(lastFocusedBody)) {
      return lastFocusedBody;
    }

    const active = document.activeElement;
    const activeBody =
      active instanceof Element
        ? active.closest<HTMLElement>(COMPOSE_BODY_SELECTOR)
        : null;
    if (isComposeBody(activeBody)) {
      lastFocusedBody = activeBody;
      return activeBody;
    }

    const bodies = findComposeBodies();
    const latest = bodies.at(-1) ?? null;
    if (latest) {
      lastFocusedBody = latest;
    }
    return latest;
  };

  const getContext = (): Record<string, unknown> => {
    const bodies = findComposeBodies();
    const selected = chooseComposeBody();
    return {
      site: "gmail",
      target: "gmail",
      url: location.href,
      composeCount: bodies.length,
      hasCompose: bodies.length > 0,
      hasFocusedCompose: Boolean(selected),
      insertionMode: "caret-or-end",
    };
  };

  const refresh = (): void => {
    for (const body of findComposeBodies()) {
      const root = composeRootFor(body);
      const mount = body.parentElement;
      if (!mount) {
        continue;
      }

      ensureSidePanelLauncher({
        root,
        mount,
        before: body,
        kind: "gmail-compose",
        label: "Encrypt message",
        target: "gmail",
        onBeforeOpen: () => {
          lastFocusedBody = body;
        },
        context: () => ({
          ...getContext(),
          hasFocusedCompose: true,
        }),
      });
    }
  };

  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const body = target.closest<HTMLElement>(COMPOSE_BODY_SELECTOR);
      if (isComposeBody(body)) {
        lastFocusedBody = body;
      }
    },
    true,
  );

  return {
    refresh,
    insertCiphertext(ciphertext: unknown): GmailInsertResult {
      const payload = normalizeCompleteTextPayload(ciphertext);
      if (!payload) {
        return {
          ok: false,
          target: "gmail",
          error: "Refused to insert an incomplete or invalid GVDV1 payload.",
        };
      }

      const body = chooseComposeBody();
      if (!body) {
        return {
          ok: false,
          target: "gmail",
          error: "No visible Gmail compose body is available.",
        };
      }

      lastFocusedBody = body;
      if (!insertCiphertextAtCaret(body, payload)) {
        return {
          ok: false,
          target: "gmail",
          error: "Gmail rejected the ciphertext insertion.",
        };
      }

      return { ok: true, target: "gmail" };
    },
    getContext,
    getFocusedComposeContext() {
      const body = chooseComposeBody();
      return {
        ...getContext(),
        hasFocusedCompose: Boolean(body),
      };
    },
  };
}
