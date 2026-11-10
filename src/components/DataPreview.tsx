import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  cellState,
  formatCell,
  pageRows,
  PREVIEW_PAGE_SIZE,
  rowKey,
  type DatabaseTable,
} from "../graphql/databaseView";

function cellLabel(column: string, row: Record<string, unknown>) {
  const state = cellState(row, column);
  if (state.missing) return { text: "—", className: "preview-missing", title: "无此字段" };
  if (state.value === null) return { text: "null", className: "preview-null", title: "null" };
  const text = formatCell(state.value);
  return { text, className: "", title: text === "" ? "空字符串" : text };
}

export function DataPreview({ table }: { table: DatabaseTable }) {
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [table.key]);
  const view = pageRows(table.rows, page, PREVIEW_PAGE_SIZE);

  return (
    <div className="data-preview">
      <div className="preview-toolbar">
        <strong>{table.title}</strong>
        <code>{table.collection}</code>
        <span>
          {view.total
            ? `${view.from}–${view.to} / ${view.total} 行`
            : "0 行"}
        </span>
        <div className="preview-pager">
          <button
            type="button"
            className="icon-button"
            aria-label="上一页"
            disabled={view.page === 0}
            onClick={() => setPage(view.page - 1)}
          >
            <ChevronLeft size={14} />
          </button>
          <span>
            {view.page + 1} / {view.pages}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="下一页"
            disabled={view.page >= view.pages - 1}
            onClick={() => setPage(view.page + 1)}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div className="data-scroll">
        <table className="preview-table">
          <thead>
            <tr>
              <th className="row-number">#</th>
              {table.columns.map((column) => (
                <th key={column.name} title={column.graphqlType ?? "只在文档里"}>
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row, index) => (
              <tr key={rowKey(row, view.from + index - 1)}>
                <td className="row-number">{view.from + index}</td>
                {table.columns.map((column) => {
                  const cell = cellLabel(column.name, row);
                  return (
                    <td key={column.name} title={cell.title}>
                      <span className={cell.className}>{cell.text}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {view.total === 0 ? <p className="empty-small">这张表还没有行。</p> : null}
      </div>
    </div>
  );
}
