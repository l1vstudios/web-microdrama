import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Box, Check, ChevronRight, Clapperboard, Cpu, Download, Film, Image as ImageIcon, Loader2, Lock, MapPin, Play, RefreshCw, ScrollText, ShieldCheck, Sparkles, Terminal, Users, Zap, Save, Layers3, Boxes, Copy, } from "lucide-react";

const apiKey = ""; // credential supplied by Gemini Canvas execution environment when enabled
// Canvas-first model IDs.
// Gemini Canvas historically injects credentials for Gemini features into
// `const apiKey = ""`; stable 2.5 text/image models maximize compatibility.
const TEXT_MODEL = "gemini-2.5-flash";
const IMAGE_MODEL = "gemini-2.5-flash-image";
// Veo is attempted through the same Canvas credential mechanism.
// Canvas officially documents app AI features for text/image; video scope
// can depend on the account/runtime. The app handles Veo auth failure gracefully.
const VIDEO_MODEL = "veo-3.1-fast-generate-preview";
// Microdrama production is locked to vertical 9:16 for Scene Anchor and Veo.
const ANCHOR_ASPECT_RATIO = "9:16";
const CANVAS_MODE = true;
const CANVAS_AI_NOTE = "Canvas mode: API key is intentionally empty and supplied by Gemini Canvas when Gemini features are enabled.";

// ======================================================
// PROJECT PERSISTENCE — INDEXEDDB
// ======================================================
// IndexedDB is used instead of localStorage because generated reference/anchor
// images are base64 data URLs and can easily exceed localStorage quotas.
const PROJECT_DB_NAME = "slendro_microdrama_studio";
const PROJECT_DB_VERSION = 1;
const PROJECT_STORE_NAME = "project_snapshots";
const CURRENT_PROJECT_KEY = "current_project";
const PROJECT_SCHEMA_VERSION = 3;

const openProjectDb = () => new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
        reject(new Error("INDEXEDDB_UNAVAILABLE"));
        return;
    }
    const request = window.indexedDB.open(PROJECT_DB_NAME, PROJECT_DB_VERSION);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECT_STORE_NAME)) {
            db.createObjectStore(PROJECT_STORE_NAME, { keyPath: "key" });
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("INDEXEDDB_OPEN_FAILED"));
});

const readSavedProject = async () => {
    const db = await openProjectDb();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(PROJECT_STORE_NAME, "readonly");
            const store = tx.objectStore(PROJECT_STORE_NAME);
            const request = store.get(CURRENT_PROJECT_KEY);
            request.onsuccess = () => resolve(request.result?.snapshot || null);
            request.onerror = () => reject(request.error || new Error("PROJECT_LOAD_FAILED"));
        });
    }
    finally {
        db.close();
    }
};

const writeSavedProject = async (snapshot) => {
    const db = await openProjectDb();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(PROJECT_STORE_NAME, "readwrite");
            const store = tx.objectStore(PROJECT_STORE_NAME);
            store.put({
                key: CURRENT_PROJECT_KEY,
                snapshot,
                updatedAt: Date.now(),
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error("PROJECT_SAVE_FAILED"));
            tx.onabort = () => reject(tx.error || new Error("PROJECT_SAVE_ABORTED"));
        });
    }
    finally {
        db.close();
    }
};

const makePersistableShots = (items) => (items || []).map((shot) => ({
    ...shot,
    // Blob URLs are page-session scoped and become invalid after refresh.
    // Keep anchors/prompts/QA, but force video playback to be regenerated.
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pad = (value, length = 3) => String(value).padStart(length, "0");
const toText = (value) => {
    if (value === null || value === undefined)
        return "";
    if (typeof value === "string")
        return value.trim();
    if (Array.isArray(value)) {
        return value
            .map((item) => toText(item))
            .filter(Boolean)
            .join("\n")
            .trim();
    }
    if (typeof value === "object") {
        return Object.entries(value)
            .map(([key, item]) => {
            const text = toText(item);
            if (!text)
                return "";
            const label = String(key)
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .replace(/[_-]+/g, " ")
                .toUpperCase();
            return `${label}: ${text}`;
        })
            .filter(Boolean)
            .join("\n")
            .trim();
    }
    return String(value).trim();
};
const cleanJson = (value) => String(value ?? "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
const safeJsonParse = (value) => {
    try {
        return JSON.parse(cleanJson(value));
    }
    catch {
        console.error("Invalid AI JSON:", value);
        throw new Error("AI_RETURNED_INVALID_JSON");
    }
};
const parseDataUrl = (value) => {
    const match = value.match(/^data:(.+?);base64,(.+)$/);
    if (!match)
        throw new Error("INVALID_DATA_URL");
    return { mimeType: match[1], data: match[2] };
};

// ======================================================
// BROWSER-NATIVE ZIP HELPERS
// ======================================================
// No third-party ZIP package is required. This keeps the app single-file
// and friendly to Gemini Canvas. Files are stored without compression.
const base64ToUint8Array = (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

const mimeToExtension = (mimeType) => {
    const mime = String(mimeType || "").toLowerCase();
    if (mime.includes("jpeg") || mime.includes("jpg"))
        return "jpg";
    if (mime.includes("webp"))
        return "webp";
    if (mime.includes("gif"))
        return "gif";
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
    const dosTime =
        (date.getHours() << 11) |
        (date.getMinutes() << 5) |
        Math.floor(date.getSeconds() / 2);
    const dosDate =
        ((year - 1980) << 9) |
        ((date.getMonth() + 1) << 5) |
        date.getDate();
    return { dosTime, dosDate };
};

const concatUint8Arrays = (arrays) => {
    const totalLength = arrays.reduce((sum, array) => sum + array.length, 0);
    const output = new Uint8Array(totalLength);
    let offset = 0;
    for (const array of arrays) {
        output.set(array, offset);
        offset += array.length;
    }
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
        localView.setUint16(8, 0, true); // store, no compression
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
        centralView.setUint16(10, 0, true); // store, no compression
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

    return new Blob([localData, centralDirectory, endRecord], {
        type: "application/zip",
    });
};
const toBool = (value) => {
    if (value === true || value === 1)
        return true;
    if (value === false || value === 0 || value === null || value === undefined)
        return false;
    const normalized = String(value).trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "pass";
};
const normalizeIssues = (value) => {
    if (!value)
        return [];
    if (Array.isArray(value))
        return value.map((item) => toText(item)).filter(Boolean);
    const text = toText(value);
    return text ? [text] : [];
};
const getImageDimensions = (dataUrl) => new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    image.onerror = () => reject(new Error("ANCHOR_DIMENSION_READ_FAILED"));
    image.src = dataUrl;
});
const isVerticalNineSixteen = (width, height) => {
    if (!width || !height || height <= width)
        return false;
    const target = 9 / 16;
    const actual = width / height;
    return Math.abs(actual - target) <= 0.04;
};
// ======================================================
// CONTINUITY + MOTION SAFETY HELPERS
// ======================================================
// Locomotion is opt-in. Dialogue, eating, looking, sitting and hand actions do
// not grant permission to make an actor walk around the set.
const LOCOMOTION_PATTERN = /\b(?:walk(?:s|ed|ing)?|enter(?:s|ed|ing)?|exit(?:s|ed|ing)?|approach(?:es|ed|ing)?|arrive(?:s|d|ing)?|come(?:s|ing)?\s+(?:in|into|toward|towards)|step(?:s|ped|ping)?\s+(?:toward|towards|forward|back|into|out)|run(?:s|ning)?|leave(?:s|ing)?|cross(?:es|ed|ing)?|move(?:s|d|ing)?\s+(?:toward|towards|across|into|out)|berjalan|masuk|keluar|mendekat|melangkah|berlari|meninggalkan|menuju|menyeberang|datang|tiba)\b/i;
const actionRequiresLocomotion = (value) => LOCOMOTION_PATTERN.test(toText(value));
const uniqueStrings = (items) => [...new Set((items || []).map((item) => toText(item)).filter(Boolean))];
const normalizeIdList = (value) => uniqueStrings(Array.isArray(value) ? value : []);
const mergeIdLists = (...groups) => uniqueStrings(groups.flatMap((group) => Array.isArray(group) ? group : []));
const normalizeVisibleTargets = (value) => {
    if (!Array.isArray(value))
        return [];
    const seen = new Set();
    return value
        .map((item) => ({
        characterId: toText(item?.characterId),
        evidence: toText(item?.evidence || item?.reason || item?.dialogueEvidence),
    }))
        .filter((item) => item.characterId && !seen.has(item.characterId) && seen.add(item.characterId));
};
const inferStaticFraming = (camera) => {
    const value = toText(camera).toLowerCase();
    let size = "medium shot";
    if (value.includes("extreme close"))
        size = "extreme close-up";
    else if (value.includes("close-up") || value.includes("close up"))
        size = "close-up";
    else if (value.includes("medium close"))
        size = "medium close-up";
    else if (value.includes("medium wide"))
        size = "medium-wide shot";
    else if (value.includes("wide"))
        size = "wide shot";
    else if (value.includes("full"))
        size = "full-body shot";
    else if (value.includes("medium"))
        size = "medium shot";
    return `Static locked-off ${size}, eye level. No tracking, dolly, orbit, pan, tilt, zoom or follow movement.`;
};
/**
 * Keep the old Canvas-style API key mechanism:
 * `...?key=${apiKey}` even when apiKey is an empty literal.
 */
const canvasUrl = (path) => {
    const separator = path.includes("?") ? "&" : "?";
    return `https://generativelanguage.googleapis.com/v1beta/${path}${separator}key=${apiKey}`;
};
const fetchJsonWithRetry = async (url, options, maxRetries = 4) => {
    let delay = 1200;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = payload?.error?.message ||
                    payload?.message ||
                    response.statusText ||
                    "Unknown API error";
                if ([400, 401, 403, 404].includes(response.status)) {
                    throw new Error(`API_${response.status}: ${message}`);
                }
                if (response.status === 429 || response.status >= 500) {
                    if (attempt === maxRetries - 1) {
                        throw new Error(`API_${response.status}: ${message}`);
                    }
                    await sleep(delay);
                    delay *= 2;
                    continue;
                }
                throw new Error(`API_${response.status}: ${message}`);
            }
            return payload;
        }
        catch (error) {
            const message = String(error?.message || error);
            if (message.startsWith("API_400") ||
                message.startsWith("API_401") ||
                message.startsWith("API_403") ||
                message.startsWith("API_404")) {
                throw error;
            }
            if (attempt === maxRetries - 1)
                throw error;
            await sleep(delay);
            delay *= 2;
        }
    }
    throw new Error("REQUEST_FAILED");
};
const normalizeReferenceInput = (value, index) => {
    if (typeof value === "string") {
        return {
            image: value,
            label: `REFERENCE_${index + 1}`,
            type: "GENERIC_REFERENCE",
            id: `REF_${index + 1}`,
            authority: "Use only for the purpose described by the final task prompt.",
        };
    }
    return {
        image: value?.image || value?.dataUrl || value?.src || "",
        label: toText(value?.label) || `REFERENCE_${index + 1}`,
        type: toText(value?.type) || "GENERIC_REFERENCE",
        id: toText(value?.id) || `REF_${index + 1}`,
        authority: toText(value?.authority) || "Use only for the purpose described by the final task prompt.",
    };
};

const appendLabeledImageParts = (parts, references = []) => {
    references.forEach((input, index) => {
        const ref = normalizeReferenceInput(input, index);
        if (!ref.image)
            return;
        const parsed = parseDataUrl(ref.image);
        parts.push({
            text: `REFERENCE_ASSET_${index + 1}\nTYPE: ${ref.type}\nID: ${ref.id}\nLABEL: ${ref.label}\nAUTHORITY: ${ref.authority}\nThe image immediately following this label belongs ONLY to this ID. Do not swap, blend or average it with another identity.`,
        });
        parts.push({
            inlineData: {
                mimeType: parsed.mimeType,
                data: parsed.data,
            },
        });
    });
};

const callText = async (prompt, images = [], temperature = 0.15) => {
    const parts = [];
    appendLabeledImageParts(parts, images);
    parts.push({ text: prompt });
    const payload = {
        contents: [{ role: "user", parts }],
        generationConfig: {
            temperature,
            responseMimeType: "application/json",
        },
    };
    const result = await fetchJsonWithRetry(canvasUrl(`models/${TEXT_MODEL}:generateContent`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const text = result?.candidates?.[0]?.content?.parts?.find((part) => typeof part?.text === "string")?.text;
    if (!text)
        throw new Error("TEXT_MODEL_EMPTY_RESPONSE");
    return text;
};
const callJSON = async (prompt, images = [], temperature = 0.15) => {
    const text = await callText(`${prompt}

STRICT RESPONSE CONTRACT:
- Return valid JSON only.
- No markdown.
- No code fence.
- No explanation outside JSON.`, images, temperature);
    return safeJsonParse(text);
};
const generateImage = async (prompt, references = [], aspectRatio = "1:1") => {
    const parts = [];
    if (references.length) {
        parts.push({
            text: `MANDATORY REFERENCE STUDY PHASE — INTERNAL ONLY:\nBefore rendering, inspect every labeled reference asset below. Build an internal one-to-one mapping between each ID and its image. Character master references are immutable identity authorities. Never merge two faces, average facial traits, swap costumes, or infer a new face. Location references are geometry/set authorities, not character authorities. Previous approved anchors are continuity-layout references only and must NEVER override a Character Master identity. Do not output this analysis; use it only to generate the final image.`,
        });
        appendLabeledImageParts(parts, references);
        parts.push({
            text: `END OF REFERENCE PACK. Reconfirm the ID-to-image mapping before generation. Highest priority: exact Character Master face/identity preservation. Second priority: locked costume/body/hair. Third priority: locked location geometry. Previous QA-passed anchors may guide staging only.`,
        });
    }
    parts.push({ text: prompt });
    const payload = {
        contents: [{ role: "user", parts }],
        generationConfig: {
            responseModalities: ["IMAGE"],
            responseFormat: {
                image: {
                    aspectRatio,
                },
            },
        },
    };
    const result = await fetchJsonWithRetry(canvasUrl(`models/${IMAGE_MODEL}:generateContent`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const resultParts = result?.candidates?.[0]?.content?.parts || [];
    const imagePart = resultParts.find((part) => part?.inlineData?.data || part?.inline_data?.data);
    if (!imagePart) {
        const modelText = resultParts
            .filter((part) => part?.text)
            .map((part) => part.text)
            .join(" ");
        throw new Error(`IMAGE_NOT_RETURNED${modelText ? `: ${modelText}` : ""}`);
    }
    const inline = imagePart.inlineData || imagePart.inline_data;
    const mimeType = inline.mimeType || inline.mime_type || "image/png";
    return `data:${mimeType};base64,${inline.data}`;
};
const startVeo = async (prompt, anchorImage, aspectRatio) => {
    const anchor = parseDataUrl(anchorImage);
    const payload = {
        instances: [
            {
                prompt,
                // The validated Scene Anchor is used as Veo's first frame.
                image: {
                    inlineData: {
                        mimeType: anchor.mimeType,
                        data: anchor.data,
                    },
                },
            },
        ],
        parameters: {
            aspectRatio,
            durationSeconds: "8",
            resolution: "720p",
            numberOfVideos: 1,
            personGeneration: "allow_adult",
        },
    };
    let result;
    try {
        result = await fetchJsonWithRetry(canvasUrl(`models/${VIDEO_MODEL}:predictLongRunning`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    }
    catch (error) {
        const message = String(error?.message || error);
        if (message.startsWith("API_401") || message.startsWith("API_403")) {
            throw new Error(`CANVAS_VEO_SCOPE_UNAVAILABLE: ${message}`);
        }
        throw error;
    }
    if (!result?.name)
        throw new Error("VEO_OPERATION_NAME_MISSING");
    return result.name;
};
const pollVeo = async (operationName, onTick) => {
    // Veo can take several minutes; poll the long-running operation.
    for (let attempt = 0; attempt < 90; attempt++) {
        onTick?.(`Veo processing... poll ${attempt + 1}`);
        const result = await fetchJsonWithRetry(canvasUrl(operationName), { method: "GET" }, 2);
        if (result?.done) {
            if (result?.error) {
                throw new Error(`VEO_FAILED: ${result.error?.message || "Unknown Veo error"}`);
            }
            const videoUri = result?.response?.generateVideoResponse?.generatedSamples?.[0]?.video
                ?.uri;
            if (!videoUri) {
                throw new Error("VEO_FINISHED_BUT_VIDEO_URI_MISSING");
            }
            return videoUri;
        }
        await sleep(10000);
    }
    throw new Error("VEO_POLL_TIMEOUT");
};
const downloadVideoToBlobUrl = async (remoteUri) => {
    /**
     * Canvas-style key query is kept for consistency.
     * The API returns a temporary URI. The user should download/save the clip.
     */
    const separator = remoteUri.includes("?") ? "&" : "?";
    const url = `${remoteUri}${separator}key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`VIDEO_DOWNLOAD_${response.status}`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
};
export default function MicroDramaVeoStudio() {
    const [stage, setStage] = useState("project");
    const [project, setProject] = useState({
        title: "",
        genre: "Hidden Identity",
        premise: "",
        episodeCount: 10,
        episodeDuration: 90,
        castCount: 4,
        locationCount: 4,
        propCount: 3,
        aspectRatio: "9:16",
        language: "Indonesian",
        visualStyle: "",
        storyRules: "",
    });
    const [characters, setCharacters] = useState([]);
    const [locations, setLocations] = useState([]);
    const [props, setProps] = useState([]);
    const [episodes, setEpisodes] = useState([]);
    const [scripts, setScripts] = useState({});
    const [shots, setShots] = useState([]);
    const [selectedEpisode, setSelectedEpisode] = useState(1);
    const [selectedShotId, setSelectedShotId] = useState(null);
    const [visualLoading, setVisualLoading] = useState(false);
    const [guardLoading, setGuardLoading] = useState(false);
    const [visualSource, setVisualSource] = useState("");
    const [guardSource, setGuardSource] = useState("");
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState("");
    const [error, setError] = useState("");
    const [storageReady, setStorageReady] = useState(false);
    const [savingProject, setSavingProject] = useState(false);
    const [saveMessage, setSaveMessage] = useState("LOADING PROJECT...");
    const autosaveTimerRef = useRef(null);
    const buildProjectSnapshot = () => ({
        schemaVersion: PROJECT_SCHEMA_VERSION,
        savedAt: Date.now(),
        stage,
        project,
        characters,
        locations,
        props,
        episodes,
        scripts,
        shots: makePersistableShots(shots),
        selectedEpisode,
        selectedShotId,
        visualSource,
        guardSource,
    });

    const saveProjectNow = async ({ silent = false } = {}) => {
        if (!storageReady)
            return;
        if (!silent)
            setSavingProject(true);
        try {
            await writeSavedProject(buildProjectSnapshot());
            const stamp = new Date();
            const label = `${String(stamp.getHours()).padStart(2, "0")}:${String(stamp.getMinutes()).padStart(2, "0")}:${String(stamp.getSeconds()).padStart(2, "0")}`;
            setSaveMessage(silent ? `AUTO-SAVED ${label}` : `PROJECT SAVED ${label}`);
        }
        catch (err) {
            console.error("Project save failed:", err);
            setSaveMessage("SAVE FAILED");
            if (!silent)
                handleError(err);
        }
        finally {
            if (!silent)
                setSavingProject(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        const restore = async () => {
            try {
                const saved = await readSavedProject();
                if (cancelled)
                    return;
                if (saved) {
                    if (saved.project)
                        setProject(saved.project);
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
                    setStage(saved.stage || "project");
                    setSaveMessage("PROJECT RESTORED");
                }
                else {
                    setSaveMessage("AUTO-SAVE READY");
                }
            }
            catch (err) {
                console.error("Project restore failed:", err);
                setSaveMessage("STORAGE UNAVAILABLE");
            }
            finally {
                if (!cancelled)
                    setStorageReady(true);
            }
        };
        restore();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!storageReady)
            return;
        if (autosaveTimerRef.current)
            window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = window.setTimeout(() => {
            saveProjectNow({ silent: true });
        }, 900);
        return () => {
            if (autosaveTimerRef.current)
                window.clearTimeout(autosaveTimerRef.current);
        };
    }, [
        storageReady,
        stage,
        project,
        characters,
        locations,
        props,
        episodes,
        scripts,
        shots,
        selectedEpisode,
        selectedShotId,
        visualSource,
        guardSource,
    ]);

    const projectContextKey = useMemo(() => JSON.stringify({
        title: toText(project.title),
        genre: toText(project.genre),
        premise: toText(project.premise),
    }), [project.title, project.genre, project.premise]);
    const baseContextReady = !!toText(project.title) && !!toText(project.genre) && !!toText(project.premise);
    const visualOutdated = !!toText(project.visualStyle) &&
        !!visualSource &&
        visualSource !== projectContextKey;
    const guardOutdated = !!toText(project.storyRules) &&
        !!guardSource &&
        guardSource !== projectContextKey;
    const characterMap = useMemo(() => new Map(characters.map((item) => [item.id, item])), [characters]);
    const locationMap = useMemo(() => new Map(locations.map((item) => [item.id, item])), [locations]);
    const propMap = useMemo(() => new Map(props.map((item) => [item.id, item])), [props]);
    const selectedShot = useMemo(() => shots.find((shot) => shot.id === selectedShotId) || null, [shots, selectedShotId]);
    const handleError = (err) => {
        console.error(err);
        const message = String(err?.message || err);
        if (message.startsWith("CANVAS_VEO_SCOPE_UNAVAILABLE")) {
            setError("Veo belum diberi scope oleh runtime Gemini Canvas pada app/account ini. " +
                "Text, image, Character Lock, Episode, Script, Shot, Master Prompt, dan Anchor tetap bisa digunakan. " +
                "Gunakan Add Gemini features di Canvas; jika Canvas tetap menolak Veo, video API memerlukan akses Veo terautentikasi di luar credential Canvas.");
            return;
        }
        if (message.startsWith("API_401") || message.startsWith("API_403")) {
            setError(`${message} — Gemini feature credential belum terpasang/berlaku untuk model ini. ` +
                `Di Gemini Canvas klik Add Gemini features, lalu jalankan ulang app. ` +
                `Build ini tidak meminta API key manual.`);
            return;
        }
        setError(message);
    };
    // ======================================================
    // PROJECT INTELLIGENCE
    // ======================================================
    const generateVisualStyle = async () => {
        if (!baseContextReady) {
            setError("Isi SERIES TITLE, GENRE, dan PREMISE terlebih dahulu.");
            return;
        }
        setVisualLoading(true);
        setError("");
        try {
            const result = await callJSON(`
ROLE:
You are the Visual Director for a controlled microdrama production.

SOURCE OF TRUTH:
TITLE: ${project.title}
GENRE: ${project.genre}
PREMISE: ${project.premise}
CULTURAL/LANGUAGE CONTEXT: ${project.language}

TASK:
Create a reusable visual production specification suitable for:
- character master references
- location references
- scene anchor frames
- AI video shots

MAY DEFINE:
- live-action aesthetic
- cinematography
- natural actor appearance
- skin rendering
- wardrobe realism
- location realism
- lighting philosophy
- camera style
- production quality
- visual continuity rules
- things to avoid

MUST NOT:
- invent character names
- invent company names
- invent locations
- invent important props
- invent plot twists
- add story events
- add backstory
- change the premise

Keep the production language practical rather than poetic.

RETURN:
{
  "visualStyle": "complete visual production specification"
}
`, [], 0.2);
            const visualStyle = toText(result?.visualStyle);
            if (!visualStyle)
                throw new Error("VISUAL_STYLE_EMPTY");
            setProject((prev) => ({
                ...prev,
                visualStyle,
            }));
            setVisualSource(projectContextKey);
        }
        catch (err) {
            handleError(err);
        }
        finally {
            setVisualLoading(false);
        }
    };
    const generateStoryGuardrails = async () => {
        if (!baseContextReady) {
            setError("Isi SERIES TITLE, GENRE, dan PREMISE terlebih dahulu.");
            return;
        }
        setGuardLoading(true);
        setError("");
        try {
            const result = await callJSON(`
ROLE:
You are a strict Continuity Supervisor.

SOURCE OF TRUTH:
TITLE: ${project.title}
GENRE: ${project.genre}
PREMISE: ${project.premise}

TASK:
Create production guardrails that keep every later AI stage inside the premise.

GUARDRAILS MUST ENFORCE:
- no unrelated subplots
- no unapproved named characters after Character Lock
- no unapproved locations after World Lock
- no unapproved major props after Prop Lock
- locked Character identity overrides creativity
- locked costume overrides creativity
- locked Location overrides creativity
- locked Prop overrides creativity
- Episode Manifest overrides Script AI
- Script overrides Shot Planner
- Shot Manifest overrides Master Video Prompt
- character knowledge must be chronological
- continuity cannot reset between episodes
- never duplicate a character inside one shot
- minimize background people
- minimize visible humans per shot
- no story expansion merely to fill episode count
- if required asset is unavailable: ASSET_REQUEST_REQUIRED
- if continuity conflicts: CONTINUITY_BLOCKED
- video prompting AI is a compiler, not a storyteller
- minimize AI initiative outside explicit context

DO NOT invent story facts while writing the rules.

RETURN:
{
  "storyGuardrails": "numbered strict production rules"
}
`, [], 0.05);
            const storyGuardrails = toText(result?.storyGuardrails);
            if (!storyGuardrails) {
                throw new Error("STORY_GUARDRAILS_EMPTY");
            }
            setProject((prev) => ({
                ...prev,
                storyRules: storyGuardrails,
            }));
            setGuardSource(projectContextKey);
        }
        catch (err) {
            handleError(err);
        }
        finally {
            setGuardLoading(false);
        }
    };
    // ======================================================
    // PRODUCTION BIBLE
    // ======================================================
    const generateProductionBible = async () => {
        if (!baseContextReady) {
            setError("Project belum lengkap.");
            return;
        }
        if (!toText(project.visualStyle) || visualOutdated) {
            setError("VISUAL STYLE belum siap atau OUTDATED.");
            return;
        }
        if (!toText(project.storyRules) || guardOutdated) {
            setError("STORY GUARDRAILS belum siap atau OUTDATED.");
            return;
        }
        setBusy(true);
        setError("");
        setProgress("AI Producer membuat Production Bible...");
        try {
            const result = await callJSON(`
ROLE:
You are the Production Asset Designer.

PROJECT:
TITLE: ${project.title}
GENRE: ${project.genre}
PREMISE: ${project.premise}

LOCKED VISUAL STYLE:
${project.visualStyle}

LOCKED STORY GUARDRAILS:
${project.storyRules}

REQUIRED:
- EXACTLY ${project.castCount} recurring named characters
- MAXIMUM ${project.locationCount} reusable locations
- MAXIMUM ${project.propCount} important recurring props

CHARACTER RULES:
- characters must directly serve the original premise
- no extras
- no crowd-character definitions
- stable permanent physical identity
- one default continuity costume
- no background description inside character identity

LOCATION RULES:
- reusable production sets
- define permanent architecture and furniture
- do not define humans

PROP RULES:
- only story-important recurring props
- no trivial items

DO NOT WRITE:
- episodes
- scenes
- dialogue
- future twists not implied by the premise

RETURN:
{
  "characters": [
    {
      "name": "",
      "role": "",
      "description": "",
      "identity": {
        "age": "",
        "gender": "",
        "ethnicity": "",
        "face": "",
        "eyes": "",
        "nose": "",
        "lips": "",
        "hair": "",
        "skin": "",
        "body": "",
        "distinguishingMarks": ""
      },
      "costume": {
        "outfit": "",
        "accessories": ""
      }
    }
  ],
  "locations": [
    {
      "name": "",
      "description": "",
      "architecture": "",
      "furniture": "",
      "lighting": "",
      "colors": ""
    }
  ],
  "props": [
    {
      "name": "",
      "description": "",
      "appearance": ""
    }
  ]
}
`, [], 0.2);
            if (result.characters?.length !== project.castCount) {
                throw new Error(`CAST_COUNT_MISMATCH expected=${project.castCount} actual=${result.characters?.length || 0}`);
            }
            const normalizedCharacters = result.characters.map((item, index) => ({
                id: `CHAR_${pad(index + 1)}`,
                name: item.name || `Character ${index + 1}`,
                role: item.role || "",
                description: item.description || "",
                identity: {
                    age: item.identity?.age || "",
                    gender: item.identity?.gender || "",
                    ethnicity: item.identity?.ethnicity || "",
                    face: item.identity?.face || "",
                    eyes: item.identity?.eyes || "",
                    nose: item.identity?.nose || "",
                    lips: item.identity?.lips || "",
                    hair: item.identity?.hair || "",
                    skin: item.identity?.skin || "",
                    body: item.identity?.body || "",
                    distinguishingMarks: item.identity?.distinguishingMarks || "",
                },
                costume: {
                    outfit: item.costume?.outfit || "",
                    accessories: item.costume?.accessories || "",
                },
                referenceImage: null,
                locked: false,
                status: "idle",
            }));
            const normalizedLocations = (result.locations || []).map((item, index) => ({
                id: `LOC_${pad(index + 1)}`,
                name: item.name || `Location ${index + 1}`,
                description: item.description || "",
                architecture: item.architecture || "",
                furniture: item.furniture || "",
                lighting: item.lighting || "",
                colors: item.colors || "",
                referenceImage: null,
                locked: false,
                status: "idle",
            }));
            const normalizedProps = (result.props || []).map((item, index) => ({
                id: `PROP_${pad(index + 1)}`,
                name: item.name || `Prop ${index + 1}`,
                description: item.description || "",
                appearance: item.appearance || "",
                referenceImage: null,
                locked: false,
                status: "idle",
            }));
            setCharacters(normalizedCharacters);
            setLocations(normalizedLocations);
            setProps(normalizedProps);
            setEpisodes([]);
            setScripts({});
            setShots([]);
            setStage("assets");
        }
        catch (err) {
            handleError(err);
        }
        finally {
            setBusy(false);
            setProgress("");
        }
    };
    // ======================================================
    // REFERENCE ASSETS
    // ======================================================
    const characterPrompt = (character) => `
TASK:
Create a MASTER CHARACTER REFERENCE for a continuity-sensitive microdrama.

CHARACTER_ID: ${character.id}
NAME: ${character.name}
ROLE: ${character.role}
DESCRIPTION: ${character.description}

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

DEFAULT OUTFIT: ${character.costume.outfit}
ACCESSORIES: ${character.costume.accessories || "None"}

SERIES VISUAL STYLE:
${project.visualStyle}

ABSOLUTE RULES:
- exactly ONE adult human
- no other person
- no crowd
- no human reflection
- no story action
- neutral studio background
- waist-up reference
- front or subtle 3/4 angle
- neutral expression
- realistic live-action actor
- natural skin texture
- face clearly visible
- no random text
- no watermark
- do not invent identity traits
- do not redesign the character

Output only the reference image.
`;
    const locationPrompt = (location) => `
TASK:
Create a MASTER LOCATION REFERENCE.

LOCATION_ID: ${location.id}
NAME: ${location.name}
DESCRIPTION: ${location.description}
ARCHITECTURE: ${location.architecture}
PERMANENT FURNITURE: ${location.furniture}
BASE LIGHTING: ${location.lighting}
COLOR DIRECTION: ${location.colors}

SERIES VISUAL STYLE:
${project.visualStyle}

ABSOLUTE RULES:
- ZERO humans
- no crowd
- no animals
- no story action
- clear wide establishing composition
- preserve architecture
- preserve permanent furniture layout
- realistic live-action production set
- no watermark
- no random text

Output only the reference image.
`;
    const propPrompt = (prop) => `
TASK:
Create a MASTER PROP REFERENCE.

PROP_ID: ${prop.id}
NAME: ${prop.name}
DESCRIPTION: ${prop.description}
PERMANENT APPEARANCE: ${prop.appearance}

ABSOLUTE RULES:
- one main prop only
- no humans
- no hands
- no scene
- neutral studio background
- preserve shape/material/color
- realistic production photography
- no watermark

Output only the reference image.
`;
    const generateAllReferences = async () => {
        setBusy(true);
        setError("");
        try {
            let nextCharacters = [...characters];
            for (let i = 0; i < nextCharacters.length; i++) {
                if (nextCharacters[i].locked && nextCharacters[i].referenceImage) {
                    continue;
                }
                setProgress(`Character ${i + 1}/${nextCharacters.length}: ${nextCharacters[i].name}`);
                nextCharacters[i] = {
                    ...nextCharacters[i],
                    status: "generating",
                };
                setCharacters([...nextCharacters]);
                try {
                    const image = await generateImage(characterPrompt(nextCharacters[i]), [], "1:1");
                    nextCharacters[i] = {
                        ...nextCharacters[i],
                        referenceImage: image,
                        locked: true,
                        status: "ready",
                    };
                }
                catch (err) {
                    nextCharacters[i] = { ...nextCharacters[i], status: "error" };
                    setCharacters([...nextCharacters]);
                    throw err;
                }
                setCharacters([...nextCharacters]);
            }
            let nextLocations = [...locations];
            for (let i = 0; i < nextLocations.length; i++) {
                if (nextLocations[i].locked && nextLocations[i].referenceImage)
                    continue;
                setProgress(`Location ${i + 1}/${nextLocations.length}: ${nextLocations[i].name}`);
                nextLocations[i] = { ...nextLocations[i], status: "generating" };
                setLocations([...nextLocations]);
                try {
                    const image = await generateImage(locationPrompt(nextLocations[i]), [], project.aspectRatio);
                    nextLocations[i] = {
                        ...nextLocations[i],
                        referenceImage: image,
                        locked: true,
                        status: "ready",
                    };
                }
                catch (err) {
                    nextLocations[i] = { ...nextLocations[i], status: "error" };
                    setLocations([...nextLocations]);
                    throw err;
                }
                setLocations([...nextLocations]);
            }
            let nextProps = [...props];
            for (let i = 0; i < nextProps.length; i++) {
                if (nextProps[i].locked && nextProps[i].referenceImage)
                    continue;
                setProgress(`Prop ${i + 1}/${nextProps.length}: ${nextProps[i].name}`);
                nextProps[i] = { ...nextProps[i], status: "generating" };
                setProps([...nextProps]);
                try {
                    const image = await generateImage(propPrompt(nextProps[i]), [], "1:1");
                    nextProps[i] = {
                        ...nextProps[i],
                        referenceImage: image,
                        locked: true,
                        status: "ready",
                    };
                }
                catch (err) {
                    nextProps[i] = { ...nextProps[i], status: "error" };
                    setProps([...nextProps]);
                    throw err;
                }
                setProps([...nextProps]);
            }
        }
        catch (err) {
            handleError(err);
        }
        finally {
            setBusy(false);
            setProgress("");
        }
    };
    // ======================================================
    // EPISODE MANIFEST
    // ======================================================
    const generateEpisodeManifest = async () => {
        if (characters.some((item) => !item.locked)) {
            setError("Semua character harus LOCKED.");
            return;
        }
        if (locations.some((item) => !item.locked)) {
            setError("Semua location harus LOCKED.");
            return;
        }
        setBusy(true);
        setError("");
        setProgress("Series Producer menyusun Episode Manifest...");
        try {
            const assetDB = {
                characters: characters.map((item) => ({
                    id: item.id,
                    name: item.name,
                    role: item.role,
                })),
                locations: locations.map((item) => ({
                    id: item.id,
                    name: item.name,
                })),
                props: props.map((item) => ({
                    id: item.id,
                    name: item.name,
                })),
            };
            const result = await callJSON(`
ROLE:
You are the SERIES PRODUCER.

PROJECT:
TITLE: ${project.title}
GENRE: ${project.genre}
PREMISE: ${project.premise}
TOTAL EPISODES: ${project.episodeCount}
TARGET DURATION / EPISODE: ${project.episodeDuration} seconds

LOCKED STORY GUARDRAILS:
${project.storyRules}

LOCKED ASSET DATABASE:
${JSON.stringify(assetDB, null, 2)}

THIS STAGE MAY ONLY DECIDE:
- which approved characters appear in each episode
- which approved locations are used
- which approved props are used
- episode objective
- opening state
- ending state
- cliffhanger

HARD RULES:
- EXACTLY ${project.episodeCount} episodes
- ONLY listed IDs
- never create a character
- never create a named location
- never create an important prop
- never change locked identities
- maintain continuity
- do not create unrelated subplots
- every episode advances the original premise
- minimize cast where possible
- if an unavailable recurring asset is truly necessary, mention ASSET_REQUEST_REQUIRED in continuityNotes, but do not invent the asset

RETURN:
{
  "episodes": [
    {
      "episode": 1,
      "title": "",
      "logline": "",
      "objective": "",
      "characterIds": [],
      "locationIds": [],
      "propIds": [],
      "openingState": "",
      "endingState": "",
      "cliffhanger": "",
      "continuityNotes": []
    }
  ]
}
`, [], 0.15);
            if (result.episodes?.length !== project.episodeCount) {
                throw new Error(`EPISODE_COUNT_MISMATCH expected=${project.episodeCount} actual=${result.episodes?.length || 0}`);
            }
            const allowedCharacters = new Set(characters.map((item) => item.id));
            const allowedLocations = new Set(locations.map((item) => item.id));
            const allowedProps = new Set(props.map((item) => item.id));
            const normalized = result.episodes.map((item, index) => {
                const characterIds = item.characterIds || [];
                const locationIds = item.locationIds || [];
                const propIds = item.propIds || [];
                characterIds.forEach((id) => {
                    if (!allowedCharacters.has(id)) {
                        throw new Error(`UNKNOWN_CHARACTER_ID_${id}`);
                    }
                });
                locationIds.forEach((id) => {
                    if (!allowedLocations.has(id)) {
                        throw new Error(`UNKNOWN_LOCATION_ID_${id}`);
                    }
                });
                propIds.forEach((id) => {
                    if (!allowedProps.has(id)) {
                        throw new Error(`UNKNOWN_PROP_ID_${id}`);
                    }
                });
                return {
                    episode: index + 1,
                    title: item.title || `Episode ${index + 1}`,
                    logline: item.logline || "",
                    objective: item.objective || "",
                    characterIds,
                    locationIds,
                    propIds,
                    openingState: item.openingState || "",
                    endingState: item.endingState || "",
                    cliffhanger: item.cliffhanger || "",
                    continuityNotes: item.continuityNotes || [],
                    locked: true,
                };
            });
            setEpisodes(normalized);
            setSelectedEpisode(1);
            setScripts({});
            setShots([]);
            setStage("episodes");
        }
        catch (err) {
            handleError(err);
        }
        finally {
            setBusy(false);
            setProgress("");
        }
    };
    // ======================================================
    // SCRIPT + AUTOMATIC CONTINUITY / PRESENCE BRIDGE
    // ======================================================
    const reconcileScriptContinuity = async (sourceScripts) => {
        // ------------------------------------------------------
        // LOCAL DETERMINISTIC CONTINUITY BRIDGE
        // ------------------------------------------------------
        // No Gemini/API call is made here. The goal is to preserve the
        // physical facts already implied by the generated script and dialogue:
        // persistent cast, eating/sitting states, visible deictic targets,
        // and minimal motion. This makes the shared Canvas build less dependent
        // on transient AI credentials after the Script stage.

        const ordered = episodes.flatMap((episode) =>
            (sourceScripts[episode.episode] || []).map((scene) => ({
                ...scene,
                episodeManifest: episode,
            }))
        );

        if (!ordered.length)
            return sourceScripts;

        const lower = (value) => toText(value).toLowerCase();
        const dialogueText = (scene) => lower((scene.dialogue || []).map((line) => line.text).join(" "));
        const speakerIds = (scene) => normalizeIdList((scene.dialogue || []).map((line) => line.characterId));

        const hasVisibleReference = (value) => /\b(lihat|lihatlah|itu|dia|orang itu|orang tersebut|gembel|pengemis|miskin|di sana|disana|look at|that man|that woman|that person|over there|him|her)\b/i.test(value);
        const mentionsEating = (value) => /\b(makan|sedang makan|makanan|eat|eating|meal|food)\b/i.test(value);
        const mentionsDrinking = (value) => /\b(minum|drink|drinking)\b/i.test(value);
        const mentionsSitting = (value) => /\b(duduk|seated|sitting|sits)\b/i.test(value);
        const mentionsStanding = (value) => /\b(berdiri|standing|stands)\b/i.test(value);
        const explicitDeparture = (value) => /\b(pergi|meninggalkan|keluar|walks away|leaves|exits|depart|departure)\b/i.test(value);

        const describeState = (scene, characterId) => {
            const text = `${lower(scene.action)} ${lower(scene.continuitySetup)}`;
            const character = characterMap.get(characterId);
            const name = character?.name || characterId;
            const states = [];
            if (mentionsEating(text))
                states.push(`${name} remains seated/eating as previously established`);
            else if (mentionsDrinking(text))
                states.push(`${name} remains drinking as previously established`);
            else if (mentionsSitting(text))
                states.push(`${name} remains seated as previously established`);
            else if (mentionsStanding(text))
                states.push(`${name} remains standing as previously established`);
            return states.join("; ");
        };

        const descriptorScore = (dialogue, character) => {
            if (!character)
                return 0;
            const haystack = lower([
                character.name,
                character.role,
                character.description,
                character.identity?.gender,
                character.costume?.outfit,
            ].filter(Boolean).join(" "));
            let score = 0;
            if (character.name && dialogue.includes(lower(character.name)))
                score += 12;
            if (/gembel|pengemis|miskin|poor|beggar/.test(dialogue) && /poor|miskin|undercover|disheveled|faded|worn|distressed/.test(haystack))
                score += 8;
            if (/cewek|wanita|perempuan|woman|girl/.test(dialogue) && /female|woman|perempuan/.test(haystack))
                score += 5;
            if (/cowok|pria|laki|lelaki|man|guy/.test(dialogue) && /male|man|laki/.test(haystack))
                score += 5;
            return score;
        };

        const resolveVisibleTarget = (scene, previousScene) => {
            const text = dialogueText(scene);
            if (!hasVisibleReference(text))
                return null;

            const speakers = new Set(speakerIds(scene));
            const sameLocation = previousScene && previousScene.locationId === scene.locationId;
            const priorCandidates = sameLocation
                ? normalizeIdList(previousScene.characterIds).filter((id) => !speakers.has(id))
                : [];
            const currentCandidates = normalizeIdList(scene.characterIds).filter((id) => !speakers.has(id));
            const candidates = mergeIdLists(priorCandidates, currentCandidates);
            if (!candidates.length)
                return null;
            if (candidates.length === 1)
                return candidates[0];

            const ranked = candidates
                .map((id) => ({ id, score: descriptorScore(text, characterMap.get(id)) + (priorCandidates.includes(id) ? 2 : 0) }))
                .sort((a, b) => b.score - a.score);
            return ranked[0]?.score > 0 ? ranked[0].id : priorCandidates[0] || candidates[0];
        };

        // Work on mutable clones in chronological order so a future dialogue can
        // minimally back-patch the immediately preceding compatible scene.
        const scenes = ordered.map((scene) => ({
            ...scene,
            characterIds: normalizeIdList(scene.characterIds),
            requiredVisibleCharacterIds: normalizeIdList(scene.requiredVisibleCharacterIds),
            carryOverCharacterIds: normalizeIdList(scene.carryOverCharacterIds),
            referencedVisibleTargets: normalizeVisibleTargets(scene.referencedVisibleTargets),
            incidentalSetDressing: uniqueStrings(scene.incidentalSetDressing || []),
            continuityNotes: uniqueStrings(scene.continuityNotes || []),
            continuitySetup: toText(scene.continuitySetup),
            continuityRevisionReason: toText(scene.continuityRevisionReason),
            continuityRevised: Boolean(scene.continuityRevised),
        }));

        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            const previous = i > 0 ? scenes[i - 1] : null;
            const manifest = scene.episodeManifest;
            const allowedCharacters = new Set(manifest?.characterIds || []);
            const text = dialogueText(scene);

            // Always preserve pre-existing referenced targets.
            const existingReferencedIds = scene.referencedVisibleTargets.map((item) => item.characterId);
            scene.requiredVisibleCharacterIds = mergeIdLists(scene.requiredVisibleCharacterIds, existingReferencedIds);

            const targetId = resolveVisibleTarget(scene, previous);
            if (targetId) {
                if (!allowedCharacters.has(targetId)) {
                    throw new Error(`CONTINUITY_BLOCKED_TARGET_OUTSIDE_EPISODE_MANIFEST_${scene.id}_${targetId}`);
                }

                const evidence = (scene.dialogue || []).map((line) => line.text).join(" ");
                scene.referencedVisibleTargets = normalizeVisibleTargets([
                    ...scene.referencedVisibleTargets,
                    { characterId: targetId, evidence: evidence || "Visible deictic reference in dialogue" },
                ]);
                scene.requiredVisibleCharacterIds = mergeIdLists(scene.requiredVisibleCharacterIds, [targetId]);
                scene.characterIds = mergeIdLists(scene.characterIds, [targetId]);

                if (previous && previous.locationId === scene.locationId && previous.characterIds.includes(targetId) && !explicitDeparture(previous.action)) {
                    scene.carryOverCharacterIds = mergeIdLists(scene.carryOverCharacterIds, [targetId]);
                    const state = describeState(previous, targetId);
                    if (state) {
                        scene.continuitySetup = uniqueStrings([scene.continuitySetup, state]).join("; ");
                    }
                }

                scene.continuityNotes = uniqueStrings([
                    ...scene.continuityNotes,
                    `${targetId} is explicitly referenced/pointed out by dialogue and must remain visible in the same shot coverage.`,
                ]);
                scene.continuityRevised = true;
                scene.continuityRevisionReason = uniqueStrings([
                    scene.continuityRevisionReason,
                    `Resolved visible dialogue target to ${targetId} and locked its presence.`,
                ]).join(" ");
            }

            // Backward repair: if this scene/dialogue says the visible target is eating,
            // establish eating in the immediately preceding same-location scene.
            if (targetId && mentionsEating(text) && previous && previous.locationId === scene.locationId && previous.characterIds.includes(targetId)) {
                const previousText = `${lower(previous.action)} ${lower(previous.continuitySetup)}`;
                if (!mentionsEating(previousText)) {
                    const targetName = characterMap.get(targetId)?.name || targetId;
                    previous.action = `${toText(previous.action)} ${targetName} is already seated and quietly eating a simple inexpensive warung meal from a plate with a spoon.`.trim();
                    previous.continuitySetup = uniqueStrings([
                        previous.continuitySetup,
                        `${targetName} is already seated and eating before the next scene begins`,
                    ]).join("; ");
                    previous.incidentalSetDressing = uniqueStrings([
                        ...previous.incidentalSetDressing,
                        "simple plate of inexpensive food",
                        "ordinary metal spoon",
                        "simple drinking glass",
                    ]);
                    previous.continuityNotes = uniqueStrings([
                        ...previous.continuityNotes,
                        `${targetId} eating state is established here because the following scene/dialogue depends on it.`,
                    ]);
                    previous.continuityRevised = true;
                    previous.continuityRevisionReason = uniqueStrings([
                        previous.continuityRevisionReason,
                        `Back-patched eating state for ${targetId} to support later dialogue continuity.`,
                    ]).join(" ");

                    scene.continuitySetup = uniqueStrings([
                        scene.continuitySetup,
                        `${targetName} remains seated and eating from the previous scene`,
                    ]).join("; ");
                    scene.incidentalSetDressing = uniqueStrings([
                        ...scene.incidentalSetDressing,
                        "simple plate of inexpensive food",
                        "ordinary metal spoon",
                        "simple drinking glass",
                    ]);
                }
            }

            // Same-location physical continuity: a specifically required target that
            // was present in the previous scene carries over unless it explicitly left.
            if (previous && previous.locationId === scene.locationId) {
                const previousPresent = normalizeIdList(previous.characterIds);
                const currentlyRequired = mergeIdLists(
                    scene.requiredVisibleCharacterIds,
                    scene.referencedVisibleTargets.map((item) => item.characterId)
                );
                const validCarry = currentlyRequired.filter((id) => previousPresent.includes(id) && !explicitDeparture(previous.action));
                scene.carryOverCharacterIds = mergeIdLists(scene.carryOverCharacterIds, validCarry);
            }

            scene.characterIds = mergeIdLists(
                scene.characterIds,
                scene.requiredVisibleCharacterIds,
                scene.carryOverCharacterIds,
                speakerIds(scene)
            );

            scene.characterIds.forEach((id) => {
                if (!allowedCharacters.has(id)) {
                    throw new Error(`CONTINUITY_CHARACTER_OUTSIDE_EPISODE_MANIFEST_${scene.id}_${id}`);
                }
            });

            // Motion is determined ONLY from source action. Dialogue never grants
            // permission to walk around.
            scene.movementPolicy = actionRequiresLocomotion(scene.action) ? "LOCOMOTION" : "STATIC";
        }

        const nextScripts = {};
        for (const scene of scenes) {
            const { episodeManifest, ...cleanScene } = scene;
            if (!nextScripts[scene.episode])
                nextScripts[scene.episode] = [];
            nextScripts[scene.episode].push(cleanScene);
        }

        return nextScripts;
    };

    const rerunContinuityBridge = async () => {
        if (!Object.keys(scripts).length)
            return;
        setBusy(true);
        setError("");
        try {
            setProgress("Continuity Bridge: scanning future dependencies, visible references, and persistent cast...");
            const reconciled = await reconcileScriptContinuity(scripts);
            setScripts(reconciled);
            setShots([]);
            setProgress("Continuity Bridge complete. Required visible targets are locked; regenerate Shot Manifest.");
            window.setTimeout(() => setProgress(""), 2400);
        }
        catch (err) {
            handleError(err);
            setProgress("");
        }
        finally {
            setBusy(false);
        }
    };

    const generateAllScripts = async () => {
        setBusy(true);
        setError("");
        const output = {};
        try {
            for (const episode of episodes) {
                setProgress(`Script Episode ${episode.episode}/${episodes.length}`);
                const previousEpisode = episodes.find((item) => item.episode === episode.episode - 1);
                const allowedCharacterData = episode.characterIds.map((id) => {
                    const character = characterMap.get(id);
                    return {
                        id,
                        name: character?.name,
                        role: character?.role,
                        description: character?.description,
                        identity: character?.identity,
                        costume: character?.costume,
                    };
                });
                const result = await callJSON(`
ROLE:
You are a continuity-controlled microdrama screenplay producer.

YOU ARE NOT A FREE CREATIVE WRITER.

SERIES:
${project.title}

ORIGINAL PREMISE:
${project.premise}

LOCKED STORY GUARDRAILS:
${project.storyRules}

PREVIOUS EPISODE END STATE:
${previousEpisode?.endingState || "Series opening"}

LOCKED EPISODE MANIFEST:
${JSON.stringify(episode, null, 2)}

ALLOWED CHARACTER RECORDS:
${JSON.stringify(allowedCharacterData, null, 2)}

LANGUAGE:
${project.language}

TARGET EPISODE LENGTH:
${project.episodeDuration} seconds

HARD STORY + PHYSICAL CONTINUITY RULES:
- only manifest character IDs
- only manifest location IDs
- only manifest prop IDs
- no new named character
- no extras unless explicitly in manifest
- no new location
- no new important prop
- do not change identity or default costume
- do not reveal information before the character learns it
- do not reset previous continuity
- do not solve later episode conflicts
- concise microdrama dialogue
- actions must be physically filmable
- make physical state explicit when story-relevant: seated/standing, eating/not eating, holding/not holding, object open/closed
- if a later line will visibly depend on an ongoing state, establish that state in an earlier compatible scene whenever possible
- a character already physically present in the same location must not silently vanish from continuity if another character is visibly referring to, watching, insulting, or reacting to them
- dialogue containing phrases such as "lihat", "itu", "dia", "orang itu", "gembel itu", "di sana" or equivalent must include the referenced approved person in characterIds when that person is meant to be physically visible
- list those continuity-critical people under requiredVisibleCharacterIds
- STATIC staging is the default for dialogue/reaction/eating/listening scenes
- do not invent walking, entering, exiting, approaching, crossing, pacing or repositioning merely for cinematic interest
- only use locomotion when the story beat truly requires arrival, departure, chase, traversal or another explicit position change
- when locomotion is not story-essential, place characters at their required positions before the scene begins
- total scene duration should approximately reach the episode target

RETURN:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "locationId": "",
      "characterIds": [],
      "propIds": [],
      "storyPurpose": "",
      "action": "",
      "dialogue": [
        {
          "characterId": "",
          "text": ""
        }
      ],
      "continuityNotes": [],
      "continuitySetup": "",
      "incidentalSetDressing": [],
      "requiredVisibleCharacterIds": [],
      "carryOverCharacterIds": [],
      "referencedVisibleTargets": [],
      "estimatedDuration": 16
    }
  ]
}
`, [], 0.08);
                const allowedCharacters = new Set(episode.characterIds);
                const allowedLocations = new Set(episode.locationIds);
                const allowedProps = new Set(episode.propIds);
                const normalized = (result.scenes || []).map((scene, index) => {
                    const dialogue = (scene.dialogue || []).map((line) => {
                        if (!allowedCharacters.has(line.characterId)) {
                            throw new Error(`DIALOGUE_CHARACTER_OUTSIDE_MANIFEST_${line.characterId}`);
                        }
                        return {
                            characterId: line.characterId,
                            text: line.text || "",
                        };
                    });
                    const referencedTargets = normalizeVisibleTargets(scene.referencedVisibleTargets);
                    const referencedIds = referencedTargets.map((item) => item.characterId);
                    const requiredVisibleCharacterIds = mergeIdLists(scene.requiredVisibleCharacterIds, referencedIds);
                    const carryOverCharacterIds = normalizeIdList(scene.carryOverCharacterIds);
                    const characterIds = mergeIdLists(
                        scene.characterIds,
                        requiredVisibleCharacterIds,
                        carryOverCharacterIds,
                        dialogue.map((line) => line.characterId)
                    );
                    const propIds = normalizeIdList(scene.propIds);

                    characterIds.forEach((id) => {
                        if (!allowedCharacters.has(id)) {
                            throw new Error(`SCRIPT_CHARACTER_OUTSIDE_MANIFEST_${id}`);
                        }
                    });
                    requiredVisibleCharacterIds.forEach((id) => {
                        if (!allowedCharacters.has(id)) {
                            throw new Error(`SCRIPT_REQUIRED_VISIBLE_CHARACTER_OUTSIDE_MANIFEST_${id}`);
                        }
                    });
                    carryOverCharacterIds.forEach((id) => {
                        if (!allowedCharacters.has(id)) {
                            throw new Error(`SCRIPT_CARRYOVER_CHARACTER_OUTSIDE_MANIFEST_${id}`);
                        }
                    });
                    if (!allowedLocations.has(scene.locationId)) {
                        throw new Error(`SCRIPT_LOCATION_OUTSIDE_MANIFEST_${scene.locationId}`);
                    }
                    propIds.forEach((id) => {
                        if (!allowedProps.has(id)) {
                            throw new Error(`SCRIPT_PROP_OUTSIDE_MANIFEST_${id}`);
                        }
                    });

                    return {
                        id: `EP${pad(episode.episode)}_SC${pad(index + 1)}`,
                        episode: episode.episode,
                        sceneNumber: index + 1,
                        locationId: scene.locationId,
                        characterIds,
                        propIds,
                        storyPurpose: scene.storyPurpose || "",
                        action: scene.action || "",
                        dialogue,
                        continuityNotes: scene.continuityNotes || [],
                        continuitySetup: toText(scene.continuitySetup),
                        incidentalSetDressing: uniqueStrings(scene.incidentalSetDressing || []).slice(0, 10),
                        requiredVisibleCharacterIds,
                        carryOverCharacterIds,
                        referencedVisibleTargets: referencedTargets,
                        continuityRevisionReason: "",
                        continuityRevised: false,
                        movementPolicy: actionRequiresLocomotion(scene.action || "") ? "LOCOMOTION" : "STATIC",
                        estimatedDuration: Number(scene.estimatedDuration || 16),
                    };
                });
                output[episode.episode] = normalized;
                setScripts({ ...output });
            }
            setScripts(output);
            setProgress("Continuity Bridge: repairing future-dependent states and missing visible targets...");
            const reconciled = await reconcileScriptContinuity(output);
            setScripts(reconciled);
            setStage("scripts");
        }
        catch (err) {
            handleError(err);
        }
        finally {
            setBusy(false);
            setProgress("");
        }
    };
    // ======================================================
    // SHOT PLANNER — LOCAL / DETERMINISTIC
    // ======================================================
    // IMPORTANT:
    // This stage intentionally DOES NOT call Gemini.
    // It converts the already-approved script into 8-second shot manifests locally.
    // This avoids Canvas/API authentication failures and prevents the shot planner
    // from creatively dropping persistent characters or inventing locomotion.

    const wordsInDialogue = (value) => toText(value).split(/\s+/).filter(Boolean).length;

    const pickListenerId = (scene, speakerId, protectedIds = []) => {
        const protectedSet = new Set(protectedIds);
        return (scene.characterIds || []).find((id) => id !== speakerId && !protectedSet.has(id)) ||
            (scene.characterIds || []).find((id) => id !== speakerId) ||
            null;
    };

    const inferEmotionFromContext = (dialogueTextValue = "", roleValue = "", actionValue = "") => {
        const raw = `${toText(dialogueTextValue)} ${toText(roleValue)} ${toText(actionValue)}`.toLowerCase();
        if (/(cih|gembel|rendah|hina|merusak pemandangan|jijik|memalukan|dasar|sampah|murahan)/.test(raw))
            return "sinis, merendahkan, jijik tertahan";
        if (/(haha|wkwk|tertawa|mengejek|mock|ejek)/.test(raw))
            return "tertawa mengejek ringan atau senyum sinis";
        if (/(marah|berani|kurang ajar|diam|benci|kesal|emosi)/.test(raw))
            return "marah tertahan, kesal, tegas";
        if (/(tolong|jangan|mohon|maaf|ampun|please)/.test(raw))
            return "cemas, memohon, tertekan";
        if (/(terima kasih|syukur|alhamdulillah|lega)/.test(raw))
            return "lega, tulus, hangat";
        if (/(siapa|kenapa|apa maksud|apa\?|mengapa)/.test(raw))
            return "curiga, mempertanyakan, waspada";
        if (/(sedih|kecewa|menahan air mata|terluka)/.test(raw))
            return "sedih tertahan, terluka, menahan emosi";
        if (/(compassionate|lembut|baik hati|supportive|empat)/.test(raw))
            return "empatik, tenang, lembut";
        if (/(arrogant|antagonist|sombong|angkuh)/.test(raw))
            return "angkuh, sinis, merendahkan";
        if (/(undercover ceo|protagonist|observant|serious)/.test(raw))
            return "tenang, tertahan, observatif";
        return "netral-terarah, sesuai konteks, realistis, tertahan";
    };

    const inferListenerReaction = (character, shot, speakerId, lineText = "") => {
        const name = character?.name || speakerId;
        const role = toText(character?.role).toLowerCase();
        const raw = `${toText(lineText)} ${role} ${toText(shot?.action)} ${toText(shot?.continuitySetup)}`.toLowerCase();
        const isReferencedTarget = (shot.referencedVisibleTargetIds || []).includes(character?.id || "");
        if (isReferencedTarget && /(hina|gembel|rendah|jijik|merusak pemandangan|murahan|sampah|cih)/.test(raw))
            return `${name} shows subtle hurt, quiet humiliation, or restrained discomfort without overacting.`;
        if (/(compassionate|lembut|baik hati|supportive|empat)/.test(role))
            return `${name} reacts with subtle empathy, concern, or discomfort.`;
        if (/(arrogant|antagonist|sombong|angkuh)/.test(role))
            return `${name} reacts with a restrained smug or judgmental listening expression.`;
        if (/(undercover ceo|protagonist|observant|serious)/.test(role))
            return `${name} reacts with restrained composure, alertness, or controlled tension.`;
        return `${name} reacts only with a subtle listening expression that fits the scene context.`;
    };

    const buildExpressionContinuationPlan = (shot) => {
        if (!shot?.dialogue?.length)
            return "NO POST-DIALOGUE EXPRESSION PLAN — no spoken dialogue in this shot.";
        return shot.dialogue.map((line, index) => {
            const speaker = characterMap.get(line.characterId);
            const emotion = inferEmotionFromContext(line.text, speaker?.role, shot.action);
            const listenerLines = shot.characterIds
                .filter((id) => id !== line.characterId)
                .map((id) => {
                    const character = characterMap.get(id);
                    return `- ${id} (${character?.name || id}): ${inferListenerReaction(character, shot, line.characterId, line.text)}`;
                })
                .join("\n") || "- NONE";
            return [
                `LINE_${index + 1}`,
                `SPEAKER_ID: ${line.characterId}`,
                `SPEAKER_NAME: ${speaker?.name || line.characterId}`,
                `PRIMARY_EMOTION: ${emotion}`,
                `POST_LINE_EXPRESSION_RULES:`,
                `- While speaking, ${line.characterId} expresses ${emotion} in a restrained, realistic way.`,
                `- After finishing the line, ${line.characterId} must HOLD a residual version of that same emotion for a brief natural beat.`,
                `- Do not let ${line.characterId} instantly reset to a blank face or unrelated neutral expression the moment speech ends.`,
                `- After the hold beat, ${line.characterId} may settle only into a compatible listening/resting expression, not a contradictory emotion.`,
                `LISTENER_REACTIONS:`,
                listenerLines,
            ].join("\n");
        }).join("\n\n");
    };

    const makeShotQA = () => ({
        checked: false,
        pass: false,
        humanCount: 0,
        identityPass: false,
        locationPass: false,
        verticalPass: false,
        singleFramePass: false,
        allCharactersVisible: false,
        framingPass: false,
        spatialSafetyPass: false,
        referencedTargetVisiblePass: false,
        continuityPresencePass: false,
        positionContinuityPass: false,
        stateContinuityPass: false,
        imageWidth: 0,
        imageHeight: 0,
        issues: [],
    });

    const inferDeterministicCamera = (humanCount, movementMode) => {
        if (movementMode === "LOCOMOTION") {
            if (humanCount >= 3)
                return "Static wide vertical three-person establishing shot; camera does not track; clear walkable path visible";
            if (humanCount === 2)
                return "Static medium-wide vertical two-shot; camera does not track; clear walkable path visible";
            return "Static medium-wide vertical shot; camera does not track; clear walkable path visible";
        }
        if (humanCount >= 3)
            return "Static medium-wide vertical three-shot, eye level, all three characters fully readable in one frame";
        if (humanCount === 2)
            return "Static medium vertical two-shot, eye level, both characters remain fully visible in one frame";
        if (humanCount === 1)
            return "Static medium vertical shot, eye level, character comfortably inside frame";
        return "Static vertical establishing shot";
    };

    const buildLocalShot = ({
        episode,
        scene,
        shotNumber,
        action,
        dialogue = [],
        movementMode = "STATIC",
        movingCharacterIds = [],
        explicitCharacterIds = [],
        referencedVisibleTargetIds = [],
        extraNotes = [],
    }) => {
        const dialogueSpeakerIds = normalizeIdList(dialogue.map((line) => line.characterId));
        const sceneReferencedIds = normalizeVisibleTargets(scene.referencedVisibleTargets)
            .map((target) => target.characterId);

        const referencedIds = mergeIdLists(
            referencedVisibleTargetIds,
            dialogue.length ? sceneReferencedIds : []
        );

        // Characters marked required/carry-over are physical continuity facts.
        // They may not magically disappear merely because another character speaks.
        const mustRemainVisibleIds = mergeIdLists(
            scene.requiredVisibleCharacterIds,
            scene.carryOverCharacterIds,
            referencedIds
        );

        let characterIds = mergeIdLists(
            explicitCharacterIds,
            dialogueSpeakerIds,
            mustRemainVisibleIds
        );

        // For dialogue shots, include one listener when room remains.
        // This is deterministic and does not invent a new character.
        if (dialogueSpeakerIds.length && characterIds.length < 3) {
            const listenerId = pickListenerId(scene, dialogueSpeakerIds[0], characterIds);
            if (listenerId)
                characterIds = mergeIdLists(characterIds, [listenerId]);
        }

        // For a non-dialogue action/setup shot, use the scene cast up to the hard limit.
        if (!dialogue.length && characterIds.length === 0) {
            characterIds = normalizeIdList(scene.characterIds).slice(0, 3);
        }

        characterIds.forEach((id) => {
            if (!(scene.characterIds || []).includes(id)) {
                throw new Error(`LOCAL_SHOT_CHARACTER_OUTSIDE_SCENE_${scene.id}_${id}`);
            }
        });

        mustRemainVisibleIds.forEach((id) => {
            if (!(scene.characterIds || []).includes(id)) {
                throw new Error(`LOCAL_SHOT_REQUIRED_VISIBLE_OUTSIDE_SCENE_${scene.id}_${id}`);
            }
        });

        if (mustRemainVisibleIds.length > 3) {
            throw new Error(`CONTINUITY_BLOCKED_MAX_3_REQUIRED_VISIBLE_${scene.id}: ${mustRemainVisibleIds.join(",")}`);
        }

        if (characterIds.length > 3) {
            // Never discard required targets. Drop only optional coverage cast.
            const protectedIds = new Set(mergeIdLists(mustRemainVisibleIds, dialogueSpeakerIds));
            const protectedList = characterIds.filter((id) => protectedIds.has(id));
            const optionalList = characterIds.filter((id) => !protectedIds.has(id));
            characterIds = [...protectedList, ...optionalList].slice(0, 3);
        }

        const missingProtected = mergeIdLists(mustRemainVisibleIds, dialogueSpeakerIds)
            .filter((id) => !characterIds.includes(id));
        if (missingProtected.length) {
            throw new Error(`CONTINUITY_BLOCKED_PROTECTED_CHARACTER_MISSING_${scene.id}: ${missingProtected.join(",")}`);
        }

        const sourceAllowsLocomotion = scene.movementPolicy === "LOCOMOTION" && actionRequiresLocomotion(scene.action);
        const finalMovementMode = movementMode === "LOCOMOTION" && sourceAllowsLocomotion
            ? "LOCOMOTION"
            : "STATIC";

        const finalMovingIds = finalMovementMode === "LOCOMOTION"
            ? normalizeIdList(movingCharacterIds).filter((id) => characterIds.includes(id))
            : [];

        const stationaryIds = characterIds.filter((id) => !finalMovingIds.includes(id));
        const motionNote = finalMovementMode === "STATIC"
            ? "MOTION_LOCK: all listed characters are already at their Scene Anchor coordinates before frame 1; no walking, entering, exiting, approaching, crossing, pacing, stepping or repositioning."
            : `MOTION_SAFETY: only ${finalMovingIds.join(", ") || "explicitly moving cast"} may locomote. ${stationaryIds.join(", ") || "All other cast"} stay spatially anchored. Movement uses only a visibly clear path; no clipping or passing through furniture, walls, people or props.`;
        const presenceNote = mustRemainVisibleIds.length
            ? `PRESENCE_LOCK: ${mustRemainVisibleIds.join(", ")} must remain visible and physically present for this entire shot; no disappearance, off-screen removal or re-entry.`
            : "";
        const referenceNote = referencedIds.length
            ? `REFERENCED_TARGET_LOCK: ${referencedIds.join(", ")} are referenced by dialogue/context and must be visually readable in the same shot.`
            : "";
        const stateNote = toText(scene.continuitySetup)
            ? `STATE_LOCK: ${toText(scene.continuitySetup)}`
            : "";

        return {
            id: `EP${pad(episode.episode)}_SH${pad(shotNumber)}`,
            episode: episode.episode,
            sceneId: scene.id,
            shotNumber,
            characterIds,
            locationId: scene.locationId,
            propIds: normalizeIdList(scene.propIds),
            expectedHumanCount: characterIds.length,
            camera: inferDeterministicCamera(characterIds.length, finalMovementMode),
            action: toText(action),
            dialogue: dialogue.map((line) => ({
                characterId: line.characterId,
                text: toText(line.text),
            })),
            continuitySetup: scene.continuitySetup || "",
            incidentalSetDressing: scene.incidentalSetDressing || [],
            carryOverCharacterIds: normalizeIdList(scene.carryOverCharacterIds),
            mustRemainVisibleIds,
            referencedVisibleTargetIds: referencedIds,
            movingCharacterIds: finalMovingIds,
            movementMode: finalMovementMode,
            continuityNotes: uniqueStrings([
                ...(scene.continuityNotes || []),
                ...extraNotes,
                motionNote,
                presenceNote,
                referenceNote,
                stateNote,
            ]),
            durationSeconds: 8,
            videoPrompt: "",
            anchorImage: null,
            anchorStatus: "idle",
            qa: makeShotQA(),
            videoStatus: "idle",
            videoUrl: null,
            videoRemoteUri: null,
            operationName: null,
        };
    };

    const generateAllShots = async () => {
        setBusy(true);
        setError("");
        setProgress("Building Shot Manifest locally — no Gemini request...");

        try {
            const output = [];

            for (const episode of episodes) {
                const episodeScenes = scripts[episode.episode];
                if (!episodeScenes?.length) {
                    throw new Error(`SCRIPT_MISSING_EP_${episode.episode}`);
                }

                let episodeShotNumber = 1;

                for (const scene of episodeScenes) {
                    const sceneCast = normalizeIdList(scene.characterIds);
                    const requiredIds = mergeIdLists(
                        scene.requiredVisibleCharacterIds,
                        scene.carryOverCharacterIds,
                        normalizeVisibleTargets(scene.referencedVisibleTargets).map((target) => target.characterId)
                    );

                    requiredIds.forEach((id) => {
                        if (!sceneCast.includes(id)) {
                            throw new Error(`CONTINUITY_REQUIRED_CHARACTER_NOT_IN_SCENE_${scene.id}_${id}`);
                        }
                    });

                    if (requiredIds.length > 3) {
                        throw new Error(`CONTINUITY_BLOCKED_MAX_3_VISIBLE_CHARACTERS_${scene.id}: required=${requiredIds.join(",")}`);
                    }

                    const hasLocomotion = scene.movementPolicy === "LOCOMOTION" && actionRequiresLocomotion(scene.action);
                    const dialogue = Array.isArray(scene.dialogue) ? scene.dialogue : [];

                    // --------------------------------------------------
                    // STEP 1 — Explicit locomotion happens once.
                    // --------------------------------------------------
                    // Example:
                    // Aditya is already eating at the warung (carry-over).
                    // Maya + Rendy arrive.
                    // Only Maya + Rendy move; Aditya remains seated/eating.
                    // The following dialogue shot is STATIC so the model cannot
                    // keep walking characters around while they speak.
                    if (hasLocomotion) {
                        const carryOverSet = new Set(normalizeIdList(scene.carryOverCharacterIds));
                        const movingIds = sceneCast.filter((id) => !carryOverSet.has(id));
                        const locomotionCast = mergeIdLists(requiredIds, movingIds).slice(0, 3);

                        output.push(buildLocalShot({
                            episode,
                            scene,
                            shotNumber: episodeShotNumber++,
                            action: scene.action,
                            dialogue: [],
                            movementMode: "LOCOMOTION",
                            movingCharacterIds: movingIds,
                            explicitCharacterIds: locomotionCast,
                            referencedVisibleTargetIds: [],
                            extraNotes: [
                                "ARRIVAL_ONLY_SHOT: execute the necessary arrival/position change once. Do not speak dialogue in this locomotion shot.",
                                "After arrival completes, all characters use the resulting positions as the locked starting state of the next shot.",
                            ],
                        }));
                    }

                    // --------------------------------------------------
                    // STEP 2 — Dialogue is always static by default.
                    // --------------------------------------------------
                    if (dialogue.length) {
                        for (let d = 0; d < dialogue.length; d++) {
                            const line = dialogue[d];
                            const referencedIds = normalizeVisibleTargets(scene.referencedVisibleTargets)
                                .map((target) => target.characterId);

                            const explicitCast = mergeIdLists(
                                requiredIds,
                                [line.characterId],
                                referencedIds
                            );

                            // Do not repeat locomotion text in dialogue coverage.
                            // State what is already true instead of saying "enter" again.
                            const staticAction = toText(scene.continuitySetup) ||
                                (hasLocomotion
                                    ? "All listed characters are already in their established positions. Preserve the current physical state while the dialogue is delivered."
                                    : scene.action);

                            const tooLong = wordsInDialogue(line.text) > 24;
                            const durationNote = tooLong
                                ? "DIALOGUE_TIMING_WARNING: this exact line is long for 8 seconds. Preserve wording exactly; do not accelerate body movement to compensate."
                                : "";

                            output.push(buildLocalShot({
                                episode,
                                scene,
                                shotNumber: episodeShotNumber++,
                                action: staticAction,
                                dialogue: [line],
                                movementMode: "STATIC",
                                movingCharacterIds: [],
                                explicitCharacterIds: explicitCast,
                                referencedVisibleTargetIds: referencedIds,
                                extraNotes: [
                                    "DIALOGUE_STATIC_LOCK: speaking does not grant permission to walk, enter, exit, approach or reposition.",
                                    durationNote,
                                ],
                            }));
                        }
                    }

                    // --------------------------------------------------
                    // STEP 3 — Pure action/state scene with no dialogue.
                    // --------------------------------------------------
                    if (!dialogue.length && !hasLocomotion) {
                        output.push(buildLocalShot({
                            episode,
                            scene,
                            shotNumber: episodeShotNumber++,
                            action: scene.action,
                            dialogue: [],
                            movementMode: "STATIC",
                            movingCharacterIds: [],
                            explicitCharacterIds: mergeIdLists(requiredIds, sceneCast).slice(0, 3),
                            referencedVisibleTargetIds: normalizeVisibleTargets(scene.referencedVisibleTargets)
                                .map((target) => target.characterId),
                            extraNotes: [
                                "STATIC_ACTION_LOCK: execute only the local action explicitly written in the script; no invented locomotion.",
                            ],
                        }));
                    }
                }
            }

            setShots(output);
            setSelectedShotId(output[0]?.id || null);
            setStage("shots");
            setProgress(`Built ${output.length} shot(s) locally. No Gemini/API request used for Shot Manifest.`);
            window.setTimeout(() => setProgress(""), 2200);
        }
        catch (err) {
            handleError(err);
            setProgress("");
        }
        finally {
            setBusy(false);
        }
    };
    // ======================================================
    // MASTER PROMPT COMPILER
    // ======================================================
    // IMPORTANT:
    // This stage is intentionally deterministic and DOES NOT call Gemini.
    // The goal is to avoid unnecessary Canvas auth calls and to prevent
    // the prompt compiler from creatively changing locked production data.
    const compileMasterPrompt = (shot) => {
        const cast = shot.characterIds.map((id) => {
            const character = characterMap.get(id);
            if (!character)
                throw new Error(`CHARACTER_NOT_FOUND_${id}`);
            return character;
        });
        const location = locationMap.get(shot.locationId);
        if (!location)
            throw new Error(`LOCATION_NOT_FOUND_${shot.locationId}`);
        const usedProps = shot.propIds.map((id) => {
            const prop = propMap.get(id);
            if (!prop)
                throw new Error(`PROP_NOT_FOUND_${id}`);
            return prop;
        });

        const uniqueIds = new Set(shot.characterIds);
        if (uniqueIds.size !== shot.characterIds.length)
            throw new Error(`DUPLICATE_CHARACTER_ID_${shot.id}`);
        if (shot.expectedHumanCount !== shot.characterIds.length)
            throw new Error(`HUMAN_COUNT_MISMATCH_${shot.id}`);
        if (shot.characterIds.length > 3)
            throw new Error(`MAX_3_CHARACTERS_PER_VIDEO_SHOT_${shot.id}`);

        const characterText = cast.length
            ? cast.map((character, index) => `
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
REFERENCE_RULE: This ID represents exactly ONE unique person. Preserve the same face, age, ethnicity, hairstyle, skin tone, body proportions, costume and accessories. Never duplicate or clone this person.
`.trim()).join("\n\n")
            : "NO HUMAN CHARACTER";

        const propText = usedProps.length
            ? usedProps.map((prop) => `
PROP_ID: ${prop.id}
NAME: ${prop.name}
DESCRIPTION: ${prop.description || ""}
APPEARANCE: ${prop.appearance || ""}
`.trim()).join("\n\n")
            : "NONE";

        const dialogueText = shot.dialogue?.length
            ? shot.dialogue.map((line) => {
                const speaker = characterMap.get(line.characterId);
                return `${line.characterId} (${speaker?.name || line.characterId}): "${toText(line.text)}"`;
            }).join("\n")
            : "NO SPOKEN DIALOGUE";

        const dialogueSpeakerIds = normalizeIdList((shot.dialogue || []).map((line) => line.characterId));
        const silentCharacterIds = shot.characterIds.filter((id) => !dialogueSpeakerIds.includes(id));
        const dialogueSpeakerLockText = shot.dialogue?.length
            ? shot.dialogue.map((line, index) => {
                const speaker = characterMap.get(line.characterId);
                const otherIds = shot.characterIds.filter((id) => id !== line.characterId);
                const otherNames = otherIds.map((id) => `${id} (${characterMap.get(id)?.name || id})`).join(", ") || "NONE";
                return `LINE_${index + 1}
SPEAKER_ID: ${line.characterId}
SPEAKER_NAME: ${speaker?.name || line.characterId}
EXACT_LINE: "${toText(line.text)}"
SPEECH_RULES:
- ONLY ${line.characterId} (${speaker?.name || line.characterId}) visibly speaks this line.
- Mouth articulation, lip-sync, jaw motion and vocal-performance acting for this line belong ONLY to ${line.characterId}.
- Non-speakers for this line: ${otherNames}.
- Non-speakers must NOT appear to say these words.
- Non-speakers may only react subtly with listening expressions, blinking, breathing, or minimal eye movement.`;
            }).join("\n\n")
            : "NO DIALOGUE SPEAKER LOCK — no spoken dialogue in this shot.";
        const silentCharacterText = silentCharacterIds.length
            ? silentCharacterIds.map((id) => `${id} (${characterMap.get(id)?.name || id})`).join(", ")
            : "NONE";
        const expressionContinuationPlanText = buildExpressionContinuationPlan(shot);

        const continuityText = shot.continuityNotes?.length
            ? shot.continuityNotes.map((item) => `- ${toText(item)}`).join("\n")
            : "- Maintain established continuity from previous approved shots.";
        const incidentalText = shot.incidentalSetDressing?.length
            ? shot.incidentalSetDressing.map((item) => `- ${toText(item)}`).join("\n")
            : "NONE";
        const mustRemainVisibleIds = mergeIdLists(shot.mustRemainVisibleIds, shot.referencedVisibleTargetIds);
        const visibleLockText = mustRemainVisibleIds.length
            ? mustRemainVisibleIds.map((id) => {
                const character = characterMap.get(id);
                return `- ${id} (${character?.name || id}) must remain visibly present and readable in the frame.`;
            }).join("\n")
            : "- No additional presence lock beyond the allowed cast.";
        const referencedTargetText = shot.referencedVisibleTargetIds?.length
            ? shot.referencedVisibleTargetIds.map((id) => {
                const character = characterMap.get(id);
                return `- ${id} (${character?.name || id}) is a dialogue/context referenced visible target and may NOT disappear, be fully hidden, or be moved off-screen.`;
            }).join("\n")
            : "- NONE";
        const movingCharacterText = shot.movingCharacterIds?.length
            ? shot.movingCharacterIds.map((id) => `${id} (${characterMap.get(id)?.name || id})`).join(", ")
            : "NONE";

        const motionConstraintText = shot.movementMode === "LOCOMOTION"
            ? `MOTION_MODE: EXPLICIT_LOCOMOTION\nMOVING_CHARACTER_IDS: ${movingCharacterText}\n- ONLY the listed MOVING_CHARACTER_IDS may change world position.\n- All other visible characters remain anchored at their Scene Anchor coordinates and continue their established activity/state.\n- Locomotion is permitted ONLY because the locked source action explicitly requires it.\n- Follow only a visibly clear, physically walkable floor path.\n- Never intersect, clip through, phase through, merge with, or pass through a table, chair, bench, wall, pillar, door panel, counter, vehicle, prop or another person.\n- Pass through a doorway only through its visibly open gap.\n- Keep feet attached to the floor/ground plane with natural steps; no foot sliding or teleporting.\n- Maintain realistic body clearance around furniture and people.\n- If the intended route is blocked, STOP before the obstacle rather than passing through it.\n- Do not invent additional walking beyond the exact action.\n- Persistent/required-visible characters that are not moving must stay visible and must not vanish while another character moves.`
            : `MOTION_MODE: STATIC_POSITION_LOCK\nMOVING_CHARACTER_IDS: NONE\n- Every character is already at the approved Scene Anchor position before frame 1.\n- Character screen/world positions are locked for the full shot.\n- NO walking. NO stepping. NO entering. NO exiting. NO approaching. NO crossing the frame. NO repositioning.\n- Do not make actors move merely because dialogue occurs.\n- Do not create automatic pacing, body travel or cinematic blocking.\n- Only local action explicitly required by ACTION is allowed, such as lip movement, blinking, chewing, eating with a spoon, a small hand action or subtle facial expression.\n- Local action must not change the actor's standing/seated location.\n- If a character is eating, the seated body position remains fixed while only the hand/spoon/mouth perform minimal natural eating motion.\n- The camera must not reinterpret STATIC_POSITION_LOCK as permission to make characters travel.`;

        return `
MICRODRAMA VIDEO GENERATION PROMPT

SHOT_ID: ${shot.id}
EPISODE: ${shot.episode}
SCENE_ID: ${shot.sceneId}
VIDEO_LENGTH: ${shot.durationSeconds || 8} seconds
ASPECT_RATIO: ${ANCHOR_ASPECT_RATIO} (VERTICAL PORTRAIT, LOCKED)

==================================================
IMMUTABLE HUMAN COUNT
==================================================
EXPECTED_HUMAN_COUNT: ${shot.expectedHumanCount}

Exactly ${shot.expectedHumanCount} visible human character(s) may appear in the entire shot.
Allowed Character IDs: ${shot.characterIds.join(", ") || "NONE"}.
Each listed Character ID appears exactly once.

FORBIDDEN:
- extra people
- background actors
- crowds
- passersby
- duplicate characters
- clones
- human reflections
- people visible through doors, mirrors, glass or windows unless explicitly listed in the Shot Manifest

==================================================
LOCKED CHARACTER REFERENCES
==================================================
${characterText}

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
- Preserve the approved location identity.
- Preserve permanent architecture and furniture arrangement.
- Do not redesign the set.
- Do not add a new room or important environmental object.

==================================================
LOCKED PROPS
==================================================
${propText}

PROP_RULES:
- Only listed props may have narrative importance.
- Do not introduce unlisted important props.
- Do not add an unlisted vehicle.
- Preserve the exact appearance, scale, material impression, and identity of every listed locked prop.
- Only the props listed above may receive deliberate camera emphasis, handling emphasis, or story-significant interaction.
- Do not silently swap one prop for another.
- Do not invent a substitute container, utensil, phone, bag, document, jewelry item, vehicle, or weapon.
- If ACTION does not explicitly require touching or moving a prop, leave that prop undisturbed.
- If a continuity state requires ordinary eating/drinking set dressing, keep it visually ordinary and subordinate to the locked story props.

==================================================
SHOT EXECUTION
==================================================
CAMERA: ${toText(shot.camera)}
ACTION: ${toText(shot.action)}

DIALOGUE:
${dialogueText}

==================================================
DIALOGUE SPEAKER / LIP-SYNC LOCK
==================================================
DIALOGUE_SPEAKER_IDS: ${dialogueSpeakerIds.join(", ") || "NONE"}
SILENT_CHARACTER_IDS: ${silentCharacterText}

${dialogueSpeakerLockText}

GLOBAL SPEECH PERFORMANCE RULES:
- Only the designated SPEAKER_ID for a given line may visibly speak that line.
- Preserve exact speaker attribution exactly as written.
- Do not transfer a line from one character to another.
- Do not make a silent/listening character mouth the words of another speaker.
- Do not make multiple characters say the same line simultaneously unless explicitly written.
- Non-speaking visible characters keep mouths closed except for natural breathing, chewing, or tiny reaction movements required by the action.
- Listening reactions must remain subtle and must never look like accidental lip-sync.

==================================================
FACIAL EXPRESSION / EMOTION LOCK
==================================================
- Facial expression must be driven only by the locked ACTION, the exact DIALOGUE content, and the role relationship already established in the script.
- Use restrained, believable, human micro-expressions rather than exaggerated melodrama.
- Do not invent a new emotional beat that is not supported by the script.
- Do not add smiling, laughing, crying, shock, panic, romance, flirtation, rage, or fear unless the locked action/dialogue clearly requires it.
- The speaking character may show only the expression appropriate to the spoken line.
- Silent/listening characters may react only with subtle listening expressions that match the scene context.
- If a character is humiliated, insulted, disgusted, tense, suspicious, sad, or angry, show that only at the intensity justified by the moment.
- Do not let facial expression escalate on its own for cinematic effect.
- Do not create expression changes that contradict the established continuity state.
- Keep eye-lines believable and attached to the correct conversation target.
- Preserve facial identity while expressing emotion; expression must not distort the face into a different person.
- Mouth shape while speaking must match the assigned speaker only.
- Mouth shape while not speaking must remain closed or only slightly parted for natural breathing or the approved ongoing action.
- If the shot is static or restrained, the expression performance must also remain restrained.
- If a character is eating, facial expression remains readable but natural; do not mix eating motion with exaggerated emotional acting.

==================================================
POST-DIALOGUE EXPRESSION CONTINUATION PLAN
==================================================
${expressionContinuationPlanText}

POST-DIALOGUE CONTINUATION RULES:
- When a speaker finishes a line, do NOT instantly drop to a blank, empty, or emotionally unrelated face.
- Preserve a short residual facial expression that naturally follows the spoken line.
- Residual expression must remain consistent with the line's meaning, the speaker's role, and the scene context.
- Silent/listening characters should also maintain a believable follow-up reaction after the speaker stops talking.
- Do not invent a stronger second emotional beat after the line unless the locked ACTION explicitly demands it.
- Do not switch from insult to smiling warmly, from sadness to joy, or from tension to comedy without a scripted reason.
- Keep the transition from speaking-expression to listening-expression smooth, restrained, and realistic.

==================================================
BAHASA INDONESIA DIALOGUE / ARTICULATION LOCK
==================================================
- All spoken dialogue in this shot is performed in Bahasa Indonesia.
- Preserve the exact Indonesian wording exactly as written in DIALOGUE.
- Do not translate the line into another language.
- Do not paraphrase the line.
- Do not swap Indonesian words for English synonyms or foreign-language phrasing.
- Pronunciation, diction, mouth articulation, and lip movement must support natural spoken Bahasa Indonesia.
- Preserve Indonesian name pronunciation naturally and consistently.
- Do not create mispronounced syllables through exaggerated mouth acting.
- Keep articulation clear, natural, and restrained.
- If a character is not the designated speaker, do not let that character appear to mouth Indonesian words incorrectly or accidentally.
- If a shot has NO SPOKEN DIALOGUE, no character may appear to speak.

CONTINUITY:
${continuityText}

CONTINUITY_SETUP_STATE:
${toText(shot.continuitySetup) || "Maintain the state shown in the approved Scene Anchor."}

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
- Preserve natural finger count and hand structure. Avoid fused fingers, broken fingers, rubbery fingers, extra fingers, or missing fingers.
- Maintain believable posture, balance, and center of gravity.
- Preserve physically plausible seated contact, standing contact, and weight distribution.
- Walking, if explicitly required, must use realistic stride length, knee bending, foot planting, and body balance.
- Do not allow limbs to twist beyond natural human range.
- Do not allow arms, hands, shoulders, hips, knees, ankles, or spine to snap, stretch, melt, or deform unnaturally.
- Do not create automatic dance-like flourishes, theatrical gestures, or exaggerated acting unless explicitly required.
- Facial performance should be subtle, grounded, and realistic.
- Eyebrows, eyelids, cheeks, lips, and jaw must move in a controlled and believable way.
- Do not create rubbery facial motion, over-wide mouth opening, frozen expression, twitching, or unstable face geometry.
- Eye-lines should remain believable for who the character is looking at.
- Speech animation must remain natural and attached to the correct speaker only.
- Prop interaction must respect grip realism, contact realism, and object weight realism.
- If a character is holding, eating, drinking, sitting, or standing, maintain believable contact between body, prop, and environment.

==================================================
LOCKED SERIES VISUAL STYLE
==================================================
${toText(project.visualStyle)}

==================================================
ABSOLUTE PRODUCTION CONSTRAINTS
==================================================
- The approved Scene Anchor is the visual source of truth when supplied.
- Execute only the action written in this Shot Manifest.
- Do not extend the story.
- Do not invent another event.
- Do not invent another emotion unless explicitly required by action/dialogue.
- Do not introduce another character.
- Do not remove a required-visible character.
- Do not duplicate any character.
- Do not change any locked face.
- Do not change age.
- Do not change ethnicity.
- Do not change hairstyle.
- Do not change skin tone.
- Do not change body proportions.
- Do not change locked costume.
- Do not change locked accessories.
- Do not redesign the location.
- Do not add important props.
- Do not add vehicles unless explicitly listed.
- Do not add animals.
- Do not add injuries unless explicitly stated in ACTION.
- Do not add weather unless explicitly stated in ACTION.
- Do not add narration unless explicitly present.
- Do not modify dialogue.
- Preserve speaker attribution exactly.
- Dialogue Speaker / Lip-Sync Lock is mandatory and overrides generic acting instincts.
- Only the correct designated speaker may speak each line.
- Silent characters must remain silent.
- Do not invent ad-libs, overlapping speech, or off-screen speech.
- Bahasa Indonesia Dialogue / Articulation Lock is mandatory.
- Facial Expression / Emotion Lock is mandatory.
- Post-Dialogue Expression Continuation Plan is mandatory.
- Do not invent emotional beats, reaction intensity, or facial acting outside the locked context.
- Keep camera behavior restrained and consistent with CAMERA.
- MovementMode and MOTION + PHYSICAL COLLISION LOCK override generic cinematic camera/style language.
- Never invent locomotion from dialogue, emotion, visual style, camera style or scene energy.
- Never allow a body or limb to pass through a solid object.
- Respect locked props exactly and do not invent prop business or prop interaction that was not requested.
- Anatomy / Performance Realism Lock overrides stylized or overly dramatic motion.
- No random text.
- No watermark.
- Photorealistic live-action microdrama.

The Shot Manifest is authoritative.
Persistent presence, continuity setup, motion lock, and locked production data override generative interpretation.
`.trim();
    };

    const compileAllVideoPrompts = () => {
        setBusy(true);
        setError("");
        setProgress("Compiling master prompts locally — no Gemini request...");
        try {
            const output = shots.map((shot) => ({
                ...shot,
                videoPrompt: compileMasterPrompt(shot),
            }));
            setShots(output);
            setSelectedShotId((current) => current || output[0]?.id || null);
            setStage("render");
            setProgress(`Compiled ${output.length} master prompt(s) locally. No API request used.`);
            window.setTimeout(() => setProgress(""), 1800);
        }
        catch (err) {
            handleError(err);
            setProgress("");
        }
        finally {
            setBusy(false);
        }
    };
    // ======================================================
    // SCENE ANCHOR
    // ======================================================
    const getPreviousApprovedShotFor = (targetShot, shotPool = shots) => {
        return [...shotPool]
            .filter((item) => item.id !== targetShot.id &&
                Number(item.episode) === Number(targetShot.episode) &&
                Number(item.shotNumber || 0) < Number(targetShot.shotNumber || 0) &&
                item.locationId === targetShot.locationId &&
                item.qa?.pass &&
                item.anchorImage)
            .sort((a, b) => Number(b.shotNumber || 0) - Number(a.shotNumber || 0))[0] || null;
    };
    const buildAnchorPrompt = (shot, generationContext = {}) => {
        const cast = shot.characterIds.map((id) => {
            const character = characterMap.get(id);
            return {
                id,
                name: character?.name,
                identity: character?.identity,
                costume: character?.costume,
            };
        });
        const location = locationMap.get(shot.locationId);
        const usedProps = shot.propIds.map((id) => {
            const prop = propMap.get(id);
            return {
                id,
                name: prop?.name,
                appearance: prop?.appearance,
            };
        });
        const castCount = Number(shot.expectedHumanCount || shot.characterIds.length || 0);
        const mustRemainVisibleIds = mergeIdLists(shot.mustRemainVisibleIds, shot.referencedVisibleTargetIds);
        const framingInstruction = castCount >= 2
            ? `MULTI-CHARACTER FRAMING:\n- This is a GROUP COMPOSITION containing ALL ${castCount} listed characters simultaneously.\n- Every listed character must be inside the SAME single 9:16 frame at the same moment.\n- Use a medium-wide or full ensemble composition; zoom OUT enough to fit everybody comfortably.\n- Keep every actor fully contained inside the image boundaries.\n- Do not crop the top of any head, face, shoulders, arms, hands, or any body part required by the action.\n- Prefer full-body or at minimum knees-up framing for every listed character.\n- Keep visible separation between bodies so one actor does not hide another actor's face.\n- Every face must be unobstructed and readable.\n- Leave safe breathing room around the group: approximately 8-12% margin from the top, left and right edges.\n- If the intended CAMERA instruction is too tight to include all characters, widen the camera rather than crop a character.`
            : castCount === 1
                ? `SINGLE-CHARACTER FRAMING:\n- Keep the one listed character comfortably inside the 9:16 frame.\n- Do not crop the top of the head, face, hands, or body parts needed for the action.\n- Prefer a medium-full / knees-up composition unless the action explicitly requires a wider full-body view.\n- Keep safe margin around the actor.`
                : `NO-CAST FRAMING:\n- No human may appear.\n- Show one coherent vertical establishing frame of the locked location.`;
        const anchorMotionInstruction = shot.movementMode === "LOCOMOTION"
            ? `LOCOMOTION START-FRAME SAFETY:\n- MOVING CHARACTER IDS: ${(shot.movingCharacterIds || []).join(", ") || "explicit moving cast"}.\n- Show each moving actor at the exact START position before movement begins.\n- Show the entire intended route as visibly open and unobstructed whenever practical.\n- Keep enough clearance between the moving actor and tables, benches, chairs, counters, walls, pillars, door panels, props and other people.\n- Do not start with any body part intersecting scenery.\n- If a doorway is used, its open gap and clear approach path must be visible.\n- Non-moving persistent characters stay at their established positions and remain visible.`
            : `STATIC START-FRAME LOCK:\n- Every actor is already in the position they will keep for the entire shot.\n- Do not imply entrance, exit, approach, walking or stepping.\n- Place bodies with realistic clearance from tables, benches, chairs, counters, walls, props and other people.\n- No body part may intersect solid scenery.\n- The approved anchor position is the actor position for the whole video.\n- If a character is seated/eating in continuitySetup, show that exact seated/eating start state now.`;
        const incidentalAnchorText = shot.incidentalSetDressing?.length
            ? shot.incidentalSetDressing.map((item) => `- ${toText(item)}`).join("\n")
            : "NONE";
        const presenceText = mustRemainVisibleIds.length
            ? mustRemainVisibleIds.map((id) => `- ${id} (${characterMap.get(id)?.name || id}) must be clearly visible and may not be hidden/off-screen.`).join("\n")
            : "- NONE";

        return `
TASK:
Create the exact approved FIRST FRAME / SCENE ANCHOR for a continuity-locked microdrama video shot.

MANDATORY ASSET-LEARNING + IDENTITY LOCK:
- BEFORE rendering, internally study every labeled CHARACTER_MASTER reference supplied with this request.
- Treat each Character Master image as the immutable biometric/visual identity source for that Character ID.
- Copy identity from the matching Character Master, not from generic visual style and not from another character.
- Preserve face geometry, eye shape, nose, lips, jawline, hairline, hairstyle, skin tone, age appearance, body proportions, locked outfit and locked accessories.
- NEVER average faces between characters.
- NEVER blend CHAR_001 facial traits into CHAR_002 or vice versa.
- NEVER substitute a similar-looking actor.
- NEVER beautify/redesign a face away from its master reference.
- When multiple characters appear, independently match EACH face to its own labeled Character Master.
- LOCATION_MASTER controls set architecture/furniture only; it is not a human identity reference.
- PROP_MASTER controls prop appearance only.
- A PREVIOUS_QA_ANCHOR, when supplied, controls continuity of staging/space only. It NEVER overrides Character Master identity.
${generationContext.previousApprovedShotId ? `- Previous approved continuity anchor: ${generationContext.previousApprovedShotId}. Preserve compatible spatial continuity where the current shot allows it.` : "- No previous approved continuity anchor is supplied for this shot."}
${generationContext.qaFeedback?.length ? `\nREGENERATION CORRECTION FROM PREVIOUS QA:\n${generationContext.qaFeedback.map((item) => `- ${toText(item)}`).join("\\n")}\nCorrect these failures while keeping all locked production data unchanged.` : ""}

OUTPUT FORMAT — ABSOLUTE:
- ONE SINGLE CONTINUOUS PHOTOGRAPHIC FRAME ONLY
- VERTICAL PORTRAIT 9:16
- target composition must fill one 9:16 canvas
- no landscape image
- no square image
- no split screen
- no diptych
- no triptych
- no collage
- no contact sheet
- no storyboard grid
- no picture-in-picture
- no multiple panels

SHOT_ID:
${shot.id}

EXPECTED_VISIBLE_HUMANS:
${shot.expectedHumanCount}

VISIBLE CHARACTERS:
${JSON.stringify(cast, null, 2)}

PERSISTENT / REQUIRED VISIBLE CHARACTERS:
${presenceText}

REFERENCED VISIBLE TARGET IDS:
${(shot.referencedVisibleTargetIds || []).join(", ") || "NONE"}

CARRY-OVER CHARACTER IDS FROM PRIOR CONTINUITY:
${(shot.carryOverCharacterIds || []).join(", ") || "NONE"}

SCREEN-SIDE / POSITION CONTINUITY LOCK:
- If a PREVIOUS_QA_ANCHOR is supplied and a character appears in both that anchor and the current shot, preserve that recurring character's left-to-right order and general screen side (screen-left / center / screen-right) unless the locked ACTION explicitly requires a positional change.
- Do NOT mirror, flip, or reverse the character arrangement by accident.
- If the previous approved anchor showed characters aligned left-to-right, keep the same left-to-right order for the recurring characters in this anchor unless the script explicitly stages a crossing.
- Preserve seated vs standing placement for recurring characters when continuitySetup/action does not explicitly change it.
- Preserve the relative spatial relationship between recurring characters and the locked furniture when continuity allows it.

LOCATION:
${JSON.stringify({
            id: location?.id,
            name: location?.name,
            description: location?.description,
            architecture: location?.architecture,
            furniture: location?.furniture,
            lighting: location?.lighting,
        }, null, 2)}

PROPS:
${JSON.stringify(usedProps, null, 2)}

CAMERA:
${shot.camera}

ACTION STARTING POSE:
Show the instant immediately BEFORE / AT THE VERY START of:
${shot.action}

CONTINUITY SETUP STATE — MUST BE VISIBLE:
${toText(shot.continuitySetup) || "Use the established state from the prior approved scene."}

STATE CONTINUITY RULE:
- if the setup says a character is eating, show that character already seated/eating with required ordinary tableware
- if the setup says a character is holding an object, show the object already in the hand
- if a person was physically present in the prior same-location scene and is required here, keep that person present; do not reset the room
- if dialogue will point out/insult/notice a person, compose the anchor so that person is visibly readable in the same frame

INCIDENTAL CONTINUITY SET DRESSING:
${incidentalAnchorText}

${framingInstruction}

${anchorMotionInstruction}

CONTINUITY NOTES:
${shot.continuityNotes.join("\n") || "None"}

SERIES VISUAL STYLE:
${project.visualStyle}

ABSOLUTE CAST RULES:
- exactly ${shot.expectedHumanCount} visible humans
- every Character ID listed above must appear in the anchor
- all listed characters must be visible SIMULTANEOUSLY in the same frame
- every required/referenced visible target must remain clearly readable
- each supplied Character Reference corresponds to exactly one unique person
- each listed character appears exactly once
- no listed character may be missing
- no listed character may be outside the frame
- no listed character may be cut off by the canvas edge
- no duplicate face
- no cloned body
- no extra people
- no crowd
- no passerby
- no human reflection
- no unlisted people behind glass, doors, mirrors or windows
- preserve supplied character face/age/skin/hair/body/costume
- preserve clear facial visibility for every listed character
- preserve recurring-character screen-side continuity when a previous approved anchor is supplied
- do not accidentally mirror left-right character order from the previous approved anchor unless the locked action explicitly requires crossing/repositioning

ABSOLUTE FRAME + PHYSICAL RULES:
- one frame only
- one camera view only
- one continuous scene only
- vertical 9:16 portrait composition
- compose for a mobile microdrama screen
- keep the complete cast safely inside frame boundaries
- do not crop heads or faces
- do not crop hands when they participate in the action
- for two or more characters, widen the shot until all characters fit comfortably
- do not use an extreme close-up when more than one character is expected
- preserve supplied location architecture/furniture
- preserve supplied prop appearance
- do not invent important objects
- no text overlay
- no watermark
- photorealistic live-action microdrama
- natural skin
- no anime/cartoon/3D look
- this image must be suitable as the first frame of an 8-second vertical video
- do not advance the action beyond the shot's starting moment
- solid scenery must remain physically solid
- no body/limb may intersect furniture, walls, counters, doors, props or another person
- no clipping, phasing, impossible overlap or geometry penetration
`;
    };
    const generateAnchor = async (shotId, qaFeedback = []) => {
        const shot = shots.find((item) => item.id === shotId);
        if (!shot)
            throw new Error("SHOT_NOT_FOUND");
        if (!shot.videoPrompt) {
            throw new Error("COMPILE_MASTER_PROMPT_FIRST");
        }
        if (shot.characterIds.length > 4) {
            throw new Error("ANCHOR_MAX_4_CHARACTER_REFERENCES");
        }

        const characterReferenceEntries = shot.characterIds.map((id) => {
            const character = characterMap.get(id);
            const image = character?.referenceImage;
            if (!image)
                throw new Error(`CHARACTER_REFERENCE_MISSING_${id}`);
            return {
                image,
                type: "CHARACTER_MASTER",
                id,
                label: `${id} // ${character?.name || id} // IMMUTABLE CHARACTER IDENTITY`,
                authority: `HIGHEST PRIORITY identity authority for ${id}. Preserve exact face, hair, skin, body, costume and accessories. Never blend with another character.`,
            };
        });

        const location = locationMap.get(shot.locationId);
        const locationRef = location?.referenceImage;
        if (!locationRef) {
            throw new Error(`LOCATION_REFERENCE_MISSING_${shot.locationId}`);
        }
        const locationEntry = {
            image: locationRef,
            type: "LOCATION_MASTER",
            id: shot.locationId,
            label: `${shot.locationId} // ${location?.name || shot.locationId} // LOCKED SET`,
            authority: "Location/set geometry authority only. Do not derive character identity from this image.",
        };

        const propEntries = shot.propIds
            .map((id) => {
                const prop = propMap.get(id);
                if (!prop?.referenceImage)
                    return null;
                return {
                    image: prop.referenceImage,
                    type: "PROP_MASTER",
                    id,
                    label: `${id} // ${prop?.name || id} // LOCKED PROP`,
                    authority: "Prop appearance authority only. Do not derive human identity from this image.",
                };
            })
            .filter(Boolean);

        const previousApprovedShot = getPreviousApprovedShotFor(shot);

        const continuityEntry = previousApprovedShot
            ? {
                image: previousApprovedShot.anchorImage,
                type: "PREVIOUS_QA_ANCHOR",
                id: previousApprovedShot.id,
                label: `${previousApprovedShot.id} // QA-PASSED CONTINUITY FRAME`,
                authority: "Use for spatial/set continuity and ongoing physical state only. NEVER override any Character Master face/identity.",
            }
            : null;

        const references = [
            ...characterReferenceEntries,
            locationEntry,
            ...propEntries,
            ...(continuityEntry ? [continuityEntry] : []),
        ];

        setShots((prev) => prev.map((item) => item.id === shotId
            ? {
                ...item,
                anchorStatus: "generating",
                qa: {
                    checked: false,
                    pass: false,
                    humanCount: 0,
                    identityPass: false,
                    identityDetails: [],
                    locationPass: false,
                    verticalPass: false,
                    singleFramePass: false,
                    allCharactersVisible: false,
                    framingPass: false,
                    spatialSafetyPass: false,
                    referencedTargetVisiblePass: false,
                    continuityPresencePass: false,
                    positionContinuityPass: false,
                    stateContinuityPass: false,
                    imageWidth: 0,
                    imageHeight: 0,
                    issues: [],
                },
            }
            : item));
        try {
            const image = await generateImage(buildAnchorPrompt(shot, {
                previousApprovedShotId: previousApprovedShot?.id || null,
                qaFeedback,
            }), references, ANCHOR_ASPECT_RATIO);
            setShots((prev) => prev.map((item) => item.id === shotId
                ? {
                    ...item,
                    anchorImage: image,
                    anchorStatus: "ready",
                    videoUrl: null,
                    videoRemoteUri: null,
                    operationName: null,
                    videoStatus: "idle",
                }
                : item));
            return image;
        }
        catch (err) {
            setShots((prev) => prev.map((item) => item.id === shotId ? { ...item, anchorStatus: "error" } : item));
            throw err;
        }
    };
    // ======================================================
    // CONTINUITY QA
    // ======================================================
    const inspectAnchorCandidate = async (shot, anchorImage) => {
        const characterRefs = shot.characterIds.map((id) => {
            const character = characterMap.get(id);
            const image = character?.referenceImage;
            if (!image)
                throw new Error(`REFERENCE_MISSING_${id}`);
            return {
                image,
                type: "CHARACTER_MASTER",
                id,
                label: `${id} // ${character?.name || id} // IDENTITY AUTHORITY`,
                authority: `Compare candidate ${id} only against this exact master identity.`,
            };
        });
        const location = locationMap.get(shot.locationId);
        const locationRef = location?.referenceImage;
        if (!locationRef)
            throw new Error(`LOCATION_REFERENCE_MISSING_${shot.locationId}`);
        const previousApprovedShot = getPreviousApprovedShotFor(shot);
        const qaReferencePack = [
            {
                image: anchorImage,
                type: "CANDIDATE_SCENE_ANCHOR",
                id: shot.id,
                label: `${shot.id} // CANDIDATE TO INSPECT`,
                authority: "This is the generated candidate. Inspect it; it is not an identity authority.",
            },
            ...characterRefs,
            {
                image: locationRef,
                type: "LOCATION_MASTER",
                id: shot.locationId,
                label: `${shot.locationId} // LOCATION AUTHORITY`,
                authority: "Compare set/location only. Do not use as a character identity source.",
            },
            ...(previousApprovedShot?.anchorImage ? [{
                image: previousApprovedShot.anchorImage,
                type: "PREVIOUS_QA_ANCHOR",
                id: previousApprovedShot.id,
                label: `${previousApprovedShot.id} // PREVIOUS QA-PASSED CONTINUITY FRAME`,
                authority: "Use only to inspect recurring character screen-side continuity, left-to-right order, and spatial continuity. Never override Character Master identity.",
            }] : []),
        ];

        const dimensions = await getImageDimensions(anchorImage);
        const verticalPass = isVerticalNineSixteen(dimensions.width, dimensions.height);
        const mustRemainVisibleIds = mergeIdLists(shot.mustRemainVisibleIds, shot.referencedVisibleTargetIds);

        const result = await callJSON(`
ROLE:
You are a strict visual continuity, persistent-presence, and framing inspector.

LABELED IMAGE PACK:
- CANDIDATE_SCENE_ANCHOR = image being inspected.
- Each CHARACTER_MASTER is the immutable identity authority for its exact Character ID.
- LOCATION_MASTER is the set authority only.
Never compare one character against another character's master.

SHOT_ID:
${shot.id}

EXPECTED FORMAT:
- ONE single continuous frame
- vertical portrait 9:16

EXPECTED HUMAN COUNT:
${shot.expectedHumanCount}

EXPECTED CHARACTER IDs:
${shot.characterIds.join(", ") || "NONE"}

MUST REMAIN VISIBLE IDS:
${mustRemainVisibleIds.join(", ") || "NONE"}

REFERENCED VISIBLE TARGET IDS:
${(shot.referencedVisibleTargetIds || []).join(", ") || "NONE"}

CARRY-OVER CHARACTER IDS:
${(shot.carryOverCharacterIds || []).join(", ") || "NONE"}

EXPECTED LOCATION:
${shot.locationId}

PREVIOUS_QA_SHOT_ID:
${previousApprovedShot?.id || "NONE"}

RECURRING CHARACTER IDS THAT SHOULD PRESERVE SCREEN-SIDE CONTINUITY:
${mergeIdLists(shot.characterIds, previousApprovedShot?.characterIds || []).filter((id) => shot.characterIds.includes(id) && (previousApprovedShot?.characterIds || []).includes(id)).join(", ") || "NONE"}

EXPECTED CONTINUITY STATE:
${toText(shot.continuitySetup) || "No additional state beyond the action and prior approved anchor."}

INCIDENTAL CONTINUITY SET DRESSING:
${(shot.incidentalSetDressing || []).join(", ") || "NONE"}

STRICT INSPECTION TASK:
1. Count visible humans.
2. Check for duplicate/cloned people and unexpected background people.
3. Perform STRICT PER-CHARACTER identity matching. For EACH expected Character ID, compare face geometry, eyes, nose, lips, jaw, hair/hairline, skin tone, age appearance and locked costume against that Character ID's own CHARACTER_MASTER. Similar-looking is not enough. Never swap identities.
4. Verify EVERY expected character is visible simultaneously in the SAME scene frame.
5. Verify EVERY MUST REMAIN VISIBLE and REFERENCED TARGET character is actually visible/readable, not missing or fully occluded.
6. Verify a carry-over character from prior same-location continuity has not disappeared.
7. Verify EXPECTED CONTINUITY STATE is visibly represented when it can be judged from a still frame. Example: if a character should already be seated/eating, the anchor must show the seated/eating setup and necessary ordinary tableware.
8. Verify safe framing: no expected actor has head/face cut; no important acting hand/arm is cut; multi-character cast fits comfortably.
9. Verify this is ONE coherent photographic frame, not split-screen/collage/storyboard/multiple panels.
10. Verify the location reasonably matches the location reference.
11. Check obvious costume continuity and unlisted important people/props.
12. Check SPATIAL SAFETY: no body/limb intersects furniture, walls, counters, doors, props, or another person's body.
13. If movementMode is LOCOMOTION, verify the start frame leaves a visibly clear unobstructed path for required movement while stationary continuity characters remain safely placed.
14. If movementMode is STATIC, verify actors are already placed in stable positions and do not need walking/repositioning to execute the action.
15. If PREVIOUS_QA_ANCHOR is supplied and recurring characters appear in both shots, verify the candidate does not accidentally mirror/flip the recurring characters' left-to-right order or screen side unless the locked action clearly requires a blocking change.

MOVEMENT MODE:
${shot.movementMode || "STATIC"}

MOVING CHARACTER IDS:
${(shot.movingCharacterIds || []).join(", ") || "NONE"}

PASS MUST BE FALSE IF ANY OF THESE OCCUR:
- human count differs
- duplicate person exists
- extra human exists
- expected character is missing
- required/referenced visible target is missing or fully hidden
- carry-over character that must remain visible disappeared
- visible continuity state contradicts the required setup
- character is cropped at head/face or badly cut by frame edge
- one actor hides another required actor's face
- image is collage/split-screen/multi-panel
- identity mismatch is obvious
- location continuity is obviously wrong
- body/limb intersects solid scenery or another person unnaturally
- LOCOMOTION is required but starting path is blocked by solid scenery

RETURN:
{
  "pass": true,
  "humanCount": ${shot.expectedHumanCount},
  "identityPass": true,
  "characterIdentityMatches": [
    { "characterId": "CHAR_001", "match": true, "reason": "exact master identity preserved" }
  ],
  "locationPass": true,
  "singleFramePass": true,
  "allCharactersVisible": true,
  "framingPass": true,
  "spatialSafetyPass": true,
  "referencedTargetVisiblePass": true,
  "continuityPresencePass": true,
  "positionContinuityPass": true,
  "stateContinuityPass": true,
  "issues": []
}
`, qaReferencePack, 0);

        const identityDetails = Array.isArray(result.characterIdentityMatches)
            ? result.characterIdentityMatches.map((item) => ({
                characterId: toText(item?.characterId),
                match: toBool(item?.match),
                reason: toText(item?.reason),
            })).filter((item) => item.characterId)
            : [];
        const identityMap = new Map(identityDetails.map((item) => [item.characterId, item.match]));
        const perCharacterIdentityPass = shot.characterIds.every((id) => identityMap.get(id) === true);
        const strictIdentityPass = toBool(result.identityPass) && perCharacterIdentityPass;
        const singleFramePass = toBool(result.singleFramePass);
        const allCharactersVisible = toBool(result.allCharactersVisible);
        const framingPass = toBool(result.framingPass);
        const spatialSafetyPass = toBool(result.spatialSafetyPass);
        const referencedTargetVisiblePass = mustRemainVisibleIds.length
            ? toBool(result.referencedTargetVisiblePass)
            : true;
        const continuityPresencePass = mustRemainVisibleIds.length || (shot.carryOverCharacterIds || []).length
            ? toBool(result.continuityPresencePass)
            : true;
        const recurringIds = mergeIdLists(shot.characterIds, previousApprovedShot?.characterIds || []).filter((id) => shot.characterIds.includes(id) && (previousApprovedShot?.characterIds || []).includes(id));
        const positionContinuityPass = previousApprovedShot?.anchorImage && recurringIds.length
            ? toBool(result.positionContinuityPass)
            : true;
        const stateContinuityPass = toText(shot.continuitySetup) || (shot.incidentalSetDressing || []).length
            ? toBool(result.stateContinuityPass)
            : true;

        const finalPass = toBool(result.pass) &&
            Number(result.humanCount) === shot.expectedHumanCount &&
            strictIdentityPass &&
            toBool(result.locationPass) &&
            verticalPass &&
            singleFramePass &&
            allCharactersVisible &&
            framingPass &&
            spatialSafetyPass &&
            referencedTargetVisiblePass &&
            continuityPresencePass &&
            positionContinuityPass &&
            stateContinuityPass;

        const issues = normalizeIssues(result.issues);
        if (!strictIdentityPass) {
            const failedIds = shot.characterIds.filter((id) => identityMap.get(id) !== true);
            issues.unshift(`Character identity mismatch against locked master reference: ${failedIds.join(", ") || "unknown character"}.`);
        }
        if (!verticalPass)
            issues.unshift(`Anchor must be vertical 9:16. Actual image: ${dimensions.width}x${dimensions.height}.`);
        if (!singleFramePass && !issues.some((item) => item.toLowerCase().includes("frame")))
            issues.push("Anchor must contain one single continuous frame only.");
        if (!allCharactersVisible && shot.expectedHumanCount > 0)
            issues.push("Not all expected characters are simultaneously visible in the frame.");
        if (!referencedTargetVisiblePass && mustRemainVisibleIds.length)
            issues.push(`Required/referenced visible target missing or obscured: ${mustRemainVisibleIds.join(", ")}.`);
        if (!continuityPresencePass)
            issues.push("Persistent character presence continuity failed: a character that should remain present disappeared or became unreadable.");
        if (!positionContinuityPass)
            issues.push("Screen-side / left-to-right continuity failed: a recurring character arrangement was flipped or mirrored relative to the previous approved anchor.");
        if (!stateContinuityPass)
            issues.push("Continuity state failed: the anchor does not visibly preserve the required ongoing physical state/activity.");
        if (!framingPass)
            issues.push("One or more expected characters are cropped, hidden, or too close to the image edge.");
        if (!spatialSafetyPass)
            issues.push(shot.movementMode === "LOCOMOTION"
                ? "Spatial safety failed: start position/path is blocked or intersects solid scenery."
                : "Spatial safety failed: actor/body intersects solid scenery or requires unintended repositioning.");

        return {
            checked: true,
            pass: finalPass,
            humanCount: Number(result.humanCount || 0),
            identityPass: strictIdentityPass,
            identityDetails,
            locationPass: toBool(result.locationPass),
            verticalPass,
            singleFramePass,
            allCharactersVisible,
            framingPass,
            spatialSafetyPass,
            referencedTargetVisiblePass,
            continuityPresencePass,
            positionContinuityPass,
            stateContinuityPass,
            imageWidth: dimensions.width,
            imageHeight: dimensions.height,
            issues: [...new Set(issues.filter(Boolean))],
        };
    };
    const validateAnchor = async (shotId) => {
        const shot = shots.find((item) => item.id === shotId);
        if (!shot?.anchorImage)
            throw new Error("ANCHOR_REQUIRED");
        setProgress(`QA ${shot.id}: checking vertical frame, full cast and continuity...`);
        const qa = await inspectAnchorCandidate(shot, shot.anchorImage);
        setShots((prev) => prev.map((item) => (item.id === shotId ? { ...item, qa } : item)));
        return qa;
    };
    const regenerateAndValidateAnchor = async (shotId) => {
        setBusy(true);
        setError("");
        try {
            // Maximum 3 attempts. Each retry receives the previous strict QA failures
            // while character/location/story locks remain immutable.
            let previousQaIssues = [];
            for (let attempt = 1; attempt <= 3; attempt++) {
                setProgress(`Anchor ${shotId} attempt ${attempt}/3 — studying locked assets, then generating 9:16 frame...`);
                const anchor = await generateAnchor(shotId, previousQaIssues);
                const shot = shots.find((item) => item.id === shotId);
                if (!shot)
                    throw new Error("SHOT_NOT_FOUND_AFTER_ANCHOR");
                const qa = await inspectAnchorCandidate(shot, anchor);
                setShots((prev) => prev.map((item) => item.id === shotId
                    ? {
                        ...item,
                        anchorImage: anchor,
                        anchorStatus: "ready",
                        qa,
                    }
                    : item));
                if (qa.pass) {
                    setProgress(`Anchor ${shotId} PASS — locked character identities + continuity verified.`);
                    return;
                }
                previousQaIssues = qa.issues || [];
                setProgress(`Anchor ${shotId} failed strict identity/continuity QA; regenerating from Character Master assets...`);
            }
            throw new Error("ANCHOR_QA_FAILED_AFTER_3_ATTEMPTS — vertical/single-frame/full-cast requirements were not satisfied. Review references or shot composition manually.");
        }
        catch (err) {
            handleError(err);
        }
        finally {
            setBusy(false);
            setProgress("");
        }
    };
    // ======================================================
    // VEO RENDER
    // ======================================================
    const renderShotWithVeo = async (shotId) => {
        const shot = shots.find((item) => item.id === shotId);
        if (!shot)
            throw new Error("SHOT_NOT_FOUND");
        if (!shot.videoPrompt)
            throw new Error("MASTER_PROMPT_REQUIRED");
        if (!shot.anchorImage)
            throw new Error("ANCHOR_REQUIRED");
        if (!shot.qa.checked || !shot.qa.pass) {
            throw new Error("ANCHOR_QA_MUST_PASS_BEFORE_VEO");
        }
        setShots((prev) => prev.map((item) => item.id === shotId
            ? {
                ...item,
                videoStatus: "generating",
                videoUrl: null,
                videoRemoteUri: null,
            }
            : item));
        try {
            setProgress(`${shotId}: starting Veo 3.1...`);
            const operationName = await startVeo(shot.videoPrompt, shot.anchorImage, ANCHOR_ASPECT_RATIO);
            setShots((prev) => prev.map((item) => item.id === shotId
                ? { ...item, operationName, videoStatus: "generating" }
                : item));
            const remoteUri = await pollVeo(operationName, (text) => setProgress(`${shotId}: ${text}`));
            setProgress(`${shotId}: downloading generated clip...`);
            const localBlobUrl = await downloadVideoToBlobUrl(remoteUri);
            setShots((prev) => prev.map((item) => item.id === shotId
                ? {
                    ...item,
                    operationName,
                    videoRemoteUri: remoteUri,
                    videoUrl: localBlobUrl,
                    videoStatus: "ready",
                }
                : item));
            return localBlobUrl;
        }
        catch (err) {
            setShots((prev) => prev.map((item) => item.id === shotId ? { ...item, videoStatus: "error" } : item));
            throw err;
        }
    };
    const renderSelectedShot = async () => {
        if (!selectedShotId)
            return;
        setBusy(true);
        setError("");
        try {
            await renderShotWithVeo(selectedShotId);
        }
        catch (err) {
            handleError(err);
        }
        finally {
            setBusy(false);
            setProgress("");
        }
    };
    const prepareSelectedShot = async () => {
        if (!selectedShotId)
            return;
        await regenerateAndValidateAnchor(selectedShotId);
    };
    const prepareEpisodeAnchors = async (episodeNumber) => {
        const episodeShots = shots.filter((shot) => Number(shot.episode) === Number(episodeNumber));
        if (!episodeShots.length) {
            setError(`Tidak ada shot untuk Episode ${episodeNumber}.`);
            return;
        }
        setBusy(true);
        setError("");
        try {
            for (let i = 0; i < episodeShots.length; i++) {
                const shotId = episodeShots[i].id;
                setSelectedShotId(shotId);
                setProgress(`Episode ${episodeNumber}: anchor + QA ${i + 1}/${episodeShots.length}`);
                await regenerateAndValidateAnchor(shotId);
            }
        } catch (err) {
            handleError(err);
        } finally {
            setBusy(false);
            setProgress("");
        }
    };
    const prepareAllAnchors = async () => {
        if (!shots.length) {
            setError("Belum ada shot untuk diproses.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            for (let i = 0; i < shots.length; i++) {
                const shotId = shots[i].id;
                setSelectedShotId(shotId);
                setProgress(`All shots: anchor + QA ${i + 1}/${shots.length}`);
                await regenerateAndValidateAnchor(shotId);
            }
        } catch (err) {
            handleError(err);
        } finally {
            setBusy(false);
            setProgress("");
        }
    };
    const renderEpisode = async (episodeNumber) => {
        const episodeShots = shots.filter((shot) => shot.episode === episodeNumber);
        if (!episodeShots.length) {
            setError(`Tidak ada shot untuk Episode ${episodeNumber}.`);
            return;
        }
        setBusy(true);
        setError("");
        try {
            for (let i = 0; i < episodeShots.length; i++) {
                const shotId = episodeShots[i].id;
                let current = shots.find((item) => item.id === shotId);
                setProgress(`Episode ${episodeNumber}: preparing shot ${i + 1}/${episodeShots.length}`);
                // Production safety gate:
                // no Veo call until an anchor exists and QA is explicitly PASS.
                if (!current?.anchorImage || !current.qa.pass) {
                    setSelectedShotId(shotId);
                    throw new Error(`SHOT_${shotId}_NEEDS_QA — generate/validate its Scene Anchor first. Batch render intentionally stops instead of bypassing continuity QA.`);
                }
                if (current.videoStatus === "ready")
                    continue;
                await renderShotWithVeo(shotId);
            }
        }
        catch (err) {
            handleError(err);
        }
        finally {
            setBusy(false);
            setProgress("");
        }
    };
    // ======================================================
    // COPY / DOWNLOAD
    // ======================================================
    const copyTextToClipboard = async (value, successLabel = "Copied") => {
        const textValue = toText(value);
        if (!textValue) {
            setError("Tidak ada prompt yang bisa dicopy.");
            return false;
        }
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(textValue);
            }
            else {
                const textarea = document.createElement("textarea");
                textarea.value = textValue;
                textarea.setAttribute("readonly", "");
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.select();
                const copied = document.execCommand("copy");
                document.body.removeChild(textarea);
                if (!copied)
                    throw new Error("COPY_FAILED");
            }
            setProgress(`${successLabel} copied to clipboard.`);
            window.setTimeout(() => setProgress(""), 1400);
            return true;
        }
        catch (err) {
            handleError(err);
            return false;
        }
    };
    // ======================================================
    // DOWNLOAD
    // ======================================================
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
        setError("");
        setProgress("Packaging locked production assets into ZIP...");
        try {
            const assets = getAllReferenceAssets();
            if (!assets.length) {
                throw new Error("NO_ASSETS_AVAILABLE");
            }

            const missing = assets.filter((item) => !item.referenceImage);
            if (missing.length) {
                throw new Error(`ASSET_REFERENCE_MISSING: ${missing.map((item) => item.id).join(", ")}`);
            }

            const zipFiles = assets.map((item) => {
                const parsed = parseDataUrl(item.referenceImage);
                const extension = mimeToExtension(parsed.mimeType);
                return {
                    // Exact production IDs become the filenames, e.g. CHAR_003.png.
                    name: `${item.id}.${extension}`,
                    data: base64ToUint8Array(parsed.data),
                };
            });

            const zipBlob = createZipBlob(zipFiles);
            const zipUrl = URL.createObjectURL(zipBlob);
            const safeTitle = toText(project.title)
                .replace(/[^a-z0-9_-]+/gi, "_")
                .replace(/^_+|_+$/g, "") || "SLENDRO";

            downloadBlobUrl(zipUrl, `${safeTitle}_ASSETS.zip`);
            window.setTimeout(() => URL.revokeObjectURL(zipUrl), 30000);
            setProgress(`ZIP ready: ${zipFiles.length} asset(s) packaged with production-ID filenames.`);
            window.setTimeout(() => setProgress(""), 2200);
        }
        catch (err) {
            handleError(err);
            setProgress("");
        }
    };

    const allReferenceAssets = getAllReferenceAssets();
    const allAssetsDownloadReady =
        allReferenceAssets.length > 0 &&
        allReferenceAssets.every((item) => Boolean(item.referenceImage));
    // ======================================================
    // UI
    // ======================================================
    const navigation = [
        { id: "project", label: "PROJECT", icon: <Film size={15}/> },
        { id: "assets", label: "ASSETS", icon: <Users size={15}/> },
        {
            id: "episodes",
            label: "EPISODES",
            icon: <Clapperboard size={15}/>,
        },
        { id: "scripts", label: "SCRIPT", icon: <ScrollText size={15}/> },
        { id: "shots", label: "SHOTS", icon: <ImageIcon size={15}/> },
        { id: "render", label: "VEO RENDER", icon: <Play size={15}/> },
    ];
    return (<div className="studio min-h-screen bg-[#08090d] text-[#e0e0e0]">
      <div className="scanline"/>

      <header className="header">
        <div className="flex items-center gap-4">
          <div className="logo-box">
            <Cpu size={19}/>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="orbitron text-sm font-bold tracking-[0.16em]">
                SLENDRO
              </span>
              <span className="green"> //</span>
              <span className="mono text-[9px] muted">
                MICRODRAMA VEO STUDIO
              </span>
            </div>

            <div className="mono text-[8px] green mt-1">
              ● GEMINI + NANO BANANA + VEO PIPELINE
            </div>
          </div>
        </div>

        <div className="hidden lg:flex gap-2 items-center">
          <StatusBadge label={`${characters.filter((x) => x.locked).length}/${characters.length} CAST`} active={characters.length > 0 && characters.every((item) => item.locked)}/>
          <StatusBadge label={`${episodes.length}/${project.episodeCount} EP`} active={episodes.length > 0 &&
            episodes.length === project.episodeCount}/>
          <StatusBadge label={`${shots.filter((x) => x.qa.pass).length}/${shots.length} QA`} active={shots.length > 0 && shots.every((shot) => shot.qa.pass)}/>
          <div className="save-state">{saveMessage}</div>
          <button type="button" disabled={!storageReady || savingProject} onClick={() => saveProjectNow({ silent: false })} className="header-save">
            {savingProject ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>}
            SAVE PROJECT
          </button>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-72px)]">
        <aside className="sidebar">
          <div className="side-label">PRODUCTION</div>

          <div className="space-y-2">
            {navigation.map((item) => (<button key={item.id} type="button" onClick={() => setStage(item.id)} className={stage === item.id ? "nav active" : "nav"}>
                {item.icon}
                <span>{item.label}</span>
                <ChevronRight size={12} className="ml-auto"/>
              </button>))}
          </div>

          <div className="side-divider"/>

          <div className="strict">
            <ShieldCheck size={14}/>
            STRICT CONTEXT
          </div>

          <p className="mono text-[8px] muted leading-4 mt-3">
            LOCKED DATA OVERRIDES AI CREATIVITY.
            <br />
            VEO REQUIRES QA PASS.
            <br />
            PROJECT: {saveMessage}
          </p>
        </aside>

        <main className="flex-1 min-w-0 p-5 md:p-8">
          {(busy || progress) && (<div className="progress-box mb-5">
              <Loader2 size={15} className={busy ? "animate-spin" : ""}/>
              <span>{progress || "Processing..."}</span>
            </div>)}

          {error && (<div className="error-box mb-5">
              <AlertTriangle size={17}/>
              <div className="flex-1">
                <div className="mono text-[9px] tracking-[0.15em]">
                  PRODUCTION_ERROR
                </div>
                <div className="mono text-[10px] mt-2 break-all">{error}</div>
              </div>
              <button type="button" onClick={() => setError("")}>
                ×
              </button>
            </div>)}

          {stage === "project" && (<section className="max-w-5xl">
              <PageTitle code="01" title="PROJECT SETUP" subtitle="Define the premise, then let AI derive controlled production rules."/>

              <Panel title="CORE SERIES CONTEXT" icon={<Film size={16}/>}>
                <div className="grid md:grid-cols-2 gap-4">
                  <InputField label="SERIES TITLE" value={project.title} placeholder="CEO Dalam Bayangan" onChange={(value) => setProject((prev) => ({ ...prev, title: value }))}/>

                  <SelectField label="GENRE" value={project.genre} values={[
                "Hidden Identity",
                "Modern CEO Romance",
                "Revenge",
                "Contract Marriage",
                "Family Drama",
                "Crime Mystery",
                "Wuxia",
                "Xianxia",
                "Palace Drama",
                "Youth Romance",
            ]} onChange={(value) => setProject((prev) => ({ ...prev, genre: value }))}/>
                </div>

                <TextAreaField label="ONE SENTENCE / PREMISE" value={project.premise} rows={5} placeholder="Seorang laki-laki miskin yang selalu diremehkan ternyata CEO dealer mobil terbesar di Indonesia." onChange={(value) => setProject((prev) => ({ ...prev, premise: value }))}/>
              </Panel>

              <div className="mt-5">
                <Panel title="AI VISUAL DIRECTOR" icon={<ImageIcon size={16}/>}>
                  <div className="flex justify-between items-center">
                    <div className="field-label">VISUAL STYLE</div>
                    <FieldStatus empty={!project.visualStyle} outdated={visualOutdated}/>
                  </div>

                  <textarea className="input" rows={12} value={project.visualStyle} onChange={(event) => {
                setProject((prev) => ({
                    ...prev,
                    visualStyle: event.target.value,
                }));
                setVisualSource(projectContextKey);
            }} placeholder="Generated visual style..."/>

                  <button type="button" disabled={!baseContextReady || visualLoading} onClick={generateVisualStyle} className="primary w-full">
                    {visualLoading ? (<Loader2 size={15} className="animate-spin"/>) : (<Sparkles size={15}/>)}
                    {project.visualStyle
                ? "REGENERATE VISUAL STYLE"
                : "GENERATE VISUAL STYLE"}
                  </button>
                </Panel>
              </div>

              <div className="mt-5">
                <Panel title="AI CONTINUITY ARCHITECT" icon={<ShieldCheck size={16}/>}>
                  <div className="flex justify-between items-center">
                    <div className="field-label">STORY GUARDRAILS</div>
                    <FieldStatus empty={!project.storyRules} outdated={guardOutdated}/>
                  </div>

                  <textarea className="input" rows={16} value={project.storyRules} onChange={(event) => {
                setProject((prev) => ({
                    ...prev,
                    storyRules: event.target.value,
                }));
                setGuardSource(projectContextKey);
            }} placeholder="Generated strict continuity rules..."/>

                  <button type="button" disabled={!baseContextReady || guardLoading} onClick={generateStoryGuardrails} className="primary w-full">
                    {guardLoading ? (<Loader2 size={15} className="animate-spin"/>) : (<ShieldCheck size={15}/>)}
                    {project.storyRules
                ? "REGENERATE STORY GUARDRAILS"
                : "GENERATE STORY GUARDRAILS"}
                  </button>
                </Panel>
              </div>

              <div className="mt-5">
                <Panel title="PRODUCTION CONFIG" icon={<Clapperboard size={16}/>}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <NumberField label="EPISODES" value={project.episodeCount} min={1} max={100} onChange={(value) => setProject((prev) => ({
                ...prev,
                episodeCount: value,
            }))}/>

                    <NumberField label="SEC / EPISODE" value={project.episodeDuration} min={30} max={300} onChange={(value) => setProject((prev) => ({
                ...prev,
                episodeDuration: value,
            }))}/>

                    <NumberField label="CAST" value={project.castCount} min={1} max={12} onChange={(value) => setProject((prev) => ({
                ...prev,
                castCount: value,
            }))}/>

                    <SelectField label="VIDEO FORMAT" value={project.aspectRatio} values={["9:16"]} onChange={(value) => setProject((prev) => ({
                ...prev,
                aspectRatio: value,
            }))}/>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <NumberField label="LOCATIONS" value={project.locationCount} min={1} max={10} onChange={(value) => setProject((prev) => ({
                ...prev,
                locationCount: value,
            }))}/>

                    <NumberField label="IMPORTANT PROPS" value={project.propCount} min={0} max={10} onChange={(value) => setProject((prev) => ({
                ...prev,
                propCount: value,
            }))}/>
                  </div>

                  <button type="button" disabled={busy ||
                !toText(project.visualStyle) ||
                !toText(project.storyRules) ||
                visualOutdated ||
                guardOutdated} onClick={generateProductionBible} className="primary w-full h-[52px]">
                    <Zap size={16}/>
                    GENERATE PRODUCTION BIBLE
                  </button>
                </Panel>
              </div>
            </section>)}

          {stage === "assets" && (<section>
              <PageTitle code="02" title="LOCKED PRODUCTION ASSETS" subtitle="One permanent visual reference per character, location and important prop."/>

              <SectionHeading icon={<Users size={15}/>} title="CHARACTERS" meta={`${characters.filter((x) => x.locked).length}/${characters.length} LOCKED`}/>

              <div className="asset-grid">
                {characters.map((character) => (<AssetCard key={character.id} id={character.id} title={character.name} subtitle={character.role} description={character.description} image={character.referenceImage} status={character.status} locked={character.locked}/>))}
              </div>

              <SectionHeading icon={<MapPin size={15}/>} title="LOCATIONS" meta={`${locations.filter((x) => x.locked).length}/${locations.length} LOCKED`}/>

              <div className="asset-grid">
                {locations.map((location) => (<AssetCard key={location.id} id={location.id} title={location.name} description={location.description} image={location.referenceImage} status={location.status} locked={location.locked}/>))}
              </div>

              <SectionHeading icon={<Box size={15}/>} title="PROPS" meta={`${props.filter((x) => x.locked).length}/${props.length} LOCKED`}/>

              <div className="asset-grid">
                {props.map((prop) => (<AssetCard key={prop.id} id={prop.id} title={prop.name} description={prop.description} image={prop.referenceImage} status={prop.status} locked={prop.locked}/>))}
              </div>

              <div className="action-bar flex-wrap">
                <button type="button" disabled={busy} onClick={generateAllReferences} className="secondary">
                  <Sparkles size={14}/>
                  GENERATE + LOCK ALL REFERENCES
                </button>

                <button type="button" disabled={busy || !allAssetsDownloadReady} onClick={downloadAllAssetsZip} className="secondary">
                  <Download size={14}/>
                  DOWNLOAD ALL ASSETS ZIP
                </button>

                <button type="button" disabled={busy ||
                characters.some((item) => !item.locked) ||
                locations.some((item) => !item.locked)} onClick={generateEpisodeManifest} className="primary">
                  <Clapperboard size={14}/>
                  GENERATE EPISODE MANIFEST
                </button>
              </div>
            </section>)}

          {stage === "episodes" && (<section>
              <PageTitle code="03" title="EPISODE MANIFEST" subtitle="AI Producer schedules only approved locked assets."/>

              <EpisodeTabs episodes={episodes} selected={selectedEpisode} onChange={setSelectedEpisode}/>

              {episodes
                .filter((item) => item.episode === selectedEpisode)
                .map((episode) => (<Panel key={episode.episode} title={`EP ${pad(episode.episode, 2)} // ${episode.title}`} icon={<Clapperboard size={16}/>}>
                    <Info label="LOGLINE" value={episode.logline}/>
                    <Info label="OBJECTIVE" value={episode.objective}/>

                    <div className="grid md:grid-cols-3 gap-3">
                      <Ids title="CAST" items={episode.characterIds}/>
                      <Ids title="LOCATIONS" items={episode.locationIds}/>
                      <Ids title="PROPS" items={episode.propIds}/>
                    </div>

                    <Info label="OPENING STATE" value={episode.openingState}/>
                    <Info label="ENDING STATE" value={episode.endingState}/>
                    <Info label="CLIFFHANGER" value={episode.cliffhanger} accent/>

                    <div className="locked">
                      <Lock size={11}/>
                      EPISODE MANIFEST LOCKED
                    </div>
                  </Panel>))}

              <div className="action-bar">
                <button type="button" disabled={busy || episodes.length === 0} onClick={generateAllScripts} className="primary">
                  <ScrollText size={14}/>
                  GENERATE ALL SCRIPTS
                </button>
              </div>
            </section>)}

          {stage === "scripts" && (<section>
              <PageTitle code="04" title="CONTROLLED SCRIPT" subtitle="Automatic Continuity Bridge repairs earlier setup from later scene dependencies without changing locked story/assets."/>

              <EpisodeTabs episodes={episodes} selected={selectedEpisode} onChange={setSelectedEpisode}/>

              <div className="space-y-4 mt-5">
                {(scripts[selectedEpisode] || []).map((scene) => (<Panel key={scene.id} title={scene.id} icon={<ScrollText size={16}/>}>
                    <div className="mono cyan text-[9px]">
                      LOCATION // {scene.locationId}
                    </div>
                    <div className="mono muted text-[9px]">
                      CAST // {scene.characterIds.join(" + ") || "NONE"}
                    </div>
                    <div className="info">{scene.action}</div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <Info label="MOTION POLICY" value={scene.movementPolicy || "STATIC"}/>
                      <Info label="CONTINUITY BRIDGE" value={scene.continuityRevised ? "AUTO-REVISED" : "NO REVISION"} accent={scene.continuityRevised}/>
                    </div>
                    {scene.continuitySetup && (<Info label="CONTINUITY SETUP" value={scene.continuitySetup}/>)}
                    {scene.requiredVisibleCharacterIds?.length > 0 && (<Info label="REQUIRED VISIBLE CAST" value={scene.requiredVisibleCharacterIds.join(" + ")}/>)}
                    {scene.carryOverCharacterIds?.length > 0 && (<Info label="CARRY-OVER CAST" value={scene.carryOverCharacterIds.join(" + ")}/>)}
                    {scene.referencedVisibleTargets?.length > 0 && (<Info label="REFERENCED VISIBLE TARGETS" value={scene.referencedVisibleTargets.map((target) => `${target.characterId}${target.evidence ? ` — ${target.evidence}` : ""}`).join(" • ")}/>)}
                    {scene.incidentalSetDressing?.length > 0 && (<Info label="INCIDENTAL SET DRESSING" value={scene.incidentalSetDressing.join(" • ")}/>)}
                    {scene.continuityRevisionReason && (<Info label="REVISION REASON" value={scene.continuityRevisionReason}/>)}

                    {scene.dialogue.map((line, index) => (<div className="dialogue" key={index}>
                        <strong>{line.characterId}</strong>
                        <span>{line.text}</span>
                      </div>))}
                  </Panel>))}
              </div>

              <div className="action-bar">
                <button type="button" disabled={busy || !Object.keys(scripts).length} onClick={rerunContinuityBridge} className="secondary">
                  <RefreshCw size={14}/>
                  RE-RUN CONTINUITY BRIDGE
                </button>
                <button type="button" disabled={busy || !Object.keys(scripts).length} onClick={generateAllShots} className="primary">
                  <ImageIcon size={14}/>
                  GENERATE SHOT MANIFEST
                </button>
              </div>
            </section>)}

          {stage === "shots" && (<section>
              <PageTitle code="05" title="SHOT MANIFEST" subtitle="Each 8-second shot locks persistent cast, referenced visible targets, and STATIC-or-LOCOMOTION movement before prompting."/>

              <div className="shot-list">
                {shots.map((shot) => (<button key={shot.id} type="button" onClick={() => setSelectedShotId(shot.id)} className={selectedShotId === shot.id ? "shot active" : "shot"}>
                    <span className="cyan">{shot.id}</span>
                    <span>EP {shot.episode}</span>
                    <span>{shot.expectedHumanCount} HUMAN</span>
                    <span>{shot.locationId}</span>
                    <span className={shot.movementMode === "LOCOMOTION" ? "cyan" : "green"}>{shot.movementMode === "LOCOMOTION" ? "MOVE" : "STATIC"} · 8 SEC</span>
                  </button>))}
              </div>

              <div className="action-bar">
                <button type="button" disabled={busy || shots.length === 0} onClick={compileAllVideoPrompts} className="primary">
                  <Terminal size={14}/>
                  MASTER PROMPT COMPILE
                </button>
              </div>
            </section>)}

          {stage === "render" && (<section>
              <PageTitle code="06" title="ANCHOR → QA → VEO" subtitle="Scene Anchor is locked to one vertical 9:16 frame. Bulk Anchor + QA is available, and recurring character screen positions are continuity-locked before Veo."/>

              <div className="grid xl:grid-cols-[300px_1fr] gap-5">
                <div className="panel h-fit">
                  <div className="panel-header">
                    <Clapperboard size={15}/>
                    SHOT QUEUE
                  </div>

                  <div className="p-3 max-h-[760px] overflow-y-auto space-y-2">
                    {shots.map((shot) => (<button key={shot.id} type="button" onClick={() => setSelectedShotId(shot.id)} className={selectedShotId === shot.id
                    ? "render-shot active"
                    : "render-shot"}>
                        <div>
                          <div className="mono cyan text-[8px]">{shot.id}</div>
                          <div className="mono muted text-[8px] mt-1">
                            {shot.characterIds.join(" + ") || "NO CAST"}
                          </div>
                        </div>

                        <div className="flex gap-2 items-center">
                          {shot.qa.pass && (<ShieldCheck size={13} className="green"/>)}
                          {shot.videoStatus === "ready" && (<Play size={13} className="cyan"/>)}
                        </div>
                      </button>))}
                  </div>
                </div>

                {selectedShot ? (<div className="space-y-5">
                    <Panel title={`MASTER PROMPT // ${selectedShot.id}`} icon={<Terminal size={16}/>}>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Mini label="HUMANS" value={String(selectedShot.expectedHumanCount)}/>
                        <Mini label="LOCATION" value={selectedShot.locationId}/>
                        <Mini label="LENGTH" value="8 SEC"/>
                        <Mini label="QA" value={selectedShot.qa.pass
                    ? "PASS"
                    : selectedShot.qa.checked
                        ? "FAIL"
                        : "PENDING"}/>
                      </div>

                      <button
                        type="button"
                        disabled={!selectedShot.videoPrompt}
                        onClick={() => copyTextToClipboard(selectedShot.videoPrompt, `${selectedShot.id} VEO PROMPT`)}
                        className="secondary w-full"
                      >
                        <Copy size={14}/>
                        COPY VEO PROMPT
                      </button>

                      <pre className="prompt-output">
                        {selectedShot.videoPrompt}
                      </pre>
                    </Panel>

                    <div className="grid lg:grid-cols-2 gap-5">
                      <Panel title="SCENE ANCHOR // 9:16 SINGLE FRAME" icon={<ImageIcon size={16}/>}>
                        <div className="anchor-frame aspect-[9/16] max-w-[430px]">
                          {selectedShot.anchorStatus === "generating" ? (<Loader2 size={28} className="animate-spin green"/>) : selectedShot.anchorImage ? (<img src={selectedShot.anchorImage} alt={`${selectedShot.id} anchor`}/>) : (<ImageIcon size={30} className="muted"/>)}
                        </div>

                        <div className="grid gap-3">
                          <button type="button" disabled={busy || selectedShot.anchorStatus === "generating"} onClick={prepareSelectedShot} className="secondary w-full">
                            <Sparkles size={14}/>
                            GENERATE + QA ANCHOR
                          </button>

                          <button type="button" disabled={busy || shots.length === 0} onClick={() => prepareEpisodeAnchors(selectedEpisode)} className="secondary w-full">
                            <Layers3 size={14}/>
                            BULK ANCHOR + QA EPISODE
                          </button>

                          <button type="button" disabled={busy || shots.length === 0} onClick={prepareAllAnchors} className="secondary w-full">
                            <Boxes size={14}/>
                            BULK ANCHOR + QA ALL SHOTS
                          </button>
                        </div>
                      </Panel>

                      <Panel title="CONTINUITY QA" icon={<ShieldCheck size={16}/>}>
                        <div className={`qa ${selectedShot.qa.pass
                    ? "pass"
                    : selectedShot.qa.checked
                        ? "fail"
                        : ""}`}>
                          <ShieldCheck size={22}/>
                          <div>
                            <div className="orbitron text-xs">
                              {selectedShot.qa.pass
                    ? "PASS"
                    : selectedShot.qa.checked
                        ? "FAIL"
                        : "PENDING"}
                            </div>
                            <div className="mono text-[8px] mt-2">
                              DETECTED HUMANS: {selectedShot.qa.humanCount}
                            </div>
                            <div className="mono text-[8px] mt-1">
                              IDENTITY:{" "}
                              {selectedShot.qa.identityPass ? "PASS" : "PENDING"}
                            </div>
                            <div className="mono text-[8px] mt-1">
                              LOCATION:{" "}
                              {selectedShot.qa.locationPass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}
                            </div>
                            <div className="mono text-[8px] mt-1">
                              SPATIAL SAFETY:{" "}
                              {selectedShot.qa.spatialSafetyPass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}
                            </div>
                            <div className="mono text-[8px] mt-1">
                              REFERENCED TARGET:{" "}
                              {selectedShot.qa.referencedTargetVisiblePass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}
                            </div>
                            <div className="mono text-[8px] mt-1">
                              PRESENCE CONTINUITY:{" "}
                              {selectedShot.qa.continuityPresencePass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}
                            </div>
                            <div className="mono text-[8px] mt-1">
                              POSITION CONTINUITY:{" "}
                              {selectedShot.qa.positionContinuityPass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}
                            </div>
                            <div className="mono text-[8px] mt-1">
                              STATE CONTINUITY:{" "}
                              {selectedShot.qa.stateContinuityPass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}
                            </div>
                            <div className="mono text-[8px] mt-1">
                              VERTICAL 9:16:{" "}
                              {selectedShot.qa.verticalPass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}
                            </div>
                            <div className="mono text-[8px] mt-1">
                              SINGLE FRAME:{" "}
                              {selectedShot.qa.singleFramePass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}
                            </div>
                            <div className="mono text-[8px] mt-1">
                              ALL CAST VISIBLE:{" "}
                              {selectedShot.qa.allCharactersVisible ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}
                            </div>
                            <div className="mono text-[8px] mt-1">
                              SAFE FRAMING:{" "}
                              {selectedShot.qa.framingPass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}
                            </div>
                            {selectedShot.qa.imageWidth > 0 && selectedShot.qa.imageHeight > 0 && (<div className="mono text-[8px] mt-1 muted">
                              FRAME: {selectedShot.qa.imageWidth}×{selectedShot.qa.imageHeight}
                            </div>)}
                          </div>
                        </div>

                        {selectedShot.qa.issues.map((issue, index) => (<div className="qa-issue" key={index}>
                            {issue}
                          </div>))}

                        <button type="button" disabled={busy || !selectedShot.anchorImage} onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                        await validateAnchor(selectedShot.id);
                    }
                    catch (err) {
                        handleError(err);
                    }
                    finally {
                        setBusy(false);
                        setProgress("");
                    }
                }} className="secondary w-full">
                          <RefreshCw size={14}/>
                          RECHECK QA
                        </button>
                      </Panel>
                    </div>

                    <Panel title="VEO 3.1 OUTPUT" icon={<Play size={16}/>}>
                      {selectedShot.videoUrl ? (<video src={selectedShot.videoUrl} controls playsInline className="video-preview portrait"/>) : (<div className="video-empty">
                          {selectedShot.videoStatus === "generating" ? (<>
                              <Loader2 size={30} className="animate-spin green"/>
                              <span>VEO GENERATING...</span>
                            </>) : (<>
                              <Play size={30}/>
                              <span>VIDEO NOT GENERATED</span>
                            </>)}
                        </div>)}

                      <div className="grid md:grid-cols-2 gap-3">
                        <button type="button" disabled={busy ||
                    !selectedShot.qa.pass ||
                    selectedShot.videoStatus === "generating"} onClick={renderSelectedShot} className="primary">
                          <Play size={14}/>
                          GENERATE VEO VIDEO
                        </button>

                        <button type="button" disabled={!selectedShot.videoUrl} onClick={() => selectedShot.videoUrl &&
                    downloadBlobUrl(selectedShot.videoUrl, `${selectedShot.id}.mp4`)} className="secondary">
                          <Download size={14}/>
                          DOWNLOAD MP4
                        </button>
                      </div>

                      {selectedShot.videoRemoteUri && (<div className="mono muted text-[8px] break-all">
                          REMOTE URI: {selectedShot.videoRemoteUri}
                        </div>)}
                    </Panel>
                  </div>) : (<div className="panel p-10 mono muted">SELECT A SHOT</div>)}
              </div>

              <div className="action-bar">
                <SelectField label="EPISODE" value={String(selectedEpisode)} values={episodes.map((episode) => String(episode.episode))} onChange={(value) => setSelectedEpisode(Number(value))}/>

                <button type="button" disabled={busy || shots.length === 0} onClick={() => prepareEpisodeAnchors(selectedEpisode)} className="secondary">
                  <Layers3 size={14}/>
                  BULK ANCHOR + QA EPISODE
                </button>

                <button type="button" disabled={busy || shots.length === 0} onClick={prepareAllAnchors} className="secondary">
                  <Boxes size={14}/>
                  BULK ANCHOR + QA ALL
                </button>

                <button type="button" disabled={busy} onClick={() => renderEpisode(selectedEpisode)} className="secondary">
                  <Zap size={14}/>
                  RENDER QA-PASSED EPISODE SHOTS
                </button>
              </div>
            </section>)}
        </main>
      </div>

      <style dangerouslySetInnerHTML={{
            __html: `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Orbitron:wght@500;600;700;800;900&display=swap');

*{box-sizing:border-box}
body{margin:0;background:#08090d}
.studio{position:relative;isolation:isolate;overflow-x:hidden}
.orbitron{font-family:"Orbitron",monospace}
.mono,.studio input,.studio textarea,.studio select,.studio button,.studio pre{font-family:"JetBrains Mono",monospace}
.green{color:#00ff88}
.cyan{color:#00d4ff}
.muted{color:#6b7280}

.scanline{
 position:fixed;inset:0;z-index:999;pointer-events:none;opacity:.07;
 background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Cpath d='M0 3.5H4' stroke='%23000000' stroke-width='1'/%3E%3C/svg%3E")
}

.header{
 height:72px;position:sticky;top:0;z-index:50;padding:0 24px;
 display:flex;align-items:center;justify-content:space-between;
 background:#08090d;border-bottom:1px solid #252936
}
.header-save{
 min-height:30px;padding:0 10px;display:flex;align-items:center;gap:6px;
 color:#00ff88;background:#0b0d12;border:1px solid rgba(0,255,136,.35);
 font-family:"JetBrains Mono",monospace;font-size:7px;font-weight:700;letter-spacing:.08em
}
.header-save:hover:not(:disabled){border-color:#00ff88;background:#10151a}
.save-state{
 max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
 color:#6b7280;font-family:"JetBrains Mono",monospace;font-size:7px;letter-spacing:.05em
}
.logo-box{
 width:40px;height:40px;display:flex;align-items:center;justify-content:center;
 color:#00ff88;background:#0d0f14;border:1px solid #00ff88;
 clip-path:polygon(0 8px,8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%);
 box-shadow:0 0 6px rgba(0,255,136,.4)
}

.sidebar{
 width:210px;min-width:210px;height:calc(100vh - 72px);position:sticky;top:72px;
 padding:20px 13px;background:#0b0d12;border-right:1px solid #252936
}
.side-label{margin-bottom:13px;color:#4b5563;font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:.18em}
.side-divider{height:1px;margin:22px 0;background:#252936}
.nav{
 width:100%;height:42px;padding:0 10px;display:flex;align-items:center;gap:9px;
 color:#6b7280;background:transparent;border:1px solid transparent;
 font-size:9px;letter-spacing:.09em;text-align:left
}
.nav:hover{color:#d1d5db;background:#11141b}
.nav.active{color:#00ff88;background:rgba(0,255,136,.03);border-color:rgba(0,255,136,.32)}
.strict{
 height:36px;padding:0 9px;display:flex;align-items:center;gap:7px;color:#00ff88;
 border:1px solid rgba(0,255,136,.3);font-family:"JetBrains Mono",monospace;font-size:8px
}

.panel{
 position:relative;background:#101219;border:1px solid #252936;
 clip-path:polygon(0 10px,10px 0,calc(100% - 10px) 0,100% 10px,100% calc(100% - 10px),calc(100% - 10px) 100%,10px 100%,0 calc(100% - 10px))
}
.panel::before{
 content:"";position:absolute;left:10px;top:0;width:36px;height:2px;background:#00ff88;
 box-shadow:0 0 6px rgba(0,255,136,.5)
}
.panel-header{
 min-height:60px;padding:0 18px;display:flex;align-items:center;gap:9px;
 color:#00ff88;background:#0c0e13;border-bottom:1px solid #252936;
 font-family:"Orbitron",monospace;font-size:9px;letter-spacing:.12em
}
.panel-content{padding:20px;display:flex;flex-direction:column;gap:18px}

.field-label{display:block;margin-bottom:7px;color:#6b7280;font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:.14em}
.input{
 width:100%;min-height:44px;padding:10px 12px;color:#d1d5db;background:#08090d;
 border:1px solid #252936;outline:none;font-size:10px;line-height:1.7
}
.input:focus{border-color:#00ff88;box-shadow:0 0 4px rgba(0,255,136,.35)}
.input::placeholder{color:#374151}
textarea.input{resize:vertical}

.primary,.secondary{
 min-height:44px;padding:0 14px;display:flex;align-items:center;justify-content:center;gap:8px;
 font-size:9px;font-weight:700;letter-spacing:.1em;transition:100ms linear;
 clip-path:polygon(0 6px,6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%)
}
.primary{color:#041009;background:#00ff88;border:1px solid #00ff88;box-shadow:0 0 5px rgba(0,255,136,.35)}
.primary:hover:not(:disabled){filter:brightness(1.1)}
.secondary{color:#9ca3af;background:#0b0d12;border:1px solid #303442}
.secondary:hover:not(:disabled){color:#00ff88;border-color:#00ff88}
button:disabled{opacity:.3;cursor:not-allowed}

.progress-box{
 min-height:44px;padding:0 13px;display:flex;align-items:center;gap:9px;color:#00ff88;
 background:#0c0e13;border:1px solid rgba(0,255,136,.25);font-family:"JetBrains Mono",monospace;font-size:9px
}
.error-box{
 min-height:55px;padding:13px;display:flex;align-items:flex-start;gap:11px;color:#ff5075;
 background:rgba(255,80,117,.025);border:1px solid rgba(255,80,117,.32)
}

.status{
 min-height:27px;padding:0 8px;display:flex;align-items:center;color:#6b7280;
 border:1px solid #252936;font-family:"JetBrains Mono",monospace;font-size:7px
}
.status.active{color:#00ff88;border-color:rgba(0,255,136,.35)}
.status.warning{color:#ffcc66;border-color:rgba(255,204,102,.35)}

.asset-grid{
 display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
 gap:13px;margin-bottom:30px
}
.asset{overflow:hidden;background:#101219;border:1px solid #252936}
.asset-image{
 aspect-ratio:1;display:flex;align-items:center;justify-content:center;overflow:hidden;
 background:#06070a;border-bottom:1px solid #252936
}
.asset-image img{width:100%;height:100%;object-fit:cover}
.locked{
 width:fit-content;min-height:28px;padding:0 8px;display:flex;align-items:center;gap:6px;
 color:#00ff88;border:1px solid rgba(0,255,136,.3);font-family:"JetBrains Mono",monospace;font-size:7px
}

.action-bar{
 position:sticky;bottom:12px;z-index:30;margin-top:24px;padding:11px;display:flex;gap:9px;
 align-items:end;background:#0b0d12;border:1px solid #252936
}

.episode-tabs{margin-bottom:18px;display:flex;flex-wrap:wrap;gap:6px}
.episode{
 min-height:34px;padding:0 10px;color:#6b7280;background:#0b0d12;
 border:1px solid #252936;font-family:"JetBrains Mono",monospace;font-size:8px
}
.episode.active{color:#00ff88;border-color:#00ff88}

.info{
 padding:13px;color:#cbd5e1;background:#08090d;border:1px solid #252936;
 font-family:"JetBrains Mono",monospace;font-size:10px;line-height:1.7
}
.id-box{min-height:90px;padding:12px;background:#08090d;border:1px solid #252936}
.dialogue{
 padding:10px;display:grid;grid-template-columns:100px 1fr;gap:10px;
 background:#08090d;border-left:2px solid #00ff88;font-family:"JetBrains Mono",monospace;font-size:10px
}
.dialogue strong{color:#00ff88}

.shot-list{border:1px solid #252936}
.shot{
 width:100%;min-height:44px;padding:0 12px;display:grid;
 grid-template-columns:160px 70px 100px 110px 1fr;gap:10px;align-items:center;
 color:#6b7280;background:#0c0e13;border:none;border-bottom:1px solid #252936;
 text-align:left;font-family:"JetBrains Mono",monospace;font-size:8px
}
.shot.active{color:#d1d5db;background:#11141b;border-left:2px solid #00ff88}

.render-shot{
 width:100%;min-height:52px;padding:9px 10px;display:flex;justify-content:space-between;align-items:center;
 background:#08090d;color:#9ca3af;border:1px solid #252936;text-align:left
}
.render-shot.active{border-color:#00ff88}

.prompt-output{
 max-height:380px;overflow:auto;padding:14px;white-space:pre-wrap;color:#9ca3af;
 background:#050609;border:1px solid #252936;font-size:9px;line-height:1.8
}

.anchor-frame{
 width:100%;margin:0 auto;display:flex;align-items:center;justify-content:center;
 overflow:hidden;background:#050609;border:1px solid #252936
}
.anchor-frame img{width:100%;height:100%;object-fit:contain;background:#050609}

.qa{
 min-height:100px;padding:14px;display:flex;align-items:center;gap:13px;
 color:#6b7280;background:#08090d;border:1px solid #252936
}
.qa.pass{color:#00ff88;border-color:rgba(0,255,136,.35)}
.qa.fail{color:#ff5075;border-color:rgba(255,80,117,.35)}
.qa-issue{
 padding:9px;color:#fca5a5;background:rgba(255,80,117,.025);
 border-left:2px solid #ff5075;font-family:"JetBrains Mono",monospace;font-size:8px
}

.video-empty{
 min-height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
 color:#374151;background:#050609;border:1px solid #252936;font-family:"JetBrains Mono",monospace;font-size:9px
}
.video-preview{width:100%;max-height:650px;background:#000;border:1px solid #252936}
.video-preview.portrait{max-width:430px;margin:0 auto}

.mini{min-height:55px;padding:10px;background:#08090d;border:1px solid #252936}

@media(max-width:900px){
 .sidebar{display:none}
 .header{padding:0 14px}
 .shot{grid-template-columns:1fr 70px 80px}
 .shot span:nth-child(4),.shot span:nth-child(5){display:none}
 .action-bar{flex-direction:column;align-items:stretch}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}
`,
        }}/>
    </div>);
}
// ======================================================
// SMALL COMPONENTS
// ======================================================
function PageTitle({ code, title, subtitle, }) {
    return (<div className="mb-6">
      <div className="mono green text-[8px] tracking-[.2em]">
        {code} // PIPELINE
     // PIPELINE
      </div>
      <h2 className="orbitron text-2xl md:text-3xl font-bold tracking-[.08em] mt-2">
        {title}
      </h2>
      <div className="mono muted text-[10px] mt-3">{subtitle}</div>
    </div>);
}
function Panel({ title, icon, children, }) {
    return (<div className="panel">
      <div className="panel-header">
        {icon}
        {title}
      </div>
      <div className="panel-content">{children}</div>
    </div>);
}
function InputField({ label, value, placeholder = "", onChange, }) {
    return (<label>
      <span className="field-label">{label}</span>
      <input className="input" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)}/>
    </label>);
}
function TextAreaField({ label, value, rows = 4, placeholder = "", onChange, }) {
    return (<label>
      <span className="field-label">{label}</span>
      <textarea className="input" rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)}/>
    </label>);
}
function NumberField({ label, value, min, max, onChange, }) {
    return (<label>
      <span className="field-label">{label}</span>
      <input className="input" type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value || min))))}/>
    </label>);
}
function SelectField({ label, value, values, onChange, }) {
    return (<label className="block">
      <span className="field-label">{label}</span>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        {values.map((item) => (<option key={item} value={item}>
            {item}
          </option>))}
      </select>
    </label>);
}
function StatusBadge({ label, active, }) {
    return <div className={active ? "status active" : "status"}>{label}</div>;
}
function FieldStatus({ empty, outdated, }) {
    if (empty)
        return <div className="status">EMPTY</div>;
    if (outdated) {
        return (<div className="status warning">
        <AlertTriangle size={10} className="mr-1"/>
        OUTDATED
      </div>);
    }
    return (<div className="status active">
      <Check size={10} className="mr-1"/>
      READY
    </div>);
}
function SectionHeading({ icon, title, meta, }) {
    return (<div className="flex items-center justify-between gap-3 my-5">
      <div className="flex items-center gap-2">
        <span className="green">{icon}</span>
        <span className="orbitron text-sm tracking-[.1em]">{title}</span>
      </div>
      <span className="mono muted text-[8px]">{meta}</span>
    </div>);
}
function AssetCard({ id, title, subtitle, description, image, status, locked, }) {
    return (<div className="asset">
      <div className="asset-image">
        {status === "generating" ? (<Loader2 size={27} className="animate-spin green"/>) : image ? (<img src={image} alt={title}/>) : (<ImageIcon size={28} className="muted"/>)}
      </div>

      <div className="p-4">
        <div className="mono cyan text-[8px]">{id}</div>
        <div className="orbitron text-sm mt-2">{title}</div>

        {subtitle && <div className="mono green text-[8px] mt-1">{subtitle}</div>}

        <div className="mono muted text-[9px] leading-5 mt-3">
          {description}
        </div>

        {locked && (<div className="locked mt-4">
            <Lock size={11}/>
            LOCKED
          </div>)}
      </div>
    </div>);
}
function EpisodeTabs({ episodes, selected, onChange, }) {
    return (<div className="episode-tabs">
      {episodes.map((episode) => (<button key={episode.episode} type="button" className={selected === episode.episode ? "episode active" : "episode"} onClick={() => onChange(episode.episode)}>
          EP {pad(episode.episode, 2)}
        </button>))}
    </div>);
}
function Info({ label, value, accent = false, }) {
    return (<div>
      <div className="field-label">{label}</div>
      <div className={accent ? "info green" : "info"}>{value}</div>
    </div>);
}
function Ids({ title, items, }) {
    return (<div className="id-box">
      <div className="field-label">{title}</div>
      <div className="space-y-2">
        {items.length ? (items.map((item) => (<div key={item} className="mono cyan text-[8px]">
              {item}
            </div>))) : (<div className="mono muted text-[8px]">NONE</div>)}
      </div>
    </div>);
}
function Mini({ label, value, }) {
    return (<div className="mini">
      <div className="field-label">{label}</div>
      <div className="mono green text-[9px] break-all">{value}</div>
    </div>);
}