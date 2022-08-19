import { sheetConfigsMobx, TextDocument } from "./primitives";
import { Highlight } from "./highlight";
import { escapeRegExp, last } from "lodash";
import ohm from "ohm-js";
import { getComputedSheetValue } from "./compute";

const patternGrammar = ohm.grammar(String.raw`
  Pattern {
    Formula
      = "MatchPattern" "(" "\"" Expr "\"" ")"

    Expr
      = Part*

    Part
      = MatchGroup | text

    MatchGroup
      = "{" (RegExpr |  HighlightName) "+"? (":" Name)? "}" 

    Name
      = alnum+

    HighlightName
      = highlightNamePart+

    highlightNamePart
      = (alnum "."?)

    RegExpr
      = "/" regExprChar+ "/"

    regExprChar
      = "\\/" | ~"/" any

    text
      = textChar+

    textChar
      = ~("{"| "\"") any 
  }
`);

const patternSemantics = patternGrammar.createSemantics();

patternSemantics.addOperation("toAst", {
  _iter(...items) {
    return items.map((item) => item.toAst());
  },

  // @ts-ignore
  _terminal() {
    return;
  },

  // @ts-ignore
  Expr(partsNode) {
    const parts : PatternPart[] = partsNode.toAst()

    let firstPart : PatternPart | undefined  = undefined
    let lastPart : PatternPart | undefined = undefined
    let middle: PatternPart[]

    if (parts.length <= 1) {
      middle = parts
    } else {
      firstPart = parts[0]
      lastPart = last(parts)
      middle = parts.slice(1, -1)
    }

    const matchAtStartOfLine = firstPart && firstPart.type === 'group' && firstPart.expr.type == 'regExpr' && firstPart.expr.source === "^"
    const matchAtEndOfLine = lastPart && lastPart.type === 'group' && lastPart.expr.type == 'regExpr' && lastPart.expr.source === "$"

    let partsWithoutFlags = middle

    if (firstPart && !matchAtStartOfLine) {
      partsWithoutFlags.unshift(firstPart)
    }

    if (lastPart && !matchAtEndOfLine) {
      partsWithoutFlags.push(lastPart)
    }

    return {
      parts: partsWithoutFlags,
      matchAtStartOfLine,
      matchAtEndOfLine,
    };
  },

  // @ts-ignore
  Formula(_, __, ___, expr, ____, _____) {
    return expr.toAst();
  },

  // @ts-ignore
  text(value) {
    return { type: "text", text: value.sourceString };
  },

  // @ts-ignore
  MatchGroup(_, expr, matchMultipleFlag, __, name, ___) {
    return {
      type: "group",
      expr: expr.toAst(),
      name: name.toAst()[0],
      matchMultiple: matchMultipleFlag.sourceString === "+"
    };
  },

  // @ts-ignore
  Name(name) {
    return name.sourceString;
  },

  // @ts-ignore
  HighlightName(name) {
    return { type: "highlightName", name: name.sourceString };
  },

  // @ts-ignore
  RegExpr(_, source, __) {
    return { type: "regExpr", source: source.sourceString };
  },
});

export function getPatternExprGroupNames(source: string): string[] {
  const result = patternGrammar.match(source, "Formula");

  if (!result.succeeded()) {
    return [];
  }

  const pattern = patternSemantics(result).toAst() as Pattern;

  const names: { [name: string]: boolean } = {};

  pattern.parts.forEach((part) => {
    if (part.type === "group" && part.name) {
      names[part.name] = true;
    }
  });

  return Object.keys(names);
}

export function parsePattern(source: string): Pattern | undefined {
  const result = patternGrammar.match(source, "Expr");

  if (!result.succeeded()) {
    return;
  }

  return patternSemantics(result).toAst() as Pattern;
}


export type TextPart = {
  type: "text";
  text: string;
};

export type GroupPart = {
  type: "group";
  name?: string;
  expr: GroupExpr;
  matchMultiple: boolean;
};

export type GroupExpr = RegExpr | HighlightName;

export type HighlightName = {
  type: "highlightName";
  name: string;
};

export type RegExpr = {
  type: "regExpr";
  source: string;
};

export type PatternPart = TextPart | GroupPart;

export type Pattern = {
  parts: PatternPart[],
  matchAtStartOfLine: boolean,
  matchAtEndOfLine: boolean
}

export function patternToString(pattern: Pattern) {
  let string = "";

  for (const part of pattern.parts) {
    switch (part.type) {
      case "text":
        string += part.text;
        break;

      case "group":
        const expr =
          part.expr.type === "regExpr"
            ? `/${part.expr.source}/`
            : part.expr.name;

        string += "name" in part ? `{${expr}:${part.name}}` : `{${expr}}`;
    }
  }

  return string;
}

export function matchPatternInDocument(
  source: string,
  textDocument: TextDocument,
  sheetConfigId: string
): Highlight[] {


  const pattern = parsePattern(source);


  if (!pattern) {
    throw new Error("invalid pattern");
  }

  let highlights: Highlight[] = [];

  pattern.parts.forEach((part, index) => {
    if (index === 0) {
      highlights = matchPart(
        part,
        pattern.matchAtStartOfLine,
        pattern.matchAtEndOfLine,
        textDocument
      );
    } else {
      highlights = highlights
        .map((highlight) =>
          matchPartAfterHighlight(part, highlight, textDocument)
        )
        .filter((highlight) => {
          if (highlight === undefined) {
            return false
          }


          if (!pattern.matchAtEndOfLine) {
            return true
          }

          const fromLine = textDocument.text.lineAt(highlight.span[0])
          const toLine = textDocument.text.lineAt(highlight.span[1])

          return fromLine.number === toLine.number && highlight.span[1] === toLine.to

        }) as Highlight[];
    }
  });

  return highlights.map((highlight) => Highlight.from({ ...highlight, sheetConfigId }));
}

function matchPart(
  part: PatternPart,
  matchAtStartOfLine: boolean,
  matchAtEndOfLine: boolean,
  textDocument: TextDocument
): Highlight[] {
  switch (part.type) {
    case "text": {
      const regExp = escapeRegExp(part.text)
      const regExpWithStartOfLineFlag = matchAtStartOfLine ? `^${regExp}` : regExp

      return matchRegex(regExpWithStartOfLineFlag, textDocument);
    }


    case "group":
      return matchGroupPart(part, matchAtStartOfLine, matchAtEndOfLine, textDocument);

    default:
      return [];
  }
}

function matchGroupPart(
  { expr, name, matchMultiple }: GroupPart,
  matchAtStartOfLine: boolean,
  matchAtEndOfLine: boolean,
  textDocument: TextDocument
): Highlight[] {
  let highlights: Highlight[] = [];

  switch (expr.type) {
    case "highlightName": {
      const [name, ...types] = expr.name.split(".")
      const subtype = types.join(".")

      const sheetConfig = Array.from(sheetConfigsMobx.values()).find(
        (sheetConfig) => sheetConfig.name === name
      );

      if (!sheetConfig) {
        return [];
      }

      let highlightGroup : Highlight | undefined

      (getComputedSheetValue(
        textDocument.id,
        sheetConfig.id
      ).get() as Highlight[])
        .forEach(highlight => {

          // reject if it should be on same line but isn't
          if (matchAtEndOfLine) {
            const fromLineNumber = textDocument.text.lineAt(highlight.span[0]).number
            const toLineNumber = textDocument.text.lineAt(highlight.span[1]).number

            if (fromLineNumber !== toLineNumber) {
              if (highlightGroup) {
                highlights.push(highlightGroup)
                highlightGroup = undefined
              }
              return
            }
          }

          // reject, if subtype doesn't match
          if((subtype !== "" && (
            !highlight.data.type ||
            !highlight.data.type.valueOf().startsWith(subtype)
          ))) {
            if (highlightGroup) {
              highlights.push(highlightGroup)
              highlightGroup = undefined
            }

            return
          }

          // try to add highlight to group
          if (highlightGroup) {
            const textBetween = textDocument.text.sliceString(highlightGroup.span[1], highlight.span[0])

            const highlightGroupLine = textDocument.text.lineAt(highlightGroup.span[1]).number
            const highlightLine = textDocument.text.lineAt(highlight.span[0]).number

            if (textBetween.trim() === '' && (!matchAtEndOfLine || highlightLine === highlightGroupLine)) {
              highlightGroup = Highlight.from({
                ...highlightGroup,
                span: [highlightGroup.span[0], highlight.span[1]],
                data: {
                  __items: highlightGroup.data.__items.concat(highlight)
                }
              })
              return
            }

            highlights.push(highlightGroup)
            highlightGroup = undefined
          }


          // reject if it should match the start of line but doesn't
          if (matchAtStartOfLine) {
            const line = textDocument.text.lineAt(highlight.span[0])
            const isOnStartOfLine = line.from === highlight.span[0]


            if (!isOnStartOfLine) {
              return
            }
          }

          if (matchMultiple) {
            highlightGroup = Highlight.from({
              ...highlight,
              data: {
                __items: [highlight]
              }
            })

          } else {
            highlights.push(highlight)
          }
        })

      if (highlightGroup) {
        highlights.push(highlightGroup)
      }

      break;
    }

    case "regExpr": {
      const regExpWithStartOfLineFlag = (
        matchAtStartOfLine && !expr.source.startsWith("^")
          ? `^${expr.source}`
          : expr.source
      )

      highlights = matchRegex(regExpWithStartOfLineFlag, textDocument);
      break;
    }
  }

  return highlights.map((highlight) =>
    name === undefined
      ? Highlight.from({ sheetConfigId: "", span: highlight.span, documentId: textDocument.id, data: {} })
      : Highlight.from({ ...highlight, data: { [name]: highlight } })
  );
}

function matchRegex(
  source: string,
  textDocument: TextDocument
): Highlight [] {
  const regex = new RegExp(source, "gim");
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

    highlights.push(new Highlight(textDocument.id, "", [from, to], {}));
  }

  return highlights;
}

// Trim spaces/tabs from the beginning of a string, but not newlines
const trimStartWithoutNewlines = (str: string) => {
  return str.replace(/^[ \t]+/, "");
};

function matchPartAfterHighlight(
  part: PatternPart,
  highlight: Highlight,
  textDocument: TextDocument
): Highlight | undefined {
  switch (part.type) {
    case "text": {
      const followingText = textDocument.text.sliceString(highlight.span[1]);
      const followingTextTrimmed = trimStartWithoutNewlines(followingText);

      if (!followingTextTrimmed.startsWith(part.text)) {
        return;
      }

      const partSize =
        followingText.length - followingTextTrimmed.length + part.text.length;

      return Highlight.from({
        ...highlight,
        span: [highlight.span[0], highlight.span[1] + partSize],
      });
    }

    case "group": {
      let matchingHighlight: undefined | Omit<Highlight, "sheetConfigId"> =
        undefined;
      const remainingText = textDocument.text.sliceString(highlight.span[1]);
      const trimmedRemainingText = trimStartWithoutNewlines(remainingText);
      const trimmedLength = remainingText.length - trimmedRemainingText.length;

      switch (part.expr.type) {
        case "highlightName": {
          const [name, ...types] = part.expr.name.split(".")
          const subtype = types.join(".")

          const sheetConfig = Array.from(sheetConfigsMobx.values()).find(
            (sheetConfig) =>
              sheetConfig.name === name
          );

          if (!sheetConfig) {
            return;
          }

          const highlights = getComputedSheetValue(
            textDocument.id,
            sheetConfig.id
          ).get() as Highlight[];

          matchingHighlight = highlights.find(
            ({ span, data }) =>
              (span[0] === highlight.span[1] + trimmedLength) &&
              (subtype === "" || (
                data.type && data.type.valueOf().startsWith(subtype)
              ))
          );
          break;
        }

        case "regExpr": {
          const regex = new RegExp(part.expr.source, "gim");

          const match = regex.exec(trimmedRemainingText);

          if (match) {
            const [matchString] = match;

            if (match.index !== 0) {
              return;
            }

            const from = highlight.span[1] + trimmedLength;
            const to = from + matchString.length;

            matchingHighlight = new Highlight(textDocument.id, "", [from, to], {});
          }
        }
      }

      if (matchingHighlight) {
        return Highlight.from({
          ...highlight,
          span: [highlight.span[0], matchingHighlight.span[1]],
          data: part.name
            ? {
              ...highlight.data,
              [part.name]: matchingHighlight,
            }
            : highlight.data,
        });
      }
    }
  }
}
