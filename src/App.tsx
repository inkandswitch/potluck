import {Editor, EDITOR_VIEW} from "./Editor";
import {Span} from "./primitives";
import {observer} from "mobx-react-lite";


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

  const onDragOver = (evt: any) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = "move";
  }

  const onDrop = (evt: any) => {
    const value = evt.dataTransfer.getData("text/plain")
    const span = getMatchingSelectionSpan(value)

    if (!span) {
      return
    }
  }


  return (
    <div onDrop={onDrop} onDragOver={onDragOver}>&nbsp;</div>
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
