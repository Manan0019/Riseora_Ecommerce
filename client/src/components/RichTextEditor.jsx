import { useEffect, useRef, useState } from "react";

const fonts = ["Inter", "Georgia", "Arial", "Verdana", "Times New Roman", "Trebuchet MS"];

export default function RichTextEditor({ value = "", onChange, placeholder = "", compact = false }) {
  const editorRef = useRef(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || focused) return;
    if (editor.innerHTML !== (value || "")) editor.innerHTML = value || "";
  }, [value, focused]);

  function emit() {
    const editor = editorRef.current;
    const html = editor?.innerHTML || "";
    const text = (editor?.textContent || "").replace(/\u200B/g, "").trim();
    onChange?.(text ? html : "");
  }

  function command(name, argument = null) {
    editorRef.current?.focus();
    document.execCommand(name, false, argument);
    emit();
  }

  function block(tag) {
    command("formatBlock", tag);
  }

  return <div className={`phase19-rich-editor ${compact ? "compact" : ""}`}>
    <div className="phase19-rich-toolbar" role="toolbar" aria-label="Text formatting">
      <select aria-label="Font family" defaultValue="" onChange={(e) => { if (e.target.value) command("fontName", e.target.value); e.target.value = ""; }}>
        <option value="">Font</option>{fonts.map((font) => <option key={font} value={font}>{font}</option>)}
      </select>
      <select aria-label="Text style" defaultValue="" onChange={(e) => { if (e.target.value === "p") block("P"); if (e.target.value === "h3") block("H3"); if (e.target.value === "blockquote") block("BLOCKQUOTE"); e.target.value = ""; }}>
        <option value="">Style</option><option value="p">Paragraph</option><option value="h3">Heading</option><option value="blockquote">Quote</option>
      </select>
      <select aria-label="Font size" defaultValue="" onChange={(e) => { if (e.target.value) command("fontSize", e.target.value); e.target.value = ""; }}>
        <option value="">Size</option><option value="2">Small</option><option value="3">Normal</option><option value="4">Large</option><option value="5">XL</option>
      </select>
      <span className="phase19-toolbar-group"><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => command("bold")}><b>B</b></button><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => command("italic")}><i>I</i></button><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => command("underline")}><u>U</u></button></span>
      <span className="phase19-toolbar-group"><button type="button" title="Bullets" onMouseDown={(e) => e.preventDefault()} onClick={() => command("insertUnorderedList")}>• List</button><button type="button" title="Numbered list" onMouseDown={(e) => e.preventDefault()} onClick={() => command("insertOrderedList")}>1. List</button><button type="button" title="Indent" onMouseDown={(e) => e.preventDefault()} onClick={() => command("indent")}>→|</button><button type="button" title="Outdent" onMouseDown={(e) => e.preventDefault()} onClick={() => command("outdent")}>|←</button></span>
      <span className="phase19-toolbar-group"><button type="button" title="Align left" onMouseDown={(e) => e.preventDefault()} onClick={() => command("justifyLeft")}>≡←</button><button type="button" title="Align center" onMouseDown={(e) => e.preventDefault()} onClick={() => command("justifyCenter")}>≡</button><button type="button" title="Align right" onMouseDown={(e) => e.preventDefault()} onClick={() => command("justifyRight")}>→≡</button><button type="button" title="Justify" onMouseDown={(e) => e.preventDefault()} onClick={() => command("justifyFull")}>☰</button></span>
      <button type="button" className="phase19-clear-format" onMouseDown={(e) => e.preventDefault()} onClick={() => command("removeFormat")}>Clear format</button>
    </div>
    <div
      ref={editorRef}
      className="phase19-rich-surface"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={emit}
      onBlur={() => { setFocused(false); emit(); }}
      onFocus={() => setFocused(true)}
    />
  </div>;
}
