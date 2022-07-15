import {
  Decoration,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { minimalSetup } from "codemirror";
import { useEffect, useRef } from "react";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import {
  Snippet,
  TextDocument,
  textDocumentsMobx,
  textEditorStateMobx,
} from "./primitives";
import { sortBy } from "lodash";

// PARSING

export type Parser = {
  type: string;
  color: string;
  bgColor: string;
  parse: (text: string) => Snippet[];
};

const NUMBER_TYPE = "number";
const EXERCISE_TYPE = "exercise";

export function getParserOfType(type: string) {
  return PARSER.find((parser) => parser.type === type);
}

const PARSER: Parser[] = [
  {
    color: "text-blue-500",
    bgColor: "bg-blue-100",
    type: EXERCISE_TYPE,
    parse(string) {
      const snippets: Snippet[] = [];
      const regex = /Squat|Dead/g;

      let match;
      while ((match = regex.exec(string)) != null) {
        const value = match[0];
        const from = match.index;
        const to = from + value.length;

        snippets.push({
          type: this.type,
          span: [from, to],
        });
      }

      return snippets;
    },
  },
  {
    color: "text-green-500",
    bgColor: "bg-green-100",
    type: NUMBER_TYPE,
    parse(string) {
      const snippets: Snippet[] = [];
      const regex = /[0-9]+/g;

      let match;
      while ((match = regex.exec(string)) != null) {
        const value = match[0];
        const from = match.index;
        const to = from + value.length;

        snippets.push({
          type: this.type,
          span: [from, to],
        });
      }

      return snippets;
    },
  },
];

export function getAllSortedSnippets(string: string): Snippet[] {
  let snippets: Snippet[] = [];

  PARSER.forEach((parser) => {
    snippets = snippets.concat(parser.parse(string));
  });

  return sortBy(snippets, ({ span }) => span[0]);
}

const parserPlugin = ViewPlugin.fromClass(
  class {
    view: EditorView;

    constructor(view: EditorView) {
      this.view = view;

      setTimeout(() => {
        this.parseSnippets();
      });
    }

    parseSnippets() {
      this.view.dispatch({
        effects: setSnippetsEffect.of(
          getAllSortedSnippets(this.view.state.doc.sliceString(0))
        ),
      });
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        setTimeout(() => {
          this.parseSnippets();
        });
      }
    }
  }
);

// DRAGGABLE HIGHLIGHTS

export const setIsInDragMode = StateEffect.define<boolean>();
const isInDragModeField = StateField.define<boolean>({
  create() {
    return false;
  },

  update(isInDragMode, tr) {
    for (let e of tr.effects) {
      if (e.is(setIsInDragMode)) {
        return e.value;
      }
    }
    return isInDragMode;
  },
});

class DraggableSnippetWidget extends WidgetType {
  constructor(readonly snippet: Snippet, readonly text: string) {
    super();
  }

  eq(other: DraggableSnippetWidget) {
    return (
      other.text === this.text &&
      other.snippet.type === this.snippet.type &&
      other.snippet.span[0] === this.snippet.span[0] &&
      other.snippet.span[1] === this.snippet.span[1]
    );
  }

  toDOM() {
    let token = document.createElement("span");

    const parser = PARSER.find(({ type }) => this.snippet.type === type);

    token.style.cursor = "grab";
    token.draggable = true;
    token.ondragstart = (evt: DragEvent) => {
      evt!.dataTransfer!.setData("text/json", JSON.stringify(this.snippet));
    };

    token.className = `${parser!.bgColor} rounded ${parser!.color}`;
    token.innerText = this.text;

    return token;
  }

  ignoreEvent() {
    return true;
  }
}

const draggableTokensPlugin = ViewPlugin.fromClass(
  class {
    view: EditorView;

    constructor(view: EditorView) {
      this.view = view;

      this.onKeyDown = this.onKeyDown.bind(this);
      this.onKeyUp = this.onKeyUp.bind(this);

      window.addEventListener("keydown", this.onKeyDown);
      window.addEventListener("keyup", this.onKeyUp);
    }

    onKeyDown(evt: KeyboardEvent) {
      if (evt.metaKey) {
        this.view.dispatch({
          effects: setIsInDragMode.of(true),
        });
      }
    }

    onKeyUp(evt: KeyboardEvent) {
      if (!evt.metaKey) {
        this.view.dispatch({
          effects: setIsInDragMode.of(false),
        });
      }
    }

    destroy() {
      window.removeEventListener("keydown", this.onKeyDown);
      window.removeEventListener("keyup", this.onKeyUp);
    }
  }
);

// SNIPPETS

const setSnippetsEffect = StateEffect.define<Snippet[]>();
const snippetsField = StateField.define<Snippet[]>({
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
});

const snippetDecorations = EditorView.decorations.compute(
  [snippetsField, isInDragModeField],
  (state) => {
    const isinDragMode: boolean = state.field(isInDragModeField);

    return Decoration.set(
      state.field(snippetsField).map((snippet) => {
        const parser = PARSER.find(({ type }) => snippet.type === type);
        const text = state.doc.sliceString(snippet.span[0], snippet.span[1]);

        return (
          isinDragMode
            ? Decoration.replace({
                widget: new DraggableSnippetWidget(snippet, text),
                side: 1,
              })
            : Decoration.mark({
                class: parser!.color,
              })
        ).range(snippet.span[0], snippet.span[1]);
      }),
      true
    );
  }
);

export let EDITOR_VIEW: EditorView;

export const Editor = observer(
  ({ textDocument }: { textDocument: TextDocument }) => {
    const editorRef = useRef(null);

    useEffect(() => {
      const view = (EDITOR_VIEW = new EditorView({
        doc: textDocument.text,
        extensions: [
          minimalSetup,
          EditorView.theme({
            "&": {
              height: "100%",
            },
          }),
          EditorView.lineWrapping,
          snippetsField,
          snippetDecorations,
          parserPlugin,
          isInDragModeField,
          draggableTokensPlugin,
        ],
        parent: editorRef.current!,
        dispatch(transaction) {
          view.update([transaction]);

          runInAction(() => {
            textDocument.text = view.state.doc;
            textEditorStateMobx.set(transaction.state);
          });
        },
      }));

      runInAction(() => {
        textEditorStateMobx.set(view.state);
      });

      return () => {
        view.destroy();
      };
    }, []);

    return (
      <div
        className="text-lg h-[500px] w-[500px] bg-white border-black border-2 rounded-lg overflow-auto flex-shrink-0"
        ref={editorRef}
      />
    );
  }
);
