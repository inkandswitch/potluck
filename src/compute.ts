import { computed, IComputedValue } from "mobx";
import { evaluateSheet, evaluateSheetConfigs } from "./formulas";
import {
  getSheetConfigsOfTextDocument,
  Highlight,
  SheetConfig,
  sheetConfigsMobx,
  SheetValueRow, TextDocument, TextDocumentSheet,
  textDocumentsMobx,
} from "./primitives";

const getComputedKey = (textDocumentId: string, sheetConfigId: string) =>
  `${textDocumentId}:${sheetConfigId}`;
const computedCache: Record<string, IComputedValue<SheetValueRow[]>> = {};

export function getComputedSheetValue(
  textDocumentId: string,
  sheetConfigId: string
): IComputedValue<SheetValueRow[]> {
  const key = getComputedKey(textDocumentId, sheetConfigId);
  if (computedCache[key] === undefined) {
    computedCache[key] = computed(() => {
      const textDocument = textDocumentsMobx.get(textDocumentId);
      const sheetConfig = sheetConfigsMobx.get(sheetConfigId);
      if (textDocument === undefined || sheetConfig === undefined) {
        return [];
      }
      return evaluateSheet(textDocument, sheetConfig);
    });
  }
  return computedCache[key];
}

// we cheat a little here, for the sheetConfigId we only eval the first column to avoid
// circular dependencies, this is necessary for the formula like NextValuesUntil(activity, HasType("workouts"))
// here we reference workouts in the workout table
export function getHighlightsUntilSheet(textDocument: TextDocument, sheetConfigId: string) {
  return computed(() => {
    let highlights: Highlight[] = []

    for (const sheet of textDocument.sheets) {
      if (sheet.configId === sheetConfigId) {
        return highlights.concat(
          evaluateSheet(textDocument, sheetConfigsMobx.get(sheet.configId)!, true)
            .filter((row: SheetValueRow) => "span" in row && row.span !== undefined) as Highlight[]
        )

      }

      highlights = highlights.concat(
        evaluateSheet(textDocument, sheetConfigsMobx.get(sheet.configId)!)
          .filter((row: SheetValueRow) => "span" in row && row.span !== undefined) as Highlight[]
      )
    }

    return highlights
  })
}
