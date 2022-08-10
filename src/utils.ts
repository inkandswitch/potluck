import { customAlphabet } from "nanoid";
import {
  HighlightComponent,
  Span,
  textDocumentsMobx,
} from "./primitives";
import { alphanumeric } from "nanoid-dictionary";
import { getComputedSheetValue } from "./compute";
import { Highlight } from "./highlight";

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

export function getIntValue(value: any) {
  if (isValueRowHighlight(value)) {
    value = getTextForHighlight(value);
  }

  return parseInt(value, 10);
}

export function isValueRowHighlight(valueRow: any): valueRow is Highlight {
  return (
    typeof valueRow === "object" &&
    "span" in valueRow &&
    valueRow.span !== undefined
  );
}

export function isHighlightComponent(value: any): value is HighlightComponent {
  return (
    value !== undefined &&
    value !== null &&
    typeof value === "object" &&
    typeof value.render === "function"
  );
}

export function isNumericish(value: any): boolean {
  return (
    typeof value === "number" ||
    (typeof value === "string" && /^([\d\.])+$/.test(value))
  );
}

const _generateNanoid = customAlphabet(alphanumeric)

export const generateNanoid = () => `_${_generateNanoid()}`;

export function transformColumnFormula(
  formula: string,
  isFirstColumn: boolean
) {
  return isFirstColumn
    ? formula.startsWith("=")
      ? formula.substring(1)
      : `MatchPattern("${formula.replaceAll(/"/g, '\\"')}")`
    : formula;
}
