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
  isObject,
  isString,
  sortBy,
  parseInt,
} from "lodash";
import {
  getComputedDocumentValues,
  getComputedSheetValue,
  getHighlightsUntilSheet,
} from "./compute";
import { doSpansOverlap, getTextForHighlight } from "./utils";
import { OFFICIAL_FOODS } from "./data/officialFoods";
// @ts-ignore
import FuzzySet from "fuzzyset";
import Prism from "prismjs";
const foodNameMatchSet = new FuzzySet(
  OFFICIAL_FOODS.map((food: any) => food.description),
  false
);

// eslint-disable-next-line
// @ts-ignore
Prism.languages.markdown = Prism.languages.extend("markup", {}), Prism.languages.insertBefore("markdown", "prolog", {
  blockquote: {pattern: /^>(?:[\t ]*>)*/m, alias: "punctuation"},
  code: [{pattern: /^(?: {4}|\t).+/m, alias: "keyword"}, {pattern: /``.+?``|`[^`\n]+`/, alias: "keyword"}],
  title: [{
    pattern: /\w+.*(?:\r?\n|\r)(?:==+|--+)/,
    alias: "important",
    inside: {punctuation: /==+$|--+$/}
  }, {pattern: /(^\s*)#+.+/m, lookbehind: !0, alias: "important", inside: {punctuation: /^#+|#+$/}}],
  hr: {pattern: /(^\s*)([*-])([\t ]*\2){2,}(?=\s*$)/m, lookbehind: !0, alias: "punctuation"},
  list: {pattern: /(^\s*)(?:[*+-]|\d+\.)(?=[\t ].)/m, lookbehind: !0, alias: "punctuation"},
  "url-reference": {
    pattern: /!?\[[^\]]+\]:[\t ]+(?:\S+|<(?:\\.|[^>\\])+>)(?:[\t ]+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\)))?/,
    inside: {
      variable: {pattern: /^(!?\[)[^\]]+/, lookbehind: !0},
      string: /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\))$/,
      punctuation: /^[\[\]!:]|[<>]/
    },
    alias: "url"
  },
  bold: {
    pattern: /(^|[^\\])(\*\*|__)(?:(?:\r?\n|\r)(?!\r?\n|\r)|.)+?\2/,
    lookbehind: !0,
    inside: {punctuation: /^\*\*|^__|\*\*$|__$/}
  },
  italic: {
    pattern: /(^|[^\\])([*_])(?:(?:\r?\n|\r)(?!\r?\n|\r)|.)+?\2/,
    lookbehind: !0,
    inside: {punctuation: /^[*_]|[*_]$/}
  },
  url: {
    pattern: /!?\[[^\]]+\](?:\([^\s)]+(?:[\t ]+"(?:\\.|[^"\\])*")?\)| ?\[[^\]\n]*\])/,
    inside: {variable: {pattern: /(!?\[)[^\]]+(?=\]$)/, lookbehind: !0}, string: {pattern: /"(?:\\.|[^"\\])*"(?=\)$)/}}
  }
//@ts-ignore
}), Prism.languages.markdown.bold.inside.url = Prism.util.clone(Prism.languages.markdown.url), Prism.languages.markdown.italic.inside.url = Prism.util.clone(Prism.languages.markdown.url), Prism.languages.markdown.bold.inside.italic = Prism.util.clone(Prism.languages.markdown.italic), Prism.languages.markdown.italic.inside.bold = Prism.util.clone(Prism.languages.markdown.bold); // prettier-ignore

export type FormulaColumn = {
  name: string;
  formula: string;
};

export type Scope = { [name: string]: any };

function evalCondition(condition: any, item: any): any {
  if (isFunction(condition)) {
    return condition(item);
  }
  return condition;
}

function evaluateFormula(
  textDocument: TextDocument,
  sheetConfig: SheetConfig,
  source: string,
  scope: Scope
) {
  const API = {
    SplitLines: (until?: string): Highlight[] => {
      // todo: there's probably a more elegant way to get lines out of CM
      const lines = textDocument.text.sliceString(0).split("\n");
      let highlights: Highlight[] = [];

      let index = 0;
      for (const line of lines) {
        const indexOfDelimiter = until ? line.indexOf(until) : -1;
        const endOfSpan =
          indexOfDelimiter !== -1
            ? index + indexOfDelimiter
            : index + line.length;
        highlights.push({
          documentId: textDocument.id,
          sheetConfigId: sheetConfig.id,
          span: [index, endOfSpan],
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
            "regex causes infinite loop because it matches empty string"
          );
        }

        prevIndex = from;

        highlights.push({
          documentId: textDocument.id,
          sheetConfigId: sheetConfig.id,
          span: [from, to],
          data: { groups: match.slice(1) },
        });
      }

      return highlights;
    },

    // this method is not curried because it has an optional isCaseSensitive parameter
    MatchString: (
      values: string | string[] | Highlight[],
      isCaseSensitive: boolean
    ) => {
      if (!isArray(values)) {
        values = [values];
      }

      let highlights: Highlight[] = [];

      for (const value of values) {
        const text = isString(value) ? value : getTextForHighlight(value);
        const newHighlights = API.MatchRegexp(
          `\\b${text}s?\\b`,
          isCaseSensitive === false ? "" : "i"
        ).filter(
          (newHighlight) =>
            !highlights.some((old) =>
              doSpansOverlap(newHighlight.span, old.span)
            )
        );

        highlights = highlights.concat(newHighlights);
      }

      return highlights;
    },

    MatchHighlight: (values: Highlight[], isCaseSensitive: boolean) => {
      let highlights: Highlight[] = [];

      for (const value of values) {
        const newHighlights = API.MatchRegexp(
          `\\b${getTextForHighlight(value)}s?\\b`,
          isCaseSensitive === false ? "" : "i"
        )
          .filter(
            (newHighlight) =>
              !highlights.some((old) =>
                doSpansOverlap(newHighlight.span, old.span)
              )
          )
          .map((newHighlight) => ({
            ...newHighlight,
            data: { ...newHighlight.data, matchedHighlight: value },
          }));

        highlights = highlights.concat(newHighlights);
      }

      return highlights;
    },

    HighlightsOfType: (type: string) => {
      const typeSheetConfig = Array.from(sheetConfigsMobx.values()).find(
        (sheetConfig) => sheetConfig.name === type
      );

      if (!typeSheetConfig) {
        return [];
      }
      return getComputedSheetValue(textDocument.id, typeSheetConfig.id).get();
    },

    NextOfType: (
      highlight: Highlight,
      type: string,
      distanceLimit?: number
    ) => {
      const typeSheetConfig = Array.from(sheetConfigsMobx.values()).find(
        (sheetConfig) => sheetConfig.name === type
      );
      if (!typeSheetConfig) {
        return;
      }
      const sheetValueRows = getComputedSheetValue(
        textDocument.id,
        typeSheetConfig.id
      ).get();
      return sheetValueRows.find(
        (r) =>
          "span" in r &&
          r.span[0] > highlight.span[1] &&
          (distanceLimit === undefined ||
            r.span[0] - highlight.span[1] < distanceLimit)
      );
    },

    PrevOfType: (
      highlight: Highlight,
      type: string,
      distanceLimit?: number
    ) => {
      const typeSheetConfig = Array.from(sheetConfigsMobx.values()).find(
        (sheetConfig) => sheetConfig.name === type
      );
      if (!typeSheetConfig) {
        return;
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
            (distanceLimit === undefined ||
              highlight.span[0] - r.span[1] < distanceLimit)
        );
    },

    NextUntil: (highlight: Highlight, stopCondition: any): Highlight[] => {
      const textDocument = textDocumentsMobx.get(highlight.documentId);

      if (!textDocument) {
        return [];
      }

      const sortedHighlights = sortBy(
        getHighlightsUntilSheet(textDocument, highlight.sheetConfigId).get(),
        ({ span }) => span[0]
      );

      let result: Highlight[] = [];

      for (const otherHighlight of sortedHighlights) {
        if (otherHighlight.span[0] > highlight.span[1]) {
          if (evalCondition(stopCondition, otherHighlight)) {
            return result;
          }

          result.push(otherHighlight);
        }
      }

      return result;
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
      return list.filter((item: any) => evalCondition(condition, item));
    }),

    Not: (value: any) => {
      if (isFunction(value)) {
        return (...args: any[]) => !value(...args);
      }

      return !value;
    },

    First: (list: any[]): any => {
      return list[0];
    },

    Second: (list: any[]): any => {
      return list[1];
    },

    Third: (list: any[]): any => {
      return list[2];
    },

    ParseInt: (number: string) => {
      return parseInt(number, 10);
    },

    DataFromDoc: (
      docName: string,
      sheetConfigName: string,
      columnName: string
    ): any[] => {
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
      const result = getComputedSheetValue(doc.id, sheetConfig.id)
        .get()
        .map((r) => r.data[columnName]);
      return result;
    },

    USDAFoodName: (foodName: Highlight): string | undefined => {
      let text = getTextForHighlight(foodName);
      const matchedHighlight = foodName.data.matchedHighlight as
        | Highlight
        | undefined;
      if (matchedHighlight !== undefined) {
        const computedData = getComputedDocumentValues(
          foodName.data.matchedHighlight.documentId
        ).get();
        const rowForHighlight = computedData[
          matchedHighlight.sheetConfigId
        ].find((row) => row.data.name === matchedHighlight);
        if (
          rowForHighlight &&
          rowForHighlight.data.officialName !== undefined
        ) {
          text = rowForHighlight.data.officialName.data.groups[0];
        }
      }

      const fuzzySetResult = foodNameMatchSet.get(text);
      if (fuzzySetResult === null) {
        return undefined;
      }
      const result = fuzzySetResult[0];
      const normalizedName = result[1];
      // TODO: we often get back multiple options here;
      // we could allow the user to pick one and encode that as a mapping in the allIngredients list?
      // const confidenceScore = Math.round(result[0] * 100);
      return normalizedName;
    },
    Markdown: (): Highlight[] => {
      const docString = textDocument.text.sliceString(0);
      let highlights: Highlight[] = [];
      const getLength = (token: any): number => {
        if (typeof token === "string") {
          return token.length;
        } else if (typeof token.content === "string") {
          return token.content.length;
        } else if (Array.isArray(token.content)) {
          return token.content.reduce(
            (l: number, t: any) => l + getLength(t),
            0
          );
        } else {
          return 0;
        }
      };

      const tokens = Prism.tokenize(docString, Prism.languages.markdown);
      console.log({ docString, tokens });
      let start = 0;

      for (const token of tokens) {
        const length = getLength(token);
        const end = start + length;

        if (typeof token !== "string") {
          highlights.push({
            documentId: textDocument.id,
            sheetConfigId: sheetConfig.id,
            span: [start, end],
            data: { type: token.type },
          });
        }

        start = end;
      }

      return highlights;
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
  sheetConfig: SheetConfig,
  evalOnlyFirstColumn?: boolean // this is necessary for the nextUntil formula, to avoid circular dependencies
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
        resultRows = sortBy(resultRows, (r) => r.span[0]);
        resultRows = resultRows.map((item) => ({ [column.name]: item }));
      } else {
        resultRows = [{ [column.name]: result }];
      }

      if (evalOnlyFirstColumn) {
        break;
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

  // Stretch the bounds of this Highlight so it contains all the highlights in its row.
  // Need to be careful to only consider child Highlights which are in this doc, not other docs
  return (resultRows ?? []).map((rowData) => {
    let from, to;

    for (const value of Object.values(rowData)) {
      if (
        value &&
        value.span &&
        value.documentId &&
        value.documentId === textDocument.id //
      ) {
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
