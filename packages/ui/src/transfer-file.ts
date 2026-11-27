// The file in a drop or a paste (spec 0039, REQ-002); pure, so it is tested in Node.

/** The first file of a drop or a paste, from `files` or else from the items. */
export function fileFromTransfer(data: DataTransfer | null | undefined): File | undefined {
  if (!data) return undefined;
  const first = data.files?.[0];
  if (first) return first;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return undefined;
}
