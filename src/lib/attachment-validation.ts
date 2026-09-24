const extensionTypes: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', zip: 'application/zip',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const allowed = new Set(Object.values(extensionTypes));
export function validateFile(file: File): string {
  const declared = file.type.toLowerCase().split(';', 1)[0].trim();
  const fallback = extensionTypes[file.name.split('.').at(-1)?.toLowerCase() || ''];
  // Some operating systems omit MIME or label ZIP/CSV using legacy aliases.
  // Only use the extension for generic/known aliases, never override a declared unsafe MIME.
  const mime = !declared || declared === 'application/octet-stream' ? fallback
    : declared === 'application/x-zip-compressed' ? 'application/zip'
    : declared === 'application/vnd.ms-excel' && fallback === 'text/csv' ? 'text/csv' : declared;
  if (!mime || !allowed.has(mime)) throw new Error('This file type is not supported. Use images, PDF, text, ZIP, or Office documents.');
  const limit = mime.startsWith('image/') ? 10 : 25;
  if (!file.size || file.size > limit * 1024 * 1024) throw new Error(`This file must be between 1 byte and ${limit} MB.`);
  return mime;
}
