import {
  SheetConfig,
  Highlight,
  sheetConfigsMobx,
  textDocumentsMobx,
  getSheetConfigsOfTextDocument,
  TextDocument,
  SheetValueRow,
} from "./primitives";
import { curry, isFunction, isArray, isObject, isString } from "lodash";
import { getComputedSheetValue } from "./compute";
import { doSpansOverlap } from "./utils";

export type FormulaColumn = {
  name: string;
  formula: string;
};

export type Scope = { [name: string]: any };

// This is a default distance limit built into prev/next to limit the search.
// TODO: make this dynamic as an argument? (not sure how that intersects with currying)
const PREV_NEXT_DISTANCE_LIMIT = 10;

function evaluateFormula(
  textDocument: TextDocument,
  sheetConfig: SheetConfig,
  source: string,
  scope: Scope
) {
  const API = {
    SplitLines: (): Highlight[] => {
      // todo: there's probably a more elegant way to get lines out of CM
      const lines = textDocument.text.sliceString(0).split("\n");
      let highlights: Highlight[] = [];

      let index = 0;
      for (const line of lines) {
        highlights.push({
          documentId: textDocument.id,
          sheetConfigId: sheetConfig.id,
          span: [index, index + line.length],
          data: {},
        });
        index += line.length + 1;
      }

      return highlights;
    },

    // this method is not curried because it has an optional flags parameter
    MatchRegexp: (regexString: string, flags: string): Highlight[] => {
      const regex = new RegExp(regexString, "g" + (flags ? flags : ""));
      const docString = textDocument.text.sliceString(0);

      const highlights: Highlight[] = [];
      let match, prevIndex;
      while ((match = regex.exec(docString)) != null) {
        const value = match[0];
        const from = match.index;
        const to = from + value.length;

        if (from === prevIndex) {
          throw new Error(
            "regex causes infinite loop becase it matches empty string"
          );
        }

        prevIndex = from;

        highlights.push({
          documentId: textDocument.id,
          sheetConfigId: sheetConfig.id,
          span: [from, to],
          data: {},
        });
      }

      return highlights;
    },

    // this method is not curried because it has an optional isCaseSensitive parameter
    MatchString: (values: string | string[], isCaseSensitive: boolean) => {
      if (!isArray(values)) {
        values = [values];
      }

      let highlights: Highlight[] = [];

      for (const value of values) {
        if (isString(value)) {
          highlights = highlights.concat(
            API.MatchRegexp(value, isCaseSensitive === false ? "" : "i")
          );
        }
      }

      return highlights;
    },

    ValuesOfType: (type: string) => {
      const typeSheetConfig = Array.from(sheetConfigsMobx.values()).find(
        (sheetConfig) => sheetConfig.name === type
      );

      if (!typeSheetConfig) {
        return [];
      }
      return getComputedSheetValue(textDocument.id, typeSheetConfig.id).get();
    },

    NextOfType: (highlight: Highlight, type: string) => {
      const typeSheetConfig = Array.from(sheetConfigsMobx.values()).find(
        (sheetConfig) => sheetConfig.name === type
      );
      if (!typeSheetConfig) {
        return [];
      }
      const sheetValueRows = getComputedSheetValue(
        textDocument.id,
        typeSheetConfig.id
      ).get();
      return sheetValueRows.find(
        (r) =>
          "span" in r &&
          r.span[0] > highlight.span[1] &&
          r.span[0] - highlight.span[1] < PREV_NEXT_DISTANCE_LIMIT
      );
    },

    PrevOfType: (highlight: Highlight, type: string) => {
      const typeSheetConfig = Array.from(sheetConfigsMobx.values()).find(
        (sheetConfig) => sheetConfig.name === type
      );
      if (!typeSheetConfig) {
        return [];
      }
      const sheetValueRows = getComputedSheetValue(
        textDocument.id,
        typeSheetConfig.id
      ).get();
      return [...sheetValueRows]
        .reverse()
        .find(
          (r) =>
            "span" in r &&
            r.span[1] < highlight.span[0] &&
            highlight.span[0] - r.span[1] < PREV_NEXT_DISTANCE_LIMIT
        );
    },

    HasType: curry((type: string, highlight: Highlight) => {
      const sheetConfig = Array.from(sheetConfigsMobx.values()).find(
        (sheetConfig) => sheetConfig.name === type
      );

      if (!sheetConfig) {
        return false;
      }

      return sheetConfig.id === highlight.sheetConfigId;
    }),

    HasTextOnLeft: curry((text: string, highlight: Highlight): boolean => {
      const from = highlight.span[0];
      const prevText = textDocument.text.sliceString(0, from).trim();

      return prevText.endsWith(text);
    }),

    HasTextOnRight: curry((text: string, highlight: Highlight): boolean => {
      const to = highlight.span[1];
      const followingText = textDocument.text.sliceString(to).trim();
      return followingText.startsWith(text);
    }),

    SameLine: curry((a: Highlight, b: Highlight): boolean => {
      const lineStartA = textDocument.text.lineAt(a.span[0]).number;
      const lineEndA = textDocument.text.lineAt(a.span[1]).number;
      const lineStartB = textDocument.text.lineAt(b.span[0]).number;
      const lineEndB = textDocument.text.lineAt(b.span[1]).number;

      return (
        lineStartA === lineEndA &&
        lineStartB === lineEndB &&
        lineStartA === lineStartB
      );
    }),

    Filter: curry((list: any[], condition: any): any[] => {
      return list.filter((item: any) => {
        if (isFunction(condition)) {
          return condition(item);
        }
        return condition;
      });
    }),

    First: (list: any[]): any => {
      return list[0];
    },

    Second: (list: any[]): any => {
      return list[1];
    },

    DataFromDoc: (
      docName: string,
      sheetConfigName: string,
      columnName: string
    ): string[] => {
      const doc = [...textDocumentsMobx.values()].find(
        (td) => td.name === docName
      );
      if (doc === undefined) {
        return [];
      }
      const sheetConfigs = getSheetConfigsOfTextDocument(doc);
      const sheetConfig = sheetConfigs.find(
        (sc) => sc.name === sheetConfigName
      );
      if (!sheetConfig) {
        return [];
      }
      return getComputedSheetValue(doc.id, sheetConfig.id)
        .get()
        .flatMap((r) => {
          if ("span" in r && r.span !== undefined) {
            return [doc.text.sliceString(r.span[0], r.span[1])];
          }
          return [];
        });
    },
  };

  try {
    let fn = new Function(
      "API",
      "context",
      `
    with (API) {
      with (context) {
        return ${source}
      }
    }
  `
    );
    return fn(API, scope);
  } catch (e) {
    console.error(e);
    return e;
  }
}

export function evaluateSheet(
  textDocument: TextDocument,
  sheetConfig: SheetConfig
): SheetValueRow[] {
  let resultRows: { [columnName: string]: any }[] | undefined;

  // TODO: this arbitrarily picks between sheets of same config on same text doc, is that OK?
  const textDocumentSheet = textDocument.sheets.find(
    (sheet) => sheet.configId === sheetConfig.id
  );
  if (textDocumentSheet === undefined) {
    throw new Error(
      "expected to find sheet of type " +
        sheetConfig.name +
        " in text document " +
        textDocument.name
    );
  }

  for (const column of sheetConfig.columns) {
    if (resultRows === undefined) {
      const result = evaluateFormula(
        textDocument,
        sheetConfig,
        column.formula,
        {}
      );

      if (isArray(result)) {
        resultRows = result;
        if (textDocumentSheet.highlightSearchRange !== undefined) {
          resultRows = result.filter(
            (item) =>
              item.span === undefined ||
              doSpansOverlap(textDocumentSheet.highlightSearchRange!, item.span)
          );
        }
        resultRows = resultRows.map((item) => ({ [column.name]: item }));
      } else {
        resultRows = [{ [column.name]: result }];
      }
    } else {
      resultRows = resultRows.map((row) => {
        const result = evaluateFormula(
          textDocument,
          sheetConfig,
          column.formula,
          { ...row }
        );

        return { ...row, [column.name]: result };
      });
    }
  }

  return (resultRows ?? []).map((rowData) => {
    let from, to;

    for (const value of Object.values(rowData)) {
      if (value && value.span) {
        const [valueFrom, valueTo] = value.span;

        if (from === undefined || valueFrom < from) {
          from = valueFrom;
        }

        if (to === undefined || valueTo > to) {
          to = valueTo;
        }
      }
    }

    return {
      documentId: textDocument.id,
      sheetConfigId: sheetConfig.id,
      span: from !== undefined && to !== undefined ? [from, to] : undefined,
      data: rowData,
    };
  });
}

function wrapValueInProxy(value: any) {
  if (isArray(value)) {
    return arrayProxy(value);
  }

  if (isObject(value)) {
    return scopeProxy(value);
  }

  return value;
}

function arrayProxy(array: any[]) {
  const handler = {
    get(target: any[], prop: string): any[] {
      if (array[0] && array[0].hasOwnProperty(prop)) {
        return array
          .map((item) => wrapValueInProxy(item[prop]))
          .filter((value) => value !== undefined);
      }

      // @ts-ignore
      return Reflect.get(...arguments);
    },
  };

  return new Proxy(array, handler);
}

function scopeProxy(scope: Scope) {
  const handler = {
    get(target: any, prop: string): any {
      return wrapValueInProxy(scope[prop]);
    },
  };

  return new Proxy(scope, handler);
}

export function evaluateSheetConfigs(
  textDocument: TextDocument,
  sheetConfigs: SheetConfig[]
): { [sheetConfigId: string]: SheetValueRow[] } {
  const rv: { [sheetConfigId: string]: SheetValueRow[] } = {};
  sheetConfigs.forEach((sheetConfig) => {
    rv[sheetConfig.id] = getComputedSheetValue(
      textDocument.id,
      sheetConfig.id
    ).get();
  });
  return rv;
}
