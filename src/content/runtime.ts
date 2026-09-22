export type RuntimeMessage = {
  type?: unknown;
  [key: string]: unknown;
};

type RuntimeSender = {
  tab?: {
    id?: number;
  };
};

type SendResponse = (response?: unknown) => void;
type MessageListener = (
  message: RuntimeMessage,
  sender: RuntimeSender,
) => unknown | Promise<unknown>;

type ChromeRuntime = {
  lastError?: {
    message?: string;
  };
  sendMessage: (
    message: unknown,
    callback: (response: unknown) => void,
  ) => void;
  onMessage: {
    addListener: (
      listener: (
        message: RuntimeMessage,
        sender: RuntimeSender,
        sendResponse: SendResponse,
      ) => boolean | void,
    ) => void;
  };
};

function getRuntime(): ChromeRuntime | null {
  const candidate = (
    globalThis as typeof globalThis & {
      chrome?: {
        runtime?: ChromeRuntime;
      };
    }
  ).chrome?.runtime;

  return candidate ?? null;
}

export function sendRuntimeMessage<T = unknown>(message: unknown): Promise<T> {
  const runtime = getRuntime();
  if (!runtime) {
    return Promise.reject(new Error("Extension runtime is unavailable."));
  }

  return new Promise<T>((resolve, reject) => {
    try {
      runtime.sendMessage(message, (response) => {
        const error = runtime.lastError;
        if (error) {
          reject(new Error(error.message || "Extension messaging failed."));
          return;
        }
        resolve(response as T);
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function addRuntimeMessageListener(listener: MessageListener): void {
  const runtime = getRuntime();
  if (!runtime) {
    return;
  }

  runtime.onMessage.addListener((message, sender, sendResponse) => {
    let result: unknown | Promise<unknown>;
    try {
      result = listener(message, sender);
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }

    if (result === undefined) {
      return false;
    }

    Promise.resolve(result).then(
      (response) => sendResponse(response),
      (error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
    );
    return true;
  });
}
