import {
  Highlight,
  sheetConfigsMobx,
  Span,
  textDocumentsMobx,
} from "./primitives";

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