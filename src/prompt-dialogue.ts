import type { Shot } from './shot-output';

type Span = { start: number; end: number; text: string; quote: string };
export type DialogueLine = Span & { id: string; speaker: string; speakerId?: string; emotion: string };
const doubleQuotes = /"((?:\\.|[^"\\])*)"|“((?:\\.|[^”\\])*)”/g;
const quotes = new RegExp(`${doubleQuotes.source}|'((?:\\\\.|[^'\\\\])*)'`, 'g');
const decode = (value: string) => value.replace(/\\(["'”\\])/g, '$1');
const encode = (value: string, quote: string) => quote ? value.replace(/\\/g, '\\\\').replaceAll(quote === '“' ? '”' : quote, `\\${quote === '“' ? '”' : quote}`) : value;

const dialogueFields = 'LINE_ID|SPEAKER(?:_ID)?|CHARACTER_ID|VOICE_ID|ADDRESSEE|EMOTION_TAG|DELIVERY|EXACT[_ ]LINE|EXACT[_ ](?:INDONESIAN[_ ])?DIALOGUE|DIALOGUE[_ ]TEXT|SPOKEN[_ ]LINE|SPEAKER_VISIBLE_MOUTH|NON[_ -]SPEAKERS|TIME_WINDOW';
function lastField(context: string, field: string) {
  const marker = [...context.matchAll(new RegExp(`(?:^|\\n|[;.])\\s*${field}(?:[ \\t]*:[ \\t]*|[ \\t]+)`, 'gi'))].at(-1);
  if (!marker) return '';
  const value = context.slice(marker.index! + marker[0].length);
  // Metadata can share a line: LINE_ID S01_L01. SPEAKER: Ratna / CHAR_RATNA_01.
  // A full stop inside a name (e.g. Dr. Bima) is not a field separator.
  return value.split(new RegExp(`\\r?\\n|;|\\.[ \\t]+(?=(?:${dialogueFields})\\b)`, 'i'))[0].trim().replace(/\.$/, '').trim();
}

function lineMetadata(context: string) {
  // Prompts produced by the director use both LINE_ID and LINE_1-style labels.
  const marker = [...context.matchAll(/\b(?:LINE_ID|LINE[_ ]\d+)(?:[ \t]*:[ \t]*|[ \t]+)[A-Z0-9_-]+/gi)].at(-1);
  const block = marker ? context.slice(marker.index) : context;
  const rawSpeaker = lastField(block, 'SPEAKER(?:_ID)?');
  const speakerId = rawSpeaker.match(/\bCHAR_[A-Z0-9_]+\b/i)?.[0];
  const name = (lastField(block, 'SPEAKER_NAME') || rawSpeaker).split('/')[0].trim();
  const speaker = /^@?CHAR_[A-Z0-9_]+$/i.test(name)
    ? name.replace(/^@?CHAR_/i, '').replace(/_\d+$/, '').split('_').map(word => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(' ')
    : name;
  return { speaker: speaker || 'Pembicara belum terdeteksi', speakerId, emotion: lastField(block, 'EMOTION_TAG'), lineId: lastField(block, 'LINE_ID') };
}

function speakerLabel(value: string) {
  return /^@?CHAR_[A-Z0-9_]+$/i.test(value)
    ? value.replace(/^@?CHAR_/i, '').replace(/_\d+$/, '').split('_').map(word => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(' ')
    : value;
}

function quotedText(value: string) {
  return decode(value.slice(1, -1));
}

/** Read only explicit spoken-line fields, never quotes from camera or performance notes. */
export function extractDialogue(prompt: string): DialogueLine[] {
  const result: DialogueLine[] = [];
  // Accept Markdown-emphasised labels and separators commonly used in manually
  // edited prompts, while retaining the explicit-field requirement.
  const fields = /\b(?:EXACT[_ ]LINE|EXACT[_ ](?:INDONESIAN[_ ])?DIALOGUE|DIALOGUE[_ ]TEXT|SPOKEN[_ ]LINE)\s*(?:\*{1,2}|_{1,2})?\s*(?::|=|-)\s*(?:\*{1,2}|_{1,2})?\s*(?:\[[^\]\n]*\]\s*)?/gi;
  for (const field of prompt.matchAll(fields)) {
    const start = field.index! + field[0].length;
    const remaining = prompt.slice(start);
    const quoted = new RegExp(`^(?:${quotes.source})`).exec(remaining);
    const text = quoted ? decode(quoted[1] ?? quoted[2] ?? quoted[3] ?? '') : remaining.split(/\r?\n/)[0].trimEnd();
    if (!text.trim() || /^(?:none|no dialogue|silent|tidak ada)[.\s]*$/i.test(text)) continue;
    const context = prompt.slice(0, field.index);
    const metadata = lineMetadata(context);
    result.push({ id: `${metadata.lineId || 'line'}-${result.length}`, start: start + (quoted ? 1 : 0), end: start + (quoted ? quoted[0].length - 1 : text.length), text, quote: quoted?.[0][0] || '', speaker: metadata.speaker, speakerId: metadata.speakerId, emotion: metadata.emotion });
  }
  if (result.length) return result;

  // Omni storyboard prompts emit a compact DIALOGUE TARGET MAP. Its speaker,
  // listener, emotion and exact quote all live on one line rather than in an
  // EXACT_LINE block, e.g. `S02_L01 0.3–1.2s Arya → Bagas, [tegas], "..."`.
  const targetMapLine = /^[ \t]*([A-Z0-9_-]+_L\d+)\s+[\d.,:–—-]+\s*(?:s|detik|seconds?)?\s+([^\n/→]+?)(?:\/VOICE_[A-Z0-9_]+)?\s*(?:→|->)\s*[^,\n]+,\s*\[([^\]\n]+)\],\s*("(?:\\.|[^"\\])*"|“(?:\\.|[^”\\])*”|'(?:\\.|[^'\\])*')/gmi;
  for (const match of prompt.matchAll(targetMapLine)) {
    const quoted = match[4];
    const quoteOffset = match[0].indexOf(quoted);
    const rawSpeaker = match[2].trim();
    result.push({
      id: match[1],
      start: match.index! + quoteOffset + 1,
      end: match.index! + quoteOffset + quoted.length - 1,
      text: quotedText(quoted),
      quote: quoted[0],
      speaker: speakerLabel(rawSpeaker),
      speakerId: rawSpeaker.match(/\bCHAR_[A-Z0-9_]+\b/i)?.[0],
      emotion: match[3].trim(),
    });
  }
  if (result.length) return result;

  // A concise DIALOGUE block is also a supported prompt format, for example:
  // CHAR_RANIA_01 (Rania): "Jangan pergi."
  // It is deliberately restricted to an attributed, quoted utterance so quotes
  // in camera and performance instructions never become editable dialogue.
  const attributedLine = /^[ \t]*(?:[-*][ \t]*)?(?:(?:SPEAKER(?:_ID)?|CHARACTER(?:_ID)?)\s*[:=-]\s*)?(@?CHAR_[A-Z0-9_]+|[A-Z][\p{L}\p{M}'’.-]*(?:[ \t]+[A-Z][\p{L}\p{M}'’.-]*){0,4})\s*(?:\(([^)\n]*)\))?\s*[:—–-]\s*("(?:\\.|[^"\\])*"|“(?:\\.|[^”\\])*”|'(?:\\.|[^'\\])*')[ \t]*$/gmiu;
  for (const match of prompt.matchAll(attributedLine)) {
    const quoted = match[3];
    const line = match[0];
    const quoteOffset = line.lastIndexOf(quoted);
    const rawSpeaker = match[1].replace(/^@/, '');
    const parenthetical = match[2] || '';
    const speakerId = [rawSpeaker, parenthetical].join(' ').match(/\bCHAR_[A-Z0-9_]+\b/i)?.[0];
    const namedSpeaker = speakerId && !/^@?CHAR_/i.test(rawSpeaker) ? rawSpeaker : parenthetical.replace(/\bCHAR_[A-Z0-9_]+\b/i, '').trim();
    result.push({
      id: `line-${result.length}`,
      start: match.index! + quoteOffset + 1,
      end: match.index! + quoteOffset + quoted.length - 1,
      text: quotedText(quoted),
      quote: quoted[0],
      speaker: speakerLabel(namedSpeaker || rawSpeaker),
      speakerId,
      emotion: '',
    });
  }
  if (result.length) return result;

  // Older prompts may put the exact utterance directly after a speech verb.
  const spoken = /\b(?:speaks?(?:\s+directly\s+to\s+[^:\n]+)?|says?|berkata|mengatakan|dialog(?:ue)?)\s*:\s*(?:\[[^\]\n]*\]\s*)?("(?:\\.|[^"\\])*"|“[^”]*”)/gi;
  for (const match of prompt.matchAll(spoken)) {
    const quoted = match[1]; const start = match.index! + match[0].lastIndexOf(quoted) + 1;
    const context = prompt.slice(0, match.index);
    const metadata = lineMetadata(context);
    result.push({ id: `line-${result.length}`, start, end: start + quoted.length - 2, text: decode(quoted.slice(1, -1)), quote: quoted[0], speaker: metadata.speaker, speakerId: metadata.speakerId, emotion: metadata.emotion });
  }
  return result;
}

export function replaceShotDialogue(message: string, shot: Shot, lines: DialogueLine[], values: string[]) {
  if (lines.length !== values.length || !lines.length) throw new Error('Dialog shot tidak ditemukan.');
  if (values.some(value => !value.trim() || value.length > 2000 || /^\s*(?:`{3,}|~{3,})/m.test(value))) throw new Error('Isi setiap dialog dengan 1–2.000 karakter, tanpa penanda blok prompt.');
  const offset = message.indexOf(shot.raw);
  const videoOffset = shot.raw.indexOf(shot.video);
  if (offset < 0 || videoOffset < 0) throw new Error('Prompt berubah. Buka ulang shot sebelum menyimpan.');
  const changes = new Map<string, Set<string>>();
  lines.forEach((line, index) => {
    const valuesForText = changes.get(line.text) || new Set<string>();
    valuesForText.add(values[index]); changes.set(line.text, valuesForText);
  });
  const replacements = new Map<number, { start: number; end: number; value: string }>();
  // Keep exact repeated utterances in image/video/notes synchronized. Ambiguous lines
  // shared by different speakers are changed only at their explicit spoken-line field.
  for (const match of shot.raw.matchAll(new RegExp(doubleQuotes.source, 'g'))) {
    const oldText = decode(match[1] ?? match[2] ?? match[3] ?? '');
    const candidates = changes.get(oldText);
    if (candidates?.size !== 1) continue;
    const value = [...candidates][0];
    if (value === oldText) continue;
    const start = match.index! + 1;
    replacements.set(start, { start, end: match.index! + match[0].length - 1, value: encode(value, match[0][0]) });
  }
  lines.forEach((line, index) => {
    if (values[index] === line.text) return;
    const start = videoOffset + line.start;
    replacements.set(start, { start, end: videoOffset + line.end, value: encode(values[index], line.quote) });
  });
  let raw = shot.raw;
  for (const change of [...replacements.values()].sort((a, b) => b.start - a.start)) raw = raw.slice(0, change.start) + change.value + raw.slice(change.end);
  return message.slice(0, offset) + raw + message.slice(offset + shot.raw.length);
}
