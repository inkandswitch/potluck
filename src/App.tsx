import {Editor, EDITOR_VIEW, getAllSnippets, getParserOfType} from "./Editor";
import {Snippet, Span, textEditorStateMobx} from "./primitives";
import {observer} from "mobx-react-lite";
import {useState} from "react";
import {AdjacentTokenRelationshipType, Column, inferRelationships} from "./rules";
import {computed} from "mobx";
import {nanoid} from "nanoid";


function getMatchingSelectionSpan(value: string): Span | undefined {

  const doc = EDITOR_VIEW.state.doc

  for (const { from, to } of EDITOR_VIEW.state.selection.ranges) {
    const rangeText = doc.sliceString(from, to)

    if (rangeText === value) {
      return [from, to]
    }
  }
}

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
  }


  const relationships = inferRelationships(
    columns, [
      AdjacentTokenRelationshipType
    ],
    getAllSnippets(doc.sliceString(0))
  )

  return (
    <div className="flex flex-col gap-2 items-start">
      <table>
        <thead>
          <tr>

            {columns.map((column, index) => {
              return (
                <th key={index} className="bg-gray-100 border border-gray-200 px-1">
                  {column.name}
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
                  <span className={`rounded ${parser!.color} ${parser!.bgColor}`}>{text}</span>
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
