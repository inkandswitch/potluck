import {
  SheetConfig,
  sheetConfigsMobx,
  textDocumentsMobx,
  getSheetConfigsOfTextDocument,
  TextDocument,
  HighlightComponent,
  highlightComponentEntriesMobx,
  HighlightComponentEntry,
  textEditorStateMobx,
  textEditorViewMobx,
  SheetValueRow,
} from "./primitives";
import { Highlight } from "./highlight";
import {
  curry,
  isFunction,
  isArray,
  isObject,
  isString,
  sortBy,
  parseInt,
  isNaN,
  isNumber,
  round,
  minBy,
  escapeRegExp,
} from "lodash";
import {
  getComputedDocumentValues,
  getComputedSheetValue,
  getComputedHighlightsForDocumentAvoidingCircular,
} from "./compute";
import {
  doSpansOverlap,
  getTextForHighlight,
  isNumericish,
  isValueRowHighlight,
  transformColumnFormula,
} from "./utils";
import { OFFICIAL_FOODS } from "./data/officialFoods";
// @ts-ignore
import FuzzySet from "fuzzyset";
import Prism, { highlight } from "prismjs";
import { createTimerComponent } from "./TimerComponent";
import { createAtom, makeObservable, runInAction } from "mobx";
import { createNumberSliderComponent } from "./NumberSliderComponent";
import { matchPatternInDocument } from "./patterns";
import { DateTime } from "luxon";
import memoize from "memoizee";

const foodNameMatchSet = new FuzzySet(
  OFFICIAL_FOODS.map((food: any) => food.description),
  false
);

// eslint-disable-next-line
// @ts-ignore
Prism.languages.markdown = Prism.languages.extend("markup", {}), Prism.languages.insertBefore("markdown", "prolog", {
  blockquote: { pattern: /^>(?:[\t ]*>)*/m, alias: "punctuation" },
  code: [{ pattern: /^(?: {4}|\t).+/m, alias: "keyword" }, { pattern: /``.+?``|`[^`\n]+`/, alias: "keyword" }],
  title: [{
    pattern: /\w+.*(?:\r?\n|\r)(?:==+|--+)/,
    alias: "important",
    inside: { punctuation: /==+$|--+$/ }
  }, { pattern: /(^\s*)#+.+/m, lookbehind: !0, alias: "important", inside: { punctuation: /^#+|#+$/ } }],
  hr: { pattern: /(^\s*)([*-])([\t ]*\2){2,}(?=\s*$)/m, lookbehind: !0, alias: "punctuation" },
  list: { pattern: /(^\s*)(?:[*+-]|\d+\.)(?=[\t ].)/m, lookbehind: !0, alias: "punctuation" },
  "url-reference": {
    pattern: /!?\[[^\]]+\]:[\t ]+(?:\S+|<(?:\\.|[^>\\])+>)(?:[\t ]+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\)))?/,
    inside: {
      variable: { pattern: /^(!?\[)[^\]]+/, lookbehind: !0 },
      string: /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\))$/,
      punctuation: /^[\[\]!:]|[<>]/
    },
    alias: "url"
  },
  bold: {
    pattern: /(^|[^\\])(\*\*|__)(?:(?:\r?\n|\r)(?!\r?\n|\r)|.)+?\2/,
    lookbehind: !0,
    inside: { punctuation: /^\*\*|^__|\*\*$|__$/ }
  },
  italic: {
    pattern: /(^|[^\\])([*_])(?:(?:\r?\n|\r)(?!\r?\n|\r)|.)+?\2/,
    lookbehind: !0,
    inside: { punctuation: /^[*_]|[*_]$/ }
  },
  url: {
    pattern: /!?\[[^\]]+\](?:\([^\s)]+(?:[\t ]+"(?:\\.|[^"\\])*")?\)| ?\[[^\]\n]*\])/,
    inside: {
      variable: { pattern: /(!?\[)[^\]]+(?=\]$)/, lookbehind: !0 },
      string: { pattern: /"(?:\\.|[^"\\])*"(?=\)$)/ }
    }
  }
//@ts-ignore
}), Prism.languages.markdown.bold.inside.url = Prism.util.clone(Prism.languages.markdown.url), Prism.languages.markdown.italic.inside.url = Prism.util.clone(Prism.languages.markdown.url), Prism.languages.markdown.bold.inside.italic = Prism.util.clone(Prism.languages.markdown.italic), Prism.languages.markdown.italic.inside.bold = Prism.util.clone(Prism.languages.markdown.bold); // prettier-ignore

class Clock {
  atom;
  intervalHandler: number | undefined = undefined;
  currentDateTime = new Date();

  constructor() {
    this.atom = createAtom(
      "Clock",
      () => this.startTicking(),
      () => this.stopTicking()
    );
  }

  getTime() {
    if (this.atom.reportObserved()) {
      return this.currentDateTime;
    } else {
      return new Date();
    }
  }

  tick() {
    this.currentDateTime = new Date();
    this.atom.reportChanged();
  }

  startTicking() {
    this.tick();
    this.intervalHandler = setInterval(() => this.tick(), 1000);
  }

  stopTicking() {
    clearInterval(this.intervalHandler);
    this.intervalHandler = undefined;
  }
}

const clock = new Clock();

class FetchAtom {
  atom;
  callIndex = 0;
  intervalHandler: number | undefined = undefined;
  currentJSON: any | undefined;

  constructor(
    readonly url: string,
    readonly refetchInterval: number | undefined
  ) {
    this.atom = createAtom(
      "Clock",
      () => this.start(),
      () => this.stop()
    );
  }

  getJSON() {
    if (this.atom.reportObserved()) {
      return this.currentJSON;
    } else {
      throw new Error("tried accessing FetchAtom outside mobx reactivity");
    }
  }

  tick() {
    this.callIndex++;
    const currentCallIndex = this.callIndex;
    fetch(this.url)
      .then((response) => response.json())
      .then((json) => {
        if (this.callIndex === currentCallIndex) {
          this.currentJSON = json;
          this.atom.reportChanged();
        }
      });
  }

  start() {
    this.tick();
    if (this.refetchInterval !== undefined && this.refetchInterval !== 0) {
      this.intervalHandler = setInterval(
        () => this.tick(),
        this.refetchInterval * 1000
      );
    }
  }

  stop() {
    if (this.intervalHandler !== undefined) {
      clearInterval(this.intervalHandler);
      this.intervalHandler = undefined;
    }
  }
}

const getFetchAtom = memoize(
  (url, refetchIntervalSeconds) => {
    return new FetchAtom(url, refetchIntervalSeconds);
  },
  { length: 2 }
);

export type Scope = { [name: string]: any };

function getTokenType(token: any) {
  if (token.type === "title") {
    return `h${token.content[0].content.length}`;
  }

  return token.type;
}

function evalCondition(condition: any, item: any): any {
  if (isFunction(condition)) {
    return condition(item);
  }
  return condition;
}

const toNumber = (value: number | Highlight): number => {
  return isValueRowHighlight(value)
    ? parseFloat(getTextForHighlight(value)!)
    : value;
};

export function evaluateFormula(
  textDocument: TextDocument,
  sheetConfig: SheetConfig,
  isFirstColumn: boolean,
  source: string,
  scope: Scope
) {
  const API = {
    DateTime,

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
        if (endOfSpan > index) {
          highlights.push(
            new Highlight(
              textDocument.id,
              sheetConfig.id,
              [index, endOfSpan],
              {}
            )
          );
        }
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

        highlights.push(
          new Highlight(textDocument.id, sheetConfig.id, [from, to], {
            groups: match.slice(1),
          })
        );
      }

      return highlights;
    },

    MatchPattern: (patternString: string): Highlight[] => {
      return matchPatternInDocument(
        patternString,
        textDocument,
        sheetConfig.id
      );
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
          `\\b${escapeRegExp(text)}s?\\b`,
          !isCaseSensitive ? "" : "i"
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
          !isCaseSensitive ? "" : "i"
        )
          .filter(
            (newHighlight) =>
              !highlights.some((old) =>
                doSpansOverlap(newHighlight.span, old.span)
              )
          )
          .map((newHighlight) =>
            Highlight.from({
              ...newHighlight,
              data: { ...newHighlight.data, matchedHighlight: value },
            })
          );

        highlights = highlights.concat(newHighlights);
      }

      return highlights;
    },

    FindAll: (type: string) => {
      const typeSheetConfigs = Array.from(sheetConfigsMobx.values()).filter(
        (sheetConfig) => sheetConfig.name === type
      );
      const typeSheetConfig =
        typeSheetConfigs.find((sheetConfig) =>
          textDocument.sheets.some(
            (documentSheet) => documentSheet.configId === sheetConfig.id
          )
        ) ?? typeSheetConfigs[0];

      if (!typeSheetConfig) {
        return [];
      }
      return getComputedSheetValue(textDocument.id, typeSheetConfig.id).get();
    },

    Find: (type: string) => {
      const allHighlights = API.FindAll(type);
      return allHighlights[0];
    },

    NextOfType: (
      highlight: Highlight,
      type: string | string[],
      distanceLimit?: number
    ) => {
      const typeSheetConfigs = Array.from(sheetConfigsMobx.values()).filter(
        (sheetConfig) =>
          isString(type)
            ? sheetConfig.name === type
            : type.includes(sheetConfig.name)
      );

      const sheetValueRows = sortBy(
        typeSheetConfigs
          .flatMap((typeSheetConfig) =>
            getComputedSheetValue(textDocument.id, typeSheetConfig.id).get()
          )
          .filter((row) => "span" in row) as Highlight[],
        ({ span }) => span[0]
      );

      return sheetValueRows.find(
        (r) =>
          "span" in r &&
          r.span[0] > highlight.span[1] &&
          (distanceLimit === undefined ||
            r.span[0] - highlight.span[1] < distanceLimit)
      );
    },

    HasCursorFocus: (highlight: Highlight) => {
      const selectedRange = textEditorStateMobx.get().selection.asSingle().main;

      return (
        selectedRange.from >= highlight.span[0] &&
        selectedRange.to <= highlight.span[1]
      );
    },

    PrevOfType: (
      highlight: Highlight,
      type: string | string[],
      distanceLimit?: number
    ) => {
      const typeSheetConfigs = Array.from(sheetConfigsMobx.values()).filter(
        (sheetConfig) =>
          isString(type)
            ? sheetConfig.name === type
            : type.includes(sheetConfig.name)
      );

      const sheetValueRows = sortBy(
        typeSheetConfigs
          .flatMap((typeSheetConfig) => {
            const firstColumnOnly =
              typeSheetConfig.id === highlight.sheetConfigId;
            return getComputedSheetValue(
              textDocument.id,
              typeSheetConfig.id
            ).get();
          })
          .filter((row) => "span" in row) as Highlight[],
        ({ span }) => span[0]
      );

      return minBy(
        [...sheetValueRows].filter(
          (r) =>
            "span" in r &&
            r.span[1] < highlight.span[0] &&
            (distanceLimit === undefined ||
              highlight.span[0] - r.span[1] < distanceLimit)
        ),
        (r) => highlight.span[0] - r.span[1]
      );
    },

    AllPrevOfType: (highlight: Highlight, type: string | string[]) => {
      const typeSheetConfigs = Array.from(sheetConfigsMobx.values()).filter(
        (sheetConfig) =>
          isString(type)
            ? sheetConfig.name === type
            : type.includes(sheetConfig.name)
      );

      const sheetValueRows = sortBy(
        typeSheetConfigs
          .flatMap((typeSheetConfig) => {
            const firstColumnOnly =
              typeSheetConfig.id === highlight.sheetConfigId;
            return getComputedSheetValue(
              textDocument.id,
              typeSheetConfig.id,
              firstColumnOnly
            ).get();
          })
          .filter((row) => "span" in row) as Highlight[],
        ({ span }) => -span[0]
      );

      return [...sheetValueRows].filter(
        (r) => "span" in r && r.span[1] < highlight.span[0]
      );
    },

    TextAfter: (highlight: Highlight, until: string = "\n"): Highlight => {
      let endIndex = textDocument.text
        .sliceString(0)
        .indexOf(until, highlight.span[1]);
      if (endIndex === -1) {
        endIndex = textDocument.text.sliceString(0).length;
      }
      return new Highlight(
        textDocument.id,
        sheetConfig.id,
        [highlight.span[1], endIndex],
        {}
      );
    },

    TextBefore: (highlight: Highlight, until: string = "\n"): Highlight => {
      const indicesWhereUntilOccurs = [
        ...textDocument.text
          .sliceString(0, highlight.span[0])
          .matchAll(new RegExp(until, "gi")),
      ].map((a) => a.index);

      let startIndex: number;
      if (indicesWhereUntilOccurs.length === 0) {
        startIndex = 0;
      } else {
        startIndex = indicesWhereUntilOccurs.slice(-1)[0]!;
      }

      return new Highlight(
        textDocument.id,
        sheetConfig.id,
        [startIndex, highlight.span[0]],
        {}
      );
    },

    NextUntil: (highlight: Highlight, stopCondition: any): Highlight[] => {
      const textDocument = textDocumentsMobx.get(highlight.documentId);

      if (!textDocument) {
        return [];
      }

      const sortedHighlights = sortBy(
        getComputedHighlightsForDocumentAvoidingCircular(
          textDocument,
          highlight.sheetConfigId
        ).get(),
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

    PrevUntil: (highlight: Highlight, stopCondition: any): Highlight[] => {
      const textDocument = textDocumentsMobx.get(highlight.documentId);

      if (!textDocument) {
        return [];
      }

      const sortedHighlights = sortBy(
        getComputedHighlightsForDocumentAvoidingCircular(
          textDocument,
          highlight.sheetConfigId
        ).get(),
        ({ span }) => -span[0]
      );

      let result: Highlight[] = [];

      for (const otherHighlight of sortedHighlights) {
        if (otherHighlight.span[0] < highlight.span[1]) {
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

    TextOfHighlight: (highlight: Highlight): string => {
      return getTextForHighlight(highlight) ?? "";
    },

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

    IsNumber: isNumber,

    ParseInt: (number: string) => {
      return parseInt(number, 10);
    },

    ParseFloat: (number: string) => {
      return parseFloat(number);
    },

    Uppercase: (text: string | Highlight) => {
      if (isValueRowHighlight(text)) {
        return getTextForHighlight(text)!.toUpperCase();
      }

      return text.toUpperCase();
    },

    Lowercase: (text: string | Highlight) => {
      if (isValueRowHighlight(text)) {
        return getTextForHighlight(text)!.toLowerCase();
      }

      return text.toLowerCase();
    },

    Round: round,

    Sum: (list: Array<number | Highlight>): number => {
      return list.reduce((a, b) => toNumber(a) + toNumber(b), 0) as number;
    },

    // Return a string that consists of repeating the text n times.
    Repeat: (text: string, count: number | Highlight): string => {
      return Array(toNumber(count)).fill(text).join("");
    },

    Average: (list: Array<number | Highlight>): number => {
      return (
        (list.reduce((a, b) => toNumber(a) + toNumber(b), 0) as number) /
        list.length
      );
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

    NowDate: () => {
      return clock.getTime();
    },

    FetchJSON: (url: string, refetchInterval: number) => {
      // force user to pass refetchInterval so we don't fetch every URL while
      // they're typing it since we're live.
      if (refetchInterval !== undefined) {
        return getFetchAtom(url, refetchInterval).getJSON();
      }
      return undefined;
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
      let start = 0;

      for (const token of tokens) {
        const length = getLength(token);
        const end = start + length;

        if (typeof token !== "string") {
          highlights.push(
            new Highlight(textDocument.id, sheetConfig.id, [start, end], {
              type: getTokenType(token),
            })
          );
        }

        start = end;
      }

      return highlights;
    },
    Timer: (durationHighlight: Highlight): HighlightComponent => {
      // TODO: remove highlight component entries that are no longer used
      // not clear when to do this, on every eval?
      const durationText = textDocument.text
        .sliceString(durationHighlight.span[0], durationHighlight.span[1])
        .trim();
      const existingTimer = highlightComponentEntriesMobx.find(
        (entry) =>
          entry.componentType === "Timer" &&
          entry.span[0] === durationHighlight.span[0] &&
          entry.span[1] === durationHighlight.span[1] &&
          entry.text === durationText
      );
      if (existingTimer !== undefined) {
        return existingTimer.component;
      }
      const componentEntry: HighlightComponentEntry = {
        documentId: textDocument.id,
        componentType: "Timer",
        span: durationHighlight.span,
        text: durationText,
        component: createTimerComponent(durationText),
      };
      runInAction(() => {
        highlightComponentEntriesMobx.push(componentEntry);
      });
      return componentEntry.component;
    },
    Slider: (
      highlight: Highlight,
      value: number = 1
    ): HighlightComponent | undefined => {
      if (highlight === undefined) {
        return undefined;
      }
      // TODO: remove highlight component entries that are no longer used
      // not clear when to do this, on every eval?
      const highlightText = textDocument.text
        .sliceString(highlight.span[0], highlight.span[1])
        .trim();
      const existingTimer = highlightComponentEntriesMobx.find(
        (entry) =>
          entry.componentType === "NumberSlider" &&
          entry.span[0] === highlight.span[0] &&
          entry.span[1] === highlight.span[1] &&
          entry.text === highlightText
      );
      if (existingTimer !== undefined) {
        return existingTimer.component;
      }
      const componentEntry: HighlightComponentEntry = {
        documentId: textDocument.id,
        componentType: "NumberSlider",
        span: highlight.span,
        text: highlightText,
        component: createNumberSliderComponent(value),
      };
      runInAction(() => {
        highlightComponentEntriesMobx.push(componentEntry);
      });
      return componentEntry.component;
    },

    TemplateButton: (
      highlight: Highlight,
      buttonLabel: string | Highlight,
      updateText: string | (() => string) | Highlight,
      operation: "append" | "prepend" | "replace" = "append"
    ) => {
      if (highlight === undefined) {
        return undefined;
      }

      const onClick = () => {
        const view = textEditorViewMobx.get();

        if (!view) {
          return;
        }

        const insert =
          typeof updateText === "function"
            ? updateText()
            : updateText.toString();
        view.dispatch({
          changes:
            operation === "replace"
              ? {
                  from: highlight.span[0],
                  to: highlight.span[1],
                  insert,
                }
              : operation === "prepend"
              ? { from: highlight.span[0], insert }
              : { from: highlight.span[1], insert },
        });
      };

      return (
        <button onClick={onClick} className="px-1 bg-blue-100 rounded">
          {buttonLabel.toString()}
        </button>
      );
    },

    Video: (
      highlight: Highlight,
      url: string,
      width: number = 640,
      height: number = 480
    ) => {
      if (highlight === undefined) {
        return undefined;
      }

      return (
        <video width={width} height={height} controls src={url}/>
      )
    },

    YoutubeVideo: (
      highlight: Highlight,
      videoId: string,
      width: number = 640,
      height: number = 480
    ) => {
      if (highlight === undefined) {
        return undefined;
      }

      return (
        <iframe
          frameBorder="0"
          scrolling="no"
          marginHeight={0}
          marginWidth={0}
          width={width}
          height={height}
          src={`https://www.youtube.com/embed/${videoId}?autoplay=0&fs=0&iv_load_policy=3&showinfo=0&rel=0&cc_load_policy=0&start=0&end=0&origin=http://youtubeembedcode.com`}>
        </iframe>
      )
    },

    Link: (
      highlight: Highlight,
      url: string,
      label:string = url
    ) => {
      if (highlight === undefined) {
        return undefined;
      }

      return (
        <a className="text-[#1355ff]" href={url.toString()}>{label.toString()}</a>
      )
    }
  };

  const formulaSource = transformColumnFormula(source, isFirstColumn);

  try {
    let fn = new Function(
      "API",
      "scope",
      `
    with (API) {
      with (scope) {
        ${
          formulaSource.includes("return")
            ? formulaSource
            : `return (${formulaSource})`
        }
      }
    }
  `
    );

    const result = fn(API, scope);

    return isNaN(result) ? undefined : result;
  } catch (e) {
    console.log(e);

    return e;
  }
}

export const FORMULA_REFERENCE = [
  { name: "SplitLines", args: ["until?: string"], return: "Highlight[]" },
  {
    name: "MatchRegexp",
    args: ["regexString: string", "flags?: string"],
    return: "Highlight[]",
  },
  {
    name: "MatchString",
    args: [
      "values: string | string[] | Highlight[]",
      "isCaseSensitive?: boolean",
    ],
    return: "Highlight[]",
  },
  {
    name: "MatchHighlight",
    args: ["values: Highlight[]", "isCaseSensitive?: boolean"],
    return: "Highlight[]",
  },
  {
    name: "Find",
    args: ["type: string"],
    return: "Highlight",
  },
  {
    name: "FindAll",
    args: ["type: string"],
    return: "Highlight[]",
  },
  {
    name: "NextOfType",
    args: ["highlight: Highlight", "type: string", "distanceLimit?: number"],
    return: "Highlight",
  },
  {
    name: "PrevOfType",
    args: ["highlight: Highlight", "type: string", "distanceLimit?: number"],
    return: "Highlight",
  },
  {
    name: "PrevUntil",
    args: ["highlight: Highlight", "stopCondition: any"],
    return: "Highlight[]",
  },
  {
    name: "NextUntil",
    args: ["highlight: Highlight", "stopCondition: any"],
    return: "Highlight[]",
  },
  {
    name: "HasType",
    args: ["type: string", "highlight: Highlight"],
    return: "boolean",
  },
  {
    name: "HasTextOnLeft",
    args: ["text: string", "highlight: Highlight"],
    return: "boolean",
  },
  {
    name: "HasTextOnRight",
    args: ["text: string", "highlight: Highlight"],
    return: "boolean",
  },
  {
    name: "TextAfter",
    args: ["highlight: Highlight", "until: string"],
    return: "Highlight",
  },
  {
    name: "TextBefore",
    args: ["highlight: Highlight", "until: string"],
    return: "Highlight",
  },
  {
    name: "TextOfHighlight",
    args: ["highlight: Highlight"],
    return: "string",
  },
  {
    name: "SameLine",
    args: ["a: Highlight", "b: Highlight"],
    return: "boolean",
  },
  {
    name: "Filter",
    args: ["list: any[]", "condition: any"],
    return: "any[]",
  },
  {
    name: "Not",
    args: ["value: any"],
  },
  {
    name: "First",
    args: ["list: any[]"],
  },
  {
    name: "Second",
    args: ["list: any[]"],
  },
  {
    name: "Third",
    args: ["list: any[]"],
  },
  {
    name: "ParseInt",
    args: ["number: string"],
  },
  {
    name: "ParseFloat",
    args: ["number: string"],
  },
  {
    name: "Uppercase",
    args: ["text: Highlight | string"],
    return: "string",
  },
  {
    name: "Lowercase",
    args: ["text: Highlight | string"],
    return: "string",
  },
  {
    name: "IsNumber",
    args: ["value: any"],
  },
  {
    name: "Sum",
    args: ["values: (number | Highlight)[]"],
  },
  {
    name: "Average",
    args: ["values: (number | Highlight)[]"],
  },
  {
    name: "Round",
    args: ["value: number", "precision: number = 0"],
  },
  {
    name: "Repeat",
    args: ["text: string", "count: number | Highlight"],
  },
  {
    name: "Slider",
    args: ["highlight: Highlight", "initialValue: number = 0"],
    return: "Component",
  },
  {
    name: "Timer",
    args: ["durationHighlight: Highlight"],
    return: "Component",
  },
  {
    name: "TemplateButton",
    args: [
      "highlight: Highlight",
      "buttonLabel: string",
      "updateText: string",
      `operation?: "append" | "prepend" | "replace"`,
    ],
    return: "Component",
  },
  {
    name: "DataFromDoc",
    args: ["docName: string", "sheetConfigName: string", "columnName: string"],
    return: "Highlight[]",
  },
  {
    name: "NowDate",
    args: [],
    return: "Date",
  },
  {
    name: "USDAFoodName",
    args: ["foodName: Highlight"],
    return: "string?",
  },
  {
    name: "Markdown",
    args: [],
    return: "Highlight[]",
  },
  {
    name: "HasCursorFocus",
    args: [],
    return: "boolean",
  },
];

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

  for (const [i, column] of sheetConfig.properties.entries()) {
    if (i === 0) {
      const result =
        evaluateFormula(textDocument, sheetConfig, true, column.formula, {}) ??
        [];

      if (isArray(result)) {
        resultRows = result;
        if (textDocumentSheet?.highlightSearchRange !== undefined) {
          resultRows = result.filter(
            (item) =>
              item.span === undefined ||
              doSpansOverlap(textDocumentSheet.highlightSearchRange!, item.span)
          );
        }
        if (resultRows.length > 0 && resultRows[0].span !== undefined) {
          resultRows = sortBy(resultRows, (r) => r.span[0]);
        }
        resultRows = resultRows.map((item) => ({ [column.name]: item }));
      } else {
        resultRows = [{ [column.name]: result }];
      }

      // flatten nested data of first highlight, this is necessary so named groups are directly accessible in the table
      resultRows = resultRows.map((row) => {
        const value = Object.values(row)[0] ?? {};

        const tempRow = { ...row };

        Object.entries(value.data || {}).forEach(
          ([name, value]: [string, any]) => {
            // special handling, assume if data has __items key that it's a group match (see highlightGroup in pattern)
            tempRow[name] = value?.data?.__items ? value.data.__items : value;
          }
        );

        return tempRow;
      });

      if (evalOnlyFirstColumn) {
        break;
      }
    } else {
      resultRows = resultRows!.map((row, _index) => {
        const result = evaluateFormula(
          textDocument,
          sheetConfig,
          false,
          column.formula,
          { _index, ...row }
        );

        return { ...row, [column.name]: result };
      });
    }
  }

  // Stretch the bounds of this Highlight so it contains all the highlights in its row.
  // Need to be careful to only consider child Highlights which are in this doc, not other docs
  const result = (resultRows ?? []).map((rowData) => {
    let from, to;

    for (const value of Object.values(rowData)) {
      if (
        value &&
        value.span &&
        value.documentId &&
        value.documentId === textDocument.id
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

    if (from !== undefined && to !== undefined) {
      return new Highlight(
        textDocument.id,
        sheetConfig.id,
        [from, to],
        rowData
      );
    }

    return {
      documentId: textDocument.id,
      sheetConfigId: sheetConfig.id,
      data: rowData,
    };
  });

  return result;
}

function wrapValueInProxy(value: any) {
  if (isObject(value) && !isArray(value)) {
    return scopeProxy(value);
  }

  return value;
}

function scopeProxy(scope: Scope) {
  const handler = {
    get(target: any, prop: string): any {
      if (
        (prop === "valueOf" || prop === "toString") &&
        scope &&
        scope.span &&
        scope.documentId
      ) {
        const spanText = getTextForHighlight(scope as any);

        const value =
          spanText && prop === "valueOf" && isNumericish(spanText)
            ? parseFloat(spanText)
            : spanText;

        return () => value;
      }

      return wrapValueInProxy(scope[prop]);
    },
  };

  return new Proxy(scope, handler);
}
