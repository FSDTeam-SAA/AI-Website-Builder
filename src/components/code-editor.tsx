"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";

import { useCurrentTheme } from "@/hooks/use-current-theme";

interface Props {
  path: string;
  /** The editing buffer. Controlled by the parent so Save reads state. */
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onSave: (content: string) => void;
}

function languageFor(path: string) {
  if (/\.(tsx|jsx)$/.test(path)) return [javascript({ jsx: true, typescript: true })];
  if (/\.ts$/.test(path)) return [javascript({ typescript: true })];
  if (/\.(js|mjs|cjs)$/.test(path)) return [javascript()];
  if (/\.css$/.test(path)) return [css()];
  if (/\.json$/.test(path)) return [json()];
  return [];
}

/**
 * Editable source view.
 *
 * Replaces the read-only Prism highlighter in the Code tab. Saving goes through
 * the same write-through path the AI tools use (database + live sandbox), so a
 * manual edit hot-reloads the preview exactly like a generated one.
 */
export const CodeEditor = ({ path, value, readOnly, onChange, onSave }: Props) => {
  const theme = useCurrentTheme();

  // The save keymap is built once, so it must read the latest buffer through a
  // ref rather than closing over a stale `value`.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const save = useCallback(() => {
    if (readOnly) return;
    onSave(valueRef.current);
  }, [onSave, readOnly]);

  const extensions = useMemo(
    () => [
      ...languageFor(path),
      EditorView.lineWrapping,
      // Prec.highest so Ctrl/Cmd+S beats the browser's "Save page" dialog.
      Prec.highest(
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              save();
              return true;
            },
          },
        ]),
      ),
    ],
    [path, save],
  );

  return (
    <CodeMirror
      value={value}
      height="100%"
      className="h-full text-sm"
      theme={theme === "dark" ? oneDark : "light"}
      editable={!readOnly}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: !readOnly,
        autocompletion: false,
        searchKeymap: true,
      }}
    />
  );
};
