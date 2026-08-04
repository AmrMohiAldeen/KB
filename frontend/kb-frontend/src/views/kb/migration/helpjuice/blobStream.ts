const FALLBACK_CHUNK_SIZE = 64 * 1024

export async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer())

  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('The selected file could not be read.'))
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.readAsArrayBuffer(blob)
  })

  return new Uint8Array(buffer)
}

export function openBlobStream(blob: Blob): ReadableStream<Uint8Array> {
  if (typeof blob.stream === 'function') return blob.stream()

  let offset = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= blob.size) {
        controller.close()
        return
      }

      const nextOffset = Math.min(blob.size, offset + FALLBACK_CHUNK_SIZE)
      controller.enqueue(await readBlobBytes(blob.slice(offset, nextOffset)))
      offset = nextOffset
    }
  })
}
