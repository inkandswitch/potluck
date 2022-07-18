import { computed, IComputedValue } from "mobx";
import {
  Highlight,
  sheetConfigsMobx,
  SheetValueRow,
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
      return [];
    });
  }
  return computedCache[key];
}
