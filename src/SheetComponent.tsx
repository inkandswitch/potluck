import { Text } from "@codemirror/state";
import classNames from "classnames";
import { isArray } from "lodash";
import { action, comparer, computed, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { FC, useState } from "react";
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
import {
  doSpansOverlap,
  getTextForHighlight,
  isNumericish,
  isValueRowHighlight,
} from "./utils";
import { FormulaColumn, FORMULA_REFERENCE } from "./formulas";
import { SheetCalendar } from "./SheetCalendar";
import { HighlightHoverCard } from "./HighlightHoverCard";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  PlusIcon,
  TableIcon,
  CookieIcon,
  SectionIcon,
  QuestionMarkCircledIcon,
} from "@radix-ui/react-icons";
import { NutritionLabel } from "./NutritionLabel";
import * as Popover from "@radix-ui/react-popover";

let i = 1;

export type SheetViewProps = {
  textDocument: TextDocument;
  sheetConfig: SheetConfig;
  columns: FormulaColumn[];
  rows: SheetValueRow[];
};

function ValueDisplay({ value, doc }: { value: any; doc: Text }) {
  if (value instanceof Error) {
    return <span className="text-red-500">#Err</span>;
  }

  if (isValueRowHighlight(value)) {
    const text = getTextForHighlight(value);

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
          <span className="font-medium text-gray-500">{rowsCount}</span> results
        </div>
      </div>
    );
  }
);

function FormulaReferenceButton() {
  return (
    <Popover.Root>
      <Popover.Anchor asChild={true}>
        <Popover.Trigger asChild={true}>
          <button className="flex flex-shrink-0 items-center justify-center w-7 text-gray-400 hover:text-gray-600">
            <QuestionMarkCircledIcon />
          </button>
        </Popover.Trigger>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="end"
          className="font-mono text-xs bg-gray-50 p-4 rounded shadow-lg overflow-auto max-h-[calc(100vh-256px)]"
        >
          <div className="uppercase mb-2">available formulas</div>
          <table>
            <tbody>
              {FORMULA_REFERENCE.map(({ name, args, return: returnType }) => (
                <tr className="border-t border-gray-200" key={name}>
                  <td className="py-1 pr-2">{name}</td>
                  <td className="text-gray-400 pr-2">
                    <span className="text-gray-400">(</span>
                    {args.join(", ")}
                    <span className="text-gray-400">)</span>
                  </td>
                  <td className="text-gray-400">{returnType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const textEditorSelectionSpanComputed = computed<Span>(() => {
  const selectionRange = textEditorStateMobx.get().selection.asSingle().main;
  return [selectionRange.from, selectionRange.to] as Span;
});

enum SortMethod {
  Date,
  Alphabetical,
  Numeric,
}

function compareColumnValues(
  a: SheetValueRow,
  b: SheetValueRow,
  columnName: string,
  sortMethod: SortMethod,
  direction: "asc" | "desc"
) {
  const aValue = isValueRowHighlight(a.data[columnName])
    ? getTextForHighlight(a.data[columnName])
    : a.data[columnName];
  const bValue = isValueRowHighlight(b.data[columnName])
    ? getTextForHighlight(b.data[columnName])
    : b.data[columnName];
  let rv = 0;
  if (aValue === undefined) {
    rv = bValue === undefined ? 0 : 1;
  } else if (bValue === undefined) {
    rv = -1;
  } else {
    switch (sortMethod) {
      case SortMethod.Date: {
        rv = new Date(aValue).getTime() - new Date(bValue).getTime();
        break;
      }
      case SortMethod.Numeric: {
        rv = parseFloat(aValue) - parseFloat(bValue);
        break;
      }
      case SortMethod.Alphabetical: {
        rv = String(aValue).localeCompare(bValue);
        break;
      }
    }
  }
  if (direction === "desc") {
    rv = -rv;
  }
  return rv === 0
    ? isValueRowHighlight(a) && isValueRowHighlight(b)
      ? a.span[0] - b.span[0]
      : 0
    : rv;
}

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
    const [sortBy, setSortBy] = useState<
      { columnName: string; direction: "asc" | "desc" } | undefined
    >(undefined);
    const [selectedFormulaIndex, setSelectedFormulaIndex] = useState<
      number | undefined
    >(undefined);
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

    let sortedRows = rows;
    if (sortedRows.length > 0 && sortBy !== undefined) {
      const { columnName, direction } = sortBy;
      const firstRow = sortedRows[0];
      const firstRowColumnValue = isValueRowHighlight(firstRow.data[columnName])
        ? getTextForHighlight(firstRow.data[columnName])
        : firstRow.data[columnName];
      const sortMethod =
        columnName === "date"
          ? SortMethod.Date
          : isNumericish(firstRowColumnValue)
          ? SortMethod.Numeric
          : SortMethod.Alphabetical;
      sortedRows = [...rows].sort((a, b) =>
        compareColumnValues(a, b, columnName, sortMethod, direction)
      );
    }

    return (
      <>
        {selectedFormulaIndex !== undefined && (
          <div className="flex">
            <input
              className="pl-1 w-1/4 border border-gray-200"
              value={columns[selectedFormulaIndex].name}
              onChange={(evt) =>
                changeNameAt(selectedFormulaIndex, evt.target.value)
              }
            />
            <span>&nbsp;=&nbsp;</span>
            <input
              className="pl-1 grow border border-gray-200"
              value={columns[selectedFormulaIndex].formula}
              onChange={(evt) =>
                changeFormulaAt(selectedFormulaIndex, evt.target.value)
              }
            />
            <FormulaReferenceButton />
          </div>
        )}

        <div className="max-h-[250px] overflow-auto relative w-full flex border border-gray-200 ">
          <table className="flex-1">
            <thead>
              <tr
                className="sticky top-0 border"
                style={{ outline: "1px solid  rgb(229 231 235)" }}
              >
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
                      <div className="flex justify-between">
                        {column.name}
                        <div className="flex">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                sortBy?.columnName === column.name &&
                                sortBy.direction === "asc"
                              ) {
                                setSortBy(undefined);
                              } else {
                                setSortBy({
                                  columnName: column.name,
                                  direction: "asc",
                                });
                              }
                            }}
                            className={classNames(
                              sortBy?.columnName === column.name &&
                                sortBy.direction === "asc"
                                ? "opacity-100"
                                : "opacity-20 hover:opacity-60"
                            )}
                          >
                            <ArrowDownIcon />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                sortBy?.columnName === column.name &&
                                sortBy.direction === "desc"
                              ) {
                                setSortBy(undefined);
                              } else {
                                setSortBy({
                                  columnName: column.name,
                                  direction: "desc",
                                });
                              }
                            }}
                            className={classNames(
                              sortBy?.columnName === column.name &&
                                sortBy.direction === "desc"
                                ? "opacity-100"
                                : "opacity-20 hover:opacity-60"
                            )}
                          >
                            <ArrowUpIcon />
                          </button>
                        </div>
                      </div>
                    </th>
                  );
                })}
                <th className="bg-white w-[28px]">
                  <button
                    onClick={() => addColumn()}
                    className="flex h-[25px] items-center justify-center w-full opacity-50 hover:opacity-100"
                  >
                    <PlusIcon />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, rowIndex) => (
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
                      <td
                        className={`border border-gray-200 px-1 ${
                          rowIndex !== rows.length - 1
                            ? "border-l-0"
                            : "border-l-0 border-b-0"
                        }`}
                        key={index}
                      >
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

    const sheetConfig = sheetConfigsMobx.get(sheetConfigId);
    if (sheetConfig === undefined) {
      return null;
    }
    const columns = sheetConfig.columns;

    const isExpanded = isSheetExpandedMobx.get(id);

    const toggleIsExpanded = action(() => {
      isSheetExpandedMobx.set(id, !isExpanded);
    });

    const SheetViewComponent: FC<SheetViewProps> = {
      [SheetView.Table]: SheetTable,
      [SheetView.Calendar]: SheetCalendar,
      [SheetView.NutritionLabel]: NutritionLabel,
    }[sheetView]!;

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
              <div></div>
              <div className="flex gap-2 pr-2">
                <button
                  onClick={() => {
                    setSheetView(SheetView.Table);
                  }}
                  className={classNames(
                    "transition text-sm",
                    sheetView !== SheetView.Table
                      ? "opacity-40 hover:opacity-100"
                      : undefined
                  )}
                >
                  <TableIcon className="inline" /> Table
                </button>
                {sheetConfig.columns.some(
                  (column) => column.name === "date"
                ) ? (
                  <button
                    onClick={() => {
                      setSheetView(SheetView.Calendar);
                    }}
                    className={classNames(
                      "transition text-sm",
                      sheetView !== SheetView.Calendar
                        ? "opacity-40 hover:opacity-100"
                        : undefined
                    )}
                  >
                    <CalendarIcon className="inline" /> Calendar
                  </button>
                ) : null}
                {sheetConfig.name === "ingredients" ? (
                  <button
                    onClick={() => {
                      setSheetView(SheetView.NutritionLabel);
                    }}
                    className={classNames(
                      "transition text-sm",
                      sheetView !== SheetView.NutritionLabel
                        ? "opacity-40 hover:opacity-100"
                        : undefined
                    )}
                  >
                    <CookieIcon className="inline" /> Nutrition
                  </button>
                ) : null}
              </div>
            </div>
            <SheetViewComponent
              textDocument={textDocument}
              sheetConfig={sheetConfig}
              columns={columns}
              rows={rows}
            />
            <div className="text-sm text-gray-500">
              <SectionIcon className="inline" /> Highlighting{" "}
              {textDocumentSheet.highlightSearchRange === undefined
                ? "whole document"
                : "limited range"}
              {textDocumentSheet.highlightSearchRange !== undefined && (
                <button
                  className="ml-4 underline"
                  onClick={() =>
                    runInAction(() => {
                      textDocumentSheet.highlightSearchRange = undefined;
                    })
                  }
                >
                  Clear
                </button>
              )}
              {textDocumentSheet.highlightSearchRange === undefined && (
                <button
                  className="ml-4 underline"
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
                  {textEditorStateMobx.get().selection.main.from !==
                    textEditorStateMobx.get().selection.main.to && (
                    <span>Limit range to selection</span>
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }
);
