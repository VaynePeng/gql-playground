export function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseVariables(text: string): Record<string, unknown> {
  const trimmed = text.trim() || "{}";
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`变量不是合法 JSON：${toErrorMessage(error)}`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("变量必须是一个 JSON 对象，例如 { \"id\": \"1\" }。");
  }
  return value as Record<string, unknown>;
}
