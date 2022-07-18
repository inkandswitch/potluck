import {
  Decoration,
  EditorView,
  ViewPlugin, ViewUpdate
} from "@codemirror/view";
import { Facet, StateEffect, StateField } from "@codemirror/state";
import { minimalSetup } from "codemirror";
import { useEffect, useRef } from "react";
import { autorun, comparer, reaction, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import {
  getSheetConfigsOfTextDocument,
  Highlight, SheetConfig, sheetConfigsMobx, textDocumentsMobx,
  textEditorStateMobx,
} from "./primitives";
import { evaluateSheetConfigs } from "./formulas";

const textDocumentIdFacet = Facet.define<string, string>({
  combine: (values) => values[0],
});

// HIGHLIGHTS

function parseHighlights(view: EditorView) {
  const doc = view.state.doc
  const textDocumentId = view.state.facet(textDocumentIdFacet)

  const textDocument = textDocumentsMobx.get(textDocumentId)

  if (!textDocument) {
    return
  }

  const sheetConfigs: SheetConfig[] = getSheetConfigsOfTextDocument(textDocument)

  view.dispatch({
    effects: setHighlightsEffect.of(
      evaluateSheetConfigs(doc, sheetConfigs).highlights
    ),
  });
}

const setHighlightsEffect = StateEffect.define<Highlight[]>();
const highlightsField = StateField.define<Highlight[]>({
  create() {
    return [];
  },
  update(snippets, tr) {
    for (let e of tr.effects) {
      if (e.is(setHighlightsEffect)) {
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
  [highlightsField],
  (state) => {
    return Decoration.set(
      state.field(highlightsField).map((snippet) => {
        return (
          Decoration.mark({
            class: 'bg-yellow-100 rounded',
          })
        ).range(snippet.span[0], snippet.span[1]);
      }),
      true
    );
  }
);

export let EDITOR_VIEW: EditorView;

export const Editor = observer(
  ({ textDocumentId }: { textDocumentId: string }) => {
    const editorRef = useRef(null);
    const textDocument = textDocumentsMobx.get(textDocumentId)!;

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
          highlightsField,
          snippetDecorations,
          textDocumentIdFacet.of(textDocumentId),
        ],
        parent: editorRef.current!,
        dispatch(transaction) {
          view.update([transaction]);

          setTimeout(() => parseHighlights(view))

          runInAction(() => {
            textDocument.text = view.state.doc;
            textEditorStateMobx.set(transaction.state);
          });
        },
      }));

      runInAction(() => {
        textEditorStateMobx.set(view.state);
      });

      const unsubscribes: (() => void)[] = [
        autorun(() => {
          parseHighlights(view)
        })
      ]

      return () => {
        unsubscribes.forEach((unsubscribe) => unsubscribe())
        view.destroy();
      };
    }, [textDocumentId]);


    return (
      <div
        className="text-lg h-[500px] w-[500px] bg-white border-black border-2 rounded-lg overflow-auto flex-shrink-0"
        ref={editorRef}
      />
    );
  }
);
