// Carga de documentos: archivos locales (PDF, DOCX, TXT, Markdown, HTML), enlaces y texto pegado.

import { blocksFromHtml, blocksFromMarkdown, blocksFromPlainText } from '../text/blocks';
import type { Block } from '../text/segment';

export interface LoadedDocument {
  title: string;
  blocks: Block[];
}

export const ACCEPTED_FILES = '.pdf,.docx,.txt,.md,.markdown,.html,.htm,.text';

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

/** Decodifica texto probando UTF-8 y, si hay caracteres inválidos, Windows-1252 (habitual en .txt antiguos). */
function decodeText(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  return new TextDecoder('windows-1252').decode(buffer);
}

export async function loadFile(file: File): Promise<LoadedDocument> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const title = stripExtension(file.name);
  const buffer = await file.arrayBuffer();
  return loadBuffer(buffer, ext, file.type, title);
}

async function loadBuffer(buffer: ArrayBuffer, ext: string, mime: string, title: string): Promise<LoadedDocument> {
  let blocks: Block[];
  if (ext === 'pdf' || mime === 'application/pdf') {
    const { blocksFromPdf } = await import('./pdf');
    blocks = await blocksFromPdf(buffer);
  } else if (ext === 'docx' || mime.includes('wordprocessingml')) {
    const { htmlFromDocx } = await import('./docx');
    blocks = blocksFromHtml(await htmlFromDocx(buffer));
  } else if (ext === 'html' || ext === 'htm' || mime.includes('html')) {
    const html = decodeText(buffer);
    blocks = blocksFromHtml(html);
    title = new DOMParser().parseFromString(html, 'text/html').title.trim() || title;
  } else if (ext === 'md' || ext === 'markdown' || mime.includes('markdown')) {
    blocks = blocksFromMarkdown(decodeText(buffer));
  } else {
    blocks = blocksFromPlainText(decodeText(buffer));
  }
  if (!blocks.length) {
    throw new Error(
      ext === 'pdf'
        ? 'No se encontró texto en el PDF. Puede que sea un documento escaneado (imagen) sin capa de texto.'
        : 'El documento no contiene texto legible.',
    );
  }
  return { title, blocks };
}

/** Enlaces de Google Docs → exportación (el documento debe ser público). */
function resolveUrl(raw: string): { url: string; ext?: string } {
  const url = raw.trim();
  const gdoc = url.match(/docs\.google\.com\/document\/d\/([\w-]+)/);
  if (gdoc) return { url: `https://docs.google.com/document/d/${gdoc[1]}/export?format=html`, ext: 'html' };
  const dropbox = url.match(/^https:\/\/www\.dropbox\.com\/(.*)$/);
  if (dropbox) return { url: `https://dl.dropboxusercontent.com/${dropbox[1].replace(/[?&]dl=0/, '')}` };
  return { url };
}

export async function loadUrl(raw: string): Promise<LoadedDocument> {
  if (!/^https?:\/\//i.test(raw.trim())) throw new Error('Introduce un enlace que empiece por http:// o https://');
  const { url, ext: forcedExt } = resolveUrl(raw);
  let res: Response;
  try {
    res = await fetch(url, { redirect: 'follow' });
  } catch {
    throw new Error(
      'No se pudo descargar el enlace. Muchos sitios bloquean la lectura desde otras páginas (CORS): ' +
        'descarga el documento y súbelo como archivo, o copia y pega el texto.',
    );
  }
  if (!res.ok) throw new Error(`El servidor respondió ${res.status} al descargar el documento.`);
  const mime = res.headers.get('content-type') ?? '';
  const path = new URL(res.url || url).pathname;
  const ext = forcedExt ?? path.split('.').pop()?.toLowerCase() ?? '';
  const name = decodeURIComponent(path.split('/').filter(Boolean).pop() ?? new URL(url).hostname);
  return loadBuffer(await res.arrayBuffer(), mime.includes('html') && !forcedExt ? 'html' : ext, mime, stripExtension(name));
}

export function loadPastedText(text: string, title = 'Texto pegado'): LoadedDocument {
  const blocks = /^\s{0,3}#{1,6}\s/m.test(text) ? blocksFromMarkdown(text) : blocksFromPlainText(text);
  if (!blocks.length) throw new Error('Pega algún texto para leer.');
  const first = blocks[0].kind === 'heading' ? blocks[0].text : title;
  return { title: first, blocks };
}
