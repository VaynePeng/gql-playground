import { useState, type ReactNode } from "react";
import { Check, Copy, ChevronRight, ChevronDown } from "lucide-react";
import { Modal } from "./Modal";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function previewOf(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (isPlainObject(value)) return `{ ${Object.keys(value).slice(0, 3).join(", ")}${Object.keys(value).length > 3 ? ", …" : ""} }`;
  return String(value);
}

function JsonNode({
  name,
  value,
  depth,
  onPick,
}: {
  name?: string;
  value: unknown;
  depth: number;
  onPick: (name: string, value: unknown) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const nested = Array.isArray(value) || isPlainObject(value);
  const label = name ?? (Array.isArray(value) ? "array" : "value");
  let body: ReactNode;
  if (value === null) body = <span className="json-null">null</span>;
  else if (typeof value === "string")
    body = <span className="json-string">{JSON.stringify(value)}</span>;
  else if (typeof value === "number")
    body = <span className="json-number">{String(value)}</span>;
  else if (typeof value === "boolean")
    body = <span className="json-bool">{String(value)}</span>;
  else if (Array.isArray(value)) {
    body = (
      <span className="json-preview">
        [{value.length} {value.length === 1 ? "item" : "items"}]
      </span>
    );
  } else if (isPlainObject(value)) {
    body = (
      <span className="json-preview">
        {Object.keys(value).length} keys
      </span>
    );
  } else body = <span>{String(value)}</span>;

  return (
    <div className="json-node" style={{ paddingLeft: depth ? 16 : 0 }}>
      <div className="json-line">
        {nested ? (
          <button
            className="json-toggle"
            aria-label={open ? "折叠" : "展开"}
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="json-toggle spacer" />
        )}
        {name != null && <span className="json-key">{name}</span>}
        {name != null && <span className="json-colon">:</span>}
        <button
          className="json-value"
          title="点击展开与复制"
          onClick={() => onPick(label, value)}
        >
          {nested && open ? (
            <span className="json-preview">{previewOf(value)}</span>
          ) : (
            body
          )}
        </button>
      </div>
      {nested && open && (
        <div>
          {Array.isArray(value)
            ? value.map((item, index) => (
                <JsonNode
                  key={index}
                  name={String(index)}
                  value={item}
                  depth={depth + 1}
                  onPick={onPick}
                />
              ))
            : Object.entries(value as Record<string, unknown>).map(
                ([key, item]) => (
                  <JsonNode
                    key={key}
                    name={key}
                    value={item}
                    depth={depth + 1}
                    onPick={onPick}
                  />
                ),
              )}
        </div>
      )}
    </div>
  );
}

export function ResultView({
  json,
  data,
}: {
  json: string;
  data: unknown;
}) {
  const [picked, setPicked] = useState<{ name: string; value: unknown }>();
  const [copy, setCopy] = useState("复制 JSON");
  const parsed = (() => {
    try {
      return JSON.parse(json) as unknown;
    } catch {
      return data;
    }
  })();

  if (parsed === undefined) {
    return (
      <div className="command-success">
        <Check size={28} />
        <h3>没有返回</h3>
        <p>这次执行没有 data 字段。</p>
      </div>
    );
  }

  const root =
    isPlainObject(parsed) && "data" in parsed ? parsed : { value: parsed };

  return (
    <div className="grid-wrap">
      <div className="json-tree">
        {isPlainObject(root)
          ? Object.entries(root).map(([key, value]) => (
              <JsonNode
                key={key}
                name={key}
                value={value}
                depth={0}
                onPick={(pickedName, pickedValue) => {
                  setPicked({ name: pickedName, value: pickedValue });
                  setCopy("复制 JSON");
                }}
              />
            ))
          : (
              <JsonNode
                value={parsed}
                depth={0}
                onPick={(pickedName, pickedValue) => {
                  setPicked({ name: pickedName, value: pickedValue });
                  setCopy("复制 JSON");
                }}
              />
            )}
      </div>
      {picked && (
        <Modal title={picked.name} onClose={() => setPicked(undefined)}>
          <pre className="cell-full">
            {picked.value === null
              ? "null"
              : JSON.stringify(picked.value, null, 2)}
          </pre>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  picked.value === null
                    ? "null"
                    : JSON.stringify(picked.value, null, 2),
                );
                setCopy("已复制");
              } catch {
                setCopy("复制失败，请手动选择文本");
              }
            }}
          >
            <Copy size={14} />
            {copy}
          </button>
        </Modal>
      )}
    </div>
  );
}
