import { Text } from "@codemirror/state";
import classNames from "classnames";
import { isArray } from "lodash";
import { action, comparer, computed, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import {
  hoverHighlightsMobx,
  SheetConfig,
  sheetConfigsMobx,
  SheetValueRow,
  Span,
  TextDocument,
  textEditorStateMobx,
} from "./primitives";
import { doSpansOverlap } from "./utils";

let i = 1;
function ValueDisplay({ value, doc }: { value: any; doc: Text }) {
  if (value instanceof Error) {
    return <span className="text-red-500">#Err</span>;
  }

  if (value && value.span) {
    const text = doc.sliceString(value.span[0], value.span[1]);

    return <span className="bg-yellow-100 rounded">{text}</span>;
  }

  if (isArray(value)) {
    const lastIndex = value.length - 1;

    return (
      <span>
        {value.map((item, index) =>
          index === lastIndex ? (
            <ValueDisplay value={item} doc={doc} key={index} />
          ) : (
            <span key={index}>
              <ValueDisplay value={item} doc={doc} />
              <span className="text-gray-400">,</span>{" "}
            </span>
          )
        )}
      </span>
    );
  }

  return <span>{JSON.stringify(value)}</span>;
}

const SheetName = observer(({ sheetConfig }: { sheetConfig: SheetConfig }) => {
  return (
    <div>
      <input
        type="text"
        value={sheetConfig.name}
        onChange={action((e) => {
          sheetConfig.name = e.target.value;
        })}
        className="font-medium text-lg border-b border-gray-200 w-full mb-2 outline-none focus:border-gray-400"
      />
    </div>
  );
});

const textEditorSelectionSpanComputed = computed<Span>(() => {
  const selectionRange = textEditorStateMobx.get().selection.asSingle().main;
  return [selectionRange.from, selectionRange.to] as Span;
});

export const SheetComponent = observer(
  ({
    textDocument,
    sheetConfigId,
    rows,
  }: {
    textDocument: TextDocument;
    sheetConfigId: string;
    rows: SheetValueRow[];
  }) => {
    const doc = textDocument.text;
    const textDocumentSheet = textDocument.sheets.find(
      (sheet) => sheet.configId === sheetConfigId
    )!;

    const [selectedFormulaIndex, setSelectedFormulaIndex] = useState<number>(0);

    const sheetConfig = sheetConfigsMobx.get(sheetConfigId)!;
    const columns = sheetConfig.columns;

    const changeFormulaAt = action((changedIndex: number, formula: string) => {
      sheetConfig.columns = sheetConfig.columns.map((column, index) =>
        index === changedIndex ? { ...column, formula } : column
      );
    });

    const changeNameAt = action((changedIndex: number, name: string) => {
      sheetConfig.columns = sheetConfig.columns.map((column, index) =>
        index === changedIndex ? { ...column, name } : column
      );
    });

    const addColumn = action(() => {
      sheetConfig.columns.push({
        name: `col${++i}`,
        formula: "",
      });
      setSelectedFormulaIndex(columns.length - 1);
    });

    const hoverHighlights = computed(
      () =>
        rows.filter(
          (row) =>
            "span" in row &&
            row.span !== undefined &&
            doSpansOverlap(row.span, textEditorSelectionSpanComputed.get())
        ),
      { equals: comparer.shallow }
    ).get();

    return (
      <div className="flex flex-col gap-2 flex-1">
        <SheetName sheetConfig={sheetConfig} />
        <div className="text-sm text-gray-500">
          Highlighting in:{" "}
          {textDocumentSheet.highlightSearchRange === undefined
            ? "whole document"
            : `chars ${textDocumentSheet.highlightSearchRange[0]} to ${textDocumentSheet.highlightSearchRange[1]}`}
          <button
            className="ml-4"
            onClick={() =>
              runInAction(() => {
                textDocumentSheet.highlightSearchRange = undefined;
              })
            }
          >
            Clear
          </button>
          <button
            className="ml-4"
            onClick={() =>
              runInAction(() => {
                const editorState = textEditorStateMobx.get();
                const from = editorState.selection.main.from;
                const to = editorState.selection.main.to;
                if (from !== to) {
                  textDocumentSheet.highlightSearchRange = [from, to];
                }
              })
            }
          >
            Update
          </button>
        </div>
        {selectedFormulaIndex !== undefined && (
          <div className="flex mr-[30px]">
            <input
              className="pl-1 border border-gray-200"
              value={columns[selectedFormulaIndex].name}
              onChange={(evt) =>
                changeNameAt(selectedFormulaIndex, evt.target.value)
              }
            />
            <span>&nbsp;=&nbsp;</span>
            <input
              className="pl-1 border border-gray-200 flex-1"
              value={columns[selectedFormulaIndex].formula}
              onChange={(evt) =>
                changeFormulaAt(selectedFormulaIndex, evt.target.value)
              }
            />
          </div>
        )}

        <table>
          <thead>
            <tr>
              {columns.map((column, index) => {
                return (
                  <th
                    key={index}
                    className={`text-left font-normal px-1 bg-gray-100 border ${
                      selectedFormulaIndex === index
                        ? "border-blue-300"
                        : "border-gray-200"
                    }`}
                    onClick={() => setSelectedFormulaIndex(index)}
                  >
                    {column.name}
                  </th>
                );
              })}
              <th className="w-[30px]">
                <button
                  className="icon icon-plus bg-gray-500"
                  onClick={() => addColumn()}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                onMouseEnter={action(() => {
                  if ("span" in row && row.span !== undefined) {
                    hoverHighlightsMobx.replace([row]);
                  }
                })}
                onMouseLeave={action(() => {
                  hoverHighlightsMobx.clear();
                })}
                className={classNames(
                  "hover:bg-blue-50",
                  hoverHighlights.includes(row) ? "bg-blue-100" : undefined
                )}
                key={index}
              >
                {columns.map((column, index) => {
                  const value: any = row.data[column.name];
                  return (
                    <td className="border border-gray-200 px-1" key={index}>
                      <ValueDisplay value={value} doc={doc} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
);
