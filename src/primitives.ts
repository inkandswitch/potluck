import { computed, IObservableValue, observable, runInAction } from "mobx";
import { EditorState, Text } from "@codemirror/state";
import { generateNanoid } from "./utils";
import { evaluateFormula } from "./formulas";
import { getStateFromFiles } from "./persistence";
import { DefaultFiles } from "./DefaultState";

export type Span = [from: number, to: number];

// this is a row in a document sheet
export type Highlight = {
  documentId: string;
  sheetConfigId: string;
  span: Span;
  data: { [columnName: string]: any };
};
export type SheetValueRowWithoutSpan = Omit<Highlight, "span">;
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

export const selectedTextDocumentIdBox = observable.box(
  defaultState.textDocuments[1].id
);

type SearchBoxState = {
  search: string;
  mode: "regex" | "string";
  selectedSearchIndex: number | undefined;
};

export const searchTermBox: IObservableValue<SearchBoxState> =
  observable.box<SearchBoxState>({
    search: "",
    mode: "regex",
    selectedSearchIndex: undefined,
  });

type PendingSearch =
  | { _type: "saved"; sheetConfig: SheetConfig }
  | { _type: "new"; search: string; mode: "regex" | "string" };

/** Get all the pending searches to suggest for a given string entered into the searchbox */
export function getPendingSearches(
  search: string,
  mode: "regex" | "string"
): PendingSearch[] {
  let newSearches: PendingSearch[];
  if (search.length > 0) {
    newSearches = [{ _type: "new", search, mode }];
  } else {
    newSearches = [];
  }

  return [
    ...newSearches,
    ...getMatchingSheetConfigs(search).map((sheetConfig) => ({
      _type: "saved" as const,
      sheetConfig,
    })),
  ];
}

export function getMatchingSheetConfigs(search: string): SheetConfig[] {
  return Array.from(sheetConfigsMobx.values()).filter((sheetConfig) =>
    sheetConfig.name.toLowerCase().includes(search.toLowerCase())
  );
}

export const pendingSearchesComputed = computed<PendingSearch[]>(() => {
  const search = searchTermBox.get().search;
  const mode = searchTermBox.get().mode;
  return getPendingSearches(search, mode);
});

export const selectedPendingSearchComputed = computed<
  PendingSearch | undefined
>(() => {
  const pendingSearches = pendingSearchesComputed.get();
  const selectedSearchIndex = searchTermBox.get().selectedSearchIndex;
  if (selectedSearchIndex === undefined) {
    return undefined;
  }
  return pendingSearches[selectedSearchIndex];
});

export const savePendingSearchToSheet = (
  pendingSearch: PendingSearch,
  textDocument: TextDocument
) => {
  runInAction(() => {
    if (pendingSearch._type === "new") {
      const formula = getSearchFormula(
        pendingSearch.mode,
        pendingSearch.search
      );
      if (formula === undefined) {
        return;
      }
      const sheetConfigId = generateNanoid();
      const sheetConfig: SheetConfig = {
        id: sheetConfigId,
        name: pendingSearch.search,
        properties: [
          {
            name: "$",
            formula,
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
    } else {
      const textDocumentSheetId = generateNanoid();
      textDocument.sheets.unshift({
        id: textDocumentSheetId,
        configId: pendingSearch.sheetConfig.id,
      });
      isSheetExpandedMobx.set(textDocumentSheetId, true);
    }
  });
};

export function getSearchFormula(
  type: "regex" | "string",
  search: string
): string | undefined {
  if (search === "") {
    return;
  }

  return type === "regex"
    ? `MatchRegexp("${search}", "i")`
    : `MatchString("${search}")`;
}

export const searchResults = computed<Highlight[]>(() => {
  const pendingSearch = selectedPendingSearchComputed.get();

  if (pendingSearch === undefined) {
    return [];
  }

  let formula: string | undefined;

  if (pendingSearch._type === "new") {
    formula = getSearchFormula(pendingSearch.mode, pendingSearch.search);
  } else {
    formula = pendingSearch.sheetConfig.properties[0].formula;
  }

  if (formula === undefined) {
    return [];
  }

  const textDocument = textDocumentsMobx.get(selectedTextDocumentIdBox.get())!;

  let results: Highlight[] = [];
  try {
    results = evaluateFormula(
      textDocument,
      {} as SheetConfig,
      formula,
      {}
    ) as Highlight[];
  } catch (e) {
    console.error(e);
    results = [];
  }
  return results;
});

export const hoverHighlightsMobx = observable.array<Highlight>([]);

export const isSheetExpandedMobx = observable.map<string, boolean>({});

export const showDocumentSidebarBox = observable.box(false);
export const showSearchPanelBox = observable.box(true);
