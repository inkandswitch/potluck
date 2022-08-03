import {
  Highlight,
  SheetConfig,
  sheetConfigsMobx,
  TextDocument,
  TextDocumentSheet,
  textDocumentsMobx
} from "./primitives";
import { groupBy, escapeRegExp } from "lodash";
import ohm from 'ohm-js';
import { getComputedDocumentValues, getComputedSheetValue } from "./compute";

const patternGrammar = ohm.grammar(String.raw`
  Pattern {
    Expr
      = Part*
  
    Part
      = MatchGroup | text
  
    MatchGroup
      = "{" (RegExpr |  HighlightName) (":" Name)? "}"
  
    Name
      = letter+
  
    HighlightName
      = letter+
  
    RegExpr
      = "/" regExprChar+ "/"
  
    regExprChar 
      = ~"/" any
  
    text 
      = textChar+
    
    textChar 
      = ~"{" any
  }
`)

const patternSemantics = patternGrammar.createSemantics()

patternSemantics.addOperation('toAst', {
  _iter (...items) {
    return items.map((item) => item.toAst())
  },

  // @ts-ignore
  _terminal () {
    return
  },

  // @ts-ignore
  text (value) {
    return { type: "text", text: value.sourceString }
  },

  // @ts-ignore
  MatchGroup (_, expr,  __, name, ___){
    return {
      type: "group",
      expr: expr.toAst(),
      name: name.toAst()[0]
    }
  },

  // @ts-ignore
  Name (name) {
    return name.sourceString
  },

  // @ts-ignore
  HighlightName (name) {
    return { type: "highlightName", name: name.sourceString }
  },

  // @ts-ignore
  RegExpr (_, source, __) {
    return { type: "regExpr", source: source.sourceString }
  }
})

export function parsePattern(source: string) : Pattern | undefined  {
  const result = patternGrammar.match(source)

  if (!result.succeeded()) {
    return
  }

  return patternSemantics(result).toAst() as Pattern
}

export type TextPart = {
  type: "text"
  text: string
}

export type GroupPart = {
  type: "group"
  name?: string
  expr: GroupExpr
}

export type GroupExpr = RegExpr | HighlightName

export type HighlightName = {
  type: "highlightName"
  name: string
}

export type RegExpr = {
  type: "regExpr"
  source: string
}

export type PatternPart = TextPart | GroupPart

export type Pattern = PatternPart[]

export type PartHighlight = Omit<Highlight, "sheetConfigId">

export function patternToString(pattern: Pattern) {
  let string = ""

  for (const part of pattern) {
    switch (part.type) {
      case "text":
        string += part.text
        break

      case "group":
        const expr = part.expr.type === 'regExpr' ? `/${part.expr.source}/` : part.expr.name

        string += (
          ("name" in part)
            ? `{${expr}:${part.name}}`
            : `{${expr}}`
        )
    }
  }

  return string
}

export function matchPatternInDocument(source: string, textDocument: TextDocument, sheetConfigId : string): Highlight[] {
  const pattern =  parsePattern(source)

  if (!pattern) {
    throw new Error("invalid pattern")
  }

  let highlights: PartHighlight[] = [];

  pattern.forEach((part, index) => {
    if (index === 0) {
      highlights = matchPart(part, textDocument)
    } else {
      highlights = (
        highlights
          .map((highlight) => matchPartAfterHighlight(part, highlight, textDocument))
          .filter((highlight) => highlight !== undefined) as Highlight[]
      )
    }
  });

  return highlights.map((highlight) => ({ ...highlight, sheetConfigId }))
}

function matchPart(part: PatternPart, textDocument: TextDocument): PartHighlight[] {
  switch (part.type) {

    case "text":
      return matchRegex(escapeRegExp(part.text), textDocument)

    case "group":
      return matchGroupPart(part, textDocument)

    default:
      return []
  }
}

function matchGroupPart({ expr, name }: GroupPart, textDocument: TextDocument): PartHighlight[] {
  let highlights: PartHighlight[] = []

  switch (expr.type) {
    case "highlightName": {
      const sheetConfig = Array.from(sheetConfigsMobx.values()).find((sheetConfig) => sheetConfig.name === expr.name)

      if (!sheetConfig) {
        return []
      }

      highlights = getComputedSheetValue(textDocument.id, sheetConfig.id).get() as Highlight[]
      break;
    }

    case "regExpr":
      highlights = matchRegex(expr.source, textDocument)
      break;
  }

  return highlights.map((higlight) => (
    name === undefined
      ? higlight
      : { ...higlight, data: { [name]: higlight } }
  ))
}

function matchRegex(source: string, textDocument: TextDocument): PartHighlight[] {
  const regex = new RegExp(source, "g");
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
      sheetConfigId: '',
      span: [from, to],
      data: {}
    });
  }

  return highlights;
}

function matchPartAfterHighlight(part: PatternPart, highlight: PartHighlight, textDocument: TextDocument): PartHighlight | undefined {
  switch (part.type) {
    case "text": {
      const followingText = textDocument.text.sliceString(highlight.span[1])
      const followingTextTrimmed = followingText.trimStart()

      if (!followingTextTrimmed.startsWith(part.text)) {
        return
      }

      const partSize = followingText.length - followingTextTrimmed.length + part.text.length
      return { ...highlight, span: [highlight.span[0], highlight.span[1] + partSize] }
    }

    case "group": {

      switch (part.expr.type) {
        case "highlightName":
          const sheetConfig = Array.from(sheetConfigsMobx.values()).find((sheetConfig) => sheetConfig.name === part.expr.name)


          if (!sheetConfig) {
            return
          }

          const highlights = getComputedSheetValue(textDocument.id, sheetConfig.id).get() as Highlight[]
          const nextHighlight = highlights.find(({ span }) => span[0] === highlight.span[1])

          if (!nextHighlight) {
            return
          }

          const partSize = nextHighlight.span[1] - nextHighlight.span[0]
          return { ...highlight, span: [highlight.span[0], highlight.span[1] + partSize] }


        case "regExpr":
          throw new Error('not implemented')

      }
    }
  }
}

