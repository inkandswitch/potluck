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


export type Match = {[id: string]: Snippet}

export function findMatches (columns: Column [], relationships: Relationship[][], sortedSnippets: Snippet[]): Match[] {

  let matches : Match[] = []

  columns.forEach((column, index) => {
    if (index === 0) {
      const typeMatches : Match[] = (
        sortedSnippets
          .filter(({type, span}) => (
            type === column.example.type && column.example.span[0] !== span[0]
          ))
          .map((snippet) => ({[column.id]: snippet}))
      )

      matches = typeMatches
      return
    }

    matches = matches.map((match) => {

      const relationship =  relationships[index][0]


      const matchingSnippet = relationship.find(match, sortedSnippets)

      if (matchingSnippet) {
        return {...match, [column.id]: matchingSnippet}
      }

      return match
    })

  })

  return matches
}


type RelationshipType = {
  getRelationships: (from: Column, to: Column, sortedSnippets: Snippet[]) => Relationship[]
}

type Relationship = {
  find: (match: Match, sortedSnippets: Snippet []) => Snippet | undefined
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

  find(match: Match, sortedSnippets: Snippet []): Snippet | undefined {
    let snippetCount = 0;

    const fromSnippet = match[this.fromColId]

    if (!fromSnippet) {
      return
    }

    for (const toSnippet of sortedSnippets) {
      const isAfterSnippet = toSnippet.span[0] > fromSnippet.span[1]

      if (isAfterSnippet) {
        if (toSnippet.type === this.type) {
          if (snippetCount === this.n) {
            return toSnippet
          }

          snippetCount +=1
        }
      }
    }
  }

  asText(columns: Column[]): string {
    const fromName = columns.find(({id}) => id === this.fromColId)!.name

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