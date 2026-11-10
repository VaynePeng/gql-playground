import type { PracticeData } from "../types";

export const SNAPSHOT_VERSION = "gql-playground-1";

export function packSnapshot(data: PracticeData, engine: string) {
  return new Blob(
    [
      JSON.stringify(
        {
          magic: "gqlplay",
          version: SNAPSHOT_VERSION,
          engine,
          exportedAt: new Date().toISOString(),
          data,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
}

export async function unpackSnapshot(
  file: File,
  engine: string,
): Promise<PracticeData> {
  let parsed: {
    magic?: string;
    version?: string;
    engine?: string;
    data?: PracticeData;
  };
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("无法读取快照文件，请确认这是 .gqlplay JSON。");
  }
  if (parsed.magic !== "gqlplay" || !parsed.data) {
    throw new Error("这不是有效的练习库快照。");
  }
  if (parsed.version !== SNAPSHOT_VERSION) {
    throw new Error(
      `快照版本不匹配（文件 ${parsed.version ?? "未知"}，当前 ${SNAPSHOT_VERSION}）。`,
    );
  }
  if (parsed.engine && parsed.engine !== engine) {
    throw new Error(
      `快照引擎版本不匹配（文件 ${parsed.engine}，当前 ${engine}）。`,
    );
  }
  if (
    !Array.isArray(parsed.data.customers) ||
    !Array.isArray(parsed.data.orders)
  ) {
    throw new Error("快照缺少练习数据。");
  }
  return parsed.data;
}
