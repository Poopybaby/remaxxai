"use client";

import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

/** REMAXX's colors for code: ink background, magenta keywords, cyan strings. */
const theme = EditorView.theme(
  {
    "&": { height: "100%", backgroundColor: "#0a0916", color: "#f4f2ff", fontSize: "13.5px" },
    ".cm-scroller": {
      fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, monospace',
      lineHeight: "1.6",
    },
    ".cm-content": { caretColor: "#3de8ff", padding: "12px 0" },
    ".cm-cursor": { borderLeftColor: "#3de8ff" },
    ".cm-gutters": { backgroundColor: "#0a0916", color: "#5d5880", border: "none" },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "#1a173055" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "#ff3dcb40 !important",
    },
    ".cm-matchingBracket": { backgroundColor: "#3de8ff30", outline: "none" },
    ".cm-searchMatch": { backgroundColor: "#ffd16640" },
    ".cm-panels": { backgroundColor: "#1a1730", color: "#f4f2ff" },
    ".cm-tooltip": { backgroundColor: "#231f3e", border: "1px solid #433d6b" },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword], color: "#ff6ad8" },
  { tag: [t.string, t.special(t.string), t.attributeValue], color: "#3de8ff" },
  { tag: [t.number, t.bool, t.null, t.atom, t.color, t.unit], color: "#ffd166" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#6e6990", fontStyle: "italic" },
  { tag: [t.tagName, t.typeName, t.className], color: "#ff8fa3" },
  { tag: [t.attributeName, t.propertyName], color: "#a5b4ff" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#5ef2b0" },
  { tag: [t.definition(t.variableName)], color: "#f4f2ff" },
  { tag: [t.punctuation, t.bracket, t.angleBracket], color: "#a9a4c9" },
]);

function languageFor(path: string): Extension {
  if (/\.html?$/i.test(path) || /\.svg$/i.test(path) || /\.xml$/i.test(path)) return html();
  if (/\.css$/i.test(path)) return css();
  if (/\.m?js$/i.test(path)) return javascript();
  if (/\.json$/i.test(path)) return javascript({ jsx: false });
  return [];
}

/**
 * CodeMirror for one file. Keeps a separate editor state (and undo history) per file, and
 * replaces it when the file changes from outside, for example after accepting an AI edit.
 */
export function CodeEditor({
  path,
  value,
  onChange,
  onSave,
  readOnly = false,
}: {
  path: string;
  value: string;
  onChange: (path: string, value: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const callbacks = useRef({ onChange, onSave });
  useEffect(() => {
    callbacks.current = { onChange, onSave };
  }, [onChange, onSave]);

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({ parent: host.current });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    let state = states.current.get(path);
    if (!state || state.doc.toString() !== value) {
      state = EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          theme,
          syntaxHighlighting(highlight),
          languageFor(path),
          EditorView.lineWrapping,
          EditorState.readOnly.of(readOnly),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                callbacks.current.onSave?.();
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            states.current.set(path, u.state);
            callbacks.current.onChange(path, u.state.doc.toString());
          }),
        ],
      });
      states.current.set(path, state);
    }
    if (v.state !== state) v.setState(state);
  }, [path, value, readOnly]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
