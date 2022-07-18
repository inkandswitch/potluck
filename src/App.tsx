import {
  Editor,
  EDITOR_VIEW,
  getAllSortedSnippets,
  getParserOfType,
  setIsInDragMode,
} from "./Editor";
import {
  addSheetConfig,
  WORKOUT_DOCUMENT_ID,
  selectedTextDocumentIdBox,
  sheetConfigsMobx,
  Snippet,
  Span,
  TextDocument,
  textDocumentsMobx,
  textEditorStateMobx,
} from "./primitives";
import { observer } from "mobx-react-lite";
import { useRef, useState } from "react";
import {
  AdjacentTokenRelationshipType,
  Column,
  findMatches,
  inferRelationships,
  Match,
} from "./rules";
import { nanoid } from "nanoid";
import { SheetComponent } from "./SheetComponent";
import { action } from "mobx";
import { Text } from "@codemirror/state";
import classNames from "classnames";

const NEW_OPTION_ID = "new";
const AddNewDocumentSheet = observer(
  ({ textDocument }: { textDocument: TextDocument }) => {
    const sheetConfigSelectRef = useRef<HTMLSelectElement>(null);

    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          let sheetConfigId = sheetConfigSelectRef.current!.value;
          if (sheetConfigId === NEW_OPTION_ID) {
            const sheetConfig = addSheetConfig();
            sheetConfigId = sheetConfig.id;
          }
          textDocument.sheets.push({
            id: nanoid(),
            configId: sheetConfigId,
          });
          sheetConfigSelectRef.current!.value = NEW_OPTION_ID;
        }}
        className="flex gap-4"
      >
        <select
          className="border border-gray-200 rounded px-1"
          ref={sheetConfigSelectRef}
        >
          <option value={NEW_OPTION_ID}>new sheet config</option>
          {[...sheetConfigsMobx.values()].map((sheetConfig) => (
            <option value={sheetConfig.id} key={sheetConfig.id}>
              {sheetConfig.name}
            </option>
          ))}
        </select>
        <button type="submit" className="button">
          add sheet
        </button>
      </form>
    );
  }
);

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
          className="text-xl border-b border-gray-200 w-[500px] mb-2 outline-none focus:border-gray-400"
        />
      </div>
    );
  }
);

const TextDocumentComponent = observer(
  ({ textDocumentId }: { textDocumentId: string }) => {
    const textDocument = textDocumentsMobx.get(textDocumentId)!;
    return (
      <div className="px-4">
        <TextDocumentName textDocument={textDocument} />
        <div className="flex gap-4 items-start">
          <Editor textDocument={textDocument} />
          <div className="grow">
            <div className="flex flex-col gap-4">
              {textDocument.sheets.map((sheet) => {
                return (
                  <SheetComponent
                    textDocument={textDocument}
                    sheetConfigId={sheet.configId}
                    key={sheet.id}
                  />
                );
              })}
            </div>
            <div
              className={classNames({ "mt-8": textDocument.sheets.length > 0 })}
            >
              <AddNewDocumentSheet textDocument={textDocument} />
            </div>
          </div>
        </div>
      </div>
    );
  }
);

const TextDocumentSelector = observer(() => {
  return (
    <div className="p-4">
      <select
        onChange={action((e) => {
          let newDocumentId = e.target.value;
          if (newDocumentId === NEW_OPTION_ID) {
            newDocumentId = nanoid();
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
    </div>
  );
});

const App = observer(() => {
  const textDocumentId = selectedTextDocumentIdBox.get();
  return (
    <div>
      <TextDocumentSelector />
      <TextDocumentComponent
        textDocumentId={textDocumentId}
        key={textDocumentId}
      />
    </div>
  );
});

export default App;
