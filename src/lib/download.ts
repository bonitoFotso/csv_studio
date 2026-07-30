const BYTE_ORDER_MARK = '﻿';

export function downloadTextFile(filename: string, content: string, mimeType: string, bom = false): void {
  const blob = new Blob([bom ? BYTE_ORDER_MARK : '', content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
