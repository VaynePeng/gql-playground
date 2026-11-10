import { openDB } from "idb";
import { initialQuery, initialVariables } from "../examples/lessons";
import { emptyData } from "../graphql/seed";
import type { AppData, PracticeData } from "../types";

export type Theme = "light" | "dark" | "system";

const storage = openDB("gql-playground-app-v1", 1, {
  upgrade(db) {
    db.createObjectStore("settings");
    db.createObjectStore("databases");
  },
});

export const newDatabaseId = () => `gql-playground-${crypto.randomUUID()}`;

export function defaultWorkspace(): AppData {
  return {
    databaseId: newDatabaseId(),
    retired: [],
    draft: initialQuery,
    variables: initialVariables,
    history: [],
    sidebar: 256,
    editorHeight: 43,
    variablesOpen: true,
  };
}

export async function loadData(): Promise<AppData> {
  const db = await storage;
  const stored = await db.get("settings", "workspace");
  if (stored) {
    return {
      ...defaultWorkspace(),
      ...stored,
      draft: stored.draft ?? initialQuery,
      variables: stored.variables ?? initialVariables,
      history: stored.history ?? [],
      retired: stored.retired ?? [],
    };
  }
  const data = defaultWorkspace();
  await db.put("settings", data, "workspace");
  await db.put("databases", emptyData(), data.databaseId);
  return data;
}

export async function saveData(data: AppData) {
  await (await storage).put("settings", data, "workspace");
}

export async function loadPractice(databaseId: string): Promise<PracticeData> {
  const db = await storage;
  const stored = await db.get("databases", databaseId);
  if (stored) return stored as PracticeData;
  const fresh = emptyData();
  await db.put("databases", fresh, databaseId);
  return fresh;
}

export async function savePractice(databaseId: string, data: PracticeData) {
  await (await storage).put("databases", data, databaseId);
}

export async function readTheme(): Promise<Theme> {
  return ((await (await storage).get("settings", "theme")) as Theme) || "system";
}

export async function saveTheme(theme: Theme) {
  await (await storage).put("settings", theme, "theme");
}
