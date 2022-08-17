import { computed, IObservableValue, observable, runInAction } from "mobx";
import { EditorState, Text } from "@codemirror/state";
import { generateNanoid } from "./utils";
import { evaluateFormula } from "./formulas";
import { getStateFromFiles } from "./persistence";
import { DefaultFiles } from "./DefaultState";
import { EditorView } from "@codemirror/view";
import { Highlight } from "./highlight";

export type Span = [from: number, to: number];

export type SheetValueRowWithoutSpan = {
  documentId: string;
  sheetConfigId: string;
  data: { [columnName: string]: any };
};
export type SheetValueRow = Highlight | SheetValueRowWithoutSpan;

export enum PropertyVisibility {
  Hidden = "HIDDEN",
  Inline = "INLINE",
  Superscript = "SUPERSCRIPT",
  Replace = "REPLACE",
  Style = "STYLE",
}

export type PropertyDefinition = {
  name: string;
  formula: string;
  isPatternGroup?: boolean;
  visibility: PropertyVisibility;
};

export type SheetConfig = {
  id: string;
  name: string;
  properties: PropertyDefinition[];
};

export enum SheetView {
  Table,
  Calendar,
  NutritionLabel,
}

export type TextDocumentSheet = {
  id: string;
  configId: string;
  groupName?: string;
  highlightSearchRange?: Span;
  hideHighlightsInDocument?: boolean;
};

export type TextDocument = {
  id: string;
  name: string;
  text: Text;
  sheets: TextDocumentSheet[];
};

export interface HighlightComponent {
  render: () => React.ReactNode;
  destroy: () => void;
}

export type HighlightComponentEntry = {
  documentId: string;
  componentType: string;
  span: Span;
  text: string;
  component: HighlightComponent;
};

export const highlightComponentEntriesMobx =
  observable.array<HighlightComponentEntry>([]);

export function getSheetConfigsOfTextDocument(textDocument: TextDocument) {
  return textDocument.sheets
    .map((textDocumentSheet) =>
      sheetConfigsMobx.get(textDocumentSheet.configId)
    )
    .filter((sheetConfig) => sheetConfig !== undefined) as SheetConfig[];
}

export const textEditorStateMobx = observable.box(
  EditorState.create({ doc: "" })
);

export const textEditorViewMobx = observable.box<EditorView>();

const defaultState = getStateFromFiles(DefaultFiles);
export const textDocumentsMobx = observable.map<string, TextDocument>(
  defaultState.textDocuments.map((textDocument) => [
    textDocument.id,
    textDocument,
  ])
);
let nextSheetIndex = 1;
export const sheetConfigsMobx = observable.map<string, SheetConfig>(
  defaultState.sheetConfigs.map((sheetConfig) => [sheetConfig.id, sheetConfig])
);

export function addSheetConfig(config?: {
  name?: string;
  properties: PropertyDefinition[];
}) {
  const id = generateNanoid();
  const defaultConfig = {
    id,
    name: `sheet${nextSheetIndex++}`,
    properties: [
      { name: "col1", formula: "", visibility: PropertyVisibility.Hidden },
    ],
  };

  const sheetConfig: SheetConfig = config
    ? { ...defaultConfig, ...config }
    : defaultConfig;
  runInAction(() => {
    sheetConfigsMobx.set(id, sheetConfig);
  });
  return sheetConfig;
}

export const selectedTextDocumentIdBox = observable.box("welcome");

type SearchBoxState = {
  search: string;
  selectedSearchIndex: number;
};

export const searchTermBox: IObservableValue<SearchBoxState> =
  observable.box<SearchBoxState>({
    search: "",
    selectedSearchIndex: 0,
  });

type PendingSearch =
  | { _type: "saved"; sheetConfig: SheetConfig }
  | { _type: "new"; search: string }
  | { _type: "document"; documentId: string };

export const GROUP_NAME_PREFIX = "group:";

/** Get all the pending searches to suggest for a given string entered into the searchbox */
export function getPendingSearches(search: string): PendingSearch[] {
  let newSearches: PendingSearch[];
  newSearches = [{ _type: "new", search }];

  return [
    ...newSearches,
    ...getMatchingSheetConfigs(search).map((sheetConfig) => ({
      _type: "saved" as const,
      sheetConfig,
    })),
    ...getMatchingDocuments(search).map((textDocument) => ({
      _type: "document" as const,
      documentId: textDocument.id,
    })),
  ];
}

export function getMatchingSheetConfigs(search: string): SheetConfig[] {
  return Array.from(sheetConfigsMobx.values()).filter((sheetConfig) =>
    sheetConfig.name.toLowerCase().includes(search.toLowerCase())
  );
}

export function getMatchingDocuments(search: string): TextDocument[] {
  return Array.from(textDocumentsMobx.values()).filter((textDocument) =>
    textDocument.name.toLowerCase().includes(search.toLowerCase())
  );
}

export const pendingSearchesComputed = computed<PendingSearch[]>(() => {
  const search = searchTermBox.get().search;
  return getPendingSearches(search);
});

export const selectedPendingSearchComputed = computed<
  PendingSearch | undefined
>(() => {
  if (isSearchBoxFocused.get() === false) {
    return undefined;
  }
  const pendingSearches = pendingSearchesComputed.get();
  const selectedSearchIndex = searchTermBox.get().selectedSearchIndex;
  return pendingSearches[selectedSearchIndex];
});

export const savePendingSearchToSheet = (
  pendingSearch: PendingSearch,
  textDocument: TextDocument
) => {
  runInAction(() => {
    if (pendingSearch._type === "new") {
      const sheetConfigId = generateNanoid();
      const sheetConfig: SheetConfig = {
        id: sheetConfigId,
        name: pendingSearch.search,
        properties: [
          {
            name: "$",
            formula: pendingSearch.search,
            visibility: PropertyVisibility.Hidden,
          },
        ],
      };
      sheetConfigsMobx.set(sheetConfigId, sheetConfig);
      const textDocumentSheetId = generateNanoid();
      textDocument.sheets.unshift({
        id: textDocumentSheetId,
        configId: sheetConfigId,
      });
      isSheetExpandedMobx.set(textDocumentSheetId, true);
    } else if (pendingSearch._type === "saved") {
      const textDocumentSheetId = generateNanoid();
      textDocument.sheets.unshift({
        id: textDocumentSheetId,
        configId: pendingSearch.sheetConfig.id,
      });
      isSheetExpandedMobx.set(textDocumentSheetId, true);
    } else if (pendingSearch._type === "document") {
      const textDocumentToAdd = textDocumentsMobx.get(
        pendingSearch.documentId
      )!;
      for (const textDocumentSheet of textDocumentToAdd.sheets) {
        const textDocumentSheetId = generateNanoid();
        textDocument.sheets.unshift({
          id: textDocumentSheetId,
          configId: textDocumentSheet.configId,
          groupName: textDocumentToAdd.name,
        });
        isSheetExpandedMobx.set(
          `${GROUP_NAME_PREFIX}${textDocumentToAdd.name}`,
          false // hide details of a bundle by default
        );
      }
    }
  });
};

export const searchResults = computed<Highlight[]>(() => {
  const pendingSearch = selectedPendingSearchComputed.get();

  if (pendingSearch === undefined) {
    return [];
  }

  let formula: string | undefined;

  if (pendingSearch._type === "new") {
    formula = pendingSearch.search;
  } else if (pendingSearch._type === "saved") {
    formula = pendingSearch.sheetConfig.properties[0].formula;
  }

  if (formula === undefined) {
    return [];
  }

  const textDocument = textDocumentsMobx.get(selectedTextDocumentIdBox.get())!;

  let results: Highlight[] = [];
  try {
    results =
      evaluateFormula(textDocument, {} as SheetConfig, true, formula, {}) ?? [];
  } catch (e) {
    console.error(e);
    results = [];
  }
  return results;
});

export const hoverHighlightsMobx = observable.array<Highlight>([]);

export const isSheetExpandedMobx = observable.map<string, boolean>({});

export const showDocumentSidebarBox = observable.box(true);
export const showSearchPanelBox = observable.box(false);
export const isSearchBoxFocused = observable.box(false);
