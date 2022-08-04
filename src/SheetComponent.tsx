import { Text } from "@codemirror/state";
import classNames from "classnames";
import { isArray } from "lodash";
import { action, comparer, computed, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { FC, useEffect, useRef, useState } from "react";
import {
  hoverHighlightsMobx,
  isSheetExpandedMobx,
  PropertyDefinition,
  PropertyVisibility,
  SheetConfig,
  sheetConfigsMobx,
  SheetValueRow,
  SheetView,
  Span,
  TextDocument,
  TextDocumentSheet,
  textEditorStateMobx,
} from "./primitives";
import {
  doSpansOverlap,
  getTextForHighlight,
  isHighlightComponent,
  isNumericish,
  isValueRowHighlight,
  transformColumnFormula,
} from "./utils";
import { FORMULA_REFERENCE } from "./formulas";
import { SheetCalendar } from "./SheetCalendar";
import { HighlightHoverCard } from "./HighlightHoverCard";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  CookieIcon,
  DotsVerticalIcon,
  EyeClosedIcon,
  EyeNoneIcon,
  EyeOpenIcon,
  LetterCaseCapitalizeIcon,
  MixerVerticalIcon,
  PlusIcon,
  QuestionMarkCircledIcon,
  SectionIcon,
  TableIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { NutritionLabel } from "./NutritionLabel";
import * as Popover from "@radix-ui/react-popover";
import { EditorView, minimalSetup } from "codemirror";
import { bracketMatching, LanguageSupport } from "@codemirror/language";
import { javascriptLanguage } from "@codemirror/lang-javascript";
import { highlightSpecialChars, keymap, tooltips } from "@codemirror/view";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { IObservableArray } from "mobx/dist/internal";
import { getPatternExprGroupNames } from "./patterns";

let i = 1;

export type SheetViewProps = {
  textDocument: TextDocument;
  sheetConfig: SheetConfig;
  columns: PropertyDefinition[];
  rows: SheetValueRow[];
  rowsActiveInDoc: SheetValueRow[];
};

export function ValueDisplay({ value, doc }: { value: any; doc: Text }) {
  if (value instanceof Error) {
    return <span className="text-red-500 font-mono">#Err</span>;
  }

  if (isHighlightComponent(value)) {
    return <span className="font-mono">{value.render()}</span>;
  }

  if (isValueRowHighlight(value)) {
    const text = getTextForHighlight(value);

    return (
      <HighlightHoverCard highlight={value}>
        <span className="cm-highlight bg-white py-0.5 px-2 border border-gray-200 hover:bg-yellow-200 font-sans cursor-default rounded-md">
          {text}
        </span>
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

  return <span className="font-mono">{JSON.stringify(value)}</span>;
}

const SheetSettingsPopoverContent = observer(
  ({
    textDocument,
    textDocumentSheet,
    sheetConfig,
  }: {
    textDocument: TextDocument;
    textDocumentSheet: TextDocumentSheet;
    sheetConfig: SheetConfig;
  }) => {
    return (
      <div className="w-64 bg-white rounded shadow-xl text-sm overflow-hidden p-2">
        <div className="">
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
        </div>
        <div className="mt-2">
          <button
            className="flex items-center gap-1 text-red-400 hover:text-red-500"
            onClick={() => {
              runInAction(() => {
                (
                  textDocument.sheets as IObservableArray<TextDocumentSheet>
                ).remove(textDocumentSheet);
              });
            }}
          >
            <TrashIcon /> Delete sheet
          </button>
        </div>
      </div>
    );
  }
);

const SheetFormulaBar = observer(
  ({
    textDocument,
    textDocumentSheet,
    sheetConfig,
  }: {
    textDocument: TextDocument;
    textDocumentSheet: TextDocumentSheet;
    sheetConfig: SheetConfig;
  }) => {
    const isExpanded = isSheetExpandedMobx.get(textDocumentSheet.id);

    const toggleIsExpanded = action(() => {
      isSheetExpandedMobx.set(textDocumentSheet.id, !isExpanded);
    });

    const firstColumn = sheetConfig.properties[0];
    return (
      <div
        className={classNames(
          "bg-white flex items-center gap-2 pl-2 overflow-hidden",
          isExpanded ? "h-8 border-b border-gray-200" : "h-full"
        )}
      >
        <button className="flex" onClick={() => toggleIsExpanded()}>
          <span
            className={`icon icon-expandable bg-gray-500 ${
              isExpanded ? "is-expanded" : ""
            }`}
          />
        </button>
        <SearchFormulaInput
          value={firstColumn.formula}
          onChange={action((value) => {
            sheetConfig.properties = sheetConfig.properties.map(
              (column, index) =>
                index === 0 ? { ...column, formula: value } : column
            );
          })}
        />
      </div>
    );
  }
);

function FormulaReferenceButton({ className }: { className?: string }) {
  return (
    <Popover.Root>
      <Popover.Anchor asChild={true}>
        <Popover.Trigger asChild={true}>
          <button
            className={classNames(
              "flex flex-shrink-0 items-center justify-center text-gray-400 hover:text-gray-600",
              className
            )}
          >
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

function useFormulaInput(
  rootRef: React.MutableRefObject<HTMLDivElement | null>,
  value: string,
  onChange: (value: string) => void,
  cmContentTheme: any,
  useLineWrapping = false
): React.MutableRefObject<EditorView | undefined> {
  const viewRef = useRef<EditorView | undefined>(undefined);
  const valueRef = useRef(value);

  useEffect(() => {
    const view = new EditorView({
      doc: value,
      extensions: [
        minimalSetup,
        EditorView.theme({
          ".cm-content": cmContentTheme,
          ".cm-completionIcon": {
            width: "1em",
          },
          ".cm-completionLabel": {
            fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
            fontSize: "12px",
          },
          ".cm-completionInfo": {
            fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
            fontSize: "12px",
          },
        }),
        highlightSpecialChars(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        tooltips({ parent: document.body }),
        useLineWrapping ? [EditorView.lineWrapping] : [],
        new LanguageSupport(javascriptLanguage, [
          javascriptLanguage.data.of({
            autocomplete: FORMULA_REFERENCE.map(
              ({ name, args, return: returnType }) => ({
                label: name,
                type: "function",
                info: `(${args.join(", ")}) => ${returnType}`,
              })
            ),
          }),
        ]),
        keymap.of([...closeBracketsKeymap]),
      ],
      parent: rootRef.current!,
      dispatch(transaction) {
        view.update([transaction]);
        if (transaction.docChanged) {
          const value = transaction.state.doc.toString();
          valueRef.current = value;
          onChange(value);
        }
      },
    });
    viewRef.current = view;
    return () => {
      view.destroy();
    };
  }, []);

  useEffect(() => {
    if (valueRef.current !== value) {
      const view = viewRef.current!;
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: value,
        },
      });
    }
  }, [value]);
  return viewRef;
}

function SearchFormulaInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useFormulaInput(rootRef, value, onChange, {
    fontSize: "14px",
    fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
  });
  return <div className="grow overflow-auto" ref={rootRef}></div>;
}

function FormulaInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useFormulaInput(
    rootRef,
    value,
    onChange,
    {
      padding: "4px 4px 4px 20px",
      fontSize: "12px",
      fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
      minHeight: "48px",
      maxHeight: "96px",
    },
    true
  );
  useEffect(() => {
    editorViewRef.current?.focus();
  }, []);
  return (
    <div className="relative">
      <div
        className="border-2 border-blue-500 overflow-auto rounded-t"
        ref={rootRef}
      ></div>
      <div className="absolute top-0 left-0 px-1 py-0.5 bg-blue-500 text-white text-sm italic rounded-br">
        fx
      </div>
    </div>
  );
}

const SheetColumnSettingsPopoverContent = observer(
  ({
    sheetConfig,
    columnIndex,
    column,
  }: {
    sheetConfig: SheetConfig;
    columnIndex: number;
    column: PropertyDefinition;
  }) => {
    const changeFormulaAt = action((changedIndex: number, formula: string) => {
      sheetConfig.properties = sheetConfig.properties.map((column, index) =>
        index === changedIndex ? { ...column, formula } : column
      );
    });

    const changeNameAt = action((changedIndex: number, name: string) => {
      sheetConfig.properties = sheetConfig.properties.map((column, index) =>
        index === changedIndex ? { ...column, name } : column
      );
    });

    const readableNamesForPropertyVisibility: {
      [key in PropertyVisibility]: string;
    } = {
      [PropertyVisibility.Hidden]: "Hidden",
      [PropertyVisibility.Inline]: "Next to text",
      [PropertyVisibility.Superscript]: "Above text",
      [PropertyVisibility.Replace]: "Replace text",
      [PropertyVisibility.Style]: "Apply CSS style",
    };

    return (
      <div className="w-80 bg-white rounded shadow-xl text-sm overflow-hidden">
        <div className="relative">
          <FormulaInput
            value={column.formula}
            onChange={(value) => {
              changeFormulaAt(columnIndex, value);
            }}
          />
          <FormulaReferenceButton className="absolute bottom-1 left-1" />
        </div>
        <div className="p-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <LetterCaseCapitalizeIcon className="inline" />
            Name
            <input
              className="block grow pl-1 py-0.5 self-stretch bg-orange-50 border border-orange-100 text-orange-500 font-medium rounded-sm"
              value={column.name}
              onChange={(evt) => changeNameAt(columnIndex, evt.target.value)}
            />
          </div>
          <div className="flex items-center mb-2">
            <div>
              {column.visibility === PropertyVisibility.Hidden ? (
                <EyeClosedIcon className="inline text-gray-500" />
              ) : (
                <EyeOpenIcon className="inline text-gray-500" />
              )}{" "}
              Display in document:
            </div>
            <select
              value={column.visibility}
              onChange={action(
                (e) =>
                  (column.visibility = e.target.value as PropertyVisibility)
              )}
              className="text-blue-500"
            >
              {Object.values(PropertyVisibility).map((value, i) => (
                <option value={value} key={i}>
                  {readableNamesForPropertyVisibility[value]}
                </option>
              ))}
            </select>
          </div>
          {/* We put the delete button inside the Radix close button so the popover closes upon deleting a*/}
          <Popover.Close
            className="text-gray-400 text-xs hover:text-gray-800 p-1"
            onClick={() => {
              runInAction(() => {
                (
                  sheetConfig.properties as IObservableArray<PropertyDefinition>
                ).remove(column);
              });
            }}
          >
            <TrashIcon className="inline" /> Delete property
          </Popover.Close>
        </div>
      </div>
    );
  }
);

export const SheetTable = observer(
  ({
    textDocument,
    sheetConfig,
    columns,
    rows,
    rowsActiveInDoc,
  }: SheetViewProps) => {
    const [sortBy, setSortBy] = useState<
      { columnName: string; direction: "asc" | "desc" } | undefined
    >(undefined);

    const [didJustAddColumn, setDidJustAddColumn] = useState(false);
    const addColumn = action(() => {
      sheetConfig.properties.push({
        name: `col${++i}`,
        formula: "",
        visibility: PropertyVisibility.Hidden,
      });
      setDidJustAddColumn(true);
    });
    useEffect(() => {
      setDidJustAddColumn(false);
    }, [didJustAddColumn]);

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

    const headFormula = transformColumnFormula(columns[0].formula, true);
    const groupNames = getPatternExprGroupNames(headFormula);

    const groupColumnsOffset = groupNames.length;

    const columnsWithPatternGroups = columns
      .slice(0, 1)
      .concat(
        groupNames.map((name) => ({
          name,
          isPatternGroup: true,
          formula: "",
          visibility: PropertyVisibility.Hidden,
        }))
      )
      .concat(columns.slice(1));

    return (
      <>
        <div className="max-h-[250px] overflow-auto relative w-full flex text-sm">
          <table className="flex-1">
            <thead>
              <tr
                className="sticky h-[31px] top-0 bg-gray-100"
                style={{ zIndex: 1 }}
              >
                {columnsWithPatternGroups.map((column, index) => {
                  const isEditable = index !== 0 && !column.isPatternGroup;

                  return (
                    <th
                      key={index}
                      className={classNames(
                        "border-b border-r border-gray-200 text-left font-normal pl-1.5",
                        index !== 0 ? "border-l" : undefined
                      )}
                    >
                      <div className="flex gap-1 pr-1 items-center justify-between">
                        <div
                          className={classNames(
                            "px-1 rounded-sm font-medium text-xs border",
                            isEditable
                              ? "bg-orange-100 text-orange-500 border-orange-200"
                              : "bg-indigo-100 text-indigo-500 border-indigo-200"
                          )}
                        >
                          {column.name}
                        </div>
                        {isEditable ? (
                          <>
                            <Popover.Root
                              defaultOpen={
                                didJustAddColumn &&
                                index === columnsWithPatternGroups.length - 1
                              }
                              modal={true}
                            >
                              <Popover.Anchor asChild={true}>
                                <Popover.Trigger asChild={true}>
                                  <button className="text-gray-400 hover:text-gray-500">
                                    <MixerVerticalIcon />
                                  </button>
                                </Popover.Trigger>
                              </Popover.Anchor>
                              <Popover.Content
                                side="top"
                                sideOffset={8}
                                align="end"
                                alignOffset={-8}
                              >
                                <SheetColumnSettingsPopoverContent
                                  sheetConfig={sheetConfig}
                                  columnIndex={index - groupColumnsOffset}
                                  column={column}
                                />
                              </Popover.Content>
                            </Popover.Root>
                            <div className="hidden">
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
                          </>
                        ) : null}
                      </div>
                    </th>
                  );
                })}
                <th className="bg-gray-50 w-[28px]">
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
                    rowsActiveInDoc.includes(row) ? "bg-blue-100" : "bg-gray-50"
                  )}
                  key={rowIndex}
                >
                  {columnsWithPatternGroups.map((column, colIndex) => {
                    const value: any = row.data[column.name];

                    return (
                      <td
                        className={classNames(
                          "border border-gray-200 px-1 py-1 relative",
                          colIndex === 0 ? "border-l-transparent" : undefined,
                          rowIndex === sortedRows.length - 1
                            ? "border-b-transparent"
                            : undefined
                        )}
                        key={colIndex}
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
    const columns = sheetConfig.properties;

    const isExpanded = isSheetExpandedMobx.get(id);

    const SheetViewComponent: FC<SheetViewProps> = {
      [SheetView.Table]: SheetTable,
      [SheetView.Calendar]: SheetCalendar,
      [SheetView.NutritionLabel]: NutritionLabel,
    }[sheetView]!;

    const canRenderAsCalendar = sheetConfig.properties.some(
      (column) => column.name === "date"
    );
    const canRenderAsNutritionLabel = sheetConfig.name === "ingredients";

    const rowsActiveInDoc = computed(
      () =>
        rows.filter(
          (row) =>
            isValueRowHighlight(row) &&
            doSpansOverlap(row.span, textEditorSelectionSpanComputed.get())
        ),
      { equals: comparer.shallow }
    ).get();

    return (
      <div>
        <div className="pl-8 flex items-center justify-between mb-2">
          <input
            type="text"
            value={sheetConfig.name}
            onChange={action((e) => {
              sheetConfig.name = e.target.value;
            })}
            className="text-xs font-semibold outline-none bg-transparent text-gray-500 focus:text-gray-600"
          />
          {isExpanded && (canRenderAsCalendar || canRenderAsNutritionLabel) ? (
            <div className="flex gap-2 pr-1">
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
                <TableIcon />
              </button>
              {canRenderAsCalendar ? (
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
                  <CalendarIcon />
                </button>
              ) : null}
              {canRenderAsNutritionLabel ? (
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
                  <CookieIcon />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex">
          <div className="w-8 flex-shrink-0">
            <div
              className={classNames(
                "rounded-tl bg-gray-100 h-[33px] border-l border-y border-gray-200",
                !isExpanded ? "rounded-bl" : undefined
              )}
            >
              <button
                className="text-gray-400 hover:text-gray-500 flex w-full h-full items-center justify-center"
                onClick={() => {
                  runInAction(
                    () =>
                      (textDocumentSheet.hideHighlightsInDocument =
                        !textDocumentSheet.hideHighlightsInDocument)
                  );
                }}
              >
                {textDocumentSheet.hideHighlightsInDocument ? (
                  <EyeNoneIcon />
                ) : (
                  <EyeOpenIcon />
                )}
              </button>
            </div>
            {isExpanded ? (
              <div className="rounded-bl bg-gray-100 h-[31px] border-b border-l border-gray-200">
                <Popover.Root modal={true}>
                  <Popover.Anchor asChild={true}>
                    <Popover.Trigger asChild={true}>
                      <button className="text-gray-400 hover:text-gray-600 flex w-full h-full items-center justify-center">
                        <DotsVerticalIcon />
                      </button>
                    </Popover.Trigger>
                  </Popover.Anchor>
                  <Popover.Portal>
                    <Popover.Content side="bottom" sideOffset={4} align="start">
                      <SheetSettingsPopoverContent
                        textDocument={textDocument}
                        textDocumentSheet={textDocumentSheet}
                        sheetConfig={sheetConfig}
                      />
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </div>
            ) : null}
          </div>
          <div
            className={classNames(
              "flex flex-col flex-1 bg-gray-50 border border-gray-200 rounded-r overflow-hidden",
              isExpanded ? "rounded-bl" : undefined
            )}
          >
            <SheetFormulaBar
              textDocument={textDocument}
              textDocumentSheet={textDocumentSheet}
              sheetConfig={sheetConfig}
            />

            {isExpanded && (
              <SheetViewComponent
                textDocument={textDocument}
                sheetConfig={sheetConfig}
                columns={columns}
                rows={rows}
                rowsActiveInDoc={rowsActiveInDoc}
              />
            )}
          </div>
        </div>
        <div
          className={classNames(
            "text-xs whitespace-nowrap mt-1 ml-8",
            rowsActiveInDoc.length > 0 ? "text-blue-500" : "text-gray-400"
          )}
        >
          {rows.length} result{rows.length !== 1 ? "s" : ""}
        </div>
      </div>
    );
  }
);
