import { Snippet } from "./primitives";
import { curry, isFunction } from "lodash";
import { Text } from "@codemirror/state";


export function run(snippets: Snippet[], doc: Text) {


  const VALUES_OF_TYPE = (type: string): Snippet[] => {
    return snippets.filter((snippet) => snippet.type === type)
  }

  const ON_SAME_LINE = curry((a: Snippet, b: Snippet): boolean => {
    const lineStartA = doc.lineAt(a.span[0]).number
    const lineEndA = doc.lineAt(a.span[1]).number
    const lineStartB = doc.lineAt(b.span[0]).number
    const lineEndB = doc.lineAt(b.span[1]).number

    return (
      lineStartA === lineEndA &&
      lineStartB === lineEndB &&
      lineStartA === lineStartB
    )
  })


  const FILTER = curry((list: any[], condition: any): any[] => {
    return list.filter((item: any) => {
      if (isFunction(condition)) {

        return condition(item)
      }
      return item
    })
  })

  const FIRST = (list: any[]) : any => {
    return list[0]
  }


  const SECOND = (list: any[]) : any => {
    return list[1];
  }


  const firstNumber =   FIRST(VALUES_OF_TYPE('number'))
  const second =   SECOND(VALUES_OF_TYPE('number'))


  console.log('numbers', FILTER(VALUES_OF_TYPE('number'), ON_SAME_LINE(FIRST(VALUES_OF_TYPE('number')))))

}