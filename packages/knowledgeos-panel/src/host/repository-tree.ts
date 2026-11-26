import { createHash } from 'node:crypto'
import { AssetError } from './asset-store.ts'
import type { RepositoryEntry } from './github-repository.ts'

export interface TreeEntry extends RepositoryEntry { mode: string }

function treeDigest(entries: readonly TreeEntry[]): string {
  const sorted = entries.map(entry => {
    const name = entry.path.slice(entry.path.lastIndexOf('/') + 1)
    return { entry, name, order: Buffer.from(name + (entry.kind === 'directory' ? '/' : '\0')) }
  }).sort((a, b) => Buffer.compare(a.order, b.order))
  const bytes = Buffer.concat(sorted.flatMap(({ entry, name }) => [
    Buffer.from(entry.mode.replace(/^0/, '') + ' ' + name + '\0'), Buffer.from(entry.sha, 'hex'),
  ]))
  return createHash('sha1').update('tree ' + bytes.length + '\0').update(bytes).digest('hex')
}

export function validateRepositoryTree(entries: ReadonlyMap<string, TreeEntry>) {
  const children = new Map<string, TreeEntry[]>()
  for (const entry of entries.values()) {
    const slash = entry.path.lastIndexOf('/')
    const parent = slash < 0 ? '' : entry.path.slice(0, slash)
    if (parent && entries.get(parent)?.kind !== 'directory') throw new AssetError(502, 'REPOSITORY_INVALID_RESPONSE')
    const group = children.get(parent) ?? []
    group.push(entry)
    children.set(parent, group)
  }
  for (const entry of entries.values()) {
    if (entry.kind === 'directory' && entry.sha !== treeDigest(children.get(entry.path) ?? [])) throw new AssetError(502, 'REPOSITORY_INVALID_RESPONSE')
  }
  return treeDigest(children.get('') ?? [])
}
