import { openBlobStream, readBlobBytes } from './blobStream'

export type ZipPreviewEntry = { name: string; compression: number; compressedSize: number; size: number; localOffset: number }

const u16 = (view: DataView, offset: number) => view.getUint16(offset, true)
const u32 = (view: DataView, offset: number) => view.getUint32(offset, true)
const decoder = new TextDecoder('utf-8', { fatal: true })

export async function inspectZip(file: File, maximumEntries = 20_000): Promise<ZipPreviewEntry[]> {
  const tailStart = Math.max(0, file.size - 65_557)
  const bytes = await readBlobBytes(file.slice(tailStart))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let offset = 0; offset <= bytes.length - 22; offset += 1)
    if (u32(view, offset) === 0x06054b50) eocd = offset
  if (eocd < 0) throw new Error('The selected file is not a supported ZIP archive.')
  const count = u16(view, eocd + 10); const directorySize = u32(view, eocd + 12); const directoryOffset = u32(view, eocd + 16)
  if (count > maximumEntries) throw new Error('The ZIP contains too many entries for browser preview.')
  if (directoryOffset + directorySize > file.size) throw new Error('The ZIP central directory is invalid.')
  const directory = await readBlobBytes(file.slice(directoryOffset, directoryOffset + directorySize))
  const directoryView = new DataView(directory.buffer, directory.byteOffset, directory.byteLength)
  const entries: ZipPreviewEntry[] = []; let offset = directoryOffset
  for (let index = 0; index < count; index += 1) {
    const relativeOffset = offset - directoryOffset
    if (relativeOffset + 46 > directory.length || u32(directoryView, relativeOffset) !== 0x02014b50) throw new Error('The ZIP central directory is invalid.')
    const nameLength = u16(directoryView, relativeOffset + 28); const extraLength = u16(directoryView, relativeOffset + 30); const commentLength = u16(directoryView, relativeOffset + 32)
    const name = decoder.decode(directory.slice(relativeOffset + 46, relativeOffset + 46 + nameLength)).replace(/\\/g, '/')
    if (name.startsWith('/') || name.split('/').some(part => part === '..')) throw new Error('The ZIP contains an unsafe path.')
    if (!name.endsWith('/')) entries.push({ name, compression: u16(directoryView, relativeOffset + 10), compressedSize: u32(directoryView, relativeOffset + 20), size: u32(directoryView, relativeOffset + 24), localOffset: u32(directoryView, relativeOffset + 42) })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

export async function openZipEntryStream(file: File, entry: ZipPreviewEntry): Promise<ReadableStream<Uint8Array>> {
  const header = await readBlobBytes(file.slice(entry.localOffset, entry.localOffset + 30))
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
  if (header.length !== 30 || u32(view, 0) !== 0x04034b50) throw new Error(`The ZIP entry ${entry.name} is invalid.`)
  const start = entry.localOffset + 30 + u16(view, 26) + u16(view, 28)
  if (start + entry.compressedSize > file.size) throw new Error(`The ZIP entry ${entry.name} is invalid.`)
  const compressed = openBlobStream(file.slice(start, start + entry.compressedSize))
  if (entry.compression === 0) return compressed
  else if (entry.compression === 8) {
    const decompressor = new DecompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>
    return compressed.pipeThrough(decompressor)
  } else throw new Error(`${entry.name} uses an unsupported ZIP compression method.`)
}
