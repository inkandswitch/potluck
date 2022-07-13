import {Decoration, DecorationSet, EditorView, keymap} from "@codemirror/view";
import {EditorState, RangeSet, StateEffect, StateField} from "@codemirror/state";
import {defaultKeymap} from "@codemirror/commands";
import {minimalSetup} from "codemirror"
import {Ref, useEffect, useRef} from "react";
import {nanoid} from 'nanoid';

import {autorun, comparer, computed, reaction, runInAction} from "mobx";
import {observer} from "mobx-react-lite";
import {Snippet, snippetsMobx, Span, textEditorStateMobx} from "./primitives";

const setSnippetsEffect =
  StateEffect.define<(Snippet)[]>();
const snippetsField = StateField.define<Snippet[]>(
  {
    create() {
      return [];
    },
    update(snippets, tr) {
      for (let e of tr.effects) {
        if (e.is(setSnippetsEffect)) {
          return e.value;
        }
      }
      return snippets.map((snippet) => ({
        ...snippet,
        span: [
          tr.changes.mapPos(snippet.span[0]),
          tr.changes.mapPos(snippet.span[1]),
        ],
      }));
    },
  }
);

const snippetDecorations = EditorView.decorations.compute(
  [snippetsField],
  (state) => {
    return Decoration.set(
      state.field(snippetsField).map((snippet) => (
        Decoration.mark({
          class: `bg-gray-200`,
        }).range(snippet.span[0], snippet.span[1])
      )),
      true
    );
  }
);

export const snippetsKeymap = keymap.of([{
  key: "Mod-h",
  preventDefault: true,
  run: (view: EditorView) => {
    runInAction(() => {
      for (const { from, to } of view.state.selection.ranges) {

        const id = nanoid()

        snippetsMobx.set(id, { id, span: [from, to] })
      }
    })
    return true
  }
}])

export const Editor = observer(() => {
  const editorRef = useRef(null);

  useEffect(() => {
    const view = new EditorView({
      doc: textEditorStateMobx.get()?.doc,
      extensions: [
        minimalSetup,
        EditorView.theme({
          "&": {
            height: "100%",
          }
        }),
        EditorView.lineWrapping,
        snippetsField,
        snippetsKeymap,
        snippetDecorations
      ],
      parent: editorRef.current!,
      dispatch(transaction) {
        view.update([transaction]);
        runInAction(() => {
          for (const snippet of snippetsMobx.values()) {
            const newSpan: Span = [
              transaction.changes.mapPos(snippet.span[0]),
              transaction.changes.mapPos(snippet.span[1]),
            ];
            if (newSpan[0] === newSpan[1]) {
              snippetsMobx.delete(snippet.id);
            } else {
              snippet.span = newSpan;
            }
          }
          textEditorStateMobx.set(transaction.state);
        });
      },
    });

    runInAction(() => {
      textEditorStateMobx.set(view.state);
    });

    const unsubscribes: (() => void)[] = [
      reaction(
        () => snippetsMobx.values(),
        (snippets) => {
          view.dispatch({
            effects: [setSnippetsEffect.of(Array.from(snippets))],
          });
        },
        { equals: comparer.structural }
      )
    ];
    return () => {
      view.destroy();
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  return (
    <div
      className="text-lg h-[500px] bg-white border-black border-2 rounded-lg overflow-auto"
      ref={editorRef}
    />
  );
});