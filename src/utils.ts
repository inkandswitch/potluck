import { customAlphabet } from "nanoid";
import { Highlight, Span, textDocumentsMobx } from "./primitives";
import { alphanumeric } from "nanoid-dictionary";

export function doSpansOverlap(a: Span, b: Span) {
  return a[0] <= b[1] && b[0] <= a[1];
}

export function doesSpanContainOtherSpan(parent: Span, child: Span) {
  return parent[0] <= child[0] && parent[1] >= child[1];
}

export function doesSpanContainsPosition(span: Span, position: number) {
  return span[0] <= position && position < span[1];
}

export function getTextForHighlight(highlight: Highlight) {
  const textDocument = textDocumentsMobx.get(highlight.documentId);
  return textDocument?.text.sliceString(highlight.span[0], highlight.span[1]);
}

export function isValueRowHighlight(valueRow: any): valueRow is Highlight {
  return (
    typeof valueRow === "object" &&
    "span" in valueRow &&
    valueRow.span !== undefined
  );
}

export function isNumericish(value: any): boolean {
  return (
    typeof value === "number" ||
    (typeof value === "string" && /^([\d\.])+$/.test(value))
  );
}

export const generateNanoid = customAlphabet(alphanumeric);
