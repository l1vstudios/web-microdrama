import { describe, expect, test } from 'bun:test';
import { parseShotOutput, promptCopyText } from '../src/shot-output';
import type { Shot } from '../src/shot-output';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DirectorOutput } from '../src/ShotOutput';
import { extractDialogue } from '../src/prompt-dialogue';
const shot = (number: string, image = 'IMAGE CONTENT', video = 'VIDEO CONTENT') => `## ${number} — 00:00–00:06 | 6s | Rania confronts Arya\n\nBlocking awal.\n\n### NANO BANANA PRO — IMAGE KEYFRAME\n\n\`\`\`text\n${image}\n\`\`\`\n\n### OMNI FLASH — VIDEO PROMPT\n\n\`\`\`text\n${video}\n\`\`\`\n\n`;
const shots = (value: string) => parseShotOutput(value).filter(p => p.type === 'shot').map(p => (p as { shot: Shot }).shot);
describe('Drado shot output', () => {
  test('pairs each image and video with the correct shot', () => {
    const result = shots(shot('S01', 'IMAGE ONE', 'VIDEO ONE') + shot('S02', 'IMAGE TWO', 'VIDEO TWO'));
    expect(result).toHaveLength(2);
    expect(result[0].image).toContain('IMAGE ONE'); expect(result[0].video).toContain('VIDEO ONE');
    expect(result[1].image).toContain('IMAGE TWO'); expect(result[1].video).toContain('VIDEO TWO');
    expect(result[0].image).not.toContain('VIDEO ONE'); expect(result[0].video).not.toContain('IMAGE TWO');
    expect(result[0].duration).toBe(6); expect(result[0].title).toBe('Rania confronts Arya');
    expect(result[0].timeRange).toBe('00:00–00:06'); expect(result[0].notes).toBe('Blocking awal.');
  });
  test('preserves master assets, preface, epilogue and full source', () => {
    const source = '# Master assets\n\n```text\nCHAR_RANIA_01\n```\n\n' + shot('S01') + '## Production notes\n\nKEYFRAME PENDING VISUAL CHECK\n';
    const parts = parseShotOutput(source);
    expect(parts.map(p => p.type === 'markdown' ? p.content : p.shot.raw).join('')).toBe(source);
    expect(parts[0].type).toBe('markdown'); expect(parts.at(-1)?.type).toBe('markdown');
    expect(shots(source)[0].video).not.toContain('Production notes');
  });
  test('does not interpret headings inside prompts as new shots', () => {
    expect(shots(shot('S01', '## S99 — not a real heading\n### OMNI FLASH\nStill image prompt'))).toHaveLength(1);
    expect(shots(shot('S01', '## S99 — not a real heading'))[0].image).toContain('S99');
  });
  test('supports Shot, Shoot, SHOT_S01 and same-level prompt headings', () => {
    for (const label of ['Shot 1', 'Shoot 1', 'SHOT_S01', '**S01**']) {
      expect(shots(shot(label).replaceAll('### NANO', '## NANO').replaceAll('### OMNI', '## OMNI'))[0].number).toBe(1);
    }
  });
  test('handles video-only revisions without inventing an image prompt', () => {
    const result = shots('## S03 — Revisi\n### OMNI FLASH — VIDEO PROMPT\n```text\nVIDEO ONLY\n```')[0];
    expect(result.image).toBe(''); expect(promptCopyText(result.video)).toBe('VIDEO ONLY');
  });
  test('pairs storyboard reference and Omni T2V under a stable shot heading', () => {
    const source = shot('S01', 'STORYBOARD_ID: STORYBOARD_EP01_C01_01\nPanel 1–5', 'REFERENCES: @STORYBOARD_EP01_C01_01').replace('IMAGE KEYFRAME', '5-PANEL STORYBOARD REFERENCE');
    const result = shots(source);
    expect(result).toHaveLength(1);
    expect(result[0].image).toContain('Panel 1–5');
    expect(result[0].video).toContain('@STORYBOARD_EP01_C01_01');
    expect(parseShotOutput(source).map(part => part.type === 'shot' ? part.shot.raw : part.content).join('')).toBe(source);
  });
  test('keeps casting replies as Markdown', () => {
    const source = '## CASTING\n1. AUTO\n2. CUSTOM\n3. CAMPURAN';
    expect(parseShotOutput(source)).toEqual([{ type: 'markdown', content: source }]);
  });
  test('copies full prompt bodies without fences, including nested shorter fences', () => {
    expect(promptCopyText('```text\nREFERENCES: @CHAR_RANIA_01\n\nFull prompt\n```')).toBe('REFERENCES: @CHAR_RANIA_01\n\nFull prompt');
    expect(promptCopyText('~~~~text\n```text\ninside\n```\n~~~~')).toBe('```text\ninside\n```');
    expect(promptCopyText('Plain full prompt')).toBe('Plain full prompt');
    const incomplete = '```text\nfirst\n```\n```text\nunfinished';
    expect(promptCopyText(incomplete)).toBe(incomplete);
  });
  test('renders each shot as a table row with prompt actions', () => {
    const html = renderToStaticMarkup(createElement(DirectorOutput, { content: shot('S01') + shot('S02') }));
    expect(html).toContain('<table class="shot-table">');
    expect(html.match(/class="shot-table-row"/g)).toHaveLength(2);
    expect(html).not.toContain('class="shot-card"');
    expect(html).toContain('Buka Nano Banana Pro Shot 1');
    expect(html).toContain('Buka Omni Flash Shot 2');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('Buka prompt Shot 1'); expect(html).toContain('Buka prompt Shot 2');
    expect(html).not.toContain('IMAGE CONTENT'); expect(html).not.toContain('VIDEO CONTENT');
  });
  test('extracts character-attributed dialogue for the Dialog tab', () => {
    const dialogue = extractDialogue(`CAMERA: close-up; keep the framing "steady".\nDIALOGUE:\nCHAR_RANIA_01 (Rania): "Jangan pergi."\n- CHAR_BIMA_02 (Bima): “Aku harus pergi.”`);
    expect(dialogue).toHaveLength(2);
    expect(dialogue.map(line => line.text)).toEqual(['Jangan pergi.', 'Aku harus pergi.']);
    expect(dialogue.map(line => line.speaker)).toEqual(['Rania', 'Bima']);
    expect(dialogue.map(line => line.speakerId)).toEqual(['CHAR_RANIA_01', 'CHAR_BIMA_02']);
  });
  test('accepts Markdown-formatted explicit dialogue fields', () => {
    const dialogue = extractDialogue('LINE_1\nSPEAKER_ID: CHAR_RANIA_01\nSPEAKER_NAME: Rania\n**EXACT_LINE:** "Aku di sini."');
    expect(dialogue).toHaveLength(1);
    expect(dialogue[0]).toMatchObject({ text: 'Aku di sini.', speaker: 'Rania', speakerId: 'CHAR_RANIA_01' });
  });
  test('extracts Omni dialogue target maps', () => {
    const dialogue = extractDialogue(`DIALOGUE TARGET MAP:
S02_L01 0.3–1.2s Arya/VOICE_ARYA_01 → Bagas, [tegas lelah], "Besok ikut kerja." Arya mouth only.
S02_L02 2.1–3.0s Bagas/VOICE_BAGAS_01 → Arya, [manja defensif], "Aku masih sekolah." Bagas mouth only.`);
    expect(dialogue).toHaveLength(2);
    expect(dialogue.map(line => line.text)).toEqual(['Besok ikut kerja.', 'Aku masih sekolah.']);
    expect(dialogue.map(line => line.speaker)).toEqual(['Arya', 'Bagas']);
    expect(dialogue.map(line => line.emotion)).toEqual(['tegas lelah', 'manja defensif']);
  });
});
