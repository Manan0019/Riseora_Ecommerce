import { Fragment, createElement } from "react";

const allowedTags = new Set(["P", "DIV", "SPAN", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "BR", "BLOCKQUOTE", "H2", "H3", "H4", "FONT"]);
const allowedAlign = new Set(["left", "center", "right", "justify"]);
const allowedFonts = new Set(["Inter", "Georgia", "Arial", "Verdana", "Times New Roman", "Trebuchet MS"]);
const allowedSizes = new Set(["1", "2", "3", "4", "5", "6", "7"]);

function safeStyle(node) {
  const style = {};
  const align = (node.getAttribute?.("align") || node.style?.textAlign || "").toLowerCase();
  if (allowedAlign.has(align)) style.textAlign = align;

  const face = node.getAttribute?.("face") || node.style?.fontFamily?.replace(/["']/g, "");
  if (face && allowedFonts.has(face)) style.fontFamily = face;

  const fontWeight = node.style?.fontWeight;
  if (["400", "500", "600", "700", "800", "900", "bold"].includes(fontWeight)) style.fontWeight = fontWeight;
  const fontStyle = node.style?.fontStyle;
  if (["normal", "italic"].includes(fontStyle)) style.fontStyle = fontStyle;
  const textDecoration = node.style?.textDecoration;
  if (textDecoration?.includes("underline")) style.textDecoration = "underline";
  return style;
}

function renderNode(node, key) {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeType !== 1) return null;
  if (!allowedTags.has(node.tagName)) {
    return <Fragment key={key}>{[...node.childNodes].map((child, index) => renderNode(child, `${key}-${index}`))}</Fragment>;
  }

  const children = [...node.childNodes].map((child, index) => renderNode(child, `${key}-${index}`));
  const tag = node.tagName === "FONT" ? "span" : node.tagName.toLowerCase();
  const props = { key };
  const style = safeStyle(node);

  if (node.tagName === "FONT") {
    const size = node.getAttribute("size");
    if (allowedSizes.has(size)) {
      const scale = { 1: ".75em", 2: ".875em", 3: "1em", 4: "1.125em", 5: "1.35em", 6: "1.65em", 7: "2em" };
      style.fontSize = scale[size];
    }
  }
  if (Object.keys(style).length) props.style = style;
  return createElement(tag, props, children);
}

function plainFallback(value) {
  return String(value || "").split(/\n+/).filter(Boolean).map((line, index) => <p key={index}>{line}</p>);
}

export function richTextToPlain(value = "") {
  if (!value) return "";
  if (typeof window === "undefined" || !/<[a-z][\s\S]*>/i.test(value)) return String(value).replace(/\s+/g, " ").trim();
  try {
    const doc = new DOMParser().parseFromString(value, "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  } catch {
    return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
}

export default function RichText({ value, className = "" }) {
  if (!value) return null;
  if (typeof window === "undefined" || !/<[a-z][\s\S]*>/i.test(value)) return <div className={`riseora-rich-text ${className}`.trim()}>{plainFallback(value)}</div>;
  try {
    const doc = new DOMParser().parseFromString(value, "text/html");
    return <div className={`riseora-rich-text ${className}`.trim()}>{[...doc.body.childNodes].map((node, index) => renderNode(node, `r-${index}`))}</div>;
  } catch {
    return <div className={`riseora-rich-text ${className}`.trim()}>{plainFallback(value)}</div>;
  }
}
