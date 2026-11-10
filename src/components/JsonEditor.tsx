import { useEffect, useRef } from "react";
import { EditorState, Compartment, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

interface Props {
  value: string;
  dark: boolean;
  onChange: (value: string) => void;
  onRun: () => void;
}

function editorTheme(dark: boolean) {
  return [
    EditorView.theme(
      {
        "&": {
          height: "100%",
          backgroundColor: "var(--editor)",
          color: "var(--text)",
          fontSize: "12px",
        },
        ".cm-scroller": {
          fontFamily:
            '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
          lineHeight: "1.7",
          overflow: "auto",
        },
        ".cm-content": { padding: "10px 0", caretColor: "var(--accent)" },
        ".cm-line": { padding: "0 16px 0 8px" },
        ".cm-gutters": {
          background: "var(--editor)",
          color: "var(--muted)",
          border: "none",
          minWidth: "36px",
        },
        ".cm-activeLine, .cm-activeLineGutter": {
          backgroundColor: "var(--active-line)",
        },
        ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
          { backgroundColor: "var(--selection)", borderRadius: "2px" },
        ".cm-cursor": { borderLeftColor: "var(--accent)" },
      },
      { dark },
    ),
    syntaxHighlighting(
      HighlightStyle.define([
        { tag: tags.string, color: dark ? "#e7bd88" : "#ae6739" },
        { tag: tags.number, color: dark ? "#b8bcf0" : "#7661a4" },
        {
          tag: tags.bool,
          color: dark ? "#a1bcff" : "#4268ba",
          fontWeight: "600",
        },
        { tag: tags.null, color: dark ? "#73839c" : "#8e9aac" },
        { tag: tags.propertyName, color: dark ? "#c5d4f0" : "#355071" },
      ]),
    ),
  ];
}

export function JsonEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const theme = useRef(new Compartment());

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: callbacks.current.value,
        extensions: [
          basicSetup,
          json(),
          theme.current.of(editorTheme(callbacks.current.dark)),
          EditorView.contentAttributes.of({
            "aria-label": "GraphQL 变量 JSON 编辑器",
            spellcheck: "false",
          }),
          keymap.of([indentWithTab]),
          Prec.highest(
            keymap.of([
              {
                key: "Mod-Enter",
                preventDefault: true,
                run: () => {
                  callbacks.current.onRun();
                  return true;
                },
              },
            ]),
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              callbacks.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== props.value)
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: props.value },
      });
  }, [props.value]);

  useEffect(() => {
    view.current?.dispatch({
      effects: theme.current.reconfigure(editorTheme(props.dark)),
    });
  }, [props.dark]);

  return <div className="json-host" ref={host} />;
}
