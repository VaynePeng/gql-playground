import { ArrowUpRight } from "lucide-react";
import type { Catalog, FieldInfo, SchemaNode, TypeInfo } from "../types";
import { findField, findType, starterDocument } from "../graphql/catalog";
import { KindIcon, kindLabel } from "./SchemaTree";

function FieldTable({
  fields,
  onField,
}: {
  fields: FieldInfo[];
  onField?: (name: string) => void;
}) {
  if (!fields.length) return <p className="muted">没有字段</p>;
  return (
    <table className="structure-table">
      <thead>
        <tr>
          <th>字段</th>
          <th>类型</th>
          <th>可空</th>
          <th>参数</th>
          <th>说明</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((field) => (
          <tr key={field.name}>
            <td className="mono">
              {onField ? (
                <button
                  className="linkish"
                  onClick={() => onField(field.name)}
                >
                  {field.name}
                </button>
              ) : (
                field.name
              )}
            </td>
            <td>
              <code className="type-chip">{field.type}</code>
            </td>
            <td>{field.nullable ? "是" : "否"}</td>
            <td className="mono">
              {field.args.length
                ? field.args
                    .map((arg) => `${arg.name}: ${arg.type}`)
                    .join(", ")
                : "—"}
            </td>
            <td>{field.description ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SchemaDetail({
  catalog,
  selected,
  onSelect,
  onInsert,
}: {
  catalog: Catalog;
  selected: SchemaNode;
  onSelect: (node: SchemaNode) => void;
  onInsert: (document: string) => void;
}) {
  const type: TypeInfo | undefined =
    selected.kind === "type"
      ? findType(catalog, selected.name)
      : findType(catalog, selected.typeName);
  const field =
    selected.kind === "field" ? findField(catalog, selected) : undefined;
  if (!type) {
    return (
      <div className="empty-state">
        <h3>未找到该类型</h3>
      </div>
    );
  }
  const starter = starterDocument(catalog, selected);
  const heading = field ? `${type.name}.${field.name}` : type.name;
  const sub = field
    ? `${field.type}${field.description ? ` · ${field.description}` : ""}`
    : `${kindLabel[type.kind]}${type.description ? ` · ${type.description}` : ""}`;

  return (
    <section className="detail-panel">
      <div className="detail-heading">
        <KindIcon kind={field ? type.kind : type.kind} size={18} />
        <div>
          <strong>{heading}</strong>
          <small>{sub}</small>
        </div>
        {starter && !starter.startsWith("#") && (
          <button
            className="small-button"
            onClick={() => onInsert(starter)}
          >
            <ArrowUpRight size={14} />
            插入示例
          </button>
        )}
      </div>
      <div className="detail-scroll">
        {field ? (
          <>
            <div className="detail-label">返回类型</div>
            <p>
              <code className="type-chip">{field.type}</code>
              <span className="muted">
                {" "}
                · 字段本身{field.nullable ? "可空" : "不可空"}
              </span>
            </p>
            <div className="detail-label">
              参数 <span>{field.args.length} 个</span>
            </div>
            {field.args.length ? (
              <table className="structure-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>类型</th>
                    <th>可空</th>
                    <th>默认值</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {field.args.map((arg) => (
                    <tr key={arg.name}>
                      <td className="mono">{arg.name}</td>
                      <td>
                        <code className="type-chip">{arg.type}</code>
                      </td>
                      <td>{arg.nullable ? "是" : "否"}</td>
                      <td className="mono">{arg.defaultValue ?? "—"}</td>
                      <td>{arg.description ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">这个字段没有参数。</p>
            )}
            {field.description && (
              <>
                <div className="detail-label">说明</div>
                <p className="muted">{field.description}</p>
              </>
            )}
          </>
        ) : type.kind === "enum" ? (
          <>
            <div className="detail-label">
              枚举值 <span>{type.enumValues.length} 个 · 按定义顺序</span>
            </div>
            <div className="enum-values">
              {type.enumValues.map((value, index) => (
                <div key={value.name}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <code>{value.name}</code>
                  {value.description && <small>{value.description}</small>}
                </div>
              ))}
            </div>
          </>
        ) : type.kind === "union" ? (
          <>
            <div className="detail-label">可能的类型</div>
            {type.possibleTypes.map((name) => (
              <p className="reference" key={name}>
                <button
                  className="linkish"
                  onClick={() => onSelect({ kind: "type", name })}
                >
                  {name}
                </button>
              </p>
            ))}
            <FieldTable fields={type.fields} />
          </>
        ) : (
          <FieldTable
            fields={type.fields}
            onField={(name) =>
              onSelect({
                kind: "field",
                typeName: type.name,
                fieldName: name,
              })
            }
          />
        )}
      </div>
    </section>
  );
}
