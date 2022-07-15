import {
  Editor,
  EDITOR_VIEW,
  getAllSortedSnippets,
  getParserOfType,
  setIsInDragMode,
} from "./Editor";
import {
  FIRST_SHEET_CONFIG_ID,
  FIRST_TEXT_DOCUMENT_ID,
  sheetConfigsMobx,
  Snippet,
  Span,
  TextDocument,
  textDocumentsMobx,
  textEditorStateMobx,
} from "./primitives";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import {
  AdjacentTokenRelationshipType,
  Column,
  findMatches,
  inferRelationships,
  Match,
} from "./rules";
import { nanoid } from "nanoid";
import { evaluateColumns, FormulaColumn, ResultRow } from "./formulas";
import { isArray } from "lodash";
import { Text } from "@codemirror/state";
import { action } from "mobx";

export const Table = observer(() => {
  const doc = textEditorStateMobx.get().doc;

  const [columns, setColumns] = useState<Column[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  const onDragOver = (evt: any) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = "move";
    setIsDraggingOver(true);
  };

  const onDragLeave = (evt: any) => {
    setIsDraggingOver(false);
  };

  const onDrop = (evt: any) => {
    const value = evt.dataTransfer.getData("text/json");

    if (!value) {
      return;
    }

    const snippet: Snippet = JSON.parse(value);

    setIsDraggingOver(false);
    setColumns(
      columns.concat({
        id: nanoid(),
        name: `Column${columns.length + 1}`,
        example: snippet,
      })
    );

    EDITOR_VIEW.dispatch({ effects: setIsInDragMode.of(false) });
  };

  const changeColumnNameAt = (changedIndex: number, name: string) => {
    setColumns(
      columns.map((column, index) =>
        index === changedIndex ? { ...column, name } : column
      )
    );
  };

  const relationships = inferRelationships(
    columns,
    [AdjacentTokenRelationshipType],
    getAllSortedSnippets(doc.sliceString(0))
  );

  const sortedSnippets = getAllSortedSnippets(doc.sliceString(0));

  const matches: Match[] = findMatches(columns, relationships, sortedSnippets);

  return (
    <div className="flex flex-col gap-2 items-start">
      <table>
        <thead>
          <tr>
            {columns.map((column, index) => {
              return (
                <th key={index} className="bg-gray-100 border border-gray-200">
                  <input
                    className="px-1 bg-gray-100"
                    value={column.name}
                    onChange={(evt) =>
                      changeColumnNameAt(index, evt.target.value)
                    }
                  />
                </th>
              );
            })}

            <th
              className={`bg-white border-0 ${
                isDraggingOver ? "border-b-yellow-200" : ""
              }`}
            >
              &nbsp;
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {columns.map((column, index) => {
              const text = doc.sliceString(
                column.example.span[0],
                column.example.span[1]
              );
              const parser = getParserOfType(column.example.type);

              return (
                <td
                  key={index}
                  className={`border border-gray-200 px-1 ${
                    isDraggingOver && index === columns.length - 1
                      ? "border-r-yellow-200"
                      : ""
                  }`}
                >
                  <span className={parser!.color}>{text}</span>
                </td>
              );
            })}
            <td
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`border ${
                isDraggingOver ? "border-yellow-200" : "border-gray-200"
              } w-10 p-x1`}
            >
              &nbsp;
            </td>
          </tr>
          {matches.length > 0 && (
            <tr>
              <td className="text-gray-300">Matches</td>
            </tr>
          )}

          {matches.map((match) => (
            <tr>
              {columns.map((column) => {
                const snippet = match[column.id];
                let value;

                if (snippet) {
                  const text = doc.sliceString(
                    snippet.span[0],
                    snippet.span[1]
                  );
                  const parser = getParserOfType(snippet.type);
                  value = <span className={parser!.color}>{text}</span>;
                }

                return <td className="border border-gray-200 px-1">{value}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-gray-200 border rounded bg-gray-50 p-2 flex flex-col gap-2">
        <h1 className="text-lg">Rules</h1>

        {relationships.map((colRelationships, index) => {
          const column = columns[index];

          return (
            <div>
              {column.name}

              <ul>
                {colRelationships.map((relationship) => (
                  <li className="ml-6 list-disc">
                    {relationship.asText(columns)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
});

let i = 1;

export const SpreadSheet = observer(
  ({
    textDocument,
    sheetConfigId,
  }: {
    textDocument: TextDocument;
    sheetConfigId: string;
  }) => {
    const doc = textDocument.text;

    const sortedSnippets = getAllSortedSnippets(doc.sliceString(0));

    const [selectedFormulaIndex, setSelectedFormulaIndex] = useState<number>(0);

    const sheetConfig = sheetConfigsMobx.get(sheetConfigId)!;
    const columns = sheetConfig.columns;
    // const [columns, setColumns] = useState<FormulaColumn[]>([
    //   { name: "col1", formula: "" },

    //   /* {
    //    name: 'exercise',
    //    formula: 'VALUES_OF_TYPE("exercise")'
    //  },
    //  {
    //    name: 'numbers',
    //    formula: 'FILTER(VALUES_OF_TYPE("number"), IS_ON_SAME_LINE_AS(exercise))'
    //  } */
    // ]);

    const rows: ResultRow[] = evaluateColumns(columns, sortedSnippets, doc);

    const changeColumnNameAt = action((changedIndex: number, name: string) => {
      sheetConfig.columns = sheetConfig.columns.map((column, index) =>
        index === changedIndex ? { ...column, name } : column
      );
    });

    const changeFormulaAt = action((changedIndex: number, formula: string) => {
      sheetConfig.columns = sheetConfig.columns.map((column, index) =>
        index === changedIndex ? { ...column, formula } : column
      );
    });

    const addColumn = action(() => {
      sheetConfig.columns.push({
        name: `col${++i}`,
        formula: "",
      });
      setSelectedFormulaIndex(columns.length - 1);
    });

    return (
      <div className="flex flex-col gap-2 flex-1">
        {selectedFormulaIndex !== undefined && (
          <div className="flex">
            <span>{columns[selectedFormulaIndex].name} =&nbsp;</span>
            <input
              className="border border-gray-200 flex-1"
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
              <tr key={index}>
                {columns.map((column, index) => {
                  const value: any = row[column.name];

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

function ValueDisplay({ value, doc }: { value: any; doc: Text }) {
  if (value instanceof Error) {
    return <span className="text-red-500">#Err</span>;
  }

  if (value && value.span && value.type) {
    const text = doc.sliceString(value.span[0], value.span[1]);
    const parser = getParserOfType(value.type);
    return <span className={parser!.color}>{text}</span>;
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

const App = observer(() => {
  const textDocument = textDocumentsMobx.get(FIRST_TEXT_DOCUMENT_ID)!;
  return (
    <div className="flex p-4 gap-4 items-start">
      <Editor textDocument={textDocument} />
      <div className="grow">
        {textDocument.sheets.map((sheet) => {
          return (
            <SpreadSheet
              textDocument={textDocument}
              sheetConfigId={sheet.configId}
              key={sheet.id}
            />
          );
        })}
      </div>
    </div>
  );
});

export default App;
