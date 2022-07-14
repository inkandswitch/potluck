import {Editor, EDITOR_VIEW, getParserOfType} from "./Editor";
import {Snippet, Span, textEditorStateMobx} from "./primitives";
import {observer} from "mobx-react-lite";
import {useState} from "react";


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

  const [snippets, setSnippets] = useState<Snippet[]>([])
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
    setSnippets(snippets.concat(snippet))
  }

  return (
    <table className="border border-gray-200">
      <tr>
        {snippets.map((snippet, index) => {
          const text = doc.sliceString(snippet.span[0], snippet.span[1])
          const parser = getParserOfType(snippet.type)

          return (
            <td className={`border border-gray-200 px-1 ${(isDraggingOver && index === snippets.length - 1) ? 'border-r-yellow-200' : ''}`}>
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
    </table>
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
