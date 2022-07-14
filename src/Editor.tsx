import {Decoration, DecorationSet, EditorView, keymap, ViewPlugin, ViewUpdate, WidgetType} from "@codemirror/view";
import {EditorSelection, EditorState, RangeSet, SelectionRange, StateEffect, StateField} from "@codemirror/state";
import {defaultKeymap} from "@codemirror/commands";
import {minimalSetup} from "codemirror"
import {Ref, useEffect, useRef} from "react";
import {nanoid} from 'nanoid';
import {sortBy} from 'lodash';

import {autorun, comparer, computed, reaction, runInAction} from "mobx";
import {observer} from "mobx-react-lite";
import {Snippet, textEditorStateMobx} from "./primitives";

export type Parser = {
  type: string,
  color: string,
  parse: (text: string) => Snippet[]
}


const NUMBER_TYPE = 'number'
const EXERCISE_TYPE = 'exercise'


const PARSER: Parser[] = [
  {
    color: 'text-blue-500',
    type: EXERCISE_TYPE,
    parse(string) {
      const snippets: Snippet[] = []
      const regex = /Squat|Dead/g

      let match
      while ((match = regex.exec(string)) != null) {
        const value = match[0]
        const from = match.index
        const to = from + value.length

        snippets.push({
          type: this.type,
          id: nanoid(),
          span: [from, to]
        })
      }

      return snippets;
    }
  },
  {
    color: 'text-green-500',
    type: NUMBER_TYPE,
    parse(string) {
      const snippets: Snippet[] = []
      const regex = /[0-9]+/g

      let match
      while ((match = regex.exec(string)) != null) {
        const value = match[0]
        const from = match.index
        const to = from + value.length

        snippets.push({
          type: this.type,
          id: nanoid(),
          span: [from, to]
        })
      }

      return snippets;
    }
  }
]

export function getAllSnippets(string: string): Snippet[] {
  let snippets: Snippet[] = []

  PARSER.forEach((parser) => {
    snippets = snippets.concat(parser.parse(string))
  })

  return snippets
}

const parserPlugin = ViewPlugin.fromClass(class {

  view: EditorView

  constructor(view: EditorView) {
    this.view = view

    setTimeout(() => {
      this.parseSnippets()
    })
  }

  parseSnippets() {
    this.view.dispatch({
      effects: setSnippetsEffect.of(getAllSnippets(this.view.state.doc.sliceString(0)))
    })

  }

  update(update: ViewUpdate) {
    if (update.docChanged) {

      setTimeout(() => {
        this.parseSnippets()
      })
    }
  }
})


const setSnippetsEffect =
  StateEffect.define<Snippet[]>();
const snippetsField = StateField.define<Snippet[]>(
  {
    create() {
      return [];
    },
    update(snippets, tr) {
      for (let e of tr.effects) {
        if (e.is(setSnippetsEffect)) {
          return e.value
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
      state.field(snippetsField).map((snippet) => {
        const parser = PARSER.find(({ type }) => snippet.type === type)

        return (
          Decoration.mark({
            class: parser!.color,
          }).range(snippet.span[0], snippet.span[1])
        )
      }),
      true
    );
  }
);

export let EDITOR_VIEW: EditorView;

export const Editor = observer(() => {
  const editorRef = useRef(null);

  useEffect(() => {
    const view = EDITOR_VIEW = new EditorView({
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
        snippetDecorations,
        parserPlugin
      ],
      parent: editorRef.current!,
      dispatch(transaction) {
        view.update([transaction]);

        runInAction(() => {
          textEditorStateMobx.set(transaction.state);
        });
      },
    });

    runInAction(() => {
      textEditorStateMobx.set(view.state);
    });

    return () => {
      view.destroy();
    };
  }, []);

  return (
    <div
      className="text-lg h-[500px] bg-white border-black border-2 rounded-lg overflow-auto"
      ref={editorRef}
    />
  );
});