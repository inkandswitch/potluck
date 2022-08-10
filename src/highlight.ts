import { sheetConfigsMobx, SheetValueRow, Span, textDocumentsMobx } from "./primitives";
import { getTextForHighlight, isNumericish, isValueRowHighlight } from "./utils";
import { highlight } from "prismjs";
import { isNaN, isString, orderBy } from "lodash";
import { getComputedSheetValue } from "./compute";
import { evaluateFormula } from "./formulas";

export class Highlight {
  constructor(
    readonly documentId: string,
    readonly sheetConfigId: string, // sheet config id should be optional to represent sub highlights in patterns, for now just set the sheetConfigId to empty string to represent undefined configId
    readonly span: Span,
    readonly data: { [columnName: string]: any },
  ) {
  }

  Prev(type: string | string[]) {
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

    return new HighlightCollection(this, highlights, isString(type) ? type : undefined)
  }

  Next(type: string | string[]) {
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

    return new HighlightCollection(this, highlights, isString(type) ? type : undefined)
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

  toString() {
    return this.Text()
  }

  Text() {
    return getTextForHighlight(this)
  }

  isEqualTo(value: any) {
    if (isValueRowHighlight(value)) {
      return this.Text() === value.Text()
    }

    return this.Text() === value
  }

  static from(highlight: {
    documentId: string,
    sheetConfigId: string,
    span: Span,
    data: { [columnName: string]: any },
  }) {
    return new Highlight(highlight.documentId, highlight.sheetConfigId, highlight.span, highlight.data)
  }
}


class ChainableCollection<T> {
  constructor(readonly row: SheetValueRow, readonly items: T[], readonly itemName?: string) {
  }

  As(itemName: string) {
    if (this.itemName) {
      throw new Error('item name is already set')
    }

    // @ts-ignore
    return new this.constructor(this.items, itemName)
  }

  Where(conditionSource: string) {
    const textDocument = textDocumentsMobx.get(this.row.documentId)
    const sheetConfig = sheetConfigsMobx.get(this.row.sheetConfigId)

    if (!textDocument || !sheetConfig) {
      return new Error("invalid row")
    }

    const filteredItems = this.items.filter((item) => (
      evaluateFormula(textDocument, sheetConfig, false, conditionSource, (
        this.itemName
          ? { ...this.row.data, [this.itemName]: item }
          : this.row
      ))
    ))

    return new ChainableCollection(this.row, filteredItems, this.itemName)
  }
}

export class HighlightCollection extends ChainableCollection<Highlight> {
  constructor(readonly row: SheetValueRow, readonly items: Highlight[], readonly itemName?: string) {
    super(row, items, itemName)
  }

  Text() {
    return new ChainableCollection(this.row, this.items.map(h => h.Text()))
  }
}


export function isChainableCollection(value: any) {
  return value instanceof ChainableCollection
}