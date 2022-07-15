import { observable, runInAction } from "mobx";
import { EditorState, Text } from "@codemirror/state";
import { nanoid } from "nanoid";
import { FormulaColumn } from "./formulas";

export type Span = [from: number, to: number];

export type Snippet = {
  span: Span;
  type: string;
};

export type SheetConfig = {
  id: string;
  name: string;
  columns: FormulaColumn[];
};

export type TextDocumentSheet = {
  id: string;
  configId: string;
};

export type TextDocument = {
  id: string;
  name: string;
  text: Text;
  sheets: TextDocumentSheet[];
};

const INITIAL_TEXT = `4/15 gym: run + plank
4/17 gym: elliptical + plank
4/20 gym: 
Squat 50 10x3
Dead 45 10x3
Bench 70 776

Next time: 

Maintain all weights, better form and intensity
Squad dead bench farmer lat

5/4 gym

Squat 50 10x3
Dead 50 10x3, 40 10x3
Pullups 2x3 in between (Next time 3x3)
Bench 70 10 8 3 (wrist problems, weight felt good)
`;

export const textEditorStateMobx = observable.box(
  EditorState.create({ doc: INITIAL_TEXT })
);

export const FIRST_TEXT_DOCUMENT_ID = "workout";
export const FIRST_SHEET_CONFIG_ID = nanoid();
export const textDocumentsMobx = observable.map<string, TextDocument>({
  [FIRST_TEXT_DOCUMENT_ID]: {
    id: FIRST_TEXT_DOCUMENT_ID,
    name: "workout",
    text: Text.of(INITIAL_TEXT.split("\n")),
    sheets: [
      {
        id: nanoid(),
        configId: FIRST_SHEET_CONFIG_ID,
      },
    ],
  },
});
let nextSheetIndex = 1;
export const sheetConfigsMobx = observable.map<string, SheetConfig>({
  [FIRST_SHEET_CONFIG_ID]: {
    id: FIRST_SHEET_CONFIG_ID,
    name: `sheet${nextSheetIndex++}`,
    columns: [{ name: "col1", formula: "" }],
  },
});
export function addSheetConfig() {
  const id = nanoid();
  const sheetConfig = {
    id,
    name: `sheet${nextSheetIndex++}`,
    columns: [{ name: "col1", formula: "" }],
  };
  runInAction(() => {
    sheetConfigsMobx.set(id, sheetConfig);
  });
  return sheetConfig;
}

export const selectedTextDocumentIdBox = observable.box(FIRST_TEXT_DOCUMENT_ID);
