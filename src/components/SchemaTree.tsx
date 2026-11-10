import { useState } from "react";
import {
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Braces,
  Zap,
  Box,
  ListOrdered,
  Layers,
  CircleDot,
  Hash,
} from "lucide-react";
import type { Catalog, SchemaKind, SchemaNode, TypeInfo } from "../types";

const kindLabel: Record<SchemaKind, string> = {
  query: "查询",
  mutation: "变更",
  object: "对象",
  enum: "枚举",
  input: "输入",
  union: "联合",
  interface: "接口",
  scalar: "标量",
};

function KindIcon({ kind, size = 14 }: { kind: SchemaKind; size?: number }) {
  const Icon =
    kind === "mutation"
      ? Zap
      : kind === "query"
        ? Braces
        : kind === "enum"
          ? ListOrdered
          : kind === "input"
            ? Layers
            : kind === "union" || kind === "interface"
              ? CircleDot
              : kind === "scalar"
                ? Hash
                : Box;
  return <Icon size={size} />;
}

function matches(term: string, type: TypeInfo) {
  if (!term) return true;
  if (type.name.toLowerCase().includes(term)) return true;
  if (type.description?.toLowerCase().includes(term)) return true;
  return type.fields.some(
    (field) =>
      field.name.toLowerCase().includes(term) ||
      field.description?.toLowerCase().includes(term),
  );
}

export function SchemaTree({
  catalog,
  selected,
  onSelect,
  onRefresh,
  stats,
  stale,
}: {
  catalog: Catalog;
  selected?: SchemaNode;
  onSelect: (node: SchemaNode) => void;
  onRefresh: () => void;
  stats: { customers: number; products: number; orders: number };
  stale: string;
}) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const term = search.toLowerCase().trim();
  const toggle = (key: string) =>
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  const groups: { key: string; title: string; types: TypeInfo[] }[] = [
    { key: "query", title: "查询 Query", types: [catalog.query] },
    ...(catalog.mutation
      ? [{ key: "mutation", title: "变更 Mutation", types: [catalog.mutation] }]
      : []),
    {
      key: "types",
      title: "类型",
      types: catalog.types.filter((type) =>
        ["object", "union", "interface"].includes(type.kind),
      ),
    },
    {
      key: "enums",
      title: "枚举 / 输入 / 标量",
      types: catalog.types.filter((type) =>
        ["enum", "input", "scalar"].includes(type.kind),
      ),
    },
  ];

  return (
    <aside className="object-tree">
      <div className="section-heading">
        <span>SCHEMA</span>
        <button
          className="icon-button"
          aria-label="刷新 Schema"
          onClick={onRefresh}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <label className="search-box">
        <Search size={14} />
        <input
          aria-label="搜索 Schema"
          placeholder="搜索类型、字段…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <kbd>⌕</kbd>
      </label>
      <div className="tree-scroll">
        {groups.map((group) => {
          const types = group.types.filter((type) => matches(term, type));
          if (term && !types.length) return null;
          return (
            <div className="schema-group" key={group.key}>
              <button
                className="schema-row"
                onClick={() => {
                  toggle(group.key);
                  if (group.key === "query")
                    onSelect({ kind: "type", name: catalog.query.name });
                  if (group.key === "mutation" && catalog.mutation)
                    onSelect({
                      kind: "type",
                      name: catalog.mutation.name,
                    });
                }}
              >
                {collapsed[group.key] && !term ? (
                  <ChevronRight size={13} />
                ) : (
                  <ChevronDown size={13} />
                )}
                <Braces size={13} />
                <span>{group.title}</span>
                <small>{types.length}</small>
              </button>
              {(!collapsed[group.key] || term) &&
                (group.key === "query" || group.key === "mutation"
                  ? types[0]?.fields
                      .filter(
                        (field) =>
                          !term ||
                          field.name.toLowerCase().includes(term) ||
                          field.description?.toLowerCase().includes(term),
                      )
                      .map((field) => {
                        const type = types[0];
                        const active =
                          selected?.kind === "field" &&
                          selected.typeName === type.name &&
                          selected.fieldName === field.name;
                        return (
                          <button
                            title={field.description || field.type}
                            className={`object-row root-field ${active ? "active" : ""}`}
                            key={field.name}
                            onClick={() =>
                              onSelect({
                                kind: "field",
                                typeName: type.name,
                                fieldName: field.name,
                              })
                            }
                          >
                            <KindIcon kind={type.kind} />
                            <span>{field.name}</span>
                            <code className="tree-type">{field.type}</code>
                          </button>
                        );
                      })
                  : types.map((type) => {
                      const key = `${group.key}:${type.name}`;
                      const activeType =
                        selected?.kind === "type" && selected.name === type.name;
                      const fields = term
                        ? type.fields.filter(
                            (field) =>
                              field.name.toLowerCase().includes(term) ||
                              field.description
                                ?.toLowerCase()
                                .includes(term),
                          )
                        : type.fields;
                      return (
                        <div className="kind-group" key={type.name}>
                          <button
                            className={`kind-row ${activeType ? "active" : ""}`}
                            onClick={() => {
                              toggle(key);
                              onSelect({ kind: "type", name: type.name });
                            }}
                          >
                            {collapsed[key] && !term ? (
                              <ChevronRight size={12} />
                            ) : (
                              <ChevronDown size={12} />
                            )}
                            <KindIcon kind={type.kind} size={12} />
                            <span>{type.name}</span>
                            <small>
                              {type.kind === "enum"
                                ? type.enumValues.length
                                : type.fields.length}
                            </small>
                          </button>
                          {(!collapsed[key] || term) &&
                            fields.map((field) => {
                              const active =
                                selected?.kind === "field" &&
                                selected.typeName === type.name &&
                                selected.fieldName === field.name;
                              return (
                                <button
                                  title={field.description || field.type}
                                  className={`object-row ${active ? "active" : ""}`}
                                  key={field.name}
                                  onClick={() =>
                                    onSelect({
                                      kind: "field",
                                      typeName: type.name,
                                      fieldName: field.name,
                                    })
                                  }
                                >
                                  <KindIcon kind={type.kind} />
                                  <span>{field.name}</span>
                                  <code className="tree-type">{field.type}</code>
                                </button>
                              );
                            })}
                          {type.kind === "enum" &&
                            (!collapsed[key] || term) &&
                            type.enumValues
                              .filter((value) =>
                                term
                                  ? value.name.toLowerCase().includes(term)
                                  : true,
                              )
                              .map((value) => (
                                <button
                                  className="object-row"
                                  key={value.name}
                                  onClick={() =>
                                    onSelect({ kind: "type", name: type.name })
                                  }
                                >
                                  <span className="enum-dot" />
                                  <span>{value.name}</span>
                                </button>
                              ))}
                        </div>
                      );
                    }))}
            </div>
          );
        })}
        {term &&
          !groups.some((group) =>
            group.types.some((type) => matches(term, type)),
          ) && <p className="tree-empty">没有匹配的类型或字段</p>}
      </div>
      <div className="tree-bottom">
        {stale && <p className="stale">{stale}</p>}
        <p>
          {stats.customers} 位客户 · {stats.products} 件商品 · {stats.orders}{" "}
          笔订单
        </p>
        <p>Query / Mutation / 类型</p>
      </div>
    </aside>
  );
}

export { kindLabel, KindIcon };
