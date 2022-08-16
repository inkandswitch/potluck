import { sheetConfigsMobx, SheetValueRow, Span, textDocumentsMobx } from "./primitives";
import { coerceValueToNumber, getTextForHighlight, isNumericish, isValueRowHighlight } from "./utils";
import { isNaN, isString, orderBy, get, pick, sortBy, isEqual, groupBy} from "lodash";
import { getComputedSheetValue } from "./compute";

export class Highlight {
  constructor(
    readonly documentId: string,
    readonly sheetConfigId: string, // sheet config id should be optional to represent sub highlights in patterns, for now just set the sheetConfigId to empty string to represent undefined configId
    readonly span: Span,
    readonly data: { [columnName: string]: any },
  ) {
  }

  allPrev(type: string | string[]) {
    const typeSheetConfigs = Array.from(sheetConfigsMobx.values()).filter(
      (sheetConfig) =>
        isString(type)
          ? sheetConfig.name === type
          : type.includes(sheetConfig.name)
    );

    return orderBy(
      typeSheetConfigs
        .flatMap((typeSheetConfig) => {
          const firstColumnOnly =
            typeSheetConfig.id === this.sheetConfigId;

          return getComputedSheetValue(this.documentId, typeSheetConfig.id, firstColumnOnly).get()
        })
        .filter((row) => (
          "span" in row &&
          row.span[1] < this.span[0]
        )) as Highlight[],

      [({ span }) => span[0]],
      ['desc']
    );
  }

  prev(type: string | string[]) {
    return this.allPrev(type)[0]
  }

  allNext(type: string | string[]) {
    const typeSheetConfigs = Array.from(sheetConfigsMobx.values()).filter(
      (sheetConfig) =>
        isString(type)
          ? sheetConfig.name === type
          : type.includes(sheetConfig.name)
    );

    return orderBy(
      typeSheetConfigs
        .flatMap((typeSheetConfig) => {
          const firstColumnOnly =
            typeSheetConfig.id === this.sheetConfigId;

          return getComputedSheetValue(this.documentId, typeSheetConfig.id, firstColumnOnly).get()
        })
        .filter((row) => (
          "span" in row &&
          row.span[0] > this.span[1]
        )) as Highlight[],

      [({ span }) => span[0]],
      ['asc']
    );
  }

  next(type: string | string[]) {
    return this.allNext(type)[0]
  }

  valueOf() {
    const spanText = this.text()

    if (!spanText) {
      return
    }

    if (isNumericish(spanText)) {
      return parseFloat(spanText)
    }

    return spanText
  }

  toString() {
    return this.text()
  }

  text() {
    return getTextForHighlight(this)
  }

  isEqualTo(value: any) {
    if (isValueRowHighlight(value)) {
      return this.text() === value.text()
    }

    return this.text() === value
  }

  wholeLine () {
    const textDocument = textDocumentsMobx.get(this.documentId)

    if (!textDocument) {
      return
    }

    const fromLine = textDocument.text.lineAt(this.span[0])
    const toLine = textDocument.text.lineAt(this.span[0])

    return Highlight.from({
      ...this,
      span: [fromLine.from, toLine.to]
    })
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


Object.defineProperty(Array.prototype, 'sumOf', {
  value: function (path?: string) {
    let sum = 0;

    this.forEach((item: any) => {
      const number = coerceValueToNumber(path ? get(item, path) : item)

      console.log(item, number, path)

      if (!isNaN(number)) {
        sum += number
      }
    })

    return sum;
  }
});

Object.defineProperty(Array.prototype, "sortBy", {
  value: function (fn: (item: any) => any) {
    return sortBy(this, fn);
  }
})

Object.defineProperty(Array.prototype, "isEqual", {
  value: function (value: any) {
    return isEqual(this, value)
  }
})

Object.defineProperty(Array.prototype, "groupBy", {
  value: function (fn: (item: any) => any) {
    return Object.entries(groupBy(this, fn)).map(([group, items]) => ({group, items }))
  }
})