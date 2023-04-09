import { Editor, patternFromSelection } from "./Editor";
import {
  addSheetConfig,
  getSheetConfigsOfTextDocument,
  isSheetExpandedMobx,
  PropertyVisibility,
  searchResults,
  searchTermBox,
  selectedTextDocumentIdBox,
  SheetConfig,
  sheetConfigsMobx,
  TextDocument,
  textDocumentsMobx,
  getMatchingSheetConfigs,
  showSearchPanelBox,
  showDocumentSidebarBox,
  pendingSearchesComputed,
  savePendingSearchToSheet,
  selectedPendingSearchComputed,
  textEditorStateMobx,
  isSearchBoxFocused,
  TextDocumentSheet,
  SheetValueRow,
  GROUP_NAME_PREFIX,
  DEFAULT_SEARCHES_ID,
  copySheetsAcrossDocuments,
  PendingSearch,
  isLoadingGPTSearchBox,
} from "./primitives";
import { observer } from "mobx-react-lite";
import { KeyboardEventHandler, useEffect, useRef, useState } from "react";
import { SheetComponent, ValueDisplay } from "./SheetComponent";
import { action, runInAction } from "mobx";
import { Text } from "@codemirror/state";
import classNames from "classnames";
import { getComputedDocumentValues } from "./compute";
import { generateNanoid } from "./utils";
import { FileDropWrapper } from "./persistence";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Cross1Icon,
  HamburgerMenuIcon,
  MagnifyingGlassIcon,
  UploadIcon,
  DownloadIcon,
  Pencil2Icon,
} from "@radix-ui/react-icons";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ToastViewport } from "@radix-ui/react-toast";
import { DocumentSidebar, PersistenceButton } from "./DocumentSidebar";
import { patternToString } from "./patterns";
import { create, groupBy } from "lodash";
import fileDialog from "file-dialog";

const TextDocumentName = observer(
  ({ textDocument }: { textDocument: TextDocument }) => {
    return (
      <div className="pt-3">
        <input
          type="text"
          value={textDocument.name}
          onChange={action((e) => {
            textDocument.name = e.target.value;
          })}
          className="font-bold text-md pl-4 py-2 w-full outline-none"
        />
      </div>
    );
  }
);

export const TextDocumentComponent = observer(
  ({ textDocumentId }: { textDocumentId: string }) => {
    const textDocument = textDocumentsMobx.get(textDocumentId)!;

    return (
      <div className="grow flex flex-col overflow-hidden">
        <TextDocumentName textDocument={textDocument} />
        <div className="grow pl-2 overflow-hidden max-w-2xl">
          <Editor textDocumentId={textDocumentId} />
        </div>
      </div>
    );
  }
);

const SheetComponentGroup = observer(
  ({
    textDocument,
    documentValueRows,
    groupName,
    sheets,
  }: {
    textDocument: TextDocument;
    documentValueRows: { [sheetConfigId: string]: SheetValueRow[] };
    groupName: string;
    sheets: TextDocumentSheet[];
  }) => {
    const isExpanded = isSheetExpandedMobx.get(
      `${GROUP_NAME_PREFIX}${groupName}`
    );
    return (
      <div>
        <div className="flex items-center">
          <button
            onClick={action(() => {
              isSheetExpandedMobx.set(
                `${GROUP_NAME_PREFIX}${groupName}`,
                !isExpanded
              );
            })}
            className="flex items-center justify-center w-8 h-8 text-gray-400 hover:text-gray-600"
          >
            {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </button>
          <div className="text-gray-500 text-sm grow">
            <span className="font-semibold">{groupName}</span>
            {!isExpanded ? (
              <span className="ml-2 text-gray-400">
                {sheets.length} search{sheets.length !== 1 ? "es" : null}
              </span>
            ) : null}
          </div>
          {isExpanded ? (
            <button
              onClick={action(() => {
                for (const documentSheet of sheets) {
                  documentSheet.groupName = undefined;
                }
              })}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ungroup
            </button>
          ) : null}
        </div>
        {isExpanded ? (
          <div className="-mx-4 px-4 pt-2 pb-4 bg-gray-200 flex flex-col gap-4">
            {sheets.map((sheet) => {
              return (
                <SheetComponent
                  id={sheet.id}
                  textDocument={textDocument}
                  textDocumentSheetId={sheet.id}
                  rows={documentValueRows[sheet.configId]}
                  key={sheet.id}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }
);

const NO_GROUP_NAME = "nooooo_group";
const DocumentSheets = observer(
  ({ textDocumentId }: { textDocumentId: string }) => {
    const textDocument = textDocumentsMobx.get(textDocumentId)!;
    const documentValueRows = getComputedDocumentValues(textDocumentId).get();
    const groupedSheets = groupBy(
      textDocument.sheets,
      (sheet) => sheet.groupName ?? NO_GROUP_NAME
    );
    return (
      <>
        <div className="flex flex-col gap-6">
          {Object.keys(groupedSheets).map((groupName) =>
            groupName !== NO_GROUP_NAME ? (
              <SheetComponentGroup
                textDocument={textDocument}
                documentValueRows={documentValueRows}
                groupName={groupName}
                sheets={groupedSheets[groupName]}
                key={groupName}
              />
            ) : null
          )}
          {(groupedSheets[NO_GROUP_NAME] ?? []).map((sheet) => {
            return (
              <SheetComponent
                id={sheet.id}
                textDocument={textDocument}
                textDocumentSheetId={sheet.id}
                rows={documentValueRows[sheet.configId]}
                key={sheet.id}
              />
            );
          })}
        </div>
      </>
    );
  }
);

// adapted from: https://stackoverflow.com/questions/3665115/how-to-create-a-file-in-memory-for-user-to-download-but-not-through-server#18197341
function download(filename: string, text: string) {
  var element = document.createElement("a");
  element.setAttribute(
    "href",
    "data:text/plain;charset=utf-8," + encodeURIComponent(text)
  );
  element.setAttribute("download", filename);

  element.style.display = "none";
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}

type DocumentExport = {
  textDocument: TextDocument;
  sheetConfigs: SheetConfig[];
};

function generateExportForCurrentDocument(): DocumentExport | undefined {
  const id = selectedTextDocumentIdBox.get();
  const textDocument = textDocumentsMobx.get(id);

  if (!textDocument) {
    return;
  }

  const sheetConfigs: { [id: string]: SheetConfig } = {};

  if (textDocument?.sheets) {
    for (const sheet of textDocument.sheets) {
      const sheetConfig = sheetConfigsMobx.get(sheet.configId);

      if (sheetConfig) {
        sheetConfigs[sheet.configId] = sheetConfig;
      }
    }
  }

  return {
    textDocument,
    sheetConfigs: Object.values(sheetConfigs),
  };
}

export function loadDocumentExport(
  { sheetConfigs, textDocument }: any,
  selectDocument: boolean = false
) {
  runInAction(() => {
    sheetConfigs.forEach((sheetConfig: SheetConfig) => {
      sheetConfigsMobx.set(sheetConfig.id, sheetConfig);
    });

    textDocumentsMobx.set(textDocument.id, {
      ...textDocument,
      text: Text.of(textDocument.text),
    });

    if (selectDocument) {
      selectedTextDocumentIdBox.set(textDocument.id);
    }
  });
}

async function importDocumentsFromFile() {
  const files = await fileDialog();

  return Promise.all(
    Array.from(files).map((file, index) => {
      const isLast = index === files.length - 1;

      return file
        .text()
        .then((text) => {
          loadDocumentExport(eval(`(() => { return ${text} })()`));
        })
        .catch(() => {
          alert(`Could not read file ${file.name}`);
        });
    })
  );
}

const ExportButton = observer(() => {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild={true}>
        <button
          onClick={() => {
            const documentExport = generateExportForCurrentDocument();

            if (!documentExport) {
              alert("Failed to export document");
              return;
            }

            const name = `${
              documentExport.textDocument?.name || "document"
            }.json`;
            const content = JSON.stringify(documentExport, null, 2);

            download(name, content);
          }}
          className="text-gray-600 hover:text-gray-700"
        >
          <UploadIcon />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="text-xs bg-gray-700 text-white px-2 py-1 rounded">
          Export current document
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
});

const ImportButton = observer(() => {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild={true}>
        <button
          onClick={() => importDocumentsFromFile()}
          className="text-gray-600 hover:text-gray-700"
        >
          <DownloadIcon />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="text-xs bg-gray-700 text-white px-2 py-1 rounded">
          Import document
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
});

const SearchButton = observer(() => {
  const isShowingSearchPanelBox = showSearchPanelBox.get();

  return (
    <>
      {!isShowingSearchPanelBox && (
        <Tooltip.Root>
          <Tooltip.Trigger asChild={true}>
            <button
              onClick={action(() => {
                showSearchPanelBox.set(!isShowingSearchPanelBox);
              })}
              className="text-gray-600 hover:text-gray-700"
            >
              <MagnifyingGlassIcon />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className="text-xs bg-gray-700 text-white px-2 py-1 rounded">
              ⌘ <span className="text-gray-500">+</span> ⇧{" "}
              <span className="text-gray-500">+</span> F
              <Tooltip.Arrow className="fill-gray-700" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      )}
    </>
  );
});

const SearchBox = observer(
  ({
    textDocumentId,
    focusOnMountRef,
  }: {
    textDocumentId: string;
    focusOnMountRef: React.MutableRefObject<boolean>;
  }) => {
    const textDocument = textDocumentsMobx.get(textDocumentId)!;
    const searchState = searchTermBox.get();
    const searchBoxFocused = isSearchBoxFocused.get();
    const searchBoxRef = useRef<HTMLInputElement>(null);
    const results = searchResults.get();
    const selectedPendingSearch = selectedPendingSearchComputed.get();
    const isLoadingGPTSearch = isLoadingGPTSearchBox.get();

    const focusSearchBox = () => {
      if (searchState.search === "" || searchState.search === null) {
        const pattern = patternFromSelection(textEditorStateMobx.get()!);
        if (pattern !== undefined && pattern.parts.length > 0) {
          runInAction(() => {
            searchTermBox.set({
              ...searchState,
              search: patternToString(pattern),
            });
          });
        }
      }
      searchBoxRef.current!.focus();
    };

    useEffect(() => {
      if (focusOnMountRef.current) {
        focusOnMountRef.current = false;
        focusSearchBox();
      }
      function onKeyDown(e: KeyboardEvent) {
        if (e.metaKey && e.shiftKey && e.key === "f") {
          focusSearchBox();
        }
      }
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("keydown", onKeyDown);
      };
    }, []);

    const handleInputKeydown = (e: KeyboardEvent) => {
      runInAction(async () => {
        if (e.key === "Enter" && e.metaKey) {
          isLoadingGPTSearchBox.set(true);
          await new Promise((r) => setTimeout(r, 5000));
          isLoadingGPTSearchBox.set(false);

          const pendingSearch: PendingSearch = {
            _type: "new",
            search: "testing 123",
          };

          savePendingSearchToSheet(pendingSearch, textDocument);
          searchTermBox.get().search = "";
          searchBoxRef.current?.blur();
        }
        if (e.key === "Enter" && !e.metaKey) {
          if (selectedPendingSearch !== undefined) {
            savePendingSearchToSheet(selectedPendingSearch, textDocument);
          }
          searchTermBox.get().search = "";
          searchBoxRef.current?.blur();
        }
        if (e.key === "Escape") {
          searchBoxRef.current?.blur();
        }
        if (e.key === "ArrowUp") {
          if (
            searchState.selectedSearchIndex !== undefined &&
            searchState.selectedSearchIndex > 0
          ) {
            searchTermBox.set({
              ...searchState,
              selectedSearchIndex: searchState.selectedSearchIndex - 1,
            });
            e.preventDefault();
          }
        }
        if (e.key === "ArrowDown") {
          if (
            searchState.selectedSearchIndex !== undefined &&
            searchState.selectedSearchIndex <
              pendingSearchesComputed.get().length - 1
          ) {
            searchTermBox.set({
              ...searchState,
              selectedSearchIndex: searchState.selectedSearchIndex + 1,
            });
            e.preventDefault();
          }
        }
      });
    };

    return (
      <>
        <div className="mt-2 mb-8 relative">
          <div className="flex items-center gap-2 mb-2">
            <div className="grow relative">
              {/* Show a loading indicator over the input while GPT is loading, with a 50% opacity grey background */}
              {isLoadingGPTSearch && (
                <div className="absolute inset-0 bg-gray-200 opacity-50 flex items-center justify-center z-50">
                  <div className="opacity-100">⌛️ Loading...</div>
                </div>
              )}
              <input
                ref={searchBoxRef}
                className="border-gray-200 border rounded w-full py-1 px-1"
                type="text"
                placeholder="Search a new pattern, or add a saved search"
                value={searchState.search}
                onFocus={() => {
                  runInAction(() => {
                    isSearchBoxFocused.set(true);
                  });
                }}
                onBlur={() => {
                  runInAction(() => {
                    isSearchBoxFocused.set(false);
                  });
                }}
                // Add a new sheet reflecting the search term
                onKeyDown={
                  handleInputKeydown as unknown as KeyboardEventHandler<HTMLInputElement>
                }
                onChange={action((e) => {
                  searchTermBox.set({
                    ...searchState,
                    selectedSearchIndex: 0,
                    search: e.target.value,
                  });
                })}
              />
            </div>
          </div>
          {searchBoxFocused && (
            <div
              className="max-h-36 overflow-y-scroll absolute top-9 w-full bg-white border border-gray-100 p-1 rounded-sm"
              style={{ zIndex: 9999 }}
            >
              {pendingSearchesComputed.get().map((pendingSearch, index) => (
                <div
                  key={
                    pendingSearch._type === "saved"
                      ? pendingSearch.sheetConfig.id
                      : index
                  }
                  className={classNames(
                    "cursor-pointer rounded-sm px-2 py-1",
                    searchState.selectedSearchIndex === index && "bg-blue-100"
                  )}
                  onMouseOver={() => {
                    runInAction(() => {
                      searchTermBox.set({
                        ...searchState,
                        selectedSearchIndex: index,
                      });
                    });
                  }}
                  onMouseDown={(e) => {
                    runInAction(() => {
                      savePendingSearchToSheet(pendingSearch, textDocument);
                    });
                  }}
                >
                  {pendingSearch._type === "saved" ? (
                    <div className="text-sm flex">
                      <div className=" text-gray-400 mr-2 w-12 flex-shrink-0">
                        Saved
                      </div>
                      <div className="flex-shrink-0">
                        {pendingSearch.sheetConfig.name}
                      </div>
                      {searchState.selectedSearchIndex === index ? (
                        <div className="font-mono text-gray-400 text-sm ml-2 overflow-ellipsis overflow-hidden whitespace-nowrap">
                          {pendingSearch.sheetConfig.properties[0]?.formula}
                        </div>
                      ) : null}
                    </div>
                  ) : pendingSearch._type === "document" ? (
                    <div className="text-sm flex whitespace-nowrap">
                      <div className=" text-gray-400 mr-2 w-12 flex-shrink-0">
                        Doc
                      </div>
                      {(() => {
                        const document = textDocumentsMobx.get(
                          pendingSearch.documentId
                        )!;
                        return (
                          <>
                            <span className="font-medium">
                              {document.sheets.length} search
                              {document.sheets.length !== 1
                                ? "es"
                                : null} from {document.name}
                            </span>
                            {searchState.selectedSearchIndex === index ? (
                              <div className="font-mono text-gray-400 text-sm ml-2 overflow-ellipsis overflow-hidden whitespace-nowrap">
                                {document.sheets
                                  .map(
                                    (sheet) =>
                                      sheetConfigsMobx.get(sheet.configId)!.name
                                  )
                                  .join(", ")}
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="text-sm flex">
                      <div className=" text-gray-400 mr-2 w-12">New</div>{" "}
                      <div>
                        <span className="font-medium">
                          {pendingSearch.search}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {selectedPendingSearch !== undefined &&
          selectedPendingSearch._type !== "document" ? (
            <div className="absolute top-2 right-2 bg-white z-10 text-gray-400 text-sm">
              {results.length} result{results.length !== 1 ? "s" : null}
            </div>
          ) : null}
        </div>
      </>
    );
  }
);

const App = observer(() => {
  const textDocumentId = selectedTextDocumentIdBox.get();
  const showSearchPanel = showSearchPanelBox.get();
  const focusSearchOnMountRef = useRef(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey && e.shiftKey && e.key === "f") {
        if (!showSearchPanelBox.get()) {
          runInAction(() => {
            focusSearchOnMountRef.current = true;
            showSearchPanelBox.set(true);
          });
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const createNewDocument = action(() => {
    const newDocumentId = generateNanoid();

    const defaultSearchesDoc = textDocumentsMobx.get(DEFAULT_SEARCHES_ID)!;

    textDocumentsMobx.set(newDocumentId, {
      id: newDocumentId,
      name: "Untitled",
      text: Text.empty,
      sheets: [],
    });
    copySheetsAcrossDocuments(
      defaultSearchesDoc,
      textDocumentsMobx.get(newDocumentId)!
    );
    selectedTextDocumentIdBox.set(newDocumentId);
  });

  return (
    <FileDropWrapper className="h-screen flex">
      <DocumentSidebar />
      <div
        className={classNames(
          "flex flex-col overflow-hidden flex-shrink-0",
          showSearchPanel ? "w-2/5" : "grow"
        )}
      >
        <div className="flex flex-shrink-0 items-center h-12 border-b border-gray-200 px-4 gap-3">
          <button
            onClick={action(() => {
              showDocumentSidebarBox.set(!showDocumentSidebarBox.get());
            })}
          >
            <HamburgerMenuIcon className="text-gray-600" />
          </button>

          <button onClick={createNewDocument}>
            <Pencil2Icon className="text-gray-600" />
          </button>
          <ExportButton />
          <ImportButton />
          <div className="grow" />
          <PersistenceButton />
          <SearchButton />
        </div>
        <TextDocumentComponent
          textDocumentId={textDocumentId}
          key={textDocumentId}
        />
      </div>
      {showSearchPanel ? (
        <div className="border-l border-gray-200 bg-gray-100 grow h-full overflow-auto">
          <div className="flex items-center justify-between px-2 h-12 border-b border-gray-200 px-4">
            <div className="text-sm font-medium text-gray-400">Searches</div>
            <button
              onClick={action(() => {
                showSearchPanelBox.set(false);
              })}
              className="text-gray-400 hover:text-gray-600"
            >
              <Cross1Icon />
            </button>
          </div>
          <div className="p-4">
            <SearchBox
              textDocumentId={textDocumentId}
              focusOnMountRef={focusSearchOnMountRef}
            />
            <DocumentSheets textDocumentId={textDocumentId} />
          </div>
        </div>
      ) : null}
      <ToastViewport className="fixed top-4 right-4 flex flex-col gap-2" />
    </FileDropWrapper>
  );
});

export default App;
