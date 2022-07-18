import { SheetConfig, Highlight } from "./primitives";
import { curry, isFunction, isArray, sortBy } from "lodash";
import { Text } from "@codemirror/state";

export type FormulaColumn = {
  name: string;
  formula: string;
};

export type ResultRow = { [name: string]: any };

function evaluateFormula(
  source: string,
  highlights: Highlight[],
  doc: Text,
  context: ResultRow
) {
  const API = {

    // this method is not curried because it has an optional flags parameter
    HIGHLIGHTS_OF_REGEX: (regexString: string, flags: string): Highlight[] => {
      const regex = new RegExp(regexString, "g" + (flags? flags : ''))
      const docString = doc.sliceString(0);

      const highlights = []
      let match, prevIndex
      while ((match = regex.exec(docString)) != null) {
        const value = match[0];
        const from = match.index;
        const to = from + value.length;

        if (from === prevIndex) {
          throw new Error("regex causes infinite loop becase it matches empty string")
        }

        prevIndex = from

        highlights.push({ span: [from, to] } as Highlight)
      }

      return highlights;
    },

    // this method is not curried because it has an optional isCaseSensitive parameter
    HIGHLIGHTS_OF: (values: string | string[], isCaseSensitive: boolean) : Highlight[] => {
      if (!isArray(values)) {
        values = [values]
      }

      let highlights : Highlight[] = [];

      for (const value of values) {
        highlights = highlights.concat(API.HIGHLIGHTS_OF_REGEX(value, isCaseSensitive ? "i" : ""))
      }

      return highlights
    },

    VALUES_OF_TYPE: (type: string): Highlight[] => {
      return highlights.filter((snippet) => snippet.sheetConfigId === type);
    },

    IS_ON_SAME_LINE_AS: curry((a: Highlight, b: Highlight): boolean => {
      const lineStartA = doc.lineAt(a.span[0]).number;
      const lineEndA = doc.lineAt(a.span[1]).number;
      const lineStartB = doc.lineAt(b.span[0]).number;
      const lineEndB = doc.lineAt(b.span[1]).number;

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
        return item;
      });
    }),

    FIRST: (list: any[]): any => {
      return list[0];
    },

    SECOND: (list: any[]): any => {
      return list[1];
    },
  };

  try {
    let fn = new Function(
      "API",
      "context",
      `
    with (context) {
      with (API) {
        return ${source}
      }
    }
  `
    );

    return fn(API, context);
  } catch (e) {
    console.error(e)
    return e;
  }
}

export function evaluateColumns(
  columns: FormulaColumn[],
  snippets: Highlight[],
  doc: Text
): ResultRow[] {
  let resultRows: ResultRow[] = [];

  for (const column of columns) {
    if (resultRows.length === 0) {
      const result = evaluateFormula(column.formula, snippets, doc, {});

      if (isArray(result)) {
        for (const item of result) {
          resultRows.push({ [column.name]: item });
        }
      } else {
        resultRows.push({ [column.name]: result });
      }
    } else {
      resultRows = resultRows.map((row) => {
        const result = evaluateFormula(column.formula, snippets, doc, row);

        return { ...row, [column.name]: result };
      });
    }
  }

  return resultRows;
}

export function getAllSortedHighlights(doc: Text, sheetConfigs: SheetConfig[]): Highlight[] {
  let highlights: Highlight[] = [];

  sheetConfigs.forEach((sheetConfig) => {
    const matches = evaluateColumns(sheetConfig.columns, highlights, doc)

    for (const match of matches) {
      let from, to;

      for (const value of Object.values(match)) {
        if (value.span) {
          const [valueFrom, valueTo] = value.span

          if (from === undefined || valueFrom < from) {
            from = valueFrom
          }

          if (to === undefined || valueTo < to) {
            to = valueTo
          }
        }
      }

      if (from !==  undefined && to !== undefined) {
        highlights.push({
          sheetConfigId: sheetConfig.id,
          span: [from, to],
          data: match
        })
      }
    }
  })

  return sortBy(highlights, ({ span }) => span[0]);
}
