import {Editor, EDITOR_VIEW, getAllSortedSnippets, getParserOfType, setIsInDragMode} from "./Editor";
import {Snippet, Span, textEditorStateMobx} from "./primitives";
import {observer} from "mobx-react-lite";
import {useState} from "react";
import {AdjacentTokenRelationshipType, Column, findMatches, inferRelationships, Match} from "./rules";
import {nanoid} from "nanoid";
import { run } from "./formulas";


export const Table = observer(() => {
  const doc = textEditorStateMobx.get().doc

  const [columns, setColumns] = useState<Column[]>([])
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false)

  const onDragOver = (evt: any) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = "move";
    setIsDraggingOver(true)
  }

  const onDragLeave = (evt: any) => {
    setIsDraggingOver(false)
  }

  const onDrop = (evt: any) => {
    const value = evt.dataTransfer.getData("text/json")

    if (!value) {
      return
    }

    const snippet: Snippet = JSON.parse(value)

    setIsDraggingOver(false)
    setColumns(columns.concat({
      id: nanoid(),
      name: `Column${columns.length + 1}`,
      example: snippet
    }))

    EDITOR_VIEW.dispatch({ effects: setIsInDragMode.of(false)})
  }

  const changeColumnNameAt = (changedIndex : number, name: string) => {
    setColumns(columns.map((column, index) => (
      index === changedIndex ? { ... column, name } : column
    )))
  }

  const relationships = inferRelationships(
    columns, [
      AdjacentTokenRelationshipType
    ],
    getAllSortedSnippets(doc.sliceString(0))
  )

  const sortedSnippets = getAllSortedSnippets(doc.sliceString(0))


  run(sortedSnippets, doc)


  const matches: Match[] = findMatches(columns, relationships, sortedSnippets)

  return (
    <div className="flex flex-col gap-2 items-start">
      <table>
        <thead>
          <tr>

            {columns.map((column, index) => {
              return (
                <th key={index} className="bg-gray-100 border border-gray-200">
                  <input className="px-1 bg-gray-100" value={column.name} onChange={(evt) => changeColumnNameAt(index, evt.target.value)}/>
                </th>
              )
            })}

            <th className={`bg-white border-0 ${isDraggingOver ? 'border-b-yellow-200' : ''}`}>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {columns.map((column, index) => {
              const text = doc.sliceString(column.example.span[0], column.example.span[1])
              const parser = getParserOfType(column.example.type)

              return (
                <td key={index} className={`border border-gray-200 px-1 ${(isDraggingOver && index === columns.length - 1) ? 'border-r-yellow-200' : ''}`}>
                  <span className={parser!.color}>{text}</span>
                </td>
              )
            })}
            <td
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`border ${isDraggingOver ? 'border-yellow-200' : 'border-gray-200'} w-10 p-x1`}
            >
              &nbsp;
            </td>
          </tr>
          {(matches.length > 0) && (
            <tr>
              <td className="text-gray-300">Matches</td>
            </tr>
          )}

          {matches.map((match) => (
            <tr>
              {columns.map((column) => {
                const snippet = match[column.id]
                let value

                if (snippet) {
                  const text = doc.sliceString(snippet.span[0], snippet.span[1])
                  const parser = getParserOfType(snippet.type)
                  value = <span className={parser!.color}>{text}</span>
                }

                return (
                  <td className="border border-gray-200 px-1">
                    {value}
                  </td>
                )
              })}
            </tr>
          ))}

        </tbody>
      </table>


      <div className="border-gray-200 border rounded bg-gray-50 p-2 flex flex-col gap-2">

        <h1 className="text-lg">Rules</h1>

        {relationships.map((colRelationships, index) => {
          const column = columns[index]


          return (
            <div>
              {column.name}

              <ul>
                {colRelationships.map((relationship) => (
                  <li className="ml-6 list-disc">{relationship.asText(columns)}</li>
                ))}
              </ul>
            </div>
          )
        })}

      </div>

    </div>
  )
})


function App() {
  return (
    <div className="flex p-4 gap-4 items-start">
      <Editor/>
      <Table/>
    </div>
  )
}

export default App
