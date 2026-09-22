import { editableValue, isElementVisible, replaceEditableValue } from "./dom";
import { ensureSidePanelLauncher } from "./launcher";
import { normalizeCompleteTextPayload } from "./payload";

export type CalendarFieldName = "title" | "location" | "description";
export type CalendarCiphertextFields = Partial<Record<CalendarFieldName, string>>;

export type CalendarInsertResult = {
  ok: boolean;
  target: "calendar";
  insertedFields?: CalendarFieldName[];
  error?: string;
};

export type CalendarIntegration = {
  refresh: () => void;
  insertCiphertext: (fields: unknown) => Promise<CalendarInsertResult>;
  getContext: () => Record<string, unknown>;
  getFocusedEditorContext: () => Record<string, unknown>;
};

type EditableField = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const FIELD_SELECTORS: Record<CalendarFieldName, readonly string[]> = {
  title: [
    '[data-key="title"] input',
    'input[name="title"]',
    'input[aria-label="Add title" i]',
    'input[aria-label*="title" i]',
    'textarea[aria-label*="title" i]',
    'input[placeholder*="add title" i]',
    'input[placeholder*="title" i]',
  ],
  location: [
    '[data-key="location"] input',
    'input[name="location"]',
    'input[role="combobox"][aria-label*="location" i]',
    'input[aria-label*="location" i]',
    'textarea[aria-label*="location" i]',
    'input[placeholder*="add location" i]',
    'input[placeholder*="location" i]',
    '[role="combobox"][contenteditable="true"][aria-label*="location" i]',
  ],
  description: [
    '[data-key="description"] textarea',
    '[data-key="description"] [contenteditable="true"]',
    'textarea[name="description"]',
    'textarea[aria-label*="description" i]',
    '[role="textbox"][contenteditable="true"][aria-label*="description" i]',
    '[contenteditable="true"][aria-label*="description" i]',
    '[contenteditable="true"][data-placeholder*="description" i]',
    'textarea[placeholder*="description" i]',
    '[role="textbox"][contenteditable="true"][data-placeholder*="description" i]',
  ],
};

const ALL_FIELD_SELECTOR = Object.values(FIELD_SELECTORS).flat().join(",");

function isEditableField(element: Element | null): element is EditableField {
  if (!(element instanceof HTMLElement) || !isElementVisible(element)) {
    return false;
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }
  return element.isContentEditable;
}

function findField(
  root: ParentNode,
  fieldName: CalendarFieldName,
): EditableField | null {
  for (const selector of FIELD_SELECTORS[fieldName]) {
    const match = root.querySelector(selector);
    if (isEditableField(match)) {
      return match;
    }
  }
  return null;
}

function editorRootFor(field: Element): HTMLElement | null {
  const dialog = field.closest<HTMLElement>('[role="dialog"]');
  if (dialog) {
    return dialog;
  }

  const form = field.closest<HTMLElement>("form");
  if (form) {
    return form;
  }

  if (location.pathname.includes("/eventedit")) {
    return field.closest<HTMLElement>('[role="main"]') ?? document.body;
  }

  let candidate = field.parentElement;
  let titleOnlyRoot: HTMLElement | null = null;
  for (let depth = 0; candidate && depth < 8; depth += 1) {
    if (findField(candidate, "title")) {
      titleOnlyRoot = candidate;
      if (findField(candidate, "location") || findField(candidate, "description")) {
        return candidate;
      }
    }
    candidate = candidate.parentElement;
  }
  return titleOnlyRoot;
}

function findEditorRoots(): HTMLElement[] {
  const roots = new Set<HTMLElement>();
  for (const selector of FIELD_SELECTORS.title) {
    for (const field of document.querySelectorAll(selector)) {
      if (!isEditableField(field)) {
        continue;
      }
      const root = editorRootFor(field);
      if (root && isElementVisible(root)) {
        roots.add(root);
      }
    }
  }
  return [...roots];
}

function availableFields(root: ParentNode): CalendarFieldName[] {
  return (["title", "location", "description"] as CalendarFieldName[]).filter(
    (fieldName) => Boolean(findField(root, fieldName)),
  );
}

function normalizeFieldMap(
  input: unknown,
): { fields: CalendarCiphertextFields; error?: undefined } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Calendar insertion requires a ciphertext fields object." };
  }

  const source = input as Record<string, unknown>;
  const normalized: CalendarCiphertextFields = {};
  for (const name of ["title", "location", "description"] as CalendarFieldName[]) {
    if (!(name in source)) {
      continue;
    }
    if (typeof source[name] === "string" && !source[name].trim()) {
      continue;
    }
    const payload = normalizeCompleteTextPayload(source[name]);
    if (!payload) {
      return {
        error: `Refused to insert an incomplete or invalid GVDV1 payload for ${name}.`,
      };
    }
    normalized[name] = payload;
  }

  if (!Object.keys(normalized).length) {
    return { error: "No Calendar ciphertext fields were provided." };
  }
  return { fields: normalized };
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function controlLabel(element: HTMLElement): string {
  return [
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("data-tooltip"),
    element.getAttribute("data-tooltip-text"),
    element.textContent,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findActionControl(root: ParentNode, phrases: string[]): HTMLElement | null {
  const controls = root.querySelectorAll<HTMLElement>([
    "button",
    '[role="button"]',
    '[role="link"]',
    '[tabindex]:not([tabindex="-1"])',
    '[jsaction*="click"]',
  ].join(","));
  for (const phrase of phrases) {
    const match = [...controls].find(
      (control) =>
        !control.hasAttribute("disabled") &&
        isElementVisible(control) &&
        controlLabel(control).includes(phrase),
    );
    if (match) return match;
  }
  return null;
}

async function waitFor<T>(reader: () => T | null, timeoutMs: number): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = reader();
    if (value) return value;
    await wait(80);
  }
  return reader();
}

export function createCalendarIntegration(): CalendarIntegration {
  let lastFocusedRoot: HTMLElement | null = null;

  const chooseEditorRoot = (): HTMLElement | null => {
    if (lastFocusedRoot?.isConnected && isElementVisible(lastFocusedRoot)) {
      return lastFocusedRoot;
    }

    const active = document.activeElement;
    if (active instanceof Element && active.matches(ALL_FIELD_SELECTOR)) {
      const root = editorRootFor(active);
      if (root) {
        lastFocusedRoot = root;
        return root;
      }
    }

    const latest = findEditorRoots().at(-1) ?? null;
    if (latest) {
      lastFocusedRoot = latest;
    }
    return latest;
  };

  const ensureEditorFields = async (
    names: CalendarFieldName[],
  ): Promise<HTMLElement | null> => {
    let root = chooseEditorRoot();
    if (!root) return null;

    const revealPhrases: Partial<Record<CalendarFieldName, string[]>> = {
      location: ["add location", "location"],
      description: ["add description", "description or attachments", "description"],
    };

    for (const name of names) {
      if (findField(root, name)) continue;
      const phrases = revealPhrases[name];
      const reveal = phrases ? findActionControl(root, phrases) : null;
      if (reveal) {
        const selectedRoot = root;
        reveal.click();
        await waitFor(() => {
          const currentRoot = selectedRoot.isConnected && isElementVisible(selectedRoot)
            ? selectedRoot
            : chooseEditorRoot();
          if (!currentRoot) return null;
          return findField(currentRoot, name) ? currentRoot : null;
        }, 900);
        if (!selectedRoot.isConnected || !isElementVisible(selectedRoot)) {
          root = chooseEditorRoot() ?? root;
        }
      }
    }

    return root;
  };

  const getContext = (): Record<string, unknown> => {
    const roots = findEditorRoots();
    const selected = chooseEditorRoot();
    return {
      site: "calendar",
      target: "calendar",
      url: location.href,
      editorCount: roots.length,
      hasEditor: roots.length > 0,
      hasFocusedEditor: Boolean(selected),
      availableFields: selected ? availableFields(selected) : [],
      insertionMode: "replace-fields",
    };
  };

  const refresh = (): void => {
    for (const root of findEditorRoots()) {
      const title = findField(root, "title");
      if (!title) {
        continue;
      }

      const titleContainer =
        title.closest<HTMLElement>('[data-key="title"]') ?? title.parentElement;
      const mount = titleContainer?.parentElement ?? root;
      const before = titleContainer && titleContainer.parentElement === mount
        ? titleContainer
        : null;

      ensureSidePanelLauncher({
        root,
        mount,
        before,
        kind: "calendar-editor",
        label: "Encrypt event fields",
        target: "calendar",
        onBeforeOpen: () => {
          lastFocusedRoot = root;
        },
        context: () => ({
          ...getContext(),
          hasFocusedEditor: true,
          availableFields: availableFields(root),
        }),
      });
    }
  };

  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.matches(ALL_FIELD_SELECTOR)) {
        return;
      }
      const root = editorRootFor(target);
      if (root) {
        lastFocusedRoot = root;
      }
    },
    true,
  );

  return {
    refresh,
    async insertCiphertext(input: unknown): Promise<CalendarInsertResult> {
      const normalized = normalizeFieldMap(input);
      if ("error" in normalized) {
        return { ok: false, target: "calendar", error: normalized.error };
      }

      let root = chooseEditorRoot();
      if (!root) {
        return {
          ok: false,
          target: "calendar",
          error: "No visible Google Calendar event editor is available.",
        };
      }

      const entries = Object.entries(normalized.fields) as [
        CalendarFieldName,
        string,
      ][];
      root = await ensureEditorFields(entries.map(([name]) => name));
      if (!root) {
        return {
          ok: false,
          target: "calendar",
          error: "The Calendar editor closed before the encrypted fields could be inserted.",
        };
      }
      let insertionRoot: HTMLElement = root;

      for (const [name, ciphertext] of entries) {
        let committed = false;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const currentRoot: HTMLElement = chooseEditorRoot() ?? insertionRoot;
          const destination = findField(currentRoot, name);
          if (!destination) {
            return {
              ok: false,
              target: "calendar",
              error: `Calendar did not expose its ${name} field in this editor. Reveal that field and try again.`,
            };
          }
          if (!replaceEditableValue(destination, ciphertext)) {
            return {
              ok: false,
              target: "calendar",
              error: `Calendar rejected the ciphertext for ${name}.`,
            };
          }

          // Calendar commits title-only edits on focus loss. Without this, the
          // ciphertext can be visible while Save still reads an empty model.
          destination.blur();
          insertionRoot = currentRoot;
          await wait(attempt === 0 ? 120 : 180);

          const verificationRoot =
            insertionRoot.isConnected && isElementVisible(insertionRoot)
              ? insertionRoot
              : chooseEditorRoot();
          const verifiedField = verificationRoot
            ? findField(verificationRoot, name)
            : null;
          if (
            verificationRoot &&
            verifiedField &&
            editableValue(verifiedField) === ciphertext
          ) {
            insertionRoot = verificationRoot;
            committed = true;
            break;
          }
        }

        if (!committed) {
          return {
            ok: false,
            target: "calendar",
            error: `Calendar did not retain the encrypted ${name}. Try Copy and paste it into the field instead.`,
          };
        }
      }

      lastFocusedRoot = insertionRoot;
      return {
        ok: true,
        target: "calendar",
        insertedFields: entries.map(([name]) => name),
      };
    },
    getContext,
    getFocusedEditorContext() {
      const root = chooseEditorRoot();
      return {
        ...getContext(),
        hasFocusedEditor: Boolean(root),
        availableFields: root ? availableFields(root) : [],
      };
    },
  };
}
