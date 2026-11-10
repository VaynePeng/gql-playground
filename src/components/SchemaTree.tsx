import { useMemo, useState } from "react";
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
  Database,
} from "lucide-react";
import type { Catalog, PracticeData, SchemaKind, SchemaNode, TypeInfo } from "../types";
import {
  describeDatabase,
  type DatabaseTable,
  type TableAction,
  type TableColumn,
} from "../graphql/databaseView";

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
  if (type.enumValues.some((value) => value.name.toLowerCase().includes(term))) return true;
  return type.fields.some(
    (field) =>
      field.name.toLowerCase().includes(term) ||
      field.description?.toLowerCase().includes(term),
  );
}

function ActionChips({
  actions,
  selected,
  onSelect,
}: {
  actions: TableAction[];
  selected?: SchemaNode;
  onSelect: (node: SchemaNode) => void;
}) {
  const reads = actions.filter((action) => action.kind === "query");
  const writes = actions.filter((action) => action.kind === "mutation");
  const groups = [
    { key: "query", label: "读取", items: reads },
    { key: "mutation", label: "写入", items: writes },
  ].filter((group) => group.items.length);
  if (!groups.length) return null;
  return (
    <div className="db-ops">
      {groups.map((group) => (
        <div className="db-op-line" key={group.key}>
          <span className="db-op-kind">{group.label}</span>
          {group.items.map((action) => {
            const active =
              selected?.kind === "field" &&
              selected.typeName === action.typeName &&
              selected.fieldName === action.fieldName;
            return (
              <button
                type="button"
                key={`${action.typeName}.${action.fieldName}`}
                className={`db-chip ${active ? "active" : ""}`}
                title={[action.signature, action.description].filter(Boolean).join(" · ")}
                onClick={() =>
                  onSelect({
                    kind: "field",
                    typeName: action.typeName,
                    fieldName: action.fieldName,
                  })
                }
              >
                {action.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ColumnHead({
  table,
  column,
  selected,
  onSelect,
}: {
  table: DatabaseTable;
  column: TableColumn;
  selected?: SchemaNode;
  onSelect: (node: SchemaNode) => void;
}) {
  if (!column.graphqlType) {
    return (
      <span className="db-col-name" title={`${column.name} · 只在文档里`}>
        {column.name}
      </span>
    );
  }
  const active =
    selected?.kind === "field" &&
    selected.typeName === table.typeName &&
    selected.fieldName === column.name;
  return (
    <button
      type="button"
      className={`db-col-name ${active ? "active" : ""}`}
      title={`${column.name}: ${column.graphqlType}`}
      onClick={() =>
        onSelect({
          kind: "field",
          typeName: table.typeName,
          fieldName: column.name,
        })
      }
    >
      {column.name}
    </button>
  );
}

function TableBlock({
  table,
  expanded,
  active,
  selected,
  onOpen,
  onSelect,
}: {
  table: DatabaseTable;
  expanded: boolean;
  active: boolean;
  selected?: SchemaNode;
  onOpen: () => void;
  onSelect: (node: SchemaNode) => void;
}) {
  return (
    <section className="db-table">
      <button
        type="button"
        className={`schema-row db-table-head ${active ? "active" : ""}`}
        aria-expanded={expanded}
        aria-current={active ? "true" : undefined}
        title={`${table.title} ${table.collection} · 在下方查看 ${table.total} 行`}
        onClick={onOpen}
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="db-title">{table.title}</span>
        <code className="db-collection">{table.collection}</code>
        <small>{table.total}</small>
      </button>
      {expanded ? (
        <>
          <p className="db-fields">
            {table.columns.map((column, index) => (
              <span key={column.name}>
                {index > 0 ? <span className="db-dot">·</span> : null}
                <ColumnHead
                  table={table}
                  column={column}
                  selected={selected}
                  onSelect={onSelect}
                />
              </span>
            ))}
          </p>
          <ActionChips actions={table.actions} selected={selected} onSelect={onSelect} />
        </>
      ) : null}
    </section>
  );
}

function objectMatches(table: DatabaseTable, term: string) {
  if (!term) return true;
  const haystack = [
    table.title,
    table.collection,
    table.typeName,
    ...table.columns.map((column) => column.name),
    ...table.actions.map((action) => `${action.label} ${action.fieldName}`),
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(term);
}

export function SchemaTree({
  catalog,
  practice,
  activeTable,
  selected,
  onOpenTable,
  onSelect,
  onRefresh,
  stats,
  stale,
}: {
  catalog: Catalog;
  practice: PracticeData;
  activeTable: string;
  selected?: SchemaNode;
  onOpenTable: (key: DatabaseTable["key"]) => void;
  onSelect: (node: SchemaNode) => void;
  onRefresh: () => void;
  stats: { customers: number; products: number; orders: number; items: number };
  stale: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ customers: true });
  const term = search.toLowerCase().trim();
  const full = useMemo(() => describeDatabase(practice, catalog), [practice, catalog]);
  const tables = full.tables.filter((table) => objectMatches(table, term));
  const other = term
    ? full.other.filter(
        (action) =>
          action.label.toLowerCase().includes(term) ||
          action.fieldName.toLowerCase().includes(term) ||
          (action.description?.toLowerCase().includes(term) ?? false),
      )
    : full.other;
  const toggle = (key: string) =>
    setOpen((current) => ({ ...current, [key]: !current[key] }));
  const typeList = catalog.types.filter((type) => matches(term, type));
  const showTypes = !term || typeList.length > 0;
  const showOther = !term || other.length > 0;
  const emptyLibrary = full.tables.every((table) => table.total === 0);
  const nothing = term && !tables.length && !other.length && !typeList.length;

  return (
    <aside className="object-tree">
      <div className="section-heading">
        <span className="db-heading">
          <Database size={13} />
          练习库
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="刷新练习库"
          onClick={onRefresh}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <label className="search-box">
        <Search size={14} />
        <input
          aria-label="搜索表、字段或操作"
          placeholder="搜索表、字段或操作…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className="tree-scroll">
        {emptyLibrary && !term ? (
          <p className="db-hint">
            练习库是空的。打开「练习手册」载入示例，或用写入操作添加数据。
          </p>
        ) : null}
        {tables.map((table) => (
          <TableBlock
            key={table.key}
            table={table}
            expanded={Boolean(term) || Boolean(open[table.key])}
            active={activeTable === table.key}
            selected={selected}
            onOpen={() => {
              onOpenTable(table.key);
              if (activeTable === table.key || !open[table.key]) toggle(table.key);
            }}
            onSelect={onSelect}
          />
        ))}
        {showOther ? (
          <section className="db-table">
            <button
              type="button"
              className="schema-row"
              aria-expanded={Boolean(term) || Boolean(open.other)}
              onClick={() => toggle("other")}
            >
              {Boolean(term) || open.other ? (
                <ChevronDown size={13} />
              ) : (
                <ChevronRight size={13} />
              )}
              <span>其他操作</span>
                <small>{other.length}</small>
            </button>
            {Boolean(term) || open.other ? (
              <>
                <p className="db-hint">不直接对应一张表，仍可在编辑器里调用。</p>
                <ActionChips actions={other} selected={selected} onSelect={onSelect} />
              </>
            ) : null}
          </section>
        ) : null}
        {showTypes ? (
          <section className="schema-group">
            <button
              type="button"
              className="schema-row"
              aria-expanded={Boolean(term) || Boolean(open.types)}
              onClick={() => toggle("types")}
            >
              {Boolean(term) || open.types ? (
                <ChevronDown size={13} />
              ) : (
                <ChevronRight size={13} />
              )}
              <Layers size={13} />
              <span>类型</span>
              <small>{term ? typeList.length : catalog.types.length}</small>
            </button>
            {Boolean(term) || open.types
              ? (term ? typeList : catalog.types).map((type) => {
                  const key = `type:${type.name}`;
                  const expanded = Boolean(term) || Boolean(open[key]);
                  const activeType = selected?.kind === "type" && selected.name === type.name;
                  const fields = term
                    ? type.fields.filter(
                        (field) =>
                          field.name.toLowerCase().includes(term) ||
                          field.description?.toLowerCase().includes(term) ||
                          type.name.toLowerCase().includes(term),
                      )
                    : type.fields;
                  return (
                    <div className="kind-group" key={type.name}>
                      <button
                        type="button"
                        className={`kind-row ${activeType ? "active" : ""}`}
                        onClick={() => {
                          toggle(key);
                          onSelect({ kind: "type", name: type.name });
                        }}
                      >
                        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <KindIcon kind={type.kind} size={12} />
                        <span>{type.name}</span>
                        <small>
                          {type.kind === "enum" ? type.enumValues.length : type.fields.length}
                        </small>
                      </button>
                      {expanded
                        ? fields.map((field) => {
                            const active =
                              selected?.kind === "field" &&
                              selected.typeName === type.name &&
                              selected.fieldName === field.name;
                            return (
                              <button
                                type="button"
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
                          })
                        : null}
                      {type.kind === "enum" && expanded
                        ? type.enumValues
                            .filter((value) =>
                              !term ||
                              type.name.toLowerCase().includes(term) ||
                              value.name.toLowerCase().includes(term),
                            )
                            .map((value) => (
                              <button
                                type="button"
                                className="object-row"
                                key={value.name}
                                onClick={() => onSelect({ kind: "type", name: type.name })}
                              >
                                <span className="enum-dot" />
                                <span>{value.name}</span>
                              </button>
                            ))
                        : null}
                    </div>
                  );
                })
              : null}
          </section>
        ) : null}
        {nothing ? <p className="tree-empty">没有匹配的表或字段</p> : null}
      </div>
      <div className="tree-bottom">
        {stale ? <p className="stale">{stale}</p> : null}
        <p>
          {stats.customers} 位客户 · {stats.products} 件商品 · {stats.orders} 笔订单 ·{" "}
          {stats.items} 条明细
        </p>
        <p>点一张表，在下方查看当前行</p>
      </div>
    </aside>
  );
}

export { kindLabel, KindIcon };
