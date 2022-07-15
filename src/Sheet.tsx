import { Text } from "@codemirror/state";
import { isArray } from "lodash";
import { action } from "mobx";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { getAllSortedSnippets, getParserOfType } from "./Editor";
import { ResultRow, evaluateColumns } from "./formulas";
import { sheetConfigsMobx, TextDocument } from "./primitives";

let i = 1;
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

export const Sheet = observer(
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
        <div className="font-semibold">{sheetConfig.name}</div>
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
