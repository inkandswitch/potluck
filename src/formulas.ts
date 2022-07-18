import { SheetConfig, Highlight, sheetConfigsMobx } from "./primitives";
import { curry, isFunction, isArray, sortBy, isObject, map } from "lodash";
import { Text } from "@codemirror/state";

export type FormulaColumn = {
  name: string;
  formula: string;
};

export type Scope = { [name: string]: any };

function evaluateFormula(
  source: string,
  highlights: Highlight[],
  doc: Text,
  sheetsScope: Scope,
  scope: Scope,
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
      const sheetConfig = Array.from(sheetConfigsMobx.values()).find((sheetConfig) => sheetConfig.name === type)

      if (!sheetConfig) {
        return []
      }

      return highlights.filter((highlight) => highlight.sheetConfigId === sheetConfig.id);
    },

    NEXT: curry((highlight: Highlight, condition: any) => {
      return highlights.find((otherHighlight) => {
        if (otherHighlight.span[1] <= highlight.span[1]) {
          return false
        }

        if (isFunction(condition)) {
          return condition(otherHighlight);
        }

        return  condition
      })
    }),

    PREV: curry((highlight: Highlight, condition: any) => {
      return highlights.reverse().find((otherHighlight) => {
        if (otherHighlight.span[1] > highlight.span[0]) {
          return false
        }

        if (isFunction(condition)) {
          return condition(otherHighlight);
        }

        return  condition
      })
    }),

    HAS_TYPE: curry((type: string, highlight : Highlight) => {
      const sheetConfig = Array.from(sheetConfigsMobx.values()).find((sheetConfig) => sheetConfig.name === type)

      if (!sheetConfig) {
        return false
      }

      return sheetConfig.id === highlight.sheetConfigId
    }),

    HAS_TEXT_ON_LEFT: curry((text: string, highlight: Highlight): boolean => {
      const from = highlight.span[0]
      const prevText = doc.sliceString(0, from).trim()

      console.log(prevText)

      return prevText.endsWith(text)
    }),

    HAS_TEXT_ON_RIGHT: curry((text: string, highlight: Highlight): boolean => {
      const to = highlight.span[1]
      const followingText = doc.sliceString(to).trim()
      return followingText.startsWith(text)
    }),

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
        return condition;
      });
    }),

    FIRST: (list: any[]): any => {
      return list[0];
    },

    SECOND: (list: any[]): any => {
      return list[1];
    }
  };

  try {
    let fn = new Function(
      "API",
      "sheetsContext",
      "context",
      `
    with (API) {  
      with (sheetsContext) {
        with (context) {
          return ${source}
        }
      }
    }
  `
    );

    return fn(API, sheetsScope, scope);
  } catch (e) {
    console.error(e)
    return e;
  }
}

export function evaluateColumns(
  columns: FormulaColumn[],
  snippets: Highlight[],
  doc: Text,
  sheetsContext: Scope
): Scope[] {
  let resultRows: Scope[] = [];

  const proxiedSheetsContext = sheetsScopeProxy(sheetsContext)

  for (const column of columns) {
    if (resultRows.length === 0) {
      const result = evaluateFormula(column.formula, snippets, doc, proxiedSheetsContext, {});

      if (isArray(result)) {
        result.forEach(item => resultRows.push({ [column.name]: item }))
      } else {
        resultRows.push({ [column.name]: result });
      }
    } else {
      resultRows = resultRows.map((row) => {
        const result = evaluateFormula(column.formula, snippets, doc, proxiedSheetsContext, {...row});

        return { ...row, [column.name]: result };
      });
    }
  }

  return resultRows;
}

function sheetsScopeProxy (sheetsScope: Scope) {
  const resolved: Scope = {}

  for (const [id, rows] of Object.entries(sheetsScope)) {
    const name = sheetConfigsMobx.get(id)?.name
    if (name) {
      resolved[name] = rows
    }
  }

  return scopeProxy(resolved)
}

function wrapValueInProxy (value : any) {
  if (isArray(value)) {
    return arrayProxy(value)
  }

  if (isObject(value)) {
    return scopeProxy(value)
  }

  return value
}

function arrayProxy (array: any[]) {
  const handler = {
    get (target: any[], prop: string) : any[] {

      if (array[0] && array[0].hasOwnProperty(prop)) {
        return (
          array
          .map((item) => wrapValueInProxy(item[prop]))
          .filter(value => value !== undefined)
        )
      }

      // @ts-ignore
      return Reflect.get(...arguments);
    }
  }

  return new Proxy(array, handler)
}

function scopeProxy(scope: Scope) {
  const handler = {
    get (target: any, prop : string) : any {
      return wrapValueInProxy(scope[prop])
    }
  }

  return new Proxy(scope, handler)
}

export function evaluateSheetConfigs (doc: Text, sheetConfigs: SheetConfig[]): { highlights: Highlight[], sheetsScope: Scope } {
  let highlights: Highlight[] = [];

  const sheetsScope: Scope = {}

  sheetConfigs.forEach((sheetConfig) => {
    const matches = evaluateColumns(sheetConfig.columns, highlights, doc, sheetsScope)

    sheetsScope[sheetConfig.id] = matches

    for (const match of matches) {
      let from, to;

      for (const value of Object.values(match)) {
        if (value && value.span) {
          const [valueFrom, valueTo] = value.span

          if (from === undefined || valueFrom < from) {
            from = valueFrom
          }

          if (to === undefined || valueTo > to) {
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

  return {
    sheetsScope,
    highlights: sortBy(highlights, ({ span }) => span[0])
  }
}
