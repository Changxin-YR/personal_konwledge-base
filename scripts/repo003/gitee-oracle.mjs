export const repo = 'oschina/repo'
export const remoteId = 10649736
export const site = 'https://gitee.com'
export const remote = '/api/v5/repos/' + repo
export const readme = 'README.md'
export const missing = 'knowledgeos-read-only-fixture-not-existing'

export const matrix = [
  {
    ref: 'fork_flow',
    commit: '8217772aa248da974b98148f43856ea19bf8f1a2',
    tree: 'a82868d0c8324e4812430a4ed44b9f35c463b27d',
    blob: '18a7924cd89eae26c759f0cc1b646c2a7fb8caf7',
    size: 5598,
    sha256: 'f6ebfea2e5e7caf9f664651b7d1dddb4a75db9433e6e0a55903365883294a356',
    entries: 98,
    directories: 8,
  },
  {
    ref: 'master',
    commit: '1f20776dbb3b87ba39928dc4baba58f9c2d17c80',
    tree: '5a5e1711ae9b00d0fc935a3e6b6bfa12c3b11d4f',
    blob: '5519e9aa5e9cb1bd9f65465bfbb6d3ab30811e5b',
    size: 2090,
    sha256: 'ac1e9e65ee668663caa84fc82a9aa71c9cda332406e4c1d082b847a205a656e0',
    entries: 96,
    directories: 8,
  },
]

export const branchPath = ref => remote + '/branches/' + ref
export const commitPath = sha => remote + '/commits/' + sha
export const treePath = sha => remote + '/git/trees/' + sha + '?recursive=1'
export const blobPath = sha => remote + '/git/blobs/' + sha
export const treeUrl = sha => site + '/' + repo + '/tree/' + sha
export const blobUrl = sha => site + '/' + repo + '/blob/' + sha + '/' + readme

const permitted = new Set([
  remote,
  branchPath(missing),
  ...matrix.flatMap(record => [
    branchPath(record.ref), commitPath(record.commit), treePath(record.tree), blobPath(record.blob),
  ]),
])

export function allowedPublicGiteeUrl(url) {
  return url.origin === site && !url.username && !url.password && !url.hash &&
    permitted.has(url.pathname + url.search)
}
