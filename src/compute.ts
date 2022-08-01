import { comparer, computed, IComputedValue } from "mobx";
import { evaluateSheet } from "./formulas";
import {
  getSheetConfigsOfTextDocument,
  Highlight,
  selectedTextDocumentIdBox,
  SheetConfig,
  sheetConfigsMobx,
  SheetValueRow,
  TextDocument,
  TextDocumentSheet,
  textDocumentsMobx,
} from "./primitives";
import { isValueRowHighlight } from "./utils";

const getDocumentSheetKey = (textDocumentId: string, sheetConfigId: string) =>
  `${textDocumentId}:${sheetConfigId}`;
const documentSheetCache: Record<string, IComputedValue<SheetValueRow[]>> = {};

export function getComputedSheetValue(
  textDocumentId: string,
  sheetConfigId: string
): IComputedValue<SheetValueRow[]> {
  const key = getDocumentSheetKey(textDocumentId, sheetConfigId);
  if (documentSheetCache[key] === undefined) {
    documentSheetCache[key] = computed(() => {
      const textDocument = textDocumentsMobx.get(textDocumentId);
      const sheetConfig = sheetConfigsMobx.get(sheetConfigId);
      if (textDocument === undefined || sheetConfig === undefined) {
        return [];
      }
      return evaluateSheet(textDocument, sheetConfig);
    });
  }
  return documentSheetCache[key];
}

const documentValueCache: Record<
  string,
  IComputedValue<{ [sheetConfigId: string]: SheetValueRow[] }>
> = {};
export function getComputedDocumentValues(
  textDocumentId: string
): IComputedValue<{ [sheetConfigId: string]: SheetValueRow[] }> {
  if (documentValueCache[textDocumentId] === undefined) {
    documentValueCache[textDocumentId] = computed(() => {
      const textDocument = textDocumentsMobx.get(textDocumentId);
      if (textDocument === undefined) {
        return {};
      }
      const sheetConfigs = getSheetConfigsOfTextDocument(textDocument);
      return Object.fromEntries(
        sheetConfigs.map((sheetConfig) => [
          sheetConfig.id,
          getComputedSheetValue(textDocument.id, sheetConfig.id).get(),
        ])
      );
    });
  }
  return documentValueCache[textDocumentId];
}

export const editorSelectionHighlightsComputed = computed(
  () => {
    const textDocumentId = selectedTextDocumentIdBox.get();
    const textDocument = textDocumentsMobx.get(textDocumentId);
    if (textDocument === undefined) {
      return [];
    }
    const documentValueRows = getComputedDocumentValues(textDocumentId).get();
    return Object.entries(documentValueRows)
      .map(([sheetConfigId, sheetValueRows]) =>
        sheetValueRows.filter((r): r is Highlight => {
          const textDocumentSheet = textDocument.sheets.find(
            (sheet) => sheet.configId === sheetConfigId
          )!;
          if (textDocumentSheet.hideHighlightsInDocument) {
            return false;
          } else {
            return isValueRowHighlight(r);
          }
        })
      )
      .flat();
  },
  { equals: comparer.structural }
);

// we cheat a little here, for the sheetConfigId we only eval the first column to avoid
// circular dependencies, this is necessary for the formula like NextValuesUntil(activity, HasType("workouts"))
// here we reference workouts in the workout table
export function getHighlightsUntilSheet(
  textDocument: TextDocument,
  sheetConfigId: string
) {
  return computed(() => {
    let highlights: Highlight[] = [];

    for (const sheet of textDocument.sheets) {
      if (sheet.configId === sheetConfigId) {
        return highlights.concat(
          evaluateSheet(
            textDocument,
            sheetConfigsMobx.get(sheet.configId)!,
            true
          ).filter(
            (row: SheetValueRow) => "span" in row && row.span !== undefined
          ) as Highlight[]
        );
      }

      highlights = highlights.concat(
        evaluateSheet(
          textDocument,
          sheetConfigsMobx.get(sheet.configId)!
        ).filter(
          (row: SheetValueRow) => "span" in row && row.span !== undefined
        ) as Highlight[]
      );
    }

    return highlights;
  });
}
