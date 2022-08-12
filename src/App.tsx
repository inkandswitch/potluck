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
  Cross1Icon,
  HamburgerMenuIcon,
  MagnifyingGlassIcon,
  Pencil2Icon,
} from "@radix-ui/react-icons";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ToastViewport } from "@radix-ui/react-toast";
import { DocumentSidebar, PersistenceButton } from "./DocumentSidebar";
import { patternToString } from "./patterns";

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

const TextDocumentComponent = observer(
  ({ textDocumentId }: { textDocumentId: string }) => {
    const textDocument = textDocumentsMobx.get(textDocumentId)!;

    return (
      <div className="grow flex flex-col overflow-hidden">
        <TextDocumentName textDocument={textDocument} />
        <div className="grow pl-2 overflow-hidden">
          <Editor textDocumentId={textDocumentId} />
        </div>
      </div>
    );
  }
);

const DocumentSheets = observer(
  ({ textDocumentId }: { textDocumentId: string }) => {
    const textDocument = textDocumentsMobx.get(textDocumentId)!;
    const documentValueRows = getComputedDocumentValues(textDocumentId).get();
    return (
      <>
        <div className="flex flex-col gap-6">
          {textDocument.sheets.map((sheet) => {
            return (
              <SheetComponent
                id={sheet.id}
                textDocument={textDocument}
                sheetConfigId={sheet.configId}
                key={sheet.id}
                rows={documentValueRows[sheet.configId]}
              />
            );
          })}
        </div>
      </>
    );
  }
);

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
      runInAction(() => {
        if (e.key === "Enter") {
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
            <div className="max-h-36 overflow-y-scroll absolute top-9 w-full bg-white z-10 border border-gray-100 p-1 rounded-sm">
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
          {selectedPendingSearch !== undefined && (
            <div className="absolute top-2 right-2 bg-white z-10 text-gray-400 text-sm">
              {results.length} results
            </div>
          )}
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

          <button
            onClick={action(() => {
              const newDocumentId = generateNanoid();
              textDocumentsMobx.set(newDocumentId, {
                id: newDocumentId,
                name: "Untitled",
                text: Text.empty,
                sheets: [],
              });
              selectedTextDocumentIdBox.set(newDocumentId);
            })}
          >
            <Pencil2Icon className="text-gray-600" />
          </button>
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
