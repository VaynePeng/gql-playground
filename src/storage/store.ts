import { openDB } from "idb";
import { initialCall, initialQuery } from "../examples/lessons";
import { emptyData } from "../graphql/seed";
import type { AppData, HistoryItem, PracticeData } from "../types";

export type Theme = "light" | "dark" | "system";

let dbPromise: ReturnType<typeof openDB> | undefined;
const storage = () =>
  (dbPromise ??= openDB("gql-playground-app-v1", 1, {
    upgrade(db) {
      db.createObjectStore("settings");
      db.createObjectStore("databases");
    },
  }));

export const newDatabaseId = () => `gql-playground-${crypto.randomUUID()}`;

type StoredHistory = Partial<HistoryItem> & {
  variables?: string;
};

type StoredWorkspace = Omit<Partial<AppData>, "history" | "call"> & {
  variables?: string;
  variablesOpen?: boolean;
  call?: string;
  history?: StoredHistory[];
};

function migrateHistory(item: StoredHistory): HistoryItem {
  return {
    id: item.id || crypto.randomUUID(),
    query: item.query || "",
    call: item.call ?? "",
    scope: item.scope || "全部",
    time: item.time || new Date().toISOString(),
    duration: item.duration || 0,
    success: Boolean(item.success),
    summary: item.summary || "",
    error: item.error,
  };
}

export function migrateWorkspace(stored: StoredWorkspace): AppData {
  const defaults = defaultWorkspace();
  return {
    databaseId: stored.databaseId || defaults.databaseId,
    retired: stored.retired ?? [],
    draft: stored.draft ?? initialQuery,
    call: stored.call ?? "",
    history: (stored.history ?? []).map(migrateHistory),
    sidebar: stored.sidebar ?? defaults.sidebar,
    editorHeight:
      stored.editorHeight == null || stored.editorHeight === 43
        ? defaults.editorHeight
        : stored.editorHeight,
  };
}

export function defaultWorkspace(): AppData {
  return {
    databaseId: newDatabaseId(),
    retired: [],
    draft: initialQuery,
    call: initialCall,
    history: [],
    sidebar: 300,
    editorHeight: 56,
  };
}

export async function loadData(): Promise<AppData> {
  const db = await storage();
  const stored = (await db.get("settings", "workspace")) as
    | StoredWorkspace
    | undefined;
  if (stored) return migrateWorkspace(stored);
  const data = defaultWorkspace();
  await db.put("settings", data, "workspace");
  await db.put("databases", emptyData(), data.databaseId);
  return data;
}

export async function saveData(data: AppData) {
  await (await storage()).put("settings", data, "workspace");
}

export async function loadPractice(databaseId: string): Promise<PracticeData> {
  const db = await storage();
  const stored = await db.get("databases", databaseId);
  if (stored) return stored as PracticeData;
  const fresh = emptyData();
  await db.put("databases", fresh, databaseId);
  return fresh;
}

export async function savePractice(databaseId: string, data: PracticeData) {
  await (await storage()).put("databases", data, databaseId);
}

export async function readTheme(): Promise<Theme> {
  return ((await (await storage()).get("settings", "theme")) as Theme) || "system";
}

export async function saveTheme(theme: Theme) {
  await (await storage()).put("settings", theme, "theme");
}
