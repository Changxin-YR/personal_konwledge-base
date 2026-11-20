// Independent, deterministic A05 inputs. All names and document bytes are synthetic.
import { crc32 } from 'node:zlib'
import { acceptanceSamples } from '../lib004/acceptance-samples.mjs'

// Stored classic ZIP with UTF-8 names. Expected contents come from the source
// list, not from the product reader or the manifest returned by the Host.
function storedZip(members) {
  const parts=[], directory=[]; let offset=0
  for (const {path,bytes} of members) {
    const name=Buffer.from(path), header=Buffer.alloc(30), entry=Buffer.alloc(46)
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20,4); header.writeUInt16LE(0x800,6)
    header.writeUInt16LE(33,12); header.writeUInt32LE(crc32(bytes),14); header.writeUInt32LE(bytes.length,18)
    header.writeUInt32LE(bytes.length,22); header.writeUInt16LE(name.length,26)
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20,4); header.copy(entry,6,4); entry.writeUInt32LE(offset,42)
    parts.push(header,name,bytes); directory.push(entry,name); offset+=30+name.length+bytes.length
  }
  const central=Buffer.concat(directory), end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(members.length,8); end.writeUInt16LE(members.length,10); end.writeUInt32LE(central.length,12); end.writeUInt32LE(offset,16)
  return Buffer.concat([...parts,central,end])
}
export function hostSamples() {
  const a=acceptanceSamples(), sample=(name,media,bytes)=>({name,media,bytes:Buffer.from(bytes)})
  const direct=[sample('reference.pdf','application/pdf',a['a08-reference.pdf']),
    sample('review.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',a['a08-v1.docx']),
    sample('notes.md','text/markdown','# Review\n\nA05 checks.'),sample('notes.txt','text/plain','A05 \u8d44\u6599\n')]
  const members=[...direct.map(s=>({...s,path:'docs/'+s.name})),
    {...sample('color.bin',null,'opaque color sample'),path:'samples/color.bin'},
    {...sample('unfinished.pdf','application/pdf','An unfinished synthetic document.'),path:'drafts/unfinished.pdf'}]
  return {direct,members,archive:sample('a05-selection.zip','application/zip',storedZip(members)),
    peer:sample('private-peer.txt','text/plain','Other account: unchanged.')}
}
