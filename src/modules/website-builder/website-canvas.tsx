"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  Layers3,
  MousePointer2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canvasDocument } from "./canvas-bridge";

type Selection = {
  index: number;
  tag: string;
  text: string;
  textEditable: boolean;
  color: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  textAlign: string;
  fontFamily: string;
  href: string;
  alt: string;
  background: string;
  radius: string;
  paddingX: string;
  paddingY: string;
};
type Layer = { index: number; label: string; tag: string };
type Props = {
  html: string;
  css: string;
  title: string;
  device: number;
  editable: boolean;
  onChange: (html: string, css: string) => void;
  onRoute: (slug: string) => void;
  onShortcut: (action: "save" | "undo" | "redo") => void;
};
const selector = "body *:not(script):not(style)";
const fonts = [
  "Arial, Helvetica, sans-serif",
  "Georgia, serif",
  "system-ui, sans-serif",
  "Verdana, sans-serif",
  "Courier New, monospace",
];
const sizes = [12, 14, 16, 18, 20, 24, 32, 40, 48, 64, 80, 96];
export function WebsiteCanvas(props: Props) {
  const { onRoute, onShortcut } = props;
  const stage = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLIFrameElement>(null);
  const propertiesPanel = useRef<HTMLElement>(null);
  const [available, setAvailable] = useState(900);
  const [inspecting, setInspecting] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [copy, setCopy] = useState("");
  const [color, setColor] = useState("#ffffff");
  const [size, setSize] = useState("24");
  const [align, setAlign] = useState("left");
  const [weight, setWeight] = useState("400");
  const [lineHeight, setLineHeight] = useState("1.5");
  const [spacing, setSpacing] = useState("0");
  const [font, setFont] = useState("");
  const [href, setHref] = useState("");
  const [alt, setAlt] = useState("");
  const [background, setBackground] = useState("#ffffff");
  const [radius, setRadius] = useState("0");
  const [paddingX, setPaddingX] = useState("0");
  const [paddingY, setPaddingY] = useState("0");
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [validation, setValidation] = useState("");
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver((entries) =>
      setAvailable(entries[0].contentRect.width),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setSelected(null);
    setContextMenu(null);
    setEdited(new Set());
  }, [props.html, props.css]);
  useEffect(() => {
    if (!selected || window.innerWidth > 1100 || contextMenu) return;
    const task = requestAnimationFrame(() =>
      propertiesPanel.current?.scrollIntoView({ block: "start" }),
    );
    return () => cancelAnimationFrame(task);
  }, [selected, contextMenu]);
  const layers = useMemo<Layer[]>(() => {
    if (typeof DOMParser === "undefined") return [];
    const doc = new DOMParser().parseFromString(props.html, "text/html"),
      nodes = [...doc.querySelectorAll(selector)];
    // Sections stay within their original parent. Complex nested markup remains intact.
    const root = doc.querySelector("main") || doc.body;
    return [...root.children]
      .filter((el) => !["SCRIPT", "STYLE"].includes(el.tagName))
      .map((el) => ({
        index: nodes.indexOf(el),
        tag: el.tagName.toLowerCase(),
        label: (
          el.querySelector("h1,h2,h3")?.textContent ||
          el.getAttribute("aria-label") ||
          el.getAttribute("id") ||
          el.tagName.toLowerCase()
        )
          .trim()
          .slice(0, 70),
      }));
  }, [props.html]);
  const availableActions = useMemo(() => {
    if (!selected || typeof DOMParser === "undefined")
      return { up: false, down: false, parent: false };
    const doc = new DOMParser().parseFromString(props.html, "text/html"),
      nodes = [...doc.querySelectorAll(selector)],
      el = nodes[selected.index];
    return {
      up: !!el?.previousElementSibling,
      down: !!el?.nextElementSibling,
      parent: !!el?.parentElement && nodes.includes(el.parentElement),
    };
  }, [selected, props.html]);
  const token = useMemo(
    () =>
      typeof crypto !== "undefined"
        ? crypto.randomUUID().replace(/-/g, "")
        : "serverpreview",
    // Each preview document needs its own capability, including changes in editor mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.html, props.css, inspecting, props.editable],
  );
  const documentHtml = useMemo(
    () =>
      canvasDocument(
        props.html,
        props.css,
        token,
        inspecting,
        typeof window === "undefined"
          ? "http://localhost"
          : window.location.origin,
        props.editable,
      ),
    [props.html, props.css, token, inspecting, props.editable],
  );
  const viewportWidth =
    props.device === 1
      ? 768
      : props.device === 2
        ? 390
        : Math.max(900, available);
  const viewportHeight =
    props.device === 1 ? 1024 : props.device === 2 ? 844 : 700;
  const scale = Math.min(1, Math.max(100, available - 4) / viewportWidth);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.scope !== "kora-preview" ||
        event.data.token !== token
      )
        return;
      if (
        event.data.type === "navigate" &&
        typeof event.data.slug === "string"
      ) {
        onRoute(event.data.slug);
        return;
      }
      if (
        event.data.type === "shortcut" &&
        ["save", "undo", "redo"].includes(event.data.action)
      ) {
        onShortcut(event.data.action);
        return;
      }
      if (event.data.type === "escape") {
        setSelected(null);
        setContextMenu(null);
        return;
      }
      if (
        event.data.type !== "select" ||
        !Number.isInteger(event.data.index) ||
        !props.editable
      )
        return;
      const value = event.data as Selection;
      if (typeof value.color !== "string" || typeof value.fontSize !== "string")
        return;
      setSelected(value);
      setCopy(String(value.text));
      setSize(String(parseFloat(value.fontSize) || 24));
      setAlign(
        ["left", "center", "right", "justify"].includes(value.textAlign)
          ? value.textAlign
          : "left",
      );
      setWeight(value.fontWeight);
      setLineHeight(
        value.lineHeight === "normal"
          ? "1.5"
          : String(
              Math.round(
                (parseFloat(value.lineHeight) /
                  (parseFloat(value.fontSize) || 16)) *
                  100,
              ) / 100,
            ),
      );
      setSpacing(String(parseFloat(value.letterSpacing) || 0));
      setFont(value.fontFamily);
      setHref(value.href);
      setAlt(value.alt);
      setEdited(new Set());
      setValidation("");
      const bg = value.background?.match(/\d+/g);
      setBackground(
        bg?.length
          ? `#${bg
              .slice(0, 3)
              .map((n) => Number(n).toString(16).padStart(2, "0"))
              .join("")}`
          : "#ffffff",
      );
      setRadius(String(parseFloat(value.radius) || 0));
      setPaddingX(String(parseFloat(value.paddingX) || 0));
      setPaddingY(String(parseFloat(value.paddingY) || 0));
      const rgb = value.color.match(/\d+/g);
      setColor(
        rgb?.length
          ? `#${rgb
              .slice(0, 3)
              .map((n) => Number(n).toString(16).padStart(2, "0"))
              .join("")}`
          : "#ffffff",
      );
      if (event.data.context) {
        const rect = frame.current!.getBoundingClientRect();
        setContextMenu({
          x: Math.max(
            8,
            Math.min(
              window.innerWidth - 225,
              rect.left + Number(event.data.x) * scale,
            ),
          ),
          y: Math.max(
            8,
            Math.min(
              window.innerHeight - 210,
              rect.top + Number(event.data.y) * scale,
            ),
          ),
        });
      } else setContextMenu(null);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [token, props.editable, onRoute, onShortcut, scale]);
  function touch(key: string) {
    setEdited((current) => new Set([...current, key]));
    setValidation("");
  }
  function commit(
    doc: Document,
    css = props.css,
    message = "Draft updated. Save when you're ready.",
  ) {
    if (!props.editable) return;
    props.onChange(doc.body.innerHTML, css);
    setSelected(null);
    setContextMenu(null);
    setFeedback(message);
  }
  function elementAction(
    action: "duplicate" | "delete" | "up" | "down" | "parent",
  ) {
    if (!selected || !props.editable) return;
    const doc = new DOMParser().parseFromString(props.html, "text/html"),
      nodes = [...doc.querySelectorAll(selector)],
      el = nodes[selected.index];
    if (!el) return;
    if (action === "parent") {
      const index = el.parentElement ? nodes.indexOf(el.parentElement) : -1;
      if (index >= 0)
        frame.current?.contentWindow?.postMessage(
          { type: "inspect", index, token },
          "*",
        );
      return;
    }
    if (action === "delete") {
      if (
        !window.confirm(
          "Remove this element and its content? You can undo this change.",
        )
      )
        return;
      el.remove();
    }
    if (action === "duplicate") {
      const clone = el.cloneNode(true) as Element;
      [clone, ...clone.querySelectorAll("[id]")].forEach((node) =>
        node.removeAttribute("id"),
      );
      el.after(clone);
    }
    if (action === "up") {
      if (!el.previousElementSibling) return;
      el.previousElementSibling.before(el);
    }
    if (action === "down") {
      if (!el.nextElementSibling) return;
      el.nextElementSibling.after(el);
    }
    commit(doc);
  }
  function moveLayer(from: number, to: number) {
    if (!props.editable || from === to) return;
    const doc = new DOMParser().parseFromString(props.html, "text/html"),
      nodes = doc.querySelectorAll(selector),
      source = nodes[from],
      target = nodes[to];
    if (!source || !target || source.parentElement !== target.parentElement)
      return;
    const siblings = [...source.parentElement!.children];
    if (siblings.indexOf(source) < siblings.indexOf(target))
      target.after(source);
    else target.before(source);
    commit(doc, props.css, "Section order updated. Use Undo to reverse it.");
  }
  function change() {
    if (!selected || !props.editable || !edited.size) return;
    const doc = new DOMParser().parseFromString(props.html, "text/html"),
      element = doc.querySelectorAll(selector)[selected.index];
    if (!element) return;
    if (
      (edited.has("size") &&
        (!Number.isFinite(Number(size)) ||
          Number(size) < 8 ||
          Number(size) > 240)) ||
      (edited.has("lineHeight") &&
        (!Number.isFinite(Number(lineHeight)) ||
          Number(lineHeight) < 0.5 ||
          Number(lineHeight) > 4)) ||
      (edited.has("spacing") &&
        (!Number.isFinite(Number(spacing)) ||
          Number(spacing) < -10 ||
          Number(spacing) > 30))
    ) {
      setValidation(
        "Use a font size of 8-240 px, line height of 0.5-4 and letter spacing of -10 to 30 px.",
      );
      return;
    }
    if (
      [
        ["radius", radius],
        ["paddingX", paddingX],
        ["paddingY", paddingY],
      ].some(
        ([key, value]) =>
          edited.has(key) &&
          (!Number.isFinite(Number(value)) ||
            Number(value) < 0 ||
            Number(value) > 240),
      )
    ) {
      setValidation("Use spacing and corner values between 0 and 240 px.");
      return;
    }
    if (
      edited.has("href") &&
      href &&
      !/^(https?:\/\/|mailto:|tel:|#|\/(?!\/)|\.\/)[^\s]*$/i.test(href)
    ) {
      setValidation(
        "Use an https:// URL, email, phone, anchor or local page path.",
      );
      return;
    }
    if (edited.has("copy") && selected.textEditable) element.textContent = copy;
    if (edited.has("href") && selected.tag === "a") {
      if (href) element.setAttribute("href", href);
      else element.removeAttribute("href");
    }
    if (edited.has("alt") && selected.tag === "img")
      element.setAttribute("alt", alt);
    const declarations: string[] = [];
    if (edited.has("color")) declarations.push(`color:${color}`);
    if (edited.has("size")) declarations.push(`font-size:${Number(size)}px`);
    if (edited.has("align")) declarations.push(`text-align:${align}`);
    if (edited.has("weight")) declarations.push(`font-weight:${weight}`);
    if (edited.has("lineHeight"))
      declarations.push(`line-height:${Number(lineHeight)}`);
    if (edited.has("spacing"))
      declarations.push(`letter-spacing:${Number(spacing)}px`);
    if (edited.has("font") && fonts.includes(font))
      declarations.push(`font-family:${font}`);
    if (edited.has("background"))
      declarations.push(`background-color:${background}`);
    if (edited.has("radius"))
      declarations.push(`border-radius:${Number(radius)}px`);
    if (edited.has("paddingX"))
      declarations.push(
        `padding-left:${Number(paddingX)}px`,
        `padding-right:${Number(paddingX)}px`,
      );
    if (edited.has("paddingY"))
      declarations.push(
        `padding-top:${Number(paddingY)}px`,
        `padding-bottom:${Number(paddingY)}px`,
      );
    let css = props.css;
    if (declarations.length) {
      const name = `kora-edit-${crypto.randomUUID().slice(0, 8)}`;
      element.classList.add(name);
      css += `\n.${name}.${name}{${declarations.join(";")}}`;
    }
    commit(doc, css);
  }
  return (
    <div className="wc-layout">
      <div className="wc-stage" ref={stage}>
        <div className="wc-controls">
          <button
            aria-pressed={inspecting}
            disabled={!props.editable}
            title="Click any element to edit its properties"
            onClick={() => {
              setInspecting(!inspecting);
              setSelected(null);
            }}
          >
            <MousePointer2 size={14} />
            {inspecting ? "Selecting elements" : "Select an element"}
          </button>
          <button
            aria-pressed={showLayers}
            onClick={() => setShowLayers(!showLayers)}
          >
            <Layers3 size={14} />
            Sections
          </button>
          <small>
            {viewportWidth.toFixed(0)} x {viewportHeight} |{" "}
            {Math.round(scale * 100)}%
          </small>
          <button
            disabled={!props.editable}
            title="Append a new content section"
            onClick={() => {
              const doc = new DOMParser().parseFromString(
                  props.html,
                  "text/html",
                ),
                section = doc.createElement("section");
              section.className = "kora-new-section";
              section.innerHTML =
                "<h2>Your new section</h2><p>Add your content here.</p>";
              (doc.querySelector("main") || doc.body).appendChild(section);
              commit(
                doc,
                `${props.css}\n.kora-new-section{padding:56px 32px;max-width:1100px;margin:auto}`,
                "Section added. Open Sections to reorder it.",
              );
            }}
          >
            <Plus size={14} />
            Section
          </button>
        </div>
        <p className="wc-help">
          {props.editable
            ? "Double-click to edit | Right-click for actions | Drag sections to reorder"
            : "Read-only preview"}
        </p>
        {feedback && (
          <p className="wc-feedback" aria-live="polite">
            {feedback}
            <button
              aria-label="Dismiss editor message"
              onClick={() => setFeedback("")}
            >
              <X size={12} />
            </button>
          </p>
        )}
        {showLayers && (
          <section className="wc-layers" aria-label="Page sections">
            <header>
              <strong>Page sections</strong>
              <small>Drag to reorder, or use the arrows</small>
            </header>
            {layers.length ? (
              layers.map((layer, i) => (
                <div
                  key={layer.index}
                  className={`wc-layer ${dropTarget === layer.index ? "is-drop-target" : ""}`}
                  onDragOver={(event) => {
                    if (dragged !== null) {
                      event.preventDefault();
                      setDropTarget(layer.index);
                      event.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragged !== null) moveLayer(dragged, layer.index);
                    setDragged(null);
                    setDropTarget(null);
                  }}
                >
                  <button
                    className="wc-drag-handle"
                    draggable={props.editable}
                    disabled={!props.editable}
                    aria-label={`Drag section ${layer.label}`}
                    title="Drag to reorder"
                    onDragStart={(event) => {
                      setDragged(layer.index);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(
                        "text/plain",
                        String(layer.index),
                      );
                    }}
                    onDragEnd={() => {
                      setDragged(null);
                      setDropTarget(null);
                    }}
                  >
                    <GripVertical size={16} />
                  </button>
                  <span>
                    <strong>{layer.label}</strong>
                    <small>{layer.tag}</small>
                  </span>
                  <button
                    disabled={!props.editable || i === 0}
                    aria-label={`Move ${layer.label} up`}
                    onClick={() => moveLayer(layer.index, layers[i - 1].index)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    disabled={!props.editable || i === layers.length - 1}
                    aria-label={`Move ${layer.label} down`}
                    onClick={() => moveLayer(layer.index, layers[i + 1].index)}
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
              ))
            ) : (
              <p>Add a section to get started.</p>
            )}
          </section>
        )}
        <div
          className="wc-frame-holder"
          style={{
            width: viewportWidth * scale,
            height: (viewportHeight + 32) * scale,
          }}
        >
          <div
            className="kw-browser wc-viewport"
            style={{
              width: viewportWidth,
              height: viewportHeight + 32,
              transform: `scale(${scale})`,
            }}
          >
            <div className="kw-browser-bar">
              <i />
              <i />
              <i />
              <span>Draft preview - {props.title}</span>
            </div>
            <iframe
              ref={frame}
              title={`${props.title} preview`}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              srcDoc={documentHtml}
            />
          </div>
        </div>
      </div>
      {selected && (
        <aside
          ref={propertiesPanel}
          className="wc-properties"
          aria-label="Element properties"
        >
          <header>
            <strong>{selected.tag.toUpperCase()} element</strong>
            <button
              aria-label="Close properties"
              onClick={() => setSelected(null)}
            >
              <X size={14} />
            </button>
          </header>
          <p className="wh-footnote">
            Changes stay in your draft until you save.
          </p>
          {selected.textEditable ? (
            <label>
              Text content
              <textarea
                value={copy}
                maxLength={3000}
                onChange={(event) => {
                  setCopy(event.target.value);
                  touch("copy");
                }}
              />
            </label>
          ) : (
            <p className="wc-help">
              This element contains other elements. Select the text inside it to
              edit the wording.
            </p>
          )}
          {selected.tag === "img" ? (
            <label>
              Image description
              <input
                value={alt}
                maxLength={500}
                onChange={(event) => {
                  setAlt(event.target.value);
                  touch("alt");
                }}
              />
            </label>
          ) : (
            <>
              <h3>Typography</h3>
              <label>
                Font family
                <select
                  value={fonts.includes(font) ? font : "current"}
                  onChange={(event) => {
                    setFont(event.target.value);
                    touch("font");
                  }}
                >
                  <option value="current" disabled>
                    Current font
                  </option>
                  {fonts.map((value) => (
                    <option key={value} value={value}>
                      {value.split(",")[0]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="wc-field-grid">
                <label>
                  Font size (px)
                  <input
                    type="number"
                    min={8}
                    max={240}
                    step={1}
                    value={size}
                    onChange={(event) => {
                      setSize(event.target.value);
                      touch("size");
                    }}
                  />
                </label>
                <label>
                  Font weight
                  <select
                    value={weight}
                    onChange={(event) => {
                      setWeight(event.target.value);
                      touch("weight");
                    }}
                  >
                    {[100, 200, 300, 400, 500, 600, 700, 800, 900].map(
                      (value) => (
                        <option key={value} value={value}>
                          {value}
                          {value === 400
                            ? " - Regular"
                            : value === 700
                              ? " - Bold"
                              : ""}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <label>
                Type scale
                <select
                  aria-label="Typography size preset"
                  value=""
                  onChange={(event) => {
                    setSize(event.target.value);
                    touch("size");
                  }}
                >
                  <option value="" disabled>
                    Choose a size...
                  </option>
                  {sizes.map((value) => (
                    <option key={value} value={value}>
                      {value} px
                      {value === 16
                        ? " - Body"
                        : value === 32
                          ? " - Heading"
                          : value === 64
                            ? " - Display"
                            : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="wc-field-grid">
                <label>
                  Line height
                  <input
                    type="number"
                    min={0.5}
                    max={4}
                    step={0.05}
                    value={lineHeight}
                    onChange={(event) => {
                      setLineHeight(event.target.value);
                      touch("lineHeight");
                    }}
                  />
                </label>
                <label>
                  Letter spacing (px)
                  <input
                    type="number"
                    min={-10}
                    max={30}
                    step={0.1}
                    value={spacing}
                    onChange={(event) => {
                      setSpacing(event.target.value);
                      touch("spacing");
                    }}
                  />
                </label>
              </div>
              <label>
                Text color
                <input
                  aria-label="Selected element text color"
                  type="color"
                  value={color}
                  onChange={(event) => {
                    setColor(event.target.value);
                    touch("color");
                  }}
                />
              </label>
              <label>
                Text alignment
                <select
                  value={align}
                  onChange={(event) => {
                    setAlign(event.target.value);
                    touch("align");
                  }}
                >
                  {["left", "center", "right", "justify"].map((value) => (
                    <option key={value} value={value}>
                      {value[0].toUpperCase() + value.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <h3>Appearance & spacing</h3>
          <div className="wc-field-grid">
            <label>
              Background
              <input
                type="color"
                value={background}
                onChange={(event) => {
                  setBackground(event.target.value);
                  touch("background");
                }}
              />
            </label>
            <label>
              Corner radius (px)
              <input
                type="number"
                min={0}
                max={240}
                value={radius}
                onChange={(event) => {
                  setRadius(event.target.value);
                  touch("radius");
                }}
              />
            </label>
          </div>
          <div className="wc-field-grid">
            <label>
              Horizontal padding (px)
              <input
                type="number"
                min={0}
                max={240}
                value={paddingX}
                onChange={(event) => {
                  setPaddingX(event.target.value);
                  touch("paddingX");
                }}
              />
            </label>
            <label>
              Vertical padding (px)
              <input
                type="number"
                min={0}
                max={240}
                value={paddingY}
                onChange={(event) => {
                  setPaddingY(event.target.value);
                  touch("paddingY");
                }}
              />
            </label>
          </div>
          {selected.tag === "a" && (
            <label>
              Link destination
              <input
                value={href}
                maxLength={2000}
                placeholder="https://example.com"
                onChange={(event) => {
                  setHref(event.target.value);
                  touch("href");
                }}
              />
            </label>
          )}
          {validation && (
            <p role="alert" className="wc-validation">
              {validation}
            </p>
          )}
          <button
            className="kw-primary"
            disabled={!props.editable || !edited.size}
            onClick={change}
          >
            Apply manual changes
          </button>
          <div className="wc-element-actions">
            <button
              disabled={!props.editable}
              onClick={() => elementAction("duplicate")}
            >
              <Copy size={14} />
              Duplicate
            </button>
            <button
              className="wh-delete"
              disabled={!props.editable}
              onClick={() => elementAction("delete")}
            >
              <Trash2 size={14} />
              Remove element
            </button>
          </div>
        </aside>
      )}
      <DropdownMenu
        open={!!contextMenu}
        onOpenChange={(open) => {
          if (!open) setContextMenu(null);
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            tabIndex={-1}
            aria-label="Element actions"
            className="wc-context-anchor"
            style={{ left: contextMenu?.x || 0, top: contextMenu?.y || 0 }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="wc-context-menu"
          align="start"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuItem onSelect={() => setContextMenu(null)}>
            Edit properties
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => elementAction("duplicate")}>
            <Copy size={14} />
            Duplicate element
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!availableActions.up || !props.editable}
            onSelect={() => elementAction("up")}
          >
            <ArrowUp size={14} />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!availableActions.down || !props.editable}
            onSelect={() => elementAction("down")}
          >
            <ArrowDown size={14} />
            Move down
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!availableActions.parent || !props.editable}
            onSelect={() => elementAction("parent")}
          >
            Select parent
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => elementAction("delete")}
          >
            <Trash2 size={14} />
            Delete element
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
