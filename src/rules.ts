import {Snippet} from "./primitives";
import {sortBy} from "lodash";

export type Column = {
  name: string
  id: string
  example: Snippet
}


export function inferRelationships(columns: Column[], relationshipTypes: RelationshipType[], snippets: Snippet[]): Relationship[][] {
  const result: Relationship[][] = columns.map(() => [])
  const sortedSnippets = sortBy(snippets, ({ span }) => span[0])


  columns.forEach((from, fromIndex) => {
    columns.forEach((to, toIndex) => {
      if (from.example.span[1] > to.example.span[0]) {
        return
      }

      relationshipTypes.forEach((relationshipType: RelationshipType) => {
        const relationships: Relationship[] = relationshipType.getRelationships(from, to, sortedSnippets)
        result[toIndex] = result[toIndex].concat(relationships)
      })
    })
  })

  return result
}

type RelationshipType = {
  getRelationships: (from: Column, to: Column, sortedSnippets: Snippet[]) => Relationship[]
}

type Relationship = {
  find: (snippet: Snippet) => Snippet | undefined
  asText: (columns: Column[]) => string
}


export const AdjacentTokenRelationshipType : RelationshipType = {
  getRelationships(from: Column, to: Column, sortedSnippets: Snippet[]): Relationship[] {
    const typeBSnippetsBetweenFromAndTo = (
      sortedSnippets
        .filter(({ type, span }) => (
          type === to.example.type &&
          span[0] > from.example.span[1] &&
          span[1] < to.example.span[1]
        ))
    )

    const n = typeBSnippetsBetweenFromAndTo.length
    return [new AdjacentRelationship(n, to.example.type, from.id, to.id)]
  }
}

class AdjacentRelationship implements Relationship {
  constructor(readonly n: number, readonly type: string, readonly fromColId: string, readonly toColId: string) {
  }

  find(snippet: Snippet): Snippet | undefined {
    return undefined;
  }

  asText(columns: Column[]): string {
    const fromName = columns.find(({id}) => id === this.fromColId).name

    return `after ${fromName} take the ${toNthString(this.n)} ${this.type}`;
  }
}


function toNthString(n: number) {
  switch (n) {
    case 0:
      return 'first'
    case 1:
      return 'second'
    case 2:
      return 'third'
    default:
      return `${3}th`
  }
}