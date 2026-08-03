export type ZipPreviewEntry = { name: string; compression: number; compressedSize: number; size: number; localOffset: number }

const u16 = (view: DataView, offset: number) => view.getUint16(offset, true)
const u32 = (view: DataView, offset: number) => view.getUint32(offset, true)
const decoder = new TextDecoder('utf-8', { fatal: true })

export async function inspectZip(file: File, maximumEntries = 20_000): Promise<ZipPreviewEntry[]> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const view = new DataView(bytes.buffer)
  let eocd = -1
  for (let offset = Math.max(0, bytes.length - 65_557); offset <= bytes.length - 22; offset += 1)
    if (u32(view, offset) === 0x06054b50) eocd = offset
  if (eocd < 0) throw new Error('The selected file is not a supported ZIP archive.')
  const count = u16(view, eocd + 10); const directoryOffset = u32(view, eocd + 16)
  if (count > maximumEntries) throw new Error('The ZIP contains too many entries for browser preview.')
  const entries: ZipPreviewEntry[] = []; let offset = directoryOffset
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || u32(view, offset) !== 0x02014b50) throw new Error('The ZIP central directory is invalid.')
    const nameLength = u16(view, offset + 28); const extraLength = u16(view, offset + 30); const commentLength = u16(view, offset + 32)
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength)).replace(/\\/g, '/')
    if (name.startsWith('/') || name.split('/').some(part => part === '..')) throw new Error('The ZIP contains an unsafe path.')
    if (!name.endsWith('/')) entries.push({ name, compression: u16(view, offset + 10), compressedSize: u32(view, offset + 20), size: u32(view, offset + 24), localOffset: u32(view, offset + 42) })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

export async function readZipText(file: File, entry: ZipPreviewEntry, maximumSize = 20 * 1024 * 1024): Promise<string> {
  if (entry.size > maximumSize) throw new Error(`${entry.name} is too large for browser preview.`)
  const bytes = new Uint8Array(await file.arrayBuffer()); const view = new DataView(bytes.buffer); const offset = entry.localOffset
  if (u32(view, offset) !== 0x04034b50) throw new Error(`The ZIP entry ${entry.name} is invalid.`)
  const start = offset + 30 + u16(view, offset + 26) + u16(view, offset + 28)
  const compressed = bytes.slice(start, start + entry.compressedSize)
  let output: Uint8Array
  if (entry.compression === 0) output = compressed
  else if (entry.compression === 8) {
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    output = new Uint8Array(await new Response(stream).arrayBuffer())
  } else throw new Error(`${entry.name} uses an unsupported ZIP compression method.`)
  if (output.length !== entry.size || output.length > maximumSize) throw new Error(`${entry.name} has an invalid extracted size.`)
  return decoder.decode(output)
}
