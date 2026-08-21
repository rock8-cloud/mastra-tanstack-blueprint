/** Shape of the Mastra API payloads. Kept in one place so routes and UI agree. */

export interface TodoComment {
  id: string
  content: string
  author: string
  createdAt: string
}

export interface Todo {
  id: string
  title: string
  createdAt: string
  comments: TodoComment[]
}
