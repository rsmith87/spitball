export function contextMenuPosition(clientX: number, clientY: number): { x: number; y: number } {
  const menuWidth = 184;
  const menuHeight = 188;
  return {
    x: Math.max(8, Math.min(clientX, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(clientY, window.innerHeight - menuHeight - 8)),
  };
}

export function selectedText(value: string, selectionStart: number, selectionEnd: number): string {
  return value.slice(selectionStart, selectionEnd);
}
