import {Decoration, DecorationSet, EditorView, keymap} from "@codemirror/view";
import {EditorState, RangeSet, StateEffect, StateField} from "@codemirror/state";
import {defaultKeymap} from "@codemirror/commands";
import {minimalSetup} from "codemirror"
import {useEffect, useRef} from "react";

const initialValue = `
  # monday
  bench 50 10x3
  squat 50 10x3
`

const setSnippet = StateEffect.define<{ from: number, to: number }>()

const snippetsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(underlines, tr) {
    underlines = underlines.map(tr.changes)
    for (let e of tr.effects) if (e.is(setSnippet)) {
      return RangeSet.of([underlineMark.range(e.value.from, e.value.to)])
    }
    return underlines
  },
  provide: f => EditorView.decorations.from(f)
})

const underlineMark = Decoration.mark({ class: "cm-underline" })

const underlineTheme = EditorView.baseTheme({
  ".cm-underline": { textDecoration: "underline 3px red" }
})

export function underlineSelection(view: EditorView) {
  let effects: StateEffect<unknown>[] = view.state.selection.ranges
    .filter(r => !r.empty)
    .map(({ from, to }) => setSnippet.of({ from, to }))
  if (!effects.length) return false

  if (!view.state.field(snippetsField, false))
    effects.push(StateEffect.appendConfig.of([snippetsField,
      underlineTheme]))
  view.dispatch({ effects })
  return true
}


const snippetKeymap = keymap.of([{
  key: "Mod-h",
  preventDefault: true,
  run: underlineSelection
}])

export const Editor = () => {
  const editorRef = useRef(null);

  useEffect(() => {
    if (!editorRef.current) {
      return
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          minimalSetup,
          keymap.of(defaultKeymap),
          EditorView.theme({
            "&": { height: "100%" },
          }),
          [
            snippetKeymap
          ],
        ],
      }),
      parent: editorRef.current,
      dispatch(transaction) {
        view.update([transaction]);
      },
    });


    return () => {
      view.destroy();
    };
  }, [editorRef]);

  return (
    <div
      className="text-lg h-[500px] w-[500px] bg-white border-2 border-black rounded-lg overflow-auto"
      ref={editorRef}
    />
  );
}