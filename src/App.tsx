import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  Play,
  BookOpen,
  Sun,
  Moon,
  Monitor,
  Download,
  Upload,
  RotateCcw,
  ChevronDown,
  Check,
  CircleAlert,
  History,
  Terminal,
  PanelLeft,
  ArrowUpRight,
  Trash2,
  FileCode2,
  LoaderCircle,
  Search,
  X,
  Braces,
  Share2,
  CornerDownRight,
} from "lucide-react";
import { version as graphqlVersion } from "graphql";
import {
  loadData,
  saveData,
  loadPractice,
  savePractice,
  newDatabaseId,
  readTheme,
  saveTheme,
  type Theme,
} from "./storage/store";
import { packSnapshot, unpackSnapshot } from "./storage/snapshot";
import type {
  AppData,
  Catalog,
  Execution,
  HistoryItem,
  PracticeData,
  SchemaNode,
  StoreStats,
} from "./types";
import { GqlEditor } from "./components/GqlEditor";
import { CallEditor } from "./components/CallEditor";
import { SchemaTree } from "./components/SchemaTree";
import { SchemaDetail } from "./components/SchemaDetail";
import { ResultView } from "./components/ResultView";
import { Modal } from "./components/Modal";
import { lessons } from "./examples/lessons";
import { PracticeStore } from "./graphql/store";
import { getSchema } from "./graphql/schema";
import { readCatalog } from "./graphql/catalog";
import { executeGql, locationToOffset } from "./graphql/execute";
import { CALL_SOURCE } from "./graphql/call";
import { emptyData, seedSummary } from "./graphql/seed";
import { download, toErrorMessage } from "./utils";

const schema = getSchema();
const engineLabel = `graphql-js ${graphqlVersion}`;
const themeOptions = [
  { value: "light", label: "浅色", Icon: Sun },
  { value: "dark", label: "深色", Icon: Moon },
  { value: "system", label: "跟随系统", Icon: Monitor },
] as const;
type Panel = "results" | "messages" | "detail" | "history";
type Dialog = "lessons" | "backup" | "reset" | "help" | null;

function summarize(execution: Execution) {
  if (execution.errors?.length)
    return execution.errors.map((error) => error.message).join(" · ");
  if (execution.data && typeof execution.data === "object") {
    const entries = Object.entries(execution.data as Record<string, unknown>);
    if (!entries.length) return "空对象";
    return entries
      .map(([key, value]) => {
        if (Array.isArray(value)) return `${key}: ${value.length} 条`;
        if (value && typeof value === "object") return key;
        return `${key}: ${JSON.stringify(value)}`;
      })
      .join(" · ");
  }
  return execution.operation;
}

export function App() {
  const [data, setData] = useState<AppData>();
  const [theme, setTheme] = useState<Theme>("system");
  const [systemDark, setSystemDark] = useState(
    matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const dark = theme === "dark" || (theme === "system" && systemDark);
  const [phase, setPhase] = useState("正在打开本地练习库…");
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState("");
  const storeRef = useRef<PracticeStore | undefined>(undefined);
  const dataRef = useRef(data);
  dataRef.current = data;
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [catalog, setCatalog] = useState<Catalog>(() => readCatalog(schema));
  const [stats, setStats] = useState<StoreStats>({
    customers: 0,
    products: 0,
    orders: 0,
    items: 0,
  });
  const [practice, setPractice] = useState<PracticeData>(() => emptyData());
  const [stale, setStale] = useState("");
  const [selected, setSelected] = useState<SchemaNode>();
  const [selection, setSelection] = useState({ text: "", from: 0 });
  const [execution, setExecution] = useState<Execution>();
  const [executed, setExecuted] = useState<{
    query: string;
    call: string;
    draft: string;
    from: number;
    duration: number;
  }>();
  const [panel, setPanel] = useState<Panel>("results");
  const [focusPosition, setFocusPosition] = useState<{
    offset: number;
    token: number;
  }>();
  const [callFocus, setCallFocus] = useState<{
    offset: number;
    token: number;
  }>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [themeMenu, setThemeMenu] = useState(false);
  const [mobileTree, setMobileTree] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState("本地已保存");
  const [storeError, setStoreError] = useState("");
  const [persistent, setPersistent] = useState(false);
  const graphqlInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const disabled = !ready || busy;

  const refresh = useCallback(() => {
    if (!storeRef.current) return;
    setCatalog(readCatalog(schema));
    setPractice(storeRef.current.snapshot());
    setStats(storeRef.current.stats());
    setStale("");
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlock: (() => void) | undefined;
    readTheme()
      .then((value) => {
        if (!disposed) setTheme(value);
      })
      .catch(() => {});
    const media = matchMedia("(prefers-color-scheme: dark)");
    const changed = () => setSystemDark(media.matches);
    media.addEventListener("change", changed);
    async function boot() {
      if (!navigator.locks) {
        throw new Error(
          "当前浏览器不支持 Web Locks，请用新版 Chrome 或 Safari 打开本地地址。",
        );
      }
      await navigator.locks.request(
        "gql-playground-workspace-v1",
        { ifAvailable: true },
        async (lock) => {
          if (!lock)
            throw new Error(
              "另一个页面正在使用练习库。关闭那个页面后，再刷新这里。",
            );
          const held = new Promise<void>((resolve) => {
            unlock = resolve;
          });
          try {
            const stored = await loadData();
            const practice = await loadPractice(stored.databaseId);
            if (disposed) return;
            storeRef.current = new PracticeStore(practice);
            setData(stored);
            setPractice(storeRef.current.snapshot());
            setStats(storeRef.current.stats());
            setCatalog(readCatalog(schema));
            setReady(true);
            navigator.storage
              ?.persisted()
              .then(setPersistent)
              .catch(() => {});
            await held;
          } catch (error) {
            if (!disposed) setBootError(toErrorMessage(error));
          }
        },
      );
    }
    boot().catch((error) => {
      if (!disposed) setBootError(toErrorMessage(error));
    });
    return () => {
      disposed = true;
      unlock?.();
      media.removeEventListener("change", changed);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);

  useEffect(() => {
    if (!data) return;
    setSaveState("保存中…");
    const timer = setTimeout(() => {
      saveData(data)
        .then(() => {
          setSaveState("本地已保存");
          setStoreError("");
        })
        .catch((error) => {
          setSaveState("保存失败");
          setStoreError(
            `浏览器存储失败：${toErrorMessage(error)}。请导出查询和练习数据备份。`,
          );
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [data]);

  useEffect(() => {
    const flush = () => {
      if (dataRef.current) void saveData(dataRef.current).catch(() => {});
      if (dataRef.current && storeRef.current)
        void savePractice(
          dataRef.current.databaseId,
          storeRef.current.snapshot(),
        ).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 250);
    return () => clearInterval(timer);
  }, [busy, startedAt]);

  async function persistPractice() {
    if (!dataRef.current || !storeRef.current) return;
    await savePractice(dataRef.current.databaseId, storeRef.current.snapshot());
  }

  async function run(source: string, from = 0, selectedText = false) {
    if (!storeRef.current || !ready || busyRef.current || !source.trim()) return;
    busyRef.current = true;
    setBusy(true);
    setStartedAt(Date.now());
    setElapsed(0);
    setPanel("results");
    const started = performance.now();
    const draft = dataRef.current?.draft || "";
    const call = dataRef.current?.call || "";
    try {
      const result = await executeGql({
        schema,
        store: storeRef.current,
        source,
        call,
      });
      const duration = performance.now() - started;
      setExecution(result);
      setExecuted({ query: source, call, draft, from, duration });
      if (result.errors?.length) setPanel("messages");
      const history: HistoryItem = {
        id: crypto.randomUUID(),
        query: source,
        call,
        scope: selectedText ? "选区" : "全部",
        time: new Date().toISOString(),
        duration,
        success: !result.errors?.length,
        summary: summarize(result),
        error: result.errors?.[0],
      };
      setData((current) =>
        current
          ? { ...current, history: [history, ...current.history].slice(0, 200) }
          : current,
      );
      if (result.operation === "mutation") {
        await persistPractice();
        refresh();
      }
    } catch (error) {
      setNotice(toErrorMessage(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function task(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setStartedAt(Date.now());
    setElapsed(0);
    try {
      await fn();
    } catch (error) {
      setNotice(toErrorMessage(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function putDraft(query: string, call?: string) {
    setData((current) =>
      current
        ? {
            ...current,
            draft: query,
            call: call ?? current.call,
          }
        : current,
    );
    setSelection({ text: "", from: 0 });
  }

  async function loadExample(reset = false) {
    if (disabled || !storeRef.current) return;
    await task(async () => {
      storeRef.current!.seed();
      await persistPractice();
      refresh();
      setNotice(reset ? "练习数据已重置" : `练习数据已载入：${seedSummary}`);
      putDraft(lessons[0].query, lessons[0].call);
      setDialog(null);
    });
  }

  async function switchDatabase(nextData = emptyData()) {
    const oldData = dataRef.current!;
    const databaseId = newDatabaseId();
    await savePractice(databaseId, nextData);
    const updated = {
      ...oldData,
      databaseId,
      retired: [...oldData.retired, oldData.databaseId],
    };
    await saveData(updated);
    storeRef.current = new PracticeStore(nextData);
    setData(updated);
    setSelected(undefined);
    setExecution(undefined);
    setExecuted(undefined);
    refresh();
    setPanel("results");
    setDialog(null);
  }

  function resize(
    event: PointerEvent<HTMLDivElement>,
    direction: "sidebar" | "editor",
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const target = event.currentTarget;
    const move = (moveEvent: globalThis.PointerEvent) => {
      const rect = workspace.current!.getBoundingClientRect();
      if (direction === "sidebar")
        setData((current) =>
          current
            ? {
                ...current,
                sidebar: Math.max(
                  200,
                  Math.min(420, moveEvent.clientX - rect.left),
                ),
              }
            : current,
        );
      else
        setData((current) =>
          current
            ? {
                ...current,
                editorHeight: Math.max(
                  22,
                  Math.min(
                    75,
                    ((moveEvent.clientY - rect.top) / rect.height) * 100,
                  ),
                ),
              }
            : current,
        );
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }

  function locateError() {
    const error = execution?.errors?.find((item) => item.locations?.[0]);
    const location = error?.locations?.[0];
    if (!executed || !location) return;
    const inCall = error?.extensions?.source === CALL_SOURCE;
    if (inCall) {
      if (data?.call !== executed.call) {
        setNotice("调用语句已修改，请从历史恢复后再定位。");
        return;
      }
      const offset = locationToOffset(
        executed.call,
        location.line,
        location.column,
      );
      setCallFocus({ offset, token: Date.now() });
      return;
    }
    if (data?.draft !== executed.draft) {
      setNotice("编辑器内容已修改，请从历史恢复原查询后再定位。");
      return;
    }
    const offset = locationToOffset(
      executed.query,
      location.line,
      location.column,
    );
    setFocusPosition({ offset: executed.from + offset, token: Date.now() });
  }

  const history =
    data?.history.filter((item) =>
      `${item.query} ${item.call} ${item.summary}`
        .toLowerCase()
        .includes(historySearch.toLowerCase()),
    ) || [];
  const currentTheme = themeOptions.find((item) => item.value === theme)!;
  const ThemeIcon = currentTheme.Icon;
  const exampleLoaded = Boolean(storeRef.current?.data.example);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Share2 size={20} />
          </div>
          <div>
            <h1>
              GQL <span>Playground</span>
            </h1>
            <p>你的 GraphQL 实验室</p>
          </div>
        </div>
        <div className="workspace-label">
          <span className="status-dot" />
          本地练习库<span className="local-tag">LOCAL</span>
        </div>
        <nav className="top-actions">
          <button aria-label="练习手册" onClick={() => setDialog("lessons")}>
            <BookOpen size={15} />
            <span>练习手册</span>
          </button>
          <button
            aria-label="数据管理"
            disabled={!ready}
            onClick={() => setDialog("backup")}
          >
            <Download size={15} />
            <span>数据管理</span>
          </button>
          <div className="theme-picker">
            <button
              aria-label={`颜色主题：${currentTheme.label}`}
              aria-expanded={themeMenu}
              onClick={() => setThemeMenu(!themeMenu)}
            >
              <ThemeIcon size={16} />
              <ChevronDown size={12} />
            </button>
            {themeMenu && (
              <>
                <button
                  className="menu-dismiss"
                  aria-label="关闭主题菜单"
                  onClick={() => setThemeMenu(false)}
                />
                <div className="theme-menu">
                  {themeOptions.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      onClick={() => {
                        setTheme(value);
                        setThemeMenu(false);
                        saveTheme(value).catch(() =>
                          setNotice("主题已切换，但偏好保存失败"),
                        );
                      }}
                    >
                      <Icon size={15} />
                      {label}
                      {theme === value && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </nav>
      </header>
      <div className="contextbar">
        <span>
          <Terminal size={13} /> WORKSPACE <span className="slash">/</span>{" "}
          <strong>自由练习</strong>
        </span>
        <button className="text-button" onClick={() => setDialog("help")}>
          使用说明 <ArrowUpRight size={12} />
        </button>
      </div>
      {!ready ? (
        <main className="boot-screen">
          {bootError ? (
            <>
              <CircleAlert size={32} />
              <h2>练习库暂时不可用</h2>
              <p>{bootError}</p>
              <button onClick={() => location.reload()}>重新加载</button>
            </>
          ) : (
            <>
              <LoaderCircle className="spin" size={30} />
              <h2>{phase}</h2>
              <p>查询在浏览器内执行，数据保存在当前地址的 IndexedDB。</p>
            </>
          )}
        </main>
      ) : (
        <>
          {storeError && (
            <div className="global-warning" role="alert">
              {storeError}
            </div>
          )}
          <main
            className={`workspace ${mobileTree ? "show-tree" : ""}`}
            ref={workspace}
            style={
              {
                "--sidebar-width": `${data?.sidebar || 300}px`,
                "--editor-height": `${data?.editorHeight || 43}%`,
              } as CSSProperties
            }
          >
            <SchemaTree
              catalog={catalog}
              practice={practice}
              selected={selected}
              onSelect={(node) => {
                setSelected(node);
                setPanel("detail");
                setMobileTree(false);
              }}
              onRefresh={refresh}
              stats={stats}
              stale={stale}
            />
            <div
              className="divider vertical"
              role="separator"
              aria-label="调整数据栏宽度"
              aria-orientation="vertical"
              tabIndex={0}
              onPointerDown={(event) => resize(event, "sidebar")}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight")
                  setData((current) =>
                    current
                      ? {
                          ...current,
                          sidebar: Math.max(
                            200,
                            Math.min(
                              420,
                              current.sidebar +
                                (event.key === "ArrowRight" ? 10 : -10),
                            ),
                          ),
                        }
                      : current,
                  );
              }}
            />
            <div className="main-workbench">
              <section className="editor-section">
                <div className="editor-toolbar">
                  <div className="editor-title">
                    <button
                      className="icon-button mobile-toggle"
                      aria-label="显示练习库"
                      onClick={() => setMobileTree(!mobileTree)}
                    >
                      <PanelLeft size={16} />
                    </button>
                    <FileCode2 size={15} />
                    <span>playground.graphql</span>
                    <span className="draft-dot" title="自动保存草稿" />
                  </div>
                  <div className="editor-actions">
                    <button
                      className="icon-button"
                      aria-label="导入 GraphQL 文件"
                      title="导入 GraphQL 文件"
                      onClick={() => graphqlInput.current?.click()}
                    >
                      <Upload size={14} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="导出 GraphQL 文件"
                      title="导出 GraphQL 文件"
                      onClick={() =>
                        download(
                          new Blob([data?.draft || ""], {
                            type: "application/graphql;charset=utf-8",
                          }),
                          "playground.graphql",
                        )
                      }
                    >
                      <Download size={14} />
                    </button>
                    <span className="toolbar-separator" />
                    <button
                      className="primary run-button"
                      aria-label="运行"
                      title={
                        selection.text
                          ? "运行选中的操作（⌘ / Ctrl + Enter）"
                          : "运行当前文档（⌘ / Ctrl + Enter）"
                      }
                      disabled={
                        disabled ||
                        !(selection.text || data?.draft || "").trim()
                      }
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        void run(
                          selection.text || data?.draft || "",
                          selection.text ? selection.from : 0,
                          !!selection.text,
                        )
                      }
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={14} />
                      ) : (
                        <Play size={13} fill="currentColor" />
                      )}
                      <span>运行</span>
                      <kbd>⌘ ↵</kbd>
                    </button>
                  </div>
                </div>
                <div className="editor-body">
                  <GqlEditor
                    value={data?.draft || ""}
                    dark={dark}
                    schema={schema}
                    focusPosition={focusPosition}
                    onChange={(value) =>
                      setData((current) =>
                        current ? { ...current, draft: value } : current,
                      )
                    }
                    onSelection={setSelection}
                    onRun={(text, from, selectedText) =>
                      void run(text, from, selectedText)
                    }
                  />
                  <div className="call-pane">
                    <div className="call-toolbar">
                      <span>
                        <CornerDownRight size={12} />
                        调用
                      </span>
                      <span className="muted">
                        有参数时在此调用，例如 GetCustomer(id: "1") · 无参数可留空
                      </span>
                    </div>
                    <CallEditor
                      value={data?.call || ""}
                      dark={dark}
                      focusPosition={callFocus}
                      onChange={(value) =>
                        setData((current) =>
                          current ? { ...current, call: value } : current,
                        )
                      }
                      onRun={() =>
                        void run(
                          selection.text || data?.draft || "",
                          selection.text ? selection.from : 0,
                          !!selection.text,
                        )
                      }
                    />
                  </div>
                </div>
                <div className="editor-status">
                  <span>
                    GraphQL <span className="muted">·</span> 浏览器内执行
                  </span>
                  <span>
                    {selection.text
                      ? `已选择 ${selection.text.length} 个字符 · 快捷键执行选区`
                      : "⌘ / Ctrl + Enter 运行"}
                    <span className="status-divider">|</span>
                    {saveState}
                  </span>
                </div>
              </section>
              <div
                className="divider horizontal"
                role="separator"
                aria-label="调整编辑器高度"
                aria-orientation="horizontal"
                tabIndex={0}
                onPointerDown={(event) => resize(event, "editor")}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" || event.key === "ArrowDown")
                    setData((current) =>
                      current
                        ? {
                            ...current,
                            editorHeight: Math.max(
                              22,
                              Math.min(
                                75,
                                current.editorHeight +
                                  (event.key === "ArrowDown" ? 3 : -3),
                              ),
                            ),
                          }
                        : current,
                    );
                }}
              />
              <section className="output-section">
                <div className="output-tabs">
                  <div>
                    {(
                      [
                        { key: "results", label: "查询结果", Icon: Braces },
                        { key: "messages", label: "消息", Icon: Terminal },
                        { key: "detail", label: "类型详情", Icon: Share2 },
                        { key: "history", label: "历史记录", Icon: History },
                      ] as const
                    ).map(({ key, label, Icon }) => (
                      <button
                        className={panel === key ? "active" : ""}
                        key={key}
                        onClick={() => setPanel(key)}
                      >
                        <Icon size={14} />
                        {label}
                        {key === "messages" && execution?.errors?.length ? (
                          <span className="error-dot" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                  <span className="execution-meta">
                    {busy
                      ? `${(elapsed / 1000).toFixed(1)}s`
                      : executed
                        ? `总耗时 ${executed.duration.toFixed(0)} ms`
                        : "等待执行"}
                  </span>
                </div>
                {panel === "results" ? (
                  execution ? (
                    <>
                      {execution.errors?.length ? (
                        <div className="global-warning">
                          执行返回了 GraphQL 错误。data 仍可能包含部分结果。
                          <button onClick={() => setPanel("messages")}>
                            查看错误
                          </button>
                        </div>
                      ) : null}
                      <ResultView json={execution.json} data={execution.data} />
                    </>
                  ) : (
                    <div className="welcome">
                      <div className="welcome-symbol">
                        <Braces size={25} />
                      </div>
                      <span className="eyebrow">
                        A LITTLE ROOM FOR BIG QUERIES
                      </span>
                      <h2>把想法，写成 GraphQL。</h2>
                      <p>
                        点击右上方「运行」，执行你的第一条查询。
                        <br />
                        字段、参数、片段与变更，都可以在这里试一试。
                      </p>
                      <div>
                        <button
                          aria-label="练习手册"
                          onClick={() => setDialog("lessons")}
                        >
                          <BookOpen size={14} />
                          探索练习手册
                        </button>
                      </div>
                      <span className="welcome-footnote">
                        <span className="status-dot" /> 在浏览器里运行 ·
                        无需后端服务
                      </span>
                    </div>
                  )
                ) : panel === "messages" ? (
                  <div className="messages-panel">
                    {execution?.errors?.length ? (
                      execution.errors.map((error, index) => (
                        <div className="error-card" key={index}>
                          <div>
                            <CircleAlert size={17} />
                            <strong>
                              {(error.extensions?.code as string) ||
                                "GRAPHQL ERROR"}
                            </strong>
                            {error.locations?.[0] && (
                              <button onClick={locateError}>定位错误 ↗</button>
                            )}
                          </div>
                          <pre>{error.message}</pre>
                          {error.locations?.[0] && (
                            <p>
                              LOCATION · {error.locations[0].line}:
                              {error.locations[0].column}
                            </p>
                          )}
                          {error.path && (
                            <p>PATH · {error.path.map(String).join(" / ")}</p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="success-line">
                        <Check size={16} />
                        {execution
                          ? "执行完成，没有 GraphQL 错误。"
                          : "还没有执行记录。"}
                      </p>
                    )}
                    {execution && (
                      <p className="command-line">
                        <span>01</span>
                        <code>{execution.operation}</code>
                        <small>
                          {execution.errors?.length
                            ? `${execution.errors.length} 个错误`
                            : "成功"}
                        </small>
                      </p>
                    )}
                  </div>
                ) : panel === "detail" ? (
                  selected ? (
                    <SchemaDetail
                      catalog={catalog}
                      selected={selected}
                      onSelect={(node) => setSelected(node)}
                      onInsert={(example) => {
                        putDraft(example.query, example.call);
                        setNotice("示例已放入编辑器，尚未执行");
                        setPanel("results");
                      }}
                    />
                  ) : (
                    <div className="empty-state">
                      <Share2 size={28} />
                      <h3>从左侧选择表上的操作或类型</h3>
                      <p>查看参数、可空性和说明，并插入到编辑器。</p>
                    </div>
                  )
                ) : (
                  <div className="history-panel">
                    <div className="history-toolbar">
                      <label className="search-box">
                        <Search size={14} />
                        <input
                          aria-label="搜索执行历史"
                          placeholder="搜索查询、调用或结果…"
                          value={historySearch}
                          onChange={(event) =>
                            setHistorySearch(event.target.value)
                          }
                        />
                      </label>
                      <button
                        disabled={!data?.history.length}
                        onClick={() => {
                          if (
                            confirm(
                              "清空最近的执行历史？查询草稿和练习数据不受影响。",
                            )
                          )
                            setData((current) =>
                              current ? { ...current, history: [] } : current,
                            );
                        }}
                      >
                        <Trash2 size={13} />
                        清空
                      </button>
                    </div>
                    <div className="history-list">
                      {history.length ? (
                        history.map((item) => (
                          <button
                            className="history-item"
                            key={item.id}
                            onClick={() => {
                              putDraft(item.query, item.call);
                              setNotice(
                                "查询和调用已恢复到编辑器，尚未执行",
                              );
                            }}
                          >
                            <div>
                              <span
                                className={
                                  item.success ? "success-line" : "error-text"
                                }
                              >
                                {item.success ? (
                                  <Check size={13} />
                                ) : (
                                  <CircleAlert size={13} />
                                )}{" "}
                                {item.success ? "成功" : "失败"}
                              </span>
                              <time>
                                {new Date(item.time).toLocaleString("zh-CN")}
                              </time>
                              <span>
                                {item.scope} · {item.duration.toFixed(0)} ms
                              </span>
                              <ArrowUpRight size={14} />
                            </div>
                            <pre>{item.query}</pre>
                            <p>{item.summary}</p>
                          </button>
                        ))
                      ) : (
                        <div className="empty-small">
                          暂无匹配记录。执行后会自动保存最近 200 次查询。
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </main>
        </>
      )}
      <footer className="statusbar">
        <span>
          <span className={`status-dot ${bootError ? "error" : ""}`} />
          {!ready ? "初始化" : busy ? "执行中" : "就绪"}
          <span className="status-divider">|</span>
          <span title={engineLabel}>GraphQL · {engineLabel}</span>
        </span>
        <span>
          <span className="desktop-only">
            数据仅在当前浏览器<span className="status-divider">|</span>
          </span>
          <button className="text-button" onClick={() => setDialog("help")}>
            {persistent ? "持久存储已授权" : "本地存储"}
          </button>
        </span>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <CircleAlert size={16} />
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <input
        type="file"
        ref={graphqlInput}
        accept=".graphql,.gql,text/plain"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (file.size > 5_000_000) {
            setNotice("GraphQL 文件请控制在 5 MB 以内");
            return;
          }
          try {
            const text = await file.text();
            if (
              data?.draft.trim() &&
              !confirm("用导入文件替换当前草稿？不会自动执行。")
            )
              return;
            putDraft(text);
            setNotice("查询已导入，尚未执行");
          } catch (error) {
            setNotice(toErrorMessage(error));
          }
        }}
      />
      <input
        type="file"
        ref={backupInput}
        accept=".gqlplay,application/json"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file || disabled) return;
          await task(async () => {
            const practice = await unpackSnapshot(file, engineLabel);
            await switchDatabase(practice);
            setNotice("备份已验证并恢复；原练习库仍保留在浏览器中。");
          });
        }}
      />
      {dialog === "lessons" && (
        <Modal wide title="练习手册" onClose={() => setDialog(null)}>
          <div className="lesson-intro">
            <span className="eyebrow">LEARN BY QUERYING</span>
            <h3>从一个字段，到一次变更。</h3>
            <p>
              {seedSummary}，覆盖查询、参数、嵌套、片段、调用与 mutation。
              <br />
              先载入数据，再选一条练习，改一改、运行看看。
            </p>
            <button
              className="primary"
              disabled={disabled || exampleLoaded}
              onClick={() => void loadExample()}
            >
              <Share2 size={14} />
              {exampleLoaded ? "练习数据已载入" : "载入练习数据"}
            </button>
            {exampleLoaded && (
              <button
                className="text-button"
                disabled={disabled}
                onClick={() => {
                  if (
                    confirm(
                      "重建练习示例数据？其中通过 mutation 新增或修改的内容也会被覆盖。",
                    )
                  )
                    void loadExample(true);
                }}
              >
                重置示例
              </button>
            )}
          </div>
          <div className="lesson-grid">
            {lessons.map((lesson) => (
              <button
                key={lesson.title}
                className="lesson-card"
                onClick={() => {
                  putDraft(lesson.query, lesson.call);
                  setDialog(null);
                  setNotice(
                    exampleLoaded
                      ? "练习查询已放入编辑器"
                      : "请先在练习手册中载入数据，再运行练习查询",
                  );
                }}
              >
                <span>{lesson.level}</span>
                <h4>
                  {lesson.title}
                  <ArrowUpRight size={16} />
                </h4>
                <p>{lesson.description}</p>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {dialog === "backup" && (
        <Modal title="数据管理" onClose={() => setDialog(null)}>
          <p className="muted">
            备份包含练习库对象与数据。查询草稿可通过编辑器的导出按钮单独保存为
            .graphql 文件。
          </p>
          <button
            className="action-card"
            disabled={disabled}
            onClick={() =>
              void task(async () => {
                if (!storeRef.current) return;
                download(
                  packSnapshot(storeRef.current.snapshot(), engineLabel),
                  `gql-playground-${new Date().toISOString().slice(0, 10)}.gqlplay`,
                );
                setNotice("练习数据快照已导出");
                setDialog(null);
              })
            }
          >
            <Download size={20} />
            <span>
              <strong>导出练习数据快照</strong>
              <small>下载 .gqlplay 文件，供相同版本恢复</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
          <button
            className="action-card"
            disabled={disabled}
            onClick={() => backupInput.current?.click()}
          >
            <Upload size={20} />
            <span>
              <strong>从快照恢复</strong>
              <small>先在新库验证，成功后切换，原库仍保留</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
          <button
            className="action-card danger"
            disabled={disabled}
            onClick={() => setDialog("reset")}
          >
            <RotateCcw size={20} />
            <span>
              <strong>重置整个练习库</strong>
              <small>切换为空库，保留查询草稿和历史</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
          {!!data?.retired.length && (
            <div className="retired">
              <p>
                保留了 {data.retired.length} 个旧练习库，可重新打开核对数据。
              </p>
              {data.retired.map((id, index) => (
                <button
                  key={id}
                  disabled={disabled}
                  onClick={() =>
                    void task(async () => {
                      const practice = await loadPractice(id);
                      const updated = {
                        ...dataRef.current!,
                        databaseId: id,
                        retired: [
                          ...dataRef.current!.retired.filter(
                            (item) => item !== id,
                          ),
                          dataRef.current!.databaseId,
                        ],
                      };
                      await saveData(updated);
                      storeRef.current = new PracticeStore(practice);
                      setData(updated);
                      setSelected(undefined);
                      setExecution(undefined);
                      refresh();
                      setDialog(null);
                      setNotice("已重新打开保留的练习库");
                    })
                  }
                >
                  打开保留库 {index + 1}
                  <small>{id.slice(-8)}</small>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
      {dialog === "reset" && (
        <Modal title="重置整个练习库？" onClose={() => setDialog(null)}>
          <p>
            将切换到一个新的空练习库。当前库会保留，可在数据管理中重新打开；查询草稿和历史不会清空。
          </p>
          <div className="dialog-actions">
            <button onClick={() => setDialog("backup")}>返回</button>
            <button
              className="danger"
              disabled={disabled}
              onClick={() =>
                void task(async () => {
                  await switchDatabase();
                  setNotice(
                    "已切换到新的空库；查询草稿和历史已保留。",
                  );
                })
              }
            >
              创建空库并切换
            </button>
          </div>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal title="给 GraphQL 留一个练习的地方" onClose={() => setDialog(null)}>
          <div className="help-content">
            <h3>运行与操作</h3>
            <p>
              ⌘ / Ctrl + Enter 优先执行选区，无选区时执行整个文档。文档含多个
              operation 时，可在下方调用语句里写操作名，或选中其中一个再运行。
              需要参数时，在查询下方写调用，例如 GetCustomer(id: "1")；没有参数时调用区可以留空。
            </p>
            <p>
              左侧是练习库：每张表列出文档字段和当前行。表下面的名称是读写这张表的操作，点进去可以插入示例，再在编辑器里运行。
            </p>
            <h3>结果与保存</h3>
            <p>
              结果是标准 GraphQL JSON。点击值可展开全文并复制。练习数据、草稿、历史、布局和主题保存在当前浏览器、当前地址下。
              127.0.0.1、localhost 和不同端口是不同 origin，不能混用。
            </p>
            <p>
              执行发生在浏览器进程内，没有远程 GraphQL
              接口。刷新同一地址会恢复数据；清除站点数据或使用无痕窗口可能丢失练习内容。
            </p>
            <button
              disabled={persistent}
              onClick={async () => {
                const granted = await navigator.storage?.persist();
                setPersistent(!!granted);
                setNotice(
                  granted
                    ? "已获得持久存储权限"
                    : "浏览器暂未授权，仍可使用本地存储；请定期备份",
                );
              }}
            >
              {persistent ? "持久存储已授权" : "申请浏览器持久存储"}
            </button>
            <h3>运行范围</h3>
            <p>
              这是单页、本地优先的 GraphQL
              练习环境。Schema 由练习库提供，不能在编辑器里任意新增根类型。没有订阅、没有网络端点，也不连接远程数据库。
            </p>
            <p className="mono version-text">{engineLabel}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
