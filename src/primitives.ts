import {observable} from "mobx";
import {EditorState} from "@codemirror/state";
import {nanoid} from "nanoid";

export type Span = [from: number, to: number];

export type Snippet = {
  span: Span
  type: string
}

const INITIAL_TEXT = `4/15 gym: run + plank
4/17 gym: elliptical + plank
4/20 gym: 
Squat 50 10x3
Dead 50 10x3
Bench 70 776

Next time: 

Maintain all weights, better form and intensity
Squad dead bench farmer lat

5/4 gym

Squat 50 10x3
Dead 50 10x3
Pullups 2x3 in between (Next time 3x3)
Bench 70 10 8 3 (wrist problems, weight felt good)
`

export const textEditorStateMobx = observable.box(EditorState.create({ doc: INITIAL_TEXT }))
