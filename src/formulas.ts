import {
  SheetConfig,
  Highlight,
  sheetConfigsMobx,
  textDocumentsMobx,
  getSheetConfigsOfTextDocument,
  TextDocument,
  SheetValueRow,
} from "./primitives";
import {
  curry,
  isFunction,
  isArray,
  sortBy,
  isObject,
  map,
  isString,
} from "lodash";
import { Text } from "@codemirror/state";
import { getComputedSheetValue } from "./compute";

export type FormulaColumn = {
  name: string;
  formula: string;
};

export type Scope = { [name: string]: any };

function evaluateFormula(
  textDocument: TextDocument,
  sheetConfig: SheetConfig,
  source: string,
  scope: Scope
) {
  const API = {
    EACH_LINE: (): Highlight[] => {
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
    HIGHLIGHTS_OF_REGEX: (regexString: string, flags: string): Highlight[] => {
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
    HIGHLIGHTS_OF: (values: string | string[], isCaseSensitive: boolean) => {
      if (!isArray(values)) {
        values = [values];
      }

      let highlights: Highlight[] = [];

      for (const value of values) {
        if (isString(value)) {
          highlights = highlights.concat(
            API.HIGHLIGHTS_OF_REGEX(value, isCaseSensitive ? "i" : "")
          );
        }
      }

      return highlights;
    },

    VALUES_OF_TYPE: (type: string) => {
      const typeSheetConfig = Array.from(sheetConfigsMobx.values()).find(
        (sheetConfig) => sheetConfig.name === type
      );

      if (!typeSheetConfig) {
        return [];
      }
      console.log("VALUES_OF_TYPE", typeSheetConfig);
      return getComputedSheetValue(textDocument.id, typeSheetConfig.id).get();
    },

    NEXT_OF_TYPE: (highlight: Highlight, type: string) => {
      const typeSheetConfig = Array.from(sheetConfigsMobx.values()).find(
        (sheetConfig) => sheetConfig.name === type
      );
      if (!typeSheetConfig) {
        return [];
      }
      const sheetValue = getComputedSheetValue(
        textDocument.id,
        typeSheetConfig.id
      ).get();
      return sheetValue.find(
        (r) => "span" in r && r.span[0] > highlight.span[1]
      );
    },

    HAS_TYPE: curry((type: string, highlight: Highlight) => {
      const sheetConfig = Array.from(sheetConfigsMobx.values()).find(
        (sheetConfig) => sheetConfig.name === type
      );

      if (!sheetConfig) {
        return false;
      }

      return sheetConfig.id === highlight.sheetConfigId;
    }),

    HAS_TEXT_ON_LEFT: curry((text: string, highlight: Highlight): boolean => {
      const from = highlight.span[0];
      const prevText = textDocument.text.sliceString(0, from).trim();

      return prevText.endsWith(text);
    }),

    HAS_TEXT_ON_RIGHT: curry((text: string, highlight: Highlight): boolean => {
      const to = highlight.span[1];
      const followingText = textDocument.text.sliceString(to).trim();
      return followingText.startsWith(text);
    }),

    IS_ON_SAME_LINE_AS: curry((a: Highlight, b: Highlight): boolean => {
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

    FILTER: curry((list: any[], condition: any): any[] => {
      return list.filter((item: any) => {
        if (isFunction(condition)) {
          return condition(item);
        }
        return condition;
      });
    }),

    FIRST: (list: any[]): any => {
      return list[0];
    },

    SECOND: (list: any[]): any => {
      return list[1];
    },

    DATA_FROM_DOC: (
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
      // const { sheetsScope } = evaluateSheetConfigs(doc, sheetConfigs);

      // // Fetch data from given sheet config and column, resolving spans into text
      // return sheetsScope[sheetConfig.id].map((row: any) =>
      //   doc.text.sliceString(row[columnName].span[0], row[columnName].span[1])
      // );
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
    console.log("successfully evald", source);
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

  for (const column of sheetConfig.columns) {
    if (resultRows === undefined) {
      const result = evaluateFormula(
        textDocument,
        sheetConfig,
        column.formula,
        {}
      );

      if (isArray(result)) {
        resultRows = result.map((item) => ({ [column.name]: item }));
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
    rv[sheetConfig.id] = evaluateSheet(textDocument, sheetConfig);
  });
  return rv;
}
