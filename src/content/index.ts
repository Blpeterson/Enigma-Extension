import { createCalendarIntegration } from "./calendar";
import { createGmailIntegration } from "./gmail";
import { startPayloadScanner } from "./overlayScanner";
import { addRuntimeMessageListener, RuntimeMessage } from "./runtime";

const STARTED_KEY = "__gvdvContentScriptStarted__";

type ContentGlobal = typeof globalThis & {
  [STARTED_KEY]?: boolean;
};

function currentSite(): "gmail" | "calendar" | "other" {
  if (location.hostname === "mail.google.com") {
    return "gmail";
  }
  if (location.hostname === "calendar.google.com") {
    return "calendar";
  }
  return "other";
}

function messageType(message: RuntimeMessage): string {
  return typeof message.type === "string" ? message.type : "";
}

function start(): void {
  const site = currentSite();
  const gmail = site === "gmail" ? createGmailIntegration() : null;
  const calendar = site === "calendar" ? createCalendarIntegration() : null;

  const refreshSiteControls = (): void => {
    gmail?.refresh();
    calendar?.refresh();
  };

  const scanner = startPayloadScanner({
    onDomSettled: refreshSiteControls,
  });

  const getSiteContext = (): Record<string, unknown> => {
    if (gmail) {
      return gmail.getContext();
    }
    if (calendar) {
      return calendar.getContext();
    }
    return {
      site: "other",
      target: "page",
      url: location.href,
      canInsertCiphertext: false,
    };
  };

  addRuntimeMessageListener((message) => {
    switch (messageType(message)) {
      case "INSERT_CIPHERTEXT": {
        if (message.target === "gmail") {
          const fields =
            message.fields && typeof message.fields === "object"
              ? (message.fields as Record<string, unknown>)
              : null;
          const ciphertext = message.ciphertext ?? fields?.body;
          return gmail
            ? gmail.insertCiphertext(ciphertext)
            : {
                ok: false,
                target: "gmail",
                error: "This tab is not an active Gmail page.",
              };
        }

        if (message.target === "calendar") {
          const fields = message.fields ?? message.ciphertext;
          return calendar
            ? calendar.insertCiphertext(fields)
            : {
                ok: false,
                target: "calendar",
                error: "This tab is not an active Google Calendar page.",
              };
        }

        return {
          ok: false,
          error: "INSERT_CIPHERTEXT requires target gmail or calendar.",
        };
      }

      case "GET_SITE_CONTEXT":
      case "GET_PAGE_CONTEXT":
        return { ok: true, ...getSiteContext() };

      case "GET_FOCUSED_COMPOSE":
      case "GET_COMPOSE_CONTEXT":
        return gmail
          ? { ok: true, ...gmail.getFocusedComposeContext() }
          : {
              ok: false,
              site,
              error: "No Gmail compose context is available in this tab.",
            };

      case "GET_FOCUSED_CALENDAR_EDITOR":
      case "GET_CALENDAR_CONTEXT":
        return calendar
          ? { ok: true, ...calendar.getFocusedEditorContext() }
          : {
              ok: false,
              site,
              error: "No Calendar editor context is available in this tab.",
            };

      case "VAULT_STATE_CHANGED":
      case "PASSWORDS_CHANGED":
        scanner.clearCacheAndRescan();
        return { ok: true };

      case "RESCAN_PAGE":
        scanner.rescan();
        return { ok: true };

      case "PING_CONTENT_SCRIPT":
        return { ok: true, ...getSiteContext() };

      default:
        return undefined;
    }
  });

  const storageChanges = (
    globalThis as typeof globalThis & {
      chrome?: {
        storage?: {
          onChanged?: {
            addListener: (listener: () => void) => void;
          };
        };
      };
    }
  ).chrome?.storage?.onChanged;
  storageChanges?.addListener(() => scanner.clearCacheAndRescan());

  refreshSiteControls();
}

const contentGlobal = globalThis as ContentGlobal;
if (!contentGlobal[STARTED_KEY]) {
  contentGlobal[STARTED_KEY] = true;
  if (document.documentElement) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
}
