export const OWNED_ATTRIBUTE = "data-gvdv-owned";

const EXCLUDED_TEXT_SELECTOR = [
  `[${OWNED_ATTRIBUTE}]`,
  "input",
  "textarea",
  "select",
  "option",
  "script",
  "style",
  "noscript",
  "code",
  "pre",
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[contenteditable="plaintext-only"]',
].join(",");

export function isExtensionOwnedNode(node: Node): boolean {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return Boolean(element?.closest(`[${OWNED_ATTRIBUTE}]`));
}

export function isElementVisible(element: Element): boolean {
  if (!element.isConnected || element.closest("[hidden],[aria-hidden='true']")) {
    return false;
  }

  const checkVisibility = (
    element as Element & {
      checkVisibility?: (options?: {
        checkOpacity?: boolean;
        checkVisibilityCSS?: boolean;
      }) => boolean;
    }
  ).checkVisibility;

  if (typeof checkVisibility === "function") {
    try {
      return checkVisibility.call(element, {
        checkOpacity: true,
        checkVisibilityCSS: true,
      });
    } catch {
      // Fall through for older Chromium versions.
    }
  }

  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    const style = getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      Number.parseFloat(style.opacity || "1") === 0
    ) {
      return false;
    }
  }

  return element.getClientRects().length > 0;
}

export function isScannableTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (
    !parent ||
    parent.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
    !node.data.includes("GVDV1:") ||
    parent.closest(EXCLUDED_TEXT_SELECTOR) ||
    (parent as HTMLElement).isContentEditable
  ) {
    return false;
  }

  return isElementVisible(parent);
}

export function collectScannableTextNodes(root: Node): Text[] {
  if (root.nodeType === Node.TEXT_NODE) {
    const text = root as Text;
    return isScannableTextNode(text) ? [text] : [];
  }

  if (
    root.nodeType === Node.ELEMENT_NODE &&
    isExtensionOwnedNode(root)
  ) {
    return [];
  }

  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(candidate) {
      return isScannableTextNode(candidate as Text)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    nodes.push(current as Text);
  }
  return nodes;
}

function selectionBelongsTo(element: HTMLElement): boolean {
  const selection = document.getSelection();
  return Boolean(
    selection?.rangeCount &&
      selection.anchorNode &&
      element.contains(selection.anchorNode),
  );
}

function placeCaretAtEnd(element: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function insertCiphertextAtCaret(
  element: HTMLElement,
  ciphertext: string,
): boolean {
  element.focus();
  if (!selectionBelongsTo(element)) {
    placeCaretAtEnd(element);
  }

  if (
    typeof document.execCommand === "function" &&
    document.execCommand("insertText", false, ciphertext)
  ) {
    return true;
  }

  const beforeInput = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    composed: true,
    data: ciphertext,
    inputType: "insertText",
  });
  if (!element.dispatchEvent(beforeInput)) {
    return false;
  }

  const selection = document.getSelection();
  if (!selection?.rangeCount) {
    return false;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const inserted = document.createTextNode(ciphertext);
  range.insertNode(inserted);
  range.setStartAfter(inserted);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);

  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      data: ciphertext,
      inputType: "insertText",
    }),
  );
  return true;
}

export function replaceEditableValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLElement,
  ciphertext: string,
): boolean {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const prototype =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) {
      return false;
    }

    element.focus();
    try {
      element.setSelectionRange(0, element.value.length);
    } catch {
      element.select();
    }

    if (typeof document.execCommand === "function") {
      try {
        if (
          document.execCommand("insertText", false, ciphertext) &&
          element.value === ciphertext
        ) {
          element.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      } catch {
        // Fall back to the native setter when insertText is unavailable.
      }
    }

    const beforeInput = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      composed: true,
      data: ciphertext,
      inputType: "insertText",
    });
    if (!element.dispatchEvent(beforeInput)) {
      return false;
    }

    setter.call(element, ciphertext);
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: ciphertext,
        inputType: "insertText",
      }),
    );
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return element.value === ciphertext;
  }

  if (!element.isContentEditable) {
    return false;
  }

  element.focus();
  const selection = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection?.removeAllRanges();
  selection?.addRange(range);

  if (
    typeof document.execCommand === "function" &&
    document.execCommand("insertText", false, ciphertext)
  ) {
    return true;
  }

  element.replaceChildren(document.createTextNode(ciphertext));
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      data: ciphertext,
      inputType: "insertReplacementText",
    }),
  );
  return true;
}

export function editableValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLElement,
): string {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return element.value;
  }
  return element.textContent ?? "";
}
