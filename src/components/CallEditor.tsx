import { useEffect, useRef } from "react";
import { EditorState, Compartment, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { graphqlLanguageSupport } from "cm6-graphql";

interface Props {
  value: string;
  dark: boolean;
  focusPosition?: { offset: number; token: number };
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
          fontSize: "13px",
        },
        ".cm-scroller": {
          fontFamily:
            '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
          lineHeight: "1.8",
          overflow: "auto",
        },
        ".cm-content": { padding: "10px 0", caretColor: "var(--accent)" },
        ".cm-line": { padding: "0 24px 0 12px" },
        ".cm-gutters": {
          background: "var(--editor)",
          color: "var(--muted)",
          border: "none",
          minWidth: "48px",
        },
        ".cm-activeLine, .cm-activeLineGutter": {
          backgroundColor: "var(--active-line)",
        },
        ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
          { backgroundColor: "var(--selection)", borderRadius: "2px" },
        ".cm-placeholder": { color: "var(--muted)", fontStyle: "italic" },
        ".cm-cursor": { borderLeftColor: "var(--accent)" },
      },
      { dark },
    ),
    syntaxHighlighting(
      HighlightStyle.define([
        {
          tag: tags.keyword,
          color: dark ? "#a1bcff" : "#4268ba",
          fontWeight: "600",
        },
        { tag: tags.string, color: dark ? "#e7bd88" : "#ae6739" },
        {
          tag: tags.comment,
          color: dark ? "#73839c" : "#8e9aac",
          fontStyle: "italic",
        },
        { tag: tags.number, color: dark ? "#b8bcf0" : "#7661a4" },
        { tag: tags.bool, color: dark ? "#a1bcff" : "#4268ba", fontWeight: "600" },
        { tag: tags.operator, color: dark ? "#a6c9dc" : "#4e7892" },
        { tag: tags.typeName, color: dark ? "#9fd0c2" : "#3d7a6e" },
        { tag: tags.propertyName, color: dark ? "#c5d4f0" : "#355071" },
        { tag: tags.attributeName, color: dark ? "#c5b4e8" : "#6a5694" },
        { tag: tags.name, color: dark ? "#c5d4f0" : "#355071" },
      ]),
    ),
  ];
}

export function CallEditor(props: Props) {
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
          graphqlLanguageSupport(),
          theme.current.of(editorTheme(callbacks.current.dark)),
          placeholder('GetCustomer(id: "1")'),
          EditorView.contentAttributes.of({
            "aria-label": "GraphQL 调用语句",
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

  useEffect(() => {
    const v = view.current;
    if (v && props.focusPosition) {
      const pos = Math.min(props.focusPosition.offset, v.state.doc.length);
      v.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: "center" }),
      });
      v.focus();
    }
  }, [props.focusPosition]);

  return <div className="call-host" ref={host} />;
}
