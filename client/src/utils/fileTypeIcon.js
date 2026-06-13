import darkArchive from '../assets/file-icons/dark/archive.svg';
import darkAudio from '../assets/file-icons/dark/audio.svg';
import darkCode from '../assets/file-icons/dark/code.svg';
import darkDefault from '../assets/file-icons/dark/default.svg';
import darkDocument from '../assets/file-icons/dark/document.svg';
import darkImage from '../assets/file-icons/dark/image.svg';
import darkPdf from '../assets/file-icons/dark/pdf.svg';
import darkSpreadsheet from '../assets/file-icons/dark/spreadsheet.svg';
import darkVideo from '../assets/file-icons/dark/video.svg';

import lightArchive from '../assets/file-icons/light/archive.svg';
import lightAudio from '../assets/file-icons/light/audio.svg';
import lightCode from '../assets/file-icons/light/code.svg';
import lightDefault from '../assets/file-icons/light/default.svg';
import lightDocument from '../assets/file-icons/light/document.svg';
import lightImage from '../assets/file-icons/light/image.svg';
import lightPdf from '../assets/file-icons/light/pdf.svg';
import lightSpreadsheet from '../assets/file-icons/light/spreadsheet.svg';
import lightVideo from '../assets/file-icons/light/video.svg';

const ICONS = {
  dark: {
    archive: darkArchive,
    audio: darkAudio,
    code: darkCode,
    default: darkDefault,
    document: darkDocument,
    image: darkImage,
    pdf: darkPdf,
    spreadsheet: darkSpreadsheet,
    video: darkVideo,
  },
  light: {
    archive: lightArchive,
    audio: lightAudio,
    code: lightCode,
    default: lightDefault,
    document: lightDocument,
    image: lightImage,
    pdf: lightPdf,
    spreadsheet: lightSpreadsheet,
    video: lightVideo,
  },
};

const EXT_TO_TYPE = {
  // pdf
  pdf: 'pdf',
  // images
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  bmp: 'image', svg: 'image', ico: 'image', heic: 'image', heif: 'image', avif: 'image', tif: 'image', tiff: 'image',
  // video
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video', m4v: 'video', wmv: 'video', flv: 'video',
  // audio
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', m4a: 'audio', aac: 'audio', opus: 'audio', wma: 'audio',
  // spreadsheet
  xls: 'spreadsheet', xlsx: 'spreadsheet', csv: 'spreadsheet', tsv: 'spreadsheet', ods: 'spreadsheet', numbers: 'spreadsheet',
  // document
  doc: 'document', docx: 'document', odt: 'document', rtf: 'document', pages: 'document',
  txt: 'document', md: 'document', markdown: 'document',
  ppt: 'document', pptx: 'document', odp: 'document', key: 'document',
  // code
  js: 'code', mjs: 'code', cjs: 'code', jsx: 'code', ts: 'code', tsx: 'code',
  html: 'code', htm: 'code', css: 'code', scss: 'code', sass: 'code', less: 'code',
  json: 'code', xml: 'code', yaml: 'code', yml: 'code', toml: 'code', ini: 'code',
  py: 'code', rb: 'code', php: 'code', java: 'code', kt: 'code', kts: 'code',
  c: 'code', h: 'code', cpp: 'code', hpp: 'code', cc: 'code', cs: 'code',
  go: 'code', rs: 'code', swift: 'code', sh: 'code', bash: 'code', zsh: 'code',
  ps1: 'code', sql: 'code', r: 'code', lua: 'code', dart: 'code', vue: 'code', svelte: 'code',
  // archive
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', tgz: 'archive',
  bz2: 'archive', tbz: 'archive', tbz2: 'archive', xz: 'archive', txz: 'archive', zst: 'archive',
  lz: 'archive', lzma: 'archive', lzh: 'archive', z: 'archive', cab: 'archive', iso: 'archive',
  dmg: 'archive', jar: 'archive', war: 'archive', ear: 'archive',
};

const ARCHIVE_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
  'application/x-bzip',
  'application/x-bzip2',
  'application/x-xz',
  'application/zstd',
  'application/x-compressed',
  'application/x-iso9660-image',
  'application/x-apple-diskimage',
  'application/java-archive',
]);

export function getFileIconType(filename, mimeType) {
  if (mimeType) {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (ARCHIVE_MIME_TYPES.has(mimeType)) return 'archive';
    if (
      mimeType.includes('spreadsheet') ||
      mimeType === 'application/vnd.ms-excel' ||
      mimeType === 'text/csv' ||
      mimeType === 'text/tab-separated-values'
    ) return 'spreadsheet';
    if (
      mimeType === 'application/msword' ||
      mimeType.includes('wordprocessingml') ||
      mimeType.includes('presentation') ||
      mimeType === 'application/vnd.ms-powerpoint' ||
      mimeType === 'application/vnd.oasis.opendocument.text' ||
      mimeType === 'application/rtf' ||
      mimeType === 'text/rtf'
    ) return 'document';
  }

  if (filename && filename.includes('.')) {
    const ext = filename.split('.').pop().toLowerCase();
    if (EXT_TO_TYPE[ext]) return EXT_TO_TYPE[ext];
  }

  if (mimeType && mimeType.startsWith('text/')) return 'document';

  return 'default';
}

export function getFileIcon(filename, mimeType, isDarkTheme = true) {
  const type = getFileIconType(filename, mimeType);
  const set = isDarkTheme ? ICONS.dark : ICONS.light;
  return set[type] || set.default;
}
