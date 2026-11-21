export const noteKinds=['plain','reading','project','reflection'] as const
export type NoteKind=typeof noteKinds[number]
export const noteLimits={title:200,body:32_000,references:64} as const
export const noteId=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/

export function noteText(value:unknown,max:number){
  return typeof value==='string'&&value.length<=max&&value.isWellFormed()&&!value.includes('\0')
}

export type NoteDraft={title:string;body:string;kind:NoteKind}
export type NotePatch=Partial<NoteDraft>&{add_citation?:string;remove_reference?:string}
