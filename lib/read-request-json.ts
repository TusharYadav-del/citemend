export type JsonBodyResult = { kind: "ok"; value: unknown } | { kind: "invalid" } | { kind: "too_large" };

/** Reads only a bounded JSON body and rejects invalid UTF-8 instead of buffering arbitrary requests. */
export async function readRequestJson(request: Request, maxBytes = 16_384): Promise<JsonBodyResult> {
  const reader = request.body?.getReader();
  if (!reader) return { kind: "invalid" };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel().catch(() => {}); return { kind: "too_large" }; }
      chunks.push(value);
    }
  } catch { return { kind: "invalid" }; }
  finally { reader.releaseLock(); }
  try { return { kind: "ok", value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) as unknown }; }
  catch { return { kind: "invalid" }; }
}
