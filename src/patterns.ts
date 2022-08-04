import { Highlight, sheetConfigsMobx, TextDocument } from "./primitives";
import { escapeRegExp } from "lodash";
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
      = "{" (RegExpr |  HighlightName) (":" Name)? "}"
  
    Name
      = alnum+
  
    HighlightName
      = alnum+
  
    RegExpr
      = "/" regExprChar+ "/"
  
    regExprChar 
      = ~"/" any
  
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
  Formula(_, __, ___, expr, ____, _____) {
    return expr.toAst();
  },

  // @ts-ignore
  text(value) {
    return { type: "text", text: value.sourceString };
  },

  // @ts-ignore
  MatchGroup(_, expr, __, name, ___) {
    return {
      type: "group",
      expr: expr.toAst(),
      name: name.toAst()[0],
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

  pattern.forEach((part) => {
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

export type Pattern = PatternPart[];

export type PartHighlight = Omit<Highlight, "sheetConfigId">;

export function patternToString(pattern: Pattern) {
  let string = "";

  for (const part of pattern) {
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

  let highlights: PartHighlight[] = [];

  pattern.forEach((part, index) => {
    if (index === 0) {
      highlights = matchPart(part, textDocument);
    } else {
      highlights = highlights
        .map((highlight) =>
          matchPartAfterHighlight(part, highlight, textDocument)
        )
        .filter((highlight) => highlight !== undefined) as Highlight[];
    }
  });

  return highlights.map((highlight) => ({ ...highlight, sheetConfigId }));
}

function matchPart(
  part: PatternPart,
  textDocument: TextDocument
): PartHighlight[] {
  switch (part.type) {
    case "text":
      return matchRegex(escapeRegExp(part.text), textDocument);

    case "group":
      return matchGroupPart(part, textDocument);

    default:
      return [];
  }
}

function matchGroupPart(
  { expr, name }: GroupPart,
  textDocument: TextDocument
): PartHighlight[] {
  let highlights: PartHighlight[] = [];

  switch (expr.type) {
    case "highlightName": {
      const sheetConfig = Array.from(sheetConfigsMobx.values()).find(
        (sheetConfig) => sheetConfig.name === expr.name
      );

      if (!sheetConfig) {
        return [];
      }

      highlights = getComputedSheetValue(
        textDocument.id,
        sheetConfig.id
      ).get() as Highlight[];
      break;
    }

    case "regExpr":
      highlights = matchRegex(expr.source, textDocument);
      break;
  }

  return highlights.map((highlight) =>
    name === undefined
      ? { span: highlight.span, documentId: textDocument.id, data: {} }
      : { ...highlight, data: { [name]: highlight } }
  );
}

function matchRegex(
  source: string,
  textDocument: TextDocument
): PartHighlight[] {
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

    highlights.push({
      documentId: textDocument.id,
      sheetConfigId: "",
      span: [from, to],
      data: {},
    });
  }

  return highlights;
}

function matchPartAfterHighlight(
  part: PatternPart,
  highlight: PartHighlight,
  textDocument: TextDocument
): PartHighlight | undefined {
  switch (part.type) {
    case "text": {
      const followingText = textDocument.text.sliceString(highlight.span[1]);
      const followingTextTrimmed = followingText.trimStart();

      if (!followingTextTrimmed.startsWith(part.text)) {
        return;
      }

      const partSize =
        followingText.length - followingTextTrimmed.length + part.text.length;

      return {
        ...highlight,
        span: [highlight.span[0], highlight.span[1] + partSize],
      };
    }

    case "group": {
      let matchingHighlight: undefined | Omit<Highlight, "sheetConfigId"> =
        undefined;
      const remainingText = textDocument.text.sliceString(highlight.span[1]);
      const trimmedRemainingText = remainingText.trimStart();
      const trimmedLength = remainingText.length - trimmedRemainingText.length;

      switch (part.expr.type) {
        case "highlightName": {
          const sheetConfig = Array.from(sheetConfigsMobx.values()).find(
            (sheetConfig) =>
              sheetConfig.name === (part.expr as HighlightName).name
          );

          if (!sheetConfig) {
            return;
          }

          const highlights = getComputedSheetValue(
            textDocument.id,
            sheetConfig.id
          ).get() as Highlight[];

          matchingHighlight = highlights.find(
            ({ span }) => span[0] === highlight.span[1] + trimmedLength
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

            matchingHighlight = {
              documentId: textDocument.id,
              span: [from, to],
              data: {},
            };
          }
        }
      }

      if (matchingHighlight) {
        return {
          ...highlight,
          span: [highlight.span[0], matchingHighlight.span[1]],
          data: part.name
            ? {
                ...highlight.data,
                [part.name]: matchingHighlight,
              }
            : highlight.data,
        };
      }
    }
  }
}
