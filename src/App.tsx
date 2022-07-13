import {useEffect, useRef, useState} from "react";
import {Editor, snippetsField} from "./Editor";
import {EditorView} from "@codemirror/view";




function Table ({ editorView }: { editorView: EditorView }) {

  return (

    <table className="border border-gray-200">
      <thead>
        <tr>
          <th className="bg-gray-300 px-1 font-normal">Workout</th>
        </tr>
      </thead>
      <tbody>
        <tr>



          <td className="p-1">
            <button>
              <span className="icon icon-highlighter bg-black"/>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  )


}


function App() {
  return (
    <div className="flex p-4 gap-4 items-start">
     <Editor/>
    </div>
  )
}

export default App
