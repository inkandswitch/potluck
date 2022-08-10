import { sheetConfigsMobx, Span } from "./primitives";
import { getTextForHighlight, isNumericish } from "./utils";
import { highlight } from "prismjs";
import { isString, orderBy } from "lodash";
import { getComputedSheetValue } from "./compute";

export class Highlight {
  constructor(
    readonly documentId: string,
    readonly sheetConfigId: string, // sheet config id should be optional to represent sub highlights in patterns, for now just set the sheetConfigId to empty string to represent undefined configId
    readonly span: Span,
    readonly data: { [columnName: string]: any },
  ) {
  }

  ValuesBeforeOfType(type: string | string[]) {
    const typeSheetConfigs = Array.from(sheetConfigsMobx.values()).filter(
      (sheetConfig) =>
        isString(type)
          ? sheetConfig.name === type
          : type.includes(sheetConfig.name)
    );

    const highlights = orderBy(
      typeSheetConfigs
        .flatMap((typeSheetConfig) =>
          getComputedSheetValue(this.documentId, typeSheetConfig.id).get()
        )
        .filter((row) => (
          "span" in row &&
          row.span[1] < this.span[0]
        )) as Highlight[],

      [({ span }) => span[0]],
      ['desc']
    );

    return new HighlightCollection(highlights)
  }

  ValuesAfterOfType(type: string | string[]) {
    const typeSheetConfigs = Array.from(sheetConfigsMobx.values()).filter(
      (sheetConfig) =>
        isString(type)
          ? sheetConfig.name === type
          : type.includes(sheetConfig.name)
    );

    const highlights = orderBy(
      typeSheetConfigs
        .flatMap((typeSheetConfig) =>
          getComputedSheetValue(this.documentId, typeSheetConfig.id).get()
        )
        .filter((row) => (
          "span" in row &&
          row.span[0] > this.span[1]
        )) as Highlight[],

      [({ span }) => span[0]],
      ['asc']
    );

    return new HighlightCollection(highlights)
  }

  valueOf() {
    const spanText = this.Text()

    if (!spanText) {
      return
    }

    if (isNumericish(spanText)) {
      return parseFloat(spanText)
    }

    return spanText
  }

  toString () {
    return this.Text()
  }

  Text() {
    return getTextForHighlight(this)
  }

  static from(highlight: {
    documentId: string,
    sheetConfigId: string,
    span: Span,
    data: { [columnName: string]: any },
  }) {
    return new Highlight(highlight.documentId, highlight.sheetConfigId, highlight.span, highlight.data)
  }
};


class ChainableCollection<T> {
  constructor(items: T[]) {
  }
}

export class HighlightCollection extends ChainableCollection<Highlight>{
  constructor(readonly items: Highlight[]) {
    super(items)
  }

  Text() {
    return new ChainableCollection(this.items.map(h => h.Text()))
  }
}



export function isChainableCollection(value: any) {
 return value instanceof ChainableCollection
}