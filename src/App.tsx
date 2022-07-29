import { Editor } from "./Editor";
import {
  addSheetConfig,
  getSheetConfigsOfTextDocument,
  Highlight,
  isSheetExpandedMobx,
  PropertyVisibility, getSearchFormula,
  searchResults,
  searchTermBox,
  selectedTextDocumentIdBox,
  SheetConfig,
  sheetConfigsMobx,
  TextDocument,
  textDocumentsMobx, getMatchingSavedSearches,
} from "./primitives";
import { observer } from "mobx-react-lite";
import { useRef, useState } from "react";
import { SheetComponent, ValueDisplay } from "./SheetComponent";
import { action, runInAction } from "mobx";
import { Text } from "@codemirror/state";
import classNames from "classnames";
import { getComputedDocumentValues } from "./compute";
import { generateNanoid } from "./utils";
import { DirectoryPersistence, FileDropWrapper } from "./persistence";
import { FileIcon, FileTextIcon, PauseIcon } from "@radix-ui/react-icons";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ToastViewport } from "@radix-ui/react-toast";
import { evaluateFormula } from "./formulas";

const NEW_OPTION_ID = "new";

const TextDocumentName = observer(
  ({ textDocument }: { textDocument: TextDocument }) => {
    return (
      <div>
        <input
          type="text"
          value={textDocument.name}
          onChange={action((e) => {
            textDocument.name = e.target.value;
          })}
          className="text-md border-b border-gray-100 w-full mb-4 pb-0.5 outline-none focus:border-gray-300"
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
        <div className="grow pb-4 overflow-hidden">
          <Editor textDocumentId={textDocumentId} />
        </div>
      </div>
    );
  }
);

const TextDocumentSelector = observer(() => {
  return (
    <div className="pt-4 pb-2">
      <select
        onChange={action((e) => {
          let newDocumentId = e.target.value;
          if (newDocumentId === NEW_OPTION_ID) {
            newDocumentId = generateNanoid();
            textDocumentsMobx.set(newDocumentId, {
              id: newDocumentId,
              name: "Untitled",
              text: Text.empty,
              sheets: [],
            });
          }
          selectedTextDocumentIdBox.set(newDocumentId);
        })}
        value={selectedTextDocumentIdBox.get()}
        className="border border-gray-200 rounded p-1"
      >
        {[...textDocumentsMobx.values()].map((textDocument) => (
          <option value={textDocument.id} key={textDocument.id}>
            {textDocument.name}
          </option>
        ))}
        <option value={NEW_OPTION_ID}>New text document</option>
      </select>
      <button
        className="ml-4 text-gray-400 hover:text-gray-600"
        onClick={() => {
          runInAction(() => {
            const currentDoc = textDocumentsMobx.get(
              selectedTextDocumentIdBox.get()
            )!;
            const newDocumentId = generateNanoid();
            textDocumentsMobx.set(newDocumentId, {
              id: newDocumentId,
              name: `Copy of ${currentDoc.name}`,
              text: Text.empty,
              sheets: currentDoc.sheets.map((sheet) => ({
                ...sheet,
                highlightSearchRange: undefined,
              })),
            });
            selectedTextDocumentIdBox.set(newDocumentId);
          });
        }}
      >
        <span className="text-xl">⎘</span> copy as template
      </button>
    </div>
  );
});

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

const PersistenceButton = observer(() => {
  const [directoryPersistence, setDirectoryPersistence] = useState<DirectoryPersistence | undefined>(undefined);
  return (
    <div className="absolute top-2 right-2 flex gap-2 bg-white bg-opacity-50 p-2 rounded">
      <Tooltip.Root>
        <Tooltip.Trigger asChild={true}>
          <button
            onClick={() => {
              if (directoryPersistence !== undefined) {
                directoryPersistence.destroy();
              }

              async function go() {
                const d = new DirectoryPersistence();
                await d.init();
                setDirectoryPersistence(d);
              }

              go();
            }}
            className="text-gray-400 hover:text-gray-700"
          >
            {directoryPersistence !== undefined ? (
              <FileTextIcon />
            ) : (
              <FileIcon />
            )}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="text-xs bg-gray-700 text-white px-2 py-1 rounded">
            {directoryPersistence !== undefined
              ? "syncing with filesystem"
              : "sync with filesystem"}
            <Tooltip.Arrow className="fill-gray-700" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      {directoryPersistence !== undefined ? (
        <Tooltip.Root>
          <Tooltip.Trigger asChild={true}>
            <button
              onClick={() => {
                if (directoryPersistence !== undefined) {
                  directoryPersistence.destroy();
                }
                setDirectoryPersistence(undefined);
              }}
              className="text-gray-400 hover:text-gray-700"
            >
              <PauseIcon />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className="text-xs bg-gray-700 text-white px-2 py-1 rounded">
              stop syncing
              <Tooltip.Arrow className="fill-gray-700" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ) : null}
    </div>
  );
});

const SearchBox = observer(({ textDocumentId }: { textDocumentId: string }) => {
  const textDocument = textDocumentsMobx.get(textDocumentId)!;
  const searchState = searchTermBox.get();
  const [searchBoxFocused, setSearchBoxFocused] = useState(false);
  const searchBoxRef = useRef<HTMLInputElement>(null);
  const results = searchResults.get();

  let matchingSavedSearches = searchState.mode === 'saved' && getMatchingSavedSearches(searchState.search)

  return (
    <>
      <div className="pb-2 flex gap-1">
        <button
          className={`px-1 rounded ${searchState.mode === 'new' ? "bg-blue-100" : ""}`}
          onClick={() => {
            if (searchState.mode !== 'new') {
              searchTermBox.set({
                mode: "new",
                search: searchState.search,
                type: "regex"
              })
            }

            searchBoxRef?.current?.focus()
          }}
        >
          new search
        </button>
        <button
          className={`px-1 rounded ${searchState.mode === 'saved' ? "bg-blue-100" : ""}`}
          onClick={() => {
            if (searchState.mode !== 'saved') {
              searchTermBox.set({
                mode: "saved",
                search: searchState.search,
                selectedOption: 0
              })
            }

            searchBoxRef?.current?.focus()
          }}
        >
          saved searches
        </button>
      </div>

      <div className="mb-8 relative">
        <input
          ref={searchBoxRef}
          className="border-gray-200 border rounded p-1 w-full mb-2"
          type="text"
          placeholder="Search"
          value={searchState.search}
          onFocus={() => setSearchBoxFocused(true)}
          onBlur={() => setSearchBoxFocused(false)}
          // Add a new sheet reflecting the search term
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (searchState.mode === "saved") {
                return
              }

              const formula = getSearchFormula(searchState.type, searchState.search);

              if (!formula) {
                return
              }

              runInAction(() => {
                const sheetConfigId = generateNanoid();
                const sheetConfig: SheetConfig = {
                  id: sheetConfigId,
                  name: searchState.search,
                  properties: [
                    {
                      name: "result",
                      formula: formula,
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
                searchTermBox.get().search = "";
                searchBoxRef.current?.blur();
              });
            }
            if (e.key === "Escape") {
              searchBoxRef.current?.blur();
            }
          }}
          onChange={(e) =>
            runInAction(() => {
              searchTermBox.get().search = e.target.value;
            })
          }
        />
        {searchBoxFocused && searchState.mode === "saved" && (
          <div className="max-h-48 overflow-y-scroll absolute top-9 w-full bg-white z-10 border border-gray-100 px-4 py-2">
            {getMatchingSavedSearches(searchState.search).map((sheetConfig, index) => (
              <div
                key={sheetConfig.id}
                className="hover:bg-blue-100 hover:cursor-pointer"
                onMouseDown={(e) => {
                  runInAction(() => {
                    const textDocumentSheetId = generateNanoid();
                    textDocument.sheets.unshift({
                      id: textDocumentSheetId,
                      configId: sheetConfig.id,
                    });
                    isSheetExpandedMobx.set(textDocumentSheetId, true);
                  });
                }}
              >
                {sheetConfig.name}
              </div>
            ))}
          </div>
        )}
        {results.length > 0 && (
          <div className="absolute top-2 right-[35px] bg-white z-10 text-gray-400 text-sm">
            {results.length} results
          </div>
        )}

        {searchState.mode === "new" && (
          <button
            className={`
          absolute right-[5px] top-[5px] rounded pt-[2px] w-[24px] h-[24px]
          ${searchState.type === "regex" ? "bg-blue-100" : "bg-gray-200"}
        `}
            onClick={() => {
              searchTermBox.set({
                search: searchState.search,
                mode: "new",
                type: searchState.type === "regex" ? "string" : "regex"
              })
            }}
          >
            <div className="bg-gray-500 icon icon-asterisk" />
          </button>
        )}
      </div>
    </>
  );
});

const App = observer(() => {
  const textDocumentId = selectedTextDocumentIdBox.get();
  return (
    <FileDropWrapper className="h-screen flex px-4">
      <div className="w-1/2 max-w-lg flex flex-col flex-shrink-0">
        <TextDocumentSelector />
        <TextDocumentComponent
          textDocumentId={textDocumentId}
          key={textDocumentId}
        />
      </div>
      <div className="grow h-full overflow-auto pl-6 pr-4 pt-24">
        <SearchBox textDocumentId={textDocumentId} />
        <DocumentSheets textDocumentId={textDocumentId} />
      </div>
      <PersistenceButton />
      <ToastViewport className="fixed top-4 right-4 flex flex-col gap-2" />
    </FileDropWrapper>
  );
});

export default App;
