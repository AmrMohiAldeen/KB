const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizePastedPlainText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(UNSAFE_CONTROL_CHARACTERS, '');
}
