import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Box, Check, ChevronDown, ChevronRight, Clapperboard, Download, Eye, EyeOff, Film, Image as ImageIcon, Loader2, Lock, MapPin, Pencil, Play, RefreshCw, ShieldCheck, Sparkles, Square, Terminal, Users, Zap, Save, Boxes, Copy, Table2, Trash2, } from "lucide-react";
import LoginPage from "./LoginPage";
import "./styles.css";

const VITE_ENV = (import.meta as any)?.env || {};
const OPENROUTER_BRIDGE_URL = VITE_ENV.VITE_OPENROUTER_BRIDGE_URL || "http://localhost:8787/openai/v1";
const API_ROOT = OPENROUTER_BRIDGE_URL.replace(/\/openai\/v1\/?$/, "");
const TEXT_MODEL = "gemini-3.6-flash";

const IMAGE_MODEL = "gemini-nano-banana-2.1";
const IMAGE_PROVIDER_OPENROUTER = "google-ai";

const IMAGE_MODEL_PRESETS = [
    { id: "gemini-nano-banana-2.1", label: "Nano Banana 2.1" },
    { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image" },
    { id: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image" },
    { id: "gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image Preview" },
    { id: "gemini-3-pro-image-preview", label: "Gemini 3 Pro Image Preview" },
];

const DEFAULT_VIDEO_MODEL = "veo-3.1-generate-preview";
const VIDEO_MODEL_FALLBACKS = [
    { id: "veo-3.1-generate-preview", name: "Google: Veo 3.1", costPerSecond: null, supportedResolutions: ["720p", "1080p", "4k"], supportedDurations: [8], supportedAspectRatios: ["9:16", "16:9"], supportedFrameImages: ["first_frame"], pricingSkus: {}, generateAudio: false },
    { id: "veo-3.1-fast-generate-preview", name: "Google: Veo 3.1 Fast", costPerSecond: null, supportedResolutions: ["720p", "1080p"], supportedDurations: [8], supportedAspectRatios: ["9:16", "16:9"], supportedFrameImages: ["first_frame"], pricingSkus: {}, generateAudio: false },
];

// Lock proporsi manusia terhadap lingkungan supaya karakter tidak di-render seperti raksasa.
const HUMAN_SCALE_LOCK = [
    "HUMAN SCALE LOCK:",
    "- Render every human at realistic real-world body proportions relative to the environment, architecture, doorways, furniture, vehicles, and props.",
    "- A standing adult must be roughly head-height to a normal door and must NOT tower over buildings, walls, trees, or vehicles.",
    "- Do NOT render characters as giants, oversized, or out of scale. Characters must fit naturally within the location, never dwarfing the set.",
    "- Keep consistent perspective and a single vanishing point so near/far size relationships look physically correct.",
    "- Props and set dressing keep their real-world size relative to the human body (a cup stays cup-sized, a lamp stays lamp-sized).",
    "- Place characters with their feet on a believable ground plane; no floating, no forced foreground zoom that inflates body size.",
].join("\n");
// Pastikan gambar mengisi penuh frame sesuai aspect ratio target, tanpa area terpotong.
const frameFillLock = (aspectRatio = "9:16") => [
    `FRAME FILL LOCK (${aspectRatio}):`,
    `- The image MUST natively be ${aspectRatio} and fill the entire ${aspectRatio} frame edge-to-edge.`,
    "- NO letterbox, NO pillarbox, NO black bars, NO white/colored borders, NO padding, NO margins, NO rounded corners.",
    `- Do NOT place a differently-shaped image inside the frame. The whole canvas is one continuous ${aspectRatio} scene.`,
    "- Do NOT crop or cut off any required character, face, or the primary action/prop; keep all required subjects fully inside the frame with a safe margin.",
    `- Compose specifically for ${aspectRatio} framing so nothing important touches or exceeds the frame edges.`,
].join("\n");
const imageModelForProvider = (_provider, requestedModel = "") => {
    return String(requestedModel || "").trim() || IMAGE_MODEL;
};
const formatUsd = (value, digits = 4) => {
    const number = Number(value || 0);
    return Number.isFinite(number) ? `$${number.toFixed(digits)}` : "$0.0000";
};
const videoModelCostPerSecond = (model) => {
    if (!model) return null;
    if (Number.isFinite(Number(model.costPerSecond))) return Number(model.costPerSecond);
    const prices = Object.entries(model.pricingSkus || {})
        .filter(([key]) => key.includes("second"))
        .map(([, value]) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);
    return prices.length ? Math.min(...prices) : null;
};
const estimateVideoCost = (model, durationSeconds = 8) => {
    const perSecond = videoModelCostPerSecond(model);
    return perSecond ? perSecond * Number(durationSeconds || 8) : null;
};

const PROJECT_ASPECT_RATIOS = ["9:16", "16:9"];
const PROJECT_ASPECT_RATIO_LABELS = {
    "9:16": "9:16 Vertical",
    "16:9": "16:9 Horizontal",
};

const wardrobeAndEraLock = (country = "Indonesia") => [
    "WARDROBE / ERA LOCK:",
    "- Locked wardrobe is an identity attribute. Preserve clothing silhouette, color, motif/pattern, fabric texture, sleeve length, collar/neckline, layers, accessories, footwear, hair covering/headwear, and fit in every storyboard image, anchor image, and video.",
    "- Do NOT modernize, simplify, beautify, swap, recolor, remove, or redesign locked wardrobe during image or video generation.",
    `- Wardrobe, props, architecture, vehicles, furniture, signage, money, tools, hairstyles, and social etiquette must match the chosen drama era and ${country} cultural setting.`,
    "- If the story is historical, dynasty-era, palace, royal, kingdom, wuxia-like, or ancient, use period-appropriate production design only. No modern shirts, zippers, watches, cars, phones, plastic bottles, neon signs, modern roads, or contemporary interiors unless the premise explicitly requires them.",
    "- If the story is modern, keep wardrobe and props modern and region-accurate; do not drift into fantasy palace or dynasty styling.",
].join("\n");

const ultraRealisticStoryboardLock = (aspectRatio = "9:16") => [
    "ULTRA-REALISTIC STORYBOARD / REFERENCE LOCK:",
    `- Every storyboard/reference/anchor image must be photorealistic live-action, composed natively for ${aspectRatio}.`,
    "- The image should look like a real production still from a finished drama, not anime, cartoon, illustration, 3D render, collage, concept art, poster, or fashion catalog.",
    "- Use natural camera perspective, believable lensing, realistic skin texture, real fabric behavior, practical lighting, and grounded production set detail.",
    "- Character references may show different sides/angles and expressions when requested, but identity and locked wardrobe remain unchanged.",
].join("\n");

const environmentBlendLock = (location: any = {}, visualStyle = "") => [
    "ENVIRONMENT / CHARACTER BLEND LOCK:",
    "- The shot must feel like one real camera captured the characters, props, and location together at the same moment. Nothing should look pasted on, cut out, greenscreened, separately lit, over-sharp, over-saturated, or from a different source image.",
    "- Match all characters and props to the location's actual lighting direction, color temperature, contrast, exposure, shadow softness, ambient bounce light, and practical light sources.",
    "- Add believable contact shadows and occlusion where feet, knees, hands, clothing, props, chairs, walls, floor, tables, counters, vehicles, and set pieces touch or overlap.",
    "- Keep perspective, lens distortion, depth of field, grain/noise, motion blur, skin texture, fabric texture, and color grade consistent across foreground characters and background environment.",
    "- Wardrobe colors may remain identity-accurate, but they must inherit the scene's light and color cast so they sit naturally in the room/street. Avoid neon/pop-out colors unless the location lighting truly causes them.",
    "- Faces and skin must receive the same key light/rim light/shadow pattern as nearby walls, furniture, floor, and props. No studio-lit face floating inside a dim location.",
    "- Character scale and ground contact must match the architecture, furniture, doors, steps, floor plane, and camera height.",
    "- Blend means cinematic integration only. Do NOT blend identities, faces, wardrobes, or prop designs between different Character/Prop IDs.",
    `LOCATION_LIGHTING: ${toText(location?.lighting) || "use the lighting visible in the approved anchor/location reference"}`,
    `LOCATION_COLORS: ${toText(location?.colors) || "use the color palette visible in the approved anchor/location reference"}`,
    visualStyle ? `SERIES_GRADE: ${limitText(visualStyle, 500)}` : "",
].filter(Boolean).join("\n");

const dynamicAudioLanguageLock = (language = "Bahasa Indonesia", country = "Indonesia") => [
    "DYNAMIC AUDIO / ARTICULATION LOCK:",
    `- All audible dialogue must be natural ${language} with a believable ${country} accent and conversational rhythm.`,
    "- Every named character must keep one stable voice identity across all shots: same apparent actor, same timbre family, same pitch range, same accent, same speech texture, and same baseline cadence. Emotion may change performance intensity, but must not change the character into a different voice.",
    "- Dialogue text is exact. Do not duplicate words, repeat syllables, stutter accidentally, paraphrase, translate, add filler, skip words, or swap speaker lines.",
    "- One line is spoken once by the assigned speaker only. No echo, no accidental double-take, no overlapping duplicate voice, and no second character mouthing the same text.",
    "- Articulation must match the written line and selected intonation dynamically: emotion changes tone, pace, breath, pause length, facial expression, and mouth movement without changing the text.",
    "- Do not default every line to slow, soft, graceful delivery. Angry/firm lines need sharper consonants, stronger breath pressure, tighter jaw, and more decisive timing; sad/pleading lines may slow down; fear/panic may become broken and breathy.",
    "- Inner voice / membatin is voice-over only with mouth closed. Bergumam is audible quiet murmur with slight lip motion.",
].join("\n");

const realisticMotionLock = [
    "REALISTIC MOTION LOCK:",
    "- Movement must be smooth, physically plausible, and human-scale. No robotic motion, foot sliding, teleporting, frozen bodies, rubbery faces, snapping poses, jittery hands, or impossible limb bends.",
    "- Walking uses natural stride length, planted feet, balanced hips, realistic shoulder counter-motion, and collision-aware paths.",
    "- Gestures are motivated by the scene and remain restrained like real actors in a live-action drama.",
    "- Body movement must match emotion and intonation. Anger/firmness is tense, grounded, sharp, decisive, and heavy; it is NOT graceful, floating, soft, dance-like, slow-motion, or weak. Sadness is weighted and inward. Fear is tense and guarded. Joy is lighter but still realistic.",
    "- Camera movement is smooth and motivated; no sudden unrequested zooms, shakes, scene jumps, or scale distortions.",
].join("\n");

const videoIdentityContinuityLock = [
    "VIDEO IDENTITY / WARDROBE / FOOTWEAR CONTINUITY LOCK:",
    "- Across the entire video, every character must keep the exact same face, face shape, jawline, nose, lips, eye shape, skin tone, age appearance, hairline, hairstyle, hair color, body proportions, and height.",
    "- Clothing must remain identical frame-to-frame: same garment type/model, same cut, same collar/neckline, same sleeve length, same layers, same color, same shade, same motif/pattern, same fabric texture, same fit, same dirt/wear, same buttons/ties/sash/belt.",
    "- Footwear must remain identical frame-to-frame: same shoes/sandals/slippers/boots, same color, same sole shape, same strap/lace details, same wear and material. Do not swap shoes into sandals or sandals into shoes.",
    "- Accessories must remain identical: earrings, necklace, ring, bracelet, watch, glasses, headscarf, crown, hairpin, belt, pouch, bag strap, weapon sheath, or any small visible item stays the same unless the written ACTION explicitly removes or changes it.",
    "- No color drift: black stays black, red stays the same red, patterned fabric stays patterned, batik/sarong/floral/check/stripe motifs remain readable and do not become plain.",
    "- No garment morphing during motion. Do not change a jacket into a shirt, dress into a robe, sandals into boots, loose hair into tied hair, headcloth into bare hair, or simple outfit into royal/fantasy costume.",
    "- No face morphing or actor replacement. Do not beautify, age-shift, ethnicity-shift, skin-lighten/darken, change makeup style, or average faces between characters.",
    "- If the model is uncertain, copy the attached anchor frame and CHARACTER_MASTER exactly instead of inventing a new fashion/design.",
].join("\n");

const liveActionAntiCartoonLock = [
    "LIVE-ACTION ANTI-CARTOON LOCK:",
    "- Render as real live-action footage from a drama production, not cartoon, anime, manga, comic, illustration, painterly art, 3D animation, game cinematic, plastic CGI, doll-like render, wax figure, or stylized beauty filter.",
    "- Use natural skin pores, real fabric behavior, practical lighting, normal camera lens perspective, realistic depth, and grounded human acting.",
    "- Avoid over-smoothed faces, oversized sparkling eyes, fantasy-glow skin, toon outlines, cel shading, painted textures, artificial poster grading, and unreal costume simplification.",
].join("\n");

const AI_DIRECTOR_LAYERS = [
    {
        id: "SHOWRUNNER_DIRECTOR",
        title: "Showrunner Director",
        rule: "Build a complete serialized arc: hook, secret, escalating conflict, reversal, emotional consequence, reveal, and cliffhanger.",
    },
    {
        id: "CONTINUITY_DIRECTOR",
        title: "Continuity Director",
        rule: "Track exact character state, wardrobe, footwear, props, screen side, location micro-layout, emotional carry-over, and knowledge chronology from shot to shot.",
    },
    {
        id: "SHOT_VARIETY_DIRECTOR",
        title: "Shot Variety Director",
        rule: "Mix dialogue, inner monologue, solo walk, silent reaction, hidden watching, prop reveal, waiting, leaving, interruption, confrontation, and cliffhanger beats.",
    },
    {
        id: "DIALOGUE_DIRECTOR",
        title: "Dialogue Director",
        rule: "Keep dialogue short, natural, character-specific, Indonesian/native to the selected language, assigned to the correct speaker, and never duplicated.",
    },
    {
        id: "VIDEO_ENGINE_DIRECTOR",
        title: "Video Engine Director",
        rule: "Translate each beat into engine-safe image-to-video instructions: one location, exact first-frame authority, exact cast, camera movement, speech mode, and motion realism.",
    },
    {
        id: "QA_DIRECTOR",
        title: "QA Director",
        rule: "Reject drift: changed face, changed wardrobe, changed shoes/sandals, cartoon style, extra humans, missing cast, wrong prop, broken continuity, or weak cliffhanger.",
    },
];

const buildAiDirectorModeContract = (country = "Indonesia", language = "Bahasa Indonesia", aspectRatio = "9:16") => [
    "AI DIRECTOR MODE — MULTI-LAYER DRAMA PRODUCTION SYSTEM:",
    ...AI_DIRECTOR_LAYERS.map((layer, index) => `${index + 1}. ${layer.title} (${layer.id}): ${layer.rule}`),
    "",
    "MANDATORY DIRECTOR OUTCOME:",
    "- The story must feel like a connected produced drama, not a list of unrelated prompts.",
    "- Each episode needs a hook, escalation, reversal or emotional turn, and cliffhanger/next-click reason.",
    "- Every shot must have a purpose: reveal information, intensify conflict, show emotion, move a character, expose a prop, or set up/pay off a cliffhanger.",
    "- Avoid repetitive talking-head scenes. Use visual storytelling and non-dialogue beats when stronger.",
    `- Preserve ${country}/${language} cultural realism, exact locked assets, ${aspectRatio} framing, live-action realism, and video-engine constraints.`,
].join("\n");

const BACKGROUND_NPC_MODES = ["NONE", "LIGHT", "MEDIUM", "CROWD"];
const normalizeBackgroundNpcMode = (value = "NONE") => {
    const mode = String(value || "").trim().toUpperCase();
    return BACKGROUND_NPC_MODES.includes(mode) ? mode : "NONE";
};
const maxBackgroundNpcCountForMode = (mode = "NONE") => {
    if (mode === "LIGHT") return 4;
    if (mode === "MEDIUM") return 12;
    if (mode === "CROWD") return 40;
    return 0;
};

// ============================================================================
// INTONATION TAGS — untuk dialogue (ex: @marah, @sedih)
// ============================================================================
const INTONATION_PRESETS = [
    { id: "marah", label: "Marah / anger", desc: "Tubuh tegang/grounded, gerak tajam, artikulasi tegas/bertekanan; bukan lemah gemulai" },
    { id: "kesal", label: "Kesal / annoyed", desc: "Frustrasi tertahan, datar tajam, rahang/gestur kaku dan pendek" },
    { id: "sedih", label: "Sedih / sad", desc: "Lembut, berat, menahan air mata" },
    { id: "menangis", label: "Menangis / crying", desc: "Suara pecah, sesenggukan" },
    { id: "takut", label: "Takut / afraid", desc: "Bergetar, ragu, napas pendek" },
    { id: "cemas", label: "Cemas / anxious", desc: "Cepat, gelisah" },
    { id: "panik", label: "Panik / panic", desc: "Tinggi, cepat, putus-putus" },
    { id: "gembira", label: "Gembira / happy", desc: "Ringan, cerah, hangat" },
    { id: "senang", label: "Senang / glad", desc: "Lembut, ramah" },
    { id: "kecewa", label: "Kecewa / disappointed", desc: "Datar, berat, getir" },
    { id: "putusasa", label: "Putus asa / desperate", desc: "Hampa, lirih" },
    { id: "tegas", label: "Tegas / firm", desc: "Jelas, mantap, postur kuat, timing pasti, tanpa ragu" },
    { id: "tegang", label: "Tegang / tense", desc: "Diam menekan" },
    { id: "kaget", label: "Kaget / shocked", desc: "Tersentak, napas tertahan" },
    { id: "terkejut", label: "Terkejut / surprised", desc: "Naik, singkat" },
    { id: "bingung", label: "Bingung / confused", desc: "Ragu, lambat" },
    { id: "malu", label: "Malu / embarrassed", desc: "Pelan, terputus" },
    { id: "lembut", label: "Lembut / gentle", desc: "Halus, dekat, hangat" },
    { id: "hangat", label: "Hangat / warm", desc: "Ramah, personal" },
    { id: "dingin", label: "Dingin / cold", desc: "Datar, jauh, tanpa emosi" },
    { id: "getir", label: "Getir / bitter", desc: "Pahit, tawa kecil sinis" },
    { id: "sarkastik", label: "Sarkastik / sarcastic", desc: "Tajam, menohok" },
    { id: "sinis", label: "Sinis / cynical", desc: "Meremehkan, datar" },
    { id: "mengejek", label: "Mengejek / mocking", desc: "Menurunkan, sinis" },
    { id: "tertawa", label: "Tertawa / laughing", desc: "Tawa ringan atau getir" },
    { id: "jijik", label: "Jijik / disgusted", desc: "Menjauh, tertahan" },
    { id: "kagum", label: "Kagum / amazed", desc: "Hangat, kagum tulus" },
    { id: "menghina", label: "Menghina / insulting", desc: "Rendah, memotong" },
    { id: "bangga", label: "Bangga / proud", desc: "Mantap, dada terbuka" },
    { id: "memohon", label: "Memohon / pleading", desc: "Bergetar, lirih, putus" },
    { id: "berbisik", label: "Berbisik / whisper", desc: "Sangat pelan, dekat" },
    { id: "berteriak", label: "Berteriak / shouting", desc: "Keras, penuh" },
    { id: "monoton", label: "Monoton / flat", desc: "Datar, tanpa warna" },
    { id: "bergumam", label: "Bergumam / mumble", desc: "Audible tapi sangat pelan, menggumam di bawah napas", mode: "mumble" },
    { id: "membatin", label: "Bicara dalam hati / inner voice", desc: "Monolog batin, tanpa suara, mulut tertutup", mode: "inner" },
];
const INTONATION_TAG_REGEX = /@([a-zA-Z][a-zA-Z0-9_-]*)/g;
const CHARACTER_TAG_REGEX = /@([a-zA-Z][a-zA-Z0-9_-]*)/g;

const extractTaggedTokens = (text = "", regex = INTONATION_TAG_REGEX) => {
    const found: string[] = [];
    String(text ?? "").replace(regex, (_match, tag) => {
        const t = String(tag || "").trim().toLowerCase();
        if (t) found.push(t);
        return _match;
    });
    return uniqueStrings(found);
};

// ============================================================================
// SPEECH MODE DETECTION — inner monologue (silent) vs mumble (audible-low)
// ============================================================================
// Bergumam/mutter = audible tapi pelan (mulut bergerak sedikit, suara ada).
const MUMBLE_PATTERN = /\b(bergumam|menggumam|gumam|komat-kamit|mutters?|murmurs?|mumbl\w*|under\s+(?:his|her|their)\s+breath|sotto\s+voce|lirih\s+sendiri)\b/i;
// Inner monologue/membatin = tanpa suara (mulut tertutup, voice-over batin).
const INNER_SPEECH_PATTERN = /\b(membatin|dalam batin|batinnya|dalam hati|dalam pikiran|monolog(?:\s+dalam)?(?:\s+hati)?|berpikir|merenung|inner\s+(?:voice|monologue|speech)|to\s+(?:him|her|them)self|soliloquy)\b/i;
const isMumbleText = (text = "") => MUMBLE_PATTERN.test(toText(text));
const isInnerSpeechText = (text = "") => INNER_SPEECH_PATTERN.test(toText(text));

// Deteksi niat perpindahan posisi (locomotion) dari teks aksi.
// Kalau ada kata ini, karakter boleh berpindah tempat (bukan hanya gerak di tempat).
const LOCOMOTION_INTENT_PATTERN = /\b(approach(?:es|ing)?|walk(?:s|ing)?(?:\s+(?:toward|towards|to|into|up|over|closer|away|across|around))?|run(?:s|ning)?|move(?:s|ing)?\s+(?:closer|toward|towards|away|across|to)|step(?:s|ping)?\s+(?:closer|toward|towards|forward|back|away)|enter(?:s|ing)?|exit(?:s|ing)?|leav(?:e|es|ing)|cross(?:es|ing)?|pace(?:s|ing)?|chase(?:s|ing)?|follow(?:s|ing)?|berjalan|jalan\s+(?:ke|menuju|mendekat)|melangkah|mendekat(?:i|kan)?|menghampiri|menjauh(?:i|kan)?|menuju|mengejar|mengikuti|berlari|lari|masuk|keluar|pergi|menyeberang|menyusuri|mondar-mandir|menghindar|mundur|maju)\b/i;
const hasLocomotionIntent = (text = "") => LOCOMOTION_INTENT_PATTERN.test(toText(text));

// Extract spoken dialogue from a per-character scene prompt via quotation marks.
// Single quotes hanya dihitung bila mengapit kalimat (bukan apostrof seperti "don't").
const extractDialogueLinesFromPrompt = (text = "") => {
    const raw = String(text || "");
    const lines: string[] = [];
    const regex = /["“”«»]([^"“”«»\n]{1,400})["“”«»]|(?:^|[\s(\[:])'([^'\n]{1,400})'(?=[\s.,!?;:)\]]|$)/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
        const line = toText(match[1] || match[2]);
        if (line && !lines.includes(line)) lines.push(line);
    }
    return lines;
};

const normalizeMentionKey = (value = "") =>
    toText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");

const isKnownIntonationTag = (tag = "") => {
    const key = normalizeMentionKey(tag);
    return INTONATION_PRESETS.some((preset) => normalizeMentionKey(preset.id) === key);
};
// Preset id → mode bicara khusus (selain spoken default)
// Normalisasi lokal yang TIDAK bergantung pada toText (dideklarasikan jauh di bawah),
// supaya map ini aman dievaluasi saat module load (hindari temporal dead zone).
const normIntonationKey = (value = "") => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const INTONATION_MODE_BY_ID: Record<string, "mumble" | "inner"> = INTONATION_PRESETS.reduce((acc, preset: any) => {
    if (preset.mode === "mumble" || preset.mode === "inner") acc[normIntonationKey(preset.id)] = preset.mode;
    return acc;
}, {} as Record<string, "mumble" | "inner">);
const speechModeFromIntonations = (intonations: string[] = []): "spoken" | "mumble" | "inner" => {
    let mode: "spoken" | "mumble" | "inner" = "spoken";
    for (const tag of intonations) {
        const m = INTONATION_MODE_BY_ID[normIntonationKey(tag)];
        if (m === "inner") return "inner"; // inner punya prioritas tertinggi
        if (m === "mumble") mode = "mumble";
    }
    return mode;
};
const stripIntonationTags = (text = "") => String(text || "")
    .replace(INTONATION_TAG_REGEX, (match, tag) => isKnownIntonationTag(tag) ? "" : match)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
const parseDialogueLine = (rawText = "") => {
    const text = String(rawText || "");
    const intonations = extractTaggedTokens(text, INTONATION_TAG_REGEX)
        .filter((tag) => isKnownIntonationTag(tag));
    const cleaned = stripIntonationTags(text);
    return { text: cleaned, intonations };
};

// Build normalized dialogue for a shot from its characterDirections.
const buildDialogueFromCharacterDirections = (shot) => {
    const castIds = normalizeIdList(shot?.characterIds || []);
    const directions = normalizeCharacterDirections(shot?.characterDirections, castIds);
    const dialogue: Array<{ characterId: string; targetCharacterId: string; text: string; intonations: string[]; innerSpeech: boolean; speechMode: "spoken" | "mumble" | "inner"; }> = [];
    directions.forEach((dir) => {
        const promptText = toText(dir.scenePrompt);
        if (!promptText) return;
        const lines = extractDialogueLinesFromPrompt(promptText);
        if (!lines.length) return;
        const innerFromText = isInnerSpeechText(promptText);
        const mumbleFromText = isMumbleText(promptText);
        const explicitTarget = toText(dir.talkTargetId);
        const mentionedTarget = castIds.find((id) => {
            if (id === dir.characterId) return false;
            const escapedId = String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return new RegExp(`@${escapedId}\\b`, "i").test(promptText);
        }) || "";
        const intonations = extractTaggedTokens(promptText, INTONATION_TAG_REGEX).filter((tag) => isKnownIntonationTag(tag));
        lines.forEach((line) => {
            const parsed = parseDialogueLine(line);
            const effectiveIntonations = parsed.intonations.length ? parsed.intonations : intonations;
            // Mode bicara: tag @membatin/@bergumam menang; kalau tidak ada, fallback deteksi teks.
            const tagMode = speechModeFromIntonations(effectiveIntonations);
            const speechMode = tagMode !== "spoken"
                ? tagMode
                : (innerFromText ? "inner" : (mumbleFromText ? "mumble" : "spoken"));
            dialogue.push({
                characterId: dir.characterId,
                targetCharacterId: explicitTarget && explicitTarget !== dir.characterId ? explicitTarget : mentionedTarget,
                text: parsed.text || line,
                intonations: effectiveIntonations,
                innerSpeech: speechMode === "inner",
                speechMode,
            });
        });
    });
    return dialogue;
};

// ============================================================================
// DIRECTOR CONTROLS — per-character direction + camera script
// ============================================================================
const CAMERA_MOVEMENT_PRESETS = [
    { id: "STATIC", label: "Static / locked off", desc: "Kamera benar-benar diam terkunci di tripod. Tidak ada pan, tilt, dolly, zoom, maupun geser. Hanya karakter yang bergerak di dalam frame; kamera tidak." },
    { id: "PAN", label: "Pan (horizontal)", desc: "Kamera menyapu/berputar ke kiri atau kanan secara horizontal dari posisi tetap (seperti menoleh). Halus dan terkontrol, tanpa tilt vertikal, tanpa dolly/zoom." },
    { id: "TILT", label: "Tilt (vertical)", desc: "Kamera mengangguk ke atas atau ke bawah secara vertikal dari posisi tetap. Mengikuti gerak naik/turun subjek, tanpa pan horizontal, tanpa dolly/zoom." },
    { id: "PUSH_IN", label: "Push in / dolly in", desc: "Kamera maju mendekat ke subjek (badan kamera benar-benar bergerak maju, bukan zoom). Mempersempit frame perlahan untuk menambah intensitas/fokus." },
    { id: "PULL_OUT", label: "Pull out / dolly out", desc: "Kamera mundur menjauh dari subjek (badan kamera bergerak mundur, bukan zoom out). Memperluas frame untuk memperlihatkan lebih banyak lingkungan." },
    { id: "TRACKING", label: "Tracking follow", desc: "Kamera bergerak mengikuti subjek yang berpindah (menyamping/maju/mundur) sehingga subjek tetap terframing konsisten selama bergerak." },
    { id: "HANDHELD", label: "Handheld natural", desc: "Gaya kamera genggam dengan getaran/goyangan halus dan alami, memberi kesan dokumenter/real. Tetap satu lokasi, tidak liar atau berlebihan." },
    { id: "ORBIT", label: "Orbit around subject", desc: "Kamera mengelilingi subjek (bergerak melingkar) sambil tetap mengarah ke subjek. Memperlihatkan subjek dari sudut yang berubah mengelilinginya." },
    { id: "CRANE", label: "Crane / boom", desc: "Kamera bergerak vertikal naik atau turun seperti di crane/boom (meninggi atau merendah), bukan sekadar tilt. Memberi perubahan ketinggian pandang." },
    { id: "CUTAWAY", label: "Cutaway to surroundings", desc: "Potongan singkat ke bagian lain dari lokasi yang sama (lingkungan sekitar/objek) lalu kembali ke aksi utama. Tetap di lokasi dan waktu yang sama." },
    { id: "MIXED", label: "Mixed per camera script", desc: "Gabungan beberapa gerak kamera sesuai urutan yang Anda tulis di CAMERA SCRIPT. Kamera mengikuti skenario kamera langkah demi langkah." },
];
const DEFAULT_CAMERA_MOVEMENT = "STATIC";

const CHARACTER_SCENE_PROMPT_MAX_CHARS = 5000;

const makeCharacterDirection = (characterId = "", overrides = {}) => ({
    characterId,
    action: "",
    scenePrompt: "",
    talkTargetId: "",
    cameraFocus: false,
    ...overrides,
});

// NOTE: scenePrompt & action disimpan RAW (tidak di-trim) agar user bisa mengetik spasi.
const rawFieldText = (value) => (value === null || value === undefined ? "" : String(value));

const normalizeCharacterDirections = (directions, allowedIds = []) => {
    const allowed = new Set(allowedIds);
    const map = new Map();
    (Array.isArray(directions) ? directions : []).forEach((item) => {
        const id = toText(item?.characterId);
        if (!id || !allowed.has(id)) return;
        map.set(id, makeCharacterDirection(id, {
            action: rawFieldText(item?.action),
            scenePrompt: rawFieldText(item?.scenePrompt ?? item?.prompt ?? item?.freeTextPrompt),
            talkTargetId: toText(item?.talkTargetId),
            cameraFocus: Boolean(item?.cameraFocus),
        }));
    });
    allowedIds.forEach((id) => {
        if (!map.has(id)) map.set(id, makeCharacterDirection(id));
    });
    return allowedIds.map((id) => map.get(id));
};

const extractCharacterMentionTokens = (value = "") => {
    const found = [];
    const regex = /@([a-zA-Z0-9][a-zA-Z0-9_-]*)/g;
    String(value ?? "").replace(regex, (_match, token) => {
        const normalized = toText(token).toLowerCase();
        if (normalized && !found.includes(normalized)) found.push(normalized);
        return _match;
    });
    return found;
};

const limitCharacterScenePromptText = (value = "", maxChars = CHARACTER_SCENE_PROMPT_MAX_CHARS) => {
    const raw = toText(value);
    if (raw.length <= maxChars) return raw;
    return `${raw.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
};

const characterMentionAliases = (character) => {
    const name = toText(character?.name);
    const nameParts = name.split(/\s+/).map((part) => part.trim()).filter(Boolean);
    return uniqueStrings([
        character?.id,
        name,
        ...nameParts.filter((part) => part.length >= 3),
    ].map(normalizeMentionKey).filter(Boolean));
};

const normalizeProjectAspectRatio = (value = "9:16") => PROJECT_ASPECT_RATIOS.includes(String(value)) ? String(value) : "9:16";
const aspectRatioToCssValue = (value = "9:16") => normalizeProjectAspectRatio(value).replace(":", " / ");
const aspectRatioToNumber = (value = "9:16") => {
    const [width, height] = normalizeProjectAspectRatio(value).split(":").map(Number);
    return width / height;
};
const aspectRatioOrientationLabel = (value = "9:16") => normalizeProjectAspectRatio(value) === "16:9" ? "HORIZONTAL LANDSCAPE" : "VERTICAL PORTRAIT";
const aspectRatioFormatLabel = (value = "9:16") => `${normalizeProjectAspectRatio(value)} ${aspectRatioOrientationLabel(value)}`;
const aspectRatioFrameDescription = (value = "9:16") => normalizeProjectAspectRatio(value) === "16:9"
    ? "horizontal landscape 16:9"
    : "vertical portrait 9:16";
const stableHashNumber = (value = "") => {
    let hash = 0;
    const text = String(value || "");
    for (let index = 0; index < text.length; index++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash);
};
const pickStable = (items: string[] = [], seed = 0) => items.length ? items[seed % items.length] : "";

let activeAiUsageContext = null;
const usageTaskPayload = () => activeAiUsageContext ? {
    mora_task_type: activeAiUsageContext.label,
    mora_task_category: activeAiUsageContext.type,
} : {};
const withAiUsageContext = async (context, task) => {
    const previous = activeAiUsageContext;
    activeAiUsageContext = context;
    try {
        return await task();
    } finally {
        activeAiUsageContext = previous;
    }
};

const OPENROUTER_HEADERS = {
    "Content-Type": "application/json",
    ...(OPENROUTER_BRIDGE_URL.includes("ngrok") ? { "ngrok-skip-browser-warning": "true" } : {}),
};
const VIDEO_ENGINE_NAME = "GOOGLE OMNI VIDEO";

const GENRE_PRESETS = [
    "Family Drama Indo",
    "CEO Indonesia",
    "Hidden Identity Indo",
    "Revenge Indo",
    "Contract Marriage Indo",
    "Dinasti Jaman Dulu",
    "Palace Drama Nusantara",
    "Modern CEO Romance",
    "Crime Mystery",
    "Youth Romance",
    "Wuxia",
    "Xianxia",
    "Palace Drama",
];

const INTERNATIONAL_REGIONS = [
    { country: "China", language: "Mandarin Chinese", assetStyle: "Chinese names, Chinese family/social hierarchy, Chinese faces and cultural appearance, Chinese architecture, wardrobe, props, signage, vehicles, food, and everyday cultural details; if the selected genre/premise is historical or dynasty-era, use period-appropriate Chinese architecture, court hierarchy, wardrobe, props, transport, and social customs instead of modern assets" },
    { country: "United States", language: "American English", assetStyle: "American names, American cultural appearance, US locations, architecture, wardrobe, props, vehicles, signage, food, and social behavior; if the selected genre/premise is historical, use period-appropriate American assets instead of modern assets" },
    { country: "South Korea", language: "Korean", assetStyle: "Korean names, Korean cultural appearance, Korean locations, architecture, wardrobe, props, signage, vehicles, food, and social behavior; if the selected genre/premise is historical or dynasty-era, use period-appropriate Korean architecture, court hierarchy, hanbok/wardrobe, props, and social customs" },
    { country: "Japan", language: "Japanese", assetStyle: "Japanese names, Japanese cultural appearance, Japanese locations, architecture, wardrobe, props, signage, vehicles, food, and social behavior; if the selected genre/premise is historical, use period-appropriate Japanese architecture, wardrobe, props, hierarchy, and social customs" },
    { country: "Thailand", language: "Thai", assetStyle: "Thai names, Thai cultural appearance, Thai locations, architecture, wardrobe, props, signage, vehicles, food, and social behavior; if the selected genre/premise is historical, use period-appropriate Thai assets" },
    { country: "India", language: "Hindi", assetStyle: "Indian names, Indian cultural appearance, Indian locations, architecture, wardrobe, props, signage, vehicles, food, and social behavior; if the selected genre/premise is historical, use period-appropriate Indian assets" },
];

const getCountryLanguage = (country) => {
    if (country === "Indonesia") return "Bahasa Indonesia";
    return INTERNATIONAL_REGIONS.find((item) => item.country === country)?.language || "American English";
};

const getProjectRegionProfile = (project) => {
    const regionMode = project.regionMode || "Indonesia";
    const country = regionMode === "Indonesia" ? "Indonesia" : (project.country || "China");
    const language = getCountryLanguage(country);
    if (country === "Indonesia") {
        return {
            regionMode,
            country,
            language,
            assetStyle: "Indonesian names, Indonesian ethnic/cultural appearance, Indonesian family/social dynamics, Indonesian locations, architecture, wardrobe, props, signage, vehicles, food, and everyday production details; if the selected genre/premise is historical or dynasty-era, use period-appropriate Nusantara/Indonesian kingdom architecture, hierarchy, wardrobe, props, transport, and social customs instead of modern assets",
            rules: [
                "All named characters must be Indonesian unless the premise explicitly says otherwise.",
                "Use Indonesian names, Indonesian cultural context, Indonesian social behavior, Indonesian wardrobe realism, and Indonesian locations.",
                "All spoken dialogue must be natural Bahasa Indonesia.",
                "REGION LOCK overrides geographic wording embedded in the genre preset. Even if the genre label contains a foreign or generic cue, the project remains Indonesian when REGION is Indonesia.",
                "If the genre/premise is historical, dynasty-era, palace, wuxia-like, or otherwise period-based, adapt every visual asset to a historically appropriate Indonesian/Nusantara setting rather than using modern Indonesian assets.",
                "Do not drift into Chinese, Korean, Japanese, American, or generic international naming/locations when region is Indonesia.",
            ],
        };
    }
    const preset = INTERNATIONAL_REGIONS.find((item) => item.country === country) || INTERNATIONAL_REGIONS[0];
    return {
        regionMode,
        country,
        language,
        assetStyle: preset.assetStyle,
        rules: [
            `All named characters must belong naturally to ${country} unless the premise explicitly says otherwise.`,
            `Use ${country}-appropriate names, faces/ethnicity cues, social behavior, wardrobe, architecture, props, signage, vehicles, food, money, and everyday location details.`,
            `All spoken dialogue must be natural ${language}.`,
            `REGION LOCK overrides geographic wording embedded in the genre preset. If a genre label contains "Indo" or "Indonesia", do NOT make the project Indonesian when COUNTRY is ${country}; reinterpret only the story archetype for ${country}.`,
            `If the genre/premise is historical, dynasty-era, palace, wuxia-like, or otherwise period-based, adapt architecture, wardrobe, hierarchy, props, transport, signage, and production design to a historically appropriate ${country} setting.`,
            "Do not mix Indonesian assets, names, signage, or language into this project unless the premise explicitly requires it.",
        ],
    };
};
const PROJECT_DB_NAME = "slendro_microdrama_studio";
const PROJECT_DB_VERSION = 1;
const PROJECT_STORE_NAME = "project_snapshots";
const CURRENT_PROJECT_KEY = "current_project";
const PROJECT_SCHEMA_VERSION = 4;
const CREDIT_LOG_LIMIT = 80;
const AUTH_STORAGE_KEY = "COUNTSISTENT_auth";
const WORKSPACE_STORAGE_KEY = "COUNTSISTENT_workspaces";
const ANCHOR_STOPPED_ERROR = "ANCHOR_GENERATION_STOPPED";
const AUTO_CREDIT_METERING = false;
const QA_JSON_RETRIES = 1;
const ANCHOR_QA_MAX_ATTEMPTS: number = 3;
const FAST_IMAGE_MODE = false;
const FAST_REFERENCE_MAX_EDGE = 1024;
const FAST_REFERENCE_QUALITY = 0.88;
const FAST_ANCHOR_MAX_CHARACTER_REFS = 99;
const FAST_ANCHOR_INCLUDE_PROPS = true;
const FAST_ANCHOR_INCLUDE_PREVIOUS = true;
const DIALOGUE_DURATION_WORD_LIMITS = { short: 12, medium: 24, long: 36 };
const CHARACTER_REFERENCE_ASPECT_RATIO = "3:4";
const PROP_REFERENCE_ASPECT_RATIO = "1:1";
const normalizeAssetAspectRatio = (assetType = "", projectAspectRatio = "9:16") => {
    const normalizedProject = normalizeProjectAspectRatio(projectAspectRatio);
    const type = String(assetType || "").toLowerCase();
    if (type === "character") return CHARACTER_REFERENCE_ASPECT_RATIO;
    if (type === "prop") return PROP_REFERENCE_ASPECT_RATIO;
    if (type === "location") return normalizedProject;
    return normalizedProject;
};

const DEFAULT_PROJECT = {
    title: "", genre: "Family Drama Indo", premise: "",
    regionMode: "Indonesia", country: "Indonesia",
    episodeCount: 10, episodeDuration: 120, castCount: 4, locationCount: 4, propCount: 3,
    aspectRatio: "9:16", language: "Bahasa Indonesia", visualStyle: "", storyRules: "",
    aiDirectorMode: true, directorModePlan: "",
    imageProvider: IMAGE_PROVIDER_OPENROUTER,
};
const openProjectDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) { reject(new Error("INDEXEDDB_UNAVAILABLE")); return; }
    const request = window.indexedDB.open(PROJECT_DB_NAME, PROJECT_DB_VERSION);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECT_STORE_NAME)) db.createObjectStore(PROJECT_STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("INDEXEDDB_OPEN_FAILED"));
});
const getWorkspaceProjectKey = (workspaceId = "") => workspaceId ? `workspace_project_${workspaceId}` : CURRENT_PROJECT_KEY;
const readSavedProject = async (projectKey = CURRENT_PROJECT_KEY): Promise<any | null> => {
    const db = await openProjectDb();
    try {
        return await new Promise<any | null>((resolve, reject) => {
            const tx = db.transaction(PROJECT_STORE_NAME, "readonly");
            const store = tx.objectStore(PROJECT_STORE_NAME);
            const request = store.get(projectKey);
            request.onsuccess = () => resolve(request.result?.snapshot || null);
            request.onerror = () => reject(request.error || new Error("PROJECT_LOAD_FAILED"));
        });
    } finally { db.close(); }
};
const writeSavedProject = async (snapshot, projectKey = CURRENT_PROJECT_KEY): Promise<void> => {
    const db = await openProjectDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(PROJECT_STORE_NAME, "readwrite");
            const store = tx.objectStore(PROJECT_STORE_NAME);
            store.put({ key: projectKey, snapshot, updatedAt: Date.now() });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error("PROJECT_SAVE_FAILED"));
            tx.onabort = () => reject(tx.error || new Error("PROJECT_SAVE_ABORTED"));
        });
    } finally { db.close(); }
};
const deleteSavedProject = async (projectKey = CURRENT_PROJECT_KEY): Promise<void> => {
    const db = await openProjectDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(PROJECT_STORE_NAME, "readwrite");
            const store = tx.objectStore(PROJECT_STORE_NAME);
            store.delete(projectKey);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error("PROJECT_CLEAR_FAILED"));
            tx.onabort = () => reject(tx.error || new Error("PROJECT_CLEAR_ABORTED"));
        });
    } finally { db.close(); }
};
const makePersistableShots = (items) => (items || []).map((shot) => ({
    ...shot,
    videoUrl: null,
    videoStatus: shot.videoStatus === "ready" ? "idle" : (shot.videoStatus || "idle"),
    videoRemoteUri: null,
    operationName: null,
}));
const restorePersistedShots = (items) => (items || []).map((shot) => ({
    ...shot,
    videoUrl: null,
    videoStatus: "idle",
    videoRemoteUri: null,
    operationName: null,
}));
const snapshotSavedAt = (snapshot) => {
    const value = Number(snapshot?.savedAt || snapshot?.updatedAt || 0);
    return Number.isFinite(value) ? value : 0;
};
const countSnapshotImages = (snapshot) => (
    (snapshot?.characters || []).filter((item) => item?.referenceImage).length +
    (snapshot?.locations || []).filter((item) => item?.referenceImage).length +
    (snapshot?.props || []).filter((item) => item?.referenceImage).length +
    (snapshot?.shots || []).filter((item) => item?.anchorImage).length +
    (snapshot?.shots || []).filter((item) => item?.videoLastFrameImage).length
);
const loadStoredWorkspaces = () => {
    if (typeof window === "undefined") return [];
    try {
        const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_STORAGE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.name) : [];
    } catch {
        return [];
    }
};
const saveStoredWorkspaces = (items) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(items));
};
const normalizeDbWorkspace = (workspace) => ({
    id: toText(workspace?.id),
    name: toText(workspace?.name) || "Untitled Workspace",
    createdAt: workspace?.created_at || workspace?.createdAt || Date.now(),
    updatedAt: workspace?.updated_at || workspace?.updatedAt || workspace?.created_at || Date.now(),
    projectId: workspace?.project_id || workspace?.projectId || null,
    source: "db",
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pad = (value, length = 3) => String(value).padStart(length, "0");
const JSON_RESPONSE_CONTRACT = `STRICT JSON OUTPUT:
- Output raw JSON only.
- Start with { and end with }.
- No markdown, code fence, commentary, labels, or trailing commas.
- Use double quotes for keys and string values.
- Keep JSON compact; do not pretty-print unless necessary.
- Escape quotes and newlines inside string values.`;
const toText = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) return value.map((item) => toText(item)).filter(Boolean).join("\n").trim();
    if (typeof value === "object") {
        return Object.entries(value).map(([key, item]) => {
            const text = toText(item);
            if (!text) return "";
            const label = String(key).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toUpperCase();
            return `${label}: ${text}`;
        }).filter(Boolean).join("\n").trim();
    }
    return String(value).trim();
};
const VIDEO_PROMPT_API_LIMIT = 20000;
const VIDEO_PROMPT_SAFETY_LIMIT = 18500;
const compactText = (value) => toText(value).replace(/\s+/g, " ").trim();
const limitText = (value, maxLength = 500) => {
    const text = compactText(value);
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
};
const joinLines = (items) => items.filter(Boolean).join("\n");
const normalizeVideoModelId = (model) => String(model?.id || model || "").toLowerCase();
const normalizeVideoModelSearchText = (model, modelInfo = null) => [
    model,
    modelInfo?.id,
    modelInfo?.name,
    modelInfo?.label,
].map((item) => normalizeVideoModelId(item)).filter(Boolean).join(" ");
const getVideoEngineFamily = (model, modelInfo = null) => {
    const text = normalizeVideoModelSearchText(model, modelInfo);
    if (text.includes("veo")) return "veo";
    if (text.includes("omni") && text.includes("flash")) return "omni-flash";
    if (text.includes("flash-1.1") || text.includes("flash 1.1")) return "omni-flash";
    return "generic";
};
const getVideoPromptProfile = (model, modelInfo = null) => {
    const id = normalizeVideoModelId(model);
    const searchText = normalizeVideoModelSearchText(model, modelInfo);
    const name = compactText(modelInfo?.name || modelInfo?.id || model || "Google video model");
    if (id.includes("veo")) {
        return {
            name,
            targetChars: 15000,
            style: "Use natural cinematic language. Strongly obey the attached first frame, single-location continuity, exact cast, and exact dialogue.",
        };
    }
    if ((searchText.includes("omni") && searchText.includes("flash")) || searchText.includes("flash-1.1") || searchText.includes("flash 1.1")) {
        return {
            name,
            targetChars: 9500,
            style: "Use explicit mode labels for speech/audio. Keep visual instructions concise, preserve anchor continuity, and separate inner voice from lip-synced speech.",
        };
    }
    if (id.includes("wan")) {
        return {
            name,
            targetChars: 11000,
            style: "Use short direct instructions. Prioritize first-frame continuity, simple physical action, stable bodies, no cuts, and no unplanned extra people.",
        };
    }
    if (id.includes("seedance") || id.includes("bytedance")) {
        return {
            name,
            targetChars: 10000,
            style: "Use concise shot-control language. Keep motion simple, preserve the first frame, avoid scene expansion, and maintain exact cast.",
        };
    }
    if (id.includes("hailuo") || id.includes("minimax")) {
        return {
            name,
            targetChars: 9000,
            style: "Use very concise visual instructions. Keep one clear action, one space, exact cast, and stable identity from the first frame.",
        };
    }
    return {
        name,
        targetChars: 12000,
        style: "Use concise video instructions. Obey the first frame, one continuous take, exact cast, exact location, and exact dialogue.",
    };
};
const buildEngineSpeechTreatmentLock = (model, modelInfo = null, language = "Bahasa Indonesia", country = "Indonesia") => {
    const family = getVideoEngineFamily(model, modelInfo);
    if (family === "veo") {
        return [
            "ENGINE-SPECIFIC SPEECH TREATMENT — VEO 3 / VEO FAMILY:",
            `- Spoken language remains exact ${language} with natural ${country} cadence.`,
            "- INNER VOICE / membatin / dalam hati: treat as NON-DIEGETIC INNER THOUGHT VOICE-OVER, not dialogue happening in the room.",
            "- For INNER VOICE, the character's mouth must stay fully closed and still. No whispering mouth, no mutter mouth, no lip-sync, no jaw motion.",
            "- For INNER VOICE, other characters hear nothing and do not react. The acting is only eyes, breath, tiny face tension, and thinking expression.",
            "- If Veo cannot create a clean voice-over without lip movement, prioritize VISUAL SILENCE with closed mouth over audible speech.",
            "- BERGUMAM / mumble: treat as DIEGETIC low-volume under-breath speech. It is audible but quiet, with tiny lip motion only, minimal jaw, low pitch, and private self-directed delivery.",
            "- For BERGUMAM, do not convert it into voice-over and do not project it like normal dialogue. Nearby characters barely notice unless explicitly scripted.",
        ].join("\n");
    }
    if (family === "omni-flash") {
        return [
            "ENGINE-SPECIFIC SPEECH TREATMENT — OMNI FLASH 1.1:",
            `- Spoken language remains exact ${language} with natural ${country} cadence.`,
            "- Use explicit mode labels below literally. Do not reinterpret INNER_VOICE as normal spoken dialogue.",
            "- INNER_VOICE MODE means: AUDIO_MODE=NON_DIEGETIC_THOUGHT_VOICE_OVER; VISUAL_MOUTH=CLOSED_STILL; LIP_SYNC=OFF; LISTENER_REACTION=NONE.",
            "- For INNER_VOICE, the mouth is closed before, during, and after the line. Acting comes from eyes, brows, breath, and subtle head motion only.",
            "- If audio and mouth instructions conflict, mouth-closed visual continuity wins. Never animate talking lips for inner thought.",
            "- MUMBLE MODE means: AUDIO_MODE=LOW_VOLUME_DIEGETIC_MUMBLE; VISUAL_MOUTH=TINY_LIP_MOTION_ONLY; JAW=MINIMAL; VOLUME=VERY_LOW; LISTENER_REACTION=BARELY_NOTICE.",
            "- For MUMBLE, keep it quiet and half-swallowed, not clean projected speech, not narration, not voice-over.",
        ].join("\n");
    }
    return [
        "ENGINE-SPECIFIC SPEECH TREATMENT:",
        `- Spoken language remains exact ${language} with natural ${country} cadence.`,
        "- INNER VOICE / membatin / dalam hati is voice-over/internal thought only: mouth closed, no lip-sync, no listener reaction.",
        "- BERGUMAM / mumble is audible quiet under-breath speech: tiny lip movement only, very low volume, mostly unheard by others.",
    ].join("\n");
};
const buildEngineDialogueLineTreatment = (mode = "spoken", model, modelInfo = null) => {
    const family = getVideoEngineFamily(model, modelInfo);
    if (mode === "inner") {
        if (family === "omni-flash") {
            return "ENGINE_MODE=INNER_VOICE; AUDIO_MODE=NON_DIEGETIC_THOUGHT_VOICE_OVER; VISUAL_MOUTH=CLOSED_STILL; LIP_SYNC=OFF; JAW=STILL; LISTENER_REACTION=NONE.";
        }
        if (family === "veo") {
            return "VEO_MODE=NON_DIEGETIC_INNER_THOUGHT_VOICE_OVER; mouth fully closed and still; no lip-sync; no whispering/muttering mouth; listeners do not hear it.";
        }
        return "INNER_VOICE_MODE: voice-over/internal thought only; mouth closed; no lip-sync; no listener reaction.";
    }
    if (mode === "mumble") {
        if (family === "omni-flash") {
            return "ENGINE_MODE=MUMBLE; AUDIO_MODE=LOW_VOLUME_DIEGETIC_MUMBLE; VISUAL_MOUTH=TINY_LIP_MOTION_ONLY; JAW=MINIMAL; VOLUME=VERY_LOW; LISTENER_REACTION=BARELY_NOTICE.";
        }
        if (family === "veo") {
            return "VEO_MODE=DIEGETIC_UNDER_BREATH_MUMBLE; audible very quiet murmur; tiny lip motion only; minimal jaw; not voice-over; not projected dialogue.";
        }
        return "MUMBLE_MODE: audible quiet under-breath speech; tiny lip movement; very low volume; not voice-over.";
    }
    return "SPOKEN_MODE: normal diegetic dialogue; assigned speaker only; exact words; natural lip-sync.";
};
const clampVideoPrompt = (prompt, maxChars = VIDEO_PROMPT_SAFETY_LIMIT) => {
    const hardMax = Math.min(Number(maxChars) || VIDEO_PROMPT_SAFETY_LIMIT, VIDEO_PROMPT_SAFETY_LIMIT, VIDEO_PROMPT_API_LIMIT - 500);
    const text = toText(prompt);
    if (text.length <= hardMax) return text;
    return `${text.slice(0, hardMax - 220).trim()}\n\nFINAL HARD LOCK: continue from the attached first frame only. One location, no cuts, no new people, exact dialogue, exact cast, no story expansion.`;
};
const extractBalancedJson = (value) => {
    const text = String(value ?? "");
    const objectStart = text.indexOf("{");
    const arrayStart = text.indexOf("[");
    let start = -1;
    if (objectStart >= 0 && arrayStart >= 0) start = Math.min(objectStart, arrayStart);
    else start = Math.max(objectStart, arrayStart);
    if (start < 0) return text.trim();

    const stack = [];
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === "\\") escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') { inString = true; continue; }
        if (char === "{" || char === "[") stack.push(char);
        else if (char === "}" || char === "]") {
            const expected = char === "}" ? "{" : "[";
            if (stack[stack.length - 1] !== expected) continue;
            stack.pop();
            if (stack.length === 0) return text.slice(start, i + 1).trim();
        }
    }
    return text.slice(start).trim();
};
const cleanJson = (value) => {
    let text = String(value ?? "")
        .replace(/^\uFEFF/, "")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\u00a0/g, " ")
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    return extractBalancedJson(text);
};
const escapeJsonStringControls = (value) => {
    let output = "";
    let inString = false;
    let escaped = false;
    for (const char of String(value ?? "")) {
        if (inString) {
            if (escaped) {
                output += char;
                escaped = false;
                continue;
            }
            if (char === "\\") {
                output += char;
                escaped = true;
                continue;
            }
            if (char === '"') {
                output += char;
                inString = false;
                continue;
            }
            if (char === "\n") { output += "\\n"; continue; }
            if (char === "\r") { output += "\\r"; continue; }
            if (char === "\t") { output += "\\t"; continue; }
            output += char;
            continue;
        }
        if (char === '"') inString = true;
        output += char;
    }
    return output;
};
const repairJsonCandidate = (value) => escapeJsonStringControls(value)
    .replace(/,\s*([}\]])/g, "$1")
    .split("")
    .filter((char) => {
        const code = char.charCodeAt(0);
        return code >= 32 || code === 9 || code === 10 || code === 13;
    })
    .join("");
const safeJsonParse = (value) => {
    const cleaned = cleanJson(value);
    const candidates = [...new Set([
        cleaned,
        repairJsonCandidate(cleaned),
    ].filter(Boolean))];
    for (const candidate of candidates) {
        try { return JSON.parse(candidate); }
        catch {  }
    }
    console.error("Invalid AI JSON:", value);
    console.error("Cleaned JSON candidate:", cleaned);
    throw new Error("AI_RETURNED_INVALID_JSON");
};
const parseDataUrl = (value) => {
    const match = value.match(/^data:(.+?);base64,(.+)$/);
    if (!match) throw new Error("INVALID_DATA_URL");
    return { mimeType: match[1], data: match[2] };
};
const assetUrl = (value) => {
    const text = toText(value);
    if (!text) return "";
    if (text.startsWith("http://") || text.startsWith("https://") || text.startsWith("data:") || text.startsWith("blob:")) return text;
    if (text.startsWith("/api/assets/")) return `${API_ROOT}${text}`;
    return text;
};
const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("BLOB_READ_FAILED"));
    reader.readAsDataURL(blob);
});
const materializeImageForAi = async (value) => {
    const url = assetUrl(value);
    if (!url || url.startsWith("data:image/")) return url;
    if (url.startsWith("blob:") || url.includes("/api/assets/")) {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) throw new Error(`ASSET_FETCH_FAILED_${response.status}`);
        return await blobToDataUrl(await response.blob());
    }
    return url;
};
const uploadGeneratedAsset = async (dataUrl, label = "asset") => {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return dataUrl;
    const uploadUrl = `${API_ROOT}/api/assets`;
    let response;
    try {
        response = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl, label }),
        });
    } catch (error) {
        console.warn(`ASSET_UPLOAD_FETCH_FAILED ${uploadUrl}: ${String(error?.message || error)}`);
        return dataUrl;
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) return dataUrl;
    return assetUrl(result.asset?.url);
};
const externalizeSnapshotImages = async (snapshot) => {
    let changed = false;
    const externalizeField = async (item, field, label) => {
        const value = item?.[field];
        if (typeof value !== "string" || !value.startsWith("data:image/")) return item;
        const url = await uploadGeneratedAsset(value, label);
        if (url === value) return item;
        changed = true;
        return { ...item, [field]: url };
    };
    const characters = await Promise.all((snapshot.characters || []).map((item) => externalizeField(item, "referenceImage", `character-${item.id || item.name || "asset"}`)));
    const locations = await Promise.all((snapshot.locations || []).map((item) => externalizeField(item, "referenceImage", `location-${item.id || item.name || "asset"}`)));
    const props = await Promise.all((snapshot.props || []).map((item) => externalizeField(item, "referenceImage", `prop-${item.id || item.name || "asset"}`)));
    const shots = await Promise.all((snapshot.shots || []).map(async (item) => {
        const withAnchor = await externalizeField(item, "anchorImage", `anchor-${item.id || "shot"}`);
        return externalizeField(withAnchor, "videoLastFrameImage", `video-last-frame-${item.id || "shot"}`);
    }));
    return { snapshot: { ...snapshot, characters, locations, props, shots }, changed };
};
const prepareReferencesForAi = async (references = []) => Promise.all(references.map(async (input, index) => {
    const ref = normalizeReferenceInput(input, index);
    if (!ref.image) return ref;
    return { ...ref, image: await materializeImageForAi(ref.image) };
}));
const base64ToUint8Array = (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
};
const mimeToExtension = (mimeType) => {
    const mime = String(mimeType || "").toLowerCase();
    if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
    if (mime.includes("webp")) return "webp";
    if (mime.includes("gif")) return "gif";
    return "png";
};
const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc ^= bytes[i];
        for (let bit = 0; bit < 8; bit++) {
            const mask = -(crc & 1);
            crc = (crc >>> 1) ^ (0xedb88320 & mask);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
};
const getDosDateTime = (date = new Date()) => {
    const year = Math.max(1980, date.getFullYear());
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosTime, dosDate };
};
const concatUint8Arrays = (arrays) => {
    const totalLength = arrays.reduce((sum, array) => sum + array.length, 0);
    const output = new Uint8Array(totalLength);
    let offset = 0;
    for (const array of arrays) { output.set(array, offset); offset += array.length; }
    return output;
};
const createZipBlob = (files) => {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    const { dosTime, dosDate } = getDosDateTime();
    files.forEach((file) => {
        const nameBytes = encoder.encode(file.name);
        const data = file.data;
        const checksum = crc32(data);
        const localHeader = new Uint8Array(30 + nameBytes.length);
        const localView = new DataView(localHeader.buffer);
        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, 0, true);
        localView.setUint16(8, 0, true);
        localView.setUint16(10, dosTime, true);
        localView.setUint16(12, dosDate, true);
        localView.setUint32(14, checksum, true);
        localView.setUint32(18, data.length, true);
        localView.setUint32(22, data.length, true);
        localView.setUint16(26, nameBytes.length, true);
        localView.setUint16(28, 0, true);
        localHeader.set(nameBytes, 30);
        localParts.push(localHeader, data);
        const centralHeader = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(centralHeader.buffer);
        centralView.setUint32(0, 0x02014b50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0, true);
        centralView.setUint16(10, 0, true);
        centralView.setUint16(12, dosTime, true);
        centralView.setUint16(14, dosDate, true);
        centralView.setUint32(16, checksum, true);
        centralView.setUint32(20, data.length, true);
        centralView.setUint32(24, data.length, true);
        centralView.setUint16(28, nameBytes.length, true);
        centralView.setUint16(30, 0, true);
        centralView.setUint16(32, 0, true);
        centralView.setUint16(34, 0, true);
        centralView.setUint16(36, 0, true);
        centralView.setUint32(38, 0, true);
        centralView.setUint32(42, localOffset, true);
        centralHeader.set(nameBytes, 46);
        centralParts.push(centralHeader);
        localOffset += localHeader.length + data.length;
    });
    const centralDirectory = concatUint8Arrays(centralParts);
    const localData = concatUint8Arrays(localParts);
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralDirectory.length, true);
    endView.setUint32(16, localData.length, true);
    endView.setUint16(20, 0, true);
    return new Blob([localData, centralDirectory, endRecord], { type: "application/zip" });
};
const toBool = (value) => {
    if (value === true || value === 1) return true;
    if (value === false || value === 0 || value === null || value === undefined) return false;
    const normalized = String(value).trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "pass";
};
const normalizeIssues = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((item) => toText(item)).filter(Boolean);
    const text = toText(value);
    return text ? [text] : [];
};
const getImageDimensions = (dataUrl): Promise<{ width: number; height: number }> => new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    image.onerror = () => reject(new Error("ANCHOR_DIMENSION_READ_FAILED"));
    image.src = dataUrl;
});
const loadImageElement = async (value): Promise<HTMLImageElement> => {
    const dataUrl = await materializeImageForAi(value);
    return await new Promise((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("REFERENCE_BOARD_IMAGE_LOAD_FAILED"));
        image.src = dataUrl;
    });
};
const drawContainedImage = (ctx, image, x, y, width, height) => {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return;
    const scale = Math.min(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
};
const createContinuityReferenceBoard = async (items = [], title = "CONTINUITY REFERENCE BOARD") => {
    if (typeof window === "undefined" || typeof document === "undefined") return "";
    const boardItems = (items || []).filter((item) => item?.image);
    if (!boardItems.length) return "";
    const prepared = await Promise.all(boardItems.map(async (item) => ({ ...item, element: await loadImageElement(item.image) })));
    const columns = prepared.length <= 6 ? 3 : 4;
    const tileWidth = 500;
    const imageHeight = 520;
    const labelHeight = 92;
    const gap = 26;
    const padding = 36;
    const headerHeight = 88;
    const rows = Math.ceil(prepared.length / columns);
    const canvas = document.createElement("canvas");
    canvas.width = padding * 2 + columns * tileWidth + (columns - 1) * gap;
    canvas.height = padding * 2 + headerHeight + rows * (imageHeight + labelHeight) + (rows - 1) * gap;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 34px Arial";
    ctx.fillText(title, padding, padding + 38);
    ctx.font = "500 22px Arial";
    ctx.fillStyle = "#334155";
    ctx.fillText("Every labeled asset is locked. Preserve face, body, wardrobe, prop, location, count, and continuity state exactly.", padding, padding + 70);
    prepared.forEach((item, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = padding + col * (tileWidth + gap);
        const y = padding + headerHeight + row * (imageHeight + labelHeight + gap);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, y, tileWidth, imageHeight + labelHeight);
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, tileWidth, imageHeight + labelHeight);
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(x + 12, y + 12, tileWidth - 24, imageHeight - 24);
        drawContainedImage(ctx, item.element, x + 12, y + 12, tileWidth - 24, imageHeight - 24);
        ctx.fillStyle = "#0f172a";
        ctx.font = "700 24px Arial";
        ctx.fillText(String(item.id || item.type || `REF_${index + 1}`).slice(0, 34), x + 18, y + imageHeight + 34);
        ctx.font = "500 18px Arial";
        ctx.fillStyle = "#475569";
        ctx.fillText(String(item.label || item.authority || "").slice(0, 46), x + 18, y + imageHeight + 64);
    });
    return canvas.toDataURL("image/jpeg", 0.92);
};

const createCharacterIdentityBoard = async (characterItems = []) => {
    if (typeof window === "undefined" || typeof document === "undefined") return "";
    const items = (characterItems || []).filter((item) => item?.image);
    if (!items.length) return "";
    const prepared = await Promise.all(items.map(async (item) => ({
        ...item,
        element: await loadImageElement(item.image),
    })));
    const count = prepared.length;
    const columns = count <= 2 ? count : (count <= 4 ? 2 : Math.ceil(Math.sqrt(count)));
    const rows = Math.ceil(count / columns);
    const tileWidth = 480;
    const imageHeight = 540;
    const labelHeight = 108;
    const gap = 24;
    const padding = 30;
    const headerHeight = 104;
    const canvas = document.createElement("canvas");
    canvas.width = padding * 2 + columns * tileWidth + (columns - 1) * gap;
    canvas.height = padding * 2 + headerHeight + rows * (imageHeight + labelHeight) + (rows - 1) * gap;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f172a";
    ctx.font = "800 36px Arial";
    ctx.fillText("CHARACTER IDENTITY REFERENCE SHEET", padding, padding + 42);
    ctx.font = "600 20px Arial";
    ctx.fillStyle = "#334155";
    ctx.fillText(
        "Each tile shows ONLY the main centered character for that ID. Ignore any background humans from source refs. Never merge identities.",
        padding,
        padding + 76
    );
    prepared.forEach((item, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = padding + col * (tileWidth + gap);
        const y = padding + headerHeight + row * (imageHeight + labelHeight + gap);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, y, tileWidth, imageHeight + labelHeight);
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, tileWidth, imageHeight + labelHeight);
        ctx.fillStyle = "#f1f5f9";
        ctx.fillRect(x + 10, y + 10, tileWidth - 20, imageHeight - 20);
        drawContainedImage(ctx, item.element, x + 10, y + 10, tileWidth - 20, imageHeight - 20);
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(x, y + imageHeight, tileWidth, labelHeight);
        ctx.fillStyle = "#ffffff";
        ctx.font = "800 34px Arial";
        ctx.fillText(String(item.id || `CHAR_${index + 1}`), x + 20, y + imageHeight + 46);
        ctx.font = "600 20px Arial";
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(String(item.label || item.name || "").slice(0, 52), x + 20, y + imageHeight + 76);
        ctx.font = "700 15px Arial";
        ctx.fillStyle = "#fbbf24";
        ctx.fillText("ONLY THIS CENTER PERSON — IGNORE BACKGROUND HUMANS", x + 20, y + imageHeight + 98);
    });
    return canvas.toDataURL("image/jpeg", 0.94);
};

const isRequestedAspectRatio = (width, height, aspectRatio = "9:16") => {
    if (!width || !height) return false;
    const target = aspectRatioToNumber(aspectRatio);
    const actual = width / height;
    return Math.abs(actual - target) <= 0.04;
};
const uniqueStrings = (items?: any[]): string[] =>
    [...new Set((items || []).map((item) => toText(item)).filter(Boolean))];
const normalizeIdList = (value?: any): string[] =>
    uniqueStrings(Array.isArray(value) ? value : []);
const mergeIdLists = (...groups: any[]): string[] =>
    uniqueStrings(groups.flatMap((group) => Array.isArray(group) ? group : []));
const runLimited = async (items, limit, worker) => {
    const queue = Array.isArray(items) ? items : [];
    if (!queue.length) return;

    let nextIndex = 0;
    let firstError = null;
    let stopped = false;
    const workerCount = Math.min(Math.max(1, Number(limit) || 1), queue.length);

    const runners = Array.from({ length: workerCount }, async () => {
        while (!stopped) {
            const index = nextIndex;
            if (index >= queue.length) return;
            nextIndex += 1;

            try {
                await worker(queue[index], index);
            } catch (error) {
                if (!firstError) firstError = error;
                stopped = true;
                return;
            }
        }
    });

    await Promise.allSettled(runners);
    if (firstError) throw firstError;
};
const asFiniteNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};
const quotaKey = (quota) => toText(quota?.id || quota?.action_id || quota?.label || quota?.model_name || quota?.display_name).toLowerCase();
const quotaMatches = (quota, pattern) => pattern.test([
    quota?.label, quota?.id, quota?.action_id, quota?.model_name, quota?.display_name,
].map((item) => toText(item)).join(" "));
const normalizeQuotaRow = (quota, index = 0) => ({
    ...quota,
    id: toText(quota?.id || quota?.action_id || quota?.model_name || quota?.display_name || quota?.label || `quota_${index + 1}`),
    label: toText(quota?.label || quota?.display_name || quota?.model_name || quota?.id || quota?.action_id || `Quota ${index + 1}`),
    remaining: asFiniteNumber(quota?.remaining ?? quota?.remaining_count ?? quota?.available ?? quota?.left),
    total: asFiniteNumber(quota?.total ?? quota?.limit ?? quota?.max),
    usage_percentage: asFiniteNumber(quota?.usage_percentage ?? quota?.usagePercent ?? quota?.percentage),
    reset_at: quota?.reset_at || quota?.resetAt || quota?.reset_time || quota?.window_reset_at || null,
});
const collectQuotaRows = (payload) => {
    const raw = payload || {};
    const usageInfo = raw.usage_info || raw.usageInfo || raw.data?.usage_info || raw.data?.usageInfo || {};
    const candidates = [
        raw.quotas,
        raw.quota,
        raw.limits,
        usageInfo?.quotas,
        raw.data?.quotas,
    ];
    const rows = [];
    candidates.forEach((candidate) => {
        if (Array.isArray(candidate)) rows.push(...candidate);
        else if (candidate && typeof candidate === "object") {
            Object.entries(candidate).forEach(([id, value]) => {
                if (value && typeof value === "object") rows.push({ id, ...value });
            });
        }
    });
    ["current_5h", "weekly", "daily"].forEach((key) => {
        const value = usageInfo?.[key];
        if (!value || typeof value !== "object") return;
        const remaining = value.remaining_credits ?? value.remaining ?? value.available ?? value.left;
        const total = value.total_credits ?? value.total ?? value.limit ?? value.max;
        const usagePercentage = value.usage_percentage ?? value.usagePercent;
        if (remaining === undefined && total === undefined && usagePercentage === undefined) return;
        rows.push({
            id: key,
            label: key === "current_5h" ? "Flash / 5h" : key === "weekly" ? "Pro / weekly" : `Quota ${key}`,
            remaining,
            total,
            usage_percentage: usagePercentage,
            window: value.window || key,
            reset_at: value.reset_at || value.resetAt || null,
        });
    });
    return rows.map(normalizeQuotaRow).filter((row) => row.label || row.id);
};
const normalizeCreditPayload = (payload) => {
    const result = payload || {};
    const usageInfo = result.usage_info || result.usageInfo || result.data?.usage_info || result.data?.usageInfo || null;
    const aiCreditsRemaining = asFiniteNumber(
        result.ai_credits_remaining ??
        result.aiCreditsRemaining ??
        usageInfo?.ai_credits_remaining ??
        usageInfo?.aiCreditsRemaining ??
        result.extra?.ai_credits_remaining
    );
    return {
        status: "ready",
        quotas: collectQuotaRows(result),
        usageInfo,
        plan: result.plan || result.tier || usageInfo?.tier || null,
        aiCreditsRemaining,
        fetchedAt: result.fetched_at || result.fetchedAt || new Date().toISOString(),
        error: "",
        raw: result,
    };
};
const getCreditMetric = (snapshot) => {
    if (!snapshot) return null;
    const ai = asFiniteNumber(snapshot.aiCreditsRemaining);
    if (ai !== null) return { key: "ai", label: "AI CREDITS", value: ai };
    const quota = (snapshot.quotas || []).find((item) => asFiniteNumber(item?.remaining) !== null);
    return quota ? { key: quotaKey(quota), label: quota.label || quota.id, value: asFiniteNumber(quota.remaining) } : null;
};
const summarizeCreditSnapshot = (snapshot) => {
    if (!snapshot) return "unavailable";
    const ai = asFiniteNumber(snapshot.aiCreditsRemaining);
    if (ai !== null) return `AI ${ai.toLocaleString("id-ID")}`;
    const quota = getCreditMetric(snapshot);
    if (quota) return `${quota.label} ${quota.value.toLocaleString("id-ID")}`;
    if (snapshot.status === "error") return `error: ${snapshot.error || "credits unavailable"}`;
    return (snapshot.quotas || []).length ? "quota value unavailable" : "no quota rows";
};
const calculateCreditDeltas = (before, after) => {
    const deltas = [];
    const beforeAi = asFiniteNumber(before?.aiCreditsRemaining);
    const afterAi = asFiniteNumber(after?.aiCreditsRemaining);
    if (beforeAi !== null && afterAi !== null) {
        deltas.push({ label: "AI CREDITS", used: beforeAi - afterAi, before: beforeAi, after: afterAi });
    }
    const afterByKey: any = new Map((after?.quotas || []).map((quota) => [quotaKey(quota), quota]));
    (before?.quotas || []).forEach((beforeQuota) => {
        const afterQuota = afterByKey.get(quotaKey(beforeQuota));
        const beforeRemaining = asFiniteNumber(beforeQuota?.remaining);
        const afterRemaining = asFiniteNumber(afterQuota?.remaining);
        if (!afterQuota || beforeRemaining === null || afterRemaining === null) return;
        deltas.push({
            label: beforeQuota.label || beforeQuota.id || "Quota",
            used: beforeRemaining - afterRemaining,
            before: beforeRemaining,
            after: afterRemaining,
        });
    });
    return deltas.filter((item, index, list) =>
        index === list.findIndex((candidate) => candidate.label === item.label)
    );
};
const formatCreditDelta = (deltas) => {
    const measurable = (deltas || []).filter((item) => Number.isFinite(item.used));
    if (!measurable.length) return "usage belum terukur";
    const changed = measurable.filter((item) => item.used !== 0);
    const source = changed.length ? changed : measurable.slice(0, 1);
    return source.map((item) => `${item.used > 0 ? "-" : item.used < 0 ? "+" : ""}${Math.abs(item.used).toLocaleString("id-ID")} ${item.label}`).join(", ");
};
const fetchJsonWithRetry = async (url, options: any = {}, maxRetries = 3) => {
    const attempts = Math.max(1, Number(maxRetries) || 1);
    let delay = 450;

    for (let attempt = 0; attempt < attempts; attempt++) {
        const controller = new AbortController();
        const timeoutMs = Math.max(1000, Number(options?.timeoutMs) || 60000);
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const { timeoutMs: _timeoutMs, signal: callerSignal, ...fetchOptions } = options || {};
            if (callerSignal?.aborted) throw new DOMException("Request aborted", "AbortError");

            const abortFromCaller = () => controller.abort();
            callerSignal?.addEventListener?.("abort", abortFromCaller, { once: true });
            let response;
            try {
                response = await fetch(url, { ...fetchOptions, signal: controller.signal });
            } finally {
                callerSignal?.removeEventListener?.("abort", abortFromCaller);
            }

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = payload?.error?.message || payload?.detail || payload?.message || response.statusText || "Unknown API error";
                if ([400, 401, 403, 404].includes(response.status)) throw new Error(`API_${response.status}: ${message}`);
                if (response.status === 408 || response.status === 429 || response.status >= 500) {
                    if (attempt === attempts - 1) throw new Error(`API_${response.status}: ${message}`);
                    await sleep(delay);
                    delay = Math.min(delay * 1.7, 2500);
                    continue;
                }
                throw new Error(`API_${response.status}: ${message}`);
            }
            return payload;
        } catch (error) {
            const message = String(error?.message || error);
            const isAbort = error?.name === "AbortError" || /aborted|aborterror/i.test(message);
            const nonRetryable = ["API_400", "API_401", "API_403", "API_404"].some((prefix) => message.startsWith(prefix));
            if (nonRetryable) throw error;
            if (attempt === attempts - 1) {
                throw new Error(`${isAbort ? "BRIDGE_FETCH_TIMEOUT" : "BRIDGE_FETCH_FAILED"} ${url}: ${message}`);
            }
            await sleep(delay);
            delay = Math.min(delay * 1.7, 2500);
        } finally {
            clearTimeout(timeout);
        }
    }
    throw new Error("REQUEST_FAILED");
};
const normalizeReferenceInput = (value, index) => {
    if (typeof value === "string") {
        return { image: value, label: `REFERENCE_${index + 1}`, type: "GENERIC_REFERENCE", id: `REF_${index + 1}`, authority: "Use only for the purpose described by the final task prompt." };
    }
    return {
        image: value?.image || value?.dataUrl || value?.src || "",
        label: toText(value?.label) || `REFERENCE_${index + 1}`,
        type: toText(value?.type) || "GENERIC_REFERENCE",
        id: toText(value?.id) || `REF_${index + 1}`,
        authority: toText(value?.authority) || "Use only for the purpose described by the final task prompt.",
    };
};
const buildOpenAIReferenceContent = (references = []) => {
    const content = [];
    references.forEach((input, index) => {
        const ref = normalizeReferenceInput(input, index);
        if (!ref.image) return;
        content.push({
            type: "text",
            text: `REFERENCE_ASSET_${index + 1}\nTYPE: ${ref.type}\nID: ${ref.id}\nLABEL: ${ref.label}\nAUTHORITY: ${ref.authority}\nThe image immediately following this label belongs ONLY to this ID. Do not swap, blend, average, or reinterpret it as another identity.`,
        });
        content.push({
            type: "image_url",
            image_url: { url: ref.image },
        });
    });
    return content;
};
const callText = async (prompt, images = [], temperature = 0.15, options: any = {}) => {
    const preparedImages = await prepareReferencesForAi(images);
    const content = [
        ...buildOpenAIReferenceContent(preparedImages),
        { type: "text", text: prompt },
    ];
    const payload = {
        model: TEXT_MODEL,
        messages: [{ role: "user", content }],
        temperature,
        stream: false,
        ...usageTaskPayload(),
        ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
    };
    let result;
    try {
        result = await fetchJsonWithRetry(`${OPENROUTER_BRIDGE_URL}/chat/completions`, {
            method: "POST",
            headers: OPENROUTER_HEADERS,
            body: JSON.stringify(payload),
        }, options.maxRetries || 3);
    } catch (error) {
        if (!options.jsonMode || !String(error?.message || error).startsWith("API_400")) throw error;
        const { response_format: _response_format, ...fallbackPayload } = payload;
        result = await fetchJsonWithRetry(`${OPENROUTER_BRIDGE_URL}/chat/completions`, {
            method: "POST",
            headers: OPENROUTER_HEADERS,
            body: JSON.stringify(fallbackPayload),
        }, options.maxRetries || 3);
    }
    const rawContent = result?.choices?.[0]?.message?.content;
    const text = typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
            ? rawContent.map((part) => typeof part === "string" ? part : (part?.text || "")).filter(Boolean).join("\n")
            : "";
    if (!text) throw new Error("TEXT_MODEL_EMPTY_RESPONSE");
    return text;
};
const callJSON = async (prompt, images = [], temperature = 0.15, maxJsonRetries = 2) => {
    let lastInvalidText = "";
    let delay = 220;

    for (let attempt = 0; attempt < maxJsonRetries; attempt++) {
        const retryInstruction = attempt === 0
            ? ""
            : `\nRETRY ${attempt + 1}/${maxJsonRetries}: Previous answer was invalid JSON. Return a fresh, complete JSON object only.`;
        const retryTemperature = attempt === 0 ? temperature : Math.min(temperature, 0.05);

        const text = await callText(`${prompt}
${retryInstruction}
${JSON_RESPONSE_CONTRACT}
Never truncate the JSON.`, images, retryTemperature, { jsonMode: true, maxRetries: maxJsonRetries <= 1 ? 1 : 2 });

        try {
            return safeJsonParse(text);
        } catch (error) {
            if (String(error?.message || error) !== "AI_RETURNED_INVALID_JSON") throw error;
            lastInvalidText = text;
            console.warn(`JSON parse failed (${attempt + 1}/${maxJsonRetries}). Retrying automatically...`);
            if (attempt < maxJsonRetries - 1) {
                await sleep(delay);
                delay = Math.min(delay * 1.6, 1200);
            }
        }
    }

    console.error("AI returned invalid JSON after automatic retries:", lastInvalidText);
    throw new Error(`AI_RETURNED_INVALID_JSON_AFTER_${maxJsonRetries}_RETRIES`);
};
const aspectRatioToSize = (aspectRatio) => {
    if (aspectRatio === "1:1") return "1024x1024";
    return undefined;
};
const imageApiAspectRatio = (aspectRatio) => {
    return aspectRatio;
};
const aspectRatioTargetPixels = (aspectRatio) => {
    if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
    if (aspectRatio === "16:9") return { width: 1920, height: 1080 };
    return null;
};
const normalizeImageToRequestedAspect = async (dataUrl, aspectRatio) => {
    const requestedAspectRatio = String(aspectRatio || "");
    if (!PROJECT_ASPECT_RATIOS.includes(requestedAspectRatio) || typeof window === "undefined" || typeof document === "undefined") return dataUrl;
    return await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            const sourceWidth = image.naturalWidth || image.width;
            const sourceHeight = image.naturalHeight || image.height;
            if (!sourceWidth || !sourceHeight) {
                resolve(dataUrl);
                return;
            }
            const targetPixels = aspectRatioTargetPixels(requestedAspectRatio);
            const canvas = document.createElement("canvas");
            canvas.width = targetPixels?.width || sourceWidth;
            canvas.height = targetPixels?.height || sourceHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                resolve(dataUrl);
                return;
            }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
            const drawWidth = sourceWidth * scale;
            const drawHeight = sourceHeight * scale;
            ctx.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
            resolve(canvas.toDataURL("image/jpeg", 0.94));
        };
        image.onerror = () => resolve(dataUrl);
        image.src = dataUrl;
    });
};
const compressDataUrlImage = async (dataUrl, maxEdge = FAST_REFERENCE_MAX_EDGE, quality = FAST_REFERENCE_QUALITY) => {
    if (!FAST_IMAGE_MODE || typeof window === "undefined" || typeof document === "undefined") return dataUrl;
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/") || dataUrl.startsWith("data:image/svg")) return dataUrl;
    return await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            const width = image.naturalWidth || image.width;
            const height = image.naturalHeight || image.height;
            if (!width || !height || Math.max(width, height) <= maxEdge) {
                resolve(dataUrl);
                return;
            }
            const scale = maxEdge / Math.max(width, height);
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                resolve(dataUrl);
                return;
            }
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", quality));
        };
        image.onerror = () => resolve(dataUrl);
        image.src = dataUrl;
    });
};

const extractImageFromChatCompletion = (result) => {
    const message = result?.choices?.[0]?.message;
    if (!message) return null;

    if (Array.isArray(message.images) && message.images.length) {
        const first = message.images[0];
        const url = first?.image_url?.url || first?.url || first?.b64_json || first;
        if (typeof url === "string" && url) return url;
    }

    if (Array.isArray(message.content)) {
        for (const part of message.content) {
            if (!part) continue;
            if (part.type === "image_url" && part.image_url?.url) return part.image_url.url;
            if (part.type === "image" && part.image_url?.url) return part.image_url.url;
            if (typeof part.b64_json === "string" && part.b64_json) return `data:image/png;base64,${part.b64_json}`;
        }
    }

    if (typeof message.content === "string") {
        const text = message.content.trim();
        if (text.startsWith("data:image/")) return text;
        if (/^[A-Za-z0-9+/=\s]{200,}$/.test(text)) return `data:image/png;base64,${text.replace(/\s+/g, "")}`;
    }

    return null;
};

const generateImage = async (prompt, references = [], aspectRatio = "1:1", modelOverride = "", options: any = {}) => {
    const imageProvider = options.provider || IMAGE_PROVIDER_OPENROUTER;
    const requestedModel = modelOverride || IMAGE_MODEL;
    const model = imageModelForProvider(imageProvider, requestedModel);
    const apiAspectRatio = imageApiAspectRatio(aspectRatio);

    const normalizedRefs = await Promise.all((await prepareReferencesForAi(references))
        .filter((ref) => ref.image)
        .map(async (ref) => ({ ...ref, image: await compressDataUrlImage(ref.image) })));

    const referenceManifest = normalizedRefs.map((ref, index) =>
        `REFERENCE_ASSET_${index + 1}\nTYPE: ${ref.type}\nID: ${ref.id}\nLABEL: ${ref.label}\nAUTHORITY: ${ref.authority}`
    ).join("\n\n");
    const referenceManifestPayload = normalizedRefs.map((ref, index) => ({
        slot: index + 1,
        type: ref.type,
        id: ref.id,
        label: ref.label,
    }));

    const finalPrompt = normalizedRefs.length
        ? `FAST REFERENCE LOCK:\nUse the attached references only for their labeled IDs. Preserve character identity, outfit, locked prop shape/color/pattern/material/markings, and location layout. Do not blend identities. Character reference pose/head direction is NOT a pose instruction; stage the CURRENT script action/dialogue naturally instead of copying a reference portrait. If a PREVIOUS_CONTINUITY_ANCHOR is attached, treat it as the BASE SCENE to continue, not merely inspiration: preserve the same micro-location, indoor/outdoor status, camera direction, left/right object placement, recurring object color/pattern/material, recurring character face/body/hair/headcloth, visible wardrobe layers, fabric motifs, belt/sash, footwear, accessories, and prop handling unless the final task explicitly changes them. Character pose/blocking may change to match the current action. Locked prop world position/screen side must stay fixed unless the final task explicitly relocates that prop. Make the minimum necessary scene change while staging the current action clearly. Physical state locks (SEATED/STANDING/HOLDING/EATING) override beauty composition. Dialogue/action blocking may use natural head turns, body angles, hand positions, and listener reactions as long as identity, wardrobe, prop state, cast count, location, and safe framing remain correct.\n\nENVIRONMENT INTEGRATION: make all referenced characters, props, wardrobe, and location read as one real photographed scene with matching light direction, color temperature, exposure, contrast, contact shadows, ambient occlusion, perspective, lens/depth, grain, and texture. No pasted-on/cutout/greenscreen look. Blend lighting and grade only; never blend identities or prop designs.\n\n${HUMAN_SCALE_LOCK}\n\n${frameFillLock(aspectRatio)}\n\n${referenceManifest}\n\nTARGET ASPECT RATIO: ${aspectRatio}\n\nFINAL TASK:\n${prompt}`
        : `${HUMAN_SCALE_LOCK}\n\n${frameFillLock(aspectRatio)}\n\nENVIRONMENT INTEGRATION: coherent lighting, shadows, color grade, perspective, lens/depth, grain, and texture across subject and place.\n\nTARGET ASPECT RATIO: ${aspectRatio}\n\n${prompt}`;

    const imageBridgeUrl = OPENROUTER_BRIDGE_URL;
    const imageBridgeHeaders = {
        "Content-Type": "application/json",
        ...(imageBridgeUrl.includes("ngrok") ? { "ngrok-skip-browser-warning": "true" } : {}),
    };

    const payload = {
        model,
        prompt: finalPrompt,
        n: 1,
        response_format: "b64_json",
        aspect_ratio: apiAspectRatio,
        mora_bypass_cache: options.bypassCache !== false,
        mora_reference_manifest: referenceManifestPayload,
        ...usageTaskPayload(),
        ...(aspectRatioToSize(apiAspectRatio) ? { size: aspectRatioToSize(apiAspectRatio) } : {}),
        ...(normalizedRefs.length ? { image: normalizedRefs.map((ref) => ref.image) } : {}),
    };
    const result = await fetchJsonWithRetry(`${imageBridgeUrl}/images/generations`, {
        method: "POST",
        headers: imageBridgeHeaders,
        body: JSON.stringify(payload),
    }, 1);
    const item = result?.data?.[0];
    const base64 = item?.b64_json;
    if (!base64) {
        const detail = result?.error?.message || result?.detail || result?.message || "";
        throw new Error(`IMAGE_NOT_RETURNED${detail ? `: ${detail}` : ""}`);
    }
    const mimeType = item?.mime_type || item?.mimeType || "image/png";
    const normalizedImage = await normalizeImageToRequestedAspect(`data:${mimeType};base64,${base64}`, aspectRatio);
    return await uploadGeneratedAsset(normalizedImage, `${model.split("/").pop() || "image"}-${aspectRatio.replace(":", "x")}`);
};
const startOpenRouterVideo = async ({ prompt, anchorImage, aspectRatio = "9:16", durationSeconds = 8, model, resolution = "720p", generateAudio = false }) => {
    const materializedAnchorImage = await materializeImageForAi(anchorImage);
    const response = await fetch(`${API_ROOT}/api/video/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, anchorImage: materializedAnchorImage, aspectRatio, durationSeconds, model, resolution, generateAudio }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) throw new Error(result?.error || result?.detail || `VIDEO_START_${response.status}`);
    return result.job;
};
const pollOpenRouterVideo = async (jobId, onTick) => {
    for (let attempt = 0; attempt < 360; attempt++) {
        onTick?.(`Google video processing... poll ${attempt + 1}`);
        const response = await fetch(`${API_ROOT}/api/video/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.ok) throw new Error(result?.error || result?.detail || `VIDEO_STATUS_${response.status}`);
        const job = result.job || {};
        if (job.status === "completed") return job;
        if (["failed", "cancelled", "expired"].includes(job.status)) throw new Error(`VIDEO_${String(job.status).toUpperCase()}: ${job.error || "unknown error"}`);
        await sleep(5000);
    }
    throw new Error("VIDEO_POLL_TIMEOUT: Google video membutuhkan lebih dari 30 menit.");
};
const downloadOpenRouterVideoToBlobUrl = async (jobId) => {
    const response = await fetch(`${API_ROOT}/api/video/jobs/${encodeURIComponent(jobId)}/content`, { cache: "no-store" });
    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`VIDEO_DOWNLOAD_${response.status}${detail ? `: ${detail}` : ""}`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
};
const captureVideoLastFrameImage = (videoUrl) => new Promise<string>((resolve, reject) => {
    if (typeof document === "undefined") {
        reject(new Error("VIDEO_LAST_FRAME_CAPTURE_UNAVAILABLE"));
        return;
    }
    const video = document.createElement("video");
    let timeout: number | null = null;
    let done = false;
    const cleanup = () => {
        if (timeout !== null) window.clearTimeout(timeout);
        video.removeAttribute("src");
        video.load();
    };
    const fail = (error) => {
        if (done) return;
        done = true;
        cleanup();
        reject(error);
    };
    const draw = () => {
        if (done) return;
        try {
            const width = video.videoWidth || 1080;
            const height = video.videoHeight || 1920;
            if (!width || !height) throw new Error("VIDEO_LAST_FRAME_EMPTY_DIMENSIONS");
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("VIDEO_LAST_FRAME_CANVAS_UNAVAILABLE");
            context.drawImage(video, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
            done = true;
            cleanup();
            resolve(dataUrl);
        } catch (error) {
            fail(error);
        }
    };
    timeout = window.setTimeout(() => fail(new Error("VIDEO_LAST_FRAME_CAPTURE_TIMEOUT")), 20000);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.addEventListener("error", () => fail(new Error("VIDEO_LAST_FRAME_CAPTURE_FAILED")), { once: true });
    video.addEventListener("seeked", draw, { once: true });
    video.addEventListener("loadedmetadata", () => {
        const duration = Number(video.duration);
        const targetTime = Number.isFinite(duration) && duration > 0.16 ? Math.max(0, duration - 0.08) : 0;
        if (targetTime <= 0.01) {
            video.addEventListener("loadeddata", draw, { once: true });
        } else {
            video.currentTime = targetTime;
        }
    }, { once: true });
    video.src = videoUrl;
    video.load();
});
export default function MicroDramaVeoStudio() {
    const [authenticated, setAuthenticated] = useState(() => {
        if (typeof window === "undefined") return false;
        return window.localStorage.getItem(AUTH_STORAGE_KEY) === "true";
    });
    const [workspaces, setWorkspaces] = useState(() => loadStoredWorkspaces());
    const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
    const [workspaceName, setWorkspaceName] = useState("");
    const [stage, setStage] = useState("project");
    const [project, setProject] = useState({ ...DEFAULT_PROJECT });
    const projectAspectRatio = normalizeProjectAspectRatio(project.aspectRatio);
    const projectAspectLabel = aspectRatioFormatLabel(projectAspectRatio);
    const anchorFrameStyle = { aspectRatio: aspectRatioToCssValue(projectAspectRatio), maxWidth: projectAspectRatio === "16:9" ? "760px" : "460px" };
    const [characters, setCharacters] = useState([]);
    const [locations, setLocations] = useState([]);
    const [props, setProps] = useState([]);
    const [episodes, setEpisodes] = useState([]);
    const [scripts, setScripts] = useState({});
    const [shots, setShots] = useState([]);
    const [selectedEpisode, setSelectedEpisode] = useState(1);
    const [selectedShotId, setSelectedShotId] = useState(null);
    const [selectedImageModel, setSelectedImageModel] = useState(IMAGE_MODEL);
    const [selectedImageProvider, setSelectedImageProvider] = useState(DEFAULT_PROJECT.imageProvider);
    const [customImageModel, setCustomImageModel] = useState("");
    const [videoModels, setVideoModels] = useState(VIDEO_MODEL_FALLBACKS);
    const [videoModelsLoading, setVideoModelsLoading] = useState(false);
    const [selectedVideoModel, setSelectedVideoModel] = useState(DEFAULT_VIDEO_MODEL);
    const [videoResolution, setVideoResolution] = useState("720p");
    const [videoGenerateAudio, setVideoGenerateAudio] = useState(false);
    const [visualLoading, setVisualLoading] = useState(false);
    const [guardLoading, setGuardLoading] = useState(false);
    const [museLoading, setMuseLoading] = useState(false);
    const [museBrief, setMuseBrief] = useState("");
    const [museCreativePack, setMuseCreativePack] = useState("");
    const [visualSource, setVisualSource] = useState("");
    const [guardSource, setGuardSource] = useState("");
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState("");
    const [error, setError] = useState("");
    const [storageReady, setStorageReady] = useState(false);
    const [savingProject, setSavingProject] = useState(false);
    const [clearingProject, setClearingProject] = useState(false);
    const [saveMessage, setSaveMessage] = useState("LOADING PROJECT...");
    const [accountCredits, setAccountCredits] = useState<any>({
        status: "loading",
        quotas: [],
        usageInfo: null,
        plan: null,
        aiCreditsRemaining: null,
        fetchedAt: null,
        error: "",
        raw: null,
    });
    const accountCreditsRef = useRef<any>(null);
    const [creditsRefreshing, setCreditsRefreshing] = useState(false);
    const [sessionsRefreshing, setSessionsRefreshing] = useState(false);
    const [creditEvents, setCreditEvents] = useState([]);
    const [usageLogRows, setUsageLogRows] = useState([]);
    const [usageLogLoading, setUsageLogLoading] = useState(false);
    const [usageLogError, setUsageLogError] = useState("");
    const [promptExpanded, setPromptExpanded] = useState(false);
    const [qaExpanded, setQaExpanded] = useState(false);
    const [creditsDetectedOpen, setCreditsDetectedOpen] = useState(false);
    const autosaveTimerRef = useRef(null);
    const skipNextAutosaveRef = useRef(false);
    const saveQueueRef = useRef(Promise.resolve());
    const saveRevisionRef = useRef(0);
    const anchorGenerationRef = useRef({ runId: 0, stopped: false });
    const beginAnchorGenerationRun = () => {
        const runId = anchorGenerationRef.current.runId + 1;
        anchorGenerationRef.current = { runId, stopped: false };
        return runId;
    };
    const isAnchorGenerationStopped = (runId) => anchorGenerationRef.current.stopped || anchorGenerationRef.current.runId !== runId;
    const throwIfAnchorGenerationStopped = (runId) => {
        if (isAnchorGenerationStopped(runId)) throw new Error(ANCHOR_STOPPED_ERROR);
    };
    const stopAnchorGeneration = () => {
        anchorGenerationRef.current = { runId: anchorGenerationRef.current.runId + 1, stopped: true };
        setBusy(false);
        setProgress("Anchor generation stopped.");
        setShots((prev) => prev.map((item) => item.anchorStatus === "generating" ? { ...item, anchorStatus: item.anchorImage ? "ready" : "idle" } : item));
        if (typeof window !== "undefined") window.setTimeout(() => setProgress(""), 1400);
    };
    const handleLogin = (username, password) => {
        if (username === "admin" && password === "admin") {
            if (typeof window !== "undefined") window.localStorage.setItem(AUTH_STORAGE_KEY, "true");
            setAuthenticated(true);
            return true;
        }
        return false;
    };
    const handleLogout = () => {
        if (typeof window !== "undefined") window.localStorage.removeItem(AUTH_STORAGE_KEY);
        setAuthenticated(false);
        setActiveWorkspaceId(null);
    };
    const activeWorkspace = useMemo(() => workspaces.find((item) => item.id === activeWorkspaceId) || null, [workspaces, activeWorkspaceId]);
    const persistWorkspaces = (nextWorkspaces) => {
        setWorkspaces(nextWorkspaces);
        saveStoredWorkspaces(nextWorkspaces);
    };
    const reportDbError = (err) => {
        console.error(err);
        setError(String(err?.message || err));
    };
    const loadDbWorkspaces = async () => {
        const response = await fetch(`${API_ROOT}/api/workspaces/local`, { method: "GET", cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.ok) throw new Error(result?.error || result?.detail || `HTTP_${response.status}`);
        const rows = Array.isArray(result.workspaces) ? result.workspaces.map(normalizeDbWorkspace).filter((item) => item.id) : [];
        persistWorkspaces(rows);
        return rows;
    };
    const createWorkspace = async () => {
        const name = toText(workspaceName);
        if (!name) { setError("Isi nama workspace terlebih dahulu."); return; }
        try {
            const response = await fetch(`${API_ROOT}/api/workspaces/local`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.ok) throw new Error(result?.error || result?.detail || `HTTP_${response.status}`);
            const workspace = normalizeDbWorkspace(result.workspace);
            persistWorkspaces([workspace, ...workspaces.filter((item) => item.id !== workspace.id)]);
            setWorkspaceName("");
            setActiveWorkspaceId(workspace.id);
        } catch (err) {
            reportDbError(err);
        }
    };
    const openWorkspace = (workspaceId) => {
        setActiveWorkspaceId(workspaceId);
    };
    const renameWorkspace = async (workspaceId, nextName) => {
        const name = toText(nextName);
        if (!name) return;
        try {
            const response = await fetch(`${API_ROOT}/api/workspaces/local/${encodeURIComponent(workspaceId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.ok) throw new Error(result?.error || result?.detail || `HTTP_${response.status}`);
            const normalized = normalizeDbWorkspace(result.workspace);
            persistWorkspaces(workspaces.map((item) => item.id === workspaceId ? { ...item, ...normalized } : item));
        } catch (err) {
            reportDbError(err);
        }
    };
    const deleteWorkspace = async (workspaceId) => {
        const workspace = workspaces.find((item) => item.id === workspaceId);
        const label = workspace?.name ? `"${workspace.name}"` : "workspace ini";
        if (typeof window !== "undefined" && !window.confirm(`Hapus ${label} beserta data project lokalnya?`)) return;
        try {
            await fetch(`${API_ROOT}/api/workspaces/local/${encodeURIComponent(workspaceId)}`, { method: "DELETE" })
                .then(async (response) => {
                    const result = await response.json().catch(() => ({}));
                    if (!response.ok || !result?.ok) throw new Error(result?.error || result?.detail || `HTTP_${response.status}`);
                });
            await deleteSavedProject(getWorkspaceProjectKey(workspaceId));
        } catch (err) {
            console.error("Workspace delete failed:", err);
            reportDbError(err);
            return;
        }
        persistWorkspaces(workspaces.filter((item) => item.id !== workspaceId));
        if (activeWorkspaceId === workspaceId) {
            skipNextAutosaveRef.current = true;
            setActiveWorkspaceId(null);
            resetProjectState();
        }
    };
    const closeWorkspace = () => {
        if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
        skipNextAutosaveRef.current = true;
        setStorageReady(false);
        setActiveWorkspaceId(null);
        resetProjectState();
        setSaveMessage("SELECT WORKSPACE");
    };
    const loadAccountCredits = async ({ silent = false }: { silent?: boolean; forceCookieRefresh?: boolean; refresh?: boolean } = {}) => {
        if (!silent) setCreditsRefreshing(true);
        try {
            const snapshot = accountCreditsRef.current || accountCredits;
            return snapshot;
        } finally {
            if (!silent) setCreditsRefreshing(false);
        }
    };
    const loadUsageLogs = async ({ silent = false } = {}) => {
        if (!silent) setUsageLogLoading(true);
        setUsageLogError("");
        try {
            const response = await fetch(`${API_ROOT}/api/usage/logs?limit=500`, {
                method: "GET",
                cache: "no-store",
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.ok) throw new Error(result?.error || result?.detail || `HTTP_${response.status}`);
            setUsageLogRows(Array.isArray(result.usage) ? result.usage : []);
        } catch (err) {
            setUsageLogError(String(err?.message || err));
        } finally {
            if (!silent) setUsageLogLoading(false);
        }
    };
    const loadVideoModels = async ({ silent = false } = {}) => {
        if (!silent) setVideoModelsLoading(true);
        try {
            const response = await fetch(`${API_ROOT}/api/video/models`, { cache: "no-store" });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.ok) throw new Error(result?.error || result?.detail || `HTTP_${response.status}`);
            const models = Array.isArray(result.models) && result.models.length ? result.models : VIDEO_MODEL_FALLBACKS;
            setVideoModels(models);
            if (!models.some((model) => model.id === selectedVideoModel)) {
                setSelectedVideoModel(models[0]?.id || DEFAULT_VIDEO_MODEL);
            }
        } catch (err) {
            console.warn("Video model catalog unavailable; using fallback list:", err);
            setVideoModels(VIDEO_MODEL_FALLBACKS);
        } finally {
            if (!silent) setVideoModelsLoading(false);
        }
    };
    const appendCreditEvent = (entry) => {
        setCreditEvents((prev) => [{ id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, ...entry }, ...prev].slice(0, CREDIT_LOG_LIMIT));
    };
    const withCreditMeter = async (label, type, task) => {
        const startedAt = Date.now();
        let before = accountCreditsRef.current || accountCredits;
        if (AUTO_CREDIT_METERING && (!before || before.status === "loading")) {
            before = await loadAccountCredits({ silent: true });
        }
        try {
            const result = await withAiUsageContext({ label, type }, task);
            const after = AUTO_CREDIT_METERING ? await loadAccountCredits({ silent: true }) : before;
            const deltas = calculateCreditDeltas(before, after);
            appendCreditEvent({
                at: new Date(startedAt).toISOString(),
                label, type, status: "success",
                durationMs: Date.now() - startedAt,
                before: summarizeCreditSnapshot(before),
                after: summarizeCreditSnapshot(after),
                deltaText: formatCreditDelta(deltas),
                deltas,
            });
            if (!AUTO_CREDIT_METERING && type !== "text") {
                window.setTimeout(() => loadAccountCredits({ silent: true }), 1200);
            }
            return result;
        } catch (err) {
            const after = AUTO_CREDIT_METERING ? await loadAccountCredits({ silent: true }).catch(() => null) : before;
            const deltas = calculateCreditDeltas(before, after);
            appendCreditEvent({
                at: new Date(startedAt).toISOString(),
                label, type, status: "error",
                durationMs: Date.now() - startedAt,
                before: summarizeCreditSnapshot(before),
                after: summarizeCreditSnapshot(after),
                deltaText: formatCreditDelta(deltas),
                deltas,
                error: String(err?.message || err),
            });
            if (!AUTO_CREDIT_METERING && type !== "text") {
                window.setTimeout(() => loadAccountCredits({ silent: true }), 1200);
            }
            throw err;
        }
    };
    useEffect(() => {
        accountCreditsRef.current = accountCredits;
    }, [accountCredits]);
    useEffect(() => {
        if (!authenticated) return;
        loadDbWorkspaces().catch((err) => {
            console.warn("DB workspace load failed; using local workspace cache:", err);
        });
        loadVideoModels({ silent: true });
    }, [authenticated]);
    const buildProjectSnapshot = ({ shotsOverride = null } = {}) => ({
        schemaVersion: PROJECT_SCHEMA_VERSION, savedAt: Date.now(),
        workspaceId: activeWorkspaceId,
        stage, project, characters, locations, props, episodes, scripts,
        shots: makePersistableShots(Array.isArray(shotsOverride) ? shotsOverride : shots),
        selectedEpisode, selectedShotId, visualSource, guardSource, museBrief, museCreativePack, creditEvents,
        imageModel: selectedImageModel,
        imageProvider: selectedImageProvider,
        videoModel: selectedVideoModel,
        videoResolution,
        videoGenerateAudio,
    });
    const saveProjectNow = async ({ silent = false, shotsOverride = null } = {}) => {
        if (!storageReady || !activeWorkspaceId) return;

        const workspaceIdAtRequest = activeWorkspaceId;
        const revision = ++saveRevisionRef.current;
        const snapshotAtRequest = buildProjectSnapshot({ shotsOverride });
        if (!silent) setSavingProject(true);

        const executeSave = async () => {
            try {
                let snapshot = snapshotAtRequest;
                const externalized = await externalizeSnapshotImages(snapshot);
                snapshot = externalized.snapshot;

                const isLatestRevision = revision === saveRevisionRef.current && workspaceIdAtRequest === activeWorkspaceId;
                if (externalized.changed && isLatestRevision) {
                    setCharacters(snapshot.characters || []);
                    setLocations(snapshot.locations || []);
                    setProps(snapshot.props || []);
                    setShots((prev) => prev.map((item) => {
                        const savedShot = (snapshot.shots || []).find((shot) => shot.id === item.id);
                        return savedShot ? { ...item, anchorImage: savedShot.anchorImage } : item;
                    }));
                }

                await writeSavedProject(snapshot, getWorkspaceProjectKey(workspaceIdAtRequest));
                const syncBackendSnapshot = async () => {
                    const response = await fetch(`${API_ROOT}/api/workspaces/local/${encodeURIComponent(workspaceIdAtRequest)}/snapshot`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ snapshot, schemaVersion: PROJECT_SCHEMA_VERSION }),
                    });
                    const result = await response.json().catch(() => ({}));
                    if (!response.ok || !result?.ok) throw new Error(result?.error || result?.detail || `HTTP_${response.status}`);
                };
                if (silent) {
                    await syncBackendSnapshot().catch((err) => {
                        console.warn("Silent DB snapshot sync failed; local IndexedDB remains newer:", err);
                    });
                } else {
                    await syncBackendSnapshot();
                }

                if (isLatestRevision) {
                    const updatedAt = Date.now();
                    persistWorkspaces(workspaces.map((item) => item.id === workspaceIdAtRequest ? { ...item, updatedAt } : item));
                    const stamp = new Date();
                    const label = `${String(stamp.getHours()).padStart(2, "0")}:${String(stamp.getMinutes()).padStart(2, "0")}:${String(stamp.getSeconds()).padStart(2, "0")}`;
                    setSaveMessage(silent ? `AUTO-SAVED ${label}` : `PROJECT SAVED ${label}`);
                }
            } catch (err) {
                console.error("Project save failed:", err);
                if (revision === saveRevisionRef.current) setSaveMessage("SAVE FAILED");
                if (!silent) reportDbError(err);
            } finally {
                if (!silent && revision === saveRevisionRef.current) setSavingProject(false);
            }
        };

        saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(executeSave);
        return saveQueueRef.current;
    };
    const resetProjectState = () => {
        shots.forEach((shot) => {
            if (typeof shot.videoUrl === "string" && shot.videoUrl.startsWith("blob:")) {
                URL.revokeObjectURL(shot.videoUrl);
            }
        });
        setStage("project");
        setProject({ ...DEFAULT_PROJECT });
        setCharacters([]);
        setLocations([]);
        setProps([]);
        setEpisodes([]);
        setScripts({});
        setShots([]);
        setSelectedEpisode(1);
        setSelectedShotId(null);
        setVisualSource("");
        setGuardSource("");
        setMuseBrief("");
        setMuseCreativePack("");
        setCreditEvents([]);
        setPromptExpanded(false);
        setProgress("");
        setError("");
        setSelectedImageModel(IMAGE_MODEL);
        setSelectedImageProvider(DEFAULT_PROJECT.imageProvider);
        setCustomImageModel("");
    };
    const clearProjectNow = async () => {
        if (!storageReady || !activeWorkspaceId || clearingProject) return;
        if (typeof window !== "undefined" && !window.confirm("Clear saved project data from this browser?")) return;
        setClearingProject(true);
        try {
            await deleteSavedProject(getWorkspaceProjectKey(activeWorkspaceId));
            skipNextAutosaveRef.current = true;
            resetProjectState();
            setSaveMessage("LOCAL PROJECT CLEARED");
        } catch (err) {
            console.error("Project clear failed:", err);
            setSaveMessage("CLEAR FAILED");
            handleError(err);
        } finally {
            setClearingProject(false);
        }
    };
    const clearReferenceImagesNow = async () => {
        if (!storageReady || !activeWorkspaceId || savingProject || busy) return;
        const referenceCount =
            characters.filter((item) => item.referenceImage).length +
            locations.filter((item) => item.referenceImage).length +
            props.filter((item) => item.referenceImage).length +
            shots.filter((item) => item.anchorImage).length +
            shots.filter((item) => item.videoLastFrameImage).length;
        if (referenceCount === 0) {
            setSaveMessage("NO REFERENCES TO CLEAR");
            return;
        }
        if (typeof window !== "undefined" && !window.confirm(`Hapus ${referenceCount} reference/anchor image dari snapshot workspace ini? Script, dialogue, dan manifest tetap disimpan.`)) return;

        const cleanedCharacters = characters.map((item) => ({
            ...item,
            referenceImage: "",
            status: item.locked ? "idle" : (item.status || "idle"),
            locked: false,
        }));
        const cleanedLocations = locations.map((item) => ({
            ...item,
            referenceImage: "",
            status: item.locked ? "idle" : (item.status || "idle"),
            locked: false,
        }));
        const cleanedProps = props.map((item) => ({
            ...item,
            referenceImage: "",
            status: item.locked ? "idle" : (item.status || "idle"),
            locked: false,
        }));
        const cleanedShots = shots.map((item) => ({
            ...item,
            anchorImage: null,
            anchorStatus: "idle",
            anchorQaFeedback: [],
            anchorNeedsManualFix: false,
            qa: makeShotQA(),
            videoLastFrameImage: null,
            videoLastFrameCapturedAt: null,
            videoStatus: item.videoStatus === "generating" ? "idle" : item.videoStatus,
            videoPrompt: item.videoPrompt || "",
        }));
        const cleanedSnapshot = {
            ...buildProjectSnapshot(),
            savedAt: Date.now(),
            characters: cleanedCharacters,
            locations: cleanedLocations,
            props: cleanedProps,
            shots: makePersistableShots(cleanedShots),
        };

        setSavingProject(true);
        setSaveMessage("CLEARING REFERENCES...");
        try {
            setCharacters(cleanedCharacters);
            setLocations(cleanedLocations);
            setProps(cleanedProps);
            setShots(cleanedShots);
            await writeSavedProject(cleanedSnapshot, getWorkspaceProjectKey(activeWorkspaceId));
            const response = await fetch(`${API_ROOT}/api/workspaces/local/${encodeURIComponent(activeWorkspaceId)}/snapshot`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ snapshot: cleanedSnapshot, schemaVersion: PROJECT_SCHEMA_VERSION }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.ok) throw new Error(result?.error || result?.detail || `HTTP_${response.status}`);
            skipNextAutosaveRef.current = true;
            setSaveMessage(`REFERENCES CLEARED (${referenceCount})`);
            setProgress("Reference lama sudah dihapus dari snapshot. Generate references baru dulu sebelum generate anchor.");
            window.setTimeout(() => setProgress(""), 3600);
        } catch (err) {
            console.error("Reference clear failed:", err);
            setSaveMessage("CLEAR REFERENCES FAILED");
            reportDbError(err);
        } finally {
            setSavingProject(false);
        }
    };
    useEffect(() => {
        let active = true;
        const refreshAccount = async (forceCookieRefresh = false) => {
            if (!active) return;
            await loadAccountCredits({ silent: true, forceCookieRefresh, refresh: forceCookieRefresh });
        };
        refreshAccount(true);
        const timer = window.setInterval(() => refreshAccount(false), 300000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const restore = async () => {
            if (!authenticated || !activeWorkspaceId) {
                setStorageReady(false);
                return;
            }
            setStorageReady(false);
            skipNextAutosaveRef.current = true;
            resetProjectState();
            try {
                let remoteSaved = null;
                try {
                    const response = await fetch(`${API_ROOT}/api/workspaces/local/${encodeURIComponent(activeWorkspaceId)}/snapshot`, {
                        method: "GET",
                        cache: "no-store",
                    });
                    const result = await response.json().catch(() => ({}));
                    if (response.ok && result?.ok && result.snapshot?.snapshot) remoteSaved = result.snapshot.snapshot;
                } catch (err) {
                    console.warn("DB snapshot restore failed, falling back to local IndexedDB:", err);
                }
                const localSaved = await readSavedProject(getWorkspaceProjectKey(activeWorkspaceId));
                let saved = remoteSaved || localSaved;
                if (remoteSaved && localSaved) {
                    const remoteTime = snapshotSavedAt(remoteSaved);
                    const localTime = snapshotSavedAt(localSaved);
                    const remoteImages = countSnapshotImages(remoteSaved);
                    const localImages = countSnapshotImages(localSaved);
                    saved = localTime > remoteTime || (localTime === remoteTime && localImages > remoteImages)
                        ? localSaved
                        : remoteSaved;
                    if (saved === localSaved && localTime >= remoteTime) {
                        fetch(`${API_ROOT}/api/workspaces/local/${encodeURIComponent(activeWorkspaceId)}/snapshot`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ snapshot: localSaved, schemaVersion: PROJECT_SCHEMA_VERSION }),
                        }).catch((err) => console.warn("Could not heal backend snapshot from newer local copy:", err));
                    }
                }
                if (cancelled) return;
                if (saved) {
                    if (saved.project) {
                        const regionMode = saved.project.regionMode || "Indonesia";
                        const country = regionMode === "Indonesia" ? "Indonesia" : (saved.project.country || "China");
                        setProject({ ...saved.project, regionMode, country, language: saved.project.language || getCountryLanguage(country), imageProvider: toText(saved.imageProvider || saved.project.imageProvider) || DEFAULT_PROJECT.imageProvider });
                    }
                    setCharacters(Array.isArray(saved.characters) ? saved.characters : []);
                    setLocations(Array.isArray(saved.locations) ? saved.locations : []);
                    setProps(Array.isArray(saved.props) ? saved.props : []);
                    setEpisodes(Array.isArray(saved.episodes) ? saved.episodes : []);
                    setScripts(saved.scripts && typeof saved.scripts === "object" ? saved.scripts : {});
                    setShots(restorePersistedShots(saved.shots));
                    setSelectedEpisode(Number(saved.selectedEpisode || 1));
                    setSelectedShotId(saved.selectedShotId || null);
                    setVisualSource(toText(saved.visualSource));
                    setGuardSource(toText(saved.guardSource));
                    setMuseBrief(toText(saved.museBrief));
                    setMuseCreativePack(toText(saved.museCreativePack));
                    setCreditEvents(Array.isArray(saved.creditEvents) ? saved.creditEvents.slice(0, CREDIT_LOG_LIMIT) : []);
                    setStage(saved.stage === "usage" ? "project" : (["episodes", "scripts", "shots"].includes(saved.stage) ? "render" : (saved.stage || "project")));
                    const savedImageModel = toText(saved.imageModel);
                    setSelectedImageModel(IMAGE_MODEL_PRESETS.some((model) => model.id === savedImageModel) ? savedImageModel : IMAGE_MODEL);
                    setSelectedImageProvider(toText(saved.imageProvider) || saved.project?.imageProvider || DEFAULT_PROJECT.imageProvider);
                    const savedVideoModel = toText(saved.videoModel);
                    setSelectedVideoModel(VIDEO_MODEL_FALLBACKS.some((model) => model.id === savedVideoModel) ? savedVideoModel : DEFAULT_VIDEO_MODEL);
                    setVideoResolution(toText(saved.videoResolution) || "720p");
                    setVideoGenerateAudio(Boolean(saved.videoGenerateAudio));
                    setSaveMessage(saved === localSaved && remoteSaved ? "PROJECT RESTORED (LOCAL NEWER)" : "PROJECT RESTORED");
                } else setSaveMessage("AUTO-SAVE READY");
            } catch (err) {
                console.error("Project restore failed:", err);
                setSaveMessage("STORAGE UNAVAILABLE");
            } finally { if (!cancelled) setStorageReady(true); }
        };
        restore();
        return () => { cancelled = true; };
    }, [authenticated, activeWorkspaceId]);
    useEffect(() => {
        if (!storageReady || !activeWorkspaceId) return;
        if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
        if (skipNextAutosaveRef.current) {
            skipNextAutosaveRef.current = false;
            return;
        }
        autosaveTimerRef.current = window.setTimeout(() => { saveProjectNow({ silent: true }); }, 900);
        return () => { if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current); };
    }, [storageReady, activeWorkspaceId, stage, project, characters, locations, props, episodes, scripts, shots, selectedEpisode, selectedShotId, visualSource, guardSource, museBrief, museCreativePack, creditEvents, selectedImageModel, selectedImageProvider, selectedVideoModel, videoResolution, videoGenerateAudio]);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const usageWindow = new URLSearchParams(window.location.search).get("view") === "usage-log";
        if (!usageWindow) return;
        loadUsageLogs({ silent: false });
        const timer = window.setInterval(() => loadUsageLogs({ silent: true }), 10000);
        return () => window.clearInterval(timer);
    }, []);
    const regionProfile = useMemo(() => getProjectRegionProfile(project), [project.regionMode, project.country]);
    const projectContextKey = useMemo(() => JSON.stringify({
        title: toText(project.title), genre: toText(project.genre), premise: toText(project.premise),
        regionMode: regionProfile.regionMode, country: regionProfile.country, language: regionProfile.language,
    }), [project.title, project.genre, project.premise, regionProfile]);
    const baseContextReady = !!toText(project.title) && !!toText(project.genre) && !!toText(project.premise);
    const visualOutdated = !!toText(project.visualStyle) && !!visualSource && visualSource !== projectContextKey;
    const guardOutdated = !!toText(project.storyRules) && !!guardSource && guardSource !== projectContextKey;
    const characterMap = useMemo(() => new Map(characters.map((item) => [item.id, item])), [characters]);
    const locationMap = useMemo(() => new Map(locations.map((item) => [item.id, item])), [locations]);
    const propMap = useMemo(() => new Map(props.map((item) => [item.id, item])), [props]);
    const selectedShot = useMemo(() => shots.find((shot) => shot.id === selectedShotId) || null, [shots, selectedShotId]);
    const selectedVideoModelInfo = useMemo(
        () => videoModels.find((model) => model.id === selectedVideoModel) || VIDEO_MODEL_FALLBACKS.find((model) => model.id === selectedVideoModel) || videoModels[0] || null,
        [videoModels, selectedVideoModel]
    );

    // ========================================================================
    // TAG RESOLUTION HELPERS (@character / @location / @prop)
    // ========================================================================
    const makeAssetMentionSlug = (value = "") => String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 96);

    const getAssetAliases = (asset: any) => {
        const rawAliases = Array.isArray(asset?.aliases) ? asset.aliases : [];
        return uniqueStrings([
            asset?.id,
            asset?.name,
            asset?.displayName,
            asset?.label,
            asset?.slug,
            asset?.code,
            asset?.key,
            ...rawAliases,
        ]);
    };

    const getSelectedShotAssetTagOptions = (shot) => {
        if (!shot) return [];
        const result: Array<{ type: "character" | "location" | "prop"; id: string; label: string; mention: string; aliases: string[] }> = [];
        const pushAsset = (type: "character" | "location" | "prop", asset: any) => {
            const id = toText(asset?.id);
            if (!id) return;
            const label = toText(asset?.name || asset?.displayName || asset?.label) || id;
            const aliases = uniqueStrings(getAssetAliases(asset).map(normalizeMentionKey).filter(Boolean));
            const preferredNameSlug = makeAssetMentionSlug(label);
            const mention = preferredNameSlug ? `@${preferredNameSlug}` : `@${id}`;
            result.push({ type, id, label, mention, aliases });
        };

        normalizeIdList(shot.characterIds || []).forEach((id) => pushAsset("character", characterMap.get(id)));
        const locationId = toText(shot.locationId);
        if (locationId) pushAsset("location", locationMap.get(locationId));
        normalizeIdList(shot.propIds || []).forEach((id) => pushAsset("prop", propMap.get(id)));

        const preferredCounts = new Map<string, number>();
        result.forEach((item) => {
            const slug = makeAssetMentionSlug(item.label);
            if (slug) preferredCounts.set(slug, (preferredCounts.get(slug) || 0) + 1);
        });
        return result.map((item) => {
            const preferredSlug = makeAssetMentionSlug(item.label);
            return {
                ...item,
                mention: preferredSlug && preferredCounts.get(preferredSlug) === 1
                    ? `@${preferredSlug}`
                    : `@${makeAssetMentionSlug(item.id) || item.id}`,
            };
        });
    };

    const resolveAssetTagToken = (token: string, options: ReturnType<typeof getSelectedShotAssetTagOptions>) => {
        const key = normalizeMentionKey(token);
        if (!key) return { matches: [] as any[] };
        return {
            matches: options.filter((option) => option.aliases.includes(key) || normalizeMentionKey(option.mention.slice(1)) === key),
        };
    };

    const resolveDirectAnchorAssetTags = (text = "", shot = null) => {
        const raw = String(text || "");
        const options = getSelectedShotAssetTagOptions(shot);
        const refs: Array<{ token: string; type: string; id: string; label: string; mention: string }> = [];
        const unmatched: string[] = [];
        const ambiguous: string[] = [];
        const seen = new Set<string>();
        raw.replace(/@([a-zA-Z0-9][a-zA-Z0-9_-]*)/g, (_match, token) => {
            const normalizedToken = String(token || "").trim();
            const { matches } = resolveAssetTagToken(normalizedToken, options);
            if (matches.length === 1) {
                const item = matches[0];
                const key = `${item.type}:${item.id}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    refs.push({ token: normalizedToken, type: item.type, id: item.id, label: item.label, mention: item.mention });
                }
            } else if (matches.length > 1) {
                if (!ambiguous.includes(normalizedToken)) ambiguous.push(normalizedToken);
            } else if (!unmatched.includes(normalizedToken)) {
                unmatched.push(normalizedToken);
            }
            return _match;
        });
        return { options, refs, unmatched, ambiguous };
    };

    const canonicalizeDirectAnchorAssetTags = (text = "", shot = null) => {
        const raw = String(text || "");
        const options = getSelectedShotAssetTagOptions(shot);
        return raw.replace(/@([a-zA-Z0-9][a-zA-Z0-9_-]*)/g, (match, token) => {
            const { matches } = resolveAssetTagToken(String(token || ""), options);
            if (matches.length !== 1) return match;
            const item = matches[0];
            const authority = item.type === "character"
                ? "CHARACTER_MASTER"
                : item.type === "location"
                    ? "LOCATION_MASTER"
                    : "PROP_MASTER";
            return `[${authority}:${item.id}]`;
        });
    };

    // Resolve @mention di free text (SHOT ACTION / CONTINUITY SETUP) menjadi bentuk eksplisit
    // "NAME (ID)" supaya engine video/anchor tahu persis karakter/prop mana yang dimaksud.
    // Token yang tidak cocok dengan asset shot dibiarkan apa adanya (dianggap teks biasa).
    const resolveMentionsInFreeText = (text = "", shot = null) => {
        const raw = String(text || "");
        if (!raw || !shot) return raw;
        const options = getSelectedShotAssetTagOptions(shot);
        if (!options.length) return raw;
        return raw.replace(/@([a-zA-Z0-9][a-zA-Z0-9_-]*)/g, (match, token) => {
            const { matches } = resolveAssetTagToken(String(token || ""), options);
            if (matches.length !== 1) return match;
            const item = matches[0];
            return `${item.label} (${item.id})`;
        });
    };

    type CharacterTagOption = { id: string; label: string; mention: string; aliases: string[] };
    const getSelectedShotCharacterTagOptions = (shot): CharacterTagOption[] => {
        if (!shot) return [];
        return normalizeIdList(shot.characterIds || []).map((id): CharacterTagOption | null => {
            const character = characterMap.get(id);
            if (!character) return null;
            const label = toText(character.name || character.displayName || character.label) || id;
            const preferredSlug = makeAssetMentionSlug(label);
            const mention = preferredSlug ? `@${preferredSlug}` : `@${id}`;
            const aliases = uniqueStrings([
                ...characterMentionAliases(character),
                ...getAssetAliases(character).map(normalizeMentionKey),
                normalizeMentionKey(mention.slice(1)),
            ]).map(normalizeMentionKey).filter(Boolean);
            return { id, label, mention, aliases };
        }).filter((item): item is CharacterTagOption => Boolean(item));
    };

    // ========================================================================
    // CAMERA ENFORCEMENT — directive keras per mode kamera
    // ========================================================================
    const CAMERA_MOVEMENT_ENFORCEMENT: Record<string, string[]> = {
        STATIC: [
            "CAMERA MUST BE COMPLETELY LOCKED-OFF.",
            "NO pan. NO tilt. NO dolly. NO zoom. NO truck. NO pedestal. NO orbit. NO crane.",
            "NO handheld shake. NO drift. NO push-in. NO pull-out.",
            "Only the micro-jitter of a real tripod is allowed (imperceptible breathing).",
            "If the model wants to add camera motion for cinematic effect, it must NOT — keep the frame locked.",
            "Characters move inside the frame; the camera does not.",
        ],
        PAN: [
            "CAMERA MUST PAN HORIZONTALLY across the scene.",
            "The pan direction is specified by the CAMERA SCRIPT if present; otherwise pan gently toward the speaking character/action.",
            "The pan must be smooth and controlled, executed at a natural speed.",
            "Do NOT add vertical tilt during the pan.",
            "Do NOT zoom or dolly while panning.",
            "The pan must be the primary camera movement of the shot.",
        ],
        TILT: [
            "CAMERA MUST TILT VERTICALLY (up or down) during the shot.",
            "The tilt direction is specified by the CAMERA SCRIPT if present; otherwise tilt slightly up or down to follow the action.",
            "The tilt must be smooth and controlled.",
            "Do NOT pan horizontally during the tilt.",
            "Do NOT zoom or dolly while tilting.",
        ],
        PUSH_IN: [
            "CAMERA MUST SLOWLY PUSH IN (dolly forward) toward the subject during the shot.",
            "The push-in should be gradual, motivated by dramatic intensity.",
            "The push-in must NOT be abrupt or fast.",
            "Do NOT add handheld shake during the push-in unless HANDHELD mode is also enabled.",
            "Do NOT cut away during the push-in.",
        ],
        PULL_OUT: [
            "CAMERA MUST SLOWLY PULL OUT (dolly backward) away from the subject during the shot.",
            "The pull-out should be gradual and motivated.",
            "Do NOT add handheld shake during the pull-out.",
            "Do NOT cut away during the pull-out.",
        ],
        TRACKING: [
            "CAMERA MUST TRACK / FOLLOW the moving subject smoothly.",
            "Maintain a consistent framing distance from the subject throughout the shot.",
            "Do NOT let the subject drift out of frame.",
            "Do NOT add cuts during tracking.",
        ],
        HANDHELD: [
            "CAMERA MUST BE HANDHELD with natural, restrained documentary-realistic shake.",
            "The shake must be SUBTLE, not chaotic — think real operator breathing, not earthquake.",
            "Slight micro-reframes are allowed to follow action.",
            "Do NOT add artificial digital shake or over-shake.",
        ],
        ORBIT: [
            "CAMERA MUST ORBIT around the subject(s) in a smooth arc.",
            "The subject should remain centered and readable throughout the orbit.",
            "The orbit direction is specified by CAMERA SCRIPT if present.",
            "The orbit must be slow and motivated, not a whip-around.",
        ],
        CRANE: [
            "CAMERA MUST PERFORM A CRANE / BOOM movement: vertically rise or descend along an arc.",
            "The direction is specified by CAMERA SCRIPT if present.",
            "The move must be smooth and gradual.",
            "Do NOT combine with a rapid pan.",
        ],
        CUTAWAY: [
            "CAMERA MAY CUT AWAY from the primary action to show other parts of the SAME locked location (surroundings, environment, furniture, sky, empty street, objects within the same location).",
            "Every cutaway MUST stay inside the same locked location and same time-of-day.",
            "Cutaways must be brief (under 1 second each) and motivated by reaction/pacing.",
            "After the cutaway, CUT BACK to the primary action.",
            "NO cutaway to another location. NO time jump. NO new people introduced.",
        ],
        MIXED: [
            "CAMERA MUST FOLLOW THE CAMERA SCRIPT LITERALLY.",
            "Whatever sequence of pans, cuts, focuses, or movements the script describes must be executed.",
            "Do not substitute a generic push-in.",
            "Do not add movement not described in the script.",
        ],
    };
    const buildCameraEnforcementText = (shot) => {
        const movement = CAMERA_MOVEMENT_PRESETS.some((p) => p.id === shot?.cameraMovement)
            ? shot.cameraMovement
            : DEFAULT_CAMERA_MOVEMENT;
        const rules = CAMERA_MOVEMENT_ENFORCEMENT[movement] || CAMERA_MOVEMENT_ENFORCEMENT.STATIC;
        const script = resolveMentionsInFreeText(toText(shot?.cameraScript), shot);
        const cutaway = shot?.allowCutaway ? "CUTAWAY PERMISSION: ENABLED (brief, same-location only)." : "CUTAWAY PERMISSION: DISABLED.";
        const flexibility = shot?.allowSceneFlexibility ? "SCENE FLEXIBILITY: ENABLED (may widen within same location)." : "SCENE FLEXIBILITY: DISABLED.";
        return joinLines([
            `=== CAMERA MOVEMENT ENFORCEMENT — MODE: ${movement} ===`,
            "This camera behavior is MANDATORY and OVERRIDES generic model defaults. Do not ignore or soften it.",
            ...rules.map((r) => `- ${r}`),
            cutaway,
            flexibility,
            script
                ? `CAMERA SCRIPT (highest priority — follow literally, step by step):\n${script}`
                : "CAMERA SCRIPT: not set — use only the mode rules above.",
        ]);
    };

    const handleError = (err) => {
        console.error(err);
        const message = String(err?.message || err);
        if (message.startsWith("ASSET_UPLOAD_FETCH_FAILED")) {
            setError(
                `${message}\n\n` +
                "Gambar kemungkinan sudah dibuat, tapi gagal disimpan ke backend asset storage.\n\n" +
                "Cek Bun backend:\n" +
                "  cd ../morai-backend\n" +
                "  bun run start\n\n" +
                "Health check:\n" +
                "  curl http://localhost:8787/health"
            );
            return;
        }
        if (message.startsWith("BRIDGE_") || message.includes("Failed to fetch")) {
            setError(
                `${message}\n\n` +
                "Cek Bun backend:\n" +
                "  cd ../morai-backend\n" +
                "  bun run start\n\n" +
                "Health check:\n" +
                "  curl http://localhost:8787/health"
            );
            return;
        }
        if (message.startsWith("API_401") || message.startsWith("API_403")) {
            setError(`${message}\n\nJalankan Bun backend Google AI lokal:\ncd ../morai-backend\nbun run start`);
            return;
        }
        setError(message);
    };
    const callHermesJson = async (path, payload, emptyCode = "HERMES_EMPTY_RESPONSE") => {
        const response = await fetch(`${API_ROOT}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.ok) {
            const detail = result?.error || result?.detail || result?.message || `HTTP_${response.status}`;
            throw new Error(detail);
        }
        if (!result.data || typeof result.data !== "object") throw new Error(emptyCode);
        return result.data;
    };
    const generateVisualStyle = async () => {
        if (!baseContextReady) { setError("Isi SERIES TITLE, GENRE, dan PREMISE terlebih dahulu."); return; }
        setVisualLoading(true); setError(""); setProgress("Hermes AI Director menyusun visual style...");
        try {
            const result = await callHermesJson("/api/hermes/stage", { stage: "visual-style", project }, "HERMES_VISUAL_STYLE_EMPTY");
            const visualStyle = toText(result?.visualStyle);
            if (!visualStyle) throw new Error("VISUAL_STYLE_EMPTY");
            setProject((prev) => ({ ...prev, visualStyle }));
            setVisualSource(projectContextKey);
            setProgress("Hermes visual style masuk ke field.");
            if (typeof window !== "undefined") window.setTimeout(() => setProgress(""), 1800);
        } catch (err) { handleError(err); setProgress(""); } finally { setVisualLoading(false); }
    };
    const generateStoryGuardrails = async () => {
        if (!baseContextReady) { setError("Isi SERIES TITLE, GENRE, dan PREMISE terlebih dahulu."); return; }
        setGuardLoading(true); setError(""); setProgress("Hermes Continuity Director menyusun guardrails...");
        try {
            const result = await callHermesJson("/api/hermes/stage", { stage: "story-guardrails", project }, "HERMES_STORY_GUARDRAILS_EMPTY");
            const storyGuardrails = toText(result?.storyGuardrails);
            if (!storyGuardrails) throw new Error("STORY_GUARDRAILS_EMPTY");
            setProject((prev) => ({ ...prev, storyRules: storyGuardrails }));
            setGuardSource(projectContextKey);
            setProgress("Hermes story guardrails masuk ke field.");
            if (typeof window !== "undefined") window.setTimeout(() => setProgress(""), 1800);
        } catch (err) { handleError(err); setProgress(""); } finally { setGuardLoading(false); }
    };
    const generateMuseCreativePack = async () => {
        if (!baseContextReady && !toText(museBrief)) { setError("Isi SERIES TITLE, GENRE, PREMISE, atau MUSE BRIEF terlebih dahulu."); return; }
        setMuseLoading(true); setError(""); setProgress("Hermes muse-video menyusun Creative Pack...");
        try {
            const response = await fetch(`${API_ROOT}/api/hermes/muse-video`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ project, brief: museBrief }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.ok) throw new Error(result?.error || result?.detail || `HTTP_${response.status}`);
            const creativePack = toText(result.creativePack);
            if (!creativePack) throw new Error("MUSE_CREATIVE_PACK_EMPTY");
            setMuseCreativePack(creativePack);
            setProgress("Muse Creative Pack ready.");
            if (typeof window !== "undefined") window.setTimeout(() => setProgress(""), 1800);
        } catch (err) { handleError(err); setProgress(""); } finally { setMuseLoading(false); }
    };
    const generateProductionBible = async () => {
        if (!baseContextReady) { setError("Project belum lengkap."); return; }
        if (!toText(project.visualStyle) || visualOutdated) { setError("VISUAL STYLE belum siap atau OUTDATED."); return; }
        if (!toText(project.storyRules) || guardOutdated) { setError("STORY GUARDRAILS belum siap atau OUTDATED."); return; }
        setBusy(true); setError(""); setProgress("Hermes Production Designer membuat Production Bible...");
        try {
            const result = await callHermesJson("/api/hermes/stage", { stage: "production-bible", project }, "HERMES_PRODUCTION_BIBLE_EMPTY");
            const generatedCharacters = Array.isArray(result.characters) ? result.characters : [];
            if (!generatedCharacters.length) throw new Error("CAST_EMPTY");
            if (generatedCharacters.length !== project.castCount) {
                setProject((prev) => ({ ...prev, castCount: generatedCharacters.length }));
                setProgress(`Hermes returned ${generatedCharacters.length} cast; memakai jumlah aktual.`);
            }
            const generatedLocations = Array.isArray(result.locations) ? result.locations : [];
            if (!generatedLocations.length) throw new Error("LOCATIONS_EMPTY_REGENERATE_BIBLE");
            if (generatedLocations.length !== project.locationCount) {
                setProject((prev) => ({ ...prev, locationCount: generatedLocations.length }));
                setProgress(`Hermes returned ${generatedLocations.length} locations; memakai jumlah aktual.`);
            }
            const generatedProps = Array.isArray(result.props) ? result.props : [];
            if (generatedProps.length !== project.propCount) {
                setProject((prev) => ({ ...prev, propCount: generatedProps.length }));
                setProgress(`Hermes returned ${generatedProps.length} props; memakai jumlah aktual.`);
            }
            const normalizedCharacters = generatedCharacters.map((item, index) => ({
                id: `CHAR_${pad(index + 1)}`,
                name: item.name || `Character ${index + 1}`,
                role: item.role || "", description: item.description || "",
                identity: {
                    age: item.identity?.age || "", gender: item.identity?.gender || "", ethnicity: item.identity?.ethnicity || "",
                    face: item.identity?.face || "", eyes: item.identity?.eyes || "", nose: item.identity?.nose || "",
                    lips: item.identity?.lips || "", hair: item.identity?.hair || "", skin: item.identity?.skin || "",
                    body: item.identity?.body || "", distinguishingMarks: item.identity?.distinguishingMarks || "",
                },
                costume: { outfit: item.costume?.outfit || "", accessories: item.costume?.accessories || "" },
                referenceImage: null, locked: false, status: "idle",
            }));
            const normalizedLocations = generatedLocations.map((item, index) => ({
                id: `LOC_${pad(index + 1)}`, name: item.name || `Location ${index + 1}`,
                description: item.description || "", architecture: item.architecture || "",
                furniture: item.furniture || "", lighting: item.lighting || "", colors: item.colors || "",
                referenceImage: null, locked: false, status: "idle",
            }));
            const normalizedProps = generatedProps.map((item, index) => ({
                id: `PROP_${pad(index + 1)}`, name: item.name || `Prop ${index + 1}`,
                description: item.description || "", appearance: item.appearance || "",
                referenceImage: null, locked: false, status: "idle",
            }));
            setCharacters(normalizedCharacters);
            setLocations(normalizedLocations);
            setProps(normalizedProps);
            setEpisodes([]); setScripts({}); setShots([]);
            setStage("assets");
            return;
        } catch (err) { handleError(err); } finally { setBusy(false); setProgress(""); }
        return;
        try {
            const result = await withCreditMeter("Production Bible", "text", () => callJSON(`
ROLE: You are the Production Asset Designer.
    PROJECT:
    TITLE: ${project.title}
    GENRE: ${project.genre}
    PREMISE: ${project.premise}
    REGION MODE: ${regionProfile.regionMode}
    COUNTRY: ${regionProfile.country}
    LANGUAGE: ${regionProfile.language}
    REGION ASSET STYLE: ${regionProfile.assetStyle}
    REGION HARD RULES:
    ${regionProfile.rules.map((rule) => `- ${rule}`).join("\n")}
    LOCKED VISUAL STYLE:
${project.visualStyle}
LOCKED STORY GUARDRAILS:
${project.storyRules}
REQUIRED:
- EXACTLY ${project.castCount} recurring named characters
- EXACTLY ${project.locationCount} reusable locations
- EXACTLY ${project.propCount} important recurring props
    CHARACTER RULES: characters must directly serve the original premise; no extras; no crowd-character definitions; stable permanent physical identity; one default continuity costume; no background description inside character identity; names, roles, identity details, face/ethnicity cues and wardrobe must follow COUNTRY/REGION.
    LOCATION RULES: locations array must not be empty; create exactly ${project.locationCount} reusable production sets; define permanent architecture and furniture; do not define humans; locations must belong naturally to COUNTRY/REGION.
    PROP RULES: only story-important recurring props; no trivial items; props must follow COUNTRY/REGION everyday realism.
    ENHANCED BIBLE / DIRECTOR MODE:
    - Video engine target is ${VIDEO_ENGINE_NAME}; plan scenes as precise, single-location, cinematic microdrama beats.
    - Build the foundation for a complete serialized drama: inciting hook, escalating secrets, reversals, emotional confrontations, private inner thoughts, solo action beats, visual reveals, and episode cliffhangers.
    - Every episode must open with a clear establishing/opening beat and end with a dramatic unresolved question, reveal, or cliffhanger.
    - Do not make every scene a static 2-3 person conversation. The production must support solo walking, inner monologue, silent discovery, hidden watching, object-focused reveals, reaction-only beats, and action-without-dialogue.
    - Shot duration policy: 6 seconds minimum for any spoken dialogue, 8 seconds for medium dialogue or chained interaction, 10 seconds for long dialogue/intense action/emotion, 12 seconds only for very long dialogue or story action that genuinely needs extra tension.
    - Dialogue must never feel cut off; if a line is long, the shot must hold long enough for the complete line and a short reaction beat.
    - Spatial continuity policy: recurring furniture, vehicles, carts, tables, doors, windows, locked props, ordinary set dressing, and actor posture must preserve left/right screen side and relative position from the previous continuity anchor unless the script explicitly changes them.
    - Policy-safe rendering policy: preserve the same story context while depicting sensitive conflict, danger, humiliation, or violence in non-graphic, compliant, realistic microdrama staging.
    - Director Mode prioritizes clear blocking, readable emotional beats, escalating stakes, and strict continuity over decorative camera tricks.
${ultraRealisticStoryboardLock(projectAspectRatio)}
${wardrobeAndEraLock(regionProfile.country)}
    DO NOT WRITE episodes, scenes, dialogue, future twists.
RETURN:
{
  "characters": [
    {
      "name": "", "role": "", "description": "",
      "identity": { "age": "", "gender": "", "ethnicity": "", "face": "", "eyes": "", "nose": "", "lips": "", "hair": "", "skin": "", "body": "", "distinguishingMarks": "" },
      "costume": { "outfit": "", "accessories": "" }
    }
  ],
  "locations": [ { "name": "", "description": "", "architecture": "", "furniture": "", "lighting": "", "colors": "" } ],
  "props": [ { "name": "", "description": "", "appearance": "" } ]
}
`, [], 0.2));
            const generatedCharacters = Array.isArray(result.characters) ? result.characters : [];
            if (!generatedCharacters.length) throw new Error("CAST_EMPTY");
            if (generatedCharacters.length !== project.castCount) {
                setProject((prev) => ({ ...prev, castCount: generatedCharacters.length }));
                setProgress(`AI returned ${generatedCharacters.length} cast; memakai jumlah aktual.`);
            }
            const generatedLocations = Array.isArray(result.locations) ? result.locations : [];
            if (!generatedLocations.length) throw new Error("LOCATIONS_EMPTY_REGENERATE_BIBLE");
            if (generatedLocations.length !== project.locationCount) {
                setProject((prev) => ({ ...prev, locationCount: generatedLocations.length }));
                setProgress(`AI returned ${generatedLocations.length} locations; memakai jumlah aktual.`);
            }
            const generatedProps = Array.isArray(result.props) ? result.props : [];
            if (generatedProps.length !== project.propCount) {
                setProject((prev) => ({ ...prev, propCount: generatedProps.length }));
                setProgress(`AI returned ${generatedProps.length} props; memakai jumlah aktual.`);
            }
            const normalizedCharacters = generatedCharacters.map((item, index) => ({
                id: `CHAR_${pad(index + 1)}`,
                name: item.name || `Character ${index + 1}`,
                role: item.role || "", description: item.description || "",
                identity: {
                    age: item.identity?.age || "", gender: item.identity?.gender || "", ethnicity: item.identity?.ethnicity || "",
                    face: item.identity?.face || "", eyes: item.identity?.eyes || "", nose: item.identity?.nose || "",
                    lips: item.identity?.lips || "", hair: item.identity?.hair || "", skin: item.identity?.skin || "",
                    body: item.identity?.body || "", distinguishingMarks: item.identity?.distinguishingMarks || "",
                },
                costume: { outfit: item.costume?.outfit || "", accessories: item.costume?.accessories || "" },
                referenceImage: null, locked: false, status: "idle",
            }));
            const normalizedLocations = generatedLocations.map((item, index) => ({
                id: `LOC_${pad(index + 1)}`, name: item.name || `Location ${index + 1}`,
                description: item.description || "", architecture: item.architecture || "",
                furniture: item.furniture || "", lighting: item.lighting || "", colors: item.colors || "",
                referenceImage: null, locked: false, status: "idle",
            }));
            const normalizedProps = generatedProps.map((item, index) => ({
                id: `PROP_${pad(index + 1)}`, name: item.name || `Prop ${index + 1}`,
                description: item.description || "", appearance: item.appearance || "",
                referenceImage: null, locked: false, status: "idle",
            }));
            setCharacters(normalizedCharacters);
            setLocations(normalizedLocations);
            setProps(normalizedProps);
            setEpisodes([]); setScripts({}); setShots([]);
            setStage("assets");
        } catch (err) { handleError(err); } finally { setBusy(false); setProgress(""); }
    };
    const CHARACTER_REFERENCE_STYLE = `
realistic live-action casting photography,
neutral studio photography,
plain seamless background,
soft even studio lighting,
accurate face and body proportions,
accurate wardrobe materials and patterns,
no environment,
no storytelling,
no cinematic scene,
no VFX,
no crowd,
no architecture
`;
    const characterPrompt = (character, extraCorrections = []) => `
${extraCorrections.length ? `CRITICAL REGENERATION:
THE PREVIOUS IMAGE WAS INVALID.

REMOVE ALL OF THESE FAILURES:
${extraCorrections.map((item) => `- ${item}`).join("\n")}

GENERATE A COMPLETELY NEW IMAGE FROM SCRATCH.
DO NOT COPY THE PREVIOUS COMPOSITION.
DO NOT PRESERVE THE PREVIOUS BACKGROUND.
DO NOT PRESERVE ANY EXTRA HUMAN, CROWD, ARCHITECTURE, VFX, STORY ACTION, OR ENVIRONMENT.
` : ""}
TASK:
Create an ISOLATED CHARACTER IDENTITY REFERENCE.

THIS IS NOT A STORY SCENE.
THIS IS NOT A CINEMATIC SHOT.
THIS IS NOT AN ENVIRONMENTAL PORTRAIT.
THIS IS NOT A CHARACTER-IN-WORLD IMAGE.
THIS IS A CLEAN CASTING / IDENTITY MASTER ONLY.

CHARACTER_ID: ${character.id}
NAME: ${character.name}
ROLE: ${character.role}

IDENTITY:
AGE: ${character.identity.age}
GENDER: ${character.identity.gender}
ETHNICITY: ${character.identity.ethnicity}
FACE: ${character.identity.face}
EYES: ${character.identity.eyes}
NOSE: ${character.identity.nose}
LIPS: ${character.identity.lips}
HAIR: ${character.identity.hair}
SKIN: ${character.identity.skin}
BODY: ${character.identity.body}
DISTINGUISHING MARKS: ${character.identity.distinguishingMarks || "None"}

LOCKED WARDROBE:
OUTFIT: ${character.costume.outfit}
ACCESSORIES: ${character.costume.accessories || "None"}
${wardrobeAndEraLock(regionProfile.country)}

REFERENCE VISUAL STYLE:
${CHARACTER_REFERENCE_STYLE}
${ultraRealisticStoryboardLock(CHARACTER_REFERENCE_ASPECT_RATIO)}

REGION:
${regionProfile.country}

IMPORTANT REGION RULE:
Use region information ONLY for the person's physical/cultural design and wardrobe accuracy.
DO NOT create a regional environment.
DO NOT create architecture.
DO NOT create a village.
DO NOT create a palace.
DO NOT create a kingdom.
DO NOT create a crowd.
DO NOT create story context.

STRICT OUTPUT SPECIFICATION:

SUBJECT COUNT
- EXACTLY ONE human in the entire image.
- The only human allowed is ${character.id} (${character.name}).
- No second person.
- No crowd.
- No guards.
- No servants.
- No villagers.
- No soldiers.
- No passersby.
- No partial humans.
- No hands or body parts from another person.
- No silhouettes.
- No reflections containing people.
- No portraits, paintings, photographs, posters, sculptures, statues, carvings, murals, or decorative figures depicting people.

BACKGROUND
- Use a completely plain neutral seamless studio backdrop.
- Background must be visually empty.
- Preferred backdrop: matte light gray, neutral gray, or off-white.
- No architecture.
- No doorway.
- No window.
- No furniture.
- No landscape.
- No vegetation.
- No road.
- No building.
- No palace.
- No village.
- No throne.
- No decorative environment.
- No story location.
- No cinematic environment.

VISUAL EFFECTS
- ZERO magic effects.
- ZERO glowing effects.
- ZERO aura.
- ZERO particles.
- ZERO fire.
- ZERO smoke.
- ZERO supernatural energy.
- ZERO symbolic visual effects.
- ZERO dragons or spirit effects.
- ZERO floating graphics.

POSE
- Neutral standing casting pose.
- Front-facing or very subtle 3/4 angle.
- Head upright.
- Neutral facial expression.
- Arms naturally relaxed.
- No dramatic action.
- No fighting pose.
- No storytelling gesture.
- No interacting with objects.

FRAMING
- Full body preferred.
- Entire head must be visible.
- Entire face must be clearly readable.
- Both shoulders visible.
- Both hands visible if possible.
- Waist, lower garment, and footwear visible.
- Do not crop the head.
- Do not crop feet if full-body framing is used.
- Keep safe margin around the body.

IDENTITY PRIORITY
1. Face identity
2. Hair identity
3. Body proportions
4. Skin tone
5. Locked wardrobe
6. Accessories
7. Neutral pose

STYLE
- Realistic live-action casting photography.
- Natural human skin texture.
- Accurate facial anatomy.
- Accurate garment material and pattern.
- Soft neutral studio lighting.
- No beauty fantasy styling.
- No cinematic color grading.
- No dramatic rim lighting.
- No environmental lighting.

FORBIDDEN INTERPRETATION
- Do not illustrate the character's biography.
- Do not visualize the character's powers.
- Do not visualize the character's social status.
- Do not visualize the character's kingdom.
- Do not visualize the character's followers.
- Do not visualize the plot.
- Do not visualize the premise.
- Do not add any object or person because it seems narratively appropriate.

FINAL CHECK BEFORE OUTPUT
- Exactly one human? REQUIRED.
- Plain empty studio background? REQUIRED.
- Zero crowd? REQUIRED.
- Zero architecture? REQUIRED.
- Zero environment? REQUIRED.
- Zero VFX? REQUIRED.
- Identity and wardrobe readable? REQUIRED.

If any requirement above cannot be satisfied, simplify the image further rather than adding visual elements.

Output only the image.
`;
    const LOCATION_REFERENCE_EMPTY_SET_RULES = `
ABSOLUTE EMPTY-SET RULES FOR LOCATION MASTER:
- This is an EMPTY ARCHITECTURAL / SET-DESIGN PLATE, not a story scene.
- ZERO humans anywhere in the image.
- ZERO human-like depictions anywhere in the image.
- No worker, no sweeper, no guard, no soldier, no servant, no villager, no passerby, no worshipper, no audience, no customer, no staff, no owner, no child, no elder, no silhouette, no reflection, no shadow shaped like a person, no partial hand, no partial foot, no partial body, no face, no portrait, no framed photograph, no mural of people, no statue/idol/sculpture/carving shaped like a person.
- Do not add people for scale, realism, atmosphere, cultural context, daily life, ceremony, palace/village activity, market life, cleaning, guarding, praying, standing, sitting, walking, sweeping, cooking, waiting, or storytelling.
- If the location is a village, palace, shop, home, street, temple, hut, market, courtyard, gate, or interior, render it completely empty as if the set has been cleared before actors arrive.
- Furniture, architecture, props, doors, windows, roof, floor, wall texture, pathways, counters, benches, mats, lamps, plants, and ordinary set dressing are allowed.
- Humans and human-shaped art are not allowed even in the far background.
`;
    const locationPrompt = (location, extraCorrections = []) => `
${extraCorrections.length ? `CRITICAL REGENERATION:
THE PREVIOUS LOCATION REFERENCE WAS INVALID BECAUSE HUMAN ELEMENTS WERE DETECTED.

REMOVE ALL OF THESE FAILURES:
${extraCorrections.map((item) => `- ${item}`).join("\n")}

Generate a COMPLETELY NEW empty location plate from scratch.
Do not preserve the previous composition if it contained any person, silhouette, statue, portrait, mural, reflection, or partial body.
Do not include cleaners, guards, villagers, servants, workers, background people, or scale figures.
` : ""}
TASK: Create a MASTER LOCATION REFERENCE.
LOCATION_ID: ${location.id}
NAME: ${location.name}
DESCRIPTION: ${location.description}
ARCHITECTURE: ${location.architecture}
PERMANENT FURNITURE: ${location.furniture}
BASE LIGHTING: ${location.lighting}
COLOR DIRECTION: ${location.colors}
    SERIES VISUAL STYLE:
    ${project.visualStyle}
    REGION LOCK: ${regionProfile.country}; ${regionProfile.assetStyle}
${wardrobeAndEraLock(regionProfile.country)}
${ultraRealisticStoryboardLock(projectAspectRatio)}

${LOCATION_REFERENCE_EMPTY_SET_RULES}

    ABSOLUTE RULES:
    - EMPTY LOCATION ONLY.
    - Create a reusable locked set reference BEFORE actors enter.
    - The location must look ready for filming but fully cleared of people.
    - ZERO humans anywhere.
    - Do not show any person, crowd, guard, soldier, servant, villager, seated audience, background human, silhouette, shadow clearly shaped like a human, reflection of a human, portrait of a person, mural of a person, statue/idol/sculpture shaped like a person, or any partial human body part.
    - Do not show someone sweeping, standing, sitting, walking, guarding, waiting, cooking, selling, praying, or working.
    - Do not use people as scale reference.
    - No animals.
    - No story action.
    - Show the location as a clean reusable production set / establishing plate with no cast, extras, or background activity.
    - Clear wide establishing composition.
    - Preserve architecture.
    - Preserve permanent furniture layout.
    - Realistic live-action production set.
    - No watermark.
    - No random text.
    - If a human appears for any reason, the image is invalid and must be regenerated as a completely empty set.

FINAL SELF-CHECK BEFORE OUTPUT:
- Are there exactly zero humans? REQUIRED.
- Are there zero silhouettes/reflections/portraits/statues/murals shaped like people? REQUIRED.
- Is the set empty before actors arrive? REQUIRED.
- If any human-like element would appear, remove it and simplify the set.
Output only the reference image.
`;
    const propPrompt = (prop) => `
TASK: Create a MASTER PROP REFERENCE.
PROP_ID: ${prop.id}
    NAME: ${prop.name}
    DESCRIPTION: ${prop.description}
    PERMANENT APPEARANCE: ${prop.appearance}
    REGION LOCK: ${regionProfile.country}; prop design must follow ${regionProfile.assetStyle}.
    ERA / WARDROBE COMPATIBILITY: prop must match the selected drama era and locked wardrobe world. If historical/dynasty/palace/kingdom, use period-appropriate material, craft, wear, and design; no modern material or object unless explicitly required.
    ABSOLUTE RULES: one main prop only; no humans; no hands; no scene; neutral studio background; preserve shape/material/color; realistic production photography; no watermark.
Output only the reference image.
`;
    const qaCharacterMasterReference = async (character, image) => {
        const result = await withCreditMeter(`QA ${character.id}`, "vision", () => callJSON(`
ROLE: You are a strict casting-reference QA inspector.
TASK: Inspect the attached candidate CHARACTER MASTER for ${character.id} (${character.name}).
PASS ONLY IF ALL ARE TRUE:
- exactly ONE human is visible in the entire image
- no crowd, guards, soldiers, servants, passersby, background humans, partial bodies, human reflections, portraits, statues, or silhouettes
- the character's complete head and face are clearly visible and not cropped
- body and locked wardrobe are readable enough to reuse as an immutable identity reference
- no magical aura, dragon energy, VFX, story action, cinematic battle/action pose, or narrative scene
- background is neutral/plain/studio-like and does NOT look like a palace, village, battlefield, throne room, street, landscape, or other story location
- no watermark, random text, collage, or multi-panel layout
Return JSON only:
{
  "pass": true,
  "humanCount": 1,
  "neutralBackground": true,
  "vfxFree": true,
  "issues": []
}
`, [{
            image,
            label: `${character.id} candidate master`,
            type: "CHARACTER_MASTER_CANDIDATE",
            id: character.id,
            authority: "Candidate master image being inspected. Exactly one clean centered character is allowed."
        }], 0, 1));
        const issues = normalizeIssues(result?.issues);
        const humanCount = Number(result?.humanCount);
        const pass = Boolean(result?.pass)
            && humanCount === 1
            && toBool(result?.neutralBackground)
            && toBool(result?.vfxFree);
        return { pass, issues, humanCount };
    };
    const generateCleanCharacterReference = async (character) => {
        const maxAttempts = 4;
        let lastIssues: string[] = [];
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            setProgress(`Character ${character.id} attempt ${attempt}/${maxAttempts}: generating isolated studio master...`);
            const image = await generateImage(
                characterPrompt(character, lastIssues),
                [],
                CHARACTER_REFERENCE_ASPECT_RATIO,
                selectedImageModel,
                { provider: selectedImageProvider, bypassCache: true }
            );
            const qa = await qaCharacterMasterReference(character, image);
            if (qa.pass) return image;
            lastIssues = qa.issues.length
                ? qa.issues
                : [
                    `Character master invalid (detected human count: ${Number.isFinite(qa.humanCount) ? qa.humanCount : "unknown"}).`,
                    "Remove every background person and partial body.",
                    "Replace the background with a completely plain neutral seamless studio backdrop.",
                    "Remove all architecture, story environment, props, and narrative context.",
                    "Remove all VFX, glow, aura, particles, magic, and symbolic effects.",
                    "Render exactly one human only."
                ];
            setProgress(`Character ${character.id} failed QA on attempt ${attempt}/${maxAttempts}; regenerating from scratch with stricter negatives...`);
        }
        throw new Error(`CHARACTER_MASTER_QA_FAILED_${character.id}: ${lastIssues.join(" | ") || "invalid character master"}`);
    };
    const qaLocationReferenceNoHumans = async (location, image) => {
        const result = await withCreditMeter(`QA ${location.id}`, "vision", () => callJSON(`
ROLE: You are the strict visual QA inspector for reusable master location references.
TASK: Inspect the attached candidate image for LOCATION_ID ${location.id} (${location.name}).
PASS CONDITION:
- It must be an EMPTY reusable location reference.
- ZERO humans are allowed.
- ZERO human-like depictions are allowed.
- No crowd, no guard, no soldier, no servant, no villager, no seated audience, no silhouette, no human reflection, no portrait/mural/statue/sculpture of a person, and no partial body part.
- Architecture and permanent furniture should be clearly readable.
- The image should read like a realistic live-action production set / establishing plate.
FAIL if any human or human-like depiction is visible.
Return JSON only:
{
  "pass": true,
  "humansVisible": false,
  "issues": []
}
`, [{
            image,
            label: `${location.id} candidate location reference`,
            type: "LOCATION_REFERENCE_CANDIDATE",
            id: location.id,
            authority: "Candidate location reference image. This image must contain zero humans and zero human-like depictions."
        }], 0, 1));
        const issues = normalizeIssues(result?.issues);
        const humansVisible = toBool(result?.humansVisible);
        const pass = Boolean(result?.pass) && !humansVisible;
        return { pass, humansVisible, issues };
    };
    const generateCleanLocationReference = async (location) => {
        const maxAttempts = 5;
        let lastIssues = [];
        let lastError = "";
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            setProgress(`Location ${location.id} attempt ${attempt}/${maxAttempts}: generating empty set reference with zero humans...`);
            const image = await generateImage(locationPrompt(location, lastIssues), [], projectAspectRatio, selectedImageModel, { provider: selectedImageProvider, bypassCache: true });
            const qa = await qaLocationReferenceNoHumans(location, image);
            if (qa.pass) return image;
            lastIssues = qa.issues.length ? qa.issues : [
                "Humans or human-like depictions detected.",
                "Remove every worker/sweeper/guard/villager/background person.",
                "Remove every portrait, mural, statue, reflection, silhouette, and partial body.",
                "Regenerate the same location concept as a completely empty set before actors arrive.",
            ];
            lastError = lastIssues.join(" | ");
            setProgress(`Location ${location.id} retry ${attempt}/${maxAttempts}: removing humans from the location reference...`);
        }
        throw new Error(`LOCATION_REFERENCE_HAS_HUMANS ${location.id}: ${lastError || "human elements detected"}`);
    };
    const generateMissingLocations = async () => {
        const result = await withCreditMeter("Repair Missing Locations", "text", () => callJSON(`
ROLE: You are the Production Location Designer.
PROJECT:
TITLE: ${project.title}
GENRE: ${project.genre}
PREMISE: ${project.premise}
REGION MODE: ${regionProfile.regionMode}
COUNTRY: ${regionProfile.country}
LANGUAGE: ${regionProfile.language}
REGION ASSET STYLE: ${regionProfile.assetStyle}
REGION HARD RULES:
${regionProfile.rules.map((rule) => `- ${rule}`).join("\n")}
LOCKED VISUAL STYLE:
${project.visualStyle}
LOCKED STORY GUARDRAILS:
${project.storyRules}
EXISTING LOCKED CHARACTERS:
${JSON.stringify(characters.map((item) => ({ id: item.id, name: item.name, role: item.role })), null, 2)}
EXISTING LOCKED PROPS:
${JSON.stringify(props.map((item) => ({ id: item.id, name: item.name })), null, 2)}
TASK:
Create exactly ${project.locationCount} reusable production locations for this same series. Locations must directly support the premise and the existing cast/props.
RULES:
- locations array must not be empty
- do not create characters
- each location is a reusable set, not a one-off action
- define permanent architecture, furniture, lighting, and color direction
- locations must feel native to ${regionProfile.country}
RETURN:
{
  "locations": [
    { "name": "", "description": "", "architecture": "", "furniture": "", "lighting": "", "colors": "" }
  ]
}
`, [], 0.15));
        const generatedLocations = Array.isArray(result.locations) ? result.locations : [];
        if (!generatedLocations.length) throw new Error("LOCATIONS_EMPTY_REGENERATE_BIBLE");
        if (generatedLocations.length !== project.locationCount) {
            setProject((prev) => ({ ...prev, locationCount: generatedLocations.length }));
        }
        const repairedLocations = generatedLocations.map((item, index) => ({
            id: `LOC_${pad(index + 1)}`, name: item.name || `Location ${index + 1}`,
            description: item.description || "", architecture: item.architecture || "",
            furniture: item.furniture || "", lighting: item.lighting || "", colors: item.colors || "",
            referenceImage: null, locked: false, status: "idle",
        }));
        setLocations(repairedLocations);
        setEpisodes([]); setScripts({}); setShots([]);
        return repairedLocations;
    };
    const generateAllReferences = async () => {
        setBusy(true); setError("");
        try {
            let workingLocations = locations;
            if (!workingLocations.length) {
                setProgress("Repairing missing locations...");
                workingLocations = await generateMissingLocations();
            }
            await withCreditMeter("Reference Assets", "image", async () => {
            let nextCharacters = [...characters];
            const parallelLimit = 2;
            const characterIndexes = nextCharacters.map((_, index) => index).filter((index) => !(nextCharacters[index].locked && nextCharacters[index].referenceImage));
            let finishedCharacters = 0;
            await runLimited(characterIndexes, parallelLimit, async (i) => {
                setProgress(`Characters ${finishedCharacters + 1}/${characterIndexes.length}: ${nextCharacters[i].name}`);
                nextCharacters[i] = { ...nextCharacters[i], status: "generating" };
                setCharacters([...nextCharacters]);
                try {
                    const image = await generateCleanCharacterReference(nextCharacters[i]);
                    nextCharacters[i] = { ...nextCharacters[i], referenceImage: image, locked: true, status: "ready" };
                    finishedCharacters += 1;
                } catch (err) {
                    nextCharacters[i] = { ...nextCharacters[i], status: "error" };
                    setCharacters([...nextCharacters]);
                    throw err;
                }
                setCharacters([...nextCharacters]);
            });
            let nextLocations = [...workingLocations];
            const locationIndexes = nextLocations.map((_, index) => index).filter((index) => !(nextLocations[index].locked && nextLocations[index].referenceImage));
            let finishedLocations = 0;
            await runLimited(locationIndexes, parallelLimit, async (i) => {
                setProgress(`Locations ${finishedLocations + 1}/${locationIndexes.length}: ${nextLocations[i].name}`);
                nextLocations[i] = { ...nextLocations[i], status: "generating" };
                setLocations([...nextLocations]);
                try {
                    const image = await generateCleanLocationReference(nextLocations[i]);
                    nextLocations[i] = { ...nextLocations[i], referenceImage: image, locked: true, status: "ready" };
                    finishedLocations += 1;
                } catch (err) {
                    nextLocations[i] = { ...nextLocations[i], status: "error" };
                    setLocations([...nextLocations]);
                    throw err;
                }
                setLocations([...nextLocations]);
            });
            let nextProps = [...props];
            const propIndexes = nextProps.map((_, index) => index).filter((index) => !(nextProps[index].locked && nextProps[index].referenceImage));
            let finishedProps = 0;
            await runLimited(propIndexes, parallelLimit, async (i) => {
                setProgress(`Props ${finishedProps + 1}/${propIndexes.length}: ${nextProps[i].name}`);
                nextProps[i] = { ...nextProps[i], status: "generating" };
                setProps([...nextProps]);
                try {
                    const image = await generateImage(propPrompt(nextProps[i]), [], PROP_REFERENCE_ASPECT_RATIO, selectedImageModel, { provider: selectedImageProvider, bypassCache: true });
                    nextProps[i] = { ...nextProps[i], referenceImage: image, locked: true, status: "ready" };
                    finishedProps += 1;
                } catch (err) {
                    nextProps[i] = { ...nextProps[i], status: "error" };
                    setProps([...nextProps]);
                    throw err;
                }
                setProps([...nextProps]);
            });
            });
        } catch (err) { handleError(err); } finally { setBusy(false); setProgress(""); }
    };

    // ========================================================================
    // MANUAL SHOT MANAGEMENT — navigasi ke SCENE ANCHOR tanpa Episode/Script/Shot manifest
    // ========================================================================

    // Recompile master prompt dengan aman. compileMasterPrompt bisa throw
    // (mis. lokasi belum dipilih) — jangan sampai crash di dalam updater setShots.
    const recompileVideoPrompt = (previousShot, nextShot) => {
        if (!previousShot?.videoPrompt) return nextShot;
        try {
            return { ...nextShot, videoPrompt: compileMasterPrompt(nextShot) };
        } catch (err) {
            console.warn(`Master prompt recompile skipped for ${nextShot?.id}:`, err);
            return { ...nextShot, videoPrompt: "" };
        }
    };

    const createManualShot = () => {
        const existingIds = new Set(shots.map((item) => item.id));
        let nextNumber = shots.length + 1;
        while (existingIds.has(`SH_${pad(nextNumber)}`)) nextNumber += 1;
        const newId = `SH_${pad(nextNumber)}`;
        const firstLocation = "";
        const firstCharacters: string[] = [];
        const newShot: any = {
            id: newId,
            episode: 1,
            sceneId: `${newId}_SC`,
            shotNumber: nextNumber,
            characterIds: firstCharacters,
            locationId: firstLocation,
            propIds: [],
            expectedHumanCount: firstCharacters.length,
            camera: inferDeterministicCamera(firstCharacters.length, "STATIC"),
            shotKind: "MANUAL",
            action: "",
            dialogue: [],
            continuitySetup: "",
            plannedStartState: "",
            plannedEndState: "",
            transitionIn: "",
            transitionOut: "",
            incidentalSetDressing: [],
            carryOverCharacterIds: [],
            mustRemainVisibleIds: [],
            referencedVisibleTargetIds: [],
            movingCharacterIds: [],
            movementMode: "STATIC",
            continuityNotes: [],
            durationSeconds: 8,
            videoPrompt: "",
            anchorImage: null,
            anchorStatus: "idle",
            qa: makeShotQA(),
            videoLastFrameImage: null,
            videoLastFrameCapturedAt: null,
            characterDirections: normalizeCharacterDirections([], firstCharacters),
            cameraScript: "",
            cameraMovement: DEFAULT_CAMERA_MOVEMENT,
            allowCutaway: false,
            allowSceneFlexibility: false,
            backgroundNpcMode: "NONE",
            backgroundNpcDescription: "",
            backgroundNpcMaxCount: 0,
            directAnchorPrompt: "",
            videoStatus: "idle",
            videoUrl: null,
            videoRemoteUri: null,
            operationName: null,
        };
        setShots((prev) => [...prev, newShot]);
        setSelectedShotId(newId);
    };

    const inferBackgroundNpcPlan = (shot, location = null, profile = regionProfile) => {
        const text = [
            shot?.shotKind,
            shot?.action,
            shot?.continuitySetup,
            shot?.directAnchorPrompt,
            shot?.backgroundNpcDescription,
            location?.name,
            location?.description,
        ].map(toText).join(" ").toLowerCase();
        const publicCrowd = /\b(pasar|market|jalan raya|street|road|trotoar|sidewalk|kerumunan|crowd|massa|warga|public|terminal|stasiun|lobby|mall|sekolah|kampus|kantor|court|pengadilan|balai|istana|palace hall|arena|audience|penonton|wawancara|interview|reporter|press|wartawan|berdagang|pedagang|jualan|warung|toko|shop|customer|pembeli|pertarungan|fight|duel|tawuran|battle|security|guard)\b/i.test(text);
        if (!publicCrowd) return { mode: "NONE", maxCount: 0, description: "" };
        if (/\b(kerumunan besar|crowd|massa|pasar|market|jalan raya|street|road|arena|audience|penonton|tawuran|battle|public humiliation|press conference|konferensi pers)\b/i.test(text)) {
            return {
                mode: "CROWD",
                maxCount: 30,
                description: `Nameless ${profile.country}-appropriate public background crowd/extras that fit the location and era: passersby, vendors/customers, reporters, guards, spectators, or citizens as needed by the action. They remain background atmosphere only.`,
            };
        }
        if (/\b(wawancara|interview|reporter|wartawan|berdagang|pedagang|jualan|customer|pembeli|fight|pertarungan|duel|lobby|hall|sekolah|kantor|palace|istana)\b/i.test(text)) {
            return {
                mode: "MEDIUM",
                maxCount: 10,
                description: `Nameless ${profile.country}-appropriate NPC extras supporting the scene context, such as reporters, buyers, vendors, guards, staff, or bystanders. They stay secondary and do not speak named dialogue.`,
            };
        }
        return {
            mode: "LIGHT",
            maxCount: 4,
            description: `A few nameless ${profile.country}-appropriate background passersby/bystanders for realism only. They stay small, soft, and secondary.`,
        };
    };

    const inferAutoDramaCameraPlan = (shot, humanCount = 1) => {
        const text = [shot?.shotKind, shot?.action, shot?.continuitySetup, shot?.backgroundNpcDescription].map(toText).join(" ").toLowerCase();
        const hasCrowd = normalizeBackgroundNpcMode(shot?.backgroundNpcMode) !== "NONE";
        if (/\b(berjalan|jalan|walk|walking|mengikuti|follow|tracking|mengejar|chase|lari|run|road|street|jalan raya)\b/i.test(text)) {
            return {
                cameraMovement: "TRACKING",
                cameraScript: "0-2s: start medium-wide from the existing anchor, keep the locked main character readable with environment alive around them. 2-6s: smooth tracking follow as the character walks through the same location, background NPCs move naturally but remain secondary. Final beat: hold on the character's reaction or destination, no cut to a new place.",
            };
        }
        if (/\b(reveal|terungkap|membuka|isi|rahasia|cliffhanger|shock|terkejut|menyadari|discover|prop_reveal)\b/i.test(text)) {
            return {
                cameraMovement: "PUSH_IN",
                cameraScript: "0-2s: hold the existing anchor composition with the key prop/person readable. 2-6s: slow motivated push-in toward the reveal or reaction, preserving face, wardrobe, footwear, props, and location continuity. Final beat: stop on a tense reaction/cliffhanger frame.",
            };
        }
        if (/\b(wawancara|interview|reporter|wartawan|press|konferensi)\b/i.test(text)) {
            return {
                cameraMovement: "MIXED",
                cameraScript: "0-2s: medium shot on the main locked character, reporters/NPCs remain background or edge-frame atmosphere. 2-5s: gentle pan or rack-focus toward the question/action target inside the same location. Final beat: return to the main character reaction, no new location.",
            };
        }
        if (/\b(pertarungan|fight|duel|menyerang|attack|tampar|pukul|konfrontasi|confrontation)\b/i.test(text)) {
            return {
                cameraMovement: "HANDHELD",
                cameraScript: "0-2s: tense handheld medium-wide showing the main locked characters and physical spacing. 2-6s: restrained handheld reframe follows the action without chaos; no body clipping, no impossible hits, background NPC spectators stay secondary. Final beat: hold on the emotional consequence.",
            };
        }
        if (hasCrowd) {
            return {
                cameraMovement: "PAN",
                cameraScript: "0-2s: establish the active public space with main locked cast clearly foregrounded. 2-5s: gentle pan across the same location to show atmosphere/NPC movement without losing the main cast. Final beat: settle on the main character or conflict target.",
            };
        }
        if (humanCount <= 1 && /\b(membatin|dalam hati|inner|sendiri|alone|merenung|menunggu|waiting)\b/i.test(text)) {
            return {
                cameraMovement: "PUSH_IN",
                cameraScript: "0-2s: quiet medium shot from the existing anchor. 2-6s: very slow push-in on the thinking expression, mouth closed for inner voice, no lip-sync. Final beat: hold the eyes/reaction.",
            };
        }
        if (humanCount >= 2) {
            return {
                cameraMovement: "PAN",
                cameraScript: "0-2s: medium two-shot/group shot preserving left-right order. 2-5s: subtle pan or rack-focus from speaker to listener reaction. Final beat: hold the reaction that best supports the conflict/cliffhanger.",
            };
        }
        return {
            cameraMovement: DEFAULT_CAMERA_MOVEMENT,
            cameraScript: "Static cinematic observer frame with subtle actor motion, breathing, eyeline, and natural reaction. No dead freeze; end on the most dramatic readable expression.",
        };
    };

    const buildBackgroundNpcPromptBlock = (shot, { forAnchor = false } = {}) => {
        const mode = normalizeBackgroundNpcMode(shot?.backgroundNpcMode);
        const maxCount = Math.max(0, Math.min(60, Number(shot?.backgroundNpcMaxCount || maxBackgroundNpcCountForMode(mode))));
        const description = toText(shot?.backgroundNpcDescription);
        if (mode === "NONE" || maxCount <= 0) {
            return [
                "BACKGROUND NPC / ATMOSPHERE EXTRAS:",
                "- NONE. No unlisted humans, crowds, passersby, reflections, silhouettes, or background actors.",
            ].join("\n");
        }
        return [
            "BACKGROUND NPC / ATMOSPHERE EXTRAS — CONTROLLED ALLOWANCE:",
            `- MODE: ${mode}. MAX_BACKGROUND_NPC_COUNT: ${maxCount}.`,
            `- PURPOSE: ${description || "Support public scene realism only."}`,
            "- These NPCs are nameless, non-recurring atmosphere extras only. They are NOT locked characters, NOT new cast, NOT story-important, and NOT identity references.",
            "- NPCs may be vendors, buyers, reporters, guards, bystanders, pedestrians, staff, spectators, or citizens only when appropriate to the current action/location/era.",
            "- NPCs must stay background or edge-frame. They must not replace, duplicate, hide, touch, speak for, or visually overpower any locked Character ID.",
            "- Locked characters remain the clear foreground/story focus and must remain readable.",
            "- NPC wardrobe/props must match the selected country/era, but their faces and outfits do not need asset locks because they are incidental.",
            "- NPCs may create natural ambient movement/murmur only. No named dialogue, no subtitles, no plot-important action, no new hero prop.",
            forAnchor
                ? "- For the anchor image, include NPCs only if they fit naturally without blocking locked characters; keep them smaller/softer in background depth."
                : "- For video, NPCs can move naturally in the background while the main cast action/dialogue stays primary.",
        ].join("\n");
    };

    const generateAiDirectorPlan = async ({ targetShots = 24, silent = false } = {}) => {
        if (!toText(project.title) || !toText(project.genre) || !toText(project.premise)) {
            throw new Error("Isi SERIES TITLE, GENRE, dan PREMISE terlebih dahulu.");
        }
        if (!characters.length || !locations.length) {
            throw new Error("Generate Production Bible dan lock assets dulu sebelum AI Director Plan.");
        }
        if (!silent) { setBusy(true); setError(""); setProgress("AI Director Mode menyusun showrunner plan..."); }
        try {
            const hermesResult = await callHermesJson("/api/hermes/director-plan", {
                project,
                characters,
                locations,
                props,
                targetShots,
            }, "HERMES_DIRECTOR_PLAN_EMPTY");
            const hermesCompactPlan = JSON.stringify({
                logline: toText(hermesResult?.logline),
                centralConflict: toText(hermesResult?.centralConflict),
                seasonArc: Array.isArray(hermesResult?.seasonArc) ? hermesResult.seasonArc : [],
                episodeStrategy: Array.isArray(hermesResult?.episodeStrategy) ? hermesResult.episodeStrategy : [],
                characterArcs: Array.isArray(hermesResult?.characterArcs) ? hermesResult.characterArcs : [],
                conflictLadder: Array.isArray(hermesResult?.conflictLadder) ? hermesResult.conflictLadder : [],
                revealLadder: Array.isArray(hermesResult?.revealLadder) ? hermesResult.revealLadder : [],
                shotVarietyRules: Array.isArray(hermesResult?.shotVarietyRules) ? hermesResult.shotVarietyRules : [],
                dialogueRules: Array.isArray(hermesResult?.dialogueRules) ? hermesResult.dialogueRules : [],
                continuityRules: Array.isArray(hermesResult?.continuityRules) ? hermesResult.continuityRules : [],
                imagePromptRules: Array.isArray(hermesResult?.imagePromptRules) ? hermesResult.imagePromptRules : [],
                videoEngineRules: Array.isArray(hermesResult?.videoEngineRules) ? hermesResult.videoEngineRules : [],
                qaRules: Array.isArray(hermesResult?.qaRules) ? hermesResult.qaRules : [],
            }, null, 2);
            setProject((prev) => ({ ...prev, directorModePlan: hermesCompactPlan, aiDirectorMode: true }));
            if (!silent) setProgress("Hermes AI Director Plan siap.");
            return hermesCompactPlan;
            const result = await withCreditMeter("AI Director Mode Plan", "text", () => callJSON(`
ROLE: You are AI DIRECTOR MODE for a premium serialized microdrama studio.
TASK: Create a compact but production-useful director plan that will control automatic shot generation, continuity, dialogue style, video-engine prompting, and QA.

${buildAiDirectorModeContract(regionProfile.country, regionProfile.language, projectAspectRatio)}

PROJECT:
TITLE: ${project.title}
GENRE: ${project.genre}
PREMISE: ${project.premise}
EPISODES: ${project.episodeCount}
SECONDS_PER_EPISODE: ${project.episodeDuration}
TARGET_SHOTS_TOTAL: ${targetShots}
FORMAT: ${projectAspectLabel}
COUNTRY: ${regionProfile.country}
LANGUAGE: ${regionProfile.language}

REGION HARD RULES:
${regionProfile.rules.map((rule) => `- ${rule}`).join("\n")}

LOCKED CAST:
${JSON.stringify(characters.map((item) => ({ id: item.id, name: item.name, role: item.role, identity: item.identity, costume: item.costume })), null, 2)}

LOCKED LOCATIONS:
${JSON.stringify(locations.map((item) => ({ id: item.id, name: item.name, description: item.description, architecture: item.architecture, furniture: item.furniture })), null, 2)}

LOCKED PROPS:
${JSON.stringify(props.map((item) => ({ id: item.id, name: item.name, description: item.description, appearance: item.appearance })), null, 2)}

LOCKED VISUAL STYLE:
${project.visualStyle}

LOCKED STORY GUARDRAILS:
${project.storyRules}

REQUIREMENTS:
- Create a strong serialized drama spine from beginning to finale.
- Include conflict ladder, secret/reveal ladder, emotional progression, cliffhanger strategy, continuity risks, and shot variety strategy.
- Specify how inner monologue, bergumam, silent acting, solo walking, prop reveal, and confrontations should be used.
- Mention exact asset IDs where relevant. Do not invent new locked characters, locations, or props.
- Keep it concise enough to include in future prompts.

RETURN JSON ONLY:
{
  "logline": "",
  "centralConflict": "",
  "seasonArc": ["act 1", "act 2", "act 3"],
  "episodeStrategy": [
    { "episode": 1, "hook": "", "conflict": "", "reversal": "", "cliffhanger": "" }
  ],
  "characterArcs": [
    { "characterId": "CHAR_001", "want": "", "fear": "", "secret": "", "turningPoints": [] }
  ],
  "conflictLadder": [],
  "revealLadder": [],
  "shotVarietyRules": [],
  "dialogueRules": [],
  "continuityRules": [],
  "videoEngineRules": [],
  "qaRules": []
}
`, [], 0.25, 3));
            const compactPlan = JSON.stringify({
                logline: toText(result?.logline),
                centralConflict: toText(result?.centralConflict),
                seasonArc: Array.isArray(result?.seasonArc) ? result.seasonArc : [],
                episodeStrategy: Array.isArray(result?.episodeStrategy) ? result.episodeStrategy : [],
                characterArcs: Array.isArray(result?.characterArcs) ? result.characterArcs : [],
                conflictLadder: Array.isArray(result?.conflictLadder) ? result.conflictLadder : [],
                revealLadder: Array.isArray(result?.revealLadder) ? result.revealLadder : [],
                shotVarietyRules: Array.isArray(result?.shotVarietyRules) ? result.shotVarietyRules : [],
                dialogueRules: Array.isArray(result?.dialogueRules) ? result.dialogueRules : [],
                continuityRules: Array.isArray(result?.continuityRules) ? result.continuityRules : [],
                videoEngineRules: Array.isArray(result?.videoEngineRules) ? result.videoEngineRules : [],
                qaRules: Array.isArray(result?.qaRules) ? result.qaRules : [],
            }, null, 2);
            setProject((prev) => ({ ...prev, directorModePlan: compactPlan, aiDirectorMode: true }));
            if (!silent) setProgress("AI Director Plan siap.");
            return compactPlan;
        } finally {
            if (!silent) {
                setBusy(false);
                if (typeof window !== "undefined") window.setTimeout(() => setProgress(""), 1800);
            }
        }
    };

    const generateAutoDramaShots = async () => {
        const allLocked = characters.length && locations.length &&
            characters.every((item) => item.locked && item.referenceImage) &&
            locations.every((item) => item.locked && item.referenceImage) &&
            props.every((item) => item.locked && item.referenceImage);
        if (!allLocked) {
            setError("Lock semua character dan location reference dulu. Props boleh 0, tapi kalau ada harus locked.");
            return;
        }
        const targetShots = Math.min(80, Math.max(8, Math.round(Number(project.episodeCount || 1) * Math.min(8, Math.max(4, Number(project.episodeDuration || 120) / 20)))));
        setBusy(true); setError(""); setProgress("AI Producer membuat full drama shot queue otomatis...");
        try {
            const directorModeEnabled = project.aiDirectorMode !== false;
            let directorPlan = directorModeEnabled ? toText(project.directorModePlan) : "";
            if (directorModeEnabled && !directorPlan) {
                setProgress("AI Director Mode: membuat showrunner/continuity/QA plan...");
                directorPlan = await generateAiDirectorPlan({ targetShots, silent: true });
            }
            const result = await withCreditMeter("Auto Full Drama Shot Queue", "text", () => callJSON(`
ROLE: You are a vertical/short drama showrunner and production shot planner.
TASK: Generate a complete serialized drama flow from the premise into a ready-to-render shot queue.

${directorModeEnabled ? buildAiDirectorModeContract(regionProfile.country, regionProfile.language, projectAspectRatio) : ""}

PROJECT:
TITLE: ${project.title}
GENRE: ${project.genre}
PREMISE: ${project.premise}
EPISODES: ${project.episodeCount}
SECONDS_PER_EPISODE: ${project.episodeDuration}
TARGET_SHOTS_TOTAL: ${targetShots}
FORMAT: ${projectAspectLabel}
COUNTRY: ${regionProfile.country}
LANGUAGE: ${regionProfile.language}
REGION RULES:
${regionProfile.rules.map((rule) => `- ${rule}`).join("\n")}

LOCKED VISUAL STYLE:
${project.visualStyle}

LOCKED STORY GUARDRAILS:
${project.storyRules}

LOCKED CAST:
${JSON.stringify(characters.map((item) => ({ id: item.id, name: item.name, role: item.role, identity: item.identity, costume: item.costume })), null, 2)}

LOCKED LOCATIONS:
${JSON.stringify(locations.map((item) => ({ id: item.id, name: item.name, description: item.description, architecture: item.architecture, furniture: item.furniture })), null, 2)}

LOCKED PROPS:
${JSON.stringify(props.map((item) => ({ id: item.id, name: item.name, description: item.description, appearance: item.appearance })), null, 2)}

${directorModeEnabled ? `AI DIRECTOR PLAN (AUTHORITATIVE STORY / CONTINUITY / QA BLUEPRINT):
${directorPlan}

FOLLOW THIS DIRECTOR PLAN:
- Use episodeStrategy for each episode hook/conflict/reversal/cliffhanger.
- Use conflictLadder and revealLadder to make the story escalate instead of repeating the same conversation.
- Use shotVarietyRules to mix dialogue, inner thought, solo movement, silent reaction, prop reveal, hidden watching, interruption, and cliffhanger shots.
- Use continuityRules and qaRules to avoid drift, missing characters, changed wardrobe/footwear, changed props, cartoon style, or broken location continuity.
- Use videoEngineRules when writing cameraScript, directAnchorPrompt, and characterDirections.
` : ""}

MANDATORY DRAMA DESIGN:
- Create one connected story arc from episode 1 to the finale, with escalating conflict, secrets, reversals, emotional consequences, and cliffhangers.
- Do NOT make the whole queue only 2-3 people talking. Mix beat types: solo walking, inner monologue/membatin, silent reaction, discovery of a prop, hidden watching, confrontation, interruption, reveal, chase/approach, waiting, leaving, decision beat, and cliffhanger.
- Automatically choose cinematic cameraMovement and cameraScript for every shot so the drama feels alive: handheld tension, slow push-in for reveal, pan/rack-focus for reaction, tracking for walking, wide establishing for markets/streets/crowds, tighter close/medium for confession or inner thought.
- Shot 1 MUST be an OPENING_ESTABLISH cinematic location shot before the main character drama begins: drone/crane/high wide view of the locked location or its surrounding establishing geography, dramatic atmosphere, no dialogue, preferably zero main cast unless the premise absolutely requires a tiny distant figure. It should feel like a produced drama opening, not a character portrait.
- Plan the whole queue for later manual editing into one continuous DramaBox-style episode. Each shot is a small cuttable clip: it may change angle, character focus, shot size, or location when story-motivated, but the cut must feel intentional and watchable.
- For every shot, write plannedStartState and plannedEndState so anchors can be generated before videos exist. plannedEndState of one shot should naturally motivate plannedStartState of the next shot, especially when a character walks, turns, notices something, exits a frame, or changes emotional direction.
- If the next shot changes angle/location/character focus, make transitionIn and transitionOut explain the editorial reason: reaction cut, match action, reveal cut, location establish, cutaway, cliffhanger insert, push to listener, or time-compression. Avoid random jumps.
- Add an inter-shot bridge for every non-opening shot: continue gaze, posture, emotion, hand/prop state, and camera axis from the previous shot when same-location; if changing location/focus, justify it with a clear editorial bridge. Avoid patah-patah editing, stiff character resets, and sudden camera jumps.
- cameraScript must include smooth interaction/camera bridging: a small reaction hold, eye shift, breath, turn, rack focus, gentle pan, tracking continuation, or motivated reframe at the start/end. Avoid robotic start-stop movement unless the beat intentionally shocks the viewer.
- When the scene realistically needs atmosphere (street, market, trading, interview, school/company lobby, courtroom/palace hall, fight spectators, road crossing, public humiliation), add background NPC extras even if they are not locked assets. They are nameless non-recurring atmosphere only, not main characters.
- Background NPCs must never replace, duplicate, speak for, hide, or visually overpower locked characters. Main locked cast remains foreground priority.
- Each episode needs a hook/opening, escalation, and an unresolved ending/cliffhanger. The final episode may resolve the main conflict but should still end dramatically.
- Use only locked character IDs, locked location IDs, and locked prop IDs. No new named characters, no new recurring locations, no new important props.
- Character lock supports different sides and expressions: use varied 3/4 angles, side profiles, listener reactions, thinking expressions, and emotion changes, while preserving face and wardrobe.
- Keep character scale realistic. Do not use giant-like low angles or forced foreground scale unless story explicitly needs a normal close-up.
- Dialogue is optional. Some shots should have NO dialogue. Some one-character shots may use INNER VOICE by writing dalam hati / membatin and quoted dialogue.
- Dialogue must be natural ${regionProfile.language}, exact, short enough for the shot duration, and assigned to the correct character in PER-CHARACTER DIRECTION.
- For each spoken/inner line, put the exact line inside quotes in that character's scenePrompt only.
- Use @marah, @sedih, @tegas, @takut, @membatin, @bergumam, etc. where useful.
- If a character speaks to another visible character, set talkTargetId.
- Wardrobe/props/setting must match the chosen drama era. Historical/dynasty stories must use period-correct wardrobe/properties/architecture and avoid modern objects.
- Every shot must be one location and one continuous moment, suitable for image anchor + first-frame video generation.

${ultraRealisticStoryboardLock(projectAspectRatio)}
${wardrobeAndEraLock(regionProfile.country)}
${environmentBlendLock(null, project.visualStyle)}
${dynamicAudioLanguageLock(regionProfile.language, regionProfile.country)}
${realisticMotionLock}

RETURN JSON ONLY:
{
  "episodes": [
    { "episode": 1, "logline": "", "hook": "", "cliffhanger": "" }
  ],
  "shots": [
    {
      "episode": 1,
      "sceneId": "EP01_SC01",
      "shotKind": "OPENING_ESTABLISH | DIALOGUE | INNER_MONOLOGUE | SOLO_ACTION | REACTION | PROP_REVEAL | CONFRONTATION | CLIFFHANGER",
      "locationId": "LOC_001",
      "characterIds": ["CHAR_001"],
      "propIds": [],
      "action": "",
      "continuitySetup": "",
      "plannedStartState": "",
      "plannedEndState": "",
      "transitionIn": "",
      "transitionOut": "",
      "movementMode": "STATIC | LOCOMOTION",
      "movingCharacterIds": [],
      "cameraMovement": "STATIC | PAN | TILT | PUSH_IN | PULL_OUT | TRACKING | HANDHELD | ORBIT | CRANE | MIXED",
      "cameraScript": "",
      "allowCutaway": false,
      "allowSceneFlexibility": false,
      "backgroundNpcMode": "NONE | LIGHT | MEDIUM | CROWD",
      "backgroundNpcDescription": "",
      "backgroundNpcMaxCount": 0,
      "directAnchorPrompt": "",
      "characterDirections": [
        { "characterId": "CHAR_001", "talkTargetId": "", "cameraFocus": true, "scenePrompt": "" }
      ],
      "continuityNotes": []
    }
  ]
}
`, [], 0.25, 3));
            const rawShots = Array.isArray(result?.shots) ? result.shots : [];
            if (!rawShots.length) throw new Error("AUTO_DRAMA_SHOTS_EMPTY");
            const validCharacterIds = characters.map((item) => item.id);
            const validLocationIds = locations.map((item) => item.id);
            const validPropIds = props.map((item) => item.id);
            const normalizedShots = rawShots.slice(0, targetShots).map((item, index) => {
                const rawShotKind = index === 0 ? "OPENING_ESTABLISH" : (toText(item.shotKind) || "AUTO_DRAMA");
                const isOpeningEstablish = rawShotKind === "OPENING_ESTABLISH";
                const characterIds = normalizeIdList(item.characterIds).filter((id) => validCharacterIds.includes(id)).slice(0, characters.length);
                const safeCharacterIds = isOpeningEstablish ? [] : (characterIds.length ? characterIds : validCharacterIds.slice(0, 1));
                const locationId = validLocationIds.includes(toText(item.locationId)) ? toText(item.locationId) : validLocationIds[0];
                const propIds = normalizeIdList(item.propIds).filter((id) => validPropIds.includes(id));
                const movementMode = !safeCharacterIds.length ? "STATIC" : (toText(item.movementMode) === "LOCOMOTION" ? "LOCOMOTION" : "STATIC");
                const autoNpc = inferBackgroundNpcPlan(item, locationMap.get(locationId), regionProfile);
                const backgroundNpcMode = isOpeningEstablish ? "NONE" : normalizeBackgroundNpcMode(item.backgroundNpcMode || autoNpc.mode);
                const backgroundNpcMaxCount = Math.max(0, Math.min(60, Number(item.backgroundNpcMaxCount || autoNpc.maxCount || maxBackgroundNpcCountForMode(backgroundNpcMode))));
                const backgroundNpcDescription = rawFieldText(item.backgroundNpcDescription || autoNpc.description);
                const autoCamera = inferAutoDramaCameraPlan({
                    ...item,
                    shotKind: rawShotKind,
                    characterIds: safeCharacterIds,
                    locationId,
                    movementMode,
                    backgroundNpcMode,
                    backgroundNpcDescription,
                }, safeCharacterIds.length);
                const cameraMovement = isOpeningEstablish
                    ? "CRANE"
                    : CAMERA_MOVEMENT_PRESETS.some((preset) => preset.id === item.cameraMovement)
                    ? item.cameraMovement
                    : autoCamera.cameraMovement;
                const baseShot: any = {
                    id: `SH_${pad(index + 1)}`,
                    episode: Math.max(1, Math.min(Number(project.episodeCount || 1), Number(item.episode || 1))),
                    sceneId: toText(item.sceneId) || `EP${pad(Number(item.episode || 1), 2)}_SC${pad(index + 1, 2)}`,
                    shotNumber: index + 1,
                    characterIds: safeCharacterIds,
                    locationId,
                    propIds,
                    expectedHumanCount: safeCharacterIds.length,
                    camera: isOpeningEstablish
                        ? `High wide drone/crane establishing ${aspectRatioFrameDescription(projectAspectRatio)} shot of ${locationMap.get(locationId)?.name || locationId}; no foreground main cast, dramatic location scale, smooth produced opening.`
                        : inferDeterministicCamera(safeCharacterIds.length, movementMode),
                    shotKind: rawShotKind,
                    action: isOpeningEstablish
                        ? rawFieldText(item.action) || `Dramatic drone/crane establishing view of ${locationMap.get(locationId)?.name || locationId}; reveal the world, architecture, road/roofline/landscape, atmosphere, and emotional tone before any main character scene begins. No dialogue.`
                        : rawFieldText(item.action),
                    continuitySetup: rawFieldText(item.continuitySetup),
                    plannedStartState: isOpeningEstablish
                        ? rawFieldText(item.plannedStartState || item.startState) || "Open on a high wide/drone-style view of the locked location before the character drama begins; no dialogue and no foreground main cast."
                        : rawFieldText(item.plannedStartState || item.startState),
                    plannedEndState: isOpeningEstablish
                        ? rawFieldText(item.plannedEndState || item.endState) || "End settled on the specific area of the locked location where the next shot can introduce the first character beat."
                        : rawFieldText(item.plannedEndState || item.endState),
                    transitionIn: index === 0
                        ? rawFieldText(item.transitionIn) || "Opening cut from black/title into a dramatic high wide establishing view."
                        : rawFieldText(item.transitionIn),
                    transitionOut: isOpeningEstablish
                        ? rawFieldText(item.transitionOut) || "Cut from the settled establishing frame into the first character/action shot in the same story world."
                        : rawFieldText(item.transitionOut),
                    incidentalSetDressing: [],
                    carryOverCharacterIds: [],
                    mustRemainVisibleIds: safeCharacterIds,
                    referencedVisibleTargetIds: normalizeIdList(item.referencedVisibleTargetIds).filter((id) => safeCharacterIds.includes(id)),
                    movingCharacterIds: normalizeIdList(item.movingCharacterIds).filter((id) => safeCharacterIds.includes(id)),
                    movementMode,
                    continuityNotes: Array.isArray(item.continuityNotes) ? item.continuityNotes.map(toText).filter(Boolean) : [],
                    durationSeconds: 8,
                    videoPrompt: "",
                    anchorImage: null,
                    anchorStatus: "idle",
                    qa: makeShotQA(),
                    videoLastFrameImage: null,
                    videoLastFrameCapturedAt: null,
                    characterDirections: normalizeCharacterDirections(item.characterDirections, safeCharacterIds),
                    cameraScript: isOpeningEstablish
                        ? rawFieldText(item.cameraScript) || "0-2s: start with a high drone/crane wide view of the locked location and its surroundings, no main cast foreground. 2-6s: smooth cinematic glide or gentle descent that reveals scale, architecture, street/roof/landscape mood, and story atmosphere. Final beat: settle on the exact location area where the drama will begin, leaving a cuttable frame for the next character shot."
                        : rawFieldText(item.cameraScript || autoCamera.cameraScript),
                    cameraMovement,
                    allowCutaway: Boolean(item.allowCutaway),
                    allowSceneFlexibility: Boolean(item.allowSceneFlexibility || backgroundNpcMode !== "NONE"),
                    backgroundNpcMode,
                    backgroundNpcDescription,
                    backgroundNpcMaxCount,
                    directAnchorPrompt: rawFieldText(item.directAnchorPrompt),
                    videoStatus: "idle",
                    videoUrl: null,
                    videoRemoteUri: null,
                    operationName: null,
                };
                const dialogue = buildDialogueFromCharacterDirections(baseShot);
                const durationSeconds = inferShotDuration({ shotKind: baseShot.shotKind, action: baseShot.action, dialogue, movementMode });
                return applyShotAssetAssignments({ ...baseShot, dialogue, durationSeconds });
            });
            const generatedEpisodes = Array.isArray(result?.episodes) ? result.episodes.map((item) => ({
                episode: Number(item.episode || 1),
                logline: toText(item.logline),
                hook: toText(item.hook),
                cliffhanger: toText(item.cliffhanger),
                characterIds: [],
                locationIds: [],
                propIds: [],
            })) : [];
            setEpisodes(generatedEpisodes);
            setScripts({});
            setShots(normalizedShots);
            setSelectedShotId(normalizedShots[0]?.id || null);
            setStage("render");
            setProgress(`Auto drama siap: ${normalizedShots.length} shot tersusun dari premise.`);
            if (typeof window !== "undefined") window.setTimeout(() => setProgress(""), 2500);
        } catch (err) { handleError(err); } finally { setBusy(false); }
    };

    const generateHermesAutoDramaShots = async () => {
        const allLocked = characters.length && locations.length &&
            characters.every((item) => item.locked && item.referenceImage) &&
            locations.every((item) => item.locked && item.referenceImage) &&
            props.every((item) => item.locked && item.referenceImage);
        if (!allLocked) {
            setError("Lock semua character dan location reference dulu. Props boleh 0, tapi kalau ada harus locked.");
            return;
        }
        const targetShots = Math.min(80, Math.max(8, Math.round(Number(project.episodeCount || 1) * Math.min(8, Math.max(4, Number(project.episodeDuration || 120) / 20)))));
        setBusy(true); setError(""); setProgress("Hermes Agent menyusun scripting, dialogue, prompt image, dan prompt video...");
        try {
            const directorModeEnabled = project.aiDirectorMode !== false;
            let directorPlan = directorModeEnabled ? toText(project.directorModePlan) : "";
            if (directorModeEnabled && !directorPlan) {
                setProgress("Hermes AI Director: membuat showrunner/continuity/QA plan...");
                directorPlan = await generateAiDirectorPlan({ targetShots, silent: true });
            }
            setProgress("Hermes Muse Video + director skills mengisi full drama field UI...");
            const result = await callHermesJson("/api/hermes/auto-drama", {
                project,
                characters,
                locations,
                props,
                directorPlan,
                targetShots,
            }, "HERMES_AUTO_DRAMA_EMPTY");
            const rawShots = Array.isArray(result?.shots) ? result.shots : [];
            if (!rawShots.length) throw new Error("AUTO_DRAMA_SHOTS_EMPTY");
            const validCharacterIds = characters.map((item) => item.id);
            const validLocationIds = locations.map((item) => item.id);
            const validPropIds = props.map((item) => item.id);
            const normalizedShots = rawShots.slice(0, targetShots).map((item, index) => {
                const rawShotKind = index === 0 ? "OPENING_ESTABLISH" : (toText(item.shotKind) || "AUTO_DRAMA");
                const isOpeningEstablish = rawShotKind === "OPENING_ESTABLISH";
                const characterIds = normalizeIdList(item.characterIds).filter((id) => validCharacterIds.includes(id)).slice(0, characters.length);
                const safeCharacterIds = isOpeningEstablish ? [] : (characterIds.length ? characterIds : validCharacterIds.slice(0, 1));
                const locationId = validLocationIds.includes(toText(item.locationId)) ? toText(item.locationId) : validLocationIds[0];
                const propIds = normalizeIdList(item.propIds).filter((id) => validPropIds.includes(id));
                const movementMode = !safeCharacterIds.length ? "STATIC" : (toText(item.movementMode) === "LOCOMOTION" ? "LOCOMOTION" : "STATIC");
                const autoNpc = inferBackgroundNpcPlan(item, locationMap.get(locationId), regionProfile);
                const backgroundNpcMode = isOpeningEstablish ? "NONE" : normalizeBackgroundNpcMode(item.backgroundNpcMode || autoNpc.mode);
                const backgroundNpcMaxCount = Math.max(0, Math.min(60, Number(item.backgroundNpcMaxCount || autoNpc.maxCount || maxBackgroundNpcCountForMode(backgroundNpcMode))));
                const backgroundNpcDescription = rawFieldText(item.backgroundNpcDescription || autoNpc.description);
                const autoCamera = inferAutoDramaCameraPlan({
                    ...item,
                    shotKind: rawShotKind,
                    characterIds: safeCharacterIds,
                    locationId,
                    movementMode,
                    backgroundNpcMode,
                    backgroundNpcDescription,
                }, safeCharacterIds.length);
                const cameraMovement = isOpeningEstablish
                    ? "CRANE"
                    : CAMERA_MOVEMENT_PRESETS.some((preset) => preset.id === item.cameraMovement)
                    ? item.cameraMovement
                    : autoCamera.cameraMovement;
                const baseShot: any = {
                    id: `SH_${pad(index + 1)}`,
                    episode: Math.max(1, Math.min(Number(project.episodeCount || 1), Number(item.episode || 1))),
                    sceneId: toText(item.sceneId) || `EP${pad(Number(item.episode || 1), 2)}_SC${pad(index + 1, 2)}`,
                    shotNumber: index + 1,
                    characterIds: safeCharacterIds,
                    locationId,
                    propIds,
                    expectedHumanCount: safeCharacterIds.length,
                    camera: isOpeningEstablish
                        ? `High wide drone/crane establishing ${aspectRatioFrameDescription(projectAspectRatio)} shot of ${locationMap.get(locationId)?.name || locationId}; no foreground main cast, dramatic location scale, smooth produced opening.`
                        : inferDeterministicCamera(safeCharacterIds.length, movementMode),
                    shotKind: rawShotKind,
                    action: rawFieldText(item.action),
                    continuitySetup: rawFieldText(item.continuitySetup),
                    plannedStartState: rawFieldText(item.plannedStartState || item.startState),
                    plannedEndState: rawFieldText(item.plannedEndState || item.endState),
                    transitionIn: rawFieldText(item.transitionIn),
                    transitionOut: rawFieldText(item.transitionOut),
                    incidentalSetDressing: [],
                    carryOverCharacterIds: [],
                    mustRemainVisibleIds: safeCharacterIds,
                    referencedVisibleTargetIds: normalizeIdList(item.referencedVisibleTargetIds).filter((id) => safeCharacterIds.includes(id)),
                    movingCharacterIds: normalizeIdList(item.movingCharacterIds).filter((id) => safeCharacterIds.includes(id)),
                    movementMode,
                    continuityNotes: Array.isArray(item.continuityNotes) ? item.continuityNotes.map(toText).filter(Boolean) : [],
                    durationSeconds: 8,
                    videoPrompt: "",
                    anchorImage: null,
                    anchorStatus: "idle",
                    qa: makeShotQA(),
                    videoLastFrameImage: null,
                    videoLastFrameCapturedAt: null,
                    characterDirections: normalizeCharacterDirections(item.characterDirections, safeCharacterIds),
                    cameraScript: rawFieldText(item.cameraScript || autoCamera.cameraScript),
                    cameraMovement,
                    allowCutaway: Boolean(item.allowCutaway),
                    allowSceneFlexibility: Boolean(item.allowSceneFlexibility || backgroundNpcMode !== "NONE"),
                    backgroundNpcMode,
                    backgroundNpcDescription,
                    backgroundNpcMaxCount,
                    directAnchorPrompt: rawFieldText(item.directAnchorPrompt),
                    videoStatus: "idle",
                    videoUrl: null,
                    videoRemoteUri: null,
                    operationName: null,
                };
                const dialogue = buildDialogueFromCharacterDirections(baseShot);
                const durationSeconds = inferShotDuration({ shotKind: baseShot.shotKind, action: baseShot.action, dialogue, movementMode });
                return applyShotAssetAssignments({ ...baseShot, dialogue, durationSeconds });
            });
            const generatedEpisodes = Array.isArray(result?.episodes) ? result.episodes.map((item) => ({
                episode: Number(item.episode || 1),
                logline: toText(item.logline),
                hook: toText(item.hook),
                cliffhanger: toText(item.cliffhanger),
                characterIds: [],
                locationIds: [],
                propIds: [],
            })) : [];
            setEpisodes(generatedEpisodes);
            setScripts({});
            setShots(normalizedShots);
            setSelectedShotId(normalizedShots[0]?.id || null);
            setStage("render");
            setProgress(`Hermes auto drama siap: ${normalizedShots.length} shot sudah mengisi field UI.`);
            if (typeof window !== "undefined") window.setTimeout(() => setProgress(""), 2500);
        } catch (err) { handleError(err); } finally { setBusy(false); }
    };

    const deleteManualShot = (shotId) => {
        if (typeof window !== "undefined" && !window.confirm("Hapus shot ini?")) return;
        setShots((prev) => prev.filter((item) => item.id !== shotId));
        if (selectedShotId === shotId) setSelectedShotId(null);
    };

    const updateSelectedShotAssets = (field, value) => {
        if (!selectedShotId) return;
        setShots((prev) => prev.map((item) => {
            if (item.id !== selectedShotId) return item;
            if (field === "characterIds") {
                const ids = normalizeIdList(value);
                const next = {
                    ...item,
                    characterIds: ids,
                    expectedHumanCount: ids.length,
                    camera: item.shotKind === "MANUAL"
                        ? inferDeterministicCamera(ids.length, item.movementMode || "STATIC")
                        : item.camera,
                    characterDirections: normalizeCharacterDirections(item.characterDirections, ids),
                    mustRemainVisibleIds: normalizeIdList(item.mustRemainVisibleIds).filter((id) => ids.includes(id)),
                    referencedVisibleTargetIds: normalizeIdList(item.referencedVisibleTargetIds).filter((id) => ids.includes(id)),
                    carryOverCharacterIds: normalizeIdList(item.carryOverCharacterIds).filter((id) => ids.includes(id)),
                    movingCharacterIds: normalizeIdList(item.movingCharacterIds).filter((id) => ids.includes(id)),
                };
                const dialogue = buildDialogueFromCharacterDirections(next);
                const durationSeconds = inferShotDuration({ shotKind: next.shotKind, action: next.action, dialogue, movementMode: next.movementMode });
                return recompileVideoPrompt(item, { ...next, dialogue, durationSeconds });
            }
            if (field === "propIds") {
                return recompileVideoPrompt(item, { ...item, propIds: normalizeIdList(value) });
            }
            if (field === "locationId") {
                return recompileVideoPrompt(item, { ...item, locationId: toText(value) });
            }
            return item;
        }));
    };

    // Field teks bebas (action / continuitySetup) — disimpan RAW agar spasi tidak hilang.
    const updateSelectedShotTextField = (field, value) => {
        if (!selectedShotId) return;
        if (!["action", "continuitySetup", "plannedStartState", "plannedEndState", "transitionIn", "transitionOut"].includes(field)) return;
        setShots((prev) => prev.map((item) => {
            if (item.id !== selectedShotId) return item;
            const next: any = { ...item, [field]: String(value ?? "") };
            if (field === "action") {
                next.durationSeconds = inferShotDuration({ shotKind: next.shotKind, action: next.action, dialogue: next.dialogue, movementMode: next.movementMode });
            }
            return recompileVideoPrompt(item, next);
        }));
    };

    // Toggle satu karakter masuk / keluar dari shot (urutan selalu mengikuti urutan cast)
    const toggleSelectedShotCharacter = (characterId) => {
        if (!selectedShot) return;
        const current = normalizeIdList(selectedShot.characterIds);
        const nextSet = new Set(current);
        if (nextSet.has(characterId)) nextSet.delete(characterId);
        else nextSet.add(characterId);
        const ordered = characters.map((c) => c.id).filter((id) => nextSet.has(id));
        updateSelectedShotAssets("characterIds", ordered);
    };

    // Tambah / kurangi TOTAL HUMANS (+ / −)
    const setSelectedShotHumanCount = (count) => {
        if (!selectedShot) return;
        const total = characters.length;
        const target = Math.max(0, Math.min(total, Number(count) || 0));
        const current = normalizeIdList(selectedShot.characterIds);
        if (target === current.length) return;
        let next: string[];
        if (target < current.length) {
            next = current.slice(0, target);
        } else {
            const extra = characters
                .map((c) => c.id)
                .filter((id) => !current.includes(id))
                .slice(0, target - current.length);
            const merged = new Set([...current, ...extra]);
            next = characters.map((c) => c.id).filter((id) => merged.has(id));
        }
        updateSelectedShotAssets("characterIds", next);
    };

    const wordsInDialogue = (value) => toText(value).split(/\s+/).filter(Boolean).length;
    const dialogueWordCount = (dialogue = []) => (dialogue || []).reduce((sum, line) => sum + wordsInDialogue(line?.text), 0);
    const buildDialogueTimingLock = (dialogue = [], durationSeconds = 8) => {
        const lines = Array.isArray(dialogue) ? dialogue : [];
        if (!lines.length) return "";
        const spokenLines = lines.filter((line) => !line?.innerSpeech);
        const totalWords = dialogueWordCount(spokenLines);
        const lineSummary = lines.map((line, index) => {
            const mode = line?.speechMode || (line?.innerSpeech ? "inner" : "spoken");
            const tag = mode === "inner" ? " (INNER VOICE)" : mode === "mumble" ? " (MUMBLE / UNDER BREATH)" : "";
            return `LINE_${index + 1}: ${line.characterId}${tag}, ${wordsInDialogue(line.text)} words`;
        }).join("; ");
        const pairedRule = lines.length > 1
            ? ` This shot intentionally contains ${lines.length} dialogue line(s) in one continuous ${durationSeconds}-second take; perform them in written order with natural turn-taking, no overlap, and no added dialogue.`
            : "";
        const durationClass = durationSeconds <= 6
            ? "Use compact natural delivery: begin speech promptly, keep gestures minimal, finish all words cleanly, then hold a tiny reaction beat."
            : durationSeconds <= 8
                ? "Use smooth medium pacing: finish both the exact words and a short reaction beat without rushing or dragging."
                : "Use the extra duration for restrained emotional reaction after the exact dialogue, not extra words.";
        return `DIALOGUE_TIMING_LOCK: ${lines.length} line(s), ${totalWords} spoken word(s). ${lineSummary}.${pairedRule} ${durationClass} Speak like natural everyday conversation, not poetry, narration, preaching, theater monologue, ceremonial speech, or sing-song recitation. Never truncate, swallow, paraphrase, skip, or continue any word past the final frame.`;
    };
    const buildNaturalSpeechPerformanceLock = (shot) => {
        if (!shot?.dialogue?.length) return "NATURAL SPEECH LOCK: no spoken dialogue in this shot.";
        const allLines = shot.dialogue || [];
        const mode = (line) => line?.speechMode || (line?.innerSpeech ? "inner" : "spoken");
        const spoken = allLines.filter((line) => mode(line) === "spoken");
        const mumbleLines = allLines.filter((line) => mode(line) === "mumble");
        const mumbleRules = mumbleLines.length
            ? [
                "MUMBLE / UNDER-BREATH LINES:",
                `- Line(s) tagged MUMBLE (${mumbleLines.map((line) => line.characterId).join(", ")}) are spoken out loud but very quietly, muttered under the breath, almost to oneself.`,
                "- Lips move only slightly with minimal jaw movement; low volume, low pitch, soft and partially swallowed articulation — NOT a clear projected line and NOT silent.",
                "- Audio is a quiet real murmur that still matches the exact written words; keep it barely audible, not a normal conversational volume.",
                "- Other characters mostly do NOT clearly hear or react to a mumbled line unless they are extremely close.",
              ]
            : [];
        if (!spoken.length && !mumbleLines.length) return "NATURAL SPEECH LOCK: only inner-voice lines in this shot; no audible spoken delivery.";
        return joinLines([
            "NATURAL SPEECH LOCK:",
            `- Spoken delivery must sound like grounded everyday ${regionProfile.language} conversation, not a poem, not narration, not a trailer voice, not a ceremonial proclamation, not theatrical recitation.`,
            `- Accent must stay native and believable for ${regionProfile.country}; for Indonesia use natural Indonesian accent and everyday Bahasa Indonesia cadence.`,
            "- Articulation must match the exact text once. Do not repeat words, double syllables, echo a phrase, add filler, or let the same line be heard twice.",
            "- Use normal human pauses, breath, and conversational emphasis. Avoid sing-song rhythm, overly smooth dramatic cadence, rhyming, chanting, or exaggerated emotional intonation.",
            "- Characters speak to the visible listener/object/situation, not to an audience. No voice-over tone, no audiobook tone, no stage-play projection.",
            "- Keep volume and pitch restrained and realistic for the distance shown by the camera.",
            "- The exact written words are locked, but the performance should feel like a person talking in the scene, not reading poetic lines.",
            ...mumbleRules,
        ]);
    };
    const inferCharacterVoiceProfile = (character) => {
        const id = toText(character?.id);
        const name = toText(character?.name) || id;
        const role = toText(character?.role);
        const desc = toText(character?.description);
        const age = toText(character?.identity?.age);
        const gender = toText(character?.identity?.gender);
        const body = toText(character?.identity?.body);
        const raw = `${role} ${desc} ${age} ${gender} ${body}`.toLowerCase();
        const apparentAge = /\b(elder|old|tua|lansia|kakek|nenek|ayah|ibu|bapak|mother|father)\b/.test(raw)
            ? "mature adult"
            : /\b(teen|remaja|young|muda|anak|student|sisw|mahasiswa)\b/.test(raw)
                ? "young"
                : "adult";
        const pitch = /\b(female|woman|perempuan|wanita|ibu|gadis|girl|istri)\b/.test(raw)
            ? (apparentAge === "mature adult" ? "medium to medium-low female pitch" : "medium female pitch")
            : /\b(male|man|laki|pria|bapak|ayah|boy|suami)\b/.test(raw)
                ? (apparentAge === "mature adult" ? "medium-low to low male pitch" : "medium-low male pitch")
                : "natural mid-range pitch matching the character";
        const authority = /\b(ceo|boss|direktur|pemilik|juragan|kepala|pemimpin|manager|manajer|pejabat|sultan|raja|ratu|bangsawan)\b/.test(raw);
        const timid = /\b(pemalu|lembut|baik hati|compassionate|kind|polos|humble|rendah hati|gugup|nervous)\b/.test(raw);
        const antagonist = /\b(antagonist|sombong|angkuh|arrogant|sinis|kasar|judgmental|villain|licik)\b/.test(raw);
        const texture = authority
            ? "controlled, confident, steady voice texture"
            : antagonist
                ? "slightly sharper, judgmental, confident voice texture"
                : timid
                    ? "softer but still clear voice texture"
                    : "grounded natural voice texture";
        const cadence = authority
            ? "measured decisive cadence"
            : antagonist
                ? "crisp, cutting cadence"
                : timid
                    ? "gentler cadence with small hesitations when emotional"
                    : "everyday conversational cadence";
        return `${id} (${name}): ${apparentAge} ${pitch}; ${texture}; ${cadence}; stable Indonesian/${regionProfile.country} accent and pronunciation. Role/identity cues: ${limitText([role, desc, age, gender].filter(Boolean).join("; "), 220) || "locked character identity"}.`;
    };
    const buildCharacterVoiceContinuityLock = (shot) => {
        const castIds = normalizeIdList(shot?.characterIds || []);
        const cast = castIds.map((id) => characterMap.get(id)).filter(Boolean);
        if (!cast.length) {
            return "CHARACTER VOICE CONTINUITY LOCK: no named speaking characters in this shot.";
        }
        const spokenIds = normalizeIdList((shot?.dialogue || [])
            .filter((line) => (line?.speechMode || (line?.innerSpeech ? "inner" : "spoken")) !== "inner")
            .map((line) => line.characterId));
        return [
            "CHARACTER VOICE CONTINUITY LOCK — DO NOT CHANGE VOICES:",
            "- Treat every Character ID as the same actor/voice actor across the whole series.",
            "- A character's voice identity is locked just like face and wardrobe: same timbre family, same pitch range, same accent, same age impression, same speech texture, and same baseline cadence in every shot.",
            "- Emotion/intensity can change volume, pace, breath, and stress, but must stay inside that same locked voice. Angry does not become a different person; sad does not become a different actor; shouting stays the same character voice louder/tenser.",
            "- Do not swap voices between characters. Do not give two characters the same voice. Do not randomly change a character from male-sounding to female-sounding, young to old, high to low, or Indonesian accent to another accent.",
            "- If the model is uncertain, prioritize consistent recognizable character voice over dramatic vocal variety.",
            `SPEAKING CHARACTER IDS THIS SHOT: ${spokenIds.join(", ") || "NONE"}.`,
            "LOCKED VOICE PROFILES:",
            ...cast.map((character) => `- ${inferCharacterVoiceProfile(character)}`),
        ].join("\n");
    };
    const buildIntonationPerformancePlan = (shot) => {
        const dialogue = Array.isArray(shot?.dialogue) ? shot.dialogue : [];
        if (!dialogue.length) {
            return "INTONATION PERFORMANCE PLAN: no dialogue; physical acting follows ACTION only.";
        }
        const tagSet = (line) => new Set((line?.intonations || []).map((tag) => normIntonationKey(tag)));
        const hasAny = (tags, keys) => keys.some((key) => tags.has(key));
        const linePlans = dialogue.map((line, index) => {
            const tags = tagSet(line);
            const speakerId = toText(line?.characterId);
            const speakerName = characterMap.get(speakerId)?.name || speakerId;
            const mode = line?.speechMode || (line?.innerSpeech ? "inner" : "spoken");
            const notes: string[] = [];
            if (hasAny(tags, ["marah", "kesal", "tegas", "menghina", "sarkastik", "sinis", "jijik"])) {
                notes.push("BODY: grounded stance, tense shoulders, firmer neck, sharper head turns, controlled forward lean, decisive hand/arm movement only when action supports it.");
                notes.push("FACE: tightened jaw, focused eyes, brow tension, contained anger; no soft smiling, no graceful swaying, no weak/floaty gestures.");
                notes.push("VOICE/ARTICULATION: sharper consonants, firmer pressure, slightly faster or clipped timing when angry/kesal, short controlled pauses; not slow, sleepy, poetic, or lembut.");
                notes.push("SAFETY: anger is acted through tension and voice/body pressure, not random violence unless ACTION explicitly says physical contact.");
            }
            if (hasAny(tags, ["berteriak", "panik"])) {
                notes.push("INTENSITY: higher urgency, stronger breath, faster attack on words, visible stress in chest/neck/eyes; keep diction understandable and do not overact into cartoon.");
            }
            if (hasAny(tags, ["sedih", "menangis", "kecewa", "putusasa", "memohon"])) {
                notes.push("BODY: weighted inward posture, smaller gestures, slower reaction, shoulders slightly fallen, eyes heavy or wet if appropriate.");
                notes.push("VOICE/ARTICULATION: slower or broken pacing, softer pressure, breath catches; keep words clear and exact, no theatrical crying unless tagged menangis.");
            }
            if (hasAny(tags, ["takut", "cemas", "tegang", "kaget", "terkejut"])) {
                notes.push("BODY: guarded posture, breath held/short, cautious head/eye movement, small protective gestures; no relaxed graceful movement.");
                notes.push("VOICE/ARTICULATION: tighter breath, slightly broken rhythm, quicker anxious phrases for cemas/panik, brief pause on shock/kaget.");
            }
            if (hasAny(tags, ["lembut", "hangat", "gembira", "senang", "kagum"])) {
                notes.push("BODY: warmer open posture and lighter expression while staying realistic; no exaggerated musical/theatrical sweetness.");
                notes.push("VOICE/ARTICULATION: smoother and warmer cadence, still exact text and natural accent.");
            }
            if (hasAny(tags, ["dingin", "monoton"])) {
                notes.push("BODY: still, minimal gesture, controlled expression, emotional distance.");
                notes.push("VOICE/ARTICULATION: flat/controlled cadence with clear diction; do not add warmth or melodrama.");
            }
            if (!notes.length) {
                notes.push("BODY/VOICE: match the dialogue meaning and ACTION with grounded live-action acting; do not default to limp, graceful, sleepy, or poetic delivery.");
            }
            const modeRule = mode === "inner"
                ? "INNER VOICE: apply emotion only through eyes/brows/breath/body tension; mouth stays closed and still."
                : mode === "mumble"
                    ? "MUMBLE: apply emotion through tiny lip motion and restrained body tension; keep low volume."
                    : "SPOKEN: emotion controls both vocal delivery and visible body performance.";
            return [
                `LINE_${index + 1}_INTONATION_PERFORMANCE: ${speakerId} (${speakerName})`,
                `TAGS: ${(line?.intonations || []).join(", ") || "none"}`,
                modeRule,
                ...notes.map((note) => `- ${note}`),
            ].join("\n");
        });
        return [
            "INTONATION PERFORMANCE PLAN — BODY + VOICE MUST MATCH TAGS:",
            "- Intonation tags control the whole performance: body weight, gesture force, posture, facial tension, breath, pace, volume, and articulation.",
            "- Do not render all emotions with the same weak, slow, graceful movement. Physical acting must change with the tag.",
            "- Anger/firmness must read as real controlled anger: tense, grounded, sharp, decisive, not lemah gemulai.",
            ...linePlans,
        ].join("\n");
    };
    const buildInterShotBridgeLock = (shot) => {
        const currentNumber = Number(shot?.shotNumber || 0);
        const sameEpisodeShots = [...shots]
            .filter((item) => item?.id !== shot?.id && Number(item?.episode) === Number(shot?.episode))
            .sort((a, b) => Number(a.shotNumber || 0) - Number(b.shotNumber || 0));
        const previousShot = [...sameEpisodeShots].reverse().find((item) => Number(item.shotNumber || 0) < currentNumber) || null;
        const nextShot = sameEpisodeShots.find((item) => Number(item.shotNumber || 0) > currentNumber) || null;
        const sameLocationPrevious = previousShot && previousShot.locationId === shot.locationId;
        const sameLocationNext = nextShot && nextShot.locationId === shot.locationId;
        const sharedPreviousCharacters = previousShot
            ? normalizeIdList(shot.characterIds).filter((id) => normalizeIdList(previousShot.characterIds).includes(id))
            : [];
        const sharedNextCharacters = nextShot
            ? normalizeIdList(shot.characterIds).filter((id) => normalizeIdList(nextShot.characterIds).includes(id))
            : [];
        const previousSummary = previousShot
            ? [
                `PREVIOUS_SHOT_ID: ${previousShot.id}`,
                `PREVIOUS_LOCATION_RELATION: ${sameLocationPrevious ? "same location, continue spatial/emotional flow" : "different location/focus, use an intentional editorial transition"}`,
                `PREVIOUS_END_STATE: ${limitText(toText(previousShot.plannedEndState || previousShot.action), 500) || "(not specified)"}`,
                `PREVIOUS_TRANSITION_OUT: ${limitText(toText(previousShot.transitionOut), 360) || "(not specified)"}`,
                `SHARED_PREVIOUS_CHARACTERS: ${sharedPreviousCharacters.join(", ") || "NONE"}`,
            ].join("\n")
            : "PREVIOUS_SHOT_ID: NONE. This shot may establish its own entry rhythm.";
        const nextSummary = nextShot
            ? [
                `NEXT_SHOT_ID: ${nextShot.id}`,
                `NEXT_LOCATION_RELATION: ${sameLocationNext ? "same location, leave a natural continuing body/camera state" : "different location/focus, end on a clean editorial cut point"}`,
                `NEXT_START_STATE: ${limitText(toText(nextShot.plannedStartState || nextShot.action), 500) || "(not specified)"}`,
                `CURRENT_TRANSITION_OUT: ${limitText(toText(shot.transitionOut), 360) || "(not specified)"}`,
                `SHARED_NEXT_CHARACTERS: ${sharedNextCharacters.join(", ") || "NONE"}`,
            ].join("\n")
            : "NEXT_SHOT_ID: NONE. End on a clean dramatic hold.";
        return [
            "INTER-SHOT BRIDGE LOCK — SMOOTH DRAMA EDITING:",
            previousSummary,
            nextSummary,
            `CURRENT_TRANSITION_IN: ${limitText(toText(shot.transitionIn), 360) || "(not specified)"}`,
            `CURRENT_PLANNED_START_STATE: ${limitText(toText(shot.plannedStartState), 500) || "(not specified)"}`,
            `CURRENT_PLANNED_END_STATE: ${limitText(toText(shot.plannedEndState), 500) || "(not specified)"}`,
            "- The clip must not feel like actors reset from zero. Begin with emotional, gaze, posture, hand, and camera momentum that makes sense after the previous shot or transitionIn.",
            "- Avoid sudden stiff camera jumps at second 0. Use a tiny natural settle, breath, eye shift, reaction hold, rack focus, gentle pan, or motivated reframe before/while the action begins unless the script explicitly demands a shock cut.",
            "- Character interactions must continue through reaction beats: after someone speaks, keep the listener's eyeline/body reaction alive; do not cut emotional energy dead.",
            "- For same-location consecutive shots, preserve left/right order, screen axis, actor distance, posture logic, prop handling, and emotional carry-over. Do not teleport characters or snap everyone front-facing.",
            "- For different-location or different-focus shots, make the transition purposeful: reaction cut, match action, reveal cut, cutaway, motivated time-compression, or cliffhanger insert. Do not feel random.",
            "- Camera movement should ease in and ease out naturally. Avoid robotic starts/stops, abrupt whip, sudden zoom, or frozen first/last frames unless cameraScript explicitly requests that effect.",
            "- End with a readable outgoing bridge: a held look, body turn, step completion, hand on prop, reaction pause, or camera settle that can cut smoothly into the next plannedStartState.",
        ].join("\n");
    };
    const buildDialogueSpeakerAttributionLock = (shot) => {
        const dialogue = Array.isArray(shot?.dialogue) ? shot.dialogue : [];
        const castIds = normalizeIdList(shot?.characterIds || []);
        if (!dialogue.length) {
            return [
                "SPEAKER ATTRIBUTION LEDGER:",
                "- NO SPOKEN DIALOGUE. Every visible character keeps mouth closed except natural breathing or nonverbal action.",
                "- Any talking mouth, lip-sync, jaw speech motion, or audible character voice is forbidden in this shot.",
            ].join("\n");
        }
        const rows = dialogue.map((line, index) => {
            const speakerId = toText(line?.characterId);
            const speakerName = characterMap.get(speakerId)?.name || speakerId;
            const mode = line?.speechMode || (line?.innerSpeech ? "inner" : "spoken");
            const text = limitText(toText(line?.text), 360);
            const listenerId = toText(line?.targetCharacterId || line?.listenerCharacterId || line?.targetId);
            const listenerLabel = listenerId && listenerId !== speakerId
                ? `${listenerId} (${characterMap.get(listenerId)?.name || listenerId})`
                : "no explicit listener";
            const nonSpeakers = castIds
                .filter((id) => id !== speakerId)
                .map((id) => `${id} (${characterMap.get(id)?.name || id})`);
            if (mode === "inner") {
                return [
                    `LINE_${index + 1}_SPEAKER_ATTRIBUTION: ${speakerId} (${speakerName}) owns INNER THOUGHT text "${text}".`,
                    `LINE_${index + 1}_MOUTH_OWNER: NONE. ${speakerId} must NOT lip-sync this inner line; mouth stays closed/still.`,
                    `LINE_${index + 1}_FORBIDDEN_MOUTHS: ${castIds.map((id) => `${id} (${characterMap.get(id)?.name || id})`).join(", ") || "ALL CHARACTERS"} must NOT mouth, whisper, or jaw-sync these words.`,
                    `LINE_${index + 1}_FAIL_CONDITION: if any visible mouth appears to say "${text}", the shot is wrong.`,
                ].join("\n");
            }
            const mouthMotion = mode === "mumble"
                ? "tiny under-breath mouth movement only; minimal jaw; low quiet murmur"
                : "normal natural lip-sync and jaw motion";
            const speechModeLabel = mode === "mumble" ? "MUMBLE_UNDER_BREATH" : "SPOKEN_OUT_LOUD";
            return [
                `LINE_${index + 1}_SPEAKER_ATTRIBUTION: ${speakerId} (${speakerName}) is the ONLY character who may perform the text "${text}".`,
                `LINE_${index + 1}_SPEECH_MODE: ${speechModeLabel}.`,
                `LINE_${index + 1}_MOUTH_OWNER: ONLY ${speakerId} (${speakerName}) has ${mouthMotion} for this exact line.`,
                `LINE_${index + 1}_LISTENER_TARGET: ${listenerLabel}. Listener may react silently only; listener must NOT mouth the speaker's words.`,
                `LINE_${index + 1}_FORBIDDEN_MOUTHS: ${nonSpeakers.join(", ") || "NONE"} must keep mouths closed or neutral for listening/breathing; zero lip-sync, zero jaw speech motion, zero whispering of this line.`,
                `LINE_${index + 1}_FAIL_CONDITION: if any non-speaker mouth appears to say "${text}", the shot is wrong; prefer a silent listener reaction over wrong-speaker lip-sync.`,
            ].join("\n");
        });
        return [
            "SPEAKER ATTRIBUTION LEDGER — HARD FAIL RULE:",
            "- Treat each dialogue line like a slate/ADR cue: the line belongs to exactly one SPEAKER_ID.",
            "- The character named in MOUTH_OWNER is the only face allowed to lip-sync, jaw-sync, whisper, or visibly articulate that line.",
            "- All other visible characters are listeners/reaction faces only; their mouths stay closed or neutral and must never form the speaker's words.",
            "- Never swap, transfer, duplicate, echo, chorus, or share a line across two characters.",
            "- If the model is uncertain which face should talk, keep all non-speakers visually silent and animate only the MOUTH_OWNER.",
            ...rows,
        ].join("\n");
    };
    const inferEmotionFromContext = (dialogueTextValue = "", roleValue = "", actionValue = "") => {
        const raw = `${toText(dialogueTextValue)} ${toText(roleValue)} ${toText(actionValue)}`.toLowerCase();
        if (/(cih|gembel|rendah|hina|merusak pemandangan|jijik|memalukan|dasar|sampah|murahan)/.test(raw)) return "sinis, merendahkan, jijik tertahan";
        if (/(haha|wkwk|tertawa|mengejek|mock|ejek)/.test(raw)) return "tertawa mengejek ringan atau senyum sinis";
        if (/(marah|berani|kurang ajar|diam|benci|kesal|emosi)/.test(raw)) return "marah tertahan, kesal, tegas";
        if (/(tolong|jangan|mohon|maaf|ampun|please)/.test(raw)) return "cemas, memohon, tertekan";
        if (/(terima kasih|syukur|alhamdulillah|lega)/.test(raw)) return "lega, tulus, hangat";
        if (/(siapa|kenapa|apa maksud|apa\?|mengapa)/.test(raw)) return "curiga, mempertanyakan, waspada";
        if (/(sedih|kecewa|menahan air mata|terluka)/.test(raw)) return "sedih tertahan, terluka, menahan emosi";
        if (/(compassionate|lembut|baik hati|supportive|empat)/.test(raw)) return "empatik, tenang, lembut";
        if (/(arrogant|antagonist|sombong|angkuh)/.test(raw)) return "angkuh, sinis, merendahkan";
        if (/(undercover ceo|protagonist|observant|serious)/.test(raw)) return "tenang, tertahan, observatif";
        return "netral-terarah, sesuai konteks, realistis, tertahan";
    };
    const inferListenerReaction = (character, shot, speakerId, lineText = "") => {
        const name = character?.name || speakerId;
        const role = toText(character?.role).toLowerCase();
        const raw = `${toText(lineText)} ${role} ${toText(shot?.action)} ${toText(shot?.continuitySetup)}`.toLowerCase();
        const isReferencedTarget = (shot.referencedVisibleTargetIds || []).includes(character?.id || "");
        if (isReferencedTarget && /(hina|gembel|rendah|jijik|merusak pemandangan|murahan|sampah|cih)/.test(raw)) return `${name} shows subtle hurt, quiet humiliation, or restrained discomfort without overacting.`;
        if (/(compassionate|lembut|baik hati|supportive|empat)/.test(role)) return `${name} reacts with subtle empathy, concern, or discomfort.`;
        if (/(arrogant|antagonist|sombong|angkuh)/.test(role)) return `${name} reacts with a restrained smug or judgmental listening expression.`;
        if (/(undercover ceo|protagonist|observant|serious)/.test(role)) return `${name} reacts with restrained composure, alertness, or controlled tension.`;
        return `${name} reacts only with a subtle listening expression that fits the scene context.`;
    };
    const buildExpressionContinuationPlan = (shot) => {
        if (!shot?.dialogue?.length) return "NO POST-DIALOGUE EXPRESSION PLAN — no spoken dialogue in this shot.";
        return shot.dialogue.map((line, index) => {
            const speaker = characterMap.get(line.characterId);
            const intonationHint = (line.intonations || []).length ? ` Intonation tag(s) requested: ${line.intonations.join(", ")}.` : "";
            const emotion = intonationHint || ` ${inferEmotionFromContext(line.text, speaker?.role, shot.action)}`;
            const speechMode = line?.speechMode || ((Boolean(line?.innerSpeech) || isInnerSpeechText(line?.text || "")) ? "inner" : "spoken");
            const isInner = speechMode === "inner";
            const isMumble = speechMode === "mumble";
            const listenerLines = shot.characterIds.filter((id) => id !== line.characterId).map((id) => {
                const character = characterMap.get(id);
                if (isInner) return `- ${id} (${character?.name || id}): does NOT react as if hearing ${line.characterId} — this line is inner thought.`;
                if (isMumble) return `- ${id} (${character?.name || id}): barely notices the mumbled line; at most a faint "did you say something?" micro-reaction, no clear response.`;
                return `- ${id} (${character?.name || id}): ${inferListenerReaction(character, shot, line.characterId, line.text)}`;
            }).join("\n") || "- NONE";
            const speechModeTag = isInner ? "SPEECH_MODE: INNER_MONOLOGUE" : isMumble ? "SPEECH_MODE: MUMBLE_UNDER_BREATH" : "";
            const deliveryRule = isInner
                ? `- ${line.characterId} performs this line as an inner-thought / voice-over. Mouth remains closed or barely parted. No audible delivery.`
                : isMumble
                    ? `- ${line.characterId} mutters this line under the breath: lips move only slightly, minimal jaw movement, very low soft volume, partially swallowed words — audible as a quiet murmur, NOT silent and NOT a clear projected line.`
                    : `- While speaking, ${line.characterId} expresses the required intonation/emotion in a restrained, realistic way.`;
            const holdRule = isInner
                ? `- After the inner-thought line, ${line.characterId} holds a subtle thinking/reaction expression for a brief natural beat.`
                : isMumble
                    ? `- After the mumbled line, ${line.characterId} keeps a quiet, inward, self-absorbed expression for a brief natural beat.`
                    : `- After finishing the line, ${line.characterId} must HOLD a residual version of that same emotion for a brief natural beat.`;
            const resetRule = (isInner || isMumble)
                ? `- Do not let ${line.characterId} reset to a blank/unrelated expression.`
                : `- Do not let ${line.characterId} instantly reset to a blank face or unrelated neutral expression the moment speech ends.`;
            return [
                `LINE_${index + 1}`,
                `SPEAKER_ID: ${line.characterId}`,
                `SPEAKER_NAME: ${speaker?.name || line.characterId}`,
                `PRIMARY_EMOTION: ${emotion}`,
                speechModeTag,
                (line.intonations || []).length ? `INTONATION_TAGS: ${line.intonations.join(", ")}` : "",
                `POST_LINE_EXPRESSION_RULES:`,
                deliveryRule,
                holdRule,
                resetRule,
                `- After the hold beat, ${line.characterId} may settle only into a compatible listening/resting expression, not a contradictory emotion.`,
                `LISTENER_REACTIONS:`,
                listenerLines,
            ].filter(Boolean).join("\n");
        }).join("\n\n");
    };
    const makeShotQA = () => ({
        checked: false, pass: false, humanCount: 0, identityPass: false, locationPass: false,
        hardPass: false, directorBlockingPass: true,
        verticalPass: false, singleFramePass: false, allCharactersVisible: false, framingPass: false,
        fullFramePass: false, spatialSafetyPass: false, referencedTargetVisiblePass: false, continuityPresencePass: false,
        positionContinuityPass: false, propAppearancePass: false, wardrobeContinuityPass: false,
        anatomyPass: false, headDirectionPass: false, stateContinuityPass: false, dialogueEyelinePass: false,
        imageWidth: 0, imageHeight: 0, issues: [], directorNotes: [],
    });
    const inferDeterministicCamera = (humanCount, movementMode) => {
        const frameText = aspectRatioFrameDescription(projectAspectRatio);
        if (movementMode === "LOCOMOTION") {
            if (humanCount >= 4) return `Static wide ${frameText} ensemble establishing shot; camera does not track; clear walkable path visible for all moving actors`;
            if (humanCount === 3) return `Static wide ${frameText} three-person establishing shot; camera does not track; clear walkable path visible`;
            if (humanCount === 2) return `Static medium-wide ${frameText} two-shot; camera does not track; clear walkable path visible`;
            return `Static medium-wide ${frameText} shot; camera does not track; clear walkable path visible`;
        }
        if (humanCount >= 4) return `Static wide ${frameText} ensemble shot, eye level, all ${humanCount} characters fully readable in one frame`;
        if (humanCount === 3) return `Static medium-wide ${frameText} three-shot, eye level, all three characters fully readable in one frame`;
        if (humanCount === 2) return `Static medium ${frameText} two-shot, eye level, both characters remain fully visible in one frame`;
        if (humanCount === 1) return `Static medium ${frameText} shot, eye level, character comfortably inside frame`;
        return `Static ${frameText} establishing shot`;
    };
    // Tentukan mode gerak efektif untuk shot: hormati pilihan manual user (LOCOMOTION),
    // tetapi kalau action menyebut gerak jalan/mendekat dsb., otomatis aktifkan LOCOMOTION
    // dan tebak karakter yang bergerak (subjek sebelum kata kerja gerak), agar video benar-benar
    // menggerakkan karakter alih-alih mengunci posisi (STATIC).
    const resolveEffectiveMotion = (shot) => {
        const castIds = normalizeIdList(shot?.characterIds || []);
        const explicitMovers = normalizeIdList(shot?.movingCharacterIds || []).filter((id) => castIds.includes(id));
        if (shot?.movementMode === "LOCOMOTION") {
            return { movementMode: "LOCOMOTION", movingCharacterIds: explicitMovers.length ? explicitMovers : castIds };
        }
        const actionText = [shot?.action, shot?.continuitySetup, ...(shot?.continuityNotes || [])].map(toText).join(" ");
        if (!actionText || !hasLocomotionIntent(actionText)) {
            return { movementMode: toText(shot?.movementMode) || "STATIC", movingCharacterIds: explicitMovers };
        }
        // Locomotion terdeteksi dari action. Tebak karakter yang bergerak.
        const options = getSelectedShotAssetTagOptions(shot).filter((o) => o.type === "character");
        const lower = actionText.toLowerCase();
        // Cari posisi kemunculan pertama tiap karakter (via alias/mention/name) di action.
        const positions = castIds.map((id) => {
            const character = characterMap.get(id);
            const opt = options.find((o) => o.id === id);
            const candidates = [
                opt ? opt.mention.slice(1) : "",
                ...(opt?.aliases || []),
                toText(character?.name),
                id,
            ].map((s) => toText(s).toLowerCase()).filter(Boolean);
            let pos = -1;
            for (const c of candidates) {
                const idx = lower.indexOf(c);
                if (idx >= 0 && (pos < 0 || idx < pos)) pos = idx;
            }
            return { id, pos };
        }).filter((p) => p.pos >= 0).sort((a, b) => a.pos - b.pos);
        // Karakter yang disebut PALING AWAL dianggap subjek yang bergerak.
        // (cth: "@viktor berjalan mendekati @jaka" → viktor bergerak, jaka target diam)
        const movers = positions.length ? [positions[0].id] : (castIds.length === 1 ? castIds : []);
        return {
            movementMode: "LOCOMOTION",
            movingCharacterIds: explicitMovers.length ? explicitMovers : (movers.length ? movers : castIds),
        };
    };
    const inferShotDuration = ({ shotKind = "", action = "", dialogue = [], movementMode = "STATIC" }) => {
        const raw = `${shotKind} ${toText(action)} ${(dialogue || []).map((line) => line.text).join(" ")}`.toLowerCase();
        const dialogueWords = (dialogue || []).filter((line) => !line?.innerSpeech).reduce((sum, line) => sum + wordsInDialogue(line?.text), 0);
        if (dialogueWords > DIALOGUE_DURATION_WORD_LIMITS.long) return 12;
        if (/ledakan|meledak|explosion|explode|bom|terbakar|api besar|collapse|jatuh dari|tembakan akhir/.test(raw)) return 12;
        if (dialogueWords > DIALOGUE_DURATION_WORD_LIMITS.medium) return 10;
        if (/intense|emosi|marah|menangis|air mata|terpukul|shock|terkejut|panik|kejar|fight|berkelahi|pukul|tampar|menyerang|action_emotion/.test(raw)) return Math.max(dialogueWords ? 10 : 8, dialogueWords > DIALOGUE_DURATION_WORD_LIMITS.short ? 8 : 0);
        if (dialogueWords > DIALOGUE_DURATION_WORD_LIMITS.short) return 8;
        if (dialogueWords > 0) return 6;
        if (/opening_establish|establish|establishing|pembuka|interaksi beruntun|chained|beruntun/.test(raw)) return 8;
        if (movementMode === "LOCOMOTION") return 8;
        return 6;
    };
    type LockedPropReference = {
        id: string;
        name: string;
        description: string;
        appearance: string;
    };

    const getShotLockedProps = (shot): LockedPropReference[] =>
        normalizeIdList(shot?.propIds || []).map((rawId): LockedPropReference => {
            const id = String(rawId ?? "").trim();
            const prop = propMap.get(id);
            return {
                id,
                name: toText(prop?.name) || id,
                description: toText(prop?.description),
                appearance: toText(prop?.appearance),
            };
        }).filter((prop) => Boolean(prop.id));

    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const findMentionedLockedProps = (shot, rawText = ""): LockedPropReference[] => {
        const lowerText = toText(rawText).toLowerCase();
        if (!lowerText) return [];

        return getShotLockedProps(shot)
            .map((prop) => {
                let score = 0;
                const id = prop.id.toLowerCase();
                const name = prop.name.toLowerCase();

                if (id && lowerText.includes(id)) score += 20;
                if (name && lowerText.includes(name)) score += 16;

                const tokens = name
                    .split(/[^a-z0-9à-ÿ_]+/i)
                    .map((item) => item.trim())
                    .filter((item) => item.length >= 3);

                for (const token of tokens) {
                    const regex = new RegExp(`\\b${escapeRegExp(token)}\\b`, "i");
                    if (regex.test(lowerText)) score += token.length >= 5 ? 5 : 3;
                }

                return { prop, score };
            })
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((item) => item.prop);
    };
    const buildObjectAttentionPlan = (shot) => {
        const actionMentions = findMentionedLockedProps(shot, [shot?.action, shot?.continuitySetup, ...(shot?.continuityNotes || [])].map(toText).join(" "));
        const dialogue = Array.isArray(shot?.dialogue) ? shot.dialogue : [];
        const dialogueMentions = dialogue.flatMap((line, index) => findMentionedLockedProps(shot, line?.text).map((prop) => ({ index, prop, speakerId: toText(line?.characterId) })));
        const lines: string[] = ["OBJECT ATTENTION HARD LOCK:"];
        const seen = new Set<string>();
        actionMentions.forEach((prop) => {
            if (seen.has(prop.id)) return;
            seen.add(prop.id);
            lines.push(`- ACTION_OBJECT_PRIORITY: ${prop.id} (${prop.name}) is a locked prop referenced by action/context. If a character is inspecting, questioning, presenting, holding, opening, touching, guarding, or reacting to this prop, their head and eyes must visibly orient to this prop instead of staring at the camera.`);
        });
        if (!actionMentions.length) lines.push("- No action-level locked prop mention detected; use only explicit action/dialogue targets.");
        if (dialogueMentions.length) {
            dialogueMentions.forEach((item) => {
                const speakerName = characterMap.get(item.speakerId)?.name || item.speakerId || "speaker";
                lines.push(`- LINE_${item.index + 1}_OBJECT_FOCUS: ${item.speakerId || "SPEAKER"} (${speakerName}) explicitly references ${item.prop.id} (${item.prop.name}). During this line, the speaker must primarily look at or visibly acknowledge that prop. If another listener is present, the speaker may briefly glance back to the listener, but the object mention must produce a readable object-directed eyeline.`);
            });
        } else {
            lines.push("- No dialogue-level locked prop mention detected.");
        }
        lines.push("- FORBIDDEN: speaker talking about a referenced locked prop while staring straight into the camera with no object-directed glance.");
        lines.push("- FORBIDDEN: inventing a second hero prop, duplicate chest, replacement container, or any new story-important object when the required locked prop already exists in frame.");
        return lines.join("\n");
    };

    type ObjectApproachAssignment = {
        kind: "action" | "dialogue";
        characterId: string;
        prop: LockedPropReference;
        lineIndex: number;
    };

    const getObjectApproachAssignments = (shot): ObjectApproachAssignment[] => {
        const dialogue = Array.isArray(shot?.dialogue) ? shot.dialogue : [];
        const assignments: ObjectApproachAssignment[] = [];
        const seen = new Set<string>();
        const actionText = [shot?.action, shot?.continuitySetup, ...(shot?.continuityNotes || [])].map(toText).join(" ");
        const allowsApproach = shot?.movementMode === "LOCOMOTION" || /\b(approach|approaches|approaching|walk\s+toward|walks\s+toward|move\s+closer|steps?\s+closer|mendekat|menghampiri|berjalan\s+ke|melangkah\s+mendekat|meraih|reach(?:es|ing)?|touch(?:es|ing)?|menyentuh|membuka|buka|mengangkat\s+tutup)\b/i.test(actionText);
        const actionProps = findMentionedLockedProps(shot, actionText);
        const actionMoverId = String(
            normalizeIdList(shot?.movingCharacterIds || [])[0]
            || normalizeIdList(shot?.characterIds || [])[0]
            || ""
        );
        if (allowsApproach) actionProps.forEach((prop) => {
            if (!actionMoverId) return;
            const key = `${actionMoverId}__${prop.id}`;
            if (seen.has(key)) return;
            seen.add(key);
            assignments.push({ kind: "action", characterId: actionMoverId, prop, lineIndex: -1 });
        });
        dialogue.forEach((line, index) => {
            const speakerId = toText(line?.characterId);
            findMentionedLockedProps(shot, line?.text).forEach((prop) => {
                if (!speakerId) return;
                const key = `${speakerId}__${prop.id}`;
                if (seen.has(key)) return;
                seen.add(key);
                assignments.push({ kind: "dialogue", characterId: speakerId, prop, lineIndex: index });
            });
        });
        return assignments;
    };
    const buildObjectApproachPlan = (shot) => {
        const assignments = getObjectApproachAssignments(shot);
        if (!assignments.length) {
            return {
                moverIds: [],
                enabled: false,
                text: [
                    "OBJECT APPROACH / WALK-TO-PROP PLAN:",
                    "- No explicit locked-prop approach requirement detected.",
                    "- If a locked prop is already within easy arm's reach, play the interaction in place rather than adding unnecessary locomotion.",
                ].join("\n"),
            };
        }
        const moverIds: string[] = Array.from(new Set<string>(assignments.map((item) => String(item.characterId)).filter(Boolean)));
        const lines = [
            "OBJECT APPROACH / WALK-TO-PROP PLAN:",
            "- If a referenced locked prop is visibly far from the speaking/acting character in frame 1, the assigned character may naturally walk a short distance toward that prop before or while interacting with it.",
            "- Only the assigned character may perform this approach movement. Other characters remain anchored unless the shot already explicitly allows their movement.",
            "- The approach path must be short, motivated, and physically valid inside the existing location. No teleporting, no sudden jump cuts, no sliding, and no clipping through people, furniture, walls, doors, or props.",
            "- If the prop is already close enough to touch from the starting position, do NOT invent extra walking. Use only head/eye/hand interaction.",
            "- The character should end close enough to the referenced prop for believable inspection, touching, opening, pointing, guarding, or dialogue-driven interaction.",
        ];
        assignments.forEach((item) => {
            const charName = characterMap.get(item.characterId)?.name || item.characterId;
            const prefix = item.kind === "dialogue" ? `- LINE_${item.lineIndex + 1}_APPROACH:` : "- ACTION_APPROACH:";
            lines.push(`${prefix} ${item.characterId} (${charName}) may walk toward ${item.prop.id} (${item.prop.name}) if that locked prop starts far away in frame 1. Keep the move short and purposeful; stop near the object and direct gaze/hands toward it.`);
        });
        return { moverIds, enabled: true, text: lines.join("\n") };
    };

    const buildDialogueBlockingPlan = (shot) => {
        const dialogue = Array.isArray(shot?.dialogue) ? shot.dialogue : [];
        const allIds = normalizeIdList(shot?.characterIds || []);
        const allowCameraAddress = /\b(kamera|camera|penonton|audience|viewer|vlog|selfie|langsung ke kamera|tatap kamera)\b/i.test(
            [shot?.action, ...dialogue.map((line) => line?.text)].map(toText).join(" ")
        );
        const previousDialogueShot = [...shots]
            .filter((item) =>
                item.id !== shot.id &&
                Number(item.episode) === Number(shot.episode) &&
                item.sceneId === shot.sceneId &&
                Number(item.shotNumber || 0) < Number(shot.shotNumber || 0) &&
                item.dialogue?.length
            )
            .sort((a, b) => Number(b.shotNumber || 0) - Number(a.shotNumber || 0))[0] || null;
        const previousShotSpeakerIds = normalizeIdList((previousDialogueShot?.dialogue || []).map((line) => line.characterId))
            .filter((id) => allIds.includes(id));
        const referencedTargetIds = normalizeIdList(shot?.referencedVisibleTargetIds || []).filter((id) => allIds.includes(id));

        if (!dialogue.length) {
            return allowCameraAddress
                ? "No dialogue. Direct camera gaze is allowed only at the exact scripted camera-address moment; otherwise keep natural action eyelines."
                : "No dialogue. Keep natural eyelines toward people/props/action targets. FORBIDDEN: front-facing presenter pose, selfie gaze, or staring into the lens.";
        }

        const linePlans = dialogue.map((line, index) => {
            const speakerId = toText(line?.characterId);
            const explicitTargetId = toText(line?.targetCharacterId || line?.listenerCharacterId || line?.targetId);
            const previousLineSpeakerId = index > 0 ? toText(dialogue[index - 1]?.characterId) : "";
            const nextLineSpeakerId = index + 1 < dialogue.length ? toText(dialogue[index + 1]?.characterId) : "";
            const targetCandidates = mergeIdLists(
                explicitTargetId && explicitTargetId !== speakerId && allIds.includes(explicitTargetId) ? [explicitTargetId] : [],
                referencedTargetIds.filter((id) => id !== speakerId),
                previousLineSpeakerId && previousLineSpeakerId !== speakerId ? [previousLineSpeakerId] : [],
                nextLineSpeakerId && nextLineSpeakerId !== speakerId ? [nextLineSpeakerId] : [],
                previousShotSpeakerIds.filter((id) => id !== speakerId),
                allIds.filter((id) => id !== speakerId),
            );
            const primaryTargetId = targetCandidates[0] || "";
            const speakerName = characterMap.get(speakerId)?.name || speakerId;
            const mentionedProps = findMentionedLockedProps(shot, line?.text);
            const primaryObject = mentionedProps[0] || null;
            const fallbackFocus = primaryObject ? `${primaryObject.id} (${primaryObject.name})` : "the situation/space in front of them";
            const targetLabel = primaryTargetId || (allIds.length <= 1 ? "NO_VISIBLE_LISTENER" : "VISIBLE_LISTENER");
            const targetName = characterMap.get(primaryTargetId)?.name || primaryTargetId || (targetLabel === "NO_VISIBLE_LISTENER" ? "no visible listener" : "visible listener");
            const intonationText = (line.intonations || []).length ? ` INTONATION: ${line.intonations.join(", ")}.` : "";
            const speechMode = line?.speechMode || ((Boolean(line?.innerSpeech) || isInnerSpeechText(line?.text || "")) ? "inner" : "spoken");
            const isInner = speechMode === "inner";
            const isMumble = speechMode === "mumble";

            if (isInner) {
                return [
                    `LINE_${index + 1}_SPEAKER_ID: ${speakerId}`,
                    `LINE_${index + 1}_INNER_SPEECH: TRUE`,
                    `LINE_${index + 1}_SPEECH_MODE: INNER_MONOLOGUE_VOICE_OVER`,
                    `LINE_${index + 1}_BLOCKING: ${speakerId} (${speakerName}) performs this line as INNER THOUGHT only. Mouth must stay closed and still: NO lip movement, NO jaw movement, NO whisper/mutter mouth, NO audible lip-synced delivery. NO projection toward any listener.${intonationText}`,
                    `LINE_${index + 1}_HEAD_EYES: ${speakerId}'s gaze may drift, lower, or settle on the situation/prop. Never stare into lens.`,
                    `LINE_${index + 1}_LISTENER_REACTION: other characters do NOT react as if hearing ${speakerId}, because this line is internal.`,
                ].filter(Boolean).join("\n");
            }

            if (isMumble) {
                return [
                    `LINE_${index + 1}_SPEAKER_ID: ${speakerId}`,
                    `LINE_${index + 1}_SPEECH_MODE: MUMBLE_UNDER_BREATH`,
                    `LINE_${index + 1}_BLOCKING: ${speakerId} (${speakerName}) MUTTERS this line under the breath, almost to self: lips move only slightly with minimal jaw movement, very low soft volume, partially swallowed and indistinct articulation. It IS audible as a quiet real murmur that matches the exact written words — NOT silent inner voice and NOT a clear projected line.${intonationText}`,
                    `LINE_${index + 1}_HEAD_EYES: ${speakerId}'s gaze stays low/inward or on the situation/prop; the line is not projected at a listener. Never stare into lens.`,
                    `LINE_${index + 1}_LISTENER_REACTION: other characters barely notice; at most a faint uncertain micro-reaction, no clear verbal response, unless standing extremely close.`,
                ].filter(Boolean).join("\n");
            }

            return [
                `LINE_${index + 1}_SPEAKER_ID: ${speakerId}`,
                `LINE_${index + 1}_TARGET_ID: ${targetLabel}`,
                `LINE_${index + 1}_OBJECT_ID: ${primaryObject?.id || "NONE"}`,
                (line.intonations || []).length ? `LINE_${index + 1}_INTONATION: ${line.intonations.join(", ")}` : "",
                primaryObject
                    ? `LINE_${index + 1}_BLOCKING: ${speakerId} (${speakerName}) explicitly mentions ${primaryObject.id} (${primaryObject.name}). The performance must read as object-aware speech: speaker primarily looks at or acknowledges ${primaryObject.id} while speaking this line${primaryTargetId ? `, then may briefly glance toward ${primaryTargetId}` : ""}.${intonationText}`
                    : primaryTargetId
                        ? `LINE_${index + 1}_BLOCKING: ${speakerId} (${speakerName}) must address ${primaryTargetId} (${targetName}).${intonationText}`
                        : `LINE_${index + 1}_BLOCKING: ${speakerId} (${speakerName}) has no visible listener in this shot; perform the line as private, grounded self-directed speech toward ${fallbackFocus}, never as narration to the audience.${intonationText}`,
                primaryObject
                    ? `LINE_${index + 1}_HEAD_EYES: rotate ${speakerId}'s head/face/eyes toward ${primaryObject.id} (${primaryObject.name}) for the object reference; do NOT keep the gaze on the camera.${primaryTargetId ? ` If needed, only a brief secondary glance may go to ${primaryTargetId}.` : ""}`
                    : primaryTargetId
                        ? `LINE_${index + 1}_HEAD_EYES: rotate ${speakerId}'s head/face/eyes toward ${primaryTargetId}; the eye line must visibly terminate on that person, not on the camera.`
                        : `LINE_${index + 1}_HEAD_EYES: ${speakerId}'s gaze may lower, look across the room, or glance toward the situation/prop area, but must NOT stare into camera or imply an invisible listener.`,
                primaryObject
                    ? `LINE_${index + 1}_BODY_ANGLE: angle ${speakerId}'s shoulders/torso enough to read that ${primaryObject.id} is the current attention target while preserving natural scene blocking. Avoid square-to-camera portrait staging.`
                    : primaryTargetId
                        ? `LINE_${index + 1}_BODY_ANGLE: angle ${speakerId}'s shoulders/torso toward ${primaryTargetId} enough to read as a real conversation; avoid square-to-camera portrait staging.`
                        : `LINE_${index + 1}_BODY_ANGLE: use a natural private-thinking/self-directed body angle; avoid square-to-camera portrait or presenter staging.`,
                primaryTargetId
                    ? `LINE_${index + 1}_LISTENER_REACTION: ${primaryTargetId} (${targetName}) looks/reacts toward ${speakerId} with a natural reciprocal eyeline.`
                    : `LINE_${index + 1}_LISTENER_REACTION: keep natural reaction blocking without camera gaze.`,
            ].filter(Boolean).join("\n");
        });

        const firstSpeakerId = toText(dialogue[0]?.characterId);
        const firstTargetMatch = linePlans[0]?.match(/LINE_1_TARGET_ID:\s*([A-Z0-9_]+)/i);
        const firstTargetToken = firstTargetMatch?.[1] || "";
        const firstTargetId = firstTargetToken && !["VISIBLE_LISTENER", "NO_VISIBLE_LISTENER"].includes(firstTargetToken)
            ? firstTargetMatch[1]
            : "";
        const firstSpeakerName = characterMap.get(firstSpeakerId)?.name || firstSpeakerId;
        const firstTargetName = characterMap.get(firstTargetId)?.name || firstTargetId || (firstTargetToken === "NO_VISIBLE_LISTENER" ? "no visible listener" : "visible listener");
        const anchorTargetLabel = firstTargetId || firstTargetToken || "VISIBLE_LISTENER";
        const anchorEyelineText = firstTargetToken === "NO_VISIBLE_LISTENER"
            ? `${firstSpeakerId || "the speaker"} (${firstSpeakerName}) using a private, grounded self-directed eyeline toward the situation/space or referenced prop, not toward camera`
            : `${firstSpeakerId || "the speaker"} (${firstSpeakerName}) looking at ${firstTargetId || "the visible listener"} (${firstTargetName}) or at the explicitly referenced locked object for the first dialogue line when object focus is specified`;
        const hasInnerSpeech = dialogue.some((line) => Boolean(line?.innerSpeech) || isInnerSpeechText(line?.text || ""));

        return joinLines([
            `ANCHOR_START_SPEAKER_ID: ${firstSpeakerId || "NONE"}`,
            `ANCHOR_START_TARGET_ID: ${anchorTargetLabel}`,
            `ANCHOR_START_EYELINE_HARD_LOCK: frame 1 must already show ${anchorEyelineText}.`,
            "HARD BLOCKING PRIORITY: dialogue eyeline overrides pretty/front-facing composition. The camera is an observer, never the conversational target unless camera-address is explicitly scripted.",
            "FORBIDDEN: all characters facing forward, all faces parallel to camera, speaker staring into lens, listener staring into lens, generic posed group portrait, presenter/interview/selfie staging.",
            hasInnerSpeech
                ? "INNER SPEECH LOCK: lines marked INNER_SPEECH=TRUE are voice-over/inner-thought. Lip-sync is disabled for those lines; the character does NOT speak audibly and other characters do NOT react as if hearing them."
                : "",
            firstTargetToken === "NO_VISIBLE_LISTENER"
                ? "Single-character dialogue uses private, situation/object-aware eyeline and body angle. Do not invent an unseen listener and do not turn it into direct camera narration."
                : "Use a natural conversational triangle: speaker head + eyes + shoulders aim toward listener; listener head/eyes return toward speaker. Keep the 180-degree screen axis and established left/right order.",
            ...linePlans,
            allowCameraAddress
                ? "Direct camera gaze is permitted only for the exact scripted camera-address beat; all other lines use speaker-to-listener eyelines."
                : "ABSOLUTE NO-CAMERA-GAZE LOCK: no character may use direct-to-camera delivery for dialogue.",
        ]);
    };

    const buildAnchorPerformancePlan = (shot) => {
        const dialogue = Array.isArray(shot?.dialogue) ? shot.dialogue : [];
        const castIds = normalizeIdList(shot?.characterIds || []);
        const actionText = [shot?.action, shot?.continuitySetup, ...(shot?.continuityNotes || [])].map(toText).join(" ");
        const dialogueText = dialogue.map((line) => toText(line?.text)).join(" ");
        const combined = `${actionText} ${dialogueText}`;
        const mentionedProps = findMentionedLockedProps(shot, combined);
        const seed = stableHashNumber(`${shot?.id || ""}|${shot?.sceneId || ""}|${toText(shot?.action)}`);
        const observerAngle = pickStable([
            "three-quarter observer angle from slightly beside the conversation, not a straight-on portrait",
            "subtle over-the-shoulder conversational angle while keeping required faces readable",
            "candid side-biased drama angle with bodies angled into the scene",
            "medium documentary angle from the action side, as if the camera is witnessing the beat",
        ], seed);
        const lensMood = pickStable([
            "natural handheld microdrama still, modest headroom, no posed symmetry",
            "grounded live-action frame with slight body asymmetry and real conversation spacing",
            "quiet cinematic coverage with actor and prop/action zone dominant in frame",
            "realistic Indonesian drama staging with natural pauses, glances, and hand placement",
        ], Math.floor(seed / 7));
        const lines = [
            "ANCHOR PERFORMANCE / SCRIPT-SPECIFIC REALISM PLAN:",
            `- SHOT_VISUAL_SIGNATURE: ${observerAngle}; ${lensMood}. This signature is specific to this shot and must not collapse into the same repeated generic front-facing image.`,
            "- This anchor is frame 1 of the acted scene. It must already feel like the script moment is happening, not like a character reference portrait.",
            "- Do NOT line all characters flat to camera. Avoid front-facing ID-photo, presenter, interview, selfie, catalog, or fashion-pose staging unless direct camera address is explicitly scripted.",
            "- Preserve full required-character visibility and identity, but use natural 3/4 body turns, shoulder angles, head angles, reciprocal glances, and believable hand placement.",
        ];

        if (dialogue.length) {
            const firstLine = dialogue[0];
            const firstSpeakerId = toText(firstLine?.characterId);
            const explicitTargetId = toText(firstLine?.targetCharacterId);
            const fallbackTargetId = castIds.find((id) => id !== firstSpeakerId) || "";
            const targetId = explicitTargetId && explicitTargetId !== firstSpeakerId ? explicitTargetId : fallbackTargetId;
            const firstSpeakerName = characterMap.get(firstSpeakerId)?.name || firstSpeakerId || "speaker";
            const targetName = characterMap.get(targetId)?.name || targetId || "visible listener";
            const firstLineProps = findMentionedLockedProps(shot, firstLine?.text);
            const firstIsInner = Boolean(firstLine?.innerSpeech) || isInnerSpeechText(firstLine?.text || "");
            lines.push(firstIsInner
                ? `- FIRST_DIALOGUE_FRAME (INNER VOICE): ${firstSpeakerId || "speaker"} (${firstSpeakerName}) is silently thinking / murmuring to self. Mouth closed or barely parted; body may turn slightly away; not addressing the listener.`
                : `- FIRST_DIALOGUE_FRAME: ${firstSpeakerId || "speaker"} (${firstSpeakerName}) is already about to speak or has just begun speaking. Mouth may be slightly parted, jaw relaxed, expression matches the line emotion${(firstLine?.intonations || []).length ? ` (intonation: ${(firstLine.intonations || []).join(", ")})` : ""}, and body is oriented toward ${firstLineProps[0]?.id || targetId || "the listener/action target"}.`);
            if (targetId && !firstIsInner) lines.push(`- LISTENER_BLOCKING: ${targetId} (${targetName}) naturally reacts toward ${firstSpeakerId || "the speaker"}; do not make both people stare into the lens.`);
            if (firstLineProps.length) {
                lines.push(`- OBJECT-AWARE_DIALOGUE: the first line references ${firstLineProps.map((prop) => `${prop.id} (${prop.name})`).join(", ")}. Speaker gaze/hand/body attention should acknowledge that object first, then the listener if needed.`);
            }
            lines.push("- Dialogue staging should read as human conversation: imperfect body angles, listener reaction, subtle emotion, no frozen neutral front-facing faces.");
        } else {
            lines.push("- NO_DIALOGUE_FRAME: use action-driven candid staging. Character gaze, hands, torso, and weight shift should follow the written action or prop interaction, not the camera.");
        }

        if (mentionedProps.length) {
            lines.push(`- SCRIPT_PROP_FOCUS: ${mentionedProps.map((prop) => `${prop.id} (${prop.name})`).join(", ")} must be integrated into the action blocking. If the script says opening, inspecting, touching, holding, or showing contents, that state must be visible in this still.`);
        }
        if (hasPropOpenIntent(combined) || hasPropContentsVisibleIntent(combined) || hasPropInspectionIntent(combined)) {
            lines.push("- PROP_ACTION_BEAT: show the written prop action/state clearly enough that a viewer understands it without reading the prompt. Only show an opened/contents-visible prop when the current action or continuity explicitly requires that state.");
        }
        if (/\b(marah|kesal|menangis|sedih|takut|cemas|terkejut|shock|hina|jijik|sombong|sinis|tertawa|mengejek|memohon)\b/i.test(combined.toLowerCase())) {
            lines.push("- EMOTION_BEAT: facial expression and posture should carry the scripted emotion in a restrained realistic way, not a blank neutral production pose.");
        }
        lines.push("- Continuity references guide identity, wardrobe, location, and prop placement; they are not allowed to overwrite this shot's current action/performance blocking.");
        return lines.join("\n");
    };

    const inferPhysicalPosture = (text = "") => {
        const raw = toText(text).toLowerCase();
        const matches = {
            kneeling: /\b(?:kneel|kneels|kneeling|on knees|on one knee|berlutut|lutut|bersimpuh|sujud)\b/i.test(raw),
            crouching: /\b(?:crouch|crouches|crouching|squat|squats|squatting|jongkok|berjongkok)\b/i.test(raw),
            seated: /\b(?:seated|sitting|sits|sit|duduk|terduduk|remains seated|tetap duduk)\b/i.test(raw),
            standing: /\b(?:standing|stands|stand|berdiri|remains standing|tetap berdiri)\b/i.test(raw),
            lying: /\b(?:lying|lies|laying|terbaring|berbaring|rebah)\b/i.test(raw),
        };
        const priority = ["kneeling", "crouching", "lying", "seated", "standing"];
        return priority.find((key) => matches[key]) || "";
    };
    const postureDirective = (posture = "") => {
        if (posture === "kneeling") return "POSTURE=KNEELING — HARD LOCK. At least one knee must visibly touch the ground/floor/step. Body height is lower than standing. Feet/legs fold naturally under or behind the body. DO NOT stand, sit on a chair, or crouch without knee contact. If the source says left/right of a prop, keep that side while kneeling.";
        if (posture === "crouching") return "POSTURE=CROUCHING — HARD LOCK. Body is low with bent knees and weight on feet, not seated on furniture and not kneeling unless the source explicitly says kneeling. DO NOT stand upright.";
        if (posture === "lying") return "POSTURE=LYING — HARD LOCK. Body is visibly horizontal/reclined with torso supported by ground/bed/floor. DO NOT stand, sit, kneel, or crouch.";
        if (posture === "seated") return "POSTURE=SEATED — HARD LOCK. Hips/pelvis MUST be visibly supported by a chair/bench/floor seat. Torso stays at seated height, knees are bent, thighs are parallel to floor. DO NOT stand, half-stand, rise, straighten legs, kneel, or place the body at standing height.";
        if (posture === "standing") return "POSTURE=STANDING — HARD LOCK. Weight is supported by feet at standing height. Knees mostly extended, torso vertical. Full legs/feet should be readable whenever framing permits. DO NOT sit, sit cross-legged, kneel, crouch, squat, lean into a seat, hide folded legs behind a prop, rest hips on/behind a prop, or lower the body into a non-standing posture.";
        return "POSTURE=ACTION_DERIVED. If the current shot action/continuity implies interacting with a person, prop, or location feature, derive a natural present-time body pose from the CURRENT ACTION. Do not blindly copy the PREVIOUS_CONTINUITY_ANCHOR posture. If no posture is implied, standing is acceptable.";
    };
    const buildCompactCharacterStateContract = (shot) => {
        const full = buildCharacterStateLock(shot);
        return normalizeIdList(shot?.characterIds || []).map((id) => {
            const character = characterMap.get(id);
            const line = full.split("\n").find((row) => row.startsWith(`- ${id} `)) || "";
            const posture = line.match(/POSTURE=([A-Z_]+)/)?.[1] || "ACTION_DERIVED";
            const source = limitText((line.match(/SOURCE STATE:\s*(.*?)(?:\.\sPOSTURE=|\.\sACTION-DRIVEN|\.\sACTIVITY=|$)/)?.[1] || toText(shot?.continuitySetup) || toText(shot?.action)), 260);
            return `- ${id} (${character?.name || id}): ${posture}. ${source ? `SOURCE: ${source}. ` : ""}${posture === "KNEELING" ? "MUST show knee contact with the ground/floor/step; do not render standing." : ""}${posture === "CROUCHING" ? "MUST show low bent-knee body weight on feet; do not render standing." : ""}${posture === "SEATED" ? "MUST show supported hips and bent knees; do not render standing/kneeling." : ""}${posture === "STANDING" ? "MUST show standing height, feet support, and extended legs; do not render seated, cross-legged, kneeling, crouching, or hidden folded legs behind a prop." : ""}`;
        }).join("\n");
    };
    const buildCharacterStateLock = (shot) => {
        const clauses = [
            toText(shot?.continuitySetup),
            ...(shot?.continuityNotes || []).map(toText),
            toText(shot?.action),
        ]
            .join("; ")
            .split(/[;\n]+/)
            .map((item) => item.trim())
            .filter(Boolean);

        const globalText = clauses.join(" ").toLowerCase();
        const globalSeated = /\b(?:all|everyone|semua|mereka)\b[^.;\n]{0,80}\b(?:seated|sitting|duduk|terduduk)\b/i.test(globalText);
        const globalStanding = /\b(?:all|everyone|semua|mereka)\b[^.;\n]{0,80}\b(?:standing|berdiri)\b/i.test(globalText);
        const globalKneeling = /\b(?:all|everyone|semua|mereka)\b[^.;\n]{0,80}\b(?:kneeling|kneel|berlutut|bersimpuh|sujud)\b/i.test(globalText);
        const globalCrouching = /\b(?:all|everyone|semua|mereka)\b[^.;\n]{0,80}\b(?:crouching|crouch|squat|jongkok)\b/i.test(globalText);
        const globalLying = /\b(?:all|everyone|semua|mereka)\b[^.;\n]{0,80}\b(?:lying|terbaring|berbaring|rebah)\b/i.test(globalText);

        const rows = normalizeIdList(shot?.characterIds || []).map((id) => {
            const character = characterMap.get(id);
            const name = toText(character?.name);
            const aliases = [id, name].map((item) => item.toLowerCase()).filter(Boolean);
            const relevant = clauses.filter((clause) => {
                const lowerClause = clause.toLowerCase();
                return aliases.some((alias) => lowerClause.includes(alias));
            });
            const stateText = relevant.join("; ");
            const searchable = `${stateText} ${globalKneeling ? " kneeling " : ""} ${globalCrouching ? " crouching " : ""} ${globalLying ? " lying " : ""} ${globalSeated ? " seated " : ""} ${globalStanding ? " standing " : ""}`.toLowerCase();
            const directives: string[] = [];

            directives.push(postureDirective(inferPhysicalPosture(searchable)));

            if (/\b(?:eating|makan|menyantap)\b/i.test(searchable)) {
                directives.push("ACTIVITY=EATING. Preserve eating state and tableware/food interaction; do not convert into idle posing.");
            }
            if (/\b(?:holding|holds|memegang|membawa)\b/i.test(searchable)) {
                directives.push("HAND_STATE=LOCKED. Preserve required held-object state unless ACTION explicitly releases/transfers it.");
            }
            if (/\b(?:watching|looking at|menatap|melihat|memperhatikan)\b/i.test(searchable)) {
                directives.push("GAZE_STATE=LOCKED to the described person/action target; do not default to camera gaze.");
            }

            return `- ${id} (${name || id}): ${stateText ? `SOURCE STATE: ${stateText}. ` : ""}${directives.join(" ")}`;
        });

        return joinLines([
            "PER-CHARACTER PHYSICAL STATE CONTRACT:",
            ...rows,
            "STATE PRIORITY RULE: physical continuity state overrides portrait aesthetics, symmetry, camera-facing poses, and convenience.",
            "STATE CONFLICT RULE: if PREVIOUS_CONTINUITY_ANCHOR contradicts the SOURCE STATE or CURRENT ACTION STAGING above for a character, the CURRENT SHOT REQUIREMENT WINS for that character. Never copy a contradictory posture from the anchor image.",
            "STATE RENDERING RULE: KNEELING requires visible knee contact with ground/floor/step; CROUCHING requires low bent-knee body weight on feet; SEATED requires visible seat/ground support under hips and bent knees; STANDING requires standing-height feet support.",
            "ACTION STAGING RULE: QA and generation must judge pose/position against the CURRENT SHOT ACTION first. PREVIOUS_CONTINUITY_ANCHOR provides continuity context, not a frozen pose template.",
        ]);
    };

    // ============================================================================
    // DIRECTOR CONTROLS PROMPT FRAGMENTS
    // ============================================================================
    const buildDirectorCharacterDirectionText = (shot) => {
        const castIds = normalizeIdList(shot?.characterIds || []);
        if (!castIds.length) return "PER-CHARACTER DIRECTION: (no cast)";
        const directions = normalizeCharacterDirections(shot?.characterDirections, castIds);
        const lines = [
            "PER-CHARACTER DIRECTION (each actor has an individual performance brief for this shot):",
            "Each USER FREE-TEXT SCENE PROMPT is an actor-specific staging instruction. Preserve the user's wording and relationships as much as possible.",
            "The prompt may reference other visible characters with @ID or @name (example: @jaka ... @siti). Resolve those mentions to the approved cast below. Never create an extra human because of an @mention.",
            "Quoted text inside a per-character scene prompt (\"...\" or '...') is the character's DIALOGUE for this shot. Perform it exactly as written.",
            "If the prompt uses words like dalam hati / membatin / inner / @membatin, that dialogue is INNER VOICE (voice-over, no lip-sync, not heard by others).",
            "If the prompt uses words like bergumam / menggumam / mutter / murmur / @bergumam, that dialogue is MUMBLED UNDER THE BREATH: audible as a quiet murmur with slight lip movement, NOT silent and NOT a clear projected line.",
            "The TALK TO target on each direction is the DEFAULT dialogue listener for that character's line. It overrides vague mentions.",
            "GLOBAL HARD LOCKS still win over actor prompts: exact cast, identity, wardrobe, location, prop locks, safety, framing, and physically possible anatomy/motion.",
        ];
        directions.forEach((dir) => {
            const character = characterMap.get(dir.characterId);
            const name = character?.name || dir.characterId;
            const targetChar = dir.talkTargetId ? characterMap.get(dir.talkTargetId) : null;
            const targetName = targetChar?.name || dir.talkTargetId || "";
            const talkLine = dir.talkTargetId
                ? `PRIMARY DIALOGUE LISTENER: ${dir.talkTargetId} (${targetName}). Unless the prompt names a different listener explicitly, this character speaks toward ${dir.talkTargetId}.`
                : "PRIMARY DIALOGUE LISTENER: not set — if this character has a quoted line without an explicit on-screen listener, treat it as private/self-directed, never as camera narration.";
            const focusLine = dir.cameraFocus
                ? `CAMERA FOCUS PRIORITY: while ${dir.characterId} performs, the camera should prioritize holding on ${dir.characterId}.`
                : `CAMERA FOCUS PRIORITY: normal — do not force extra coverage on ${dir.characterId}.`;
            const actionLine = toText(dir.action)
                ? `Legacy action field: ${toText(dir.action)}`
                : "Legacy action field: not set — use the USER FREE-TEXT SCENE PROMPT and shot ACTION.";
            const scenePrompt = limitCharacterScenePromptText(dir.scenePrompt, CHARACTER_SCENE_PROMPT_MAX_CHARS);
            const mentionedTokens = extractCharacterMentionTokens(scenePrompt);
            const quotedLines = extractDialogueLinesFromPrompt(scenePrompt);
            const dirIntonations = extractTaggedTokens(scenePrompt, INTONATION_TAG_REGEX).filter((tag) => isKnownIntonationTag(tag));
            const dirTagMode = speechModeFromIntonations(dirIntonations);
            const dirMode = dirTagMode !== "spoken"
                ? dirTagMode
                : (isInnerSpeechText(scenePrompt) ? "inner" : (isMumbleText(scenePrompt) ? "mumble" : "spoken"));
            const isInner = dirMode === "inner";
            const isMumble = dirMode === "mumble";
            const mentionLines = mentionedTokens
                .filter((token) => !isKnownIntonationTag(token))
                .map((token) => {
                    const matches = castIds.filter((id) => {
                        const candidate = characterMap.get(id);
                        return characterMentionAliases(candidate).includes(normalizeMentionKey(token));
                    });
                    if (matches.length === 1) {
                        const matched = matches[0];
                        return `@${token} => ${matched} (${characterMap.get(matched)?.name || matched})`;
                    }
                    if (matches.length > 1) {
                        return `@${token} => AMBIGUOUS (${matches.join(", ")}); resolve from context without creating a new person`;
                    }
                    return `@${token} => UNRESOLVED CAST MENTION; do not create a new person`;
                });
            const dialogueLine = quotedLines.length
                ? `DIALOGUE FOR ${dir.characterId} (${quotedLines.length} line(s))${isInner ? " [INNER VOICE]" : isMumble ? " [MUMBLE]" : ""}:\n${quotedLines.map((line, i) => `- DIALOGUE_${i + 1}: "${line}"`).join("\n")}`
                : `DIALOGUE FOR ${dir.characterId}: NONE (this character does not speak in this shot).`;
            const promptBlock = scenePrompt
                ? [
                    "USER FREE-TEXT SCENE PROMPT FOR THIS CHARACTER (follow literally within the global locks):",
                    scenePrompt,
                    mentionLines.length ? `MENTION RESOLUTION:\n${mentionLines.map((line) => `- ${line}`).join("\n")}` : "MENTION RESOLUTION: none",
                    dialogueLine,
                    isInner ? "SPEECH MODE: INNER VOICE (voice-over) — no audible lip-sync; other characters do NOT hear this line." : "",
                    isMumble ? "SPEECH MODE: MUMBLE UNDER BREATH — audible quiet murmur with slight lip movement; low soft volume; other characters barely notice and do not clearly respond." : "",
                ].filter(Boolean).join("\n")
                : "USER FREE-TEXT SCENE PROMPT FOR THIS CHARACTER: not set — use the shot ACTION as the actor's main staging instruction.";
            lines.push([
                `- ${dir.characterId} (${name})`,
                actionLine,
                talkLine,
                focusLine,
                promptBlock,
            ].join("\n"));
        });
        lines.push("Do not swap actor assignments. Do not convert a character's free-text prompt into a generic pose if the prompt describes a specific interaction, target, object, effect, or reaction.");
        return lines.join("\n");
    };

    // Enforcement KERAS untuk CAMERA SCRIPT tulisan user. Hanya aktif bila user mengisi script.
    // Script ini WAJIB diikuti video dan MENGALAHKAN default framing (wide/subject-scale) generik.
    const buildUserCameraScriptEnforcement = (shot) => {
        const script = resolveMentionsInFreeText(toText(shot?.cameraScript), shot);
        if (!script) return "";
        return [
            "==================================================",
            "USER CAMERA SCRIPT — HARD ENFORCEMENT (HIGHEST CAMERA AUTHORITY)",
            "==================================================",
            "The following CAMERA SCRIPT was written by the director and is MANDATORY. The generated video MUST obey it literally and exactly.",
            "This USER CAMERA SCRIPT OVERRIDES every generic/default framing rule (including default wide framing, subject-scale defaults, headroom defaults, and automatic composition). When the script and a default rule disagree, FOLLOW THE SCRIPT.",
            "",
            "CAMERA SCRIPT (verbatim):",
            script,
            "",
            "INTERPRET SHOT-SIZE / FRAMING TERMS EXACTLY AS WRITTEN:",
            "- 'close-up' / 'close up' / 'wajah' = tight shot on the face/head and shoulders.",
            "- 'setengah badan' / 'half body' / 'medium shot' / 'medium close-up' = frame from roughly the waist (or chest) up; the named character fills a large readable portion of the frame.",
            "- 'full body' / 'seluruh badan' / 'wide' / 'lebar' = whole body head-to-toe with environment visible.",
            "- 'fokus ke X' / 'focus on X' = make X the clear subject of the frame at the requested shot size; keep X sharp and dominant for that beat.",
            "- If the script says to follow / track / ikuti a MOVING character (e.g., while walking/berjalan), the camera must MOVE WITH that character at the specified shot size so the subject stays framed consistently during the motion.",
            "- Timecodes like (0-3s)/(3-6s) define WHEN each camera beat happens; execute them in order within the exact VIDEO_LENGTH.",
            "- 'cut' / 'cutaway' are allowed only if CUTAWAY PERMISSION is ENABLED; otherwise achieve the same intent with pan/tilt/rack-focus/reframe inside the SAME location.",
            "",
            "ABSOLUTE: Do NOT ignore, soften, simplify, average out, or substitute these camera instructions with a generic static front shot. If a requested shot size conflicts with the generic 'wide / don't dominate frame' default, the SCRIPT WINS and the subject may fill the frame as the script requires.",
        ].join("\n");
    };

    const buildDirectorCameraScriptText = (shot) => {
        const script = resolveMentionsInFreeText(toText(shot?.cameraScript), shot);
        const enforcement = buildCameraEnforcementText(shot);
        const cutawayLine = shot?.allowCutaway
            ? "CUTAWAY PERMISSION: ENABLED — the camera MAY briefly cut away from the primary action to show other parts of the SAME locked location (surroundings, environment, corridor, furniture, sky, empty street, objects, weather within the same location) for establishing / pacing / reaction beats, then cut back to the primary action. All cutaways MUST stay inside the same locked location and same time-of-day; no new location, no new people, no time jump."
            : "CUTAWAY PERMISSION: DISABLED — one continuous take, no cuts, no cutaways to other parts of the location.";
        const flexibilityLine = shot?.allowSceneFlexibility
            ? "SCENE FLEXIBILITY: ENABLED — the camera may pull back / widen / reframe to show the location surroundings of the SAME locked location for atmosphere or establishing beats. Still one location and one time."
            : "SCENE FLEXIBILITY: DISABLED — keep the framing anchored to the current continuity setup.";
        return [
            enforcement,
            cutawayLine,
            flexibilityLine,
            script
                ? `DIRECTOR CAMERA SCRIPT (highest priority — follow this literally):\n${script}\nFollow this script step by step. Example: focus camera on A while A speaks, then when A finishes pan/cut to B, then B speaks, then return to A. Use cuts only if CUTAWAY PERMISSION is ENABLED; otherwise achieve it with pans/tilts/rack-focus inside the same location.`
                : "DIRECTOR CAMERA SCRIPT: not set — use CAMERA MOVEMENT ENFORCEMENT rules above.",
        ].join("\n");
    };

    const buildCinematicDialogueCoveragePlan = (shot) => {
        const dialogue = Array.isArray(shot?.dialogue) ? shot.dialogue : [];
        const allIds = normalizeIdList(shot?.characterIds || []);
        const immediateStart = "NO_STILL_IMAGE_DELAY: start acting on frame 1. The first frame is the visual source, not a frozen hold; begin with breathing, eye movement, expression, and the first required action/dialogue immediately.";
        const seed = stableHashNumber(`${shot?.id || ""}|${shot?.episode || ""}|${shot?.shotNumber || ""}|${toText(shot?.camera)}`);
        const selectedCoverage = pickStable([
            "locked-off observer coverage; let actors' eyelines, hands, and reactions carry the beat",
            "side-biased conversational coverage; camera holds the existing angle with tiny handheld breath",
            "gentle pan-only coverage between speaker and listener; no forward dolly",
            "subtle rack-focus coverage inside the same composition; no camera travel",
            "three-quarter action-side coverage that keeps the prop/listener readable",
            "small lateral drift along the existing camera axis; do not move closer to the face",
        ], seed);
        const cameraContinuity = Number(shot?.episode || 1) > 1
            ? "EPISODE_CONTINUITY_CAMERA: start from the latest approved anchor/camera axis. Do NOT restart with a new front-facing intro angle. Do NOT default to a push-in toward the character. Continue the current spatial viewpoint unless ACTION explicitly relocates the scene."
            : "EPISODE_1_CAMERA: an establishing or front-readable angle is allowed, but do not turn every dialogue shot into the same straight-front push-in.";
        if (!dialogue.length) {
            return joinLines([
                immediateStart,
                cameraContinuity,
                `CAMERA_COVERAGE_PATTERN: ${selectedCoverage}. Use subtle motivated camera life only if it helps the action. Do not create a dead still-image pause.`,
                "NO_STIFF_REFERENCE_POSE: even without dialogue, body angle, shoulder angle, head direction, gaze, and hands follow the written action/context. Do not force characters to face front just because their master reference faces front.",
                "FINAL_FRAME_LOCK: end on the last natural action/reaction pose. Do not reset head, body, gaze, hands, or facial expression back to the first frame or front-facing reference pose.",
            ]);
        }
        const linePlans = dialogue.map((line, index) => {
            const speaker = characterMap.get(line.characterId);
            const explicitTargetId = toText(line.targetCharacterId);
            const listenerIds = explicitTargetId && allIds.includes(explicitTargetId) && explicitTargetId !== line.characterId
                ? [explicitTargetId]
                : allIds.filter((id) => id !== line.characterId);
            const listenerText = listenerIds.map((id) => `${id} (${characterMap.get(id)?.name || id})`).join(", ") || "the visible listener/target";
            const mentionedProps = findMentionedLockedProps(shot, line?.text);
            const primaryObject = mentionedProps[0] || null;
            const intonationNote = (line.intonations || []).length ? ` Intonation: ${(line.intonations || []).join(", ")}.` : "";
            const lineMode = line?.speechMode || ((Boolean(line?.innerSpeech) || isInnerSpeechText(line?.text || "")) ? "inner" : "spoken");
            const isInner = lineMode === "inner";
            if (isInner) {
                return `LINE_${index + 1} COVERAGE (INNER VOICE): ${line.characterId} (${speaker?.name || line.characterId}) is thinking silently.${intonationNote} Camera may hold on ${line.characterId}'s face for a restrained thinking expression. Mouth stays closed or barely parted. Do not lip-sync. Do not let other characters react as if hearing the line.`;
            }
            if (lineMode === "mumble") {
                return `LINE_${index + 1} COVERAGE (MUMBLE / UNDER BREATH): ${line.characterId} (${speaker?.name || line.characterId}) mutters the exact line very quietly under the breath — lips move only slightly, minimal jaw motion, low soft swallowed volume, audible as a faint murmur (NOT silent, NOT a clear projected line).${intonationNote} Camera may hold close on ${line.characterId}. Other characters barely notice and do not clearly respond.`;
            }
            return primaryObject
                ? `LINE_${index + 1} COVERAGE: ${line.characterId} (${speaker?.name || line.characterId}) speaks naturally about ${primaryObject.id} (${primaryObject.name}) from the existing camera angle.${intonationNote} Keep their face, eyes, mouth, head direction, hair color, outfit, and hands stable. The speaker must visibly orient their eyeline toward ${primaryObject.id} for the object mention, then may briefly glance toward ${listenerText}; never stare into the lens. Keep ${primaryObject.id} visible/readable in frame if possible. After the final word, hold, gently pan, or rack focus for a natural reaction beat without inventing extra props. Do not force a push-in.`
                : `LINE_${index + 1} COVERAGE: ${line.characterId} (${speaker?.name || line.characterId}) speaks from the current continuity angle.${intonationNote} Keep their face, eyes, mouth, head direction, hair color, outfit, and hands stable. The speaking eyeline stays on ${listenerText}, never the lens unless scripted. After the final word, hold, gently pan/reframe, or rack focus inside the same continuous shot to ${listenerText} for a readable reaction beat. Do not snap anyone back to a front-facing reference pose. Do not force a push-in.`;
        });
        return joinLines([
            immediateStart,
            cameraContinuity,
            `DIALOGUE_COVERAGE_STYLE: ${selectedCoverage}. Avoid distant global coverage when only one person is speaking, but do not default to straight-front camera or automatic dolly-in.`,
            "CAMERA_MOVEMENT_ALLOWED: one continuous in-location camera behavior only: locked-off hold, small pan, tilt, handheld breath, rack focus, gentle reframe, or tiny lateral drift. Push-in is optional and rare, never the default. Do not cut to a new place, do not time-jump, and do not introduce a new angle that changes spatial continuity.",
            "The camera starts from the supplied anchor/latest continuity frame. Preserve the same room/alley geometry and screen direction; episode continuation should feel like the next moment from the latest camera position, not a fresh front-facing restart.",
            "FINAL_FRAME_LOCK: the clip ends on the last reaction/eyeline/head direction created by the dialogue coverage. Never reset to the first-frame pose, never return everyone to looking straight forward, and never re-freeze into the reference image.",
            ...linePlans,
        ]);
    };
    const compileMasterPrompt = (shot) => {
        const cast = shot.characterIds.map((id) => {
            const character = characterMap.get(id);
            if (!character) throw new Error(`CHARACTER_NOT_FOUND_${id}`);
            return character;
        });
        const location = locationMap.get(shot.locationId);
        if (!location) throw new Error(`LOCATION_NOT_FOUND_${shot.locationId}`);
        const usedProps = shot.propIds.map((id) => {
            const prop = propMap.get(id);
            if (!prop) throw new Error(`PROP_NOT_FOUND_${id}`);
            return prop;
        });
        const uniqueIds = new Set(shot.characterIds);
        if (uniqueIds.size !== shot.characterIds.length) throw new Error(`DUPLICATE_CHARACTER_ID_${shot.id}`);
        if (shot.expectedHumanCount !== shot.characterIds.length) throw new Error(`HUMAN_COUNT_MISMATCH_${shot.id}`);
        const characterText = cast.length ? cast.map((character, index) => `
CHARACTER_SLOT_${index + 1}
ID: ${character.id}
NAME: ${character.name}
ROLE: ${character.role || ""}
AGE: ${character.identity?.age || ""}
GENDER: ${character.identity?.gender || ""}
ETHNICITY: ${character.identity?.ethnicity || ""}
FACE: ${character.identity?.face || ""}
EYES: ${character.identity?.eyes || ""}
NOSE: ${character.identity?.nose || ""}
LIPS: ${character.identity?.lips || ""}
HAIR: ${character.identity?.hair || ""}
SKIN: ${character.identity?.skin || ""}
BODY: ${character.identity?.body || ""}
DISTINGUISHING_MARKS: ${character.identity?.distinguishingMarks || "None"}
LOCKED_OUTFIT: ${character.costume?.outfit || ""}
LOCKED_ACCESSORIES: ${character.costume?.accessories || "None"}
REFERENCE_RULE: This ID represents exactly ONE unique person. Preserve the same face, age, ethnicity, hairstyle, skin tone, body proportions, costume and accessories. Never duplicate or clone this person. Locked wardrobe is part of identity and must not change in image or video.
`.trim()).join("\n\n") : "NO HUMAN CHARACTER";
        const propText = usedProps.length ? usedProps.map((prop) => `
PROP_ID: ${prop.id}
NAME: ${prop.name}
DESCRIPTION: ${prop.description || ""}
APPEARANCE: ${prop.appearance || ""}
`.trim()).join("\n\n") : "NONE";
        const dialogueText = shot.dialogue?.length ? shot.dialogue.map((line) => {
            const speaker = characterMap.get(line.characterId);
            const intonation = (line.intonations || []).length ? ` [intonation: ${(line.intonations || []).join(", ")}]` : "";
            const dispMode = (line as any)?.speechMode || ((line as any)?.innerSpeech ? "inner" : "spoken");
            const innerTag = dispMode === "inner" ? " [INNER VOICE]" : dispMode === "mumble" ? " [MUMBLE]" : "";
            return `${line.characterId} (${speaker?.name || line.characterId}): "${toText(line.text)}"${intonation}${innerTag}`;
        }).join("\n") : "NO SPOKEN DIALOGUE";
        const dialogueSpeakerIds = normalizeIdList((shot.dialogue || []).filter((l) => !(l as any)?.innerSpeech).map((line) => line.characterId));
        const innerSpeakerIds = normalizeIdList((shot.dialogue || []).filter((l) => (l as any)?.innerSpeech).map((line) => line.characterId));
        const silentCharacterIds = shot.characterIds.filter((id) => !dialogueSpeakerIds.includes(id) && !innerSpeakerIds.includes(id));
        const dialogueSpeakerLockText = shot.dialogue?.length ? shot.dialogue.map((line, index) => {
            const speaker = characterMap.get(line.characterId);
            const otherIds = shot.characterIds.filter((id) => id !== line.characterId);
            const otherNames = otherIds.map((id) => `${id} (${characterMap.get(id)?.name || id})`).join(", ") || "NONE";
            const intonationLine = (line.intonations || []).length
                ? `INTONATION_TAGS: ${(line.intonations || []).join(", ")}. Deliver the line with this intonation/emotion — the tone, pace, breath, and expression must match.`
                : "INTONATION_TAGS: none specified — use restrained natural delivery matching the scene.";
            const isInner = Boolean((line as any)?.innerSpeech) || isInnerSpeechText(line?.text || "");
            const isMumble = ((line as any)?.speechMode === "mumble");
            const targetLine = line.targetCharacterId ? `TARGET_ID: ${line.targetCharacterId} (${characterMap.get(line.targetCharacterId)?.name || line.targetCharacterId})` : `TARGET_ID: NONE`;
            if (isInner) {
                return `LINE_${index + 1}
SPEAKER_ID: ${line.characterId}
SPEAKER_NAME: ${speaker?.name || line.characterId}
EXACT_LINE: "${toText(line.text)}"
SPEECH_MODE: INNER_MONOLOGUE_VOICE_OVER
${targetLine}
${intonationLine}
INNER_SPEECH_RULES:
	- This line is INTERNAL THOUGHT / inner monologue only.
	- ${line.characterId} does NOT audibly speak this line.
	- Mouth articulation and lip-sync are FORBIDDEN for this line — lips stay closed and still.
- Render it as voice-over / inner thought while ${line.characterId} performs a silent, restrained thinking reaction.
- Other characters do NOT react as if hearing this line.`;
            }
            if (isMumble) {
                return `LINE_${index + 1}
SPEAKER_ID: ${line.characterId}
SPEAKER_NAME: ${speaker?.name || line.characterId}
EXACT_LINE: "${toText(line.text)}"
SPEECH_MODE: MUMBLE_UNDER_BREATH
${targetLine}
${intonationLine}
MUMBLE_SPEECH_RULES:
- This line is MUTTERED UNDER THE BREATH, quietly, almost to self — it IS audible as a faint real murmur, NOT silent inner voice and NOT a clear projected line.
- ${line.characterId}'s lips move only slightly with minimal jaw motion; delivery is low volume, low pitch, soft, partially swallowed/indistinct articulation that still matches the EXACT_LINE words.
- Keep audio quiet and intimate (microphone-close murmur), never normal conversational loudness.
- Other characters barely notice; at most a faint uncertain micro-reaction, no clear verbal response, unless they are extremely close.
- Only ${line.characterId} performs any mouth movement for this line.`;
            }
            return `LINE_${index + 1}
SPEAKER_ID: ${line.characterId}
SPEAKER_NAME: ${speaker?.name || line.characterId}
EXACT_LINE: "${toText(line.text)}"
${targetLine}
${intonationLine}
SPEECH_RULES:
- ONLY ${line.characterId} (${speaker?.name || line.characterId}) visibly speaks this line.
- The line is directed to ${line.targetCharacterId || "(no explicit listener — muted/self-only)"}.
- Mouth articulation, lip-sync, jaw motion and vocal-performance acting for this line belong ONLY to ${line.characterId}.
- Non-speakers for this line: ${otherNames}.
- Non-speakers must NOT appear to say these words.
- Non-speakers may only react subtly with listening expressions, blinking, breathing, or minimal eye movement.`;
        }).join("\n\n") : "NO DIALOGUE SPEAKER LOCK — no spoken dialogue in this shot.";
        const silentCharacterText = silentCharacterIds.length ? silentCharacterIds.map((id) => `${id} (${characterMap.get(id)?.name || id})`).join(", ") : "NONE";
        const expressionContinuationPlanText = buildExpressionContinuationPlan(shot);
        const dialogueBlockingPlanText = buildDialogueBlockingPlan(shot);
        const objectAttentionPlanText = buildObjectAttentionPlan(shot);
        const dialogueTimingLockText = buildDialogueTimingLock(shot.dialogue || [], shot.durationSeconds || 8);
        const naturalSpeechLockText = buildNaturalSpeechPerformanceLock(shot);
        const voiceContinuityLockText = buildCharacterVoiceContinuityLock(shot);
        const speakerAttributionLockText = buildDialogueSpeakerAttributionLock(shot);
        const intonationPerformancePlanText = buildIntonationPerformancePlan(shot);
        const interShotBridgeLockText = buildInterShotBridgeLock(shot);
        const cinematicCoveragePlanText = buildCinematicDialogueCoveragePlan(shot);
        const directorCharacterDirectionText = buildDirectorCharacterDirectionText(shot);
        const directorCameraScriptText = buildDirectorCameraScriptText(shot);
        const userCameraScriptEnforcementText = buildUserCameraScriptEnforcement(shot);
        const consistencyHardLockText = buildConsistencyHardLock(shot);
        const backgroundNpcText = buildBackgroundNpcPromptBlock(shot);
        const backgroundNpcMode = normalizeBackgroundNpcMode(shot?.backgroundNpcMode);
        const hasUserCameraScript = Boolean(userCameraScriptEnforcementText);
        const continuityText = shot.continuityNotes?.length ? shot.continuityNotes.map((item) => `- ${toText(item)}`).join("\n") : "- Maintain established continuity from previous continuity shots.";
        const editorialContinuityText = joinLines([
            toText(shot.transitionIn) ? `TRANSITION_IN: ${resolveMentionsInFreeText(toText(shot.transitionIn), shot)}` : "",
            toText(shot.plannedStartState) ? `PLANNED_START_STATE: ${resolveMentionsInFreeText(toText(shot.plannedStartState), shot)}` : "",
            toText(shot.plannedEndState) ? `PLANNED_END_STATE: ${resolveMentionsInFreeText(toText(shot.plannedEndState), shot)}` : "",
            toText(shot.transitionOut) ? `TRANSITION_OUT: ${resolveMentionsInFreeText(toText(shot.transitionOut), shot)}` : "",
        ]) || "No explicit editorial handoff. Use the shot action and continuity setup.";
        const incidentalText = shot.incidentalSetDressing?.length ? shot.incidentalSetDressing.map((item) => `- ${toText(item)}`).join("\n") : "NONE";
        const mustRemainVisibleIds = mergeIdLists(shot.mustRemainVisibleIds, shot.referencedVisibleTargetIds);
        const visibleLockText = mustRemainVisibleIds.length ? mustRemainVisibleIds.map((id) => {
            const character = characterMap.get(id);
            return `- ${id} (${character?.name || id}) must remain visibly present and readable in the frame.`;
        }).join("\n") : "- No additional presence lock beyond the allowed cast.";
        const referencedTargetText = shot.referencedVisibleTargetIds?.length ? shot.referencedVisibleTargetIds.map((id) => {
            const character = characterMap.get(id);
            return `- ${id} (${character?.name || id}) is a dialogue/context referenced visible target and may NOT disappear, be fully hidden, or be moved off-screen.`;
        }).join("\n") : "- NONE";
        const effectiveMotion = resolveEffectiveMotion(shot);
        const effectiveMovementMode = effectiveMotion.movementMode;
        const effectiveMovingIds = effectiveMotion.movingCharacterIds;
        const movingCharacterText = effectiveMovingIds.length ? effectiveMovingIds.map((id) => `${id} (${characterMap.get(id)?.name || id})`).join(", ") : "NONE";
        const motionConstraintText = effectiveMovementMode === "LOCOMOTION"
            ? `MOTION_MODE: EXPLICIT_LOCOMOTION\nMOVING_CHARACTER_IDS: ${movingCharacterText}\n- ONLY the listed MOVING_CHARACTER_IDS may change world position.\n- All other visible characters remain anchored at their Scene Anchor coordinates and continue their established activity/state.\n- All furniture, carts/gerobak, vehicles, doors, windows, counters, locked props, and ordinary set dressing stay fixed unless ACTION explicitly moves them.\n- Locomotion is permitted ONLY because the locked source action explicitly requires it.\n- Follow only a visibly clear, physically walkable floor path.\n- Never intersect, clip through, phase through, merge with, or pass through a table, chair, bench, wall, pillar, door panel, counter, vehicle, prop or another person.\n- Pass through a doorway only through its visibly open gap.\n- Keep feet attached to the floor/ground plane with natural steps; no foot sliding or teleporting.\n- Maintain realistic body clearance around furniture and people.\n- If the intended route is blocked, STOP before the obstacle rather than passing through it.\n- Do not invent additional walking beyond the exact action.\n- Movement must stay WITHIN THE SAME LOCATION (${location.id}). Do not let the moving character exit the shot and arrive somewhere else.`
            : `MOTION_MODE: STATIC_POSITION_LOCK\nMOVING_CHARACTER_IDS: NONE\n- Every character is already at the approved Scene Anchor position before frame 1.\n- Character screen/world positions are locked for the full shot.\n- NO walking. NO stepping. NO entering. NO exiting. NO approaching. NO crossing the frame. NO repositioning.\n- Do not make actors move merely because dialogue occurs.\n- Do not create automatic pacing, body travel or cinematic blocking.\n- Only local action explicitly required by ACTION is allowed, such as lip movement, blinking, chewing, eating with a spoon, a small hand action or subtle facial expression.\n- Local action must not change the actor's standing/seated location.\n- If a character is eating, the seated body position remains fixed while only the hand/spoon/mouth perform minimal natural eating motion.\n- The camera must not reinterpret STATIC_POSITION_LOCK as permission to make characters travel.`;
        const innerVoiceGlobalLock = (innerSpeakerIds.length)
            ? `INNER VOICE LOCK (GLOBAL): The following character(s) deliver their lines as INNER THOUGHT / voice-over audio ONLY: ${innerSpeakerIds.join(", ")}. Their MOUTH STAYS FULLY CLOSED AND STILL — zero lip movement, no mouth opening, no jaw/talking motion, absolutely NO lip-sync. Convey the line ONLY via facial expression, eyes, and subtle head movement. Other characters do NOT hear it and do NOT react.`
            : "";
        return `
    MICRODRAMA VIDEO GENERATION PROMPT
    VIDEO_ENGINE: ${VIDEO_ENGINE_NAME}
    SHOT_ID: ${shot.id}
    SHOT_KIND: ${shot.shotKind || "BEAT"}
    EPISODE: ${shot.episode}
    SCENE_ID: ${shot.sceneId}
    VIDEO_LENGTH: ${shot.durationSeconds || 8} seconds
    ASPECT_RATIO: ${projectAspectRatio} (${aspectRatioOrientationLabel(projectAspectRatio)}, LOCKED)
    EDITORIAL_HANDOFF_FOR_MANUAL_EDITING:
    ${editorialContinuityText}
    - This clip may later be cut together with neighboring generated clips. Make the beginning and ending frames readable and cuttable.
    - Do NOT hide continuity changes with random motion. If the shot changes angle/location/character focus, make it feel like an intentional drama edit: reveal cut, reaction cut, match action, insert, establish, or cliffhanger beat.
    FRAME_FILL_LOCK (HIGHEST PRIORITY):
    - Render the full ${projectAspectRatio} ${aspectRatioOrientationLabel(projectAspectRatio)} frame edge-to-edge. The image content must FILL the entire ${projectAspectRatio} canvas.
    - ABSOLUTELY NO letterbox, NO pillarbox, NO black bars, NO white/colored borders, NO padding, NO margins, NO rounded corners, NO split screen, NO picture-in-picture.
    - Do NOT embed a differently-shaped video inside the frame. The native output must itself be ${projectAspectRatio}; do not fit a 16:9 (or any other ratio) image inside a ${projectAspectRatio} frame.
    - Do NOT crop, cut off, or push out of frame any required character, face, or the primary action. Compose for ${projectAspectRatio} so all required subjects stay fully inside the frame with a safe margin for the entire duration.
    - Keep a consistent ${projectAspectRatio} composition across every frame; do not zoom/reframe in a way that letterboxes or crops required subjects.
    ${hasUserCameraScript
        ? `SUBJECT_FRAMING_SCALE_LOCK: OVERRIDDEN BY USER CAMERA SCRIPT. Follow the USER CAMERA SCRIPT framing/shot-size exactly (e.g., half-body/medium/close-up, follow a walking character). The subject MAY fill the frame if the script asks for a closer shot. Only keep: full ${projectAspectRatio} frame fill (no letterbox/bars) and no accidental cropping of the intended subject.`
        : `SUBJECT_FRAMING_SCALE_LOCK:
    - Preserve the framing scale established by the anchor first frame. ${Number(shot.expectedHumanCount || 0) <= 1 ? "The single character should occupy only a modest portion of the frame (roughly 40–55% of frame height) with clear environment visible around them." : "The characters should occupy only a moderate portion of the frame with generous environment visible around them."}
    - Do NOT make a character fill or dominate the frame. Do NOT push in / zoom in so the subject becomes oversized, unless the ACTION explicitly requires a closer shot.
    - Keep clear space above the head and around the body throughout the shot.`}
    DIRECTOR_MODE_DURATION_POLICY:
    - 6 seconds = short spoken dialogue or simple action.
    - 8 seconds = medium dialogue, establishing opening shot, or chained interaction.
    - 10 seconds = long dialogue, intense action, or intense emotion.
        - 12 seconds = very long dialogue or story action that genuinely needs extra suspense.
        - Dialogue timing has priority over decorative movement: every spoken line must finish naturally and leave a short reaction beat.
        - This shot must use exactly VIDEO_LENGTH above; do not stretch into a multi-scene mini-movie.
        - End on the last natural pose/reaction. Never reset characters to the first-frame/reference pose at the end.
${ultraRealisticStoryboardLock(projectAspectRatio)}
${wardrobeAndEraLock(regionProfile.country)}
${dynamicAudioLanguageLock(regionProfile.language, regionProfile.country)}
${realisticMotionLock}
${videoIdentityContinuityLock}
${liveActionAntiCartoonLock}
${project.aiDirectorMode !== false ? `${buildAiDirectorModeContract(regionProfile.country, regionProfile.language, projectAspectRatio)}
AI DIRECTOR PLAN SUMMARY:
${limitText(project.directorModePlan, 1800) || "No saved Director Plan yet. Apply the AI Director Mode layers generically: showrunner arc, continuity, shot variety, dialogue, video engine control, and QA."}` : ""}
${innerVoiceGlobalLock}
==================================================
POLICY-SAFE RENDERING LAYER — PRESERVE CONTEXT
==================================================
- Preserve the same story context, character relationships, stakes, and emotional meaning.
- If the story contains humiliation, danger, conflict, intimidation, injury, crime, or violence, render it in a restrained, non-graphic, compliant way.
- Do not add gore, explicit injury detail, sexual content, hateful slurs, real-person claims, minors in unsafe/sexual contexts, or instructions for wrongdoing.
- Do not sanitize by changing who is present, what the scene means, or the core dramatic context.
- Use implication, reaction, framing, and ordinary live-action staging to keep the prompt safe while keeping the narrative intact.
==================================================
SINGLE LOCATION + CONTINUOUS TIME LOCK — HIGHEST PRIORITY
==================================================
LOCKED_LOCATION_ID: ${location.id}
LOCKED_LOCATION_NAME: ${location.name}
ABSOLUTE SCENE CONTINUITY RULES:
- This shot takes place in EXACTLY ONE location: ${location.id} (${location.name}).
- The entire ${shot.durationSeconds || 8}-second video is ONE UNBROKEN TAKE in ONE continuous space.
- The camera must NEVER cut, jump, dissolve, wipe, fade, morph or transition to another place.
- No establishing shot of a different location.
- No second room, second street, second building, second interior, second exterior, second backyard, second corridor, second rooftop, second vehicle interior, or any alternative environment.
- No teleporting characters between places inside this shot.
- No showing the same character in two different places within the same shot.
- No time-jump, time-skip, flashback, flash-forward, montage, dream sequence, or memory fragment.
- No multiple camera angles that imply a location or time change.
- No cutaway to another place, even briefly.
- No cut to an object in a different location.
- No cut to reaction shots from another room.
- No transition shot, no insert shot from elsewhere, no jump cut.
- Background must remain visually identical for the full duration: same walls, same furniture layout, same light direction, same window view, same environment outside windows.
- Do not change time of day, weather, or ambient light inside this shot.
    - Camera may move inside the SAME room/alley for natural dialogue coverage: locked-off hold, pan, tilt, handheld breathing, rack focus, gentle reframe, small lateral drift, or rare subtle push-in only when CAMERA explicitly supports it. It must never become a new place, time jump, or continuity reset.
    - For Episode 2 and later, preserve the latest approved anchor/camera axis. Do not restart every episode or shot with a front-facing intro angle.
- If the ACTION mentions travel/arrival/entering/leaving, that travel happened BEFORE frame 1. Frame 1 already shows the character at the destination. Do NOT animate the journey inside this shot.
- CONTINUITY_SETUP_STATE below is already true at frame 1. Do not replay how it was reached.
- A shot is NOT allowed to contain more than one scene, more than one place, or more than one moment in time.
==================================================
SPATIAL MAP LOCK — OBJECT / POSTURE CONTINUITY
==================================================
- Treat the approved Scene Anchor and any PREVIOUS_CONTINUITY_ANCHOR as a spatial map for this same-location continuity.
- Same LOCATION_ID is not enough; preserve the exact same micro-location / alley segment / room corner / doorway relationship / camera-facing direction from the previous continuity same-location anchor unless ACTION explicitly relocates the scene.
- Do not jump to another part of the same alley, another doorway, another courtyard, another wall, another room corner, or a tighter unrelated set angle merely because it belongs to the same broad location.
- Preserve screen-left/screen-right placement of recurring objects, furniture, doors, windows, carts/gerobak, vehicles, counters, tables, chairs, locked props, and ordinary set dressing.
- If a gerobak/cart/table/vehicle appears screen-left in the previous continuity same-location anchor, keep it screen-left here unless ACTION explicitly moves it.
- If a recurring person was standing, seated, eating, holding, leaning, watching, or waiting in the previous continuity same-location anchor, preserve that posture/state unless ACTION explicitly changes it.
- Do not mirror or flip the room. Do not swap left and right sides.
- Do not silently move background objects from left to right, foreground to background, or near to far.
- Do not rearrange furniture for prettier composition.
- Do not convert standing to sitting or sitting to standing merely for variety.
- Continuity beats must feel like the next moment in the same physical world, not a newly staged version of the set.
==================================================
IMMUTABLE HUMAN COUNT
==================================================
EXPECTED_LOCKED_CHARACTER_COUNT: ${shot.expectedHumanCount}
Exactly ${shot.expectedHumanCount} locked main character(s) must appear in the entire shot.
Allowed locked Character IDs: ${shot.characterIds.join(", ") || "NONE"}.
Each listed Character ID appears exactly once.
${backgroundNpcMode === "NONE"
    ? "FORBIDDEN: extra people, background actors, crowds, passersby, duplicate characters, clones, human reflections, people visible through doors/mirrors/glass/windows unless explicitly listed."
    : "CONTROLLED EXTRAS: nameless background NPCs are allowed ONLY under the Background NPC block below. Locked cast count remains exact; NPCs must never be mistaken for locked characters."}
${backgroundNpcText}
==================================================
LOCKED CHARACTER REFERENCES
==================================================
${characterText}
${videoIdentityContinuityLock}
${liveActionAntiCartoonLock}
==================================================
PERSISTENT PRESENCE / REFERENCED TARGET LOCK
==================================================
MUST_REMAIN_VISIBLE_IDS: ${mustRemainVisibleIds.join(", ") || "NONE"}
REFERENCED_VISIBLE_TARGET_IDS: ${(shot.referencedVisibleTargetIds || []).join(", ") || "NONE"}
CARRY_OVER_CHARACTER_IDS: ${(shot.carryOverCharacterIds || []).join(", ") || "NONE"}
${visibleLockText}
REFERENCED TARGET RULES:
${referencedTargetText}
- A character established in the previous same-location scene does not disappear unless the locked script explicitly removes them.
- A person explicitly pointed out, insulted, watched, noticed, or reacted to must remain visually readable during that dialogue beat.
- Do not solve continuity by moving a required target off-screen.
- Do not replace a visible target with an implied off-screen presence.
==================================================
LOCKED LOCATION
==================================================
LOCATION_ID: ${location.id}
LOCATION_NAME: ${location.name}
DESCRIPTION: ${location.description || ""}
ARCHITECTURE: ${location.architecture || ""}
FURNITURE: ${location.furniture || ""}
BASE_LIGHTING: ${location.lighting || ""}
COLORS: ${location.colors || ""}
LOCATION_RULES:
- This shot happens in EXACTLY ONE location: ${location.id} (${location.name}).
- Preserve the approved location identity.
- Preserve permanent architecture and furniture arrangement.
- Do not redesign the set.
- Do not add a new room or important environmental object.
- Do not relocate to any other place during the shot.
- Do not show exterior footage of another building, another street, another city, or another environment.
- Do not show any second location, even briefly, even in reflection, even through a window, even as an establishing insert.
- Do not cut, dissolve, or wipe to a different place.
- The physical space must remain visually continuous for the entire shot duration.
${consistencyHardLockText}
==================================================
LOCKED PROPS
==================================================
${propText}
PROP_RULES:
- Only listed props may have narrative importance.
- Do not introduce unlisted important props.
- Do not add an unlisted vehicle.
- Preserve the exact appearance, scale, material impression, and identity of every listed locked prop.
- Preserve locked prop color, stripe/check/floral/logo/marking pattern, texture, material, dirt/wear, and distinctive details exactly.
- Treat open/closed/partially-open/contents-visible/being-handled state as MUTABLE when the current ACTION or continuity explicitly changes it. Keep the same prop identity first, then render the required new action state.
- If a bag/shirt/container/vehicle/prop is striped, patterned, printed, worn, scratched, glossy, matte, transparent, metallic, woven, leather, plastic, or fabric in the reference/anchor, it must stay that way. Do not simplify it into a plain solid-color object.
- Only the props listed above may receive deliberate camera emphasis, handling emphasis, or story-significant interaction.
- Do not silently swap one prop for another.
- Do not invent a substitute container, utensil, phone, bag, document, jewelry item, vehicle, or danger-related item.
- If ACTION does not explicitly require touching or moving a prop, leave that prop undisturbed.
- If a continuity state requires ordinary eating/drinking set dressing, keep it visually ordinary and subordinate to the locked story props.
==================================================
SHOT EXECUTION
==================================================
CAMERA: ${toText(shot.camera)}
    DIRECTOR CAMERA CONTROL (CAMERA MODE ENFORCEMENT IS MANDATORY):
    ${directorCameraScriptText}
${userCameraScriptEnforcementText ? `${userCameraScriptEnforcementText}\n` : ""}    CAMERA_LOCK: ${shot.allowCutaway ? "One continuous camera take with OPTIONAL BRIEF CUTAWAYS to the SAME locked location only. NO cuts to another location, NO time jump, NO montage, NO continuity reset." : "ONE camera only. ONE continuous in-location setup or one motivated continuous movement. NO cuts to another place, NO time jump, NO montage, NO continuity reset."} Dialogue shots may hold, pan, tilt, rack focus, gently reframe, or drift subtly from speaker to listener reaction inside ${location.id}; push-in is optional and rare, never automatic. Camera stays inside ${location.id} for the entire ${shot.durationSeconds || 8} seconds.
    CAMERA_MODE_PRIORITY: The CAMERA MOVEMENT MODE named above MUST visibly occur in the generated video. Do not substitute a different camera behavior. Do not ignore the mode. The video must contain the requested movement (or absence of movement for STATIC).
    CAMERA_VARIATION_LOCK: Do not default to the same straight-front shot moving toward the character. Use the CAMERA line and DIRECTOR COVERAGE PLAN for varied but continuity-safe angle behavior. Episode > 1 continues from the latest anchor/camera position instead of starting over from the front.
    ACTION: ${resolveMentionsInFreeText(toText(shot.action), shot)}
    DIRECTOR COVERAGE PLAN:
    ${cinematicCoveragePlanText}
    DIRECTOR CHARACTER DIRECTION (per-character performance brief):
    ${directorCharacterDirectionText}
    DIALOGUE:
${dialogueText}
==================================================
DIALOGUE SPEAKER / LIP-SYNC LOCK
==================================================
DIALOGUE_SPEAKER_IDS: ${dialogueSpeakerIds.join(", ") || "NONE"}
INNER_VOICE_SPEAKER_IDS: ${innerSpeakerIds.join(", ") || "NONE"}
SILENT_CHARACTER_IDS: ${silentCharacterText}
${speakerAttributionLockText}
${dialogueSpeakerLockText}
    GLOBAL SPEECH PERFORMANCE RULES:
    ${voiceContinuityLockText}
    ${naturalSpeechLockText}
    ${dialogueTimingLockText || "- No spoken dialogue timing required."}
    INTONATION TAG RULES:
    - When a dialogue line carries INTONATION_TAGS (for example marah, sedih, lembut, takut, gembira, tegas, panik, berbisik, berteriak, mengejek, sinis, monoton, memohon, terkejut, etc.), the delivery MUST audibly and visibly match that intonation.
    - Tone, pace, breath, pitch, volume, facial expression, brow position, eye intensity, and body posture must all support the requested intonation.
    - Do not flatten the delivery to neutral. Do not swap the intonation to a different emotion.
    - If multiple intonation tags are present, layer them in a natural human way (for example: "tegas" + "menahan marah" → firm tone with restrained anger).
    ${intonationPerformancePlanText}
- Only the designated SPEAKER_ID for a given line may visibly speak that line.
- Preserve exact speaker attribution exactly as written.
- The complete line must be spoken before the shot ends.
- Pace speech naturally; do not rush or truncate words to fit the clip.
- After the final word, hold a short natural reaction beat before the shot ends.
- Do not transfer a line from one character to another.
- Do not make a silent/listening character mouth the words of another speaker.
- Do not make multiple characters say the same line simultaneously unless explicitly written.
- Non-speaking visible characters keep mouths closed except for natural breathing, chewing, or tiny reaction movements required by the action.
- Listening reactions must remain subtle and must never look like accidental lip-sync.
==================================================
DIALOGUE BLOCKING / EYELINE CONTINUITY LOCK
==================================================
${dialogueBlockingPlanText}
==================================================
OBJECT ATTENTION PLAN
==================================================
${objectAttentionPlanText}
==================================================
FACIAL EXPRESSION / EMOTION LOCK
==================================================
- Facial expression must be driven only by the locked ACTION, the exact DIALOGUE content (including any INTONATION_TAGS), and the role relationship already established in the script.
- Use restrained, believable, human micro-expressions rather than exaggerated melodrama.
- Do not invent a new emotional beat that is not supported by the script or intonation tags.
- Do not add smiling, laughing, crying, shock, panic, romance, flirtation, rage, or fear unless the locked action/dialogue/intonation clearly requires it.
- The speaking character may show only the expression appropriate to the spoken line and its intonation.
- Silent/listening characters may react only with subtle listening expressions that match the scene context.
- Do not let facial expression escalate on its own for cinematic effect.
- Preserve facial identity while expressing emotion.
- Mouth shape while speaking must match the assigned speaker only.
- Mouth shape while not speaking must remain closed or only slightly parted for natural breathing or the approved ongoing action.
- If a character is eating, facial expression remains readable but natural.
==================================================
POST-DIALOGUE EXPRESSION CONTINUATION PLAN
==================================================
${expressionContinuationPlanText}
    POST-DIALOGUE CONTINUATION RULES:
    - When a speaker finishes a line, do NOT instantly drop to a blank, empty, or emotionally unrelated face.
    - Preserve a short residual facial expression that naturally follows the spoken line and its intonation.
    - Silent/listening characters should also maintain a believable follow-up reaction after the speaker stops talking.
    - Do not switch from insult to smiling warmly, from sadness to joy, or from tension to comedy without a scripted reason.
    - Do not reset heads, eyes, shoulders, hands, body angle, or expression back to the first-frame/reference pose after the final word.
    - FINAL_FRAME_LOCK: the last frame keeps the final listener/speaker reaction and eyeline. If the character ended looking to a listener, they remain oriented that way.
==================================================
    REGION LANGUAGE / ARTICULATION LOCK
    ==================================================
    - COUNTRY: ${regionProfile.country}
    - LANGUAGE: ${regionProfile.language}
    - All spoken dialogue in this shot is performed in ${regionProfile.language}.
    - Accent/cadence must sound native to ${regionProfile.country}; for Indonesian projects use natural Bahasa Indonesia with Indonesian accent, not Malaysian/English/theatrical narration.
    - Preserve the exact wording exactly as written in DIALOGUE.
    - Speak each word once only. No duplicated words, accidental repeated phrases, echo, ad-lib, filler, or stutter unless explicitly written in the text.
    - Do not translate, paraphrase, or swap words into another language.
    - Pronunciation, diction, mouth articulation, and lip movement must support natural spoken ${regionProfile.language}.
    - Preserve character name pronunciation naturally and consistently for ${regionProfile.country}.
    - If a character is not the designated speaker, do not let that character appear to mouth words incorrectly or accidentally.
    - If a shot has NO SPOKEN DIALOGUE, no character may appear to speak.
CONTINUITY:
${continuityText}
CONTINUITY_SETUP_STATE:
${resolveMentionsInFreeText(toText(shot.continuitySetup), shot) || "Maintain the state shown in the approved Scene Anchor."}
STATE PERSISTENCE RULE:
- The continuity setup above remains true throughout this shot until ACTION explicitly changes it.
- If the setup says a character is seated, eating, drinking, holding, watching, waiting, or otherwise occupied, preserve that state instead of resetting it.
- Do not silently remove food/tableware or other ordinary continuity items while the ongoing activity still requires them.
INCIDENTAL CONTINUITY SET DRESSING:
${incidentalText}
These items are ordinary non-story set dressing required only for continuity. They must not gain narrative importance and must not replace locked props.
==================================================
MOTION + PHYSICAL COLLISION LOCK
==================================================
${motionConstraintText}
GLOBAL COLLISION RULES:
- solid scenery is solid
- bodies cannot pass through furniture, walls, counters, doors, vehicles, props or other bodies
- no clipping, phasing, mesh intersection, teleportation, foot sliding or impossible body overlap
- hands may contact an object only when ACTION requires it
- preserve physically plausible depth and occlusion
- if a movement path is blocked by solid scenery, stop before the obstacle instead of penetrating it
==================================================
    ANATOMY / PERFORMANCE REALISM LOCK
    ==================================================
    - Human anatomy must remain realistic and stable across the full shot.
    - Preserve correct limb count, realistic shoulder width, realistic elbow bends, realistic wrist alignment, realistic hand placement, and believable neck/head attachment.
    - Preserve natural finger count and hand structure: five fingers per visible hand unless occluded by natural perspective. No fused fingers, extra fingers, missing fingers, melted hands, warped knuckles, or duplicated hands.
    - Preserve locked wardrobe/clothing shape, color, pattern, sleeve length, collar, fabric, accessories, and fit. Do not change a shirt/dress/jacket into a different garment during motion.
    - Preserve footwear exactly: shoes/sandals/slippers/boots keep the same model, color, sole, strap/lace shape, material, and wear. Do not swap footwear type during motion.
    - Preserve all accessories exactly: jewelry, glasses, headwear, hairpin, belt, sash, pouch, scarf, bag strap, and small costume details stay identical.
    - Preserve locked face shape, jawline, hairline, hairstyle, hair color, skin tone, eye/nose/lip shape, age appearance, and body proportions.
    - Preserve head direction and eyeline required by the dialogue: speaker faces the listener/target while speaking; listener turns/reacts naturally after the line.
    - Do not snap head/body/gaze back to front-facing reference alignment at the end of the shot.
    - Maintain believable posture, balance, and center of gravity.
- Preserve physically plausible seated contact, standing contact, and weight distribution.
- Walking, if explicitly required, must use realistic stride length, knee bending, foot planting, and body balance.
- Do not allow limbs to twist beyond natural human range.
- Do not create automatic dance-like flourishes, theatrical gestures, or exaggerated acting unless explicitly required.
- Facial performance should be subtle, grounded, and realistic.
- Do not create rubbery facial motion, over-wide mouth opening, frozen expression, twitching, or unstable face geometry.
- Speech animation must remain natural and attached to the correct speaker only.
- Prop interaction must respect grip realism, contact realism, and object weight realism.
==================================================
LOCKED SERIES VISUAL STYLE
==================================================
${toText(project.visualStyle)}
==================================================
ABSOLUTE PRODUCTION CONSTRAINTS
==================================================
- The approved Scene Anchor is the visual source of truth when supplied.
- The entire shot is ONE LOCATION (${location.id}) and ONE CONTINUOUS TAKE. No cuts, no scene changes, no place changes, no time changes.
- Do not insert establishing shots, cutaways, inserts from elsewhere, or any footage of another place.
- Do not allow the video model to auto-generate a "mini-movie" with multiple scenes; this is ONE single continuous moment only.
- Execute only the action written in this Shot Manifest.
- Do not extend the story.
- Preserve policy-safe rendering while keeping the same story context.
- Do not invent another event or emotion.
- Do not introduce another named/recurring/story-important character. ${backgroundNpcMode === "NONE" ? "No background NPCs are allowed." : "Nameless background NPCs may appear only as permitted by BACKGROUND NPC / ATMOSPHERE EXTRAS."}
- Do not remove a required-visible character.
- Do not duplicate any character.
    - Do not change any locked face, face shape, age, ethnicity, hairstyle, hair color, skin tone, body proportions, costume, clothing color/pattern/shape, accessories, head direction logic, hands, or finger count.
- Do not redesign the location.
- Do not mirror, flip, or rearrange the same-location spatial map.
- Do not move recurring furniture, objects, carts/gerobak, vehicles, props, doors, windows, tables or chairs to the opposite screen side unless ACTION explicitly moves them.
- Do not change a recurring character from standing to seated, seated to standing, eating to not eating, holding to not holding, or present to absent unless ACTION explicitly changes that state.
- Do not add important props.
- Do not add vehicles unless explicitly listed.
- Do not add animals.
- Do not add injuries/weather/narration unless explicitly stated in ACTION.
    - Do not modify dialogue.
    - Do not reset final pose/head direction/gaze to the first frame or character reference image.
- Preserve speaker attribution exactly.
- Natural Speech Lock is mandatory: no poetic/puisi delivery, no narrator voice, no theatrical recitation, no sing-song cadence.
- INTONATION TAG LOCK is mandatory: when @intonation tags are attached to a line, the delivered performance MUST audibly and visibly match that intonation. No substitutions, no flattening, no skipping.
- Dialogue Speaker / Lip-Sync Lock is mandatory.
- INNER VOICE LOCK is mandatory: lines marked INNER_MONOLOGUE_VOICE_OVER are inner thought only — no lip-sync, no audible delivery, no listener reaction.
- Only the correct designated speaker may speak each line.
- Silent characters must remain silent.
- Region Language / Articulation Lock is mandatory.
- Facial Expression / Emotion Lock is mandatory.
- Post-Dialogue Expression Continuation Plan is mandatory.
- CAMERA MOVEMENT MODE ENFORCEMENT is mandatory. The generated video MUST contain the requested camera movement (or the requested locked-off behavior for STATIC). Do not silently substitute a different camera behavior.
- Keep camera behavior restrained and consistent with CAMERA.
- MovementMode and MOTION + PHYSICAL COLLISION LOCK override generic cinematic camera/style language.
- Never invent locomotion from dialogue, emotion, visual style, camera style or scene energy.
- Never allow a body or limb to pass through a solid object.
- Respect locked prop identity exactly, including color, stripe/check/print/logo/marking pattern, material, texture, dirt/wear, and distinctive details.
- Respect locked wardrobe and footwear identity exactly, including clothing model, color shade, motifs, fabric texture, accessories, shoes/sandals, soles, straps, laces, and wear. No outfit/footwear/accessory drift across frames.
- Live-action anti-cartoon lock is mandatory: no anime/cartoon/3D/CGI/game/stylized/painterly look.
- Open/closed/lid angle/contents visibility/handling orientation may change when the current ACTION or continuity explicitly requires it; keep the same prop identity while showing that new state.
- Never turn a patterned/striped/checkered/printed locked prop into a plain solid-color prop during video motion.
- No random text.
- No watermark.
- Photorealistic live-action microdrama.
The Shot Manifest is authoritative.
SINGLE LOCATION LOCK, persistent presence, continuity setup, motion lock, camera mode enforcement, intonation tags, inner-voice lock, and locked production data override generative interpretation.
`.trim();
    };
    const buildModelVideoPrompt = (shot, modelId = selectedVideoModel, modelInfo = selectedVideoModelInfo) => {
        if (!shot) return "";
        const profile = getVideoPromptProfile(modelId, modelInfo);
        const location = locationMap.get(shot.locationId);
        if (!location) throw new Error(`LOCATION_NOT_FOUND_${shot.locationId}`);
        const cast = (shot.characterIds || []).map((id) => {
            const character = characterMap.get(id);
            if (!character) throw new Error(`CHARACTER_NOT_FOUND_${id}`);
            return character;
        });
        const usedProps = (shot.propIds || []).map((id) => propMap.get(id)).filter(Boolean);
        const dialogueSpeakerIds = normalizeIdList((shot.dialogue || []).filter((l) => !(l as any)?.innerSpeech).map((line) => line.characterId));
        const innerSpeakerIds = normalizeIdList((shot.dialogue || []).filter((l) => (l as any)?.innerSpeech).map((line) => line.characterId));
        const silentIds = (shot.characterIds || []).filter((id) => !dialogueSpeakerIds.includes(id) && !innerSpeakerIds.includes(id));
        const mustRemainVisibleIds = mergeIdLists(shot.mustRemainVisibleIds, shot.referencedVisibleTargetIds, shot.carryOverCharacterIds);
        const castLines = cast.length
            ? cast.map((character) => {
                const identity = [
                    character.identity?.age,
                    character.identity?.gender,
                    character.identity?.ethnicity,
                    character.identity?.face,
                    character.identity?.hair,
                    character.identity?.skin,
                    character.identity?.body,
                ].filter(Boolean).join("; ");
                const outfit = [character.costume?.outfit, character.costume?.accessories].filter(Boolean).join("; ");
                return `- ${character.id} (${character.name || character.id}, ${character.role || "character"}): ${limitText(identity, 220)}. Outfit/accessories: ${limitText(outfit || "same as reference", 160)}.`;
            }).join("\n")
            : "- NO HUMANS. Keep the location empty; no people, reflections, silhouettes, crowds, passersby, or human-like figures.";
        const propLines = usedProps.length
            ? usedProps.map((prop) => `- ${prop.id} ${prop.name}: ${limitText(prop.appearance || prop.description, 180)}`).join("\n")
            : "- None with narrative importance.";
        const dialogueLines = shot.dialogue?.length
            ? shot.dialogue.map((line, index) => {
                const speaker = characterMap.get(line.characterId);
                const intonation = (line.intonations || []).length ? ` [intonation: ${(line.intonations || []).join(", ")}]` : "";
                const mode = (line as any)?.speechMode || ((line as any)?.innerSpeech ? "inner" : "spoken");
                const engineLineTreatment = buildEngineDialogueLineTreatment(mode, modelId, modelInfo);
                if (mode === "inner") {
                    // INNER VOICE: voice-over saja. Mulut TIDAK bergerak, tidak ada lip-sync.
                    return `${index + 1}. ${line.characterId} (${speaker?.name || line.characterId}) INNER VOICE / THOUGHT: ${engineLineTreatment} EXACT_TEXT: "${limitText(line.text, 420)}".${intonation} ${line.characterId}'s MOUTH STAYS CLOSED and still — absolutely NO lip movement, NO mouth opening, NO talking motion, NO lip-sync. Convey the line ONLY through facial expression, eyes, and subtle head movement. Other characters do NOT hear it and do NOT react.`;
                }
                if (mode === "mumble") {
                    return `${index + 1}. ${line.characterId} (${speaker?.name || line.characterId}) BERGUMAM / MUTTERS under the breath: ${engineLineTreatment} EXACT_TEXT: "${limitText(line.text, 420)}"${intonation}. Lips move only slightly with minimal jaw motion; low soft volume; audible as a faint murmur, not a clear projected line.`;
                }
                return `${index + 1}. ${line.characterId} (${speaker?.name || line.characterId}) says out loud, lip-synced: ${engineLineTreatment} EXACT_TEXT: "${limitText(line.text, 420)}"${intonation}`;
            }).join("\n")
            : "No spoken dialogue. No character may appear to speak.";
        const engineSpeechTreatmentText = buildEngineSpeechTreatmentLock(modelId, modelInfo, regionProfile.language, regionProfile.country);
        const dialogueBlockingPlanText = buildDialogueBlockingPlan(shot);
        const objectAttentionPlanText = buildObjectAttentionPlan(shot);
        const objectApproachPlan = buildObjectApproachPlan(shot);
        const objectApproachPlanText = objectApproachPlan.text;
        const objectApproachMoverIds = objectApproachPlan.moverIds;
        const dialogueTimingLockText = buildDialogueTimingLock(shot.dialogue || [], shot.durationSeconds || 8);
        const naturalSpeechLockText = buildNaturalSpeechPerformanceLock(shot);
        const voiceContinuityLockText = buildCharacterVoiceContinuityLock(shot);
        const speakerAttributionLockText = buildDialogueSpeakerAttributionLock(shot);
        const intonationPerformancePlanText = buildIntonationPerformancePlan(shot);
        const interShotBridgeLockText = buildInterShotBridgeLock(shot);
        const cinematicCoveragePlanText = buildCinematicDialogueCoveragePlan(shot);
        const directorCharacterDirectionText = buildDirectorCharacterDirectionText(shot);
        const directorCameraScriptText = buildDirectorCameraScriptText(shot);
        const cameraEnforcementText = buildCameraEnforcementText(shot);
        const userCameraScriptEnforcementText = buildUserCameraScriptEnforcement(shot);
        const consistencyHardLockText = buildConsistencyHardLock(shot);
        const backgroundNpcText = buildBackgroundNpcPromptBlock(shot);
        const backgroundNpcMode = normalizeBackgroundNpcMode(shot?.backgroundNpcMode);
        const previousContinuityShot = getPreviousContinuityShotFor(shot);
        const previousContinuitySourceLabel = previousContinuityShot ? getShotContinuityAuthorityLabel(previousContinuityShot) : "";
        const editorialContinuityText = joinLines([
            toText(shot.transitionIn) ? `TRANSITION_IN: ${resolveMentionsInFreeText(toText(shot.transitionIn), shot)}` : "",
            toText(shot.plannedStartState) ? `PLANNED_START_STATE: ${resolveMentionsInFreeText(toText(shot.plannedStartState), shot)}` : "",
            toText(shot.plannedEndState) ? `PLANNED_END_STATE: ${resolveMentionsInFreeText(toText(shot.plannedEndState), shot)}` : "",
            toText(shot.transitionOut) ? `TRANSITION_OUT: ${resolveMentionsInFreeText(toText(shot.transitionOut), shot)}` : "",
        ]) || "No explicit editorial handoff. Use the shot action and continuity setup.";
        const continuityLines = [
            limitText(shot.continuitySetup || "Maintain the state shown in the approved first-frame anchor.", 700),
            ...(shot.continuityNotes || []).slice(0, 5).map((item) => limitText(item, 260)),
        ].filter(Boolean).map((item) => `- ${item}`).join("\n");
        const directorQaNotesText = (shot.anchorQaFeedback || [])
            .filter((item) => /director soft note|blocking|position|posture|state|spacing|path/i.test(toText(item)))
            .map((item) => `- ${limitText(item, 260)}`)
            .join("\n");
        const setDressingLines = shot.incidentalSetDressing?.length
            ? shot.incidentalSetDressing.slice(0, 5).map((item) => `- ${limitText(item, 160)}`).join("\n")
            : "- Keep ordinary set dressing from the first frame; do not make it story-important.";
        const effectiveMotion = resolveEffectiveMotion(shot);
        const effectiveIsLocomotion = effectiveMotion.movementMode === "LOCOMOTION";
        const effectiveMoverIds = effectiveMotion.movingCharacterIds;
        const motionLines = effectiveIsLocomotion
            ? joinLines([
                `Movement mode: explicit locomotion for ${mergeIdLists(effectiveMoverIds, objectApproachMoverIds).join(", ") || "the scripted moving character only"}.`,
                "Only listed moving characters may change world position.",
                objectApproachMoverIds.length
                    ? `Special locomotion exception: ${objectApproachMoverIds.join(", ")} may walk toward their referenced locked prop if that prop starts too far away for believable interaction from the starting position.`
                    : "All locomotion must remain story-motivated.",
                "All other characters stay anchored to their first-frame positions and state.",
                "Use a clear walkable path only; no clipping through furniture, walls, props, doors, counters, vehicles, or people.",
                "If blocked, stop before the obstacle. No teleporting, sliding, impossible body overlap, or extra travel.",
            ])
            : joinLines([
                objectApproachMoverIds.length
                    ? `Movement mode: mostly static position lock, with one allowed motivated approach move for ${objectApproachMoverIds.join(", ")} toward the referenced locked prop if that prop is visibly far away.`
                    : "Movement mode: static position lock.",
                "All characters are already in their correct first-frame positions before second 0.",
                objectApproachMoverIds.length
                    ? `No unnecessary roaming. Only ${objectApproachMoverIds.join(", ")} may perform a short natural walk toward the referenced locked prop when needed for believable interaction; all other characters must stay anchored.`
                    : "No walking, entering, exiting, approaching, crossing frame, pacing, or repositioning.",
                objectApproachMoverIds.length
                    ? "The approach move must be short, direct, physically valid, and end near the referenced object. If the object is already within arm's reach, do not add walking."
                    : "Only local action is allowed: speaking mouth, blinking, breathing, subtle hand/action required by ACTION.",
                objectApproachMoverIds.length
                    ? "No teleporting, no sliding, and no clipping through furniture, walls, props, doors, counters, vehicles, or people."
                    : "",
            ]);
        const intonationLines = (shot.dialogue || []).flatMap((line, index) => {
            if (!(line.intonations || []).length) return [];
            const innerTag = (line as any)?.innerSpeech ? " [INNER VOICE]" : "";
            const tags = (line.intonations || []).map((tag) => normIntonationKey(tag));
            const angerCue = tags.some((tag) => ["marah", "kesal", "tegas", "menghina", "sarkastik", "sinis", "jijik"].includes(tag))
                ? " ANG anger/firm cue: grounded tense body, sharp controlled gesture, firm/clipped articulation; not weak, not graceful, not slow/lemah gemulai."
                : "";
            return `LINE_${index + 1} (${line.characterId}) INTONATION_TAGS: ${line.intonations.join(", ")}${innerTag} — deliver with matching body movement, tone, pace, breath, articulation, and expression.${angerCue}`;
        }).join("\n") || "No explicit intonation tags; use restrained natural delivery matching the scene.";
        const basePrompt = `
MODEL-ADAPTIVE GOOGLE VIDEO IMAGE-TO-VIDEO PROMPT
Target model: ${profile.name} (${modelId})
Prompt profile: ${profile.style}
Shot: ${shot.id} / Episode ${shot.episode} / ${shot.durationSeconds || 8} seconds / ${aspectRatioFrameDescription(projectAspectRatio)} / ${videoResolution}

    FIRST-FRAME AUTHORITY:
    The attached anchor image is frame 1 and the visual source of truth. Start exactly from that frame, but do not freeze it. Acting, breathing, eyeline, expression, lip movement, and camera life begin immediately on frame 1. Preserve room/set geometry, screen-left/screen-right layout, faces, wardrobe, props, lighting, and physical positions.
    ${previousContinuityShot ? `Previous continuity source used for this shot may be the ${previousContinuitySourceLabel} from ${previousContinuityShot.id}; keep the current anchor coherent with that latest state, without snapping actors back to older poses.` : ""}

    LAST-FRAME HANDOFF FOR NEXT SHOT:
    End this clip in a physically readable final state. Preserve the final walking progress, standing/seated posture, facing direction, prop handling, screen side, and camera-world orientation. Do not teleport, reset, or drift actors back to the first-frame pose at the end. The final frame may be captured and reused as the next shot's continuity reference.
    ${interShotBridgeLockText}

    EDITORIAL HANDOFF FOR MANUAL EDITING:
    ${editorialContinuityText}
    - The clip will be manually edited with neighboring clips. Start and end on readable cut points so angle/location/character-focus changes feel like intentional drama editing, not broken continuity.
    - If no previous video last frame exists yet, obey PLANNED_START_STATE as the continuity authority for anchor-first workflow.
${ultraRealisticStoryboardLock(projectAspectRatio)}
${wardrobeAndEraLock(regionProfile.country)}
${dynamicAudioLanguageLock(regionProfile.language, regionProfile.country)}
${realisticMotionLock}
${videoIdentityContinuityLock}
${liveActionAntiCartoonLock}
${project.aiDirectorMode !== false ? `${buildAiDirectorModeContract(regionProfile.country, regionProfile.language, projectAspectRatio)}
AI DIRECTOR PLAN SUMMARY:
${limitText(project.directorModePlan, 1600) || "No saved Director Plan yet. Keep showrunner arc, continuity, shot variety, dialogue, video-engine, and QA layers active."}` : ""}
    
    CAMERA MODE ENFORCEMENT — MANDATORY:
    ${cameraEnforcementText}
${userCameraScriptEnforcementText ? `\n${userCameraScriptEnforcementText}\n` : ""}
    ONE-SHOT LOCK:
    One continuous live-action take in exactly one location. No montage, transition, flashback, second room, second street, new building, new time of day, or camera jump to a different continuity. Motivated in-location camera behavior is allowed for dialogue coverage: locked-off hold, pan, tilt, rack focus, gentle reframe, small lateral drift, or rare subtle push-in only if the CAMERA line explicitly supports it. The background remains the same physical space for the full clip.
    Camera movement should NOT default to straight-front push-in. For Episode 2 and later, begin from the latest approved anchor/camera axis and continue that spatial viewpoint unless ACTION explicitly relocates the scene.
    Camera motion must feel bridged and motivated, with natural ease-in/ease-out and actor reaction continuity. Avoid stiff mechanical starts/stops or shock jumps unless explicitly scripted.

LOCATION:
ID ${location.id}: ${location.name}
Description: ${limitText(location.description, 420)}
Architecture/furniture: ${limitText([location.architecture, location.furniture].filter(Boolean).join("; "), 520)}
Lighting/colors: ${limitText([location.lighting, location.colors].filter(Boolean).join("; "), 260)}

CAST LOCK:
Expected locked main character count: ${shot.expectedHumanCount}. Allowed locked character IDs: ${(shot.characterIds || []).join(", ") || "NONE"}.
${castLines}
Each listed locked character appears once only. No duplicate locked characters.
${backgroundNpcMode === "NONE" ? "No extra people, no background actors, no passersby." : "Controlled background NPC extras are allowed only as nameless atmosphere; they must stay secondary and never replace/duplicate/hide locked characters."}
Must remain visible/readable: ${mustRemainVisibleIds.join(", ") || "NONE"}.
${backgroundNpcText}

    PROPS:
    ${propLines}
    Prop appearance lock: preserve each listed prop's exact color, stripe/check/print/logo/marking pattern, material, texture, dirt/wear, and distinctive details from the first frame/reference. Patterned props must not become plain solid-color props.
        Prop state flexibility: do NOT freeze the prop 1:1 to the asset's neutral state. If the shot requires the same locked prop to become open, partially open, lid-up, contents-visible, lifted, tilted, pointed, carried, or otherwise actively used, preserve the same prop identity while rendering that required action state.
    Incidental set dressing:
${setDressingLines}

${consistencyHardLockText}

    SHOT EXECUTION:
    Camera: ${limitText(shot.camera, 500)}
    Director camera control (CAMERA MODE ENFORCEMENT is mandatory):
    ${limitText(cameraEnforcementText, 1400)}
    Director camera script:
    ${limitText(directorCameraScriptText, 1400)}
    Action: ${limitText(shot.action, 900)}
    Planned start/end: ${limitText([shot.plannedStartState, shot.plannedEndState].filter(Boolean).join(" -> "), 900) || "Use action and continuity setup."}
    Cinematic coverage:
    ${limitText(cinematicCoveragePlanText, 1200)}
    Per-character direction:
    ${limitText(directorCharacterDirectionText, 1200)}
    Final frame lock: end on the last natural pose, head direction, gaze, hand placement, and facial reaction from the action/dialogue. Do not return to the first frame, do not face everyone forward again, and do not freeze into the character reference pose.
    Continuity state:
${continuityLines || "- Continue directly from the attached first frame."}
    Director QA soft notes for video blocking:
${directorQaNotesText || "- None. Use current action/camera script for blocking."}

    DIALOGUE AND LIP SYNC:
    ${engineSpeechTreatmentText}
    ${dialogueLines}
    ${voiceContinuityLockText}
    ${speakerAttributionLockText}
    ${naturalSpeechLockText}
    ${dialogueTimingLockText || "No spoken dialogue timing required."}
    INNER VOICE LOCK: ${innerSpeakerIds.length ? `${innerSpeakerIds.join(", ")} deliver their line(s) as INNER THOUGHT / voice-over audio only. Their MOUTH STAYS FULLY CLOSED AND STILL — zero lip movement, no mouth opening, no jaw motion, no talking/whispering motion, NO lip-sync whatsoever. The line is conveyed ONLY by facial expression, eyes, and subtle head motion. No listener reaction.` : "No inner-voice lines in this shot."}
    INTONATION TAG RULES:
${intonationLines}
    Dialogue language: ${regionProfile.language}. Keep wording exactly. Only the named speaker may move their mouth for a line.
Speaker IDs (spoken): ${dialogueSpeakerIds.join(", ") || "NONE"}.
Inner voice IDs: ${innerSpeakerIds.join(", ") || "NONE"}.
Silent IDs: ${silentIds.join(", ") || "NONE"}. Silent characters keep mouths closed except natural breathing or ongoing action.
Dialogue blocking / eyeline:
${dialogueBlockingPlanText}

    OBJECT ATTENTION:
    ${limitText(objectAttentionPlanText, 700)}
    ${limitText(objectApproachPlanText, 700)}

    MOTION AND PHYSICS:
    ${motionLines}
    Natural anatomy, stable faces, stable hands, five natural fingers per visible hand, realistic limbs, believable contact with floor/furniture/props. Preserve face shape, hair color/style, wardrobe color/pattern/shape, footwear, accessories, head direction, and listener eyeline continuity.

STYLE:
Photorealistic ${aspectRatioFrameDescription(projectAspectRatio)} microdrama, restrained real acting, natural phone-video/live-action realism. No anime/cartoon/3D/CGI/game/stylized/painterly look. ${limitText(project.visualStyle, 500)}
All characters, props, wardrobe, and environment share one coherent lighting/color grade, contact shadows, lens perspective, depth, grain, and exposure. No pasted-on/cutout/greenscreen look.

NEGATIVE LOCKS:
    No opening freeze. No dead still-image pause. No default front-facing push-in. No repeated straight-front intro angle after Episode 1. No poetic/puisi speech delivery. No narrator voice. No sing-song cadence. No theatrical monologue. No changed character voice. No voice swap. No random timbre/pitch/accent change. No two named characters sharing the same voice. No ignoring camera mode. No substituting a different camera movement than the mode requires. No flattening/ignoring @intonation tags. No wrong-speaker lip-sync. No listener mouthing the speaker's words. No swapped dialogue attribution. No duplicate/echoed dialogue from another character. No lip-sync on inner-voice lines. No ending reset to reference pose. No final snap back to front-facing. No new story event. No scene change. No new location. No new human. No crowds. No animals. No random text. No watermark. No subtitle. No cut to another location/time. No character disappearance. No prop swap. No prop color/pattern/material change. No patterned prop becoming plain. No extra hero prop. No duplicate chest or duplicate container. No invented story-important object. No mirrored room. No changed outfit/clothing color/clothing shape. No changed footwear/shoes/sandals/slippers/boots. No changed accessories/headwear/belt/sash/jewelry/glasses. No changed face/face shape/hair color/hair style/head direction logic. No camera-stare during object-referenced dialogue. No warped hands, missing fingers, extra fingers, or fused fingers. No changed age. No changed ethnicity. No extra dialogue. No narration. No gore or explicit unsafe detail. No anime. No cartoon. No manga. No illustration. No 3D render. No game cinematic. No painterly style. No doll-like CGI. No plastic skin.

FINAL PRIORITY ORDER:
1 attached first-frame anchor
2 exact cast and human count
3 exact location and layout
4 exact action and dialogue (with intonation tags honored, inner-voice lines treated as voice-over)
5 exact camera movement mode (MANDATORY)
6 continuity state and motion rules
`.trim();
        if (basePrompt.length <= profile.targetChars) return basePrompt;

        const compactPrompt = `
GOOGLE VIDEO IMAGE-TO-VIDEO PROMPT FOR ${profile.name}
${shot.id}, ${shot.durationSeconds || 8}s, ${aspectRatioFrameDescription(projectAspectRatio)}, ${videoResolution}.
${profile.style}
${project.aiDirectorMode !== false ? `AI DIRECTOR MODE ACTIVE: keep this shot serving the serialized conflict/cliffhanger plan. Director Plan: ${limitText(project.directorModePlan, 700) || "generic showrunner + continuity + shot variety + dialogue + video-engine + QA layers."}` : ""}

    Use the attached anchor image as exact frame 1, but begin motion immediately. No frozen-image pause. Preserve location geometry, lighting, faces, hair color/style, outfits, footwear, accessories, props, screen-left/screen-right layout, and starting body positions.
    Environment integration: characters and props must inherit the same scene lighting, color temperature, shadows, contact occlusion, lens perspective, depth of field, grain/noise, and exposure as the location. No pasted-on/cutout/greenscreen look.
    Bridge continuity: ${limitText(interShotBridgeLockText, 1400)}
    
    CAMERA MODE — MANDATORY ENFORCEMENT:
    ${limitText(cameraEnforcementText, 900)}
${userCameraScriptEnforcementText ? `\n    USER CAMERA SCRIPT — MANDATORY, OVERRIDES DEFAULT FRAMING (follow shot sizes like half-body/medium/close-up and follow moving subjects exactly):\n    ${limitText(resolveMentionsInFreeText(toText(shot.cameraScript), shot), 700)}\n` : ""}
    ONE continuous take in ONE location only: ${location.id} (${location.name}). No cuts, no montage, no second angle, no second room/street/building, no time jump, no new weather or lighting.

Allowed locked main characters (${shot.expectedHumanCount}): ${(shot.characterIds || []).join(", ") || "NONE"}.
${castLines}
${backgroundNpcMode === "NONE" ? "No extra people, duplicates, crowds, passersby, reflections, or silhouettes." : "Nameless background NPC extras are allowed only under this controlled atmosphere plan; no duplicate locked characters, no new named roles."}
Must stay visible: ${mustRemainVisibleIds.join(", ") || "NONE"}.
${limitText(backgroundNpcText, 700)}

    Camera: ${limitText(shot.camera, 360)}
    Director camera: ${limitText(directorCameraScriptText, 900)}
    Action: ${limitText(shot.action, 620)}
    Editorial handoff: ${limitText(editorialContinuityText, 900)}
    Bridge/ease: begin and end with natural actor/camera momentum; no stiff reset, no abrupt camera snap, no frozen first/last frame.
    Coverage: ${limitText(cinematicCoveragePlanText, 850)}
    Per-character: ${limitText(directorCharacterDirectionText, 700)}
    Final: keep the last natural pose/reaction/head direction/gaze; no reset to first frame or front-facing reference pose.
    Dialogue:
    ${limitText(engineSpeechTreatmentText, 700)}
    ${dialogueLines}
    ${limitText(voiceContinuityLockText, 1400)}
    ${limitText(speakerAttributionLockText, 1500)}
    INNER VOICE: ${innerSpeakerIds.length ? `${innerSpeakerIds.join(", ")} → inner thought / voice-over audio ONLY. Mouth FULLY CLOSED and still, zero lip movement, no lip-sync, no mouth opening; express via face/eyes only. Listeners do NOT react.` : "none."}
    INTONATION TAGS:
${intonationLines}
    ${limitText(intonationPerformancePlanText, 1500)}
    ${limitText(naturalSpeechLockText, 520)}
    ${dialogueTimingLockText || "No spoken dialogue timing required."}
    Language: ${regionProfile.language}. Exact words only. Only characters speaking OUT LOUD lip-sync (${dialogueSpeakerIds.join(", ") || "NONE"}). Inner-voice speakers (${innerSpeakerIds.join(", ") || "NONE"}) keep mouth closed and do NOT lip-sync. Silent: ${silentIds.join(", ") || "NONE"}.
Eyeline/blocking: ${limitText(dialogueBlockingPlanText, 900)}

Location: ${limitText([location.name, location.description, location.architecture, location.furniture].filter(Boolean).join("; "), 700)}
    Props: ${usedProps.length ? usedProps.map((prop) => `${prop.id} ${prop.name}`).join(", ") : "none story-important"}.
    Prop lock: preserve exact prop color, pattern/stripes/checks/prints/logos/markings, material, texture, wear, and distinctive identity; no patterned prop becomes plain. Do not freeze the prop 1:1 to the neutral asset state: if the shot requires opening/closing/tilting/contents-visible/handled state, keep the same prop identity while rendering the required new state.
    CONSISTENCY HARD LOCK: Allowed story props = ONLY [${(shot.propIds || []).join(", ") || "NONE"}] — do NOT add, remove, swap, or duplicate props. Keep every prop's color/shade/pattern/material IDENTICAL across all frames (no color drift). Keep each character's face/identity EXACT per CHARACTER_MASTER (${(shot.characterIds || []).join(", ") || "none"}): no face morphing, no beautification, no age/ethnicity/hair change, no swapping faces. Keep wardrobe and footwear EXACT: same clothing model/cut/color/pattern/fabric/accessories/headwear/belt/sash/shoes/sandals/soles/straps/laces every frame. No wild improvisation — copy the locked references.
    Continuity: ${limitText([shot.continuitySetup, shot.plannedStartState, shot.plannedEndState, shot.transitionIn, shot.transitionOut, ...(shot.continuityNotes || [])].filter(Boolean).join(" "), 1000)}
    Director QA soft notes: ${directorQaNotesText ? limitText(directorQaNotesText, 700) : "none"}

Motion: ${effectiveIsLocomotion ? `Only ${effectiveMoverIds.join(", ") || "scripted mover"} may move position (walking/approaching as the action describes); everyone else stays anchored.` : "Static position lock; no walking, entering, exiting, approaching, crossing, pacing, or repositioning."}
No clipping through furniture/walls/props/people. Stable anatomy, faces, hands, feet, and body contact.

Photorealistic restrained live-action microdrama. Camera mode is mandatory — the video MUST visibly include the requested camera behavior (or locked-off for STATIC). No poetic speech, no narrator voice, no theatrical recitation. Honor all @intonation tags. Inner-voice lines are voice-over only. Keep each named character's voice identity stable: no changed voice, no swapped voices, no random timbre/pitch/accent change. No wrong-speaker lip-sync, no listener mouthing the speaker's words, no swapped dialogue attribution, no duplicated/echoed line from another character. No new story, ${backgroundNpcMode === "NONE" ? "no new people" : "no new named/recurring people beyond controlled nameless background NPC atmosphere"}, no scene change, no prop swap, no changed face/outfit/footwear/accessories, no extra dialogue, no random text, no watermark. Absolutely no anime/cartoon/3D/CGI/game/stylized/painterly look.
Environment blend: one coherent camera/lighting/color grade for character + place + props; no mismatched brightness, no different sharpness, no floating feet, no missing contact shadows, no studio-lit subject inside a different ambient location.
Wardrobe/era lock: keep every locked outfit, accessory, fabric motif, color, fit, shoes, sandals, straps, soles, headwear, belt, sash, and small costume detail identical; props and wardrobe must match the chosen drama era (${regionProfile.country}). Motion is smooth, physically realistic, human-scale, and collision-aware. Audio is exact ${regionProfile.language} with native ${regionProfile.country} cadence; each Character ID keeps the same voice identity/timbre/pitch/accent across shots; no duplicated words or repeated phrases.
`.trim();
        return clampVideoPrompt(compactPrompt, profile.targetChars);
    };
    const ensureShotVideoPrompt = (shot) => {
        const repaired = repairShotForRuntime(shot);
        if (!repaired) throw new Error("SHOT_NOT_FOUND");
        // Selalu recompile agar perubahan ACTION/movement terbaru ikut (hindari prompt basi).
        const compiledPrompt = compileMasterPrompt(repaired);
        const compiledShot = { ...repaired, videoPrompt: compiledPrompt };
        setShots((prev) => prev.map((item) => item.id === compiledShot.id ? { ...item, ...compiledShot } : item));
        return compiledShot;
    };

    // ============================================================================
    // DIRECTOR CONTROLS HANDLERS
    // ============================================================================
    const updateSelectedShotCharacterDirection = (characterId, field, value) => {
        if (!selectedShotId || !characterId) return;
        setShots((prev) => prev.map((item) => {
            if (item.id !== selectedShotId) return item;
            const allowedIds = normalizeIdList(item.characterIds);
            const current = normalizeCharacterDirections(item.characterDirections, allowedIds);
            const next = current.map((dir) => {
                if (dir.characterId !== characterId) return dir;
                if (field === "talkTargetId") {
                    const target = toText(value);
                    return { ...dir, talkTargetId: target && target !== characterId && allowedIds.includes(target) ? target : "" };
                }
                if (field === "cameraFocus") return { ...dir, cameraFocus: Boolean(value) };
                // RAW text — jangan di-trim supaya spasi bisa diketik.
                if (field === "action") return { ...dir, action: String(value ?? "") };
                if (field === "scenePrompt") return { ...dir, scenePrompt: String(value ?? "").slice(0, CHARACTER_SCENE_PROMPT_MAX_CHARS) };
                return dir;
            });
            const withDirections = { ...item, characterDirections: next };
            const dialogue = buildDialogueFromCharacterDirections(withDirections);
            const durationSeconds = inferShotDuration({
                shotKind: withDirections.shotKind,
                action: withDirections.action,
                dialogue,
                movementMode: withDirections.movementMode,
            });
            return recompileVideoPrompt(item, { ...withDirections, dialogue, durationSeconds });
        }));
    };

    const updateSelectedShotCameraScript = (value) => {
        if (!selectedShotId) return;
        setShots((prev) => prev.map((item) => {
            if (item.id !== selectedShotId) return item;
            return recompileVideoPrompt(item, { ...item, cameraScript: String(value ?? "") });
        }));
    };

    const updateSelectedShotCameraMovement = (value) => {
        if (!selectedShotId) return;
        setShots((prev) => prev.map((item) => {
            if (item.id !== selectedShotId) return item;
            return recompileVideoPrompt(item, { ...item, cameraMovement: CAMERA_MOVEMENT_PRESETS.some((p) => p.id === value) ? value : DEFAULT_CAMERA_MOVEMENT });
        }));
    };

    const updateSelectedShotBooleanField = (field, value) => {
        if (!selectedShotId) return;
        if (!["allowCutaway", "allowSceneFlexibility"].includes(field)) return;
        setShots((prev) => prev.map((item) => {
            if (item.id !== selectedShotId) return item;
            return recompileVideoPrompt(item, { ...item, [field]: Boolean(value) });
        }));
    };

    const updateSelectedShotDuration = (value) => {
        if (!selectedShotId) return;
        const seconds = Math.max(2, Math.min(30, Number(value) || 8));
        setShots((prev) => prev.map((item) => {
            if (item.id !== selectedShotId) return item;
            return recompileVideoPrompt(item, { ...item, durationSeconds: seconds });
        }));
    };

    const updateSelectedShotDirectAnchorPrompt = (value) => {
        if (!selectedShotId) return;
        setShots((prev) => prev.map((item) => {
            if (item.id !== selectedShotId) return item;
            const raw = String(value ?? "");
            const tagState = resolveDirectAnchorAssetTags(raw, item);
            const taggedCharacterIds = tagState.refs
                .filter((ref) => ref.type === "character")
                .map((ref) => ref.id);
            return {
                ...item,
                directAnchorPrompt: raw,
                directAnchorTaggedIds: taggedCharacterIds,
                directAnchorTaggedAssetRefs: tagState.refs,
            };
        }));
    };

    const resetSelectedShotDirections = () => {
        if (!selectedShotId) return;
        setShots((prev) => prev.map((item) => {
            if (item.id !== selectedShotId) return item;
            const allowedIds = normalizeIdList(item.characterIds);
            const updatedShot = {
                ...item,
                characterDirections: normalizeCharacterDirections([], allowedIds),
                dialogue: [],
                cameraScript: "",
                cameraMovement: DEFAULT_CAMERA_MOVEMENT,
                allowCutaway: false,
                allowSceneFlexibility: false,
            };
            return recompileVideoPrompt(item, updatedShot);
        }));
    };

    const isContinuityAnchorCandidate = (shot) => (
        shot?.shotKind !== "OPENING_ESTABLISH" &&
        !String(shot?.sceneId || "").endsWith("_OPENING")
    );
    const getShotContinuityImage = (shot) => toText(shot?.videoLastFrameImage || shot?.anchorImage);
    const getShotContinuityImageSource = (shot) => shot?.videoLastFrameImage
        ? "PREVIOUS_VIDEO_LAST_FRAME"
        : shot?.anchorImage
            ? "PREVIOUS_CONTINUITY_ANCHOR"
            : "NO_CONTINUITY_IMAGE";
    const getShotContinuityAuthorityLabel = (shot) => shot?.videoLastFrameImage
        ? "previous generated video's final frame"
        : "previous scene anchor";
    const getPreviousContinuityShotFor = (targetShot, shotPool = shots) => {
        if (!isContinuityAnchorCandidate(targetShot)) return null;
        return [...shotPool]
            .filter((item) => item.id !== targetShot.id &&
                isContinuityAnchorCandidate(item) &&
                Number(item.episode) === Number(targetShot.episode) &&
                Number(item.shotNumber || 0) < Number(targetShot.shotNumber || 0) &&
                item.locationId === targetShot.locationId &&
                getShotContinuityImage(item))
            .sort((a, b) => {
                const qaDelta = Number(Boolean(b.qa?.pass)) - Number(Boolean(a.qa?.pass));
                if (qaDelta) return qaDelta;
                return Number(b.shotNumber || 0) - Number(a.shotNumber || 0);
            })[0] || null;
    };
    const hasUnlistedContinuityCast = (targetShot, sourceShot) => {
        const targetIds = new Set(normalizeIdList(targetShot?.characterIds));
        const sourceIds = normalizeIdList(sourceShot?.characterIds);
        return sourceIds.some((id) => !targetIds.has(id));
    };
    const isPreviousContinuityImageSafeForCast = (targetShot, sourceShot) => {
        if (!getShotContinuityImage(sourceShot)) return false;
        if (hasUnlistedContinuityCast(targetShot, sourceShot)) return false;
        return Number(sourceShot.expectedHumanCount || sourceShot.characterIds?.length || 0) <= Number(targetShot.expectedHumanCount || targetShot.characterIds?.length || 0);
    };
    const propLooksLikeStaff = (prop, extraText = "") => {
        const raw = `${prop?.id || ""} ${prop?.name || ""} ${prop?.description || ""} ${prop?.appearance || ""} ${extraText}`.toLowerCase();
        return /(tongkat|staff|walking stick|cane|root[-\s]?knot|akar|knot top)/.test(raw);
    };
    const normalizeSearchText = (value = "") => toText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const scoreCharacterForFeedback = (character, feedbackText = "") => {
        const haystack = normalizeSearchText(feedbackText);
        if (!character || !haystack) return 0;
        const id = normalizeSearchText(character.id);
        const name = normalizeSearchText(character.name);
        let score = 0;
        if (id && haystack.includes(id)) score += 8;
        if (name && haystack.includes(name)) score += 12;
        name.split(/\s+/).filter((part) => part.length >= 3).forEach((part) => {
            if (haystack.includes(part)) score += 3;
        });
        return score;
    };
    const extractFeedbackHolderText = (feedbackText = "") => {
        const text = toText(feedbackText);
        const possessive = text.match(/while\s+([^.;\n]+?)\s+holds/i) || text.match(/in\s+([^.;\n]+?)['’]s\s+right\s+hand/i);
        return possessive ? toText(possessive[1]) : "";
    };
    const shotContextText = (shot) => [
        shot?.id,
        shot?.action,
        shot?.camera,
        shot?.continuitySetup,
        ...(shot?.continuityNotes || []),
        ...(shot?.incidentalSetDressing || []),
        ...(shot?.dialogue || []).map((line) => line?.text),
    ].map(toText).filter(Boolean).join("\n");
    const textMentionsAsset = (text = "", ...needles) => {
        const haystack = normalizeSearchText(text);
        return needles.map(normalizeSearchText).filter((item) => item.length >= 3).some((needle) => haystack.includes(needle));
    };
    const inferPropOwnerCharacter = (prop) => {
        const raw = normalizeSearchText([prop?.name, prop?.description, prop?.appearance].map(toText).join(" "));
        if (!raw) return null;
        return characters.find((character) => {
            const name = normalizeSearchText(character.name);
            if (!name) return false;
            if (raw.includes(name)) return true;
            const parts = name.split(/\s+/).filter((part) => part.length >= 4);
            return parts.length >= 2 && parts.every((part) => raw.includes(part));
        }) || null;
    };
    const resolveShotAssetAssignments = (shot) => {
        const allowedCharacterIds = normalizeIdList(shot?.characterIds);
        const allowedSet = new Set(allowedCharacterIds);
        const context = shotContextText(shot);
        const propsIn = normalizeIdList(shot?.propIds);
        const keptProps: any[] = [];
        const removedProps: any[] = [];
        propsIn.forEach((id) => {
            const prop = propMap.get(id);
            if (!prop) return;
            const owner = inferPropOwnerCharacter(prop);
            const explicitMention = textMentionsAsset(context, prop.id, prop.name);
            const ownerInCast = owner?.id ? allowedSet.has(owner.id) : false;
            const keep = !owner || ownerInCast || explicitMention;
            const assignment = {
                id,
                prop,
                ownerId: owner?.id || "",
                ownerName: owner?.name || "",
                explicitMention,
                ownerInCast,
                keep,
                reason: keep
                    ? ownerInCast
                        ? `owner ${owner?.id} is in current cast`
                        : explicitMention
                            ? "explicitly mentioned in shot action/dialogue/continuity"
                            : "no specific character owner detected"
                    : `owner ${owner?.id || owner?.name || "unknown"} is not in current cast and prop is not explicitly mentioned`,
            };
            if (keep) keptProps.push(assignment);
            else removedProps.push(assignment);
        });
        const effectivePropIds = keptProps.map((item) => item.id);
        const notes = [
            `ASSET_PREFLIGHT_CAST: ${allowedCharacterIds.join(", ") || "NONE"}`,
            `ASSET_PREFLIGHT_PROPS_KEPT: ${effectivePropIds.join(", ") || "NONE"}`,
            removedProps.length ? `ASSET_PREFLIGHT_PROPS_REMOVED_FROM_ANCHOR: ${removedProps.map((item) => `${item.id} (${item.reason})`).join("; ")}` : "",
        ].filter(Boolean);
        return { characterIds: allowedCharacterIds, propIds: effectivePropIds, keptProps, removedProps, notes };
    };
    const applyShotAssetAssignments = (shot) => {
        if (!shot) return shot;
        const assignments = resolveShotAssetAssignments(shot);
        const existingNotes = (shot.continuityNotes || []).filter((note) => !String(note || "").startsWith("ASSET_PREFLIGHT_"));
        return {
            ...shot,
            characterIds: assignments.characterIds,
            expectedHumanCount: assignments.characterIds.length,
            propIds: assignments.propIds,
            assetAssignments: {
                characterIds: assignments.characterIds,
                propIds: assignments.propIds,
                keptProps: assignments.keptProps.map((item) => ({
                    id: item.id,
                    ownerId: item.ownerId,
                    ownerName: item.ownerName,
                    reason: item.reason,
                })),
                removedProps: assignments.removedProps.map((item) => ({
                    id: item.id,
                    ownerId: item.ownerId,
                    ownerName: item.ownerName,
                    reason: item.reason,
                })),
            },
            continuityNotes: uniqueStrings([...existingNotes, ...assignments.notes]),
        };
    };
    const findCharacterByMention = (mention = "", allowedIds = []) => {
        const needle = normalizeSearchText(mention);
        if (!needle) return null;
        return allowedIds.map((id) => characterMap.get(id)).filter(Boolean).find((character) => {
            const idText = normalizeSearchText(character.id);
            const nameText = normalizeSearchText(character.name);
            return (idText && needle.includes(idText)) ||
                (nameText && (needle.includes(nameText) || nameText.includes(needle))) ||
                nameText.split(/\s+/).some((part) => part.length >= 3 && needle.includes(part));
        }) || null;
    };
    const buildCharacterPropAssignmentLock = (shot, generationContext: any = {}) => {
        const feedbackText = (generationContext.qaFeedback || []).map(toText).join(" ");
        const lines = [
            `Allowed visible characters: ${(shot.characterIds || []).join(", ") || "NONE"}.`,
            "Do not transfer props between characters. Do not let one character hold another character's required prop.",
            "If a character is not explicitly assigned a spear/tombak/lance in ACTION or feedback, that character must not hold a spear/tombak/lance.",
            "Do not invent substitute weapons to satisfy a prop requirement.",
        ];
        const wrongSpearMatch = feedbackText.match(/held by\s+([^.;\n]+?)\s+is\s+(?:a\s+)?(?:conventional\s+)?(?:spear|tombak|lance)[^.;\n]*not\s+(PROP_\d+)/i);
        if (wrongSpearMatch) {
            const holder = toText(wrongSpearMatch[1]);
            const propId = toText(wrongSpearMatch[2]);
            const character = findCharacterByMention(holder, shot.characterIds || []);
            lines.push(`${character?.id || holder}: must NOT hold any spear/tombak/lance/pointed metal weapon. The visible object in this character's hand must be ${propId}, exactly as the locked prop reference and critical prop lock describe it.`);
            lines.push(`${propId}: must not be converted into a spear/tombak/lance. It must remain the locked non-spear prop.`);
        }
        const requiredSpearMatch = feedbackText.match(/([^.;\n]+?)['’]s\s+required\s+(?:spear|tombak|lance)\s+is\s+not\s+clearly\s+visible/i);
        if (requiredSpearMatch) {
            const holder = toText(requiredSpearMatch[1]);
            const character = findCharacterByMention(holder, shot.characterIds || []);
            lines.push(`${character?.id || holder}: if the action requires a spear/tombak/lance, this is the ONLY character who may hold that spear/tombak/lance in this shot.`);
            lines.push(`No other character may hold a spear/tombak/lance as a substitute for ${character?.id || holder}.`);
        }
        if (/(different spear|substitute spear|conventional spear|pointed metal spearhead)/i.test(feedbackText)) {
            lines.push("Spear confusion correction: separate staff/tongkat props from spear/tombak props. Never use one to replace the other. Never put a spearhead on a staff/tongkat.");
        }
        return uniqueStrings(lines).join("\n- ");
    };
    const buildCriticalPropLockText = (shot, generationContext: any = {}) => {
        const feedbackText = (generationContext.qaFeedback || []).map(toText).join(" ");
        const holderText = extractFeedbackHolderText(feedbackText);
        return (shot.propIds || []).map((id) => {
            const prop = propMap.get(id);
            if (!prop) return "";
            const staffLike = propLooksLikeStaff(prop, feedbackText);
            const handLock = new RegExp(`${id}[^.\\n;]*(right[-\\s]?hand|tangan kanan)`, "i").test(feedbackText)
                ? `\n- HAND LOCK: ${id} must be held in the required RIGHT HAND${holderText ? ` by ${holderText}` : ""}. Do not swap it into the left hand. Do not place ${id} unattended on the floor, table, center of frame, or background.`
                : "";
            const handlingLock = /(unattended|center of the frame|placed unattended|holds a different|different spear|handling state|screen placement)/i.test(feedbackText)
                ? `\n- HANDLING CONTINUITY LOCK: ${id} must remain actively held as required by the previous continuity frame and current action. Do not place it unattended, do not move it to the center as set dressing, and do not give the character any substitute spear/weapon.`
                : "";
            const base = `
CRITICAL LOCKED PROP ${id}:
- PROP_ID: ${id}
- NAME: ${prop.name || id}
- DESCRIPTION: ${toText(prop.description)}
- APPEARANCE: ${toText(prop.appearance)}
- Use PROP_MASTER and the written appearance as the BASE IDENTITY reference for this same prop. Do not infer a generic weapon from the prop name.
- Every visible instance of ${id} must preserve the same silhouette, top shape, bottom shape, color, material, texture, wear, metal bands/rings, and distinctive details so it still reads as the SAME prop.
- ACTION-STATE FLEXIBILITY: ${id} does NOT have to stay frozen 1:1 in the same neutral state as the PROP_MASTER. If the current ACTION / continuity / QA feedback requires a new state (for example opened, partially opened, lid lifted, contents visible, tilted, rotated, being handled, being pointed, being carried, or moved into active use), keep the SAME prop identity while showing that required new state.
${handLock}${handlingLock}`.trim();
            if (!staffLike) return base;
            return `${base}
- STAFF/TONGKAT OVERRIDE: ${id} is a blunt aged dark-brown wooden staff/tongkat, not a spear, not a lance, not a pike, not a polearm, and not a bladed weapon.
- The TOP of ${id} is a natural irregular rounded wooden root-knot. It is organic wood, blunt, unsharpened, and not metal.
- The upper shaft has one simple tarnished metal ring/band.
- The BOTTOM of ${id} has a dull forged metal reinforcement ring/band around the blunt base.
- The wood is old dark brown with visible grain, scratches, uneven natural texture, and worn patina.
- FORBIDDEN for ${id}: pointed metal spearhead, blade, sharpened tip, lance head, halberd head, axe head, sword blade, arrow-like point, shiny fantasy metal, smooth new pole, or conventional weapon replacement.
- If the prop name contains "sakti", treat it as the prop's title only; it does not permit adding magical blades, spearheads, glowing metal, or fantasy weapon parts.`;
        }).filter(Boolean).join("\n\n") || "NONE";
    };
       const propMentionApplies = (textValue = "", prop: any, singlePropFallback = false) => {
        const haystack = toText(textValue).toLowerCase();
        if (!haystack) return false;
        const aliases = uniqueStrings([
            toText(prop?.id),
            toText(prop?.name),
            ...toText(prop?.name).toLowerCase().split(/[^a-z0-9à-ÿ_]+/i).filter((item) => item.length >= 3),
        ]).map((item) => String(item ?? "").toLowerCase());
        if (aliases.some((alias) => alias && haystack.includes(alias))) return true;
        if (!singlePropFallback) return false;
        if (/\b(chest|peti|box|container|crate|lid|isi|contents?)\b/i.test(haystack)) return true;
        return false;
    };
    const propClosedIntentPattern = /(?:\b(?:must|should|required|requires?|keep|remain|stays?|still|tetap|harus|masih)\b[^.;\n]{0,90}\b(?:closed|shut|sealed|lid\s+down|tertutup|ditutup|tertutup\s+rapat)\b|\b(?:closed|shut|sealed|lid\s+down|tertutup|ditutup)\b[^.;\n]{0,90}\b(?:must|should|required|requires?|remain|tetap|harus|masih)\b)/i;
    const propOpenIntentPattern = /(?:\b(?:must|should|required|requires?|already|now|visibly|tetap|harus|sudah|telah)\b[^.;\n]{0,90}\b(?:open|opened|lid\s+up|contents?\s+visible|inside\s+visible|terbuka|dibuka|isi(?:nya)?\s+terlihat)\b|\b(?:opens|opened|membuka|dibuka|terbuka|mengangkat\s+tutup|angkat\s+tutup|lift(?:s|ed|ing)?\s+(?:the\s+)?lid|look(?:s|ing)?\s+inside|peek(?:s|ing)?\s+inside|melihat\s+isi|mengintip)\b)/i;
    const propContentsVisiblePattern = /\b(?:contents?\s+visible|inside\s+visible|see\s+the\s+contents|able\s+to\s+see\s+the\s+contents|isi(?:nya)?\s+terlihat|melihat\s+isi|emas\s+terlihat|harta\s+terlihat)\b/i;
    const propInspectionPattern = /\b(?:examines?|examining|inspects?|inspecting|checks?|checking|look(?:s|ing)?\s+inside|peek(?:s|ing)?\s+inside|memeriksa|mengamati|mengintip|melihat\s+isi)\b/i;
    const hasPropClosedIntent = (textValue = "") => propClosedIntentPattern.test(toText(textValue));
    const hasPropOpenIntent = (textValue = "") => {
        const text = toText(textValue);
        if (!text) return false;
        if (hasPropClosedIntent(text)) return false;
        return propOpenIntentPattern.test(text);
    };
    const hasPropContentsVisibleIntent = (textValue = "") => propContentsVisiblePattern.test(toText(textValue)) && !hasPropClosedIntent(textValue);
    const hasPropInspectionIntent = (textValue = "") => propInspectionPattern.test(toText(textValue));
    // Lock KERAS konsistensi: props yang dipakai + warna/penampilannya, dan wajah karakter.
    // Mencegah model berimprovisasi liar (ganti warna, tambah/ganti props, ubah wajah).
    const buildConsistencyHardLock = (shot) => {
        const castIds = normalizeIdList(shot?.characterIds || []);
        const propIds = normalizeIdList(shot?.propIds || []);
        const faceLines = castIds.map((id) => {
            const c = characterMap.get(id);
            if (!c) return `- ${id}: match the ${id} CHARACTER_MASTER reference face exactly.`;
            const bits = [
                c.identity?.face ? `face ${c.identity.face}` : "",
                c.identity?.eyes ? `eyes ${c.identity.eyes}` : "",
                c.identity?.nose ? `nose ${c.identity.nose}` : "",
                c.identity?.lips ? `lips ${c.identity.lips}` : "",
                c.identity?.hair ? `hair ${c.identity.hair}` : "",
                c.identity?.skin ? `skin ${c.identity.skin}` : "",
            ].filter(Boolean).join("; ");
            return `- ${id} (${c.name || id}): keep EXACT same face/identity — ${bits || "as in CHARACTER_MASTER reference"}. No face morphing, no de-aging/aging, no ethnicity change, no beautification, no different hairstyle/hair color.`;
        }).join("\n");
        const propLines = propIds.length ? propIds.map((id) => {
            const p = propMap.get(id);
            const appearance = toText(p?.appearance || p?.description);
            return `- ${id} (${p?.name || id}): keep EXACT same object, color, pattern, material, and markings${appearance ? ` — ${limitText(appearance, 240)}` : ""}. Do not recolor, restyle, or replace it with a similar-but-different object.`;
        }).join("\n") : "- (No story props in this shot.)";
        return [
            "==================================================",
            "CONSISTENCY HARD LOCK — NO WILD IMPROVISATION (MANDATORY)",
            "==================================================",
            "The model MUST NOT improvise freely. Keep assets identical to the locked references for continuity across shots.",
            "",
            "ALLOWED STORY PROPS (ONLY THESE — EXACT IDs):",
            `- ${propIds.join(", ") || "NONE"}`,
            "- Do NOT add any new/extra prop, weapon, container, vehicle, furniture-as-prop, or hero object that is not listed above.",
            "- Do NOT remove or swap a listed prop. Do NOT duplicate a listed prop.",
            "PROP APPEARANCE / COLOR LOCK (exact):",
            propLines,
            "- Prop color, shade, pattern, material, logo/marking, wear/dirt, and shape must stay IDENTICAL every frame and across shots. No color drift, no palette shift, no texture change.",
            "",
            "CHARACTER FACE / IDENTITY LOCK (exact):",
            faceLines,
            "- Faces must stay perfectly consistent frame-to-frame and shot-to-shot. No random facial variation, no expression that changes identity, no swapping faces between characters, no added/removed facial hair or marks.",
            "",
            "GENERAL: Do NOT invent new details, props, colors, wardrobe, or facial features for cinematic flair. When in doubt, copy the locked reference exactly.",
        ].join("\n");
    };

    const buildPropStateLockText = (shot, generationContext: any = {}) => {
        const allPropIds = normalizeIdList(shot?.propIds || []).map((id) => String(id));
        if (!allPropIds.length) {
            return "PROP STATE / CONTINUITY RESULT CONTRACT:\n- No locked prop state override detected.";
        }
        const feedbackText = (generationContext?.qaFeedback || []).map(toText).join(" ");
        const dialogueStateTexts = (Array.isArray(shot?.dialogue) ? shot.dialogue : []).map((line) => toText(line?.text));
        const sourceTexts = [shot?.action, shot?.continuitySetup, ...(shot?.continuityNotes || []), ...dialogueStateTexts]
            .map(toText)
            .filter(Boolean);
        const stateCorrectionText = [
            propClosedIntentPattern.test(feedbackText) ? "must remain closed" : "",
            /(?:critical\s+prop\s+state\s+failed|open-?chest\s+action\s+state\s+is\s+missing|do\s+not\s+keep\s+it\s+closed|required\s+open\s+state|must\s+be\s+open)/i.test(feedbackText) && !propClosedIntentPattern.test(feedbackText)
                ? "must be open"
                : "",
        ].filter(Boolean).join(" ");
        const singlePropFallback = allPropIds.length === 1;
        const lines: string[] = ["PROP STATE / CONTINUITY RESULT CONTRACT:"];
        let hasAny = false;
        allPropIds.forEach((id) => {
            const prop = propMap.get(id);
            const joinedRelevantSource = sourceTexts
                .filter((item) => propMentionApplies(item, { id, name: prop?.name }, singlePropFallback))
                .join(" ");
            const relevantSource = joinedRelevantSource || (singlePropFallback ? sourceTexts.join(" ") : "");
            const relevant = [relevantSource, stateCorrectionText].filter(Boolean).join(" ");
            if (!relevant) return;
            const stateParts: string[] = [];
            const closedRequired = hasPropClosedIntent(relevant);
            const openRequired = !closedRequired && hasPropOpenIntent(relevant);
            const contentsVisible = !closedRequired && hasPropContentsVisibleIntent(relevant);
            const inspectionReadable = hasPropInspectionIntent(relevantSource);
            if (openRequired) stateParts.push(`OPEN_STATE=OPEN — ${id} (${prop?.name || id}) must already be visibly OPEN in the anchor. Do NOT keep it closed or neutral.`);
            else if (closedRequired) stateParts.push(`OPEN_STATE=CLOSED — ${id} (${prop?.name || id}) must remain visibly CLOSED in the anchor.`);
            if (contentsVisible) stateParts.push(`CONTENTS_VISIBILITY=VISIBLE — the inside/contents of ${id} must be visibly readable from the anchor frame.`);
            if (inspectionReadable) stateParts.push(`INTERACTION_READABILITY=READABLE — stage ${id} so the required inspection/opening interaction is already visually readable in the anchor.`);
            if (stateParts.length) {
                hasAny = true;
                lines.push(`- ${stateParts.join(" ")}`);
            }
        });
        if (!hasAny) {
            lines.push("- Preserve the locked prop's required handling/open-closed state exactly as written in action, continuity, and QA feedback. Do not revert to a neutral unopened state if a progressed state is required.");
        }
        lines.push("- If QA feedback or continuity requires a progressed prop state (for example an opened chest, visible contents, or an already moved lid), render that required state NOW in the anchor instead of a neutral pre-action setup.");
        return lines.join("\n");
    };
    const propStateForIdFromLockText = (propStateLockText = "", id = "") => {
        const escapedId = String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`OPEN_STATE=CLOSED[^\\n]*${escapedId}`, "i").test(propStateLockText)) return "CLOSED";
        if (new RegExp(`OPEN_STATE=OPEN[^\\n]*${escapedId}`, "i").test(propStateLockText)) return "OPEN";
        return "";
    };
    const propStateAuthorityOverride = (propStateLockText = "", id = "", propName = "locked prop") => {
        const state = propStateForIdFromLockText(propStateLockText, id);
        if (state === "CLOSED") {
            return ` HARD PROP STATE OVERRIDE FOR ${id}: render ${propName} CLOSED. Lid/top/cover fully down and shut; no gap, no raised lid, no visible inside, no gold/treasure/contents exposed, no hand lifting the lid, no inspecting inside. Use the PROP_MASTER only for identity/material/shape/details, not for any open-state pose.`;
        }
        if (state === "OPEN") {
            return ` HARD PROP STATE OVERRIDE FOR ${id}: render ${propName} OPEN as required while preserving the same prop identity, base footprint, material, markings, and scale.`;
        }
        return "";
    };
    const buildClosedPropNegativePrompt = (propStateLockText = "") => {
        if (!/OPEN_STATE=CLOSED/i.test(propStateLockText)) return "";
        return "CLOSED PROP NEGATIVE LOCK: forbidden visuals include open lid, raised lid, tilted lid, visible gap, visible inside, exposed gold, exposed treasure, exposed contents, character peeking inside, character lifting lid, hands pulling the lid open. Keep closed props shut even if their name implies treasure.";
    };
    const buildAnchorMomentPolicyText = (shot, generationContext: any = {}) => {
        const feedbackText = (generationContext?.qaFeedback || []).map(toText).join(" ");
        const dialogueStateText = (Array.isArray(shot?.dialogue) ? shot.dialogue : []).map((line) => toText(line?.text)).join(" ");
        const combined = [shot?.action, shot?.continuitySetup, ...(shot?.continuityNotes || []), dialogueStateText, feedbackText]
            .map(toText)
            .join(" ");
        const progressedStateRequired = !hasPropClosedIntent(combined) && (hasPropOpenIntent(combined) || hasPropContentsVisibleIntent(combined) || /(?:required\s+end\s+state|hasil\s+akhir)/i.test(combined));
        return progressedStateRequired
            ? "ANCHOR MOMENT POLICY: render the earliest FULLY READABLE REQUIRED continuity result, not a neutral pre-action instant. If continuity/QA requires a prop to already be open, moved, or visibly inspectable, show that progressed state now in the anchor."
            : "ANCHOR MOMENT POLICY: render the earliest readable start moment of the action while preserving all locked continuity, cast, location, and prop requirements.";
    };

    const buildActionStagingPlan = (shot) => {
        const dialogueStateText = (Array.isArray(shot?.dialogue) ? shot.dialogue : []).map((line) => toText(line?.text)).join(" ");
        const actionText = [shot?.action, shot?.continuitySetup, ...(shot?.continuityNotes || []), dialogueStateText].map(toText).join(" ");
        const propMentions = findMentionedLockedProps(shot, actionText);
        const propText = propMentions.length
            ? propMentions.map((prop) => `${prop.id} (${prop.name})`).join(", ")
            : ((shot?.propIds || []).length === 1 ? `${shot.propIds[0]} (${propMap.get(shot.propIds[0])?.name || shot.propIds[0]})` : "the referenced locked prop");
        const lines = ["CURRENT ACTION AUTO-STAGING PLAN:"];
        const hasOpen = hasPropOpenIntent(actionText);
        const hasInspect = /\b(inspect|inspecting|examine|examining|check|checking|look\s+inside|looking\s+inside|peek|peeking|mengintip|memeriksa|mengamati|melihat\s+isi)\b/i.test(actionText);
        const hasReach = /\b(reach|reaching|touch|touching|grab|grabbing|hold|holding|meraih|menyentuh|memegang)\b/i.test(actionText);
        const hasApproach = /\b(approach|approaches|approaching|walk\s+toward|walks\s+toward|walking\s+toward|move\s+closer|steps?\s+closer|mendekat|menghampiri|berjalan\s+ke|melangkah\s+mendekat)\b/i.test(actionText);
        const hasLift = /\b(lift|lifts|lifting|raise|raises|raising|pick\s+up|picks\s+up|angkat|mengangkat|mengambil)\b/i.test(actionText);
        const hasPlace = /\b(place|places|placing|put\s+down|sets?\s+down|letak|meletakkan|menaruh|taruh)\b/i.test(actionText);
        const hasPoint = /\b(point|points|pointing|gesture\s+toward|menunjuk|mengarah)\b/i.test(actionText);
        if (hasApproach) lines.push(`- APPROACH: character may shift/walk closer to ${propText}. Keep the prop fixed in world-space unless the action separately says the prop itself moves.`);
        if (hasOpen) lines.push(`- OPENING: stage the active character close enough to ${propText}; torso/body angle faces the prop, one or both hands plausibly contact the lid/closure, and the open/lid-up state is readable. OPENING CHANGES PROP STATE, NOT PROP SCREEN POSITION.`);
        if (hasInspect) lines.push(`- INSPECTION: character head/eyes/upper body orient toward ${propText}; camera should be close enough to read both character reaction and the relevant prop area/contents. Avoid distant full-environment framing.`);
        if (hasReach) lines.push(`- REACH/TOUCH: character hand placement must visibly connect to ${propText}; body may lean/turn/reach naturally instead of preserving a stiff prior pose.`);
        if (hasLift) lines.push(`- LIFT/PICK-UP: if the script clearly lifts the entire prop, movement of the prop is allowed only as required by that action. Preserve prop identity, orientation logic, and believable hand contact.`);
        if (hasPlace) lines.push(`- PLACE/PUT-DOWN: prop may change world position only because the action explicitly places it. Its new position becomes the continuity position for subsequent shots.`);
        if (hasPoint) lines.push(`- POINT/GESTURE: character body, head, gaze, and hand gesture orient toward ${propText}; do not default to front-facing portrait staging.`);
        if (!hasOpen && !hasInspect && !hasReach && !hasApproach && !hasLift && !hasPlace && !hasPoint) {
            lines.push("- Derive a natural body pose, hand position, body angle, and micro-position from the CURRENT ACTION. Do not blindly copy the previous anchor pose.");
        }
        lines.push("- FRAMING RULE: frame the CURRENT interaction, not the whole set. When one character interacts with one important prop, prefer medium-wide / medium-full staging where both actor and prop are large enough to read clearly.");
        lines.push("- READABILITY SCALE RULE: avoid tiny-subject composition. For single-character + single-important-prop shots, the actor should generally occupy a strong readable portion of the frame and the prop should sit close enough to the actor to read as part of the same beat, not as a distant unrelated object.");
        lines.push("- EMPTY-SPACE RULE: do not waste the frame on excessive sky, ceiling, floor, or empty environment. Keep headroom modest and keep the action zone visually dominant.");
        lines.push("- SCENE-TO-SCENE CONTINUITY SCALE RULE: if PREVIOUS_CONTINUITY_ANCHOR exists and the shot continues the same scene axis, preserve approximate visual scale and intimacy unless CURRENT ACTION explicitly demands a wider or tighter framing.");
        lines.push("- PREVIOUS ANCHOR RULE: use previous continuity for identity, wardrobe, location geometry, screen axis, and prop world position; use CURRENT ACTION for pose/blocking/performance.");
        return lines.join("\n");
    };
    const buildPropSpatialLockText = (shot, _generationContext: any = {}) => {
        const dialogueStateText = (Array.isArray(shot?.dialogue) ? shot.dialogue : []).map((line) => toText(line?.text)).join(" ");
        const actionText = [shot?.action, shot?.continuitySetup, ...(shot?.continuityNotes || []), dialogueStateText].map(toText).join(" ");
        const propIds = normalizeIdList(shot?.propIds || []).map((id) => String(id));
        if (!propIds.length) return "PROP WORLD-POSITION LOCK:\n- No locked props in this shot.";
        const lines = ["PROP WORLD-POSITION / SCREEN-SIDE LOCK:"];
        propIds.forEach((id) => {
            const prop = propMap.get(id);
            const relevantAction = propMentionApplies(actionText, { id, name: prop?.name }, propIds.length === 1) ? actionText : "";
            const spatialMoveExplicit = /\b(move|moves|moving|carry|carries|carrying|drag|drags|dragging|push|pushes|pushing|pull|pulls|pulling|lift|lifts|lifting|pick\s+up|picks\s+up|place|places|placing|put\s+down|sets?\s+down|relocate|relocates|relocating|pindah|memindahkan|membawa|mengangkat|menyeret|mendorong|menarik|meletakkan|menaruh)\b/i.test(relevantAction);
            const stateOnlyChange = (hasPropOpenIntent(relevantAction) || hasPropClosedIntent(relevantAction) || hasPropInspectionIntent(relevantAction) || /\b(close|closes|closing|touch|touching|unlock|unlocking|menutup|menyentuh)\b/i.test(relevantAction)) && !spatialMoveExplicit;
            if (spatialMoveExplicit) {
                lines.push(`- ${id} (${prop?.name || id}): spatial movement is allowed ONLY to the extent explicitly required by ACTION. Preserve starting screen side until the physical move occurs; after placement, the new position becomes the continuity lock for later shots.`);
            } else {
                lines.push(`- ${id} (${prop?.name || id}): HARD WORLD-POSITION + SCALE LOCK. Preserve the SAME screen-left/center/screen-right side, same foreground/midground/background depth, same height relative to steps/floor/furniture, same distance to the active character, same apparent size in frame, same width/height proportions, and same relationship to nearby architecture/furniture from PREVIOUS_CONTINUITY_ANCHOR. Do NOT move it across the frame, resize it, shrink/enlarge it, rotate it to a new silhouette, or shift it deeper/closer for composition.`);
                if (stateOnlyChange) lines.push(`  STATE-ONLY CHANGE: ${id} may open/close/change lid angle/contents visibility/handling state, but its base/world position MUST remain fixed.`);
            }
        });
        lines.push("- Camera reframing does NOT authorize prop teleportation. Preserve world-space continuity even if camera crops/reframes closer.");
        lines.push("- If a locked prop is a chest/container, keep the same box footprint, lid size, plank thickness, color/material, open angle logic, contents position, and screen placement. Opening the lid changes only lid/contents visibility, not the object's identity, scale, or base position.");
        lines.push("- For same-location consecutive anchors, the prop should look like the SAME physical object photographed moments apart, not a redesigned replacement.");
        lines.push("- Never mirror the scene. A prop established on screen-right must not jump to screen-left in the next same-axis continuity shot unless ACTION explicitly relocates it.");
        return lines.join("\n");
    };

    // ============================================================================
    // DIRECT ANCHOR PROMPT BLOCK — dipakai untuk menyuntik user prompt ke anchor
    // ============================================================================
    const buildDirectAnchorPromptBlock = (shot) => {
        const raw = toText(shot?.directAnchorPrompt);
        if (!raw) return "";
        const { refs, unmatched, ambiguous } = resolveDirectAnchorAssetTags(raw, shot);
        const canonicalPrompt = canonicalizeDirectAnchorAssetTags(raw, shot);
        const refLines = refs.length
            ? refs.map((ref) => {
                const authority = ref.type === "character"
                    ? "CHARACTER_MASTER"
                    : ref.type === "location"
                        ? "LOCATION_MASTER"
                        : "PROP_MASTER";
                return `- @${ref.token} → ${authority}:${ref.id} (${ref.label}) — use ONLY this approved master asset as the visual authority.`;
            }).join("\n")
            : "- No approved Master Asset tags detected.";
        const unmatchedLines = unmatched.length
            ? unmatched.map((tag) => `- @${tag} → NO MATCH in this shot's Master Assets. Treat it as plain text; NEVER invent or substitute an asset.`).join("\n")
            : "- No unmatched asset tags.";
        const ambiguousLines = ambiguous.length
            ? ambiguous.map((tag) => `- @${tag} → AMBIGUOUS across current Master Assets. Do not guess; require an unambiguous ID/alias.`).join("\n")
            : "- No ambiguous asset tags.";
        return [
            "USER DIRECT ANCHOR PROMPT (HIGHEST PRIORITY FOR SUBJECT STAGING — respect explicit user direction over generic defaults):",
            canonicalPrompt || "(empty prompt)",
            "",
            "MASTER ASSET TAG RESOLUTION:",
            refLines,
            unmatchedLines,
            ambiguousLines,
            "",
            "MASTER ASSET TAG RULES:",
            "- @tags are resolved ONLY against Master Assets already approved for the selected shot: characters, the shot location, and shot props.",
            "- CHARACTER_MASTER tags control character identity, face, hair, skin, body, wardrobe, and accessories.",
            "- LOCATION_MASTER tags control the exact scene place, architecture, furniture, lighting, and environment layout.",
            "- PROP_MASTER tags control exact prop identity, silhouette, color, material, pattern, markings, texture, wear, and required state.",
            "- Never invent a new human, location, or prop for an unmatched tag.",
            "- Never substitute one Master Asset for another merely because the names are similar.",
            "- If a tag is ambiguous, follow no guessed assignment; preserve the locked shot manifest instead.",
            "- User staging directions override generic composition suggestions, but must NOT violate the shot's approved cast count, location, prop manifest, continuity, or safe framing contracts.",
        ].join("\n");
    };

    const buildStandingPropBlockingText = (shot, characterStateLockText = "", primaryPropId = "") => {
        if (!primaryPropId) return "";
        return normalizeIdList(shot?.characterIds || [])
            .filter((id) => {
                const line = characterStateLockText.split("\n").find((row) => row.startsWith(`- ${id} `)) || "";
                return /POSTURE=STANDING/i.test(line);
            })
            .map((id) => {
                const character = characterMap.get(id);
                return `- ${id} (${character?.name || id}) + ${primaryPropId}: if interacting with the prop, keep ${id} fully STANDING beside/behind-near the prop at full standing height. The prop stays below torso/waist height; ${id}'s hips remain high, legs extended, feet visible/on ground. Hands may hover above or rest lightly on the CLOSED lid/top only if the torso remains upright. FORBIDDEN: crouching to reach the prop, sitting behind the prop, kneeling beside it, one knee down, folded/crossed legs hidden by the prop, using the prop as a table while seated.`;
            }).join("\n");
    };

    const buildAnchorPrompt = (shot, generationContext: any = {}) => {
        const cast = shot.characterIds.map((id) => {
            const character = characterMap.get(id);
            return { id, name: character?.name, identity: character?.identity, costume: character?.costume };
        });
        const location = locationMap.get(shot.locationId);
        const usedProps = shot.propIds.map((id) => {
            const prop = propMap.get(id);
            return { id, name: prop?.name, description: prop?.description, appearance: prop?.appearance };
        });
        const castCount = Number(shot.expectedHumanCount || shot.characterIds.length || 0);
        const mustRemainVisibleIds = mergeIdLists(shot.mustRemainVisibleIds, shot.referencedVisibleTargetIds);
        const anchorNpcMode = normalizeBackgroundNpcMode(shot?.backgroundNpcMode);
        const anchorNpcMax = Math.max(0, Math.min(60, Number(shot?.backgroundNpcMaxCount || maxBackgroundNpcCountForMode(anchorNpcMode))));
        const exactHumanCountLock = castCount > 0 && anchorNpcMode !== "NONE"
            ? `LOCKED MAIN CAST COUNT + CONTROLLED NPC LOCK:\n- Render EXACTLY ${castCount} locked main character(s): ${shot.characterIds.join(", ")}.\n- You may include up to ${anchorNpcMax} nameless background NPC atmosphere extras only if they stay background/secondary and do not hide or duplicate the locked cast.\n- Every listed locked character must be fully inside the ${projectAspectRatio} frame at the same moment.\n- If the locked cast plus atmosphere does not fit, widen the camera; never crop or obscure locked characters.`
            : castCount > 0
            ? `EXACT HUMAN COUNT LOCK:\n- Render EXACTLY ${castCount} visible human(s): ${shot.characterIds.join(", ")}.\n- Do not render ${Math.max(0, castCount - 1)} humans, fewer humans, extra humans, duplicate humans, partial edge humans, or implied off-screen humans.\n- Every listed character must be fully inside the ${projectAspectRatio} frame at the same moment.\n- If ${castCount} people do not fit, use an EXTREME-WIDE ${aspectRatioFrameDescription(projectAspectRatio)} ensemble angle and zoom out; never crop left/right edge characters.`
            : anchorNpcMode !== "NONE"
                ? `CONTROLLED BACKGROUND NPC LOCK:\n- No locked main characters in this shot.\n- You may include up to ${anchorNpcMax} nameless background NPC atmosphere extras only when needed by the public setting. They must not become named/story-important.`
                : "EXACT HUMAN COUNT LOCK:\n- Render zero humans. No silhouettes, reflections, crowds, or passersby.";
        const framingInstruction = castCount >= 4
            ? `LARGE ENSEMBLE FRAMING (${castCount} characters):\n- This is a LARGE GROUP COMPOSITION containing ALL ${castCount} listed characters simultaneously.\n- Every listed character must be inside the SAME single ${projectAspectRatio} frame at the same moment.\n- Use a WIDE or EXTREME-WIDE ensemble composition; zoom OUT aggressively until everyone fits comfortably.\n- All bodies may be shown head-to-toe or knees-up; cropping is only acceptable on non-critical body parts (never on heads, faces, or hands in action).\n- Arrange the group in a natural staggered formation (foreground/midground/background layers) so every face is readable.\n- Do NOT line everyone up in a single flat row if that reduces face readability; use depth layers.\n- Keep visible separation between bodies so one actor does not hide another actor's face.\n- Every face must be unobstructed and readable.\n- Leave safe breathing room around the group: approximately 6-10% margin from the top, left, right and bottom edges.\n- If the intended CAMERA instruction is too tight, ignore it and widen the camera to fit everyone instead.`
            : castCount >= 2
                ? `MULTI-CHARACTER FRAMING:\n- This is a GROUP COMPOSITION containing ALL ${castCount} listed characters simultaneously.\n- Every listed character must be inside the SAME single ${projectAspectRatio} frame at the same moment.\n- Use a medium-wide or full ensemble composition; zoom OUT enough to fit everybody comfortably.\n- Keep every actor fully contained inside the image boundaries.\n- Do not crop the top of any head, face, shoulders, arms, hands, or any body part required by the action.\n- Prefer full-body or at minimum knees-up framing for every listed character.\n- Keep visible separation between bodies so one actor does not hide another actor's face.\n- Every face must be unobstructed and readable.\n- Leave safe breathing room around the group: approximately 8-12% margin from the top, left and right edges.\n- If the intended CAMERA instruction is too tight to include all characters, widen the camera rather than crop a character.`
                : castCount === 1
                    ? `SINGLE-CHARACTER FRAMING:\n- Keep the one listed character comfortably inside the ${projectAspectRatio} frame with generous breathing room.\n- Do not crop the top of the head, face, hands, or body parts needed for the action.\n- Prefer a WIDE full-body composition where the character occupies only about 40–55% of the frame height, leaving clear space above the head and around the body so the environment is well visible.\n- Do NOT frame the character so large that they fill/dominate the frame; avoid tight medium/close framing unless the ACTION explicitly requires it.\n- Keep safe margin around the actor.`
                    : `NO-CAST FRAMING:\n- No human may appear.\n- Show one coherent ${aspectRatioFrameDescription(projectAspectRatio)} establishing frame of the locked location.`;
        const anchorMotionInstruction = shot.movementMode === "LOCOMOTION"
            ? `LOCOMOTION START-FRAME SAFETY:\n- MOVING CHARACTER IDS: ${(shot.movingCharacterIds || []).join(", ") || "explicit moving cast"}.\n- Show each moving actor at the exact START position before movement begins.\n- Show the entire intended route as visibly open and unobstructed whenever practical.\n- Keep enough clearance between the moving actor and tables, benches, chairs, counters, walls, pillars, door panels, props and other people.\n- Do not start with any body part intersecting scenery.\n- If a doorway is used, its open gap and clear approach path must be visible.\n- Non-moving persistent characters stay at their established positions and remain visible.`
            : `STATIC START-FRAME LOCK:\n- Every actor is already in the position they will keep for the entire shot.\n- Do not imply entrance, exit, approach, walking or stepping.\n- Place bodies with realistic clearance from tables, benches, chairs, counters, walls, props and other people.\n- No body part may intersect solid scenery.\n- The approved anchor position is the actor position for the whole video.\n- If a character is seated/eating in continuitySetup, show that exact seated/eating start state now.`;
        const incidentalAnchorText = shot.incidentalSetDressing?.length ? shot.incidentalSetDressing.map((item) => `- ${toText(item)}`).join("\n") : "NONE";
        const presenceText = mustRemainVisibleIds.length ? mustRemainVisibleIds.map((id) => `- ${id} (${characterMap.get(id)?.name || id}) must be clearly visible and may not be hidden/off-screen.`).join("\n") : "- NONE";
        const dialogueBlockingPlanText = buildDialogueBlockingPlan(shot);
        const characterStateLockText = buildCharacterStateLock(shot);
        const criticalPropLockText = buildCriticalPropLockText(shot, generationContext);
        const propStateLockText = buildPropStateLockText(shot, generationContext);
        const propSpatialLockText = buildPropSpatialLockText(shot, generationContext);
        const closedPropNegativeText = buildClosedPropNegativePrompt(propStateLockText);
        const actionStagingPlanText = buildActionStagingPlan(shot);
        const anchorMomentPolicyText = buildAnchorMomentPolicyText(shot, generationContext);
        const anchorPerformancePlanText = buildAnchorPerformancePlan(shot);
        const directorCharacterDirectionText = buildDirectorCharacterDirectionText(shot);
        const directorCameraScriptText = buildDirectorCameraScriptText(shot);
        const directAnchorPromptBlock = buildDirectAnchorPromptBlock(shot);
        const standingPropBlockingText = buildStandingPropBlockingText(shot, characterStateLockText, usedProps[0]?.id || "");
        const characterPropAssignmentLockText = buildCharacterPropAssignmentLock(shot, generationContext);
        const backgroundNpcAnchorText = buildBackgroundNpcPromptBlock(shot, { forAnchor: true });
        const backgroundNpcMode = normalizeBackgroundNpcMode(shot?.backgroundNpcMode);
        const previousContinuitySourceLabel = generationContext.previousContinuitySourceLabel || "previous continuity anchor";
        const editorialContinuityText = joinLines([
            toText(shot.transitionIn) ? `TRANSITION_IN: ${resolveMentionsInFreeText(toText(shot.transitionIn), shot)}` : "",
            toText(shot.plannedStartState) ? `PLANNED_START_STATE: ${resolveMentionsInFreeText(toText(shot.plannedStartState), shot)}` : "",
            toText(shot.plannedEndState) ? `PLANNED_END_STATE_FOR_VIDEO: ${resolveMentionsInFreeText(toText(shot.plannedEndState), shot)}` : "",
            toText(shot.transitionOut) ? `TRANSITION_OUT_FOR_EDITOR: ${resolveMentionsInFreeText(toText(shot.transitionOut), shot)}` : "",
        ]) || "No explicit planned handoff. Use current action and continuity setup.";
        const previousCharacterContinuityText = generationContext.previousContinuityShotId
            ? shot.characterIds.map((id) => {
                const character = characterMap.get(id);
                return `- ${id} (${character?.name || id}): copy this recurring person's visible face/body/hair/outfit state from ${previousContinuitySourceLabel}. Preserve the same clothing layers, vest/jacket shape, kain/sarong motif, belt/sash color, footwear, accessories, hair/headcloth, sleeve/neckline, fabric texture, and wear unless ACTION explicitly changes clothing.`;
            }).join("\n")
            : "NONE";
        const previousCastSafetyText = generationContext.previousContinuityShotId && generationContext.previousContinuityImageSafeForCast === false
            ? `PREVIOUS CONTINUITY CAST FILTER:\n- Previous continuity shot ${generationContext.previousContinuityShotId} contains people outside this shot's allowed cast.\n- Do NOT copy humans from that previous image.\n- Use only the current CHARACTER_MASTER / LOCKED_ASSET_BOARD character tiles for people.\n- The allowed humans are exactly: ${shot.characterIds.join(", ") || "NONE"}.\n- Ignore/omit every other person from any prior continuity frame.`
            : "";
        return `
TASK:
Create the exact approved FIRST FRAME / SCENE ANCHOR for a continuity-locked microdrama video shot.

==================================================
FULL-FRAME HD CANVAS CONTRACT
==================================================
- Fill the entire ${projectAspectRatio} canvas with the actual scene image edge-to-edge.
- No letterbox bars, no pillarbox bars, no blurred padding, no dark top/bottom bands, no inset photo, no framed poster, no vignette mask hiding the scene.
- The location, floor/steps, character, and locked prop must occupy the real full frame, not a smaller image pasted inside a background.
- Output should read as an HD live-action frame. Use crisp realistic detail, not soft blurred low-resolution composition.
${ultraRealisticStoryboardLock(projectAspectRatio)}
${wardrobeAndEraLock(regionProfile.country)}
${environmentBlendLock(location, project.visualStyle)}
${HUMAN_SCALE_LOCK}

==================================================
DIRECT ANCHOR PROMPT (USER OVERRIDE — HIGHEST PRIORITY)
==================================================
${directAnchorPromptBlock || "No user direct anchor prompt. Use the locked shot action/dialogue as primary subject staging."}

==================================================
FIRST-FRAME STATE + DIALOGUE BLOCKING CONTRACT
==================================================
EDITORIAL / PLANNED CONTINUITY HANDOFF:
${editorialContinuityText}
- If PREVIOUS_CONTINUITY_ANCHOR is not supplied, PLANNED_START_STATE becomes the main continuity authority for this anchor.
- The anchor should be the first readable frame of this shot, designed to cut naturally from TRANSITION_IN and to support PLANNED_END_STATE during video generation.

${characterStateLockText}
${standingPropBlockingText}

${dialogueBlockingPlanText}

CRITICAL COMPOSITION RULE:
- This anchor is a production reference still AND the exact first frame of the acted scene.
- Pose/state, identity, wardrobe, prop handling, exact cast count, and safe framing are HARD CONSTRAINTS.
- Do NOT solve framing by making a seated person stand.
- Do NOT solve identity visibility by changing wardrobe, props, cast, or location.
- Do not break identity, wardrobe, prop, count, location, or framing to chase performance pose.
- Still, the image must NOT default to a front-facing portrait lineup. Use natural action/dialogue blocking when the script requires speech, listening, opening, inspecting, reaching, or reacting.
- Natural human conversational blocking is required: body angles, head angles, gaze direction, hands, and expressions should match the shot context while keeping all locked assets correct.

${anchorPerformancePlanText}

PER-CHARACTER DIRECTION FOR FRAME 1:
${directorCharacterDirectionText}

CAMERA INTENT FOR FRAME 1:
${directorCameraScriptText}

SINGLE LOCATION MANDATE:
- This anchor belongs to ONE location ONLY: ${location?.id} (${location?.name}).
- The future video generated from this anchor will remain in this exact location for its entire duration.
- Do not imply the shot will move to another place.
- Do not include any hint of a second room, second street, or any other environment.
- Frame 1 is the definitive environment; the video must not cut away from it.
MANDATORY ASSET-LEARNING + IDENTITY LOCK:
- If LOCKED_ASSET_BOARD or CHARACTER_IDENTITY_BOARD is supplied, study it first. It contains all required character assets, locked wardrobe, previous continuity anchor, location, and prop references.
- Use the identity board to guarantee exact human count, exact character lineup, exact wardrobe/costume from assets, and exact continuity angle/layout.
- BEFORE rendering, internally study every labeled CHARACTER_MASTER reference supplied with this request.
- Treat each Character Master image as the immutable biometric/visual identity source for that Character ID.
- Copy identity from the matching Character Master, not from generic visual style and not from another character.
- CHARACTER_MASTER is NOT a pose/head-direction instruction. Do not copy its front-facing pose unless the shot/dialogue actually requires front-facing.
- Preserve face geometry, eye shape, nose, lips, jawline, hairline, hairstyle, skin tone, age appearance, body proportions, locked outfit and locked accessories.
- Preserve locked clothing shape, clothing color, clothing pattern, sleeve length, collar/neckline, fabric impression, accessories, hairstyle, and hair color exactly.
- Preserve natural anatomy in the anchor: correct head attachment, believable neck, normal hands, and five natural fingers per visible hand unless genuinely occluded. No fused/melted/extra/missing fingers.
- NEVER average faces between characters.
- NEVER blend facial traits, wardrobe, or identity attributes between different Character IDs.
- NEVER substitute a similar-looking actor.
- NEVER beautify/redesign a face away from its master reference.
- When multiple characters appear, independently match EACH face to its own labeled Character Master.
- LOCATION_MASTER controls broad set architecture/furniture only; it is not a human identity reference.
- If PREVIOUS_CONTINUITY_ANCHOR is supplied, PREVIOUS_CONTINUITY_ANCHOR overrides LOCATION_MASTER for exact micro-location, camera angle, indoor/outdoor status, and all left/right placement.
- If PREVIOUS_CONTINUITY_ANCHOR is labeled as a previous generated video's final frame, it is the newest true continuity state and overrides the older anchor pose for character position, facing direction, posture, walk progress, prop handling, screen side, and camera-world direction.
- PROP_MASTER controls locked prop IDENTITY first: shape, scale, color palette, stripes/checks/prints/logos/markings, texture, material, wear/dirt, and distinctive details.
- PROP_MASTER is NOT a frozen-state lock. If the current shot requires the same prop to be open, partially open, contents-visible, tilted, carried, pointed, or otherwise actively manipulated, preserve the same prop identity while allowing that changed state.
- Never simplify a patterned locked prop into a plain object.
- A PREVIOUS_CONTINUITY_ANCHOR, when supplied, is the PRIMARY continuity authority for micro-location, camera-world direction, recurring object placement, wardrobe, identity, and prop continuity. It is NOT a frozen pose template.
${generationContext.previousContinuityShotId ? `- Previous continuity source: ${generationContext.previousContinuityShotId} (${previousContinuitySourceLabel}). Preserve compatible spatial continuity where the current shot allows it.` : "- No previous continuity anchor is supplied for this shot."}
${generationContext.previousContinuityShotId ? "- EXACT MICRO-LOCATION LOCK: use the previous continuity anchor as the same physical spot and camera-world orientation. Do not move to another part of the same location unless ACTION explicitly relocates the scene." : ""}
${generationContext.previousContinuityShotId ? "- PREVIOUS FRAME TRANSFER LOCK: treat PREVIOUS_CONTINUITY_ANCHOR as the continuity base image for faces, body proportions, hair/headcloth, wardrobe layers, kain/sarong patterns, belt/sash, footwear, accessories, prop handling, hand occupancy, screen placement, walking progress, facing direction, and room layout. Do NOT blindly copy previous pose/blocking when the CURRENT ACTION needs a different readable body pose." : ""}
${previousCastSafetyText}
${generationContext.qaFeedback?.length ? `\nREGENERATION CORRECTION FROM PREVIOUS QA:\n${generationContext.qaFeedback.map((item) => `- ${toText(item)}`).join("\n")}\nTreat these as hard negative constraints for this regeneration. Correct these failures while keeping all locked production data unchanged. Do not solve a QA failure by changing cast, location, action, continuity state, or camera intent.` : ""}
==================================================
CRITICAL PROP OVERRIDE
==================================================
${criticalPropLockText}
==================================================
LOCKED PROP STATE / ANCHOR MOMENT
==================================================
${anchorMomentPolicyText}
${propStateLockText}
${closedPropNegativeText}
==================================================
CAST / PROP ASSIGNMENT LOCK
==================================================
- ${characterPropAssignmentLockText}
==================================================
PREVIOUS CHARACTER / WARDROBE CONTINUITY
==================================================
${previousCharacterContinuityText}
OUTPUT FORMAT — ABSOLUTE:
- ONE SINGLE CONTINUOUS PHOTOGRAPHIC FRAME ONLY
- ${projectAspectLabel}
- FULL-FRAME EDGE-TO-EDGE SCENE, no letterbox, no black/dark padding, no blurred background fill, no inset image
- no wrong aspect ratio, no square fallback, no split screen, no diptych, no triptych, no collage, no contact sheet, no storyboard grid, no picture-in-picture, no multiple panels
POLICY-SAFE ANCHOR RENDERING:
- Preserve the same story context and emotional stakes, but keep the image non-graphic, non-explicit, and compliant.
- If the beat involves conflict, humiliation, danger, or violence, depict it through restrained live-action staging, body language, and reaction rather than graphic detail.
SHOT_ID:
${shot.id}
EXPECTED_VISIBLE_HUMANS:
${shot.expectedHumanCount}
${exactHumanCountLock}
VISIBLE CHARACTERS:
${JSON.stringify(cast, null, 2)}
${backgroundNpcAnchorText}
PERSISTENT / REQUIRED VISIBLE CHARACTERS:
${presenceText}
REFERENCED VISIBLE TARGET IDS:
${(shot.referencedVisibleTargetIds || []).join(", ") || "NONE"}
CARRY-OVER CHARACTER IDS FROM PRIOR CONTINUITY:
${(shot.carryOverCharacterIds || []).join(", ") || "NONE"}
SCREEN-SIDE / POSITION CONTINUITY LOCK:
- If a PREVIOUS_CONTINUITY_ANCHOR is supplied and a character appears in both that anchor and the current shot, preserve that recurring character's left-to-right order and general screen side unless the locked ACTION explicitly requires a positional change.
- Do NOT mirror, flip, or reverse the character arrangement by accident.
- Do NOT freeze the exact previous pose/blocking. If the current action needs the character to shift closer to a prop, turn, bend, reach, open, inspect, or otherwise perform a readable action, allow that action-driven repositioning while keeping continuity coherent.
MICRO-LOCATION / CAMERA AXIS LOCK:
- If a PREVIOUS_CONTINUITY_ANCHOR is supplied, preserve the same exact alley segment / room corner / doorway relationship / camera facing direction.
- Do not jump to a different area of the same broad location, and do not switch between indoor and outdoor.
OBJECT / SET DRESSING SPATIAL LOCK:
${propSpatialLockText}
- Preserve the screen side and relative placement of recurring furniture, doors, windows, counters, tables, chairs, carts/gerobak, vehicles, locked props, and ordinary continuity set dressing.
- Preserve recurring prop color, pattern, material, texture, wear, and visible state unless ACTION explicitly changes it.
- Do not rearrange the room for composition. Do not flip/mirror the environment.
LOCATION:
${JSON.stringify({ id: location?.id, name: location?.name, description: location?.description, architecture: location?.architecture, furniture: location?.furniture, lighting: location?.lighting }, null, 2)}
PROPS:
${JSON.stringify(usedProps, null, 2)}
CAMERA:
${shot.camera}
ACTION STARTING POSE:
Show the current shot moment for:
${resolveMentionsInFreeText(shot.action, shot)}
Do NOT merely restage the previous scene pose. Compose the anchor so the CURRENT ACTION beat is already readable in the still image.
${actionStagingPlanText}
CONTINUITY SETUP STATE — MUST BE VISIBLE:
${resolveMentionsInFreeText(toText(shot.continuitySetup), shot) || "Use the established state from the prior approved scene."}
STATE CONTINUITY RULE:
- if the setup says a character is eating, show that character already seated/eating with required ordinary tableware
- if the setup says a character is holding an object, show the object already in the hand
- if the previous continuity frame shows a locked prop in a character's hand, keep that exact locked prop in the required hand unless ACTION explicitly releases it
- do not place a required held prop unattended on the ground, table, or center of the frame
- do not give any character a substitute spear, lance, blade, or other weapon while the real locked prop sits elsewhere
- if a person was physically present in the prior same-location scene and is required here, keep that person present
- if dialogue will point out/insult/notice a person, compose the anchor so that person is visibly readable in the same frame
INCIDENTAL CONTINUITY SET DRESSING:
${incidentalAnchorText}
${framingInstruction}
${anchorMotionInstruction}
CONTINUITY NOTES:
${(shot.continuityNotes || []).join("\n") || "None"}
SERIES VISUAL STYLE:
${project.visualStyle}
${ultraRealisticStoryboardLock(projectAspectRatio)}
${wardrobeAndEraLock(regionProfile.country)}
${environmentBlendLock(location, project.visualStyle)}
ABSOLUTE CAST RULES:
- exactly ${shot.expectedHumanCount} locked main character humans, no fewer and no duplicate locked cast
- every Character ID listed above must appear in the anchor, simultaneously, exactly once
- no duplicate face, no cloned body, ${backgroundNpcMode === "NONE" ? "no extra people, no crowd, no passerby, no human reflection" : "no extra named/recurring people; only controlled nameless background NPCs are allowed as atmosphere"}
- preserve supplied character face/age/skin/hair/body/costume and natural hands/finger count
- preserve clear facial visibility for every listed character
ABSOLUTE FRAME + PHYSICAL RULES:
- one frame, one camera view, one continuous scene, ONE location only (${location?.id})
- ${aspectRatioFrameDescription(projectAspectRatio)} composition for a mobile microdrama screen
- keep the complete cast safely inside frame boundaries; do not crop heads, faces, or acting hands
- preserve supplied location architecture/furniture and CRITICAL PROP OVERRIDE exactly
- do not invent important objects; no text overlay; no watermark
- photorealistic live-action microdrama, natural skin, no anime/cartoon/3D look
- this image must be suitable as the first frame of a ${shot.durationSeconds || 8}-second ${aspectRatioFrameDescription(projectAspectRatio)} ${VIDEO_ENGINE_NAME} video
- solid scenery is solid; no clipping, phasing, impossible overlap or geometry penetration
- no warped hands, fused fingers, extra fingers, missing fingers, detached head, broken neck, changed hair color, changed outfit, or changed face shape
`;
    };
    const repairShotForRuntime = (shot) => {
        if (!shot) return shot;
        const characterIds = normalizeIdList(shot.characterIds);
        const expectedHumanCount = characterIds.length;
        const repairedNpcMode = normalizeBackgroundNpcMode(shot.backgroundNpcMode);
        const repairedShot = {
            ...shot,
            characterIds,
            expectedHumanCount,
            propIds: normalizeIdList(shot.propIds),
            camera: shot.camera || inferDeterministicCamera(expectedHumanCount, shot.movementMode || "STATIC"),
            characterDirections: normalizeCharacterDirections(shot.characterDirections, characterIds),
            cameraScript: rawFieldText(shot.cameraScript),
            cameraMovement: CAMERA_MOVEMENT_PRESETS.some((item) => item.id === shot.cameraMovement)
                ? shot.cameraMovement
                : DEFAULT_CAMERA_MOVEMENT,
            allowCutaway: Boolean(shot.allowCutaway),
            allowSceneFlexibility: Boolean(shot.allowSceneFlexibility),
            backgroundNpcMode: repairedNpcMode,
            backgroundNpcDescription: rawFieldText(shot.backgroundNpcDescription),
            backgroundNpcMaxCount: Math.max(0, Math.min(60, Number(shot.backgroundNpcMaxCount || maxBackgroundNpcCountForMode(repairedNpcMode)))),
            directAnchorPrompt: typeof shot.directAnchorPrompt === "string" ? shot.directAnchorPrompt : "",
            continuityNotes: uniqueStrings([
                ...(shot.continuityNotes || []),
                expectedHumanCount !== Number(shot.expectedHumanCount || 0) || characterIds.join("|") !== normalizeIdList(shot.characterIds).join("|")
                    ? `RUNTIME_CAST_REPAIR: expected humans synchronized to approved cast ${characterIds.join(", ")}.`
                    : "",
            ]),
        };
        return applyShotAssetAssignments(repairedShot);
    };
    const generateAnchor = async (shotId, qaFeedback = [], runId = anchorGenerationRef.current.runId, correctionSourceImage = "") => {
        throwIfAnchorGenerationStopped(runId);
        const shot = ensureShotVideoPrompt(shots.find((item) => item.id === shotId));
        if (!shot) throw new Error("SHOT_NOT_FOUND");
        setShots((prev) => prev.map((item) => item.id === shotId ? { ...repairShotForRuntime(item), videoPrompt: shot.videoPrompt } : item));
        const effectiveImageModel = imageModelForProvider(selectedImageProvider, selectedImageModel);
        const referencePriorityText = [
            qaFeedback.map(toText).join(" "),
            shot.action,
            shot.continuitySetup,
            (shot.continuityNotes || []).join(" "),
            shot.directAnchorPrompt || "",
        ].join(" ");
        const prioritizedCharacterIds = shot.characterIds
            .slice(0, FAST_ANCHOR_MAX_CHARACTER_REFS)
            .map((id, index) => ({ id, index, score: scoreCharacterForFeedback(characterMap.get(id), referencePriorityText) }))
            .sort((a, b) => (b.score - a.score) || (a.index - b.index))
            .map((item) => item.id);
        const characterReferenceEntries = prioritizedCharacterIds.map((id) => {
            const character = characterMap.get(id);
            const image = character?.referenceImage;
            if (!image) throw new Error(`CHARACTER_REFERENCE_MISSING_${id}`);
            return {
                image, type: "CHARACTER_MASTER", id,
                label: `${id} // ${character?.name || id} // IMMUTABLE CHARACTER IDENTITY`,
                authority: `HIGHEST PRIORITY identity authority for ${id}. Use ONLY the main centered foreground character belonging to ${id}; ignore every background person, soldier, guard, partial body, crowd, reflection, or scene element in this reference. Preserve exact face shape, jawline, eyes, nose, lips, skin, hair color, hairstyle, body, locked costume/clothing shape/color/pattern, accessories, natural hand anatomy, and finger count from that one person. This reference is not a pose/head-direction instruction; stage pose from the shot action/dialogue. Never blend with another character.`,
            };
        });
        const location = locationMap.get(shot.locationId);
        const locationRef = location?.referenceImage;
        if (!locationRef) throw new Error(`LOCATION_REFERENCE_MISSING_${shot.locationId || "NONE"}`);
        const locationEntry = {
            image: locationRef, type: "LOCATION_MASTER", id: shot.locationId,
            label: `${shot.locationId} // ${location?.name || shot.locationId} // LOCKED SET`,
            authority: "Location/set geometry authority only. Do not derive character identity from this image.",
        };
        const propStateLockForRefs = buildPropStateLockText(shot, { qaFeedback });
        const propEntries = FAST_ANCHOR_INCLUDE_PROPS ? shot.propIds.map((id) => {
            const prop = propMap.get(id);
            if (!prop?.referenceImage) return null;
            const staffAuthority = propLooksLikeStaff(prop, qaFeedback.join(" "))
                ? " STAFF/TONGKAT HARD LOCK: this prop is a blunt aged dark-brown wooden staff with a natural rounded root-knot top, simple tarnished upper metal ring, and dull forged bottom reinforcement ring. It is NOT a spear, lance, pike, polearm, pointed metal head, blade, halberd, axe, shiny fantasy weapon, or smooth new pole."
                : "";
            const propStateAuthority = propStateAuthorityOverride(propStateLockForRefs, id, prop?.name || id);
            return {
                image: prop.referenceImage, type: "PROP_MASTER", id,
                label: `${id} // ${prop?.name || id} // LOCKED PROP`,
                authority: `Prop identity authority first. Preserve exact prop shape, scale, color palette, stripe/check/print/logo/marking pattern, texture, material, dirt/wear, and distinctive details so the result is clearly the SAME prop. Open/closed/lid-up/contents-visible/handling orientation may change ONLY when the current shot/action explicitly requires it.${propStateAuthority} If a human appears in this prop reference, ignore that human completely unless they are explicitly listed in the allowed cast. Do not derive human identity from this image.${staffAuthority}`,
            };
        }).filter(Boolean) : [];
        const previousContinuityShot = getPreviousContinuityShotFor(shot);
        const previousContinuityImage = getShotContinuityImage(previousContinuityShot);
        const previousContinuitySource = getShotContinuityImageSource(previousContinuityShot);
        const previousContinuityAuthorityLabel = getShotContinuityAuthorityLabel(previousContinuityShot);
        const continuityImageSafeForCast = isPreviousContinuityImageSafeForCast(shot, previousContinuityShot);
        const continuityEntry = FAST_ANCHOR_INCLUDE_PREVIOUS && previousContinuityShot && continuityImageSafeForCast ? {
            image: previousContinuityImage, type: "PREVIOUS_CONTINUITY_ANCHOR", id: previousContinuityShot.id,
            label: `${previousContinuityShot.id} // ${previousContinuitySource}`,
            authority: `PRIMARY CONTINUITY IMAGE from the ${previousContinuityAuthorityLabel}. Copy this exact micro-location, indoor/outdoor status, camera-facing direction, screen side, latest character walking/standing/seated position, facing direction, recurring character face/body/hair/outfit, footwear, furniture/object/prop placement, recurring object color/pattern/material, and background geometry. NEVER redesign costume. NEVER move to another room/corner. NEVER override Character Master identity. Use this image for continuity context, not as a frozen CHARACTER pose template. LOCKED PROP world positions stay fixed unless ACTION explicitly moves that prop.`,
        } : null;
        const dialogueBlockingForRefs = buildDialogueBlockingPlan(shot);
        const dialogueSpeakerId = toText(dialogueBlockingForRefs.match(/ANCHOR_START_SPEAKER_ID:\s*(CHAR_\d+)/i)?.[1]);
        const dialogueTargetId = toText(dialogueBlockingForRefs.match(/ANCHOR_START_TARGET_ID:\s*(CHAR_\d+)/i)?.[1]);
        const hardStateCorrection = isHardAnchorStateCorrection(qaFeedback);
        const correctionEntry = correctionSourceImage && !hardStateCorrection ? {
            image: correctionSourceImage,
            type: "CORRECTION_SOURCE",
            id: `${shot.id}_FAILED_CANDIDATE`,
            label: `${shot.id} // FAILED CANDIDATE TO EDIT`,
            authority: "EDIT SOURCE ONLY. Preserve details that already match continuity, but actively correct every QA failure named in FINAL TASK. Failed posture, prop open/closed state, eyeline, and staging here are NOT authoritative and MUST NOT be copied.",
        } : null;

        const references = continuityEntry && propEntries.length
            ? [continuityEntry, ...propEntries, ...characterReferenceEntries, locationEntry]
            : propEntries.length
                ? [...propEntries, ...characterReferenceEntries, locationEntry]
                : continuityEntry
                    ? [continuityEntry, ...characterReferenceEntries, locationEntry]
                    : [...characterReferenceEntries, locationEntry];
        const boardItems = [
            ...(continuityEntry ? [continuityEntry] : []),
            ...characterReferenceEntries,
            locationEntry,
            ...propEntries,
        ];

        const referenceBoard = await createContinuityReferenceBoard(boardItems, `${shot.id} LOCKED ASSET BOARD`);
        const referencesWithBoard = referenceBoard
            ? [{
                image: referenceBoard,
                type: "LOCKED_ASSET_BOARD",
                id: `${shot.id}_LOCKED_ASSET_BOARD`,
                label: "ALL REQUIRED LOCKED ASSETS IN ONE BOARD",
                authority: `Highest priority consolidated visual board. Render humans ONLY for the allowed cast IDs in the final task: ${shot.characterIds.join(", ") || "NONE"}.`,
            }, ...references]
            : references;
        const generationSearchText = [shot.action, shot.continuitySetup, ...(shot.continuityNotes || []), ...(qaFeedback || []), shot.directAnchorPrompt || ""].map(toText).join(" ").toLowerCase();
        const primaryPropEntry = propEntries.find((ref) => {
            const prop = propMap.get(ref.id);
            return generationSearchText.includes(String(ref.id).toLowerCase()) || (toText(prop?.name) && generationSearchText.includes(toText(prop?.name).toLowerCase()));
        }) || propEntries[0] || null;

        const referencesForGeneration = referencesWithBoard;
        console.info(`[anchor:${shot.id}] references`, referencesForGeneration.map((ref, index) => ({
            slot: index + 1, type: ref.type, id: ref.id, label: ref.label,
        })));
        throwIfAnchorGenerationStopped(runId);
        setShots((prev) => prev.map((item) => item.id === shotId ? { ...item, anchorStatus: "generating", qa: makeShotQA() } : item));
        try {
            const generationContext = {
                previousContinuityShotId: previousContinuityShot?.id || null,
                previousContinuityImageSafeForCast: continuityImageSafeForCast,
                previousContinuitySourceLabel: previousContinuityAuthorityLabel,
                qaFeedback,
                correctionSourceProvided: Boolean(correctionEntry),
                hasIdentityBoard: false,
            };
            const anchorPrompt = buildAnchorPrompt(shot, generationContext);
            const image = await withCreditMeter(`Anchor ${shot.id}`, "image", () => generateImage(
                anchorPrompt,
                referencesForGeneration,
                projectAspectRatio,
                effectiveImageModel,
                {
                    provider: selectedImageProvider,
                    bypassCache: true,
                    anchorSpeakerId: dialogueSpeakerId,
                    anchorTargetId: dialogueTargetId,
                    primaryPropId: primaryPropEntry?.id || "",
                }
            ));
            throwIfAnchorGenerationStopped(runId);
            setShots((prev) => prev.map((item) => item.id === shotId ? { ...item, anchorImage: image, anchorStatus: "ready" } : item));
            return image;
        } catch (err) {
            if (err?.message === ANCHOR_STOPPED_ERROR) throw err;
            setShots((prev) => prev.map((item) => item.id === shotId ? { ...item, anchorStatus: "error" } : item));
            throw err;
        }
    };
    const inspectAnchorCandidate = async (shot, anchorImage) => {
        const characterRefs = shot.characterIds.map((id) => {
            const character = characterMap.get(id);
            const image = character?.referenceImage;
            if (!image) throw new Error(`REFERENCE_MISSING_${id}`);
            return {
                image, type: "CHARACTER_MASTER", id,
                label: `${id} // ${character?.name || id} // IDENTITY AUTHORITY`,
                authority: `Compare candidate ${id} only against this exact master identity.`,
            };
        });
        const location = locationMap.get(shot.locationId);
        const locationRef = location?.referenceImage;
        if (!locationRef) throw new Error(`LOCATION_REFERENCE_MISSING_${shot.locationId || "NONE"}`);
        const propRefs = (shot.propIds || []).map((id) => {
            const prop = propMap.get(id);
            if (!prop?.referenceImage) return null;
            return {
                image: prop.referenceImage, type: "PROP_MASTER", id,
                label: `${id} // ${prop?.name || id} // PROP APPEARANCE AUTHORITY`,
                authority: "Compare candidate locked prop identity against this exact prop reference: shape, scale, colors, pattern, markings, texture, material, wear, and distinctive details. Open/closed/contents-visible/handling state may differ when the shot explicitly requires it.",
            };
        }).filter(Boolean);
        const previousContinuityShot = getPreviousContinuityShotFor(shot);
        const previousContinuityImage = getShotContinuityImage(previousContinuityShot);
        const previousContinuitySource = getShotContinuityImageSource(previousContinuityShot);
        const previousContinuityAuthorityLabel = getShotContinuityAuthorityLabel(previousContinuityShot);
        const qaReferencePack = [
            { image: anchorImage, type: "CANDIDATE_SCENE_ANCHOR", id: shot.id, label: `${shot.id} // CANDIDATE TO INSPECT`, authority: "This is the generated candidate. Inspect it; it is not an identity authority." },
            ...characterRefs,
            { image: locationRef, type: "LOCATION_MASTER", id: shot.locationId, label: `${shot.locationId} // LOCATION AUTHORITY`, authority: "Compare set/location only. Do not use as a character identity source." },
            ...propRefs,
            ...(previousContinuityImage ? [{
                image: previousContinuityImage, type: "PREVIOUS_CONTINUITY_ANCHOR", id: previousContinuityShot.id,
                label: `${previousContinuityShot.id} // ${previousContinuitySource}`,
                authority: `Use only to inspect same-location continuity from the ${previousContinuityAuthorityLabel}: micro-location, camera direction, screen side, left-to-right order, latest character position/facing direction, object/prop placement and appearance. CHARACTER pose is judged against the CURRENT SHOT ACTION. LOCKED PROP placement must stay unless ACTION relocates it. Never override Character Master identity.`,
            }] : []),
        ];
        const dimensions = await getImageDimensions(anchorImage);
        const verticalPass = isRequestedAspectRatio(dimensions.width, dimensions.height, projectAspectRatio);
        const mustRemainVisibleIds = mergeIdLists(shot.mustRemainVisibleIds, shot.referencedVisibleTargetIds);
        const dialogueBlockingPlanText = buildDialogueBlockingPlan(shot);
        const characterStateLockText = buildCharacterStateLock(shot);
        const propStateLockText = buildPropStateLockText(shot, {});
        const qaNpcMode = normalizeBackgroundNpcMode(shot?.backgroundNpcMode);
        const qaNpcMax = Math.max(0, Math.min(60, Number(shot?.backgroundNpcMaxCount || maxBackgroundNpcCountForMode(qaNpcMode))));
        const qaNpcAllowed = qaNpcMode !== "NONE" && qaNpcMax > 0;
        const result = await withCreditMeter(`QA ${shot.id}`, "vision", () => callJSON(`
ROLE: You are a strict visual continuity, persistent-presence, per-character identity, and framing inspector.
LABELED IMAGE PACK:
- CANDIDATE_SCENE_ANCHOR = image being inspected.
- Each CHARACTER_MASTER is the immutable identity authority for its exact Character ID.
- LOCATION_MASTER is the set authority only.
- PREVIOUS_CONTINUITY_ANCHOR, when supplied, is the same-location continuity authority. It should NOT force a stale pose when the current shot action requires a different pose.
Never compare one character against another character's master.
SHOT_ID: ${shot.id}
EXPECTED FORMAT: ONE single continuous frame, ${aspectRatioFrameDescription(projectAspectRatio)}, ONE location only
EXPECTED LOCKED MAIN CHARACTER COUNT: ${shot.expectedHumanCount}
EXPECTED CHARACTER IDs: ${shot.characterIds.join(", ") || "NONE"}
BACKGROUND NPC MODE: ${qaNpcMode}
BACKGROUND NPC MAX COUNT: ${qaNpcMax}
${qaNpcAllowed
    ? "CONTROLLED NPC RULE: unlisted humans are allowed only as nameless background/edge-frame atmosphere extras. They must not be foreground story characters, must not duplicate or hide locked cast, and must not be judged against CHARACTER_MASTER. Locked main characters still must all match their IDs."
    : (shot.expectedHumanCount === 0 ? "ZERO-HUMAN RULE: if any person is visible, pass MUST be false and humanCount must be greater than 0." : "CAST-ONLY RULE: every visible human must match one of the expected Character IDs; unlisted people make pass false.")}
MUST REMAIN VISIBLE IDS: ${mustRemainVisibleIds.join(", ") || "NONE"}
REFERENCED VISIBLE TARGET IDS: ${(shot.referencedVisibleTargetIds || []).join(", ") || "NONE"}
CARRY-OVER CHARACTER IDS: ${(shot.carryOverCharacterIds || []).join(", ") || "NONE"}
EXPECTED LOCATION: ${shot.locationId}
EXPECTED LOCKED PROP IDs: ${(shot.propIds || []).join(", ") || "NONE"}
LOCKED PROP APPEARANCE TEXT:
${(shot.propIds || []).map((id) => {
    const prop = propMap.get(id);
    return prop ? `- ${id} ${prop.name}: ${toText(prop.appearance || prop.description)}` : `- ${id}`;
}).join("\n") || "- NONE"}
PREVIOUS_CONTINUITY_SHOT_ID: ${previousContinuityShot?.id || "NONE"}
EXPECTED CONTINUITY STATE:
${resolveMentionsInFreeText(toText(shot.continuitySetup), shot) || "No additional state beyond the action and prior continuity anchor."}
PER-CHARACTER STATE CONTRACT:
${characterStateLockText}
LOCKED PROP STATE CONTRACT:
${propStateLockText}
VIDEO DIALOGUE BLOCKING CONTEXT (DO NOT FAIL STILL IMAGE FOR THIS):
${dialogueBlockingPlanText}
MOVEMENT MODE: ${shot.movementMode || "STATIC"}
ACTION:
${resolveMentionsInFreeText(toText(shot.action), shot)}
INSPECT: human count, duplicates, per-character identity (each locked character vs its own master), simultaneous visibility of all expected locked characters, background NPC allowance/compliance, required/referenced targets, continuity state, safe framing (no cropping), single frame, location match, full-frame (no letterbox/padding), wardrobe, anatomy/hands, spatial safety, prop identity and prop state vs LOCKED PROP STATE CONTRACT, position/screen-side continuity vs previous anchor (opening/closing a prop is a state change, not a relocation).
POSTURE: for each character, KNEELING requires knee contact, CROUCHING low bent knees, SEATED supported hips, STANDING feet on ground and extended legs. ACTION_DERIVED is not a hard posture requirement. Contradiction → stateContinuityPass=false.
Ignore head direction and dialogue eyeline (video-only checks).
RETURN:
{
  "pass": true,
  "humanCount": ${shot.expectedHumanCount},
  "lockedCharacterCount": ${shot.expectedHumanCount},
  "backgroundNpcCount": 0,
  "backgroundNpcPass": true,
  "identityPass": true,
  "characterIdentityMatches": ${JSON.stringify(shot.characterIds.map((id) => ({ characterId: id, match: true, reason: "exact master identity preserved" })))},
  "locationPass": true,
  "singleFramePass": true,
  "allCharactersVisible": true,
  "framingPass": true,
  "fullFramePass": true,
  "spatialSafetyPass": true,
  "referencedTargetVisiblePass": true,
  "continuityPresencePass": true,
  "positionContinuityPass": true,
  "propAppearancePass": true,
  "wardrobeContinuityPass": true,
  "anatomyPass": true,
  "headDirectionPass": true,
  "stateContinuityPass": true,
  "dialogueEyelinePass": true,
  "issues": []
}
`, qaReferencePack, 0, QA_JSON_RETRIES));
        const identityDetails = Array.isArray(result.characterIdentityMatches)
            ? result.characterIdentityMatches.map((item) => ({
                characterId: toText(item?.characterId), match: toBool(item?.match), reason: toText(item?.reason),
            })).filter((item) => item.characterId)
            : [];
        const identityMap = new Map(identityDetails.map((item) => [item.characterId, item.match]));
        const perCharacterIdentityPass = shot.characterIds.every((id) => identityMap.get(id) === true);
        const strictIdentityPass = toBool(result.identityPass) && perCharacterIdentityPass;
        const singleFramePass = toBool(result.singleFramePass);
        const allCharactersVisible = toBool(result.allCharactersVisible);
        const framingPass = toBool(result.framingPass);
        const fullFramePass = result.fullFramePass === undefined ? true : toBool(result.fullFramePass);
        const spatialSafetyPass = toBool(result.spatialSafetyPass);
        const referencedTargetVisiblePass = mustRemainVisibleIds.length ? toBool(result.referencedTargetVisiblePass) : true;
        const continuityPresencePass = mustRemainVisibleIds.length || (shot.carryOverCharacterIds || []).length ? toBool(result.continuityPresencePass) : true;
        const positionContinuityPass = previousContinuityImage ? toBool(result.positionContinuityPass) : true;
        const propAppearancePass = propRefs.length || previousContinuityImage ? toBool(result.propAppearancePass) : true;
        const wardrobeContinuityPass = shot.expectedHumanCount > 0 ? toBool(result.wardrobeContinuityPass) : true;
        const anatomyPass = shot.expectedHumanCount > 0 ? toBool(result.anatomyPass) : true;
        const headDirectionPass = true;
        const stateContinuityPass = toText(shot.continuitySetup) || (shot.incidentalSetDressing || []).length ? toBool(result.stateContinuityPass) : true;
        const dialogueEyelinePass = true;
        const detectedHumanCount = Number(result.humanCount || 0);
        const detectedBackgroundNpcCount = Math.max(0, Number(result.backgroundNpcCount || Math.max(0, detectedHumanCount - Number(shot.expectedHumanCount || 0))));
        const humanCountPass = qaNpcAllowed
            ? detectedHumanCount >= Number(shot.expectedHumanCount || 0) && detectedHumanCount <= Number(shot.expectedHumanCount || 0) + qaNpcMax && toBool(result.backgroundNpcPass)
            : detectedHumanCount === Number(shot.expectedHumanCount || 0);
        const hardPass =
            humanCountPass &&
            strictIdentityPass && toBool(result.locationPass) && verticalPass &&
            singleFramePass && allCharactersVisible && framingPass && fullFramePass &&
            referencedTargetVisiblePass && continuityPresencePass && propAppearancePass &&
            wardrobeContinuityPass && anatomyPass && headDirectionPass;
        const directorBlockingPass = positionContinuityPass && stateContinuityPass && dialogueEyelinePass && spatialSafetyPass;
        const finalPass = hardPass;
        const issues = normalizeIssues(result.issues).filter((issue) => !/(head direction|eyeline|eye[-\s]?line|dialogue blocking|speaker.*listener|looking at|staring into camera|face.*target|gaze|position continuity|spatial map|screen[-\s]?side|micro[-\s]?location|state continuity|posture|blocking|spacing|walk path|path is blocked)/i.test(issue));
        const directorNotes: string[] = [];
        if (!strictIdentityPass) {
            const failedIds = shot.characterIds.filter((id) => identityMap.get(id) !== true);
            issues.unshift(`Character identity mismatch against locked master reference: ${failedIds.join(", ") || "unknown character"}.`);
        }
        if (!verticalPass) issues.unshift(`Anchor must be ${projectAspectRatio}. Actual image: ${dimensions.width}x${dimensions.height}.`);
        if (!singleFramePass && !issues.some((item) => item.toLowerCase().includes("frame"))) issues.push("Anchor must contain one single continuous frame only.");
        if (!fullFramePass) issues.push("Full-frame failed: image contains letterbox/pillarbox bars, blurred/dark padding, inset framing, or excessive artificial empty banding.");
        if (!humanCountPass) {
            if (qaNpcAllowed) issues.push(`Human/NPC count failed: render ${shot.expectedHumanCount} locked character(s) plus at most ${qaNpcMax} nameless background NPC extras. Detected total ${detectedHumanCount}, background NPC estimate ${detectedBackgroundNpcCount}.`);
            else issues.push(`Human count failed: render exactly ${shot.expectedHumanCount} visible human(s), no extras, no duplicates, no missing cast. Detected ${detectedHumanCount}.`);
        }
        if (!allCharactersVisible && shot.expectedHumanCount > 0) issues.push("Not all expected locked characters are simultaneously visible in the frame.");
        if (!referencedTargetVisiblePass && mustRemainVisibleIds.length) issues.push(`Required/referenced visible target missing or obscured: ${mustRemainVisibleIds.join(", ")}.`);
        if (!continuityPresencePass) issues.push("Persistent character presence continuity failed.");
        if (!positionContinuityPass) directorNotes.push("Director blocking note: position/screen-side/micro-location differs from prior anchor. This is acceptable if it supports current action, but video prompt should steer blocking more clearly.");
        if (!propAppearancePass) issues.push("Prop identity continuity failed: locked prop appearance changed or no longer reads as the same prop.");
        if (!wardrobeContinuityPass) issues.push("Wardrobe continuity failed: clothing color, pattern, garment shape, or accessories changed unexpectedly.");
        if (!anatomyPass) issues.push("Human anatomy failed: hand/finger count, head/neck attachment, limb structure, or body proportions are wrong.");
        if (!stateContinuityPass) directorNotes.push("Director blocking note: posture/state does not fully match continuity setup. Treat as video/anchor prompt guidance unless identity, wardrobe, or visibility is broken.");
        if (!framingPass) issues.push("One or more expected characters are cropped, hidden, or too close to the image edge.");
        if (!spatialSafetyPass) directorNotes.push(shot.movementMode === "LOCOMOTION" ? "Director blocking note: walk path/start position may be awkward or blocked; video prompt should use a clearer path." : "Director blocking note: actor/body placement may be awkward; video prompt should improve spacing.");
        return {
            checked: true, pass: finalPass, humanCount: detectedHumanCount,
            hardPass, directorBlockingPass,
            identityPass: strictIdentityPass, identityDetails, locationPass: toBool(result.locationPass),
            verticalPass, singleFramePass, allCharactersVisible, framingPass, fullFramePass, spatialSafetyPass,
            referencedTargetVisiblePass, continuityPresencePass, positionContinuityPass, propAppearancePass,
            wardrobeContinuityPass, anatomyPass, headDirectionPass, stateContinuityPass, dialogueEyelinePass,
            imageWidth: dimensions.width, imageHeight: dimensions.height,
            issues: [...new Set(issues.filter(Boolean))],
            directorNotes: [...new Set(directorNotes.filter(Boolean))],
        };
    };
    const buildQaRegenerationFeedback = (shot, qa) => {
        if (!shot || !qa?.checked) return [];
        const feedback: string[] = [];
        const npcMode = normalizeBackgroundNpcMode(shot?.backgroundNpcMode);
        const npcMax = Math.max(0, Math.min(60, Number(shot?.backgroundNpcMaxCount || maxBackgroundNpcCountForMode(npcMode))));
        const npcAllowed = npcMode !== "NONE" && npcMax > 0;
        const humanCountBad = npcAllowed
            ? Number(qa.humanCount || 0) < Number(shot.expectedHumanCount || 0) || Number(qa.humanCount || 0) > Number(shot.expectedHumanCount || 0) + npcMax
            : Number(qa.humanCount) !== Number(shot.expectedHumanCount);
        if (humanCountBad) {
            if (npcAllowed) {
                feedback.push(`Human/NPC count failed: render exactly ${shot.expectedHumanCount} locked main character(s) plus at most ${npcMax} nameless background NPC extras. Previous candidate counted ${Number(qa.humanCount || 0)} total human(s).`);
                feedback.push(`NPC control required: extras must stay background/edge-frame and must not hide, duplicate, replace, or resemble locked cast IDs ${shot.characterIds.join(", ") || "NONE"}.`);
            } else {
            feedback.push(`Human count failed: render exactly ${shot.expectedHumanCount} visible human(s), no extras, no duplicates, no missing cast. Previous candidate counted ${Number(qa.humanCount || 0)}.`);
            if (Number(qa.humanCount || 0) > Number(shot.expectedHumanCount || 0)) {
                feedback.push(`Extra human removal required: allowed cast IDs are ONLY ${shot.characterIds.join(", ") || "NONE"}. Remove every unlisted person.`);
            }
            }
        }
        if (!qa.identityPass) {
            const failedIdentityIds = Array.isArray(qa.identityDetails) ? qa.identityDetails.filter((item) => item && item.match !== true) : [];
            if (failedIdentityIds.length) {
                failedIdentityIds.forEach((item) => {
                    const char = characterMap.get(item.characterId);
                    feedback.push(`${item.characterId} (${char?.name || item.characterId}) IDENTITY FAILED: face/hair/skin/wardrobe must match THIS character's own reference. Reason: ${toText(item.reason) || "unknown"}.`);
                });
            } else {
                feedback.push(`Identity failed: independently match EVERY listed character (${shot.characterIds.join(", ")}) to its own CHARACTER_MASTER.`);
            }
            feedback.push("Wardrobe lock per character: each outfit must match THEIR OWN reference tile, not another character's.");
            feedback.push("Reference contamination guard: ignore background humans in any CHARACTER_MASTER tile.");
        }
        if (!qa.verticalPass) feedback.push(`Format failed: regenerate as one strict ${projectAspectLabel} frame.`);
        if (!qa.singleFramePass) feedback.push("Single-frame failed: output one continuous photographic frame only.");
        if (!qa.fullFramePass) feedback.push(`Full-frame failed: fill the entire ${projectAspectRatio} canvas edge-to-edge with real scene content. No letterbox, no padding, no inset image.`);
        if (!qa.allCharactersVisible) feedback.push(`Visibility failed: every expected character must be visible simultaneously: ${shot.characterIds.join(", ") || "NONE"}.`);
        if (!qa.framingPass) {
            feedback.push(`Framing failed — NO CROPPING: every required character (${shot.characterIds.join(", ") || "NONE"}) fully inside the ${projectAspectRatio} canvas with ≥ 8% safe margin.`);
            feedback.push("To fix cropping: zoom OUT / move the camera BACK / widen field of view / recenter the group.");
        }
        if (!qa.locationPass) feedback.push(`Location failed: keep the image inside locked location ${shot.locationId}.`);
        if (!qa.spatialSafetyPass) feedback.push("Director soft note: improve body spacing/path so characters do not look awkward around furniture, walls, props, or people. Do not treat this as a cast/identity failure.");
        if (!qa.referencedTargetVisiblePass) feedback.push(`Referenced target failed: ${mergeIdLists(shot.mustRemainVisibleIds, shot.referencedVisibleTargetIds).join(", ") || "NONE"} must be readable.`);
        if (!qa.continuityPresencePass) feedback.push("Presence continuity failed: carry-over/required characters must remain visible.");
        if (!qa.positionContinuityPass) feedback.push("Director soft note: improve blocking/position. Preserve the same location and locked prop placement, but character pose and micro-position may change naturally to support the current action/camera.");
        const issuesText = normalizeIssues(qa.issues).join(" ");
        if (!qa.propAppearancePass) {
            feedback.push(`Prop identity failed: preserve every locked prop's exact color, pattern, material, texture, wear, and details. Locked prop IDs: ${(shot.propIds || []).join(", ") || "NONE"}.`);
            feedback.push("Prop scale/placement lock: same proportions, footprint, depth, screen side, and distance to the active character.");
            if (/(unattended|center of the frame|placed unattended|different spear|holds a different|handling state|screen placement)/i.test(issuesText)) {
                feedback.push("Prop handling failed: each locked prop must stay with its required character/hand. Do not place it unattended or substitute it.");
            }
            if (/(right[-\s]?hand|tangan kanan)/i.test(issuesText)) {
                feedback.push("Right-hand prop condition failed: the required locked prop must be visibly held in the right hand.");
            }
            (shot.propIds || []).forEach((id) => {
                const prop = propMap.get(id);
                if (propLooksLikeStaff(prop, issuesText)) {
                    feedback.push(`${id} staff/tongkat hard correction: blunt aged dark-brown wooden staff with rounded root-knot top and metal rings. No spearhead, blade, or lance.`);
                }
            });
        }
        if (hasPropClosedIntent(issuesText)) {
            feedback.push("Critical prop state failed: render the locked chest/container CLOSED. Lid shut, contents not visible.");
        }
        if (!hasPropClosedIntent(issuesText) && /lid\s+must\s+be\s+open|must\s+be\s+open|open-?chest\s+action\s+state\s+is\s+missing|required\s+end\s+state[^.\n;]*open/i.test(issuesText)) {
            feedback.push("Critical prop state failed: render the locked chest/container OPEN now.");
        }
        if (!hasPropClosedIntent(issuesText) && /see\s+the\s+contents|contents?\s+visible|isi(?:nya)?\s+terlihat|melihat\s+isi/i.test(issuesText)) {
            feedback.push("Critical prop contents visibility failed: frame the container so its contents are readable.");
        }
        if (!qa.wardrobeContinuityPass) feedback.push("Wardrobe failed: preserve each character's exact wardrobe from THEIR OWN CHARACTER_MASTER and PREVIOUS_CONTINUITY_ANCHOR.");
        if (!qa.anatomyPass) feedback.push("Anatomy failed: realistic hands and bodies; five natural fingers per visible hand.");
        if (!qa.stateContinuityPass) {
            feedback.push(`Director soft note: posture/state should better support continuity, but identity/wardrobe/cast remain the hard lock. Compact state guide:\n${buildCompactCharacterStateContract(shot)}`);
            if (/\bstanding\b/i.test(buildCompactCharacterStateContract(shot)) && /\b(seated|sitting|sit|cross[-\s]?legged|bersila|duduk|kneeling|crouching|jongkok|squat)\b/i.test(issuesText)) {
                feedback.push("Standing-posture correction: any character contracted as STANDING must be upright at full standing height with feet on the floor and extended legs visible.");
            }
        }
        (qa.directorNotes || []).forEach((note) => feedback.push(note));
        const issueFeedback = normalizeIssues(qa.issues).map((issue) => `QA issue: ${limitText(issue, 360)}`);
        const priorityFeedback = [
            ...feedback.filter((item) => /identity|wardrobe|posture|state continuity|physical state|framing|crop/i.test(item)),
            ...feedback.filter((item) => !/identity|wardrobe|posture|state continuity|physical state|framing|crop/i.test(item)),
            ...issueFeedback,
        ];
        return uniqueStrings(priorityFeedback).slice(0, 10);
    };
    const isHardAnchorStateCorrection = (feedbackItems = []) => {
        const text = (Array.isArray(feedbackItems) ? feedbackItems : [feedbackItems]).map(toText).join(" ").toLowerCase();
        if (!text) return false;
        return (
            /standing-posture correction|hard posture lock|posture=standing|required compact physical state contract|state continuity failed/i.test(text) ||
            /standing[^.;\n]{0,160}(seated|sitting|cross[-\s]?legged|bersila|kneeling|crouched|crouching|jongkok|squat|duduk)/i.test(text) ||
            /(seated|sitting|cross[-\s]?legged|bersila|kneeling|crouched|crouching|jongkok|squat|duduk)[^.;\n]{0,160}standing/i.test(text) ||
            /required closed prop state|open_state=closed|required closed|must remain closed|lid must remain shut|contents must not be visible|render the locked chest\/container closed/i.test(text) ||
            /required open prop state|open_state=open|must be open|open-chest action state is missing|render the locked chest\/container open/i.test(text)
        );
    };
    const validateAnchor = async (shotId) => {
        const shot = repairShotForRuntime(shots.find((item) => item.id === shotId));
        if (!shot?.anchorImage) throw new Error("ANCHOR_REQUIRED");
        setShots((prev) => prev.map((item) => item.id === shotId ? repairShotForRuntime(item) : item));
        setProgress(`QA ${shot.id}: checking ${projectAspectRatio} frame, full cast and continuity...`);
        const qa = await inspectAnchorCandidate(shot, shot.anchorImage);
        const feedback = buildQaRegenerationFeedback(shot, qa);
        setShots((prev) => prev.map((item) => (item.id === shotId ? {
            ...item,
            qa,
            anchorQaFeedback: feedback,
            anchorNeedsManualFix: !qa.pass,
        } : item)));
        return qa;
    };
    const regenerateAndValidateAnchor = async (shotId, options: any = {}) => {
        const runId = options.runId || beginAnchorGenerationRun();
        const manageBusy = options.manageBusy !== false;
        if (manageBusy) { setBusy(true); setError(""); }
        try {
            const initialShot = repairShotForRuntime(shots.find((item) => item.id === shotId));
            let previousQaIssues = (initialShot?.anchorQaFeedback?.length ? initialShot.anchorQaFeedback : buildQaRegenerationFeedback(initialShot, initialShot?.qa));
            let lastFeedback: string[] = [];
            let lastFailedAnchor = "";
            for (let attempt = 1; attempt <= ANCHOR_QA_MAX_ATTEMPTS; attempt++) {
                throwIfAnchorGenerationStopped(runId);
                setProgress(`Anchor ${shotId} attempt ${attempt}/${ANCHOR_QA_MAX_ATTEMPTS} — generating fresh ${projectAspectRatio} frame${previousQaIssues.length ? " with QA corrections" : ""}...`);
                const anchor = await generateAnchor(shotId, previousQaIssues, runId, lastFailedAnchor);
                throwIfAnchorGenerationStopped(runId);
                const shot = repairShotForRuntime(shots.find((item) => item.id === shotId));
                if (!shot) throw new Error("SHOT_NOT_FOUND_AFTER_ANCHOR");
                const qa = await inspectAnchorCandidate(shot, anchor);
                throwIfAnchorGenerationStopped(runId);
                if (qa.pass) {
                    const feedback = buildQaRegenerationFeedback(shot, qa);
                    setShots((prev) => prev.map((item) => item.id === shotId ? {
                        ...item, anchorImage: anchor, anchorStatus: "ready", qa, anchorQaFeedback: feedback, anchorNeedsManualFix: false,
                    } : item));
                    setProgress(feedback.length
                        ? `Anchor ${shotId} SOFT PASS — hard locks OK, ${feedback.length} director note(s) saved for video prompt.`
                        : `Anchor ${shotId} PASS — hard locks verified.`);
                    return true;
                }
                previousQaIssues = buildQaRegenerationFeedback(shot, qa);
                lastFeedback = previousQaIssues;
                lastFailedAnchor = "";
                setShots((prev) => prev.map((item) => item.id === shotId ? {
                    ...item, anchorImage: anchor, anchorStatus: "ready", qa, anchorQaFeedback: previousQaIssues, anchorNeedsManualFix: true,
                } : item));
                setProgress(attempt < ANCHOR_QA_MAX_ATTEMPTS
                    ? `Anchor ${shotId} failed hard QA; next attempt will use ${previousQaIssues.length} QA correction(s)${lastFailedAnchor ? " and edit the failed candidate" : " with a fresh render"}.`
                    : `Anchor ${shotId} failed hard QA. QA feedback saved; retry manually to avoid extra image spend.`);
            }
            setError(`ANCHOR_QA_FAILED_MANUAL_RETRY_REQUIRED — saved ${lastFeedback.length} correction(s). Review QA issues, then click Generate Anchor or Generate + QA Anchor manually.`);
            return false;
        } catch (err) {
            if (err?.message === ANCHOR_STOPPED_ERROR) return false;
            handleError(err);
            return false;
        } finally {
            if (manageBusy) { setBusy(false); setProgress(""); }
        }
    };
    const prepareSelectedShot = async () => {
        if (!selectedShotId) return;
        await regenerateAndValidateAnchor(selectedShotId);
    };
    const generateSelectedAnchorOnly = async () => {
        if (!selectedShotId) return;
        const runId = beginAnchorGenerationRun();
        setBusy(true); setError("");
        try {
            setProgress(`Anchor ${selectedShotId}: generating image only...`);
            const shot = shots.find((item) => item.id === selectedShotId);
            const savedFeedback = shot?.anchorQaFeedback?.length ? shot.anchorQaFeedback : buildQaRegenerationFeedback(shot, shot?.qa);
            const correctionSource = "";
            await generateAnchor(selectedShotId, savedFeedback, runId, correctionSource);
            throwIfAnchorGenerationStopped(runId);
            setProgress(`Anchor ${selectedShotId} generated. QA skipped for speed.`);
            if (typeof window !== "undefined") window.setTimeout(() => setProgress(""), 1600);
        } catch (err) {
            if (err?.message !== ANCHOR_STOPPED_ERROR) handleError(err);
        } finally {
            setBusy(false);
        }
    };
    // Import anchor image manual (paste screenshot / upload file) sebagai referensi video.
    // Dipakai untuk mengunci komposisi agar object tidak pindah-pindah antar shot.
    const applyImportedAnchorImage = async (dataUrl: string) => {
        if (!selectedShotId) { setError("Pilih shot dulu sebelum menempel/mengunggah gambar anchor."); return; }
        if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) { setError("Gambar tidak valid. Tempel/upload file gambar (PNG/JPG)."); return; }
        try {
            setProgress("Memasang anchor image dari gambar yang di-import...");
            const compressed = await compressDataUrlImage(dataUrl, 1536, 0.92);
            setShots((prev) => prev.map((item) => item.id === selectedShotId ? {
                ...item,
                anchorImage: compressed,
                anchorStatus: "ready",
                anchorImported: true,
                anchorQaFeedback: [],
                anchorNeedsManualFix: false,
                qa: makeShotQA(),
            } : item));
            setProgress("Anchor image di-import. Dipakai sebagai frame referensi untuk GENERATE VIDEO.");
            if (typeof window !== "undefined") window.setTimeout(() => setProgress(""), 1800);
        } catch (err) {
            handleError(err);
        }
    };
    const importAnchorImageFromFile = async (file: File | null | undefined) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) { setError("File harus berupa gambar (PNG/JPG)."); return; }
        try {
            const dataUrl = await blobToDataUrl(file);
            await applyImportedAnchorImage(String(dataUrl));
        } catch (err) {
            handleError(err);
        }
    };
    const handleAnchorPaste = async (event: React.ClipboardEvent) => {
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find((it) => it.type.startsWith("image/"));
        if (!imageItem) return; // biarkan paste teks biasa jika bukan gambar
        event.preventDefault();
        const file = imageItem.getAsFile();
        await importAnchorImageFromFile(file);
    };
    const createImageFromDirectAnchorPrompt = async () => {
        if (!selectedShotId || busy) return;
        const prompt = toText(selectedShot?.directAnchorPrompt);
        if (!prompt) {
            setError("Isi DIRECT ANCHOR PROMPT terlebih dahulu sebelum CREATE IMAGE.");
            return;
        }
        const { ambiguous } = resolveDirectAnchorAssetTags(prompt, selectedShot);
        if (ambiguous.length) {
            setError(`Tag Master Asset ambigu: ${ambiguous.map((tag) => `@${tag}`).join(", ")}. Gunakan tag @ID dari tombol TAG CEPAT agar referensinya pasti.`);
            return;
        }
        await generateSelectedAnchorOnly();
    };
    const prepareAllAnchors = async () => {
        if (!shots.length) { setError("Belum ada shot untuk diproses."); return; }
        const runId = beginAnchorGenerationRun();
        setBusy(true); setError("");
        try {
            for (let i = 0; i < shots.length; i++) {
                if (isAnchorGenerationStopped(runId)) break;
                const shotId = shots[i].id;
                setSelectedShotId(shotId);
                setProgress(`All shots: anchor + QA ${i + 1}/${shots.length}`);
                await regenerateAndValidateAnchor(shotId, { runId, manageBusy: false });
            }
        } catch (err) { handleError(err); } finally { setBusy(false); setProgress(""); }
    };
    const renderShotWithVideoEngine = async (shotId) => {
        // ensureShotVideoPrompt otomatis meng-compile master prompt untuk shot manual.
        const shot = ensureShotVideoPrompt(shots.find((item) => item.id === shotId));
        if (!shot) throw new Error("SHOT_NOT_FOUND");
        if (!shot.anchorImage) throw new Error("ANCHOR_REQUIRED");
        const qaWarning = !shot.qa?.checked ? "QA belum dicek" : !shot.qa?.pass ? "QA FAIL" : "QA PASS";
        const runtimeVideoPrompt = buildModelVideoPrompt(shot, selectedVideoModel, selectedVideoModelInfo);
        if (runtimeVideoPrompt.length > VIDEO_PROMPT_API_LIMIT) throw new Error(`VIDEO_PROMPT_TOO_LONG_AFTER_COMPACT_${runtimeVideoPrompt.length}`);
        setShots((prev) => prev.map((item) => item.id === shotId
            ? { ...item, videoStatus: "generating", videoUrl: null, videoRemoteUri: null }
            : item));
        try {
            setProgress(`${shotId}: ${qaWarning} — tetap generate video. Sending ${runtimeVideoPrompt.length.toLocaleString()} char ${selectedVideoModel} prompt (camera mode: ${shot.cameraMovement || DEFAULT_CAMERA_MOVEMENT}) to Google video...`);
            const job = await startOpenRouterVideo({
                prompt: runtimeVideoPrompt,
                anchorImage: shot.anchorImage,
                aspectRatio: projectAspectRatio,
                durationSeconds: shot.durationSeconds || 8,
                model: selectedVideoModel,
                resolution: videoResolution,
                generateAudio: videoGenerateAudio,
            });
            const jobId = job?.id || job?.job_id || job?.generation_id;
            if (!jobId) throw new Error("GOOGLE_VIDEO_JOB_ID_MISSING");
            setShots((prev) => prev.map((item) => item.id === shotId ? { ...item, operationName: jobId, videoStatus: "generating" } : item));
            const completed = await pollOpenRouterVideo(jobId, (text) => setProgress(`${shotId}: ${text}`));
            setProgress(`${shotId}: downloading generated clip...`);
            const localBlobUrl = await downloadOpenRouterVideoToBlobUrl(jobId);
            setProgress(`${shotId}: capturing final video frame for next-shot continuity...`);
            let videoLastFrameImage = "";
            try {
                const lastFrameDataUrl = await captureVideoLastFrameImage(localBlobUrl);
                videoLastFrameImage = await uploadGeneratedAsset(lastFrameDataUrl, `video-last-frame-${shotId}`);
            } catch (captureError) {
                console.warn(`[video:${shotId}] last-frame capture skipped`, captureError);
            }
            const remoteUri = completed.unsigned_urls?.[0] || completed.polling_url || jobId;
            setShots((prev) => prev.map((item) => {
                if (item.id !== shotId) return item;
                if (typeof item.videoUrl === "string" && item.videoUrl.startsWith("blob:")) URL.revokeObjectURL(item.videoUrl);
                return {
                    ...item,
                    operationName: jobId,
                    videoRemoteUri: remoteUri,
                    videoUrl: localBlobUrl,
                    videoStatus: "ready",
                    videoLastFrameImage: videoLastFrameImage || item.videoLastFrameImage || null,
                    videoLastFrameCapturedAt: videoLastFrameImage ? Date.now() : (item.videoLastFrameCapturedAt || null),
                };
            }));
            return localBlobUrl;
        } catch (err) {
            setShots((prev) => prev.map((item) => item.id === shotId ? { ...item, videoStatus: "error" } : item));
            throw err;
        }
    };
    const renderSelectedShot = async () => {
        if (!selectedShotId) return;
        setBusy(true); setError("");
        try { await renderShotWithVideoEngine(selectedShotId); }
        catch (err) { handleError(err); }
        finally { setBusy(false); setProgress(""); }
    };
    const copyTextToClipboard = async (value, successLabel = "Copied") => {
        const textValue = typeof value === "string" ? value : toText(value);
        if (!textValue) { setError("Tidak ada prompt yang bisa dicopy."); return false; }
        let ok = false;
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(textValue);
                ok = true;
            }
        } catch { ok = false; }
        if (!ok) {
            try {
                const textarea = document.createElement("textarea");
                textarea.value = textValue;
                textarea.setAttribute("readonly", "");
                textarea.style.position = "fixed";
                textarea.style.top = "0";
                textarea.style.left = "0";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                ok = document.execCommand("copy");
                document.body.removeChild(textarea);
            } catch { ok = false; }
        }
        if (ok) {
            setProgress(`${successLabel} copied to clipboard.`);
            window.setTimeout(() => setProgress(""), 1400);
            return true;
        }
        setError("Gagal copy ke clipboard. Browser/iframe mungkin memblokir. Coba klik lagi atau copy manual dari kotak prompt.");
        return false;
    };
    const downloadBlobUrl = (url, filename) => {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    const getAllReferenceAssets = () => [
        ...characters.map((item) => ({ ...item, assetType: "CHAR" })),
        ...locations.map((item) => ({ ...item, assetType: "LOC" })),
        ...props.map((item) => ({ ...item, assetType: "PROP" })),
    ];
    const downloadAllAssetsZip = async () => {
        setError(""); setProgress("Packaging locked production assets into ZIP...");
        try {
            const assets = getAllReferenceAssets();
            if (!assets.length) throw new Error("NO_ASSETS_AVAILABLE");
            const missing = assets.filter((item) => !item.referenceImage);
            if (missing.length) throw new Error(`ASSET_REFERENCE_MISSING: ${missing.map((item) => item.id).join(", ")}`);
            const zipFiles = await Promise.all(assets.map(async (item) => {
                const parsed = parseDataUrl(await materializeImageForAi(item.referenceImage));
                const extension = mimeToExtension(parsed.mimeType);
                return { name: `${item.id}.${extension}`, data: base64ToUint8Array(parsed.data) };
            }));
            const zipBlob = createZipBlob(zipFiles);
            const zipUrl = URL.createObjectURL(zipBlob);
            const safeTitle = toText(project.title).replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "") || "SLENDRO";
            downloadBlobUrl(zipUrl, `${safeTitle}_ASSETS.zip`);
            window.setTimeout(() => URL.revokeObjectURL(zipUrl), 30000);
            setProgress(`ZIP ready: ${zipFiles.length} asset(s) packaged with production-ID filenames.`);
            window.setTimeout(() => setProgress(""), 2200);
        } catch (err) { handleError(err); setProgress(""); }
    };
    const allReferenceAssets = getAllReferenceAssets();
    const allAssetsDownloadReady = allReferenceAssets.length > 0 && allReferenceAssets.every((item) => Boolean(item.referenceImage));
    const flashCredits = useMemo(
        () => (accountCredits.quotas || []).find((item) => quotaMatches(item, /text|gpt_text|luna|mini|nano/i)) ||
            (accountCredits.quotas || []).find((item) => !quotaMatches(item, /image|pro/i)) || null,
        [accountCredits.quotas]
    );
    const proCredits = useMemo(
        () => (accountCredits.quotas || []).find((item) => quotaMatches(item, /image|gpt_image|gpt-image/i)) || null,
        [accountCredits.quotas]
    );
    const detectedCreditRows = useMemo(() => {
        const seen = new Set();
        return (accountCredits.quotas || []).filter((quota) => {
            const key = quotaKey(quota);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 5);
    }, [accountCredits.quotas]);
    const detectedModelRows = useMemo(
        () => (Array.isArray(accountCredits.raw?.models) ? accountCredits.raw.models : []).slice(0, 5),
        [accountCredits.raw]
    );
    const formatCredits = (quota) => {
        if (!quota) return "--";
        if (quota.total === 0 && quota.remaining === 0) return "UNLIMITED";
        const remaining = asFiniteNumber(quota.remaining);
        const total = asFiniteNumber(quota.total);
        if (remaining !== null && total !== null) return `${remaining.toLocaleString("id-ID")}/${total.toLocaleString("id-ID")}`;
        if (remaining !== null) return remaining.toLocaleString("id-ID");
        if (asFiniteNumber(quota.usage_percentage) !== null) return `${asFiniteNumber(quota.usage_percentage)}% used`;
        return "--";
    };
    const formatCreditReset = (quota) => {
        if (!quota?.reset_at) return "Reset time unavailable";
        const raw = asFiniteNumber(quota.reset_at);
        const date = raw !== null ? new Date(raw < 1e12 ? raw * 1000 : raw) : new Date(quota.reset_at);
        if (Number.isNaN(date.getTime())) return "Reset time unavailable";
        return `Reset ${date.toLocaleString("id-ID")}`;
    };
    const creditDebugText = detectedCreditRows.length
        ? `Detected: ${detectedCreditRows.map((quota) => `${quota.label}=${formatCredits(quota)}`).join(" | ")}`
        : detectedModelRows.length
            ? `No quota rows returned; models visible: ${detectedModelRows.map((model) => model.display_name || model.model_name).join(", ")}`
            : accountCredits.error || "No quota rows returned by /credits";
    const creditStatusTitle = accountCredits.status === "error"
        ? `Credit bridge error: ${accountCredits.error || "unknown"}`
        : accountCredits.status === "stale"
            ? `Credit data may be stale: ${accountCredits.error || "refresh failed"}`
            : `Google AI usage${accountCredits.fetchedAt ? ` • updated ${new Date(accountCredits.fetchedAt).toLocaleTimeString("id-ID")}` : ""} • ${creditDebugText}`;
    const isUsageLogWindow = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "usage-log";
    const openUsageLogTab = () => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        url.searchParams.set("view", "usage-log");
        window.open(url.toString(), "_blank", "noopener,noreferrer");
    };
    const selectedVideoPromptProfile = getVideoPromptProfile(selectedVideoModel, selectedVideoModelInfo);
    const selectedModelVideoPrompt = selectedShot ? (() => {
        try {
            return buildModelVideoPrompt(selectedShot, selectedVideoModel, selectedVideoModelInfo);
        } catch {
            return selectedShot.videoPrompt || "";
        }
    })() : "";
    const setImageProviderForProject = (provider) => {
        setSelectedImageProvider(provider);
        setProject((prev) => ({ ...prev, imageProvider: provider }));
    };
    const insertIntoCharacterPrompt = (dir, snippet) => {
        const textarea = document.getElementById(`char-prompt-${dir.characterId}`) as HTMLTextAreaElement | null;
        const current = dir.scenePrompt || "";
        const start = textarea?.selectionStart ?? current.length;
        const prefix = start > 0 && !/\s$/.test(current.slice(0, start)) ? " " : "";
        const next = `${current.slice(0, start)}${prefix}${snippet} ${current.slice(start)}`;
        updateSelectedShotCharacterDirection(dir.characterId, "scenePrompt", next);
    };

    // Insert @mention snippet ke textarea SHOT ACTION / CONTINUITY SETUP di posisi kursor.
    const insertIntoShotTextField = (field: "action" | "continuitySetup", snippet: string) => {
        if (!selectedShot) return;
        const textarea = document.getElementById(`shot-${field}-${selectedShot.id}`) as HTMLTextAreaElement | null;
        const current = toText(selectedShot[field]);
        const start = textarea?.selectionStart ?? current.length;
        const prefix = start > 0 && !/\s$/.test(current.slice(0, start)) ? " " : "";
        const next = `${current.slice(0, start)}${prefix}${snippet} ${current.slice(start)}`;
        updateSelectedShotTextField(field, next);
    };

    // Insert @mention snippet ke textarea CAMERA SCRIPT di posisi kursor.
    const insertIntoCameraScript = (snippet: string) => {
        if (!selectedShot) return;
        const textarea = document.getElementById(`shot-camerascript-${selectedShot.id}`) as HTMLTextAreaElement | null;
        const current = toText(selectedShot.cameraScript);
        const start = textarea?.selectionStart ?? current.length;
        const prefix = start > 0 && !/\s$/.test(current.slice(0, start)) ? " " : "";
        const next = `${current.slice(0, start)}${prefix}${snippet} ${current.slice(start)}`;
        updateSelectedShotCameraScript(next);
    };

    const navigation = [
        { id: "project", label: "PROJECT", icon: <Film size={15}/> },
        { id: "assets", label: "ASSETS", icon: <Users size={15}/> },
        { id: "render", label: "SCENE ANCHOR", icon: <ImageIcon size={15}/> },
        { id: "usage", label: "USAGE LOG", icon: <Table2 size={15}/> },
    ];
    return (<div className="studio min-h-screen bg-[#f7f8fa] text-black">
      <div className="scanline"/>
      {!authenticated ? (
        <LoginPage onLogin={handleLogin}/>
      ) : !activeWorkspaceId ? (
        <WorkspaceGate
          workspaces={workspaces}
          workspaceName={workspaceName}
          onWorkspaceNameChange={setWorkspaceName}
          onCreateWorkspace={createWorkspace}
          onOpenWorkspace={openWorkspace}
          onRenameWorkspace={renameWorkspace}
          onDeleteWorkspace={deleteWorkspace}
          onLogout={handleLogout}
        />
      ) : (<>
        {!isUsageLogWindow && (<header className="header">
          <div className="brand flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="orbitron text-sm font-bold tracking-[0.16em]">COUNTSISTENT</span>
                <span className="green"> //</span>
                <span className="mono text-[11px] muted">{activeWorkspace?.name || "DIRECTOR AI MICRODRAMA BY MORA TEKNOLOGI"}</span>
              </div>
            </div>
          </div>
          <div className="header-actions hidden lg:flex gap-2 items-center">
            <StatusBadge label={`${characters.filter((x) => x.locked).length}/${characters.length} CAST`} active={characters.length > 0 && characters.every((item) => item.locked)}/>
            <StatusBadge label={`${locations.filter((x) => x.locked).length}/${locations.length} LOC`} active={locations.length > 0 && locations.every((item) => item.locked)}/>
            <StatusBadge label={`${shots.filter((x) => x.qa?.pass).length}/${shots.length} QA`} active={shots.length > 0 && shots.every((shot) => shot.qa?.pass)}/>
            <div className="credit-cluster" title={creditStatusTitle}>
              <div className={`credit-chip ${accountCredits.status === "error" ? "credit-error" : ""}`} title={flashCredits ? formatCreditReset(flashCredits) : creditStatusTitle}>
                <span className="credit-name">TEXT</span>
                <strong>{formatCredits(flashCredits)}</strong>
              </div>
              <div className={`credit-chip ${accountCredits.status === "error" ? "credit-error" : ""}`} title={proCredits ? formatCreditReset(proCredits) : creditStatusTitle}>
                <span className="credit-name">IMAGE</span>
                <strong>{formatCredits(proCredits)}</strong>
              </div>
              <button type="button" className="credit-refresh" disabled={creditsRefreshing} onClick={() => loadAccountCredits({ silent: false, forceCookieRefresh: true })} title="Refresh Google AI usage">
                <RefreshCw size={12} className={creditsRefreshing ? "animate-spin" : ""}/>
              </button>
            </div>
            <div className="save-state">{saveMessage}</div>
            <button type="button" disabled={!storageReady || savingProject} onClick={() => saveProjectNow({ silent: false })} className="header-save">
              {savingProject ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>}
              SAVE PROJECT
            </button>
            <button type="button" disabled={!storageReady || savingProject || clearingProject} onClick={clearProjectNow} className="header-clear">
              {clearingProject ? <Loader2 size={12} className="animate-spin"/> : <Trash2 size={12}/>}
              CLEAR PROJECT
            </button>
            <button type="button" onClick={closeWorkspace} className="header-clear">
              <Boxes size={12}/>
              WORKSPACES
            </button>
            <button type="button" onClick={handleLogout} className="header-clear">
              <Lock size={12}/>
              LOGOUT
            </button>
          </div>
        </header>)}
        <div className={isUsageLogWindow ? "usage-window-shell" : "app-shell flex min-h-[calc(100vh-78px)]"}>
          {!isUsageLogWindow && (<aside className="sidebar">
            <div className="side-label">PRODUCTION</div>
            <div className="space-y-2">
              {navigation.map((item) => (<button key={item.id} type="button" onClick={() => item.id === "usage" ? openUsageLogTab() : setStage(item.id)} className={stage === item.id && item.id !== "usage" ? "nav active" : "nav"}>
                {item.icon}
                <span>{item.label}</span>
                <ChevronRight size={12} className="ml-auto"/>
              </button>))}
            </div>
            <div className="side-divider"/>
            <div className="strict"><ShieldCheck size={14}/>STRICT CONTEXT</div>
            <p className="side-note mono text-[10px] muted leading-5 mt-3">
              LOCKED DATA OVERRIDES AI CREATIVITY.
              <br />
              MANUAL SHOT MODE.
              <br />
              API: ../morai-backend bun :8787
              <br />
              PROJECT: {saveMessage}
            </p>
          </aside>)}
          <main className={isUsageLogWindow ? "usage-window-workspace" : "workspace flex-1 min-w-0 p-5 md:p-8"}>
            {isUsageLogWindow ? (<section className="usage-window-section">
              <PageTitle code="LOG" title="USAGE LOG" subtitle="Rows read directly from Postgres ai_usage_events."/>
              <UsageLogTable rows={usageLogRows} loading={usageLogLoading} error={usageLogError} onRefresh={() => loadUsageLogs({ silent: false })}/>
            </section>) : (<>
              {(busy || progress) && (<div className="progress-box mb-5">
                <Loader2 size={15} className={busy ? "animate-spin" : ""}/>
                <span>{progress || "Processing..."}</span>
              </div>)}
              {error && (<div className="error-box mb-5">
                <AlertTriangle size={17}/>
                <div className="flex-1">
                  <div className="mono text-[11px] tracking-[0.15em]">PRODUCTION_ERROR</div>
                  <div className="mono text-[12px] mt-2 whitespace-pre-wrap break-words">{error}</div>
                </div>
                <button type="button" onClick={() => setError("")}>×</button>
              </div>)}
              {stage === "project" && (<section className="max-w-5xl">
                <PageTitle code="01" title="MAKE YOUR OWN DRAMA" subtitle="COUNTSISTENT AI, structures your story like a film director — from concept to consistent scenes"/>
                <Panel title="CORE SERIES CONTEXT" icon={<Film size={16}/>}>
                  <div className="grid md:grid-cols-2 gap-4">
                    <InputField label="SERIES TITLE" value={project.title} placeholder="CEO Dalam Bayangan" onChange={(value) => setProject((prev) => ({ ...prev, title: value }))}/>
                    <SelectField label="GENRE / STORY TYPE" value={project.genre} values={GENRE_PRESETS} onChange={(value) => setProject((prev) => ({ ...prev, genre: value }))}/>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <SelectField
                      label="REGION"
                      value={project.regionMode}
                      values={["Indonesia", "Luar Indonesia"]}
                      onChange={(value) => {
                        const nextCountry = value === "Indonesia"
                          ? "Indonesia"
                          : (project.country && project.country !== "Indonesia" ? project.country : "China");
                        setProject((prev) => ({ ...prev, regionMode: value, country: nextCountry, language: getCountryLanguage(nextCountry) }));
                      }}
                    />
                    {project.regionMode === "Indonesia" ? (
                      <div>
                        <div className="field-label">COUNTRY / LANGUAGE LOCK</div>
                        <div className="input min-h-[44px] flex items-center justify-between gap-3">
                          <span>Indonesia</span>
                          <span className="mono green text-[11px]">BAHASA INDONESIA</span>
                        </div>
                      </div>
                    ) : (
                      <SelectField
                        label="COUNTRY"
                        value={project.country === "Indonesia" ? "China" : project.country}
                        values={INTERNATIONAL_REGIONS.map((item) => item.country)}
                        onChange={(value) => setProject((prev) => ({ ...prev, country: value, language: getCountryLanguage(value) }))}
                      />
                    )}
                  </div>
                  {project.regionMode !== "Indonesia" && (
                    <div className="mono text-[11px] muted mb-4">
                      LANGUAGE LOCK // {regionProfile.language.toUpperCase()} // Characters, dialogue, names, locations, wardrobe, props, signage, vehicles, food, architecture, and cultural details follow {regionProfile.country.toUpperCase()}.
                    </div>
                  )}
                  {project.regionMode === "Indonesia" && (
                    <div className="mono text-[11px] muted mb-4">
                      REGION LOCK // INDONESIA // All named characters, dialogue, locations, wardrobe, props, signage, vehicles, food, architecture, and cultural details remain Indonesian. Historical/dynasty genres automatically use period-appropriate Nusantara assets.
                    </div>
                  )}
                  <TextAreaField label="ONE SENTENCE / PREMISE" value={project.premise} rows={toText(project.premise) ? 3 : 2} placeholder="Seorang laki-laki miskin yang selalu diremehkan ternyata CEO dealer mobil terbesar di Indonesia." onChange={(value) => setProject((prev) => ({ ...prev, premise: value }))}/>
                </Panel>
                <div className="mt-5">
                  <Panel title="HERMES MUSE-VIDEO" icon={<Sparkles size={16}/>}>
                    <div className="mono muted text-[11px] leading-5">
                      Jalankan Hermes Agent lokal dengan skill <b>muse-video</b> untuk membuat Creative Pack drama vertikal. Output ini tidak render video; pakai sebagai arahan story, shot, anchor, dan prompt.
                    </div>
                    <textarea
                      className="input"
                      rows={4}
                      value={museBrief}
                      onChange={(event) => setMuseBrief(event.target.value)}
                      onKeyDown={(event) => event.stopPropagation()}
                      placeholder="Tambahan brief: target audience, referensi drama, tone, konflik utama, batasan, jumlah episode/shot, atau gaya platform. Jika kosong, Hermes memakai project state di atas."
                    />
                    <button type="button" disabled={museLoading || (!baseContextReady && !toText(museBrief))} onClick={generateMuseCreativePack} className="primary w-full">
                      {museLoading ? (<Loader2 size={15} className="animate-spin"/>) : (<Sparkles size={15}/>)}
                      {museCreativePack ? "REGENERATE MUSE CREATIVE PACK" : "GENERATE MUSE CREATIVE PACK"}
                    </button>
                    {museCreativePack && (<>
                      <button type="button" onClick={() => copyTextToClipboard(museCreativePack, "MUSE CREATIVE PACK")} className="secondary w-full">
                        <Copy size={14}/>
                        COPY MUSE CREATIVE PACK
                      </button>
                      <pre className="prompt-output">{museCreativePack}</pre>
                    </>)}
                  </Panel>
                </div>
                <div className="mt-5">
                  <Panel title="AI VISUAL DIRECTOR" icon={<ImageIcon size={16}/>}>
                    <div className="flex justify-between items-center">
                      <div className="field-label">VISUAL STYLE</div>
                      <FieldStatus empty={!project.visualStyle} outdated={visualOutdated}/>
                    </div>
                    <textarea className="input" rows={toText(project.visualStyle) ? 4 : 2} value={project.visualStyle} onChange={(event) => { setProject((prev) => ({ ...prev, visualStyle: event.target.value })); setVisualSource(projectContextKey); }} onKeyDown={(event) => event.stopPropagation()} placeholder="Generated visual style..."/>
                    <button type="button" disabled={!baseContextReady || visualLoading} onClick={generateVisualStyle} className="primary w-full">
                      {visualLoading ? (<Loader2 size={15} className="animate-spin"/>) : (<Sparkles size={15}/>)}
                      {project.visualStyle ? "REGENERATE VISUAL STYLE" : "GENERATE VISUAL STYLE"}
                    </button>
                  </Panel>
                </div>
                <div className="mt-5">
                  <Panel title="AI CONTINUITY ARCHITECT" icon={<ShieldCheck size={16}/>}>
                    <div className="flex justify-between items-center">
                      <div className="field-label">STORY GUARDRAILS</div>
                      <FieldStatus empty={!project.storyRules} outdated={guardOutdated}/>
                    </div>
                    <textarea className="input" rows={toText(project.storyRules) ? 4 : 2} value={project.storyRules} onChange={(event) => { setProject((prev) => ({ ...prev, storyRules: event.target.value })); setGuardSource(projectContextKey); }} onKeyDown={(event) => event.stopPropagation()} placeholder="Generated strict continuity rules..."/>
                    <button type="button" disabled={!baseContextReady || guardLoading} onClick={generateStoryGuardrails} className="primary w-full">
                      {guardLoading ? (<Loader2 size={15} className="animate-spin"/>) : (<ShieldCheck size={15}/>)}
                      {project.storyRules ? "REGENERATE STORY GUARDRAILS" : "GENERATE STORY GUARDRAILS"}
                    </button>
                  </Panel>
                </div>
                <div className="mt-5">
                  <Panel title="PRODUCTION CONFIG" icon={<Clapperboard size={16}/>}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <NumberField label="EPISODES" value={project.episodeCount} min={1} max={100} onChange={(value) => setProject((prev) => ({ ...prev, episodeCount: value }))}/>
                      <NumberField label="SEC / EPISODE" value={project.episodeDuration} min={30} max={300} onChange={(value) => setProject((prev) => ({ ...prev, episodeDuration: value }))}/>
                      <NumberField label="CAST" value={project.castCount} min={1} max={12} onChange={(value) => setProject((prev) => ({ ...prev, castCount: value }))}/>
                      <SelectField label="VIDEO FORMAT" value={projectAspectRatio} values={PROJECT_ASPECT_RATIOS} onChange={(value) => setProject((prev) => ({ ...prev, aspectRatio: normalizeProjectAspectRatio(value) }))}/>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <NumberField label="LOCATIONS" value={project.locationCount} min={1} max={10} onChange={(value) => setProject((prev) => ({ ...prev, locationCount: value }))}/>
                      <NumberField label="IMPORTANT PROPS" value={project.propCount} min={0} max={10} onChange={(value) => setProject((prev) => ({ ...prev, propCount: value }))}/>
                    </div>
                    <label className="toggle-row" title="AI Director Mode membuat showrunner plan, continuity plan, shot variety, dialogue direction, video-engine treatment, dan QA rules sebelum auto full drama.">
                      <input
                        type="checkbox"
                        checked={project.aiDirectorMode !== false}
                        onChange={(event) => setProject((prev) => ({ ...prev, aiDirectorMode: event.target.checked }))}
                      />
                      <span>AI DIRECTOR MODE</span>
                    </label>
                    <button type="button" disabled={busy || !toText(project.visualStyle) || !toText(project.storyRules) || visualOutdated || guardOutdated} onClick={generateProductionBible} className="primary w-full h-[56px]">
                      <Zap size={16}/>
                      GENERATE PRODUCTION BIBLE
                    </button>
                  </Panel>
                </div>
              </section>)}
              {stage === "assets" && (<section>
                <PageTitle code="02" title="LOCKED PRODUCTION ASSETS" subtitle="One permanent visual reference per character, location and important prop."/>
                {allReferenceAssets.length === 0 ? (
                  <EmptyState title="TIDAK ADA ASSETS"/>
                ) : (
                  <>
                    <SectionHeading icon={<Users size={15}/>} title="CHARACTERS" meta={`${characters.filter((x) => x.locked).length}/${characters.length} LOCKED`}/>
                    <div className="asset-grid">
                      {characters.map((character) => (<AssetCard key={character.id} assetType="character" id={character.id} title={character.name} subtitle={character.role} description={character.description} image={character.referenceImage} status={character.status} locked={character.locked} aspectRatio={projectAspectRatio}/>))}
                    </div>
                    <SectionHeading icon={<MapPin size={15}/>} title="LOCATIONS" meta={`${locations.filter((x) => x.locked).length}/${locations.length} LOCKED`}/>
                    <div className="asset-grid">
                      {locations.map((location) => (<AssetCard key={location.id} assetType="location" id={location.id} title={location.name} description={location.description} image={location.referenceImage} status={location.status} locked={location.locked} aspectRatio={projectAspectRatio}/>))}
                    </div>
                    <SectionHeading icon={<Box size={15}/>} title="PROPS" meta={`${props.filter((x) => x.locked).length}/${props.length} LOCKED`}/>
                    <div className="asset-grid">
                      {props.map((prop) => (<AssetCard key={prop.id} assetType="prop" id={prop.id} title={prop.name} description={prop.description} image={prop.referenceImage} status={prop.status} locked={prop.locked} aspectRatio={projectAspectRatio}/>))}
                    </div>
                    <div className="action-bar flex-wrap">
                      <button type="button" disabled={busy} onClick={generateAllReferences} className="secondary"><Sparkles size={14}/>GENERATE + LOCK ALL REFERENCES</button>
                      <button type="button" disabled={busy || !allAssetsDownloadReady} onClick={downloadAllAssetsZip} className="secondary"><Download size={14}/>DOWNLOAD ALL ASSETS ZIP</button>
                      <button type="button" disabled={busy || savingProject} onClick={clearReferenceImagesNow} className="secondary"><Trash2 size={14}/>RESET REFERENCES + ANCHORS</button>
                    </div>
                    <div className="mt-5">
                      <Panel title="MANUAL SCENE SETUP" icon={<Clapperboard size={16}/>}>
                        <div className="mono muted text-[11px] leading-5">
                          Setelah semua asset ter-lock, bisa masuk manual ke SCENE ANCHOR atau generate otomatis satu alur drama penuh.
                          Dialog murni diambil dari
                          <b> PER-CHARACTER DIRECTION</b> (tulis dalam tanda kutip <code>"..."</code>).
                          Gunakan kata <b>bergumam</b>, <b>dalam hati</b>, atau <b>membatin</b> untuk membuat dialog jadi inner voice (voice-over, bukan lip-sync).
                        </div>
                        <label className="toggle-row" title="Aktifkan layer Showrunner, Continuity, Shot Variety, Dialogue, Video Engine, dan QA Director.">
                          <input
                            type="checkbox"
                            checked={project.aiDirectorMode !== false}
                            onChange={(event) => setProject((prev) => ({ ...prev, aiDirectorMode: event.target.checked }))}
                          />
                          <span>AI DIRECTOR MODE</span>
                        </label>
                        <textarea
                          className="input"
                          rows={toText(project.directorModePlan) ? 5 : 3}
                          value={project.directorModePlan || ""}
                          onChange={(event) => setProject((prev) => ({ ...prev, directorModePlan: event.target.value }))}
                          onKeyDown={(event) => event.stopPropagation()}
                          placeholder="AI Director Plan akan terisi otomatis saat Generate Full Drama, atau klik Generate AI Director Plan dulu."
                        />
                        <button
                          type="button"
                          disabled={busy || !characters.length || !locations.length}
                          onClick={() => generateAiDirectorPlan({
                            targetShots: Math.min(80, Math.max(8, Math.round(Number(project.episodeCount || 1) * Math.min(8, Math.max(4, Number(project.episodeDuration || 120) / 20))))),
                            silent: false,
                          }).catch(handleError)}
                          className="secondary w-full"
                        >
                          <ShieldCheck size={14}/>
                          {project.directorModePlan ? "REGENERATE AI DIRECTOR PLAN" : "GENERATE AI DIRECTOR PLAN"}
                        </button>
                        <button
                          type="button"
                          disabled={busy || characters.some((c) => !c.locked) || locations.some((l) => !l.locked) || props.some((p) => !p.locked)}
                          onClick={generateAutoDramaShots}
                          className="primary w-full h-[56px]"
                        >
                          <Sparkles size={16}/>
                          GENERATE FULL DRAMA OTOMATIS
                        </button>
                        <div className="mono muted text-[10px] leading-5">
                          Auto Full Drama hanya membuat alur, episode, shot, kamera, konflik, cliffhanger, NPC plan, dan prompt. Scene Anchor, QA, dan Video tetap dijalankan manual per shot.
                        </div>
                        <button
                          type="button"
                          disabled={busy || characters.some((c) => !c.locked) || locations.some((l) => !l.locked)}
                          onClick={() => {
                            if (!shots.length) createManualShot();
                            setStage("render");
                          }}
                          className="primary w-full h-[56px]"
                        >
                          <ImageIcon size={16}/>
                          LANJUT KE SCENE ANCHOR (MANUAL)
                        </button>
                      </Panel>
                    </div>
                  </>
                )}
              </section>)}
              {stage === "render" && (<section>
                <PageTitle code="03" title="SCENE ANCHOR" subtitle="Hermes Agent bisa mengisi shot, cast, dialogue, anchor prompt, dan video prompt otomatis; tetap bisa diedit manual."/>
                {shots.length === 0 ? (<EmptyState title="BELUM ADA SHOT. KLIK + ADD MANUAL SHOT DI BAWAH."/>) : null}
                <div className="render-grid gap-5">
                  <div className="panel shot-queue-panel">
                    <div className="panel-header"><Clapperboard size={15}/>SHOT QUEUE</div>
                    <div className="shot-queue-list p-3">
                      <div className="shot-queue-toolbar">
                        <div className="shot-queue-actions">
                          <button type="button" className="secondary" onClick={() => createManualShot()}>
                            <Sparkles size={14}/> + ADD MANUAL SHOT
                          </button>
                          <button type="button" className="secondary" disabled={busy || !characters.length || !locations.length} onClick={generateHermesAutoDramaShots}>
                            <Clapperboard size={14}/> HERMES AUTO DRAMA
                          </button>
                        </div>
                        <div className="shot-queue-note">Auto hanya isi shot/prompt, bukan generate anchor/QA/video.</div>
                      </div>
                      <div className="shot-queue-grid">
                        {shots.map((shot) => (
                          <div key={shot.id} className="shot-queue-item">
                            <button type="button" onClick={() => setSelectedShotId(shot.id)} className={selectedShotId === shot.id ? "render-shot active" : "render-shot"}>
                            <div>
                              <div className="mono cyan text-[11px]">{shot.id}</div>
                              <div className="mono muted text-[11px] mt-1">{(shot.characterIds || []).join(" + ") || "NO CAST"}</div>
                            </div>
                            <div className="flex gap-2 items-center">
                              {shot.qa?.pass && (<ShieldCheck size={14} className="green"/>)}
                              {shot.videoStatus === "ready" && (<Play size={14} className="cyan"/>)}
                            </div>
                          </button>
                            <button type="button" className="shot-delete-button" title="Hapus shot ini" onClick={() => deleteManualShot(shot.id)}>
                              <Trash2 size={13}/>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {selectedShot ? (<div className="space-y-5">
                    <Panel title={`MASTER PROMPT // ${selectedShot.id}`} icon={<Terminal size={16}/>}>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="mini">
                          <div className="field-label">TOTAL HUMANS</div>
                          <div className="flex items-center gap-2">
                            <button type="button" className="secondary" style={{ minHeight: 30, minWidth: 30, padding: 0 }} disabled={(selectedShot.characterIds || []).length <= 0} onClick={() => setSelectedShotHumanCount((selectedShot.characterIds || []).length - 1)} title="Kurangi human">−</button>
                            <span className="mono green text-[12px]">{(selectedShot.characterIds || []).length}/{characters.length}</span>
                            <button type="button" className="secondary" style={{ minHeight: 30, minWidth: 30, padding: 0 }} disabled={(selectedShot.characterIds || []).length >= characters.length} onClick={() => setSelectedShotHumanCount((selectedShot.characterIds || []).length + 1)} title="Tambah human">+</button>
                          </div>
                        </div>
                        <Mini label="LOCATION" value={selectedShot.locationId || "—"}/>
                        <Mini label="LENGTH" value={`${selectedShot.durationSeconds || 8} SEC`}/>
                        <Mini label="PROMPT" value={`${selectedModelVideoPrompt.length.toLocaleString()} CH`}/>
                        <Mini label="QA" value={selectedShot.qa?.pass ? "PASS" : selectedShot.qa?.checked ? "FAIL" : "PENDING"}/>
                      </div>

                      {/* SCENE & CAST — MANUAL */}
                      <div className="shot-dialogue-editor" style={{ marginTop: 14 }}>
                        <span>SCENE & CAST (MANUAL)</span>
                        <div className="grid md:grid-cols-3 gap-3 items-start">
                          <label>
                            <span className="field-label">LOCATION</span>
                            <select className="input" value={selectedShot.locationId || ""} onChange={(event) => updateSelectedShotAssets("locationId", event.target.value)}>
                              <option value="">— pilih lokasi —</option>
                              {locations.map((loc) => (
                                <option key={loc.id} value={loc.id}>{loc.id} — {loc.name}</option>
                              ))}
                            </select>
                            <div className="mono muted text-[10px] mt-1">Pilih satu lokasi untuk shot ini.</div>
                          </label>

                          <div>
                            <span className="field-label">CHARACTERS DALAM SHOT ({(selectedShot.characterIds || []).length}/{characters.length})</span>
                            <MultiSelectDropdown
                              placeholder="— pilih karakter —"
                              options={characters.map((c) => ({ value: c.id, label: `${c.id} — ${c.name}${c.role ? ` · ${c.role}` : ""}` }))}
                              selected={selectedShot.characterIds || []}
                              onChange={(values) => updateSelectedShotAssets("characterIds", values)}
                            />
                            <div className="mono muted text-[10px] mt-1">Centang karakter yang masuk shot, atau pakai tombol + / − di TOTAL HUMANS.</div>
                          </div>

                          <div>
                            <span className="field-label">PROPS (multi-select)</span>
                            <MultiSelectDropdown
                              placeholder="— pilih props —"
                              options={props.map((p) => ({ value: p.id, label: `${p.id} — ${p.name}` }))}
                              selected={selectedShot.propIds || []}
                              onChange={(values) => updateSelectedShotAssets("propIds", values)}
                            />
                            <div className="mono muted text-[10px] mt-1">Centang props yang dipakai di shot ini.</div>
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-3 mt-3">
                          <label>
                            <span className="field-label">SHOT ACTION (WHAT HAPPENS)</span>
                            <div className="direct-tag-helper" style={{ marginBottom: 6 }}>
                              {getSelectedShotAssetTagOptions(selectedShot).filter((a) => a.type === "character" || a.type === "prop").map((asset) => (
                                <button
                                  key={`action-${asset.type}-${asset.id}`}
                                  type="button"
                                  className={`direct-tag-chip direct-tag-chip-${asset.type}`}
                                  onClick={() => insertIntoShotTextField("action", asset.mention)}
                                  title={`${asset.id} — ${asset.label}`}
                                >
                                  {asset.mention}<span className="direct-tag-chip-label">· {asset.label}</span>
                                </button>
                              ))}
                            </div>
                            <textarea
                              id={`shot-action-${selectedShot.id}`}
                              className="input"
                              rows={3}
                              value={selectedShot.action || ""}
                              onChange={(event) => updateSelectedShotTextField("action", event.target.value)}
                              onKeyDown={(event) => event.stopPropagation()}
                              placeholder="cth: @jaka duduk di dekat @peti sambil menatap @ratu_mayang dengan curiga."
                            />
                            <div className="mono muted text-[10px] mt-1">Gunakan <span className="cyan">@karakter</span> / <span className="cyan">@props</span> dari tombol di atas. Tag otomatis dikompilasi ke CHARACTER_MASTER / PROP_MASTER saat generate.</div>
                          </label>
                          <label>
                            <span className="field-label">CONTINUITY SETUP (STATE)</span>
                            <div className="direct-tag-helper" style={{ marginBottom: 6 }}>
                              {getSelectedShotAssetTagOptions(selectedShot).filter((a) => a.type === "character" || a.type === "prop").map((asset) => (
                                <button
                                  key={`continuity-${asset.type}-${asset.id}`}
                                  type="button"
                                  className={`direct-tag-chip direct-tag-chip-${asset.type}`}
                                  onClick={() => insertIntoShotTextField("continuitySetup", asset.mention)}
                                  title={`${asset.id} — ${asset.label}`}
                                >
                                  {asset.mention}<span className="direct-tag-chip-label">· {asset.label}</span>
                                </button>
                              ))}
                            </div>
                            <textarea
                              id={`shot-continuitySetup-${selectedShot.id}`}
                              className="input"
                              rows={3}
                              value={selectedShot.continuitySetup || ""}
                              onChange={(event) => updateSelectedShotTextField("continuitySetup", event.target.value)}
                              onKeyDown={(event) => event.stopPropagation()}
                              placeholder="cth: @jaka sudah duduk di sebelah @peti yang masih tertutup."
                            />
                            <div className="mono muted text-[10px] mt-1">Gunakan <span className="cyan">@karakter</span> / <span className="cyan">@props</span> dari tombol di atas.</div>
                          </label>
                        </div>
                        <div className="grid md:grid-cols-2 gap-3 mt-3">
                          <label>
                            <span className="field-label">PLANNED START STATE (ANCHOR-FIRST)</span>
                            <textarea
                              className="input"
                              rows={2}
                              value={selectedShot.plannedStartState || ""}
                              onChange={(event) => updateSelectedShotTextField("plannedStartState", event.target.value)}
                              onKeyDown={(event) => event.stopPropagation()}
                              placeholder="State awal shot ini kalau belum ada last-frame video sebelumnya."
                            />
                          </label>
                          <label>
                            <span className="field-label">PLANNED END STATE (CUT POINT)</span>
                            <textarea
                              className="input"
                              rows={2}
                              value={selectedShot.plannedEndState || ""}
                              onChange={(event) => updateSelectedShotTextField("plannedEndState", event.target.value)}
                              onKeyDown={(event) => event.stopPropagation()}
                              placeholder="Frame akhir yang enak disambung ke shot berikutnya."
                            />
                          </label>
                        </div>
                        <div className="grid md:grid-cols-2 gap-3 mt-3">
                          <label>
                            <span className="field-label">TRANSITION IN</span>
                            <input
                              className="input"
                              value={selectedShot.transitionIn || ""}
                              onChange={(event) => updateSelectedShotTextField("transitionIn", event.target.value)}
                              onKeyDown={(event) => event.stopPropagation()}
                              placeholder="cth: cut dari establishing ke reaksi karakter."
                            />
                          </label>
                          <label>
                            <span className="field-label">TRANSITION OUT</span>
                            <input
                              className="input"
                              value={selectedShot.transitionOut || ""}
                              onChange={(event) => updateSelectedShotTextField("transitionOut", event.target.value)}
                              onKeyDown={(event) => event.stopPropagation()}
                              placeholder="cth: match cut ke tangan membuka pintu."
                            />
                          </label>
                        </div>
                      </div>

                      {/* DIRECT ANCHOR PROMPT */}
                      <div className="shot-dialogue-editor" style={{ marginTop: 14 }}>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <span>DIRECT ANCHOR PROMPT (tag CHARACTER / LOCATION / PROP dari Master Assets)</span>
                            <div className="mono muted text-[10px] mt-1">
                              Semua tag diambil otomatis dari asset yang sudah terdaftar pada shot ini.
                            </div>
                          </div>
                          <button
                            type="button"
                            className="primary"
                            disabled={busy || !toText(selectedShot.directAnchorPrompt)}
                            onClick={createImageFromDirectAnchorPrompt}
                            title="Generate scene anchor menggunakan DIRECT ANCHOR PROMPT + Master Assets"
                          >
                            {busy ? <Loader2 size={14} className="animate-spin"/> : <ImageIcon size={14}/>}
                            CREATE IMAGE
                          </button>
                        </div>

                        <textarea
                          style={{ marginTop: 12 }}
                          value={selectedShot.directAnchorPrompt || ""}
                          onChange={(event) => updateSelectedShotDirectAnchorPrompt(event.target.value)}
                          onKeyDown={(event) => event.stopPropagation()}
                          rows={5}
                          placeholder={`Contoh dinamis:\n@<karakter> berdiri di @<tempat>, mengangkat tangan dan mengarahkan energi ke @<karakter-lain>.\nTangan kanan memegang @<props>, sementara @<karakter-lain> bereaksi terkejut.`}
                        />

                        <div className="direct-tag-groups">
                          {([
                            { type: "character", label: "KARAKTER", icon: <Users size={11}/> },
                            { type: "location", label: "TEMPAT", icon: <MapPin size={11}/> },
                            { type: "prop", label: "PROPS", icon: <Box size={11}/> },
                          ] as const).map((group) => {
                            const options = getSelectedShotAssetTagOptions(selectedShot).filter((item) => item.type === group.type);
                            if (!options.length) return null;
                            return (
                              <div key={group.type} className="direct-tag-group">
                                <span className="direct-tag-group-label">{group.icon}{group.label}</span>
                                <div className="direct-tag-helper">
                                  {options.map((asset) => (
                                    <button
                                      key={`${asset.type}:${asset.id}`}
                                      type="button"
                                      className={`direct-tag-chip direct-tag-chip-${asset.type}`}
                                      onClick={() => {
                                        const current = selectedShot.directAnchorPrompt || "";
                                        const prefix = current && !/[\s\n]$/.test(current) ? " " : "";
                                        updateSelectedShotDirectAnchorPrompt(`${current}${prefix}${asset.mention} `);
                                      }}
                                      title={`${asset.id} — ${asset.label}`}
                                    >
                                      {asset.mention}
                                      <span className="direct-tag-chip-label">· {asset.label}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {(() => {
                          const tagState = resolveDirectAnchorAssetTags(selectedShot.directAnchorPrompt || "", selectedShot);
                          if (!tagState.refs.length && !tagState.unmatched.length && !tagState.ambiguous.length) return null;
                          return (
                            <div className="direct-tag-status">
                              {tagState.refs.length > 0 && (
                                <div className="mono muted text-[10px]">
                                  Resolved: {tagState.refs.map((ref) => `${ref.type.toUpperCase()}:${ref.id}`).join(" · ")}
                                </div>
                              )}
                              {tagState.unmatched.length > 0 && (
                                <div className="mono text-[10px] direct-tag-warning">
                                  Unmatched: {tagState.unmatched.map((tag) => `@${tag}`).join(", ")} — dianggap teks biasa, asset baru tidak akan dibuat.
                                </div>
                              )}
                              {tagState.ambiguous.length > 0 && (
                                <div className="mono text-[10px] direct-tag-warning">
                                  Ambiguous: {tagState.ambiguous.map((tag) => `@${tag}`).join(", ")} — gunakan mention @ID dari TAG CEPAT.
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <div className="mono muted text-[10px] mt-2">
                          Format yang aman: <b>@ID</b> atau tag dari tombol di atas. Saat CREATE IMAGE ditekan, prompt dikompilasi menjadi referensi eksplisit <b>CHARACTER_MASTER / LOCATION_MASTER / PROP_MASTER</b>.
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3">
                        <button type="button" disabled={!selectedModelVideoPrompt} onClick={() => copyTextToClipboard(selectedModelVideoPrompt, `${selectedShot.id} ${selectedVideoModel} VIDEO PROMPT`)} className="secondary">
                          <Copy size={14}/>
                          COPY VIDEO PROMPT
                        </button>
                        <button type="button" onClick={() => setPromptExpanded((prev) => !prev)} className="secondary">
                          {promptExpanded ? <EyeOff size={14}/> : <Eye size={14}/>}
                          {promptExpanded ? "HIDE PROMPT" : "SHOW PROMPT"}
                        </button>
                      </div>
                      <div className="mono muted text-[10px] leading-5 mt-3">
                        Model prompt: {selectedModelVideoPrompt.length.toLocaleString()} / {selectedVideoPromptProfile.targetChars.toLocaleString()} target chars · API hard limit {VIDEO_PROMPT_API_LIMIT.toLocaleString()}
                        {!selectedShot.locationId && <><br/><span className="direct-tag-warning">Pilih LOCATION dulu agar video prompt bisa dikompilasi.</span></>}
                      </div>
                      {promptExpanded && (<pre className="prompt-output">{selectedModelVideoPrompt}</pre>)}
                    </Panel>

                    <Panel title={`DIRECTOR CONTROLS // ${selectedShot.id}`} icon={<Clapperboard size={16}/>}>
                      <div className="grid md:grid-cols-[1fr_auto] gap-4 items-end">
                        <div>
                          <span className="field-label">VIDEO DURATION (SECONDS)</span>
                          <input type="range" min={2} max={30} step={1} value={Number(selectedShot.durationSeconds || 8)} onChange={(event) => updateSelectedShotDuration(event.target.value)} style={{ width: "100%" }}/>
                          <div className="mono muted text-[11px] mt-1">
                            {selectedShot.durationSeconds || 8} sec · durasi otomatis disesuaikan saat dialog berubah
                          </div>
                        </div>
                        <input className="input" type="number" min={2} max={30} value={selectedShot.durationSeconds || 8} onChange={(event) => updateSelectedShotDuration(event.target.value)} onKeyDown={(event) => event.stopPropagation()} style={{ maxWidth: 120 }}/>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3">
                        <label>
                          <span className="field-label">CAMERA MOVEMENT (ENFORCED IN VIDEO)</span>
                          <select className="input" value={selectedShot.cameraMovement || DEFAULT_CAMERA_MOVEMENT} onChange={(event) => updateSelectedShotCameraMovement(event.target.value)}>
                            {CAMERA_MOVEMENT_PRESETS.map((preset) => (
                              <option key={preset.id} value={preset.id}>{preset.label}</option>
                            ))}
                          </select>
                          <div className="mono muted text-[10px] mt-1">
                            {(CAMERA_MOVEMENT_PRESETS.find((p) => p.id === (selectedShot.cameraMovement || DEFAULT_CAMERA_MOVEMENT))?.desc) || ""}
                          </div>
                        </label>
                        <div className="grid grid-cols-2 gap-2 self-end">
                          <label className="toggle-row">
                            <input type="checkbox" checked={Boolean(selectedShot.allowCutaway)} onChange={(event) => updateSelectedShotBooleanField("allowCutaway", event.target.checked)}/>
                            <span>Allow cutaway</span>
                          </label>
                          <label className="toggle-row">
                            <input type="checkbox" checked={Boolean(selectedShot.allowSceneFlexibility)} onChange={(event) => updateSelectedShotBooleanField("allowSceneFlexibility", event.target.checked)}/>
                            <span>Scene flexibility</span>
                          </label>
                        </div>
                      </div>

                      <div>
                        <span className="field-label">CAMERA SCRIPT (bebas tulis)</span>
                        <div className="direct-tag-helper" style={{ marginBottom: 6 }}>
                          {getSelectedShotAssetTagOptions(selectedShot).filter((a) => a.type === "character" || a.type === "prop").map((asset) => (
                            <button
                              key={`camera-${asset.type}-${asset.id}`}
                              type="button"
                              className={`direct-tag-chip direct-tag-chip-${asset.type}`}
                              onClick={() => insertIntoCameraScript(asset.mention)}
                              title={`${asset.id} — ${asset.label}`}
                            >
                              {asset.mention}<span className="direct-tag-chip-label">· {asset.label}</span>
                            </button>
                          ))}
                        </div>
                        <textarea
                          id={`shot-camerascript-${selectedShot.id}`}
                          className="input"
                          rows={4}
                          value={selectedShot.cameraScript || ""}
                          onChange={(event) => updateSelectedShotCameraScript(event.target.value)}
                          onKeyDown={(event) => event.stopPropagation()}
                          placeholder={`Contoh:\n- Kamera fokus ke @jaka saat ia bicara (0-3s).\n- Setelah @jaka selesai, cutaway singkat 1s ke sekeliling lokasi.\n- Cut balik ke @ratu_mayang, ia bicara (3-6s).\n- Akhiri hold di reaksi @jaka.`}
                        />
                        <div className="mono muted text-[11px] mt-2">
                          Gunakan <span className="cyan">@karakter</span> / <span className="cyan">@props</span> dari tombol di atas. Script ini masuk ke DIRECTOR CAMERA CONTROL di prompt video dan CAMERA INTENT di prompt anchor.
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <span className="field-label" style={{marginBottom: 0}}>PER-CHARACTER DIRECTION</span>
                          <button type="button" className="secondary" onClick={resetSelectedShotDirections}>
                            <RefreshCw size={13}/> RESET DIRECTOR CONTROLS
                          </button>
                        </div>
                        <div className="mono muted text-[11px] mt-2">
                          Tulis prompt bebas. Teks di dalam tanda kutip <b>"..."</b> otomatis jadi dialog.
                          Pilih <b>TALK TO</b> agar dialog tidak salah arah. Gunakan <b>bergumam</b> / <b>dalam hati</b> / <b>membatin</b> untuk inner voice.
                        </div>
                        {!(selectedShot.characterIds || []).length && (
                          <div className="mono muted text-[11px] mt-3">Belum ada karakter di shot ini. Centang karakter di SCENE & CAST.</div>
                        )}
                        <div className="space-y-3 mt-3">
                          {normalizeCharacterDirections(selectedShot.characterDirections, normalizeIdList(selectedShot.characterIds)).map((dir) => {
                            const character = characterMap.get(dir.characterId);
                            const others = normalizeIdList(selectedShot.characterIds).filter((id) => id !== dir.characterId);
                            const spokenCount = extractDialogueLinesFromPrompt(dir.scenePrompt || "").length;
                            const dirIntos = extractTaggedTokens(dir.scenePrompt || "", INTONATION_TAG_REGEX).filter((tag) => isKnownIntonationTag(tag));
                            const dirTagMode = speechModeFromIntonations(dirIntos);
                            const uiMode = dirTagMode !== "spoken"
                              ? dirTagMode
                              : (isInnerSpeechText(dir.scenePrompt || "") ? "inner" : (isMumbleText(dir.scenePrompt || "") ? "mumble" : "spoken"));
                            const inner = uiMode === "inner";
                            return (
                              <div key={dir.characterId} className="id-box" style={{ padding: 12, minHeight: 0 }}>
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div>
                                    <div className="mono cyan text-[11px]">{dir.characterId}</div>
                                    <div className="orbitron text-[12px] mt-1">{character?.name || dir.characterId}</div>
                                    <div className="mono muted text-[10px] mt-1">{character?.role || ""}</div>
                                  </div>
                                  <label className="toggle-row" title="Kamera prioritaskan aktor ini">
                                    <input type="checkbox" checked={Boolean(dir.cameraFocus)} onChange={(event) => updateSelectedShotCharacterDirection(dir.characterId, "cameraFocus", event.target.checked)}/>
                                    <span>Camera focus</span>
                                  </label>
                                </div>

                                <div className="grid md:grid-cols-2 gap-3 mt-3">
                                  <label>
                                    <span className="field-label">TALK TO (TARGET BICARA)</span>
                                    <select className="input" value={dir.talkTargetId || ""} onChange={(event) => updateSelectedShotCharacterDirection(dir.characterId, "talkTargetId", event.target.value)}>
                                      <option value="">— tidak ada target / self-talk —</option>
                                      {others.map((otherId) => (
                                        <option key={otherId} value={otherId}>{otherId} — {characterMap.get(otherId)?.name || otherId}</option>
                                      ))}
                                    </select>
                                    <div className="mono muted text-[10px] mt-1">Jika kosong → dianggap self-talk / inner.</div>
                                  </label>
                                  <label>
                                    <span className="field-label">MODE SUARA</span>
                                    <input className="input" disabled value={uiMode === "inner" ? "INNER VOICE (dalam hati / membatin)" : uiMode === "mumble" ? "MUMBLE (bergumam / di bawah napas)" : spokenCount ? `SPOKEN (${spokenCount} baris terdeteksi)` : "SILENT (belum ada dialog)"}/>
                                    <div className="mono muted text-[10px] mt-1">
                                      <b>@membatin</b> / <b>dalam hati</b> → inner voice (tanpa suara). <b>@bergumam</b> / <b>bergumam</b> → menggumam (audible pelan).
                                    </div>
                                  </label>
                                </div>

                                <div className="mt-3">
                                  <span className="field-label">SCENE PROMPT FOR THIS CHARACTER (FREE TEXT + DIALOGUE)</span>
                                  <div className="direct-tag-helper" style={{ marginBottom: 6 }}>
                                    {getSelectedShotCharacterTagOptions(selectedShot).filter((c) => c.id !== dir.characterId).map((c) => (
                                      <button key={c.id} type="button" className="direct-tag-chip direct-tag-chip-character" onClick={() => insertIntoCharacterPrompt(dir, c.mention)} title={c.label}>
                                        {c.mention}<span className="direct-tag-chip-label">· {c.label}</span>
                                      </button>
                                    ))}
                                    {INTONATION_PRESETS.slice(0, 10).map((preset) => (
                                      <button key={preset.id} type="button" className="intonation-chip" style={{ minHeight: 26, padding: "0 8px" }} onClick={() => insertIntoCharacterPrompt(dir, `@${preset.id}`)} title={preset.desc}>
                                        <strong style={{ fontSize: 11 }}>@{preset.id}</strong>
                                      </button>
                                    ))}
                                    {INTONATION_PRESETS.filter((p: any) => p.mode === "mumble" || p.mode === "inner").map((preset) => (
                                      <button key={preset.id} type="button" className="intonation-chip intonation-chip-mode" style={{ minHeight: 26, padding: "0 8px" }} onClick={() => insertIntoCharacterPrompt(dir, `@${preset.id}`)} title={preset.desc}>
                                        <strong style={{ fontSize: 11 }}>@{preset.id}</strong>
                                      </button>
                                    ))}
                                  </div>
                                  <textarea
                                    id={`char-prompt-${dir.characterId}`}
                                    className="input"
                                    rows={5}
                                    value={dir.scenePrompt || ""}
                                    maxLength={CHARACTER_SCENE_PROMPT_MAX_CHARS}
                                    placeholder={`Contoh INNER VOICE (tanpa suara):\n@siti duduk termenung @membatin "Aku harus tahu isi peti ini."\n\nContoh BERGUMAM (audible pelan):\n@siti menunduk @bergumam "Jangan sampai ketahuan..."\n\nContoh SPOKEN:\n@siti menatap @jaka tajam dan berkata @marah "Kamu menyembunyikan sesuatu."`}
                                    onChange={(event) => updateSelectedShotCharacterDirection(dir.characterId, "scenePrompt", event.target.value)}
                                                                        onKeyDown={(event) => event.stopPropagation()}
                                  />
                                  <div className="mono muted text-[10px] mt-1">
                                    Bebas spasi & tanda baca. Teks dalam tanda kutip <b>&quot;...&quot;</b> otomatis jadi dialog.
                                    Gunakan <span className="cyan">@ID</span> / <span className="cyan">@nama</span> untuk merujuk karakter lain, dan <span className="cyan">@marah</span> / <span className="cyan">@sedih</span> dst. untuk intonasi.
                                    {" "}{(dir.scenePrompt || "").length}/{CHARACTER_SCENE_PROMPT_MAX_CHARS}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </Panel>

                    <div className="grid lg:grid-cols-2 gap-5">
                      <Panel title={`SCENE ANCHOR // ${projectAspectRatio} SINGLE FRAME`} icon={<ImageIcon size={16}/>}>
                        <div className="image-model-picker">
                          <div className="flex items-center justify-between gap-2">
                            <span className="field-label" style={{ marginBottom: 0 }}>IMAGE MODEL (GOOGLE AI)</span>
                            <span className="mono muted text-[10px] break-all">
                              {selectedImageModel}
                            </span>
                          </div>
                          <select
                            className="input"
                            value={IMAGE_MODEL_PRESETS.some((m) => m.id === selectedImageModel) ? selectedImageModel : "__custom__"}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (value === "__custom__") return;
                              setSelectedImageModel(value);
                            }}
                          >
                            {IMAGE_MODEL_PRESETS.map((model) => (
                              <option key={model.id} value={model.id}>{model.label} — {model.id}</option>
                            ))}
                            <option value="__custom__">{IMAGE_MODEL_PRESETS.some((m) => m.id === selectedImageModel) ? "Custom model id…" : `Custom: ${selectedImageModel}`}</option>
                          </select>
                          <div className="grid md:grid-cols-[1fr_auto] gap-2 items-stretch">
                            <input
                              className="input"
                              placeholder="cth: gemini-nano-banana-2.1, gemini-3.1-flash-image, …"
                              value={customImageModel}
                              onChange={(event) => setCustomImageModel(event.target.value)}
                              onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key !== "Enter") return;
                                const id = customImageModel.trim();
                                if (!id) return;
                                setSelectedImageModel(id);
                                setCustomImageModel("");
                              }}
                            />
                            <button
                              type="button"
                              className="secondary"
                              disabled={!customImageModel.trim()}
                              onClick={() => {
                                const id = customImageModel.trim();
                                if (!id) return;
                                setSelectedImageModel(id);
                                setCustomImageModel("");
                              }}
                            >
                              <Sparkles size={14}/>
                              PAKAI MODEL INI
                            </button>
                          </div>
                          <div className="mono muted text-[10px] leading-5">
                            Model ini dipakai untuk generate <b>Scene Anchor</b> dan <b>Character/Location/Prop reference</b>. Nilai disimpan otomatis di snapshot workspace.
                          </div>
                        </div>
                        <div
                          className="anchor-frame"
                          style={anchorFrameStyle}
                          tabIndex={0}
                          onPaste={handleAnchorPaste}
                          title="Klik lalu tempel (Cmd/Ctrl+V) screenshot untuk dipakai sebagai anchor"
                        >
                          {selectedShot.anchorStatus === "generating" ? (
                            <div className="anchor-loading-state">
                              <Loader2 size={30} className="animate-spin green"/>
                              <button type="button" className="anchor-stop-button" onClick={stopAnchorGeneration}>
                                <Square size={13}/>
                                STOP
                              </button>
                            </div>
                          ) : selectedShot.anchorImage ? (
                            <img src={assetUrl(selectedShot.anchorImage)} alt={`${selectedShot.id} anchor`}/>
                          ) : (
                            <div className="anchor-empty-hint">
                              <ImageIcon size={32} className="muted"/>
                              <span className="mono muted text-[10px]">Klik di sini lalu tempel (Cmd/Ctrl+V) screenshot, atau pakai tombol di bawah.</span>
                            </div>
                          )}
                        </div>
                        {selectedShot.anchorImported && selectedShot.anchorImage ? (
                          <div className="mono green text-[10px]" style={{ marginTop: 6 }}>
                            Anchor ini di-import manual (bukan hasil generate). Akan dipakai sebagai frame awal video.
                          </div>
                        ) : null}
                        <div className="grid md:grid-cols-2 gap-2" style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            className="secondary w-full"
                            disabled={selectedShot.anchorStatus === "generating"}
                            onClick={() => document.getElementById(`anchor-import-input-${selectedShot.id}`)?.click()}
                          >
                            <ImageIcon size={14}/>
                            UPLOAD / PASTE IMAGE
                          </button>
                          <button
                            type="button"
                            className="secondary w-full"
                            disabled={!selectedShot.anchorImage || selectedShot.anchorStatus === "generating"}
                            onClick={() => {
                              if (!selectedShot.anchorImage) return;
                              downloadBlobUrl(assetUrl(selectedShot.anchorImage), `${selectedShot.id}_ANCHOR.png`);
                            }}
                          >
                            <Download size={14}/>
                            DOWNLOAD ANCHOR
                          </button>
                        </div>
                        <input
                          id={`anchor-import-input-${selectedShot.id}`}
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            importAnchorImageFromFile(file);
                            event.target.value = "";
                          }}
                        />
                        <div className="mono muted text-[10px]" style={{ marginTop: 6 }}>
                          Tip: klik kotak anchor di atas lalu tekan <b>Cmd/Ctrl+V</b> untuk menempel screenshot langsung sebagai referensi video. Berguna mengunci posisi object agar tidak pindah-pindah antar shot.
                        </div>
                        <div className="grid gap-3">
                          <button type="button" disabled={busy || selectedShot.anchorStatus === "generating"} onClick={generateSelectedAnchorOnly} className="secondary w-full"><Sparkles size={14}/>GENERATE ANCHOR</button>
                          <button type="button" disabled={busy || selectedShot.anchorStatus === "generating"} onClick={prepareSelectedShot} className="secondary w-full"><ShieldCheck size={14}/>GENERATE + QA ANCHOR</button>
                          <button type="button" disabled={busy || savingProject || selectedShot.anchorStatus === "generating"} onClick={clearReferenceImagesNow} className="secondary w-full"><Trash2 size={14}/>RESET REFERENCES + ANCHORS</button>
                          <button type="button" disabled={busy || shots.length === 0} onClick={prepareAllAnchors} className="secondary w-full"><Boxes size={14}/>BULK ANCHOR + QA ALL SHOTS</button>
                        </div>
                      </Panel>

                      <Panel title="GOOGLE VIDEO IMAGE-TO-VIDEO" icon={<Play size={16}/>}>
                      <div className="grid md:grid-cols-2 gap-3">
                        <label>
                          <span className="field-label">VIDEO MODEL</span>
                          <select className="input" value={selectedVideoModel} onChange={(event) => setSelectedVideoModel(event.target.value)}>
                            {videoModels.map((model) => (
                              <option key={model.id} value={model.id}>
                                {(model.name || model.id)}{videoModelCostPerSecond(model) ? ` · from ${formatUsd(videoModelCostPerSecond(model), 4)}/sec` : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span className="field-label">RESOLUTION</span>
                          <select className="input" value={videoResolution} onChange={(event) => setVideoResolution(event.target.value)}>
                            {(selectedVideoModelInfo?.supportedResolutions?.length ? selectedVideoModelInfo.supportedResolutions : ["480p", "720p", "1080p"]).map((item) => (
                              <option key={item} value={item}>{item}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="toggle-row">
                        <input type="checkbox" checked={false} disabled/>
                        <span>Audio native Veo dikendalikan prompt; parameter generateAudio dinonaktifkan untuk Gemini API.</span>
                      </label>
                      <div className="mono muted text-[10px] leading-5">
                        {videoModelsLoading ? "Loading video model catalog..." : `Model: ${selectedVideoModel}`}
                        <br/>
                        Prompt profile: {selectedVideoPromptProfile.targetChars.toLocaleString()} char target · current {selectedModelVideoPrompt.length.toLocaleString()} char
                        <br/>
                        Camera mode enforced: <span className="cyan">{selectedShot.cameraMovement || DEFAULT_CAMERA_MOVEMENT}</span>
                        <br/>
                        Estimasi shot ini: {formatUsd(estimateVideoCost(selectedVideoModelInfo, selectedShot.durationSeconds || 8) || 0, 4)}
                        {selectedVideoModelInfo?.pricingSkus && (
                          <> · Pricing: {Object.entries(selectedVideoModelInfo.pricingSkus).slice(0, 3).map(([key, value]) => `${key}=${value}`).join(" · ")}</>
                        )}
                      </div>
                      {selectedShot.videoUrl ? (
                        <video src={selectedShot.videoUrl} controls playsInline className={`video-preview ${projectAspectRatio === "9:16" ? "portrait" : "landscape"}`}/>
                      ) : (
                        <div className={`video-empty ${projectAspectRatio === "9:16" ? "portrait" : "landscape"}`}>
                          {selectedShot.videoStatus === "generating" ? (
                            <>
                              <Loader2 size={30} className="animate-spin green"/>
                              <span>GOOGLE VIDEO GENERATING...</span>
                            </>
                          ) : (
                            <>
                              <Play size={30}/>
                              <span>{selectedShot.videoStatus === "error" ? "VIDEO GENERATION FAILED" : "VIDEO NOT GENERATED"}</span>
                            </>
                          )}
                        </div>
                      )}
                      {!selectedShot.qa?.pass && selectedShot.anchorImage && (
                        <div className="error-box">
                          <AlertTriangle size={16}/>
                          <div>
                            <div className="mono text-[11px]">QA {selectedShot.qa?.checked ? "FAILED" : "NOT CHECKED"} — VIDEO GENERATION STILL ALLOWED</div>
                            <div className="mono muted text-[10px] mt-1">Video akan memakai anchor saat ini. Hasil bisa mewarisi masalah continuity/prop/identity yang terdeteksi QA.</div>
                          </div>
                        </div>
                      )}
                      <div className="grid md:grid-cols-2 gap-3">
                        <button
                          type="button"
                          disabled={busy || !selectedShot.anchorImage || !selectedShot.locationId || selectedShot.videoStatus === "generating"}
                          onClick={renderSelectedShot}
                          className="primary"
                          title={selectedShot.qa?.pass
                            ? "Kirim anchor image + master prompt ke Google video API"
                            : "QA belum PASS, tetapi video tetap boleh digenerate dari anchor saat ini"}
                        >
                          <Play size={14}/>
                          GENERATE VIDEO
                        </button>
                        <button
                          type="button"
                          disabled={!selectedShot.videoUrl}
                          onClick={() => selectedShot.videoUrl && downloadBlobUrl(selectedShot.videoUrl, `${selectedShot.id}.mp4`)}
                          className="secondary"
                        >
                          <Download size={14}/>
                          DOWNLOAD MP4
                        </button>
                      </div>
                      {selectedShot.videoRemoteUri && (
                        <div className="mono muted text-[11px] break-all">GOOGLE VIDEO: {selectedShot.videoRemoteUri}</div>
                      )}
                      {selectedShot.videoLastFrameImage ? (
                        <div className="mono green text-[10px] leading-5">
                          LAST FRAME CONTINUITY: READY — shot berikutnya di lokasi yang sama akan memakai frame akhir video ini sebagai referensi utama.
                        </div>
                      ) : (
                        <div className="mono muted text-[10px] leading-5">
                          LAST FRAME CONTINUITY: belum ada. Setelah video selesai, app akan mencoba capture frame terakhir otomatis.
                        </div>
                      )}
                      <div className="mono muted text-[10px] leading-5">
                        Mode: <span className="cyan">first-frame image-to-video</span>. Auto Full Drama hanya menyusun shot/alur; Scene Anchor dan QA tetap bisa kamu jalankan manual. Master prompt dikompilasi otomatis saat GENERATE VIDEO ditekan.
                      </div>
                    </Panel>
                    </div>

                    <Panel title="CONTINUITY QA" icon={<ShieldCheck size={16}/>}>
                        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: qaExpanded ? 12 : 0 }}>
                          <span className={`mono text-[12px] ${selectedShot.qa?.pass ? "green" : selectedShot.qa?.checked ? "direct-tag-warning" : "muted"}`}>
                            STATUS: {selectedShot.qa?.pass ? "PASS" : selectedShot.qa?.checked ? "FAIL" : "PENDING"}
                          </span>
                          <button type="button" onClick={() => setQaExpanded((prev) => !prev)} className="secondary">
                            {qaExpanded ? <EyeOff size={14}/> : <Eye size={14}/>}
                            {qaExpanded ? "HIDE QA" : "SHOW QA"}
                          </button>
                        </div>
                        {qaExpanded && (<>
                        {(() => {
                          const qa = selectedShot.qa || makeShotQA();
                          const status = (flag) => flag ? "PASS" : qa.checked ? "FAIL" : "PENDING";
                          return (<>
                            <div className={`qa ${qa.pass ? "pass" : qa.checked ? "fail" : ""}`}>
                              <ShieldCheck size={22}/>
                              <div>
                                <div className="orbitron text-sm">{qa.pass ? "PASS" : qa.checked ? "FAIL" : "PENDING"}</div>
                                <div className="mono text-[11px] mt-2">DETECTED HUMANS: {qa.humanCount}</div>
                                <div className="mono text-[11px] mt-1">IDENTITY: {status(qa.identityPass)}</div>
                                <div className="mono text-[11px] mt-1">LOCATION: {status(qa.locationPass)}</div>
                                <div className="mono text-[11px] mt-1">SPATIAL SAFETY: {status(qa.spatialSafetyPass)}</div>
                                <div className="mono text-[11px] mt-1">REFERENCED TARGET: {status(qa.referencedTargetVisiblePass)}</div>
                                <div className="mono text-[11px] mt-1">PRESENCE CONTINUITY: {status(qa.continuityPresencePass)}</div>
                                <div className="mono text-[11px] mt-1">POSITION CONTINUITY: {status(qa.positionContinuityPass)}</div>
                                <div className="mono text-[11px] mt-1">PROP APPEARANCE: {status(qa.propAppearancePass)}</div>
                                <div className="mono text-[11px] mt-1">WARDROBE: {status(qa.wardrobeContinuityPass)}</div>
                                <div className="mono text-[11px] mt-1">ANATOMY/HANDS: {status(qa.anatomyPass)}</div>
                                <div className="mono text-[11px] mt-1">HEAD DIRECTION: VIDEO ONLY</div>
                                <div className="mono text-[11px] mt-1">STATE CONTINUITY: {status(qa.stateContinuityPass)}</div>
                                <div className="mono text-[11px] mt-1">DIALOGUE EYELINE: VIDEO ONLY</div>
                                <div className="mono text-[11px] mt-1">FORMAT {projectAspectRatio}: {status(qa.verticalPass)}</div>
                                <div className="mono text-[11px] mt-1">SINGLE FRAME: {status(qa.singleFramePass)}</div>
                                <div className="mono text-[11px] mt-1">ALL CAST VISIBLE: {status(qa.allCharactersVisible)}</div>
                                <div className="mono text-[11px] mt-1">FULL FRAME HD: {status(qa.fullFramePass)}</div>
                                <div className="mono text-[11px] mt-1">SAFE FRAMING: {status(qa.framingPass)}</div>
                                {qa.imageWidth > 0 && qa.imageHeight > 0 && (<div className="mono text-[11px] mt-1 muted">FRAME: {qa.imageWidth}×{qa.imageHeight}</div>)}
                              </div>
                            </div>
                            {(qa.issues || []).map((issue, index) => (<div className="qa-issue" key={index}>{issue}</div>))}
                          </>);
                        })()}
                        {selectedShot.anchorQaFeedback?.length ? (
                          <div className="prompt-output">
                            {selectedShot.anchorQaFeedback.map((item, index) => `FIX_${index + 1}: ${item}`).join("\n")}
                          </div>
                        ) : null}
                        <button type="button" disabled={busy || !selectedShot.anchorImage} onClick={async () => {
                          setBusy(true); setError("");
                          try { await validateAnchor(selectedShot.id); }
                          catch (err) { handleError(err); }
                          finally { setBusy(false); setProgress(""); }
                        }} className="secondary w-full">
                          <RefreshCw size={14}/>
                          RECHECK QA
                        </button>
                        </>)}
                      </Panel>
                  </div>) : (<EmptyState title="PILIH SHOT ATAU TAMBAH SHOT BARU"/>)}
                </div>
              </section>)}
            </>)}
          </main>
        </div>
      </>)}
    </div>);
}
function PageTitle({ code, title, subtitle }) {
    return (<div className="mb-6">
      <div className="mono green text-[12px] tracking-[.2em]">{code} // PIPELINE</div>
      <h2 className="orbitron text-2xl md:text-3xl font-bold tracking-[.08em] mt-2">{title}</h2>
      <div className="mono muted text-[13px] mt-3">{subtitle}</div>
    </div>);
}
function Panel({ title, icon, children }) {
    return (<div className="panel">
      <div className="panel-header">{icon}{title}</div>
      <div className="panel-content">{children}</div>
    </div>);
}
function WorkspaceGate({ workspaces, workspaceName, onWorkspaceNameChange, onCreateWorkspace, onOpenWorkspace, onRenameWorkspace, onDeleteWorkspace, onLogout }) {
    const [editingWorkspaceId, setEditingWorkspaceId] = useState(null);
    const [editingWorkspaceName, setEditingWorkspaceName] = useState("");
    const formatWorkspaceDate = (value) => {
        if (!value) return "--";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "--";
        return date.toLocaleString("id-ID");
    };
    const startWorkspaceEdit = (event, workspace) => {
        event.stopPropagation();
        setEditingWorkspaceId(workspace.id);
        setEditingWorkspaceName(workspace.name || "");
    };
    const saveWorkspaceEdit = (event, workspaceId) => {
        event.stopPropagation();
        const name = toText(editingWorkspaceName);
        if (!name) return;
        onRenameWorkspace(workspaceId, name);
        setEditingWorkspaceId(null);
        setEditingWorkspaceName("");
    };
    const cancelWorkspaceEdit = () => {
        setEditingWorkspaceId(null);
        setEditingWorkspaceName("");
    };
    const handleEditKeyDown = (event, workspaceId) => {
        event.stopPropagation();
        if (event.key === "Enter") {
            event.preventDefault();
            saveWorkspaceEdit(event, workspaceId);
        }
        if (event.key === "Escape") cancelWorkspaceEdit();
    };
    const handleCardKeyDown = (event, workspaceId) => {
        if (editingWorkspaceId === workspaceId) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenWorkspace(workspaceId);
        }
    };
    return (<main className="workspace-gate">
      <div className="workspace-gate-top">
        <div>
          <div className="workspace-gate-brand">COUNTSISTENT</div>
          <div className="workspace-gate-subtitle">DIRECTOR AI MICRODRAMA WORKSPACES</div>
        </div>
        <button type="button" className="workspace-logout" onClick={onLogout}>
          <Lock size={13}/>
          LOGOUT
        </button>
      </div>
      <section className="workspace-gate-inner">
        <div className="workspace-gate-heading">
          <div className="mono green text-[12px] tracking-[.2em]">WORKSPACE // SELECT</div>
          <h1>Choose Workspace</h1>
          <p>Buat workspace dulu, lalu klik card workspace untuk masuk ke project production.</p>
        </div>
        <form className="workspace-create" onSubmit={(event) => { event.preventDefault(); onCreateWorkspace(); }}>
          <label className="workspace-create-field">
            <span>WORKSPACE NAME</span>
            <input value={workspaceName} onChange={(event) => onWorkspaceNameChange(event.target.value)} placeholder="Drama Dealer Mobil" autoFocus/>
          </label>
          <button type="submit" className="workspace-create-button">
            <Boxes size={15}/>
            CREATE WORKSPACE
          </button>
        </form>
        <div className="workspace-card-grid">
          {workspaces.length ? workspaces.map((workspace) => (
            <div key={workspace.id} role="button" tabIndex={0} className="workspace-card" onClick={() => editingWorkspaceId !== workspace.id && onOpenWorkspace(workspace.id)} onKeyDown={(event) => handleCardKeyDown(event, workspace.id)}>
              <div className="workspace-card-icon"><Boxes size={22}/></div>
              <div className="workspace-card-body">
                {editingWorkspaceId === workspace.id ? (
                  <input className="workspace-name-input" value={editingWorkspaceName} onChange={(event) => setEditingWorkspaceName(event.target.value)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => handleEditKeyDown(event, workspace.id)} autoFocus/>
                ) : <strong>{workspace.name}</strong>}
                <span>Updated {formatWorkspaceDate(workspace.updatedAt || workspace.createdAt)}</span>
              </div>
              <div className="workspace-action-row">
                {editingWorkspaceId === workspace.id ? (
                  <button type="button" className="workspace-edit-button" aria-label={`Simpan nama workspace ${workspace.name}`} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => saveWorkspaceEdit(event, workspace.id)}>
                    <Check size={15}/>
                  </button>
                ) : (
                  <button type="button" className="workspace-edit-button" aria-label={`Edit nama workspace ${workspace.name}`} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => startWorkspaceEdit(event, workspace)}>
                    <Pencil size={15}/>
                  </button>
                )}
                <button type="button" className="workspace-delete-button" aria-label={`Hapus workspace ${workspace.name}`} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onDeleteWorkspace(workspace.id); }}>
                  <Trash2 size={15}/>
                </button>
              </div>
              <ChevronRight size={16} className="workspace-card-arrow"/>
            </div>
          )) : (
            <div className="workspace-empty">
              <Boxes size={30}/>
              <strong>BELUM ADA WORKSPACE</strong>
              <span>Buat workspace pertama untuk mulai produksi.</span>
            </div>
          )}
        </div>
      </section>
    </main>);
}
function UsageLogTable({ rows, loading, error, onRefresh }) {
    const formatEventTime = (value) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "--";
        return date.toLocaleString("id-ID");
    };
    const formatNumber = (value) => {
        const number = Number(value || 0);
        return Number.isFinite(number) ? number.toLocaleString("id-ID") : "0";
    };
    const formatCost = (value) => {
        const number = Number(value || 0);
        return Number.isFinite(number) ? `$${number.toFixed(6)}` : "$0.000000";
    };
    const formatTask = (row) => {
        const value = String(row?.task_type || "--").trim();
        return value || "--";
    };
    const formatKind = (row) => {
        const category = row?.metadata?.taskCategory || row?.metadata?.task_category || "";
        return String(category || row?.task_type || "--").toUpperCase();
    };
    const logs = Array.isArray(rows) ? rows : [];
    return (<Panel title="CREDIT USAGE TABLE" icon={<Table2 size={16}/>}>
      <div className="usage-toolbar">
        <div className="mono muted text-[11px]">
          {loading && !logs.length
            ? "LOADING AI USAGE LOGS..."
            : `${logs.length} ROW(S) FROM ai_usage_events${error ? ` • ERROR: ${error}` : ""}`}
        </div>
        <button type="button" className="secondary" disabled={loading} onClick={onRefresh}>REFRESH</button>
      </div>
      {!logs.length ? (
        !loading && !error && <EmptyState title="TIDAK ADA LOG DI DATABASE"/>
      ) : (
        <div className="usage-table-wrap">
          <table className="usage-table">
            <thead>
              <tr>
                <th>TIME</th>
                <th>PROVIDER</th>
                <th>MODEL</th>
                <th>TASK</th>
                <th>KIND</th>
                <th>PROMPT</th>
                <th>OUTPUT</th>
                <th>TOTAL</th>
                <th>CACHED</th>
                <th>CACHE WRITE</th>
                <th>CACHE STATUS</th>
                <th>COST</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row, index) => (
                <tr key={row.id || index}>
                  <td>{formatEventTime(row.created_at)}</td>
                  <td>{row.provider || "--"}</td>
                  <td>{row.model || "--"}</td>
                  <td>{formatTask(row)}</td>
                  <td>{formatKind(row)}</td>
                  <td>{formatNumber(row.prompt_tokens)}</td>
                  <td>{formatNumber(row.completion_tokens)}</td>
                  <td>{formatNumber(row.total_tokens)}</td>
                  <td>{formatNumber(row.cached_tokens)}</td>
                  <td>{formatNumber(row.cache_write_tokens)}</td>
                  <td className={String(row.cache_status || "").includes("HIT") ? "usage-delta" : ""}>{row.cache_status || "--"}</td>
                  <td>{formatCost(row.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>);
}
function InputField({ label, value, placeholder = "", onChange }) {
    return (<label>
      <span className="field-label">{label}</span>
      <input className="input" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => event.stopPropagation()}/>
    </label>);
}
function TextAreaField({ label, value, rows = 4, placeholder = "", onChange }) {
    return (<label>
      <span className="field-label">{label}</span>
      <textarea className="input" rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => event.stopPropagation()}/>
    </label>);
}
function NumberField({ label, value, min, max, onChange }) {
    return (<label>
      <span className="field-label">{label}</span>
      <input className="input" type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value || min))))} onKeyDown={(event) => event.stopPropagation()}/>
    </label>);
}
function SelectField({ label, value, values, onChange }) {
    return (<label className="block">
      <span className="field-label">{label}</span>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        {values.map((item) => (<option key={item} value={item}>{PROJECT_ASPECT_RATIO_LABELS[item] || item}</option>))}
      </select>
    </label>);
}
function StatusBadge({ label, active }) {
    return <div className={active ? "status active" : "status"}>{label}</div>;
}
function FieldStatus({ empty, outdated }) {
    if (empty) return <div className="status">EMPTY</div>;
    if (outdated) return (<div className="status warning"><AlertTriangle size={10} className="mr-1"/>OUTDATED</div>);
    return (<div className="status active"><Check size={10} className="mr-1"/>READY</div>);
}
function SectionHeading({ icon, title, meta }) {
    return (<div className="flex items-center justify-between gap-3 my-5">
      <div className="flex items-center gap-2">
        <span className="green">{icon}</span>
        <span className="orbitron text-sm tracking-[.1em]">{title}</span>
      </div>
      <span className="mono muted text-[11px]">{meta}</span>
    </div>);
}
function EmptyState({ title }) {
    return (<div className="empty-state">
      <Boxes size={34}/>
      <div className="empty-state-title">{title}</div>
    </div>);
}
type AssetCardProps = {
    id: any;
    title: any;
    subtitle?: string;
    description: any;
    image: any;
    status: any;
    locked: any;
    aspectRatio?: string;
    assetType?: string;
};
function AssetCard({
    id,
    title,
    subtitle = "",
    description,
    image,
    status,
    locked,
    aspectRatio = "9:16",
    assetType = "",
}: AssetCardProps) {
    // Jangan pakai aspectRatioToCssValue di sini: fungsi itu memaksa ke 9:16/16:9,
    // sehingga reference karakter (3:4) dan prop (1:1) tampil salah.
    const normalizedAspectRatio = normalizeAssetAspectRatio(assetType, aspectRatio);
    const ratioStyle: React.CSSProperties = {
        aspectRatio: normalizedAspectRatio.replace(":", " / "),
    };
    return (<div className="asset">
      <div className="asset-image" style={ratioStyle}>
        {status === "generating" ? (<Loader2 size={27} className="animate-spin green"/>) : image ? (<img src={assetUrl(image)} alt={title}/>) : (<ImageIcon size={28} className="muted"/>)}
      </div>
      <div className="p-4">
        <div className="mono cyan text-[11px]">{id}</div>
        <div className="orbitron text-sm mt-2">{title}</div>
        {subtitle && <div className="mono green text-[11px] mt-1">{subtitle}</div>}
        <div className="mono muted text-[11px] leading-5 mt-3">{description}</div>
        {status === "error" && (<div className="qa-issue mt-3">GENERATION FAILED — klik GENERATE + LOCK ALL REFERENCES untuk mencoba lagi.</div>)}
        {locked && (<div className="locked mt-4"><Lock size={11}/>LOCKED</div>)}
      </div>
    </div>);
}
function MultiSelectDropdown({ options, selected, onChange, placeholder = "— pilih —" }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const selectedSet = new Set(selected || []);

    useEffect(() => {
        if (!open) return;
        const handleClick = (event) => {
            if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
        };
        const handleKey = (event) => { if (event.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [open]);

    const toggleValue = (value) => {
        const next = new Set(selectedSet);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        // Pertahankan urutan sesuai daftar options
        onChange(options.map((o) => o.value).filter((v) => next.has(v)));
    };

    const summary = (selected || [])
        .map((v) => options.find((o) => o.value === v)?.label || v)
        .join(", ");

    return (
      <div ref={rootRef} className={`ms-dropdown${open ? " open" : ""}`}>
        <button type="button" className="ms-dropdown-trigger" onClick={() => setOpen((prev) => !prev)}>
          {summary ? summary : <span className="ms-placeholder">{placeholder}</span>}
          <span className="ms-caret"><ChevronDown size={16}/></span>
        </button>
        {open && (
          <div className="ms-dropdown-panel">
            {options.length === 0 ? (
              <div className="ms-dropdown-empty">Belum ada pilihan.</div>
            ) : options.map((o) => (
              <label key={o.value} className="ms-dropdown-option">
                <input type="checkbox" checked={selectedSet.has(o.value)} onChange={() => toggleValue(o.value)}/>
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
}
function Mini({ label, value }) {
    return (<div className="mini">
      <div className="field-label">{label}</div>
      <div className="mono green text-[12px] break-all">{value}</div>
    </div>);
}
