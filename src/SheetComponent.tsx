import { Text } from "@codemirror/state";
import classNames from "classnames";
import { isArray } from "lodash";
import { action, comparer, computed, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import {
  Highlight,
  hoverHighlightsMobx,
  isSheetExpandedMobx,
  SheetConfig,
  sheetConfigsMobx,
  SheetValueRow,
  SheetView,
  Span,
  TextDocument,
  textEditorStateMobx,
} from "./primitives";
import { doSpansOverlap, isValueRowHighlight } from "./utils";
import { FormulaColumn } from "./formulas";
import { SheetCalendar } from "./SheetCalendar";
import { CalendarIcon, TableIcon } from "@radix-ui/react-icons";
import { HighlightHoverCard } from "./HighlightHoverCard";

let i = 1;

function ValueDisplay({ value, doc }: { value: any; doc: Text }) {
  if (value instanceof Error) {
    return <span className="text-red-500">#Err</span>;
  }

  if (isValueRowHighlight(value)) {
    const text = doc.sliceString(value.span[0], value.span[1]);

    return (
      <HighlightHoverCard highlight={value}>
        <span className="bg-yellow-100 rounded">{text}</span>
      </HighlightHoverCard>
    );
  }

  if (isArray(value)) {
    const lastIndex = value.length - 1;

    return (
      <span>
        <span className="text-gray-400">[</span>
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

        <span className="text-gray-400">]</span>
      </span>
    );
  }

  return <span>{JSON.stringify(value)}</span>;
}

const SheetName = observer(
  ({
    sheetConfig,
    rowsCount,
  }: {
    sheetConfig: SheetConfig;
    rowsCount: number;
  }) => {
    return (
      <div className="flex-1 flex border-gray-200 w-full mb-2  focus:border-gray-400">
        <input
          type="text"
          value={sheetConfig.name}
          onChange={action((e) => {
            sheetConfig.name = e.target.value;
          })}
          className="font-medium inline text-md border-b outline-none text-gray-600"
        />
        <div className="ml-2 py-1 px-2 rounded-lg bg-gray-50 text-sm text-gray-400">
          <span className="font-medium text-gray-500">{rowsCount}</span>{" "}
          highlights
        </div>
      </div>
    );
  }
);

const textEditorSelectionSpanComputed = computed<Span>(() => {
  const selectionRange = textEditorStateMobx.get().selection.asSingle().main;
  return [selectionRange.from, selectionRange.to] as Span;
});

export const SheetTable = observer(
  ({
    textDocument,
    sheetConfig,
    columns,
    rows,
  }: {
    textDocument: TextDocument;
    sheetConfig: SheetConfig;
    columns: FormulaColumn[];
    rows: SheetValueRow[];
  }) => {
    const [selectedFormulaIndex, setSelectedFormulaIndex] = useState<number|undefined>(undefined);
    const hoverHighlights = computed(
      () =>
        rows.filter(
          (row) =>
            isValueRowHighlight(row) &&
            doSpansOverlap(row.span, textEditorSelectionSpanComputed.get())
        ),
      { equals: comparer.shallow }
    ).get();

    const addColumn = action(() => {
      sheetConfig.columns.push({
        name: `col${++i}`,
        formula: "",
      });
      setSelectedFormulaIndex(columns.length - 1);
    });

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

    return (
      <>
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

        <div className="max-h-[250px] overflow-auto relative w-full flex border border-gray-200 ">

        <table className="flex-1">
          <thead>
            <tr className="sticky top-0 border" style={{outline: "1px solid  rgb(229 231 235)"}}>
              {columns.map((column, index) => {
                return (
                  <th
                    key={index}
                    className={`text-left font-normal px-1 border ${
                      selectedFormulaIndex === index
                        ? "bg-blue-100"
                        : "bg-gray-100"
                    }`}
                    onClick={() => setSelectedFormulaIndex(index)}
                  >
                    {column.name}
                  </th>
                );
              })}
              <th className="w-[30px] bg-white">
                <button
                  className="icon icon-plus bg-gray-500"
                  onClick={() => addColumn()}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                onMouseEnter={action(() => {
                  const childrenHighlights = Object.values(row.data).flatMap(
                    (columnData) =>
                      isValueRowHighlight(columnData) ? [columnData] : []
                  );
                  hoverHighlightsMobx.replace(
                    childrenHighlights.length > 0
                      ? childrenHighlights
                      : isValueRowHighlight(row)
                      ? [row]
                      : []
                  );
                })}
                onMouseLeave={action(() => {
                  hoverHighlightsMobx.clear();
                })}
                className={classNames(
                  "hover:bg-blue-50",
                  hoverHighlights.includes(row) ? "bg-blue-100" : undefined
                )}
                key={rowIndex}
              >
                {columns.map((column, index) => {
                  const value: any = row.data[column.name];

                  return (
                    <td className={`border border-gray-200 px-1 ${(rowIndex !== (rows.length - 1)) ? 'border-l-0' : 'border-l-0 border-b-0'}`} key={index}>
                      <ValueDisplay value={value} doc={textDocument.text} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </>
    );
  }
);

export const SheetComponent = observer(
  ({
    id,
    textDocument,
    sheetConfigId,
    rows,
  }: {
    id: string;
    textDocument: TextDocument;
    sheetConfigId: string;
    rows: SheetValueRow[];
  }) => {
    const [sheetView, setSheetView] = useState(SheetView.Table);

    const textDocumentSheet = textDocument.sheets.find(
      (sheet) => sheet.configId === sheetConfigId
    )!;

    const sheetConfig = sheetConfigsMobx.get(sheetConfigId)!;
    const columns = sheetConfig.columns;

    const isExpanded = isSheetExpandedMobx.get(id);

    const toggleIsExpanded = action(() => {
      isSheetExpandedMobx.set(id, !isExpanded);
    });

    return (
      <div className="flex flex-col gap-2 flex-1">
        <div className="flex gap-1">
          <button onClick={() => toggleIsExpanded()}>
            <span
              className={`icon icon-expandable bg-gray-500 ${
                isExpanded ? "is-expanded" : ""
              }`}
            />
          </button>

          <SheetName sheetConfig={sheetConfig} rowsCount={rows.length} />
        </div>

        {isExpanded && (
          <>
            <div className="flex justify-between">
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
              <div className="flex gap-2 pr-2">
                <button
                  onClick={() => {
                    setSheetView(SheetView.Table);
                  }}
                  className={classNames(
                    "transition",
                    sheetView !== SheetView.Table
                      ? "opacity-40 hover:opacity-100"
                      : undefined
                  )}
                >
                  <TableIcon />
                </button>
                {sheetConfig.columns.some(
                  (column) => column.name === "date"
                ) ? (
                  <button
                    onClick={() => {
                      setSheetView(SheetView.Calendar);
                    }}
                    className={classNames(
                      "transition",
                      sheetView !== SheetView.Calendar
                        ? "opacity-40 hover:opacity-100"
                        : undefined
                    )}
                  >
                    <CalendarIcon />
                  </button>
                ) : null}
              </div>
            </div>
            {sheetView === SheetView.Calendar ? (
              <SheetCalendar
                textDocument={textDocument}
                sheetConfig={sheetConfig}
                columns={columns}
                rows={rows}
              />
            ) : (
              <SheetTable
                textDocument={textDocument}
                sheetConfig={sheetConfig}
                columns={columns}
                rows={rows}
              />
            )}
          </>
        )}
      </div>
    );
  }
);
