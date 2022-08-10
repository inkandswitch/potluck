import { Span } from "./primitives";
import { getTextForHighlight } from "./utils";

export class Highlight {
  constructor(
    readonly documentId: string,
    readonly sheetConfigId: string, // sheet config id should be optional to represent sub highlights in patterns, for now just set the sheetConfigId to empty string to represent undefined configId
    readonly span: Span,
    readonly data: { [columnName: string]: any },
  ) {
  }

  get (attr: string) {
    return this.data[attr]
  }

  text () {
    return getTextForHighlight(this)
  }

  static from (highlight: {
    documentId: string,
    sheetConfigId: string,
    span: Span,
    data: { [columnName: string]: any },
  }) {
    return new Highlight(highlight.documentId, highlight.sheetConfigId, highlight.span, highlight.data)
  }
};