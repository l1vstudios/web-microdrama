export type Shot = {
  id: string;
  number: number;
  heading: string;
  title: string;
  duration?: number;
  timeRange?: string;
  image: string;
  video: string;
  notes: string;
  raw: string;
};
export type OutputPart = { type: 'markdown'; content: string } | { type: 'shot'; shot: Shot };
type Heading = { start: number; end: number; level: number; text: string; shotNumber?: number; prompt?: 'image' | 'video'; assetId?: string };

function masterAssetId(text: string) {
  return text.match(/^(?:(?:ASSET\s+NAME\s+FOR\s+FLOW|ASSET|MASTER(?:\s+ASSET)?)\s*[:—–-]\s*)?((?:CHAR|LOC|PROP)_[A-Z0-9_]+)\b/)?.[1];
}
function masterPromptLabel(text: string): string | undefined {
  if (/\bFACE\s+ANCHOR\b/i.test(text)) return 'Face anchor';
  if (/\b(?:OUTFIT|WARDROBE)\s+ANCHOR\b/i.test(text)) return 'Outfit anchor';
  if (/\b(?:CHARACTER|LOCATION|PROP)\s+MASTER\b|\bMASTER\s+(?:IMAGE|SHEET)\b/i.test(text)) return 'Master image';
}

function classifyPrompt(text: string): 'image' | 'video' | undefined {
  if (/\bNANO\s+BANANA(?:\s+PRO)?\b|\bIMAGE\s+(?:KEYFRAME|PROMPT)\b/i.test(text)) return 'image';
  if (/\bOMNI(?:\s+FLASH)?\b|\bVIDEO\s+PROMPT\b/i.test(text)) return 'video';
}
function scanHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  let offset = 0;
  let entityLevel = 2;
  let fence: { char: string; length: number } | undefined;
  for (const line of content.split(/(?<=\n)/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*?)(?:\r?\n)?$/);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
    } else if (marker) {
      fence = { char: marker[1][0], length: marker[1].length };
    } else {
      const match = line.match(/^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
      const text = (match?.[2] ?? line).replace(/\*\*|__/g, '').replace(/`/g, '').trim();
      const shot = text.match(/^(?:(?:SHOT|SHOOT)\s*[_#:\-]?\s*S?\s*|S)(\d+)\b/i);
      const assetId = masterAssetId(text);
      // Accept standalone production labels without requiring Markdown headings.
      // IDs mentioned in sentences, tables, references, or fenced prompts are not headers.
      const plainAsset = Boolean(assetId && /^(?:ASSET\s+NAME\s+FOR\s+FLOW|ASSET|MASTER(?:\s+ASSET)?)\s*[:—–-]/i.test(text))
        || (/^(?:CHAR|LOC|PROP)_[A-Z0-9_]+(?:\s*[|:—–-]\s*[^\n]+)?$/.test(text)
          && /^\s*(?:`{3,}|~{3,}|NANO\s+BANANA|(?:CHARACTER|LOCATION|PROP)\s+MASTER|MASTER\s+(?:IMAGE|SHEET)|FACE\s+ANCHOR|(?:OUTFIT|WARDROBE)\s+ANCHOR|Create\b)/i.test(content.slice(offset + line.length, offset + line.length + 512)));
      const plainShot = Boolean(shot && /^(?:(?:SHOT|SHOOT)\s*[_#:\-]?\s*S?\s*|S)\d+\b(?:\s*[|:—–-]\s*[^\n]+)?$/i.test(text));
      const plainPrompt = text.length <= 180 && /^(?:(?:NANO\s+BANANA(?:\s+PRO)?|OMNI(?:\s+FLASH)?)(?=\s*(?:$|[—–:|_-]))|IMAGE\s+(?:KEYFRAME|PROMPT)|VIDEO\s+PROMPT|(?:CHARACTER|LOCATION|PROP)\s+MASTER|MASTER\s+(?:IMAGE|SHEET)|FACE\s+ANCHOR|(?:OUTFIT|WARDROBE)\s+ANCHOR)(?:\b|\s*[—–:-])/i.test(text);
      const plainSection = /^(?:PHASE\s+[A-Z](?:\s*[—–:-].*)?|STATUS\s+PRODUKSI|PRODUCTION\s+STATUS|MASTER\s+ASSETS?|CATATAN(?:\s+(?:PRODUKSI|COPY\s+FLOW|REVISI|UMUM|SHOT))?|PRODUCTION\s+NOTES|CONTINUITY\s+CHECKLIST|QA\s+CHECKLIST)\s*:?[ \t]*$/i.test(text);
      if (match || plainAsset || plainShot || plainPrompt || plainSection) {
        const level = match ? match[1].length : plainAsset || plainShot || plainSection ? 2 : entityLevel + 1;
        if (assetId || shot) entityLevel = level;
        else if (plainSection) entityLevel = 2;
        headings.push({ start: offset, end: offset + line.length, level, text, shotNumber: shot ? Number(shot[1]) : undefined, prompt: classifyPrompt(text), assetId });
      }
    }
    offset += line.length;
  }
  return headings;
}

/** Read presentation structure without changing the stored/exported agent response. */
export function parseShotOutput(content: string): OutputPart[] {
  const headings = scanHeadings(content);
  const parts: OutputPart[] = [];
  let cursor = 0;
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    if (heading.shotNumber === undefined || heading.start < cursor) continue;
    let endIndex = index + 1;
    while (endIndex < headings.length) {
      const next = headings[endIndex];
      if (next.shotNumber !== undefined || (next.level <= heading.level && !next.prompt)) break;
      endIndex++;
    }
    const end = headings[endIndex]?.start ?? content.length;
    if (heading.start > cursor) parts.push({ type: 'markdown', content: content.slice(cursor, heading.start) });
    const promptHeadings = headings.slice(index + 1, endIndex).filter(h => h.prompt);
    let image = ''; let video = ''; let notes = '';
    let sectionCursor = heading.end;
    for (const promptHeading of promptHeadings) {
      if (promptHeading.start < sectionCursor) continue;
      notes += content.slice(sectionCursor, promptHeading.start);
      const next = headings.find(h => h.start > promptHeading.start && h.start < end && (h.prompt || h.level <= promptHeading.level));
      const promptEnd = next?.start ?? end;
      const body = content.slice(promptHeading.end, promptEnd).trim();
      if (promptHeading.prompt === 'image') image += (image ? '\n\n' : '') + body;
      else video += (video ? '\n\n' : '') + body;
      sectionCursor = promptEnd;
    }
    notes += content.slice(sectionCursor, end);
    const timeRange = heading.text.match(/\b\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}\b/)?.[0];
    const durationText = heading.text.match(/\b(\d+)\s*(?:s\b|detik\b|seconds?\b)/i)?.[1];
    const title = heading.text.replace(/^(?:(?:SHOT|SHOOT)\s*[_#:\-]?\s*S?\s*|S)\d+\b/i, '')
      .replace(timeRange || /$^/, '').replace(/\b\d+\s*(?:s\b|detik\b|seconds?\b)/ig, '').replace(/^[\s|—–:\-]+|[\s|—–:\-]+$/g, '').trim();
    parts.push({ type: 'shot', shot: {
      id: `${heading.shotNumber}-${heading.start}`, number: heading.shotNumber, heading: heading.text,
      title: title || `Shot ${heading.shotNumber}`, duration: durationText ? Number(durationText) : undefined, timeRange,
      image, video, notes: notes.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '').trim(), raw: content.slice(heading.start, end),
    } });
    cursor = end;
  }
  if (cursor < content.length) parts.push({ type: 'markdown', content: content.slice(cursor) });
  return parts;
}

/** Remove one displayed shot group while preserving every other part of the response. */
export function removeShotTable(content: string, shots: Shot[]) {
  const parts = parseShotOutput(content);
  const first = parts.findIndex(part => part.type === 'shot' && part.shot.id === shots[0]?.id);
  const group = parts.slice(first, first + shots.length);
  if (first < 0 || !shots.length || group.length !== shots.length || group.some((part, index) => part.type !== 'shot' || part.shot.id !== shots[index].id || part.shot.raw !== shots[index].raw)) {
    throw new Error('Tabel sudah berubah. Muat ulang proyek sebelum menghapusnya.');
  }
  const updated = parts.filter((_, index) => index < first || index >= first + shots.length)
    .map(part => part.type === 'shot' ? part.shot.raw : part.content).join('');
  return updated.trim() ? updated : '_Tabel shot produksi telah dihapus._';
}

/** Copy code body only, so headings and Markdown fences do not enter Flow. */
export function promptCopyText(markdown: string) {
  const blocks: string[] = [];
  let fence: { char: string; length: number } | undefined;
  let body: string[] = [];
  for (const line of markdown.split('\n')) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!fence && marker) { fence = { char: marker[1][0], length: marker[1].length }; body = []; }
    else if (fence && marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) { blocks.push(body.join('\n')); fence = undefined; }
    else if (fence) body.push(line);
  }
  if (fence) return markdown.trim(); // Keep incomplete output intact rather than silently dropping it.
  return blocks.length ? blocks.join('\n\n') : markdown.trim();
}

export type MasterPrompt = { id: string; label: string; content: string };
export type MasterAsset = { id: string; kind: 'Karakter' | 'Lokasi' | 'Properti'; prompts: MasterPrompt[]; notes: string; raw: string };
export type MasterPart = { type: 'markdown'; content: string } | { type: 'asset'; asset: MasterAsset };
export function parseMasterAssets(content: string): MasterPart[] {
  const headings = scanHeadings(content);
  const parts: MasterPart[] = []; let cursor = 0;
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const id = heading.assetId;
    if (!id || heading.start < cursor) continue;
    let j = i + 1;
    while (j < headings.length && headings[j].level > heading.level && headings[j].shotNumber === undefined) j++;
    const end = headings[j]?.start ?? content.length;
    if (heading.start > cursor) parts.push({ type: 'markdown', content: content.slice(cursor, heading.start) });
    const body = content.slice(heading.end, end);
    const prompts: MasterPrompt[] = [];
    let notes = ''; let last = 0;
    // The master formats emitted by Drado use standalone fenced prompt blocks.
    const regex = /^ {0,3}(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^ {0,3}\1\s*$/gm;
    for (const match of body.matchAll(regex)) {
      const text = match[2].trim(); const first = text.split('\n').find(line => line.trim()) || '';
      const section = headings.findLast(candidate => candidate.start >= heading.end && candidate.start < heading.end + match.index!);
      const sectionLabel = section ? masterPromptLabel(section.text) : undefined;
      if (sectionLabel || /NANO\s+BANANA|(?:CHARACTER|LOCATION|PROP)\s+MASTER|FACE\s+ANCHOR|OUTFIT\s+ANCHOR|^Create\b/i.test(first)) {
        notes += body.slice(last, match.index);
        const label = sectionLabel || masterPromptLabel(first) || 'Master image';
        prompts.push({ id: String(prompts.length), label, content: match[0] });
        last = match.index! + match[0].length;
      }
    }
    notes += body.slice(last);
    if (!prompts.length) {
      // Unfenced master prompts still have reliable boundaries when explicitly labelled.
      const sections = headings.filter(candidate => candidate.start >= heading.end && candidate.start < end);
      let noteCursor = heading.end;
      let plainNotes = '';
      for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
        const section = sections[sectionIndex];
        const label = masterPromptLabel(section.text);
        if (!label) continue;
        const promptEnd = sections[sectionIndex + 1]?.start ?? end;
        const promptContent = content.slice(section.end, promptEnd).trim();
        if (!promptContent) continue;
        plainNotes += content.slice(noteCursor, section.start);
        noteCursor = promptEnd;
        prompts.push({ id: String(prompts.length), label, content: promptContent });
      }
      if (prompts.length) notes = plainNotes + content.slice(noteCursor, end);
    }
    if (!prompts.length) { prompts.push({ id: '0', label: 'Master image', content: body.trim() }); notes = ''; }
    parts.push({ type: 'asset', asset: { id, kind: id.startsWith('CHAR') ? 'Karakter' : id.startsWith('LOC') ? 'Lokasi' : 'Properti', prompts, notes: notes.replace(/^\s*-{3,}\s*$/gm, '').trim(), raw: content.slice(heading.start, end) } });
    cursor = end;
  }
  if (cursor < content.length) parts.push({ type: 'markdown', content: content.slice(cursor) });
  return parts;
}
