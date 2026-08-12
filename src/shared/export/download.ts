export function localDateStamp(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function downloadBytes(data: BlobPart | Uint8Array, filename: string, type: string): void {
  const part = data instanceof Uint8Array ? data.slice().buffer : data;
  const url = URL.createObjectURL(new Blob([part], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
