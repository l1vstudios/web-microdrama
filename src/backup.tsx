import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Box, Check, ChevronRight, Clapperboard, Download, Eye, EyeOff, Film, Image as ImageIcon, Loader2, Lock, MapPin, Pencil, Play, RefreshCw, ScrollText, ShieldCheck, Sparkles, Square, Terminal, Users, Zap, Save, Layers3, Boxes, Copy, Table2, Trash2, } from "lucide-react";
import LoginPage from "./LoginPage";

const VITE_ENV = (import.meta as any)?.env || {};
const OPENROUTER_BRIDGE_URL = VITE_ENV.VITE_OPENROUTER_BRIDGE_URL || "http://localhost:8787/openai/v1";
const GEMINI_BRIDGE_URL = VITE_ENV.VITE_GEMINI_BRIDGE_URL || "http://localhost:4983/openai/v1";
const API_ROOT = OPENROUTER_BRIDGE_URL.replace(/\/openai\/v1\/?$/, "");
const GEMINI_PROXY_URL = OPENROUTER_BRIDGE_URL;
const GEMINI_PROXY_API_KEY = "";
const TEXT_MODEL = "openai/gpt-5.6-luna";

const GEMINI_IMAGE_BRIDGE_URL = GEMINI_BRIDGE_URL;
const GEMINI_IMAGE_BRIDGE_ROOT = GEMINI_IMAGE_BRIDGE_URL.replace(/\/openai\/v1\/?$/, "");
const GEMINI_IMAGE_BRIDGE_API_KEY = "";
const IMAGE_MODEL = "google/gemini-2.5-flash-image";
const IMAGE_PROVIDER_OPENROUTER = "openrouter";
const IMAGE_PROVIDER_GEMINI = "gemini";

// OpenRouter image model presets yang bisa dipilih user di SCENE ANCHOR.
const IMAGE_MODEL_PRESETS = [
    { id: "google/gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image (recommended)" },
    { id: "openai/gpt-image-1-mini", label: "GPT Image 1 Mini" },
    { id: "openai/gpt-image-1", label: "GPT Image 1" },
    { id: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image" },
    { id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5" },
    { id: "black-forest-labs/flux-1.1-pro", label: "FLUX 1.1 Pro" },
    { id: "qwen/qwen-image", label: "Qwen Image" },
];

const DEFAULT_VIDEO_MODEL = "alibaba/wan-3.0";
const VIDEO_MODEL_FALLBACKS = [
    { id: "alibaba/wan-3.0", name: "Alibaba: Wan 3.0", costPerSecond: 0.05, supportedResolutions: ["480p", "720p", "1080p"], supportedDurations: [2, 3, 4, 5, 6, 7, 8], pricingSkus: { duration_seconds_480p: "0.05", duration_seconds_720p: "0.1", duration_seconds_1080p: "0.2" } },
    { id: "bytedance/seedance-2.0-fast", name: "ByteDance: Seedance 2.0 Fast", costPerSecond: 0.04035, supportedResolutions: ["480p", "720p"], supportedDurations: [4, 5, 6, 7, 8], pricingSkus: { from: "0.04035/second" } },
    { id: "google/veo-3.1-lite", name: "Google: Veo 3.1 Lite", costPerSecond: 0.05, supportedResolutions: ["720p", "1080p"], supportedDurations: [4, 6, 8], pricingSkus: { per_video_second: "0.05" } },
];

// Model Gemini image di OpenRouter WAJIB pakai endpoint /chat/completions
// (bukan /images/generations) dan hanya menerima max 3 input references.
const GEMINI_IMAGE_MODEL_PATTERNS = [
    "gemini-2.5-flash-image",
    "gemini-3-pro-image",
    "gemini-2.0-flash-image",
];
const GEMINI_BRIDGE_MODELS = ["gemini-flash-lite", "gemini-flash", "gemini-pro"];
const DEFAULT_GEMINI_BRIDGE_IMAGE_MODEL = "gemini-flash";
const GEMINI_IMAGE_MAX_REFERENCES = 3;
const GEMINI_ANCHOR_PROMPT_MAX_CHARS: number = 2800;
const isGeminiImageModel = (modelId = "") => {
    const lower = String(modelId).toLowerCase();
    if (!lower.startsWith("google/")) return false;
    return GEMINI_IMAGE_MODEL_PATTERNS.some((pattern) => lower.includes(pattern));
};
const isGeminiBridgeModel = (modelId = "") => GEMINI_BRIDGE_MODELS.includes(String(modelId).trim());
const imageModelForProvider = (provider, requestedModel = "") => {
    const model = String(requestedModel || "").trim() || IMAGE_MODEL;
    if (provider !== IMAGE_PROVIDER_GEMINI) return model;
    return isGeminiBridgeModel(model) ? model : DEFAULT_GEMINI_BRIDGE_IMAGE_MODEL;
};
const shouldUseGeminiChatImage = (provider, modelId = "") =>
    provider === IMAGE_PROVIDER_GEMINI || isGeminiImageModel(modelId);
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

const GEMINI_PROXY_HEADERS = {
    "Content-Type": "application/json",
    ...(GEMINI_PROXY_API_KEY ? { Authorization: `Bearer ${GEMINI_PROXY_API_KEY}` } : {}),
    ...(GEMINI_PROXY_URL.includes("ngrok") ? { "ngrok-skip-browser-warning": "true" } : {}),
};
const VIDEO_ENGINE_NAME = "OPENROUTER VIDEO";

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
const MAX_DIALOGUE_LINES_PER_SHOT = 2;
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
    imageProvider: IMAGE_PROVIDER_GEMINI,
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
    (snapshot?.shots || []).filter((item) => item?.anchorImage).length
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
const getVideoPromptProfile = (model, modelInfo = null) => {
    const id = normalizeVideoModelId(model);
    const name = compactText(modelInfo?.name || modelInfo?.id || model || "OpenRouter video model");
    if (id.includes("veo")) {
        return {
            name,
            targetChars: 15000,
            style: "Use natural cinematic language. Strongly obey the attached first frame, single-location continuity, exact cast, and exact dialogue.",
        };
    }
    if (id.includes("wan")) {
        return {
            name,
            targetChars: 11000,
            style: "Use short direct instructions. Prioritize first-frame continuity, simple physical action, stable bodies, no cuts, and no extra people.",
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
    const shots = await Promise.all((snapshot.shots || []).map((item) => externalizeField(item, "anchorImage", `anchor-${item.id || "shot"}`)));
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
const drawCenterCroppedImage = (ctx, image, x, y, width, height, zoom = 1.18) => {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return;
    const cropWidth = Math.min(sourceWidth, (sourceHeight * width) / height / zoom);
    const cropHeight = Math.min(sourceHeight, (sourceWidth * height) / width / zoom);
    const sx = Math.max(0, (sourceWidth - cropWidth) / 2);
    const sy = Math.max(0, (sourceHeight - cropHeight) / 2);
    ctx.drawImage(image, sx, sy, cropWidth, cropHeight, x, y, width, height);
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

// ============================================================================
// CHARACTER IDENTITY BOARD
// Satu gambar berisi SEMUA character master. Dipakai di Gemini strict mode
// saat jumlah karakter > available reference slots, supaya identitas setiap
// karakter tetap terkirim ke model dalam SATU slot reference.
// ============================================================================
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
const LOCOMOTION_PATTERN = /\b(?:walk(?:s|ed|ing)?|enter(?:s|ed|ing)?|exit(?:s|ed|ing)?|approach(?:es|ed|ing)?|arrive(?:s|d|ing)?|come(?:s|ing)?\s+(?:in|into|toward|towards)|step(?:s|ped|ping)?\s+(?:toward|towards|forward|back|into|out)|run(?:s|ning)?|leave(?:s|ing)?|cross(?:es|ed|ing)?|move(?:s|d|ing)?\s+(?:toward|towards|across|into|out)|berjalan|masuk|keluar|mendekat|melangkah|berlari|meninggalkan|menuju|menyeberang|datang|tiba)\b/i;
const actionRequiresLocomotion = (value) => LOCOMOTION_PATTERN.test(toText(value));
const uniqueStrings = (items) => [...new Set((items || []).map((item) => toText(item)).filter(Boolean))];
const normalizeIdList = (value) => uniqueStrings(Array.isArray(value) ? value : []);
const mergeIdLists = (...groups) => uniqueStrings(groups.flatMap((group) => Array.isArray(group) ? group : []));
const validIdsOrFallback = (value, allowedIds, fallbackIds = []) => {
    const allowed = new Set(allowedIds);
    const valid = normalizeIdList(value).filter((id) => allowed.has(id));
    if (valid.length) return valid;
    return normalizeIdList(fallbackIds).filter((id) => allowed.has(id));
};
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

    // Tunggu semua worker yang sudah terlanjur aktif selesai sebelum melempar error.
    // Ini mencegah worker background masih mengubah React state setelah caller masuk finally.
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
            label: key === "current_5h" ? "Gemini Flash / 5h" : key === "weekly" ? "Gemini Pro / weekly" : `Gemini ${key}`,
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
const normalizeGeminiSessionPayload = (payload) => {
    const result = payload || {};
    return {
        status: "ready",
        ready: Boolean(result.ready),
        activeSession: result.active_session || null,
        candidateSessions: Array.isArray(result.candidate_sessions) ? result.candidate_sessions : [],
        cookieExportAvailable: Boolean(result.cookie_export_available),
        cookieCachePath: toText(result.cookie_cache_path),
        browserOrder: Array.isArray(result.browser_order) ? result.browser_order : [],
        fetchedAt: result.fetched_at || new Date().toISOString(),
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
const normalizeVisibleTargets = (value) => {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.map((item) => ({
        characterId: toText(item?.characterId),
        evidence: toText(item?.evidence || item?.reason || item?.dialogueEvidence),
    })).filter((item) => item.characterId && !seen.has(item.characterId) && seen.add(item.characterId));
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
        result = await fetchJsonWithRetry(`${GEMINI_PROXY_URL}/chat/completions`, {
            method: "POST",
            headers: GEMINI_PROXY_HEADERS,
            body: JSON.stringify(payload),
        }, options.maxRetries || 3);
    } catch (error) {
        if (!options.jsonMode || !String(error?.message || error).startsWith("API_400")) throw error;
        const { response_format: _response_format, ...fallbackPayload } = payload;
        result = await fetchJsonWithRetry(`${GEMINI_PROXY_URL}/chat/completions`, {
            method: "POST",
            headers: GEMINI_PROXY_HEADERS,
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

// Helper: cari gambar base64 di dalam response /chat/completions (Gemini image models).
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
        ? `FAST REFERENCE LOCK:\nUse the attached references only for their labeled IDs. Preserve character identity, outfit, locked prop shape/color/pattern/material/markings, and location layout. Do not blend identities. Character reference pose/head direction is NOT a pose instruction; stage the CURRENT script action/dialogue naturally instead of copying a reference portrait. If a PREVIOUS_CONTINUITY_ANCHOR is attached, treat it as the BASE SCENE to continue, not merely inspiration: preserve the same micro-location, indoor/outdoor status, camera direction, left/right object placement, recurring object color/pattern/material, recurring character face/body/hair/headcloth, visible wardrobe layers, fabric motifs, belt/sash, footwear, accessories, and prop handling unless the final task explicitly changes them. Character pose/blocking may change to match the current action. Locked prop world position/screen side must stay fixed unless the final task explicitly relocates that prop. Make the minimum necessary scene change while staging the current action clearly. Physical state locks (SEATED/STANDING/HOLDING/EATING) override beauty composition. Dialogue/action blocking may use natural head turns, body angles, hand positions, and listener reactions as long as identity, wardrobe, prop state, cast count, location, and safe framing remain correct.\n\n${referenceManifest}\n\nTARGET ASPECT RATIO: ${aspectRatio}\n\nFINAL TASK:\n${prompt}`
        : `TARGET ASPECT RATIO: ${aspectRatio}\n\n${prompt}`;

    const imageBridgeUrl = imageProvider === IMAGE_PROVIDER_GEMINI ? GEMINI_IMAGE_BRIDGE_URL : OPENROUTER_BRIDGE_URL;
    const imageBridgeHeaders = {
        "Content-Type": "application/json",
        ...((imageProvider === IMAGE_PROVIDER_GEMINI ? GEMINI_IMAGE_BRIDGE_API_KEY : "") ? { Authorization: `Bearer ${imageProvider === IMAGE_PROVIDER_GEMINI ? GEMINI_IMAGE_BRIDGE_API_KEY : ""}` } : {}),
        ...(imageBridgeUrl.includes("ngrok") ? { "ngrok-skip-browser-warning": "true" } : {}),
    };

    if (shouldUseGeminiChatImage(imageProvider, model)) {
        const anchorTargetId = toText(options?.anchorTargetId || prompt.match(/ANCHOR_START_TARGET_ID:\s*([^\s\n]+)/i)?.[1]);
        const anchorSpeakerId = toText(options?.anchorSpeakerId || prompt.match(/ANCHOR_START_SPEAKER_ID:\s*([^\s\n]+)/i)?.[1]);
        const primaryPropId = toText(options?.primaryPropId || prompt.match(/PRIMARY_PROP_ID:\s*([^\s\n]+)/i)?.[1]);
        const hasCorrectionSource = normalizedRefs.some((ref) => ref.type === "CORRECTION_SOURCE");
        const hasContinuitySource = normalizedRefs.some((ref) => ref.type === "PREVIOUS_CONTINUITY_ANCHOR");
        const hasIdentityBoard = normalizedRefs.some((ref) => ref.type === "CHARACTER_IDENTITY_BOARD");
        const geminiCandidateRefs = normalizedRefs.filter((ref) => ref.type !== "LOCKED_ASSET_BOARD");
        const geminiReferencePriority = (ref, index) => {
            // Identity-first ordering. Gemini image models have a small reference-image budget,
            // so a CHARACTER_MASTER must never be dropped in favour of a prop/location.
            let score = 0;
            if (ref.type === "CHARACTER_MASTER") score = 10000;
            else if (ref.type === "CHARACTER_IDENTITY_BOARD") score = 9800;
            else if (ref.type === "CORRECTION_SOURCE") score = 9500;
            else if (ref.type === "PREVIOUS_CONTINUITY_ANCHOR") score = 8500;
            else if (ref.type === "PROP_MASTER" && ref.id === primaryPropId) score = 8000;
            else if (ref.type === "PROP_MASTER") score = 7600;
            else if (ref.type === "LOCATION_MASTER") score = hasContinuitySource ? 6500 : 7200;
            else score = 500;
            // Small tie-breaker only; never changes asset-class priority.
            if (ref.type === "CHARACTER_MASTER" && ref.id === anchorTargetId) score += 80;
            if (ref.type === "CHARACTER_MASTER" && ref.id === anchorSpeakerId) score += 40;
            return score - index * 0.001;
        };
        const limitedRefs = geminiCandidateRefs
            .map((ref, index) => ({ ref, index, score: geminiReferencePriority(ref, index) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, GEMINI_IMAGE_MAX_REFERENCES)
            .map((item) => item.ref);
        const limitedManifest = limitedRefs.map((ref, index) =>
            `REFERENCE_ASSET_${index + 1}\nTYPE: ${ref.type}\nID: ${ref.id}\nLABEL: ${ref.label}\nAUTHORITY: ${ref.authority}`
        ).join("\n\n");
        const geminiPrompt = limitedRefs.length
            ? `STRICT GEMINI IMAGE MODE:
- Use the attached references only for the exact labeled authority.
- CHARACTER_IDENTITY_BOARD = identity sheet containing multiple SEPARATE people. Match each character ID ONLY to its own tile. Do NOT merge tiles. Do NOT render the sheet layout.
- If any CHARACTER_MASTER source contains background humans, soldiers, guards, crowds, partial bodies, or reflections, IGNORE them completely. Only the centered main labeled person is the identity authority.
- PREVIOUS_CONTINUITY_ANCHOR = base scene, wardrobe, prop placement, and continuity layout. It is NOT a frozen pose template when the current action/dialogue requires different blocking.
- CORRECTION_SOURCE = image to correct, not to restage.
- CHARACTER_MASTER = exact identity/outfit only.
- PRIORITY ORDER: identity/wardrobe > exact cast count > prop appearance > posture/state > continuity > composition.
- A seated character must read unmistakably seated in the final pixels.
- A standing character must read unmistakably standing.
- Every required character must be FULLY inside frame with safe margin — no cropping.
- Render ONLY the allowed cast IDs from the final task. Never promote a background person from any reference into the scene.
- Do not copy the reference portrait pose. Stage the CURRENT script action/dialogue with natural head turns, body angles, hand placement, and listener reactions when requested by FINAL TASK.
- Avoid a stiff portrait lineup. Do not redesign wardrobe, props, identity, count, location, or safe framing to chase performance pose.

${limitedManifest}

TARGET ASPECT RATIO: ${aspectRatio}

FINAL TASK:
${String(prompt).slice(0, GEMINI_ANCHOR_PROMPT_MAX_CHARS)}`
            : `TARGET ASPECT RATIO: ${aspectRatio}

${String(prompt).slice(0, GEMINI_ANCHOR_PROMPT_MAX_CHARS)}`;

        if (imageProvider === IMAGE_PROVIDER_GEMINI) {
            const payload: any = {
                model,
                prompt: geminiPrompt,
                n: 1,
                response_format: "b64_json",
                aspect_ratio: apiAspectRatio,
                mora_bypass_cache: options.bypassCache !== false,
                mora_reference_manifest: limitedRefs.map((ref, index) => ({ slot: index + 1, type: ref.type, id: ref.id, label: ref.label })),
                ...usageTaskPayload(),
                ...(aspectRatioToSize(apiAspectRatio) ? { size: aspectRatioToSize(apiAspectRatio) } : {}),
                ...(limitedRefs.length ? { image: limitedRefs.map((ref) => ref.image) } : {}),
            };
            const result = await fetchJsonWithRetry(`${imageBridgeUrl}/images/generations`, {
                method: "POST",
                headers: imageBridgeHeaders,
                body: JSON.stringify(payload),
            }, 1);
            const item = result?.data?.[0];
            const base64 = item?.b64_json;
            if (!base64) {
                const detail = result?.error?.message || result?.detail || result?.message || result?.choices?.[0]?.message?.content || "";
                throw new Error(`IMAGE_NOT_RETURNED${detail ? `: ${limitText(detail, 900)}` : ""}`);
            }
            const mimeType = item?.mime_type || item?.mimeType || "image/png";
            const normalizedImage = await normalizeImageToRequestedAspect(`data:${mimeType};base64,${base64}`, aspectRatio);
            return await uploadGeneratedAsset(normalizedImage, `${model.split("/").pop() || "image"}-${aspectRatio.replace(":", "x")}`);
        }

        const content: any[] = [{ type: "text", text: geminiPrompt }];
        limitedRefs.forEach((ref) => {
            content.push({ type: "image_url", image_url: { url: ref.image } });
        });

        const payload: any = {
            model,
            messages: [{ role: "user", content }],
            modalities: ["image", "text"],
            mora_bypass_cache: options.bypassCache !== false,
            mora_reference_manifest: limitedRefs.map((ref, index) => ({ slot: index + 1, type: ref.type, id: ref.id, label: ref.label })),
            ...usageTaskPayload(),
        };
        if (apiAspectRatio && apiAspectRatio !== "1:1") {
            payload.image_config = { aspect_ratio: apiAspectRatio };
        }

        const result = await fetchJsonWithRetry(`${imageBridgeUrl}/chat/completions`, {
            method: "POST",
            headers: imageBridgeHeaders,
            body: JSON.stringify(payload),
        }, 1);

        const extracted = extractImageFromChatCompletion(result);
        if (!extracted) {
            const detail = result?.error?.message || result?.detail || result?.message || "";
            throw new Error(`IMAGE_NOT_RETURNED${detail ? `: ${detail}` : ""}`);
        }
        const dataUrl = extracted.startsWith("data:") ? extracted : `data:image/png;base64,${extracted}`;
        const normalizedImage = await normalizeImageToRequestedAspect(dataUrl, aspectRatio);
        return await uploadGeneratedAsset(normalizedImage, `${model.split("/").pop() || "image"}-${aspectRatio.replace(":", "x")}`);
    }

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
        onTick?.(`OpenRouter video processing... poll ${attempt + 1}`);
        const response = await fetch(`${API_ROOT}/api/video/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.ok) throw new Error(result?.error || result?.detail || `VIDEO_STATUS_${response.status}`);
        const job = result.job || {};
        if (job.status === "completed") return job;
        if (["failed", "cancelled", "expired"].includes(job.status)) throw new Error(`VIDEO_${String(job.status).toUpperCase()}: ${job.error || "unknown error"}`);
        await sleep(5000);
    }
    throw new Error("VIDEO_POLL_TIMEOUT: OpenRouter video membutuhkan lebih dari 30 menit.");
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
    const [geminiSessions, setGeminiSessions] = useState<any>({
        status: "idle",
        ready: false,
        activeSession: null,
        candidateSessions: [],
        cookieExportAvailable: false,
        cookieCachePath: "",
        browserOrder: [],
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
    const loadGeminiCredits = async ({ silent = false, forceCookieRefresh = false, refresh = true } = {}) => {
        if (!silent) setCreditsRefreshing(true);
        try {
            const params = new URLSearchParams({
                refresh: refresh ? "true" : "false",
                ...(forceCookieRefresh ? { force_cookie_refresh: "true" } : {}),
            });
            if (forceCookieRefresh) {
                console.info("[gemini-bridge] get cookies: forcing browser cookie refresh");
            }
            const response = await fetch(`${GEMINI_IMAGE_BRIDGE_ROOT}/credits?${params.toString()}`, {
                method: "GET",
                cache: "no-store",
                headers: {
                    ...(GEMINI_IMAGE_BRIDGE_API_KEY ? { Authorization: `Bearer ${GEMINI_IMAGE_BRIDGE_API_KEY}` } : {}),
                    ...(GEMINI_IMAGE_BRIDGE_ROOT.includes("ngrok") ? { "ngrok-skip-browser-warning": "true" } : {}),
                },
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.ok) {
                throw new Error(result?.detail || result?.error || `HTTP_${response.status}`);
            }
            const normalized = normalizeCreditPayload(result);
            accountCreditsRef.current = normalized;
            setAccountCredits(normalized);
            return normalized;
        } catch (err) {
            const previous = accountCreditsRef.current || accountCredits;
            const nextSnapshot: any = {
                ...previous,
                status: previous?.quotas?.length || previous?.aiCreditsRemaining !== null ? "stale" : "error",
                error: String(err?.message || err),
            };
            accountCreditsRef.current = nextSnapshot;
            setAccountCredits(nextSnapshot);
            return nextSnapshot;
        } finally {
            if (!silent) setCreditsRefreshing(false);
        }
    };
    const loadGeminiSessions = async ({ silent = false, forceCookieRefresh = false } = {}) => {
        if (!silent) setSessionsRefreshing(true);
        try {
            const params = new URLSearchParams({
                refresh: "true",
                ...(forceCookieRefresh ? { force_cookie_refresh: "true" } : {}),
            });
            const response = await fetch(`${GEMINI_IMAGE_BRIDGE_ROOT}/sessions?${params.toString()}`, {
                method: "GET",
                cache: "no-store",
                headers: {
                    ...(GEMINI_IMAGE_BRIDGE_API_KEY ? { Authorization: `Bearer ${GEMINI_IMAGE_BRIDGE_API_KEY}` } : {}),
                    ...(GEMINI_IMAGE_BRIDGE_ROOT.includes("ngrok") ? { "ngrok-skip-browser-warning": "true" } : {}),
                },
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.ok) {
                throw new Error(result?.detail || result?.error || `HTTP_${response.status}`);
            }
            const normalized = normalizeGeminiSessionPayload(result);
            setGeminiSessions(normalized);
            return normalized;
        } catch (err) {
            const nextSnapshot: any = {
                ...geminiSessions,
                status: "error",
                error: String(err?.message || err),
            };
            setGeminiSessions(nextSnapshot);
            return nextSnapshot;
        } finally {
            if (!silent) setSessionsRefreshing(false);
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
            before = await loadGeminiCredits({ silent: true });
        }
        try {
            const result = await withAiUsageContext({ label, type }, task);
            const after = AUTO_CREDIT_METERING ? await loadGeminiCredits({ silent: true }) : before;
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
                window.setTimeout(() => loadGeminiCredits({ silent: true }), 1200);
            }
            return result;
        } catch (err) {
            const after = AUTO_CREDIT_METERING ? await loadGeminiCredits({ silent: true }).catch(() => null) : before;
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
                window.setTimeout(() => loadGeminiCredits({ silent: true }), 1200);
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
    const buildProjectSnapshot = () => ({
        schemaVersion: PROJECT_SCHEMA_VERSION, savedAt: Date.now(),
        workspaceId: activeWorkspaceId,
        stage, project, characters, locations, props, episodes, scripts,
        shots: makePersistableShots(shots),
        selectedEpisode, selectedShotId, visualSource, guardSource, creditEvents,
        imageModel: selectedImageModel,
        imageProvider: selectedImageProvider,
        videoModel: selectedVideoModel,
        videoResolution,
        videoGenerateAudio,
    });
    const saveProjectNow = async ({ silent = false } = {}) => {
        if (!storageReady || !activeWorkspaceId) return;

        const workspaceIdAtRequest = activeWorkspaceId;
        const revision = ++saveRevisionRef.current;
        const snapshotAtRequest = buildProjectSnapshot();
        if (!silent) setSavingProject(true);

        const executeSave = async () => {
            try {
                let snapshot = snapshotAtRequest;
                const externalized = await externalizeSnapshotImages(snapshot);
                snapshot = externalized.snapshot;

                // Jangan biarkan save lama mengubah UI setelah ada save yang lebih baru.
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

        // Serialisasi save: snapshot berikutnya menunggu write sebelumnya benar-benar selesai.
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
            shots.filter((item) => item.anchorImage).length;
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
            await loadGeminiCredits({ silent: true, forceCookieRefresh, refresh: forceCookieRefresh });
            await loadGeminiSessions({ silent: true, forceCookieRefresh: false });
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
                    setCreditEvents(Array.isArray(saved.creditEvents) ? saved.creditEvents.slice(0, CREDIT_LOG_LIMIT) : []);
                    setStage(saved.stage === "usage" ? "project" : (saved.stage || "project"));
                    setSelectedImageModel(toText(saved.imageModel) || IMAGE_MODEL);
                    setSelectedImageProvider(toText(saved.imageProvider) || saved.project?.imageProvider || DEFAULT_PROJECT.imageProvider);
                    setSelectedVideoModel(toText(saved.videoModel) || DEFAULT_VIDEO_MODEL);
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
    }, [storageReady, activeWorkspaceId, stage, project, characters, locations, props, episodes, scripts, shots, selectedEpisode, selectedShotId, visualSource, guardSource, creditEvents, selectedImageModel, selectedImageProvider, selectedVideoModel, videoResolution, videoGenerateAudio]);
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
    const handleError = (err) => {
        console.error(err);
        const message = String(err?.message || err);
        if (message.includes("localhost:4983") || message.includes(":4983/")) {
            setError(
                `${message}\n\n` +
                "Gemini image bridge Python belum jalan di 4983 / salah port.\n" +
                "Port 4982 adalah upstream gemini-webapi-proxy; browser app tetap harus lewat image bridge 4983.\n\n" +
                "Terminal 1:\n" +
                "  npm run gemini:proxy\n\n" +
                "Terminal 2:\n" +
                "  npm run gemini:image-bridge\n\n" +
                "Health check:\n" +
                "  curl http://localhost:4983/health\n\n" +
                "Jika curl http://localhost:8787/health menampilkan gemini-web-image-bridge, stop proses Python itu dulu karena sedang memakai port Bun backend."
            );
            return;
        }
        if (message.startsWith("ASSET_UPLOAD_FETCH_FAILED")) {
            setError(
                `${message}\n\n` +
                "Gambar kemungkinan sudah dibuat oleh Gemini, tapi gagal disimpan ke backend asset storage.\n\n" +
                "Cek Bun backend:\n" +
                "  cd ../morai-backend\n" +
                "  bun run start\n\n" +
                "Health check:\n" +
                "  curl http://localhost:8787/health"
            );
            return;
        }
        if (message.startsWith("BRIDGE_") || message.includes("Failed to fetch")) {
            if (selectedImageProvider === IMAGE_PROVIDER_GEMINI) {
                setError(
                    `${message}\n\n` +
                    "Mode IMG GEMINI butuh dua service lokal:\n\n" +
                    "1) Gemini image bridge:\n" +
                    "  cd /Users/brainsoft/kerjaan/webjs/morai\n" +
                    "  npm run gemini:image-bridge\n" +
                    "  curl http://localhost:4983/health\n\n" +
                    "2) Bun backend untuk save project/asset:\n" +
                    "  cd /Users/brainsoft/kerjaan/webjs/morai-backend\n" +
                    "  bun run start\n" +
                    "  curl http://localhost:8787/health\n\n" +
                    "Catatan: kalau image sudah berhasil dibuat tetapi upload asset gagal, app sekarang tetap memakai data image lokal agar generate tidak terbuang."
                );
                return;
            }
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
            setError(`${message}\n\nJalankan Bun backend OpenRouter lokal:\ncd ../morai-backend\nbun run start`);
            return;
        }
        setError(message);
    };
    const generateVisualStyle = async () => {
        if (!baseContextReady) { setError("Isi SERIES TITLE, GENRE, dan PREMISE terlebih dahulu."); return; }
        setVisualLoading(true); setError("");
        try {
            const result = await withCreditMeter("Visual Style", "text", () => callJSON(`
ROLE: You are the Visual Director for a controlled microdrama production.
SOURCE OF TRUTH:
	TITLE: ${project.title}
	GENRE: ${project.genre}
	PREMISE: ${project.premise}
	REGION MODE: ${regionProfile.regionMode}
	COUNTRY: ${regionProfile.country}
	LANGUAGE: ${regionProfile.language}
	REGION ASSET STYLE: ${regionProfile.assetStyle}
	REGION HARD RULES:
	${regionProfile.rules.map((rule) => `- ${rule}`).join("\n")}
	TASK:
Create a reusable visual production specification suitable for: character master references, location references, scene anchor frames, AI video shots.
MAY DEFINE: live-action aesthetic, cinematography, natural actor appearance, skin rendering, wardrobe realism, location realism, lighting philosophy, camera style, production quality, visual continuity rules, things to avoid.
MUST NOT: invent character names, company names, locations, important props, plot twists, story events, backstory; change the premise.
RETURN: { "visualStyle": "complete visual production specification" }
`, [], 0.2));
            const visualStyle = toText(result?.visualStyle);
            if (!visualStyle) throw new Error("VISUAL_STYLE_EMPTY");
            setProject((prev) => ({ ...prev, visualStyle }));
            setVisualSource(projectContextKey);
        } catch (err) { handleError(err); } finally { setVisualLoading(false); }
    };
    const generateStoryGuardrails = async () => {
        if (!baseContextReady) { setError("Isi SERIES TITLE, GENRE, dan PREMISE terlebih dahulu."); return; }
        setGuardLoading(true); setError("");
        try {
            const result = await withCreditMeter("Story Guardrails", "text", () => callJSON(`
ROLE: You are a strict Continuity Supervisor.
SOURCE OF TRUTH:
	TITLE: ${project.title}
	GENRE: ${project.genre}
	PREMISE: ${project.premise}
	REGION MODE: ${regionProfile.regionMode}
	COUNTRY: ${regionProfile.country}
	LANGUAGE: ${regionProfile.language}
	REGION HARD RULES:
	${regionProfile.rules.map((rule) => `- ${rule}`).join("\n")}
	GUARDRAILS MUST ENFORCE: no unrelated subplots; no unapproved named characters after Character Lock; no unapproved locations after World Lock; no unapproved major props after Prop Lock; locked Character/costume/Location/Prop overrides creativity; Episode Manifest overrides Script AI; Script overrides Shot Planner; Shot Manifest overrides Master Video Prompt; character knowledge chronological; continuity cannot reset between episodes; never duplicate a character inside one shot; minimize background people; no story expansion merely to fill episode count; ASSET_REQUEST_REQUIRED if required asset unavailable; CONTINUITY_BLOCKED if continuity conflicts; video prompting AI is a compiler not a storyteller; ONE SCENE per shot; no automatic scene changes; dialogue beats must get enough duration to finish naturally; recurring objects/furniture/vehicles must preserve their screen side and relative position; recurring characters must preserve posture/state unless the script explicitly changes it; policy-sensitive content must be rendered in a non-graphic, compliant way without changing story context.
RETURN: { "storyGuardrails": "numbered strict production rules" }
`, [], 0.05));
            const storyGuardrails = toText(result?.storyGuardrails);
            if (!storyGuardrails) throw new Error("STORY_GUARDRAILS_EMPTY");
            setProject((prev) => ({ ...prev, storyRules: storyGuardrails }));
            setGuardSource(projectContextKey);
        } catch (err) { handleError(err); } finally { setGuardLoading(false); }
    };
    const generateProductionBible = async () => {
        if (!baseContextReady) { setError("Project belum lengkap."); return; }
        if (!toText(project.visualStyle) || visualOutdated) { setError("VISUAL STYLE belum siap atau OUTDATED."); return; }
        if (!toText(project.storyRules) || guardOutdated) { setError("STORY GUARDRAILS belum siap atau OUTDATED."); return; }
        setBusy(true); setError(""); setProgress("AI Producer membuat Production Bible...");
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
		- Every episode must open with a clear establishing opening beat. Do not add a separate cliffhanger-only ending shot.
		- Shot duration policy: 6 seconds minimum for any spoken dialogue, 8 seconds for medium dialogue or chained interaction, 10 seconds for long dialogue/intense action/emotion, 12 seconds only for very long dialogue or story action that genuinely needs extra tension.
	- Dialogue must never feel cut off; if a line is long, the shot must hold long enough for the complete line and a short reaction beat.
	- Spatial continuity policy: recurring furniture, vehicles, carts, tables, doors, windows, locked props, ordinary set dressing, and actor posture must preserve left/right screen side and relative position from the previous continuity anchor unless the script explicitly changes them.
	- Example: if a cart/gerobak is screen-left, keep it screen-left in the next same-location scene; if a person is standing, keep standing unless the script explicitly seats them.
	- Policy-safe rendering policy: preserve the same story context while depicting sensitive conflict, danger, humiliation, or violence in non-graphic, compliant, realistic microdrama staging.
	- Director Mode prioritizes clear blocking, readable emotional beats, escalating stakes, and strict continuity over decorative camera tricks.
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

REFERENCE VISUAL STYLE:
${CHARACTER_REFERENCE_STYLE}

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
                [], // IMPORTANT: never feed a failed candidate back as a visual reference
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
    const generateEpisodeManifest = async () => {
        if (!characters.length) { setError("Characters masih 0. Generate Production Bible dulu."); return; }
        if (!locations.length) { setError("Locations masih 0. Klik Generate Reference Assets lagi supaya lokasi dibuat dan di-lock tanpa mengulang character/prop yang sudah locked."); return; }
        if (characters.some((item) => !item.locked)) { setError("Semua character harus LOCKED."); return; }
        if (locations.some((item) => !item.locked)) { setError("Semua location harus LOCKED."); return; }
        setBusy(true); setError(""); setProgress("Series Producer menyusun Episode Manifest...");
        try {
            const assetDB = {
                characters: characters.map((item) => ({ id: item.id, name: item.name, role: item.role })),
                locations: locations.map((item) => ({ id: item.id, name: item.name })),
                props: props.map((item) => ({ id: item.id, name: item.name })),
            };
            const result = await withCreditMeter("Episode Manifest", "text", () => callJSON(`
ROLE: You are the SERIES PRODUCER.
PROJECT:
TITLE: ${project.title}
GENRE: ${project.genre}
	PREMISE: ${project.premise}
	REGION MODE: ${regionProfile.regionMode}
	COUNTRY: ${regionProfile.country}
	LANGUAGE: ${regionProfile.language}
	REGION HARD RULES:
	${regionProfile.rules.map((rule) => `- ${rule}`).join("\n")}
	TOTAL EPISODES: ${project.episodeCount}
TARGET DURATION / EPISODE: ${project.episodeDuration} seconds
LOCKED STORY GUARDRAILS:
${project.storyRules}
LOCKED ASSET DATABASE:
${JSON.stringify(assetDB, null, 2)}
		THIS STAGE MAY ONLY DECIDE: which approved characters appear in each episode; which approved locations are used; which approved props are used; episode objective; opening state; ending state.
		ENHANCED BIBLE / DIRECTOR MODE:
		- Every episode MUST begin with an establishing opening beat in one approved location.
		- Do not create a separate cliffhanger-only ending beat. The final scene should end naturally on the last scripted action/reaction without adding an extra suspense insert.
		- Plan for ${VIDEO_ENGINE_NAME} video generation: one location per shot, clean blocking, clear emotional escalation, no montage.
		- Episode objectives, opening states, and ending states must feel culturally native to ${regionProfile.country}.
			- Duration grammar for later shot planning: 6s minimum spoken dialogue/simple action; 8s medium dialogue/establishing/chained interaction; 10s long dialogue/intense action/emotion; 12s very long dialogue or story action that genuinely needs extra tension.
		- Dialogue must never feel cut off; leave time for exact spoken line plus a short reaction beat.
		- Same-location continuity must preserve object/furniture/vehicle/cart screen side and relative placement unless a scripted action explicitly moves it.
		- Character posture/state continuity must persist: standing remains standing, seated remains seated, eating/holding/watching remains true unless the script explicitly changes it.
		- Policy-sensitive conflict must stay non-graphic and compliant while preserving the exact story context.
			HARD RULES: EXACTLY ${project.episodeCount} episodes; ONLY listed IDs; never create a character/location/prop; never change locked identities; maintain continuity; no unrelated subplots; every episode advances premise; openingState must describe the establishing opening; endingState must be concrete and filmable.
RETURN:
{
  "episodes": [
    {
      "episode": 1, "title": "", "logline": "", "objective": "",
      "characterIds": [], "locationIds": [], "propIds": [],
      "openingState": "", "endingState": "", "cliffhanger": "", "continuityNotes": []
    }
  ]
}
`, [], 0.15));
            if (result.episodes?.length !== project.episodeCount) throw new Error(`EPISODE_COUNT_MISMATCH expected=${project.episodeCount} actual=${result.episodes?.length || 0}`);
            const allowedCharacters = new Set(characters.map((item) => item.id));
            const allowedLocations = new Set(locations.map((item) => item.id));
            const allowedProps = new Set(props.map((item) => item.id));
            const fallbackCharacterIds = characters.slice(0, Math.max(1, Math.min(3, characters.length))).map((item) => item.id);
            const fallbackLocationIds = locations.slice(0, 1).map((item) => item.id);
            const normalized = result.episodes.map((item, index) => {
                const characterIds = validIdsOrFallback(item.characterIds, allowedCharacters, fallbackCharacterIds);
                const locationIds = validIdsOrFallback(item.locationIds, allowedLocations, fallbackLocationIds);
                const propIds = validIdsOrFallback(item.propIds, allowedProps, []);
                return {
                    episode: index + 1, title: item.title || `Episode ${index + 1}`,
                    logline: item.logline || "", objective: item.objective || "",
                    characterIds, locationIds, propIds,
                    openingState: item.openingState || "", endingState: item.endingState || "",
	                    cliffhanger: "", continuityNotes: item.continuityNotes || [],
                    locked: true,
                };
            });
            setEpisodes(normalized);
            setSelectedEpisode(1);
            setScripts({}); setShots([]);
            setStage("episodes");
        } catch (err) { handleError(err); } finally { setBusy(false); setProgress(""); }
    };
    const reconcileScriptContinuity = async (sourceScripts) => {
        const ordered = episodes.flatMap((episode) =>
            (sourceScripts[episode.episode] || []).map((scene) => ({ ...scene, episodeManifest: episode }))
        );
        if (!ordered.length) return sourceScripts;
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
            if (mentionsEating(text)) states.push(`${name} remains seated/eating as previously established`);
            else if (mentionsDrinking(text)) states.push(`${name} remains drinking as previously established`);
            else if (mentionsSitting(text)) states.push(`${name} remains seated as previously established`);
            else if (mentionsStanding(text)) states.push(`${name} remains standing as previously established`);
            return states.join("; ");
        };
        const descriptorScore = (dialogue, character) => {
            if (!character) return 0;
            const haystack = lower([character.name, character.role, character.description, character.identity?.gender, character.costume?.outfit].filter(Boolean).join(" "));
            let score = 0;
            if (character.name && dialogue.includes(lower(character.name))) score += 12;
            if (/gembel|pengemis|miskin|poor|beggar/.test(dialogue) && /poor|miskin|undercover|disheveled|faded|worn|distressed/.test(haystack)) score += 8;
            if (/cewek|wanita|perempuan|woman|girl/.test(dialogue) && /female|woman|perempuan/.test(haystack)) score += 5;
            if (/cowok|pria|laki|lelaki|man|guy/.test(dialogue) && /male|man|laki/.test(haystack)) score += 5;
            return score;
        };
        const resolveVisibleTarget = (scene, previousScene) => {
            const text = dialogueText(scene);
            if (!hasVisibleReference(text)) return null;
            const speakers = new Set(speakerIds(scene));
            const sameLocation = previousScene && previousScene.locationId === scene.locationId;
            const priorCandidates = sameLocation ? normalizeIdList(previousScene.characterIds).filter((id) => !speakers.has(id)) : [];
            const currentCandidates = normalizeIdList(scene.characterIds).filter((id) => !speakers.has(id));
            const candidates = mergeIdLists(priorCandidates, currentCandidates);
            if (!candidates.length) return null;
            if (candidates.length === 1) return candidates[0];
            const ranked = candidates.map((id) => ({ id, score: descriptorScore(text, characterMap.get(id)) + (priorCandidates.includes(id) ? 2 : 0) })).sort((a, b) => b.score - a.score);
            return ranked[0]?.score > 0 ? ranked[0].id : priorCandidates[0] || candidates[0];
        };
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
            const existingReferencedIds = scene.referencedVisibleTargets.map((item) => item.characterId);
            scene.requiredVisibleCharacterIds = mergeIdLists(scene.requiredVisibleCharacterIds, existingReferencedIds);
            const targetId = resolveVisibleTarget(scene, previous);
            if (targetId) {
                if (!allowedCharacters.has(targetId)) throw new Error(`CONTINUITY_BLOCKED_TARGET_OUTSIDE_EPISODE_MANIFEST_${scene.id}_${targetId}`);
                const evidence = (scene.dialogue || []).map((line) => line.text).join(" ");
                scene.referencedVisibleTargets = normalizeVisibleTargets([...scene.referencedVisibleTargets, { characterId: targetId, evidence: evidence || "Visible deictic reference in dialogue" }]);
                scene.requiredVisibleCharacterIds = mergeIdLists(scene.requiredVisibleCharacterIds, [targetId]);
                scene.characterIds = mergeIdLists(scene.characterIds, [targetId]);
                if (previous && previous.locationId === scene.locationId && previous.characterIds.includes(targetId) && !explicitDeparture(previous.action)) {
                    scene.carryOverCharacterIds = mergeIdLists(scene.carryOverCharacterIds, [targetId]);
                    const state = describeState(previous, targetId);
                    if (state) scene.continuitySetup = uniqueStrings([scene.continuitySetup, state]).join("; ");
                }
                scene.continuityNotes = uniqueStrings([...scene.continuityNotes, `${targetId} is explicitly referenced/pointed out by dialogue and must remain visible in the same shot coverage.`]);
                scene.continuityRevised = true;
                scene.continuityRevisionReason = uniqueStrings([scene.continuityRevisionReason, `Resolved visible dialogue target to ${targetId} and locked its presence.`]).join(" ");
            }
            if (targetId && mentionsEating(text) && previous && previous.locationId === scene.locationId && previous.characterIds.includes(targetId)) {
                const previousText = `${lower(previous.action)} ${lower(previous.continuitySetup)}`;
                if (!mentionsEating(previousText)) {
                    const targetName = characterMap.get(targetId)?.name || targetId;
                    previous.action = `${toText(previous.action)} ${targetName} is already seated and quietly eating a simple inexpensive warung meal from a plate with a spoon.`.trim();
                    previous.continuitySetup = uniqueStrings([previous.continuitySetup, `${targetName} is already seated and eating before the next scene begins`]).join("; ");
                    previous.incidentalSetDressing = uniqueStrings([...previous.incidentalSetDressing, "simple plate of inexpensive food", "ordinary metal spoon", "simple drinking glass"]);
                    previous.continuityNotes = uniqueStrings([...previous.continuityNotes, `${targetId} eating state is established here because the following scene/dialogue depends on it.`]);
                    previous.continuityRevised = true;
                    previous.continuityRevisionReason = uniqueStrings([previous.continuityRevisionReason, `Back-patched eating state for ${targetId} to support later dialogue continuity.`]).join(" ");
                    scene.continuitySetup = uniqueStrings([scene.continuitySetup, `${targetName} remains seated and eating from the previous scene`]).join("; ");
                    scene.incidentalSetDressing = uniqueStrings([...scene.incidentalSetDressing, "simple plate of inexpensive food", "ordinary metal spoon", "simple drinking glass"]);
                }
            }
            if (previous && previous.locationId === scene.locationId) {
                const previousPresent = normalizeIdList(previous.characterIds);
                const currentlyRequired = mergeIdLists(scene.requiredVisibleCharacterIds, scene.referencedVisibleTargets.map((item) => item.characterId));
                const validCarry = currentlyRequired.filter((id) => previousPresent.includes(id) && !explicitDeparture(previous.action));
                scene.carryOverCharacterIds = mergeIdLists(scene.carryOverCharacterIds, validCarry);
            }
            scene.characterIds = mergeIdLists(scene.characterIds, scene.requiredVisibleCharacterIds, scene.carryOverCharacterIds, speakerIds(scene));
            scene.characterIds.forEach((id) => { if (!allowedCharacters.has(id)) throw new Error(`CONTINUITY_CHARACTER_OUTSIDE_EPISODE_MANIFEST_${scene.id}_${id}`); });
            scene.movementPolicy = actionRequiresLocomotion(scene.action) ? "LOCOMOTION" : "STATIC";
        }
        const nextScripts = {};
        for (const scene of scenes) {
            const { episodeManifest, ...cleanScene } = scene;
            if (!nextScripts[scene.episode]) nextScripts[scene.episode] = [];
            nextScripts[scene.episode].push(cleanScene);
        }
        return nextScripts;
    };
    const rerunContinuityBridge = async () => {
        if (!Object.keys(scripts).length) return;
        setBusy(true); setError("");
        try {
            setProgress("Continuity Bridge: scanning future dependencies, visible references, and persistent cast...");
            const reconciled = await reconcileScriptContinuity(scripts);
            setScripts(reconciled);
            setShots([]);
            setProgress("Continuity Bridge complete. Required visible targets are locked; regenerate Shot Manifest.");
            window.setTimeout(() => setProgress(""), 2400);
        } catch (err) { handleError(err); setProgress(""); } finally { setBusy(false); }
    };
    const buildFallbackEpisodeScript = (episode, reason = "") => {
        const primaryCharacterId = normalizeIdList(episode.characterIds)[0] || "";
        const otherCharacterId = normalizeIdList(episode.characterIds).find((id) => id !== primaryCharacterId) || "";
        const locationId = normalizeIdList(episode.locationIds)[0] || locations[0]?.id || "";
        const propIds = normalizeIdList(episode.propIds);
        const primaryPropId = propIds[0] || "";
        const character = characterMap.get(primaryCharacterId);
        const prop = propMap.get(primaryPropId);
        const characterName = character?.name || primaryCharacterId || "the approved character";
        const propName = prop?.name || primaryPropId || "the important prop";
        const targetCharacterId = otherCharacterId || "";
        const baseNotes = uniqueStrings([
            "LOCAL_SCRIPT_FALLBACK: generated from Episode Manifest because AI script output was empty or invalid.",
            reason ? `Fallback reason: ${limitText(reason, 240)}` : "",
            "Use only approved manifest cast/location/props.",
        ]);
        const sceneCharacterIds = normalizeIdList([primaryCharacterId, targetCharacterId].filter(Boolean));
        const openingAction = toText(episode.openingState) || `${characterName} is already inside ${locationId}, noticing ${propName}.`;
        const objectiveAction = toText(episode.objective) || toText(episode.logline) || `${characterName} inspects ${propName} and decides what to do next.`;
        const endingAction = toText(episode.endingState) || `${characterName} reaches a clear decision about ${propName}.`;
        const dialogueLine = primaryPropId
            ? `Namun ${propName} ini... mengapa tersimpan di sini, tertutup begitu lama?`
            : `Aku harus memahami apa yang sebenarnya terjadi di sini.`;
        const resolveLine = hasPropOpenIntent(endingAction) || hasPropContentsVisibleIntent(endingAction)
            ? `Sekarang aku melihat isinya. Ini harus digunakan dengan benar.`
            : `Keputusan ini harus membawa perubahan.`;

        return [
            {
                id: `EP${pad(episode.episode)}_SC01`,
                episode: episode.episode,
                sceneNumber: 1,
                locationId,
                characterIds: sceneCharacterIds,
                propIds,
                storyPurpose: "Establish the episode state and visible production context.",
                action: openingAction,
                dialogue: [],
                continuityNotes: baseNotes,
                continuitySetup: openingAction,
                incidentalSetDressing: [],
                requiredVisibleCharacterIds: sceneCharacterIds,
                carryOverCharacterIds: [],
                referencedVisibleTargets: [],
                continuityRevisionReason: "",
                continuityRevised: false,
                movementPolicy: "STATIC",
                estimatedDuration: 8,
            },
            {
                id: `EP${pad(episode.episode)}_SC02`,
                episode: episode.episode,
                sceneNumber: 2,
                locationId,
                characterIds: sceneCharacterIds,
                propIds,
                storyPurpose: "Turn the episode objective into a readable action/dialogue beat.",
                action: primaryPropId
                    ? `${characterName} studies ${propName} closely, with the object still in the same location and clearly readable. ${objectiveAction}`
                    : objectiveAction,
                dialogue: primaryCharacterId ? [{ characterId: primaryCharacterId, targetCharacterId, text: dialogueLine }] : [],
                continuityNotes: uniqueStrings([...baseNotes, "Keep the important prop readable and do not introduce new characters."]),
                continuitySetup: openingAction,
                incidentalSetDressing: [],
                requiredVisibleCharacterIds: sceneCharacterIds,
                carryOverCharacterIds: sceneCharacterIds,
                referencedVisibleTargets: targetCharacterId ? [{ characterId: targetCharacterId, evidence: "Fallback dialogue/listening target" }] : [],
                continuityRevisionReason: "",
                continuityRevised: false,
                movementPolicy: "STATIC",
                estimatedDuration: 10,
            },
            {
                id: `EP${pad(episode.episode)}_SC03`,
                episode: episode.episode,
                sceneNumber: 3,
                locationId,
                characterIds: sceneCharacterIds,
                propIds,
                storyPurpose: "End on the manifest ending state without adding a new cliffhanger beat.",
                action: endingAction,
                dialogue: primaryCharacterId ? [{ characterId: primaryCharacterId, targetCharacterId, text: resolveLine }] : [],
                continuityNotes: uniqueStrings([...baseNotes, "Final scene must show the concrete ending state from the manifest."]),
                continuitySetup: endingAction,
                incidentalSetDressing: [],
                requiredVisibleCharacterIds: sceneCharacterIds,
                carryOverCharacterIds: sceneCharacterIds,
                referencedVisibleTargets: [],
                continuityRevisionReason: "",
                continuityRevised: false,
                movementPolicy: actionRequiresLocomotion(endingAction) ? "LOCOMOTION" : "STATIC",
                estimatedDuration: 10,
            },
        ].filter((scene) => scene.locationId && scene.characterIds.length);
    };
    const generateAllScripts = async () => {
        setBusy(true); setError("");
        const output = {};
        try {
            for (const episode of episodes) {
                setProgress(`Script Episode ${episode.episode}/${episodes.length}`);
                const previousEpisode = episodes.find((item) => item.episode === episode.episode - 1);
                const allowedCharacterData = episode.characterIds.map((id) => {
                    const character = characterMap.get(id);
                    return { id, name: character?.name, role: character?.role, description: character?.description, identity: character?.identity, costume: character?.costume };
                });
                const result = await withCreditMeter(`Script EP ${episode.episode}`, "text", () => callJSON(`
ROLE: You are a continuity-controlled microdrama screenplay producer. YOU ARE NOT A FREE CREATIVE WRITER.
	SERIES: ${project.title}
	ORIGINAL PREMISE: ${project.premise}
	REGION MODE: ${regionProfile.regionMode}
	COUNTRY: ${regionProfile.country}
	LOCKED STORY GUARDRAILS: ${project.storyRules}
PREVIOUS EPISODE END STATE: ${previousEpisode?.endingState || "Series opening"}
LOCKED EPISODE MANIFEST:
${JSON.stringify(episode, null, 2)}
ALLOWED CHARACTER RECORDS:
${JSON.stringify(allowedCharacterData, null, 2)}
	LANGUAGE: ${regionProfile.language}
	TARGET EPISODE LENGTH: ${project.episodeDuration} seconds
	VIDEO_ENGINE_TARGET: ${VIDEO_ENGINE_NAME}
	HARD STORY + PHYSICAL CONTINUITY RULES:
- only manifest character/location/prop IDs
- no new named character; no extras unless in manifest; no new location; no new important prop
- do not change identity or default costume
- do not reveal information before the character learns it
- do not reset previous continuity; do not solve later episode conflicts
		- concise microdrama dialogue
		- all dialogue must be natural ${regionProfile.language}, with culturally appropriate phrasing for ${regionProfile.country}
		- Every dialogue line must include targetCharacterId: the exact approved Character ID the speaker is addressing/looking at. targetCharacterId must be a different visible character in the same scene. Use "" only for explicitly scripted direct-to-camera/self-address.
		- dialogue must be short enough to finish naturally inside the planned video duration; if a line is longer, the later Shot Manifest must assign a longer duration rather than cutting the line
		- character names, honorifics, social hierarchy, food, money, vehicles, signage, locations, and props must follow ${regionProfile.country}
- actions physically filmable
- EACH SCENE HAPPENS IN EXACTLY ONE LOCATION. No scene may span two locations.
- NO SCENE MAY CONTAIN MULTIPLE PLACES OR MULTIPLE TIME MOMENTS. One scene = one place = one continuous moment.
- When the story needs to move to a new place, END the current scene and START a new scene in the new location. Do NOT put travel inside a single scene.
- make physical state explicit when story-relevant: seated/standing, eating/not eating, holding/not holding, object open/closed
- if a later line will visibly depend on an ongoing state, establish that state in an earlier compatible scene whenever possible
	- a character already physically present in the same location must not silently vanish from continuity if another character is visibly referring to/watching/insulting/reacting to them
	- dialogue containing "lihat"/"itu"/"dia"/"orang itu"/"gembel itu"/"di sana" or equivalent MUST include the referenced approved person in characterIds when meant to be physically visible; list under requiredVisibleCharacterIds
	- same-location continuity must preserve object/furniture/vehicle/cart screen side and relative placement from the previous scene; do not move a gerobak/cart/table/door/window/prop from left to right unless action explicitly says it is moved
	- same-location continuity also means the same exact micro-location/camera-axis; do not jump from alley view to a different doorway/wall/courtyard/interior corner within the same location unless the action explicitly relocates the characters
	- preserve character posture/state between adjacent same-location scenes; standing remains standing, seated remains seated, eating/holding/watching remains true unless the script explicitly changes it
	- sensitive story conflict must remain policy-safe: use non-graphic, non-explicit, realistic staging while preserving the original story context
	- STATIC staging is default for dialogue/reaction/eating/listening scenes
- do not invent walking/entering/exiting/approaching/crossing/pacing/repositioning merely for cinematic interest
	- only use locomotion when the story beat truly requires arrival/departure/chase/traversal
	- when locomotion is not story-essential, place characters at their required positions before the scene begins
		- SCENE 1 must support a clean establishing opening in its locked location before dialogue/action escalates
		- the final scene must end naturally on the last scripted action/reaction. Do not add a separate cliffhanger-only beat or extra suspense insert.
		- total scene duration should approximately reach the episode target
	DIRECTOR MODE / DURATION GRAMMAR:
		- 6 seconds: short dialogue or simple action beats
		- 8 seconds: medium dialogue, establishing opening shots, and chained interactions
		- 10 seconds: long dialogue, intense action, or intense emotional beats
			- 12 seconds: very long dialogue or story action that genuinely needs extra tension
	- Write scenes so later shot planning can choose those durations naturally.
RETURN:
{
  "scenes": [
    {
      "sceneNumber": 1, "locationId": "", "characterIds": [], "propIds": [],
      "storyPurpose": "", "action": "",
      "dialogue": [ { "characterId": "", "targetCharacterId": "", "text": "" } ],
      "continuityNotes": [], "continuitySetup": "", "incidentalSetDressing": [],
      "requiredVisibleCharacterIds": [], "carryOverCharacterIds": [],
      "referencedVisibleTargets": [], "estimatedDuration": 16
    }
  ]
}
`, [], 0.08));
                const allowedCharacters = new Set(episode.characterIds);
                const allowedLocations = new Set(episode.locationIds);
                const allowedProps = new Set(episode.propIds);
                const rawScenes = Array.isArray(result?.scenes) ? result.scenes : [];
                if (!rawScenes.length) {
                    output[episode.episode] = buildFallbackEpisodeScript(episode, "AI returned zero scenes.");
                    setScripts({ ...output });
                    continue;
                }
                const normalized = rawScenes.map((scene, index) => {
                    const dialogue = (scene.dialogue || []).map((line) => {
                        if (!allowedCharacters.has(line.characterId)) throw new Error(`DIALOGUE_CHARACTER_OUTSIDE_MANIFEST_${line.characterId}`);
                        const targetCharacterId = toText(line.targetCharacterId);
                        if (targetCharacterId && !allowedCharacters.has(targetCharacterId)) throw new Error(`DIALOGUE_TARGET_OUTSIDE_MANIFEST_${targetCharacterId}`);
                        if (targetCharacterId && targetCharacterId === line.characterId) throw new Error(`DIALOGUE_TARGET_EQUALS_SPEAKER_${line.characterId}`);
                        return { characterId: line.characterId, targetCharacterId, text: line.text || "" };
                    });
                    const referencedTargets = normalizeVisibleTargets(scene.referencedVisibleTargets);
                    const referencedIds = referencedTargets.map((item) => item.characterId);
                    const dialogueTargetIds = normalizeIdList(dialogue.map((line) => line.targetCharacterId));
                    const requiredVisibleCharacterIds = mergeIdLists(scene.requiredVisibleCharacterIds, referencedIds, dialogueTargetIds);
                    const carryOverCharacterIds = normalizeIdList(scene.carryOverCharacterIds);
                    const characterIds = mergeIdLists(scene.characterIds, requiredVisibleCharacterIds, carryOverCharacterIds, dialogue.map((line) => line.characterId));
                    const propIds = normalizeIdList(scene.propIds);
                    characterIds.forEach((id) => { if (!allowedCharacters.has(id)) throw new Error(`SCRIPT_CHARACTER_OUTSIDE_MANIFEST_${id}`); });
                    requiredVisibleCharacterIds.forEach((id) => { if (!allowedCharacters.has(id)) throw new Error(`SCRIPT_REQUIRED_VISIBLE_CHARACTER_OUTSIDE_MANIFEST_${id}`); });
                    carryOverCharacterIds.forEach((id) => { if (!allowedCharacters.has(id)) throw new Error(`SCRIPT_CARRYOVER_CHARACTER_OUTSIDE_MANIFEST_${id}`); });
                    if (!allowedLocations.has(scene.locationId)) throw new Error(`SCRIPT_LOCATION_OUTSIDE_MANIFEST_${scene.locationId}`);
                    propIds.forEach((id) => { if (!allowedProps.has(id)) throw new Error(`SCRIPT_PROP_OUTSIDE_MANIFEST_${id}`); });
                    return {
                        id: `EP${pad(episode.episode)}_SC${pad(index + 1)}`,
                        episode: episode.episode, sceneNumber: index + 1,
                        locationId: scene.locationId, characterIds, propIds,
                        storyPurpose: scene.storyPurpose || "", action: scene.action || "",
                        dialogue,
                        continuityNotes: scene.continuityNotes || [],
                        continuitySetup: toText(scene.continuitySetup),
                        incidentalSetDressing: uniqueStrings(scene.incidentalSetDressing || []).slice(0, 10),
                        requiredVisibleCharacterIds, carryOverCharacterIds,
                        referencedVisibleTargets: referencedTargets,
                        continuityRevisionReason: "", continuityRevised: false,
                        movementPolicy: actionRequiresLocomotion(scene.action || "") ? "LOCOMOTION" : "STATIC",
                        estimatedDuration: Number(scene.estimatedDuration || 16),
                    };
                }).filter((scene) => scene.locationId && scene.characterIds.length);
                output[episode.episode] = normalized.length ? normalized : buildFallbackEpisodeScript(episode, "AI scenes normalized to empty.");
                setScripts({ ...output });
            }
            setScripts(output);
            setProgress("Continuity Bridge: repairing future-dependent states and missing visible targets...");
            const reconciled = await reconcileScriptContinuity(output);
            const missingEpisodes = episodes.filter((episode) => !(reconciled[episode.episode] || []).length);
            missingEpisodes.forEach((episode) => {
                reconciled[episode.episode] = buildFallbackEpisodeScript(episode, "Continuity Bridge produced no scenes.");
            });
            setScripts(reconciled);
            setStage("scripts");
        } catch (err) { handleError(err); } finally { setBusy(false); setProgress(""); }
	    };
	    const wordsInDialogue = (value) => toText(value).split(/\s+/).filter(Boolean).length;
	    const dialogueWordCount = (dialogue = []) => (dialogue || []).reduce((sum, line) => sum + wordsInDialogue(line?.text), 0);
	    const packDialogueForShotTiming = (dialogue = []) => {
	        const lines = (Array.isArray(dialogue) ? dialogue : []).filter((line) => line?.characterId && toText(line?.text));
	        const packs = [];
	        for (let index = 0; index < lines.length; index++) {
	            const current = lines[index];
	            const next = lines[index + 1];
	            if (next) {
	                const pair = [current, next];
	                if (dialogueWordCount(pair) <= DIALOGUE_DURATION_WORD_LIMITS.medium) {
	                    packs.push(pair);
	                    index += 1;
	                    continue;
	                }
	            }
	            packs.push([current]);
	        }
	        return packs;
	    };
	    const buildDialogueTimingLock = (dialogue = [], durationSeconds = 8) => {
	        const lines = Array.isArray(dialogue) ? dialogue : [];
	        if (!lines.length) return "";
	        const totalWords = dialogueWordCount(lines);
	        const lineSummary = lines.map((line, index) => `LINE_${index + 1}: ${line.characterId}, ${wordsInDialogue(line.text)} words`).join("; ");
	        const pairedRule = lines.length > 1
	            ? ` This shot intentionally contains ${lines.length} dialogue lines in one continuous ${durationSeconds}-second take; perform them in written order with natural turn-taking, no overlap, and no added dialogue.`
	            : "";
	        const durationClass = durationSeconds <= 6
	            ? "Use compact natural delivery: begin speech promptly, keep gestures minimal, finish all words cleanly, then hold a tiny reaction beat."
	            : durationSeconds <= 8
	                ? "Use smooth medium pacing: finish both the exact words and a short reaction beat without rushing or dragging."
	                : "Use the extra duration for restrained emotional reaction after the exact dialogue, not extra words.";
	        return `DIALOGUE_TIMING_LOCK: ${lines.length} line(s), ${totalWords} total word(s). ${lineSummary}.${pairedRule} ${durationClass} Speak like natural everyday conversation, not poetry, narration, preaching, theater monologue, ceremonial speech, or sing-song recitation. Never truncate, swallow, paraphrase, skip, or continue any word past the final frame.`;
	    };
    const buildNaturalSpeechPerformanceLock = (shot) => {
        if (!shot?.dialogue?.length) return "NATURAL SPEECH LOCK: no spoken dialogue in this shot.";
        return joinLines([
            "NATURAL SPEECH LOCK:",
            "- Spoken delivery must sound like grounded everyday Bahasa Indonesia conversation, not a poem, not narration, not a trailer voice, not a ceremonial proclamation, not theatrical recitation.",
            "- Use normal human pauses, breath, and conversational emphasis. Avoid sing-song rhythm, overly smooth dramatic cadence, rhyming, chanting, or exaggerated emotional intonation.",
            "- Characters speak to the visible listener/object/situation, not to an audience. No voice-over tone, no audiobook tone, no stage-play projection.",
            "- Keep volume and pitch restrained and realistic for the distance shown by the camera.",
            "- The exact written words are locked, but the performance should feel like a person talking in the scene, not reading poetic lines.",
        ]);
    };
	    const pickListenerId = (scene, speakerId, protectedIds = []) => {
	        const protectedSet = new Set(protectedIds);
	        return (scene.characterIds || []).find((id) => id !== speakerId && !protectedSet.has(id)) ||
            (scene.characterIds || []).find((id) => id !== speakerId) || null;
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
            const emotion = inferEmotionFromContext(line.text, speaker?.role, shot.action);
            const listenerLines = shot.characterIds.filter((id) => id !== line.characterId).map((id) => {
                const character = characterMap.get(id);
                return `- ${id} (${character?.name || id}): ${inferListenerReaction(character, shot, line.characterId, line.text)}`;
            }).join("\n") || "- NONE";
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
	        checked: false, pass: false, humanCount: 0, identityPass: false, locationPass: false,
	        verticalPass: false, singleFramePass: false, allCharactersVisible: false, framingPass: false,
	        fullFramePass: false, spatialSafetyPass: false, referencedTargetVisiblePass: false, continuityPresencePass: false,
	        positionContinuityPass: false, propAppearancePass: false, wardrobeContinuityPass: false,
	        anatomyPass: false, headDirectionPass: false, stateContinuityPass: false, dialogueEyelinePass: false,
	        imageWidth: 0, imageHeight: 0, issues: [],
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
    const buildShotCameraPlan = ({ episodeNumber = 1, shotNumber = 1, humanCount = 0, movementMode = "STATIC", shotKind = "", action = "" }) => {
        const frameText = aspectRatioFrameDescription(projectAspectRatio);
        if (/opening/i.test(shotKind) && Number(episodeNumber) === 1) {
            return inferDeterministicCamera(humanCount, movementMode);
        }
        const seed = stableHashNumber(`${episodeNumber}|${shotNumber}|${humanCount}|${movementMode}|${shotKind}|${action}`);
        const angle = pickStable([
            "three-quarter side angle from the action side, not straight-on frontal",
            "profile-biased conversational angle with faces readable",
            "slight over-the-shoulder angle including speaker/listener relationship",
            "prop-side observer angle that keeps hands/object interaction readable",
            "rear three-quarter listener-inclusive angle without hiding faces",
            "diagonal room-axis angle preserving the latest continuity layout",
        ], seed);
        const movement = movementMode === "LOCOMOTION"
            ? "mostly locked-off with a small pan only if needed to keep the moving actor in frame"
            : pickStable([
                "locked-off camera with only natural handheld breath",
                "very small lateral drift, no forward dolly",
                "gentle pan between speaker and listener, no push-in",
                "subtle rack focus or micro-reframe, no camera travel",
                "static observer frame, let actor blocking carry the beat",
            ], Math.floor(seed / 11));
        const size = humanCount >= 4
            ? `wide ${frameText} ensemble`
            : humanCount >= 2
                ? `medium-wide ${frameText} relational shot`
                : humanCount === 1
                    ? `medium-full ${frameText} character/action shot`
                    : `wide ${frameText} location shot`;
        const continuity = Number(episodeNumber) > 1
            ? "Start from the latest approved anchor/camera axis; do not reset to a new front-facing intro angle."
            : "Episode 1 may establish the space, but avoid repeating the exact same frontal camera grammar on every shot.";
        return `${size}; ${angle}; ${movement}. ${continuity}`;
    };
	    const inferShotDuration = ({ shotKind = "", action = "", dialogue = [], movementMode = "STATIC" }) => {
	        const raw = `${shotKind} ${toText(action)} ${(dialogue || []).map((line) => line.text).join(" ")}`.toLowerCase();
	        const dialogueWords = (dialogue || []).reduce((sum, line) => sum + wordsInDialogue(line?.text), 0);
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
	    const buildLocalShot = ({ episode, scene, shotNumber, action, dialogue = [], movementMode = "STATIC", movingCharacterIds = [], explicitCharacterIds = [], referencedVisibleTargetIds = [], extraNotes = [], shotKind = "BEAT", allowEmptyCast = false, cameraOverride = "" }) => {
	        const dialogueSpeakerIds = normalizeIdList(dialogue.map((line) => line.characterId));
	        const dialogueTargetIds = normalizeIdList(dialogue.map((line) => line.targetCharacterId));
	        const sceneReferencedIds = normalizeVisibleTargets(scene.referencedVisibleTargets).map((target) => target.characterId);
	        const referencedIds = mergeIdLists(referencedVisibleTargetIds, dialogue.length ? sceneReferencedIds : [], dialogueTargetIds);
	        const mustRemainVisibleIds = mergeIdLists(scene.requiredVisibleCharacterIds, scene.carryOverCharacterIds, referencedIds, dialogueTargetIds);
	        let characterIds = mergeIdLists(explicitCharacterIds, dialogueSpeakerIds, dialogueTargetIds, mustRemainVisibleIds);
	        if (dialogueSpeakerIds.length && !dialogueTargetIds.length) {
	            const listenerId = pickListenerId(scene, dialogueSpeakerIds[0], characterIds);
	            if (listenerId) characterIds = mergeIdLists(characterIds, [listenerId]);
	        }
	        if (!allowEmptyCast && !dialogue.length && characterIds.length === 0) characterIds = normalizeIdList(scene.characterIds);
        characterIds.forEach((id) => { if (!(scene.characterIds || []).includes(id)) throw new Error(`LOCAL_SHOT_CHARACTER_OUTSIDE_SCENE_${scene.id}_${id}`); });
        mustRemainVisibleIds.forEach((id) => { if (!(scene.characterIds || []).includes(id)) throw new Error(`LOCAL_SHOT_REQUIRED_VISIBLE_OUTSIDE_SCENE_${scene.id}_${id}`); });
        const missingProtected = mergeIdLists(mustRemainVisibleIds, dialogueSpeakerIds).filter((id) => !characterIds.includes(id));
        if (missingProtected.length) throw new Error(`CONTINUITY_BLOCKED_PROTECTED_CHARACTER_MISSING_${scene.id}: ${missingProtected.join(",")}`);
        const sourceAllowsLocomotion = scene.movementPolicy === "LOCOMOTION" && actionRequiresLocomotion(scene.action);
        const finalMovementMode = movementMode === "LOCOMOTION" && sourceAllowsLocomotion ? "LOCOMOTION" : "STATIC";
        const finalMovingIds = finalMovementMode === "LOCOMOTION" ? normalizeIdList(movingCharacterIds).filter((id) => characterIds.includes(id)) : [];
        const stationaryIds = characterIds.filter((id) => !finalMovingIds.includes(id));
        const motionNote = finalMovementMode === "STATIC"
            ? "MOTION_LOCK: all listed characters are already at their Scene Anchor coordinates before frame 1; no walking, entering, exiting, approaching, crossing, pacing, stepping or repositioning."
            : `MOTION_SAFETY: only ${finalMovingIds.join(", ") || "explicitly moving cast"} may locomote. ${stationaryIds.join(", ") || "All other cast"} stay spatially anchored. Movement uses only a visibly clear path; no clipping or passing through furniture, walls, people or props.`;
        const presenceNote = mustRemainVisibleIds.length ? `PRESENCE_LOCK: ${mustRemainVisibleIds.join(", ")} must remain visible and physically present for this entire shot; no disappearance, off-screen removal or re-entry.` : "";
        const referenceNote = referencedIds.length ? `REFERENCED_TARGET_LOCK: ${referencedIds.join(", ")} are referenced by dialogue/context and must be visually readable in the same shot.` : "";
        const stateNote = toText(scene.continuitySetup) ? `STATE_LOCK: ${toText(scene.continuitySetup)}` : "";
        return {
            id: `EP${pad(episode.episode)}_SH${pad(shotNumber)}`,
            episode: episode.episode, sceneId: scene.id, shotNumber,
            characterIds, locationId: scene.locationId, propIds: normalizeIdList(scene.propIds),
            expectedHumanCount: characterIds.length,
	            camera: cameraOverride || buildShotCameraPlan({
                episodeNumber: episode.episode,
                shotNumber,
                humanCount: characterIds.length,
                movementMode: finalMovementMode,
                shotKind,
                action,
            }),
	            shotKind,
	            action: toText(action),
            dialogue: dialogue.map((line) => ({ characterId: line.characterId, targetCharacterId: toText(line.targetCharacterId), text: toText(line.text) })),
            continuitySetup: scene.continuitySetup || "",
            incidentalSetDressing: scene.incidentalSetDressing || [],
            carryOverCharacterIds: normalizeIdList(scene.carryOverCharacterIds),
            mustRemainVisibleIds, referencedVisibleTargetIds: referencedIds,
            movingCharacterIds: finalMovingIds, movementMode: finalMovementMode,
	            continuityNotes: uniqueStrings([...(scene.continuityNotes || []), ...extraNotes, motionNote, presenceNote, referenceNote, stateNote]),
	            durationSeconds: inferShotDuration({ shotKind, action, dialogue, movementMode: finalMovementMode }), videoPrompt: "", anchorImage: null, anchorStatus: "idle",
            qa: makeShotQA(),
            videoStatus: "idle", videoUrl: null, videoRemoteUri: null, operationName: null,
        };
    };
    const generateAllShots = async () => {
        setBusy(true); setError(""); setProgress("Building Shot Manifest locally — no AI request...");
        try {
            const output = [];
	            for (const episode of episodes) {
	                const episodeScenes = scripts[episode.episode];
	                if (!episodeScenes?.length) throw new Error(`SCRIPT_MISSING_EP_${episode.episode}`);
	                let episodeShotNumber = 1;
	                const firstScene = episodeScenes[0];
                    const openingCast = normalizeIdList(firstScene.requiredVisibleCharacterIds?.length ? firstScene.requiredVisibleCharacterIds : firstScene.characterIds);
	                output.push(buildLocalShot({
	                    episode,
	                    scene: {
	                        ...firstScene,
	                        id: `${firstScene.id}_OPENING`,
	                        characterIds: openingCast,
	                        requiredVisibleCharacterIds: openingCast,
	                        carryOverCharacterIds: [],
	                        referencedVisibleTargets: [],
	                        continuityNotes: [],
	                        continuitySetup: "",
	                    },
	                    shotNumber: episodeShotNumber++,
	                    action: `OPENING_ESTABLISH: establish ${locationMap.get(firstScene.locationId)?.name || firstScene.locationId} as the episode opening space. ${toText(episode.openingState)}`,
	                    dialogue: [],
	                    movementMode: "STATIC",
	                    movingCharacterIds: [],
	                    explicitCharacterIds: openingCast,
	                    referencedVisibleTargetIds: [],
	                    shotKind: "OPENING_ESTABLISH",
	                    allowEmptyCast: !openingCast.length,
	                    cameraOverride: openingCast.length
                            ? inferDeterministicCamera(openingCast.length, "STATIC")
                            : `Static wide ${aspectRatioFrameDescription(projectAspectRatio)} establishing opening shot; no humans; readable geography, mood, and story tension`,
	                    extraNotes: [
	                        "EPISODE_OPENING_ESTABLISH: every episode begins with an 8-second establishing opening before character action escalates.",
                            openingCast.length ? `OPENING_CAST_LOCK: ${openingCast.join(", ")} must be visible as the approved opening cast; no unlisted people.` : "NO_HUMAN_OPENING_LOCK: this opening anchor must show the location only with zero visible people.",
	                        `DIRECTOR_MODE: video engine target ${VIDEO_ENGINE_NAME}; make the opening readable, tense, and continuity-safe.`,
	                    ],
	                }));
	                for (const scene of episodeScenes) {
                    const sceneCast = normalizeIdList(scene.characterIds);
                    const requiredIds = mergeIdLists(scene.requiredVisibleCharacterIds, scene.carryOverCharacterIds, normalizeVisibleTargets(scene.referencedVisibleTargets).map((target) => target.characterId));
                    requiredIds.forEach((id) => { if (!sceneCast.includes(id)) throw new Error(`CONTINUITY_REQUIRED_CHARACTER_NOT_IN_SCENE_${scene.id}_${id}`); });
                    const hasLocomotion = scene.movementPolicy === "LOCOMOTION" && actionRequiresLocomotion(scene.action);
                    const dialogue = Array.isArray(scene.dialogue) ? scene.dialogue : [];
                    if (hasLocomotion) {
                        const carryOverSet = new Set(normalizeIdList(scene.carryOverCharacterIds));
                        const movingIds = sceneCast.filter((id) => !carryOverSet.has(id));
                        const locomotionCast = mergeIdLists(requiredIds, movingIds);
                        output.push(buildLocalShot({
                            episode, scene, shotNumber: episodeShotNumber++,
                            action: scene.action, dialogue: [], movementMode: "LOCOMOTION",
                            movingCharacterIds: movingIds, explicitCharacterIds: locomotionCast,
                            referencedVisibleTargetIds: [],
                            extraNotes: [
                                "ARRIVAL_ONLY_SHOT: execute the necessary arrival/position change once. Do not speak dialogue in this locomotion shot.",
                                "After arrival completes, all characters use the resulting positions as the locked starting state of the next shot.",
                            ],
                        }));
	                    }
	                    if (dialogue.length) {
	                        const dialoguePacks = packDialogueForShotTiming(dialogue);
	                        for (let d = 0; d < dialoguePacks.length; d++) {
	                            const dialoguePack = dialoguePacks[d];
	                            const referencedIds = normalizeVisibleTargets(scene.referencedVisibleTargets).map((target) => target.characterId);
	                            const speakerIds = normalizeIdList(dialoguePack.map((line) => line.characterId));
	                            const explicitCast = mergeIdLists(requiredIds, speakerIds, referencedIds);
	                            const staticAction = toText(scene.continuitySetup) || (hasLocomotion
	                                ? "All listed characters are already in their established positions. Preserve the current physical state while the dialogue is delivered."
	                                : scene.action);
	                            const packWordCount = dialogueWordCount(dialoguePack);
	                            const plannedDuration = inferShotDuration({ shotKind: "BEAT", action: staticAction, dialogue: dialoguePack, movementMode: "STATIC" });
	                            const durationNote = packWordCount
	                                ? buildDialogueTimingLock(dialoguePack, plannedDuration)
	                                : "";
	                            output.push(buildLocalShot({
	                                episode, scene, shotNumber: episodeShotNumber++,
	                                action: staticAction, dialogue: dialoguePack.slice(0, MAX_DIALOGUE_LINES_PER_SHOT), movementMode: "STATIC",
	                                movingCharacterIds: [], explicitCharacterIds: explicitCast,
	                                referencedVisibleTargetIds: referencedIds,
	                                extraNotes: [
	                                    "DIALOGUE_STATIC_LOCK: speaking does not grant permission to walk, enter, exit, approach or reposition.",
	                                    dialoguePack.length > 1 ? "TWO_LINE_DIALOGUE_SHOT: keep both dialogue lines in this single shot when timing allows; do not split visually into a new scene or camera cut." : "",
	                                    durationNote,
	                                ],
	                            }));
                        }
                    }
                    if (!dialogue.length && !hasLocomotion) {
                        output.push(buildLocalShot({
                            episode, scene, shotNumber: episodeShotNumber++,
                            action: scene.action, dialogue: [], movementMode: "STATIC",
                            movingCharacterIds: [],
                            explicitCharacterIds: mergeIdLists(requiredIds, sceneCast),
                            referencedVisibleTargetIds: normalizeVisibleTargets(scene.referencedVisibleTargets).map((target) => target.characterId),
                            extraNotes: ["STATIC_ACTION_LOCK: execute only the local action explicitly written in the script; no invented locomotion."],
                        }));
	                    }
	                }
		            }
            setShots(output);
            setSelectedShotId(output[0]?.id || null);
            setStage("shots");
            setProgress(`Built ${output.length} shot(s) locally. No AI request used for Shot Manifest.`);
            window.setTimeout(() => setProgress(""), 2200);
        } catch (err) { handleError(err); setProgress(""); } finally { setBusy(false); }
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

            return [
                `LINE_${index + 1}_SPEAKER_ID: ${speakerId}`,
                `LINE_${index + 1}_TARGET_ID: ${targetLabel}`,
                `LINE_${index + 1}_OBJECT_ID: ${primaryObject?.id || "NONE"}`,
                primaryObject
                    ? `LINE_${index + 1}_BLOCKING: ${speakerId} (${speakerName}) explicitly mentions ${primaryObject.id} (${primaryObject.name}). The performance must read as object-aware speech: speaker primarily looks at or acknowledges ${primaryObject.id} while speaking this line${primaryTargetId ? `, then may briefly glance toward ${primaryTargetId}` : ""}.`
                    : primaryTargetId
                        ? `LINE_${index + 1}_BLOCKING: ${speakerId} (${speakerName}) must address ${primaryTargetId} (${targetName}).`
                        : `LINE_${index + 1}_BLOCKING: ${speakerId} (${speakerName}) has no visible listener in this shot; perform the line as private, grounded self-directed speech toward ${fallbackFocus}, never as narration to the audience.`,
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
            ].join("\n");
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

        return joinLines([
            `ANCHOR_START_SPEAKER_ID: ${firstSpeakerId || "NONE"}`,
            `ANCHOR_START_TARGET_ID: ${anchorTargetLabel}`,
            `ANCHOR_START_EYELINE_HARD_LOCK: frame 1 must already show ${anchorEyelineText}.`,
            "HARD BLOCKING PRIORITY: dialogue eyeline overrides pretty/front-facing composition. The camera is an observer, never the conversational target unless camera-address is explicitly scripted.",
            "FORBIDDEN: all characters facing forward, all faces parallel to camera, speaker staring into lens, listener staring into lens, generic posed group portrait, presenter/interview/selfie staging.",
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
            lines.push(`- FIRST_DIALOGUE_FRAME: ${firstSpeakerId || "speaker"} (${firstSpeakerName}) is already about to speak or has just begun speaking. Mouth may be slightly parted, jaw relaxed, expression matches the line emotion, and body is oriented toward ${firstLineProps[0]?.id || targetId || "the listener/action target"}.`);
            if (targetId) lines.push(`- LISTENER_BLOCKING: ${targetId} (${targetName}) naturally reacts toward ${firstSpeakerId || "the speaker"}; do not make both people stare into the lens.`);
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

    // ========================================================================
    // PER-CHARACTER PHYSICAL STATE CONTRACT (mutually exclusive posture).
    // Seated XOR Standing — tidak boleh ambigu. Source state menang atas
    // posture dari PREVIOUS_CONTINUITY_ANCHOR.
    // ========================================================================
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
            return primaryObject
                ? `LINE_${index + 1} COVERAGE: ${line.characterId} (${speaker?.name || line.characterId}) speaks naturally about ${primaryObject.id} (${primaryObject.name}) from the existing camera angle. Keep their face, eyes, mouth, head direction, hair color, outfit, and hands stable. The speaker must visibly orient their eyeline toward ${primaryObject.id} for the object mention, then may briefly glance toward ${listenerText}; never stare into the lens. Keep ${primaryObject.id} visible/readable in frame if possible. After the final word, hold, gently pan, or rack focus for a natural reaction beat without inventing extra props. Do not force a push-in.`
                : `LINE_${index + 1} COVERAGE: ${line.characterId} (${speaker?.name || line.characterId}) speaks from the current continuity angle; keep their face, eyes, mouth, head direction, hair color, outfit, and hands stable. The speaking eyeline stays on ${listenerText}, never the lens unless scripted. After the final word, hold, gently pan/reframe, or rack focus inside the same continuous shot to ${listenerText} for a readable reaction beat. Do not snap anyone back to a front-facing reference pose. Do not force a push-in.`;
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
REFERENCE_RULE: This ID represents exactly ONE unique person. Preserve the same face, age, ethnicity, hairstyle, skin tone, body proportions, costume and accessories. Never duplicate or clone this person.
`.trim()).join("\n\n") : "NO HUMAN CHARACTER";
        const propText = usedProps.length ? usedProps.map((prop) => `
PROP_ID: ${prop.id}
NAME: ${prop.name}
DESCRIPTION: ${prop.description || ""}
APPEARANCE: ${prop.appearance || ""}
`.trim()).join("\n\n") : "NONE";
        const dialogueText = shot.dialogue?.length ? shot.dialogue.map((line) => {
            const speaker = characterMap.get(line.characterId);
            return `${line.characterId} (${speaker?.name || line.characterId}): "${toText(line.text)}"`;
        }).join("\n") : "NO SPOKEN DIALOGUE";
        const dialogueSpeakerIds = normalizeIdList((shot.dialogue || []).map((line) => line.characterId));
        const silentCharacterIds = shot.characterIds.filter((id) => !dialogueSpeakerIds.includes(id));
        const dialogueSpeakerLockText = shot.dialogue?.length ? shot.dialogue.map((line, index) => {
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
        }).join("\n\n") : "NO DIALOGUE SPEAKER LOCK — no spoken dialogue in this shot.";
	        const silentCharacterText = silentCharacterIds.length ? silentCharacterIds.map((id) => `${id} (${characterMap.get(id)?.name || id})`).join(", ") : "NONE";
	        const expressionContinuationPlanText = buildExpressionContinuationPlan(shot);
	        const dialogueBlockingPlanText = buildDialogueBlockingPlan(shot);
        const objectAttentionPlanText = buildObjectAttentionPlan(shot);
        const dialogueTimingLockText = buildDialogueTimingLock(shot.dialogue || [], shot.durationSeconds || 8);
        const naturalSpeechLockText = buildNaturalSpeechPerformanceLock(shot);
        const cinematicCoveragePlanText = buildCinematicDialogueCoveragePlan(shot);
	        const continuityText = shot.continuityNotes?.length ? shot.continuityNotes.map((item) => `- ${toText(item)}`).join("\n") : "- Maintain established continuity from previous continuity shots.";
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
        const movingCharacterText = shot.movingCharacterIds?.length ? shot.movingCharacterIds.map((id) => `${id} (${characterMap.get(id)?.name || id})`).join(", ") : "NONE";
        const motionConstraintText = shot.movementMode === "LOCOMOTION"
            ? `MOTION_MODE: EXPLICIT_LOCOMOTION\nMOVING_CHARACTER_IDS: ${movingCharacterText}\n- ONLY the listed MOVING_CHARACTER_IDS may change world position.\n- All other visible characters remain anchored at their Scene Anchor coordinates and continue their established activity/state.\n- All furniture, carts/gerobak, vehicles, doors, windows, counters, locked props, and ordinary set dressing stay fixed unless ACTION explicitly moves them.\n- Locomotion is permitted ONLY because the locked source action explicitly requires it.\n- Follow only a visibly clear, physically walkable floor path.\n- Never intersect, clip through, phase through, merge with, or pass through a table, chair, bench, wall, pillar, door panel, counter, vehicle, prop or another person.\n- Pass through a doorway only through its visibly open gap.\n- Keep feet attached to the floor/ground plane with natural steps; no foot sliding or teleporting.\n- Maintain realistic body clearance around furniture and people.\n- If the intended route is blocked, STOP before the obstacle rather than passing through it.\n- Do not invent additional walking beyond the exact action.\n- Movement must stay WITHIN THE SAME LOCATION (${location.id}). Do not let the moving character exit the shot and arrive somewhere else.`
            : `MOTION_MODE: STATIC_POSITION_LOCK\nMOVING_CHARACTER_IDS: NONE\n- Every character is already at the approved Scene Anchor position before frame 1.\n- Character screen/world positions are locked for the full shot.\n- NO walking. NO stepping. NO entering. NO exiting. NO approaching. NO crossing the frame. NO repositioning.\n- Do not make actors move merely because dialogue occurs.\n- Do not create automatic pacing, body travel or cinematic blocking.\n- Only local action explicitly required by ACTION is allowed, such as lip movement, blinking, chewing, eating with a spoon, a small hand action or subtle facial expression.\n- Local action must not change the actor's standing/seated location.\n- If a character is eating, the seated body position remains fixed while only the hand/spoon/mouth perform minimal natural eating motion.\n- The camera must not reinterpret STATIC_POSITION_LOCK as permission to make characters travel.`;
        return `
	MICRODRAMA VIDEO GENERATION PROMPT
	VIDEO_ENGINE: ${VIDEO_ENGINE_NAME}
	SHOT_ID: ${shot.id}
	SHOT_KIND: ${shot.shotKind || "BEAT"}
	EPISODE: ${shot.episode}
	SCENE_ID: ${shot.sceneId}
	VIDEO_LENGTH: ${shot.durationSeconds || 8} seconds
	ASPECT_RATIO: ${projectAspectRatio} (${aspectRatioOrientationLabel(projectAspectRatio)}, LOCKED)
	DIRECTOR_MODE_DURATION_POLICY:
	- 6 seconds = short spoken dialogue or simple action.
	- 8 seconds = medium dialogue, establishing opening shot, or chained interaction.
	- 10 seconds = long dialogue, intense action, or intense emotion.
		- 12 seconds = very long dialogue or story action that genuinely needs extra suspense.
		- Dialogue timing has priority over decorative movement: every spoken line must finish naturally and leave a short reaction beat.
		- This shot must use exactly VIDEO_LENGTH above; do not stretch into a multi-scene mini-movie.
		- End on the last natural pose/reaction. Never reset characters to the first-frame/reference pose at the end.
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
- If the previous continuity anchor shows a narrow alley with the cart/gerobak in that alley, the next same-location anchor must still be that same alley segment, not a new teal-wall doorway or different interior-adjacent spot.
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
EXPECTED_HUMAN_COUNT: ${shot.expectedHumanCount}
Exactly ${shot.expectedHumanCount} visible human character(s) may appear in the entire shot.
Allowed Character IDs: ${shot.characterIds.join(", ") || "NONE"}.
Each listed Character ID appears exactly once.
FORBIDDEN: extra people, background actors, crowds, passersby, duplicate characters, clones, human reflections, people visible through doors/mirrors/glass/windows unless explicitly listed.
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
	CAMERA_LOCK: ONE camera only. ONE continuous in-location setup or one motivated continuous movement. NO cuts to another place, NO time jump, NO montage, NO continuity reset. Dialogue shots may hold, pan, tilt, rack focus, gently reframe, or drift subtly from speaker to listener reaction inside ${location.id}; push-in is optional and rare, never automatic. Camera stays inside ${location.id} for the entire ${shot.durationSeconds || 8} seconds.
	CAMERA_VARIATION_LOCK: Do not default to the same straight-front shot moving toward the character. Use the CAMERA line and DIRECTOR COVERAGE PLAN for varied but continuity-safe angle behavior. Episode > 1 continues from the latest anchor/camera position instead of starting over from the front.
	ACTION: ${toText(shot.action)}
	DIRECTOR COVERAGE PLAN:
	${cinematicCoveragePlanText}
	DIALOGUE:
${dialogueText}
==================================================
DIALOGUE SPEAKER / LIP-SYNC LOCK
==================================================
DIALOGUE_SPEAKER_IDS: ${dialogueSpeakerIds.join(", ") || "NONE"}
SILENT_CHARACTER_IDS: ${silentCharacterText}
${dialogueSpeakerLockText}
	GLOBAL SPEECH PERFORMANCE RULES:
    ${naturalSpeechLockText}
	${dialogueTimingLockText || "- No spoken dialogue timing required."}
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
FACIAL EXPRESSION / EMOTION LOCK
==================================================
- Facial expression must be driven only by the locked ACTION, the exact DIALOGUE content, and the role relationship already established in the script.
- Use restrained, believable, human micro-expressions rather than exaggerated melodrama.
- Do not invent a new emotional beat that is not supported by the script.
- Do not add smiling, laughing, crying, shock, panic, romance, flirtation, rage, or fear unless the locked action/dialogue clearly requires it.
- The speaking character may show only the expression appropriate to the spoken line.
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
	- Preserve a short residual facial expression that naturally follows the spoken line.
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
	- Preserve the exact wording exactly as written in DIALOGUE.
	- Do not translate, paraphrase, or swap words into another language.
	- Pronunciation, diction, mouth articulation, and lip movement must support natural spoken ${regionProfile.language}.
	- Preserve character name pronunciation naturally and consistently for ${regionProfile.country}.
	- If a character is not the designated speaker, do not let that character appear to mouth words incorrectly or accidentally.
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
	- Preserve natural finger count and hand structure: five fingers per visible hand unless occluded by natural perspective. No fused fingers, extra fingers, missing fingers, melted hands, warped knuckles, or duplicated hands.
	- Preserve locked wardrobe/clothing shape, color, pattern, sleeve length, collar, fabric, accessories, and fit. Do not change a shirt/dress/jacket into a different garment during motion.
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
- Do not introduce another character.
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
- Dialogue Speaker / Lip-Sync Lock is mandatory.
- Only the correct designated speaker may speak each line.
- Silent characters must remain silent.
- Region Language / Articulation Lock is mandatory.
- Facial Expression / Emotion Lock is mandatory.
- Post-Dialogue Expression Continuation Plan is mandatory.
- Keep camera behavior restrained and consistent with CAMERA.
- MovementMode and MOTION + PHYSICAL COLLISION LOCK override generic cinematic camera/style language.
- Never invent locomotion from dialogue, emotion, visual style, camera style or scene energy.
- Never allow a body or limb to pass through a solid object.
- Respect locked prop identity exactly, including color, stripe/check/print/logo/marking pattern, material, texture, dirt/wear, and distinctive details.
- Open/closed/lid angle/contents visibility/handling orientation may change when the current ACTION or continuity explicitly requires it; keep the same prop identity while showing that new state.
- Never turn a patterned/striped/checkered/printed locked prop into a plain solid-color prop during video motion.
- No random text.
- No watermark.
- Photorealistic live-action microdrama.
The Shot Manifest is authoritative.
SINGLE LOCATION LOCK, persistent presence, continuity setup, motion lock, and locked production data override generative interpretation.
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
        const dialogueSpeakerIds = normalizeIdList((shot.dialogue || []).map((line) => line.characterId));
        const silentIds = (shot.characterIds || []).filter((id) => !dialogueSpeakerIds.includes(id));
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
	                return `${index + 1}. ${line.characterId} (${speaker?.name || line.characterId}) says exactly: "${limitText(line.text, 420)}"`;
	            }).join("\n")
	            : "No spoken dialogue. No character may appear to speak.";
	        const dialogueBlockingPlanText = buildDialogueBlockingPlan(shot);
        const objectAttentionPlanText = buildObjectAttentionPlan(shot);
        const objectApproachPlan = buildObjectApproachPlan(shot);
        const objectApproachPlanText = objectApproachPlan.text;
        const objectApproachMoverIds = objectApproachPlan.moverIds;
        const dialogueTimingLockText = buildDialogueTimingLock(shot.dialogue || [], shot.durationSeconds || 8);
        const naturalSpeechLockText = buildNaturalSpeechPerformanceLock(shot);
        const cinematicCoveragePlanText = buildCinematicDialogueCoveragePlan(shot);
	        const continuityLines = [
            limitText(shot.continuitySetup || "Maintain the state shown in the approved first-frame anchor.", 700),
            ...(shot.continuityNotes || []).slice(0, 5).map((item) => limitText(item, 260)),
        ].filter(Boolean).map((item) => `- ${item}`).join("\n");
        const setDressingLines = shot.incidentalSetDressing?.length
            ? shot.incidentalSetDressing.slice(0, 5).map((item) => `- ${limitText(item, 160)}`).join("\n")
            : "- Keep ordinary set dressing from the first frame; do not make it story-important.";
        const motionLines = shot.movementMode === "LOCOMOTION"
            ? joinLines([
                `Movement mode: explicit locomotion for ${mergeIdLists(shot.movingCharacterIds || [], objectApproachMoverIds).join(", ") || "the scripted moving character only"}.`,
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
                    : "Only local action is allowed: speaking mouth, blinking, breathing, subtle hand/action required by ACTION.",
            ]);
        const basePrompt = `
MODEL-ADAPTIVE OPENROUTER IMAGE-TO-VIDEO PROMPT
Target model: ${profile.name} (${modelId})
Prompt profile: ${profile.style}
Shot: ${shot.id} / Episode ${shot.episode} / ${shot.durationSeconds || 8} seconds / ${aspectRatioFrameDescription(projectAspectRatio)} / ${videoResolution}

	FIRST-FRAME AUTHORITY:
	The attached anchor image is frame 1 and the visual source of truth. Start exactly from that frame, but do not freeze it. Acting, breathing, eyeline, expression, lip movement, and camera life begin immediately on frame 1. Preserve room/set geometry, screen-left/screen-right layout, faces, wardrobe, props, lighting, and physical positions.
	
	ONE-SHOT LOCK:
	One continuous live-action take in exactly one location. No montage, transition, flashback, second room, second street, new building, new time of day, or camera jump to a different continuity. Motivated in-location camera behavior is allowed for dialogue coverage: locked-off hold, pan, tilt, rack focus, gentle reframe, small lateral drift, or rare subtle push-in only if the CAMERA line explicitly supports it. The background remains the same physical space for the full clip.
	Camera movement should NOT default to straight-front push-in. For Episode 2 and later, begin from the latest approved anchor/camera axis and continue that spatial viewpoint unless ACTION explicitly relocates the scene.

LOCATION:
ID ${location.id}: ${location.name}
Description: ${limitText(location.description, 420)}
Architecture/furniture: ${limitText([location.architecture, location.furniture].filter(Boolean).join("; "), 520)}
Lighting/colors: ${limitText([location.lighting, location.colors].filter(Boolean).join("; "), 260)}

CAST LOCK:
Expected human count: ${shot.expectedHumanCount}. Allowed character IDs: ${(shot.characterIds || []).join(", ") || "NONE"}.
${castLines}
Each listed character appears once only. No extra people, no duplicate characters, no background actors.
Must remain visible/readable: ${mustRemainVisibleIds.join(", ") || "NONE"}.

	PROPS:
	${propLines}
	Prop appearance lock: preserve each listed prop's exact color, stripe/check/print/logo/marking pattern, material, texture, dirt/wear, and distinctive details from the first frame/reference. Patterned props must not become plain solid-color props.
		Prop state flexibility: do NOT freeze the prop 1:1 to the asset's neutral state. If the shot requires the same locked prop to become open, partially open, lid-up, contents-visible, lifted, tilted, pointed, carried, or otherwise actively used, preserve the same prop identity while rendering that required action state.
	Incidental set dressing:
${setDressingLines}

	SHOT EXECUTION:
	Camera: ${limitText(shot.camera, 500)}
	Action: ${limitText(shot.action, 900)}
	Cinematic coverage:
	${limitText(cinematicCoveragePlanText, 1200)}
	Final frame lock: end on the last natural pose, head direction, gaze, hand placement, and facial reaction from the action/dialogue. Do not return to the first frame, do not face everyone forward again, and do not freeze into the character reference pose.
	Continuity state:
${continuityLines || "- Continue directly from the attached first frame."}

	DIALOGUE AND LIP SYNC:
	${dialogueLines}
    ${naturalSpeechLockText}
	${dialogueTimingLockText || "No spoken dialogue timing required."}
	Dialogue language: ${regionProfile.language}. Keep wording exactly. Only the named speaker may move their mouth for a line.
Speaker IDs: ${dialogueSpeakerIds.join(", ") || "NONE"}.
Silent IDs: ${silentIds.join(", ") || "NONE"}. Silent characters keep mouths closed except natural breathing or ongoing action.
Dialogue blocking / eyeline:
${dialogueBlockingPlanText}

	MOTION AND PHYSICS:
	${motionLines}
	Natural anatomy, stable faces, stable hands, five natural fingers per visible hand, realistic limbs, believable contact with floor/furniture/props. Preserve face shape, hair color/style, wardrobe color/pattern/shape, head direction, and listener eyeline continuity.

STYLE:
Photorealistic ${aspectRatioFrameDescription(projectAspectRatio)} microdrama, restrained real acting, natural phone-video/live-action realism. ${limitText(project.visualStyle, 500)}

NEGATIVE LOCKS:
	No opening freeze. No dead still-image pause. No default front-facing push-in. No repeated straight-front intro angle after Episode 1. No poetic/puisi speech delivery. No narrator voice. No sing-song cadence. No theatrical monologue. No ending reset to reference pose. No final snap back to front-facing. No new story event. No scene change. No new location. No new human. No crowds. No animals. No random text. No watermark. No subtitle. No cut to another location/time. No character disappearance. No prop swap. No prop color/pattern/material change. No patterned prop becoming plain. No extra hero prop. No duplicate chest or duplicate container. No invented story-important object. No mirrored room. No changed outfit/clothing color/clothing shape. No changed face/face shape/hair color/hair style/head direction logic. No camera-stare during object-referenced dialogue. No warped hands, missing fingers, extra fingers, or fused fingers. No changed age. No changed ethnicity. No extra dialogue. No narration. No gore or explicit unsafe detail.

FINAL PRIORITY ORDER:
1 attached first-frame anchor
2 exact cast and human count
3 exact location and layout
4 exact action and dialogue
5 continuity state and motion rules
`.trim();
        if (basePrompt.length <= profile.targetChars) return basePrompt;

        const compactPrompt = `
OPENROUTER IMAGE-TO-VIDEO PROMPT FOR ${profile.name}
${shot.id}, ${shot.durationSeconds || 8}s, ${aspectRatioFrameDescription(projectAspectRatio)}, ${videoResolution}.
${profile.style}

	Use the attached anchor image as exact frame 1, but begin motion immediately. No frozen-image pause. Preserve location geometry, lighting, faces, hair color/style, outfits, props, screen-left/screen-right layout, and starting body positions.

ONE continuous take in ONE location only: ${location.id} (${location.name}). No cuts, no montage, no second angle, no second room/street/building, no time jump, no new weather or lighting.

Allowed humans (${shot.expectedHumanCount}): ${(shot.characterIds || []).join(", ") || "NONE"}.
${castLines}
No extra people, duplicates, crowds, passersby, reflections, or silhouettes.
Must stay visible: ${mustRemainVisibleIds.join(", ") || "NONE"}.

	Camera: ${limitText(shot.camera, 360)}
	Action: ${limitText(shot.action, 620)}
	Coverage: ${limitText(cinematicCoveragePlanText, 850)}
	Final: keep the last natural pose/reaction/head direction/gaze; no reset to first frame or front-facing reference pose.
	Dialogue:
	${dialogueLines}
    ${limitText(naturalSpeechLockText, 520)}
	${dialogueTimingLockText || "No spoken dialogue timing required."}
	Language: ${regionProfile.language}. Exact words only. Only named speaker lip-syncs. Silent: ${silentIds.join(", ") || "NONE"}.
Eyeline/blocking: ${limitText(dialogueBlockingPlanText, 900)}

Location: ${limitText([location.name, location.description, location.architecture, location.furniture].filter(Boolean).join("; "), 700)}
	Props: ${usedProps.length ? usedProps.map((prop) => `${prop.id} ${prop.name}`).join(", ") : "none story-important"}.
	Prop lock: preserve exact prop color, pattern/stripes/checks/prints/logos/markings, material, texture, wear, and distinctive identity; no patterned prop becomes plain. Do not freeze the prop 1:1 to the neutral asset state: if the shot requires opening/closing/tilting/contents-visible/handled state, keep the same prop identity while rendering the required new state.
	Continuity: ${limitText([shot.continuitySetup, ...(shot.continuityNotes || [])].filter(Boolean).join(" "), 1000)}

Motion: ${shot.movementMode === "LOCOMOTION" ? `Only ${(shot.movingCharacterIds || []).join(", ") || "scripted mover"} may move position; everyone else stays anchored.` : "Static position lock; no walking, entering, exiting, approaching, crossing, pacing, or repositioning."}
No clipping through furniture/walls/props/people. Stable anatomy, faces, hands, feet, and body contact.

Photorealistic restrained microdrama. No default front-facing push-in; vary camera behavior according to the locked Camera/Coverage lines while preserving latest continuity. No poetic speech, no narrator voice, no theatrical recitation. No new story, no new people, no scene change, no prop swap, no changed face/outfit, no extra dialogue, no random text, no watermark.
`.trim();
        return clampVideoPrompt(compactPrompt, profile.targetChars);
    };
    const compileAllVideoPrompts = () => {
        setBusy(true); setError(""); setProgress("Compiling master prompts locally — no AI request...");
        try {
            const output = shots.map((shot) => ({ ...shot, videoPrompt: compileMasterPrompt(shot) }));
            setShots(output);
            setSelectedShotId((current) => current || output[0]?.id || null);
            setStage("render");
            setProgress(`Compiled ${output.length} master prompt(s) locally. No API request used.`);
            window.setTimeout(() => setProgress(""), 1800);
        } catch (err) { handleError(err); setProgress(""); } finally { setBusy(false); }
    };
    const ensureShotVideoPrompt = (shot) => {
        const repaired = repairShotForRuntime(shot);
        if (!repaired) throw new Error("SHOT_NOT_FOUND");
        if (repaired.videoPrompt) return repaired;
        const compiledPrompt = compileMasterPrompt(repaired);
        const compiledShot = { ...repaired, videoPrompt: compiledPrompt };
        setShots((prev) => prev.map((item) => item.id === compiledShot.id ? { ...item, ...compiledShot } : item));
        return compiledShot;
    };
    const formatShotDialogueForEdit = (shot) => (shot?.dialogue || [])
        .map((line) => `${line.characterId}: ${toText(line.text)}`)
        .join("\n");
    const parseShotDialogueFromEdit = (value, baseDialogue = []) => {
        return String(value || "").split("\n").map((row, index) => {
            const trimmed = row.trim();
            if (!trimmed) return null;
            const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
            const fallback = baseDialogue[index] || baseDialogue[0] || {};
            return {
                characterId: match ? match[1] : fallback.characterId,
                targetCharacterId: toText(fallback.targetCharacterId),
                text: match ? match[2] : trimmed,
            };
        }).filter((line) => line && line.characterId && toText(line.text));
    };
    const generateDialogueForSelectedShot = async () => {
        if (!selectedShot) return;
        setBusy(true);
        setError("");
        try {
            const visibleIds = normalizeIdList(selectedShot.characterIds || []);
            if (!visibleIds.length) throw new Error("DIALOGUE_REQUIRES_VISIBLE_CHARACTER");
            const visibleCharacters = visibleIds.map((id) => {
                const character = characterMap.get(id);
                return {
                    id,
                    name: character?.name || id,
                    role: character?.role || "",
                    description: character?.description || "",
                };
            });
            const episodeScript = scripts[selectedShot.episode] || [];
            const scene = episodeScript.find((item) => item.id === selectedShot.sceneId) || null;
            setProgress(`Generating dialogue for ${selectedShot.id}...`);
            const result = await withCreditMeter(`Auto Dialogue ${selectedShot.id}`, "text", () => callJSON(`
ROLE: You are a microdrama dialogue writer.

PROJECT:
TITLE: ${project.title}
GENRE: ${project.genre}
COUNTRY: ${regionProfile.country}
LANGUAGE: ${regionProfile.language}
PREMISE: ${project.premise}

SHOT:
SHOT_ID: ${selectedShot.id}
EPISODE: ${selectedShot.episode}
LOCATION: ${selectedShot.locationId}
ACTION: ${selectedShot.action}
SHOT_KIND: ${selectedShot.shotKind || "BEAT"}
DURATION_SECONDS: ${selectedShot.durationSeconds || 8}
MOVEMENT_MODE: ${selectedShot.movementMode || "STATIC"}

VISIBLE APPROVED CHARACTERS:
${JSON.stringify(visibleCharacters, null, 2)}

SCENE CONTEXT:
${scene ? JSON.stringify({
    objective: scene.objective || "",
    action: scene.action || "",
    continuitySetup: scene.continuitySetup || "",
    continuityNotes: scene.continuityNotes || [],
    existingDialogue: scene.dialogue || [],
}, null, 2) : "No separate scene context available."}

HARD RULES:
- Write natural ${regionProfile.language} only.
- Use ONLY visible approved character IDs.
- Maximum ${MAX_DIALOGUE_LINES_PER_SHOT} dialogue lines.
- Keep dialogue short enough to finish naturally inside ${selectedShot.durationSeconds || 8} seconds.
- Do not invent new characters, locations, props, facts, powers, events, or backstory.
- Dialogue must support the exact existing action and story context, not replace it.
- Each line must have characterId, targetCharacterId, and text.
- targetCharacterId must be another visible character when the speaker is addressing someone.
- Use targetCharacterId "" only for self-talk, narration-like muttering, or direct-to-camera when clearly justified.
- Do not repeat information unnaturally.
- No markdown.

RETURN EXACT JSON:
{
  "dialogue": [
    { "characterId": "", "targetCharacterId": "", "text": "" }
  ]
}
`, [], 0.2, 2));
            const allowed = new Set(visibleIds);
            const dialogue = (Array.isArray(result?.dialogue) ? result.dialogue : [])
                .map((line) => ({
                    characterId: toText(line?.characterId),
                    targetCharacterId: toText(line?.targetCharacterId),
                    text: toText(line?.text),
                }))
                .filter((line) => line.characterId && allowed.has(line.characterId) && line.text)
                .slice(0, MAX_DIALOGUE_LINES_PER_SHOT)
                .map((line) => ({
                    ...line,
                    targetCharacterId: line.targetCharacterId && allowed.has(line.targetCharacterId) && line.targetCharacterId !== line.characterId
                        ? line.targetCharacterId
                        : "",
                }));
            if (!dialogue.length) throw new Error("AUTO_DIALOGUE_EMPTY");
            setShots((prev) => prev.map((item) => {
                if (item.id !== selectedShot.id) return item;
                const durationSeconds = inferShotDuration({
                    shotKind: item.shotKind,
                    action: item.action,
                    dialogue,
                    movementMode: item.movementMode,
                });
                return { ...item, dialogue, durationSeconds, videoPrompt: "" };
            }));
            setProgress(`Dialogue generated for ${selectedShot.id}. Edit if needed, then press SAVE DIALOGUE.`);
            window.setTimeout(() => setProgress(""), 2600);
        } catch (err) {
            handleError(err);
            setProgress("");
        } finally {
            setBusy(false);
        }
    };
    const saveSelectedShotDialogue = async () => {
        if (!selectedShot) return;
        setProgress(`Saving dialogue for ${selectedShot.id}...`);
        try {
            await saveProjectNow({ silent: false });
            setProgress(`Dialogue ${selectedShot.id} saved.`);
            window.setTimeout(() => setProgress(""), 1800);
        } catch (err) {
            handleError(err);
            setProgress("");
        }
    };

    const updateSelectedShotDialogueText = (value) => {
        if (!selectedShotId) return;
        setShots((prev) => prev.map((item) => {
            if (item.id !== selectedShotId) return item;
            const dialogue = parseShotDialogueFromEdit(value, item.dialogue || []);
            const durationSeconds = inferShotDuration({
                shotKind: item.shotKind,
                action: item.action,
                dialogue,
                movementMode: item.movementMode,
            });
            const updatedShot = { ...item, dialogue, durationSeconds };
            return { ...updatedShot, videoPrompt: item.videoPrompt ? compileMasterPrompt(updatedShot) : item.videoPrompt };
        }));
    };
    const isContinuityAnchorCandidate = (shot) => (
        shot?.shotKind !== "OPENING_ESTABLISH" &&
        !String(shot?.sceneId || "").endsWith("_OPENING")
    );
    const getPreviousContinuityShotFor = (targetShot, shotPool = shots) => {
        if (!isContinuityAnchorCandidate(targetShot)) return null;
        return [...shotPool]
            .filter((item) => item.id !== targetShot.id &&
                isContinuityAnchorCandidate(item) &&
                Number(item.episode) === Number(targetShot.episode) &&
                Number(item.shotNumber || 0) < Number(targetShot.shotNumber || 0) &&
                item.locationId === targetShot.locationId &&
                item.anchorImage)
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
        if (!sourceShot?.anchorImage) return false;
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
        const lower = actionText.toLowerCase();
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
    const buildPropSpatialLockText = (shot, generationContext: any = {}) => {
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
        const exactHumanCountLock = castCount > 0
            ? `EXACT HUMAN COUNT LOCK:\n- Render EXACTLY ${castCount} visible human(s): ${shot.characterIds.join(", ")}.\n- Do not render ${Math.max(0, castCount - 1)} humans, fewer humans, extra humans, duplicate humans, partial edge humans, or implied off-screen humans.\n- Every listed character must be fully inside the ${projectAspectRatio} frame at the same moment.\n- If ${castCount} people do not fit, use an EXTREME-WIDE ${aspectRatioFrameDescription(projectAspectRatio)} ensemble angle and zoom out; never crop left/right edge characters.`
            : "EXACT HUMAN COUNT LOCK:\n- Render zero humans. No silhouettes, reflections, crowds, or passersby.";
        const framingInstruction = castCount >= 4
            ? `LARGE ENSEMBLE FRAMING (${castCount} characters):\n- This is a LARGE GROUP COMPOSITION containing ALL ${castCount} listed characters simultaneously.\n- Every listed character must be inside the SAME single ${projectAspectRatio} frame at the same moment.\n- Use a WIDE or EXTREME-WIDE ensemble composition; zoom OUT aggressively until everyone fits comfortably.\n- All bodies may be shown head-to-toe or knees-up; cropping is only acceptable on non-critical body parts (never on heads, faces, or hands in action).\n- Arrange the group in a natural staggered formation (foreground/midground/background layers) so every face is readable.\n- Do NOT line everyone up in a single flat row if that reduces face readability; use depth layers.\n- Keep visible separation between bodies so one actor does not hide another actor's face.\n- Every face must be unobstructed and readable.\n- Leave safe breathing room around the group: approximately 6-10% margin from the top, left, right and bottom edges.\n- If the intended CAMERA instruction is too tight, ignore it and widen the camera to fit everyone instead.`
            : castCount >= 2
                ? `MULTI-CHARACTER FRAMING:\n- This is a GROUP COMPOSITION containing ALL ${castCount} listed characters simultaneously.\n- Every listed character must be inside the SAME single ${projectAspectRatio} frame at the same moment.\n- Use a medium-wide or full ensemble composition; zoom OUT enough to fit everybody comfortably.\n- Keep every actor fully contained inside the image boundaries.\n- Do not crop the top of any head, face, shoulders, arms, hands, or any body part required by the action.\n- Prefer full-body or at minimum knees-up framing for every listed character.\n- Keep visible separation between bodies so one actor does not hide another actor's face.\n- Every face must be unobstructed and readable.\n- Leave safe breathing room around the group: approximately 8-12% margin from the top, left and right edges.\n- If the intended CAMERA instruction is too tight to include all characters, widen the camera rather than crop a character.`
                : castCount === 1
                    ? `SINGLE-CHARACTER FRAMING:\n- Keep the one listed character comfortably inside the ${projectAspectRatio} frame.\n- Do not crop the top of the head, face, hands, or body parts needed for the action.\n- Prefer a medium-full / knees-up composition unless the action explicitly requires a wider full-body view.\n- Keep safe margin around the actor.`
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
        const primaryPropIdForStanding = usedProps[0]?.id || "";
        const standingPropBlockingText = primaryPropIdForStanding
            ? shot.characterIds
                .filter((id) => {
                    const line = characterStateLockText.split("\n").find((row) => row.startsWith(`- ${id} `)) || "";
                    return /POSTURE=STANDING/i.test(line);
                })
                .map((id) => {
                    const character = characterMap.get(id);
                    return `- ${id} (${character?.name || id}) + ${primaryPropIdForStanding}: if interacting with the prop, keep ${id} fully STANDING beside/behind-near the prop at full standing height. The prop stays below torso/waist height; ${id}'s hips remain high, legs extended, feet visible/on ground. Hands may hover above or rest lightly on the CLOSED lid/top only if the torso remains upright. FORBIDDEN: crouching to reach the prop, sitting behind the prop, kneeling beside it, one knee down, folded/crossed legs hidden by the prop, using the prop as a table while seated.`
                }).join("\n")
            : "";
        const characterPropAssignmentLockText = buildCharacterPropAssignmentLock(shot, generationContext);
        const previousCharacterContinuityText = generationContext.previousContinuityShotId
            ? shot.characterIds.map((id) => {
                const character = characterMap.get(id);
                return `- ${id} (${character?.name || id}): copy this recurring person's visible face/body/hair/outfit state from PREVIOUS_CONTINUITY_ANCHOR. Preserve the same clothing layers, vest/jacket shape, kain/sarong motif, belt/sash color, footwear, accessories, hair/headcloth, sleeve/neckline, fabric texture, and wear unless ACTION explicitly changes clothing.`;
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

==================================================
FIRST-FRAME STATE + DIALOGUE BLOCKING CONTRACT
==================================================
${characterStateLockText}

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
- Do not use Character Master pose/head direction as a mandate. Preserve identity and wardrobe first; video prompting will handle precise eyeline/head-turn performance.
- NEVER average faces between characters.
- NEVER blend facial traits, wardrobe, or identity attributes between different Character IDs.
- NEVER substitute a similar-looking actor.
- NEVER beautify/redesign a face away from its master reference.
- When multiple characters appear, independently match EACH face to its own labeled Character Master.
	- LOCATION_MASTER controls broad set architecture/furniture only; it is not a human identity reference.
	- If PREVIOUS_CONTINUITY_ANCHOR is supplied, PREVIOUS_CONTINUITY_ANCHOR overrides LOCATION_MASTER for exact micro-location, camera angle, indoor/outdoor status, and all left/right placement.
	- PROP_MASTER controls locked prop IDENTITY first: shape, scale, color palette, stripes/checks/prints/logos/markings, texture, material, wear/dirt, and distinctive details.
	- PROP_MASTER is NOT a frozen-state lock. If the current shot requires the same prop to be open, partially open, contents-visible, tilted, carried, pointed, or otherwise actively manipulated, preserve the same prop identity while allowing that changed state.
	- Never simplify a patterned locked prop into a plain object. If a locked bag is striped/checkered/patterned in the PROP_MASTER or previous continuity anchor, it must remain striped/checkered/patterned in this anchor.
		- A PREVIOUS_CONTINUITY_ANCHOR, when supplied, is the PRIMARY continuity authority for micro-location, camera-world direction, recurring object placement, wardrobe, identity, and prop continuity. It is NOT a frozen pose template. If the CURRENT ACTION requires a new body pose, arm position, facing direction, or micro-position, preserve continuity but stage the character for the CURRENT ACTION instead.
		${generationContext.previousContinuityShotId ? `- Previous continuity anchor: ${generationContext.previousContinuityShotId}. Preserve compatible spatial continuity where the current shot allows it.` : "- No previous continuity anchor is supplied for this shot."}
			${generationContext.previousContinuityShotId ? "- EXACT MICRO-LOCATION LOCK: use the previous continuity anchor as the same physical spot and camera-world orientation. Do not move to another part of the same location unless ACTION explicitly relocates the scene." : ""}
			${generationContext.previousContinuityShotId ? "- PREVIOUS FRAME TRANSFER LOCK: treat PREVIOUS_CONTINUITY_ANCHOR as the continuity base image for faces, body proportions, hair/headcloth, exact wardrobe/clothing layers, kain/sarong patterns, belt/sash, footwear, accessories, prop handling, hand occupancy, held/unheld state, screen placement, left/right layout, and room layout. However, do NOT blindly copy previous pose/posture/blocking when the CURRENT ACTION needs a different readable body pose or micro-position. Do not redesign costumes. Do not regenerate a new prop arrangement from imagination." : ""}
			${previousCastSafetyText}
				${generationContext.qaFeedback?.length ? `\nREGENERATION CORRECTION FROM PREVIOUS QA:\n${generationContext.qaFeedback.map((item) => `- ${toText(item)}`).join("\n")}\nTreat these as hard negative constraints for this regeneration. Correct these failures while keeping all locked production data unchanged. Do not solve a QA failure by changing cast, location, action, continuity state, or camera intent.` : ""}
==================================================
CRITICAL PROP OVERRIDE
==================================================
${criticalPropLockText}
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
PERSISTENT / REQUIRED VISIBLE CHARACTERS:
${presenceText}
REFERENCED VISIBLE TARGET IDS:
${(shot.referencedVisibleTargetIds || []).join(", ") || "NONE"}
CARRY-OVER CHARACTER IDS FROM PRIOR CONTINUITY:
${(shot.carryOverCharacterIds || []).join(", ") || "NONE"}
SCREEN-SIDE / POSITION CONTINUITY LOCK:
- If a PREVIOUS_CONTINUITY_ANCHOR is supplied and a character appears in both that anchor and the current shot, preserve that recurring character's left-to-right order and general screen side unless the locked ACTION explicitly requires a positional change.
- Do NOT mirror, flip, or reverse the character arrangement by accident.
- Do NOT freeze the exact previous pose/blocking. If the current action needs the character to shift closer to a prop, turn their body, bend, reach, open, inspect, or otherwise perform a readable action, allow that action-driven repositioning while keeping continuity coherent.
MICRO-LOCATION / CAMERA AXIS LOCK:
- If a PREVIOUS_CONTINUITY_ANCHOR is supplied, preserve the same exact alley segment / room corner / doorway relationship / camera facing direction.
- If PREVIOUS_CONTINUITY_ANCHOR shows an outdoor alley, the new anchor MUST remain in that same outdoor alley. Do not move inside a room, doorway, porch, or interior corridor.
- If PREVIOUS_CONTINUITY_ANCHOR shows an indoor room, the new anchor MUST remain in that same room corner. Do not move outdoors or to a different room.
- Do not jump to a different area of the same broad location.
- Do not replace the prior alley background with a different wall, different doorway, different corridor, different courtyard, or different set dressing arrangement unless ACTION explicitly relocates the characters.
- If the previous anchor shows the gerobak/cart in the alley, keep the next anchor in that same alley spatial relationship.
	OBJECT / SET DRESSING SPATIAL LOCK:
	${propSpatialLockText}
	- If a PREVIOUS_CONTINUITY_ANCHOR is supplied, preserve the screen side and relative placement of recurring furniture, doors, windows, counters, tables, chairs, carts/gerobak, vehicles, locked props, and ordinary continuity set dressing.
	- If a PREVIOUS_CONTINUITY_ANCHOR shows a recurring prop/object/furniture/cart/vehicle with a specific color, stripe/check/floral/logo/marking pattern, material, texture, dirt/wear, or visible state, preserve those visible traits unless ACTION explicitly changes that prop.
		- If ACTION explicitly changes the prop state (for example a chest becomes open, a lid is lifted, contents become visible, or an object moves from idle to active use), keep the SAME prop identity while rendering the new required state rather than forcing the old neutral state.
	- Do not move a cart/gerobak from screen-left to screen-right, or a table from foreground to background, unless the ACTION explicitly moves it.
	- Do not turn striped/patterned props into plain props; do not change a bag from patterned to solid, leather to fabric, red to black, glossy to matte, or old/worn to new.
	- Do not rearrange the room for composition.
- Do not flip/mirror the environment.
LOCATION:
${JSON.stringify({ id: location?.id, name: location?.name, description: location?.description, architecture: location?.architecture, furniture: location?.furniture, lighting: location?.lighting }, null, 2)}
	PROPS:
	${JSON.stringify(usedProps, null, 2)}
	PROP HARD LOCKS:
	${criticalPropLockText}
	CAMERA:
${shot.camera}
ACTION STARTING POSE:
Show the current shot moment for:
${shot.action}
Do NOT merely restage the previous scene pose. Compose the anchor so the CURRENT ACTION beat is already readable in the still image.
${actionStagingPlanText}
ANCHOR PERFORMANCE POSE:
${dialogueBlockingPlanText}
- Use this as first-frame staging guidance. If exact eyeline conflicts with identity/framing/continuity, preserve the hard locks first, but never fall back to all characters staring forward into camera.
- Keep bodies in the correct physical state, with faces readable and wardrobe/props unchanged.
CONTINUITY SETUP STATE — MUST BE VISIBLE:
${toText(shot.continuitySetup) || "Use the established state from the prior approved scene."}
STATE CONTINUITY RULE:
- if the setup says a character is eating, show that character already seated/eating with required ordinary tableware
	- if the setup says a character is holding an object, show the object already in the hand
	- if the previous continuity frame shows a locked prop in a character's hand, keep that exact locked prop in the required hand unless ACTION explicitly releases it
	- do not place a required held prop unattended on the ground, table, or center of the frame
	- do not give any character a substitute spear, lance, blade, or other weapon while the real locked prop sits elsewhere
	- if PREVIOUS_CONTINUITY_ANCHOR is supplied, all recurring characters keep the same visible wardrobe and accessories from that previous frame; no new vest, no removed vest, no changed blouse, no changed kain/sarong pattern, no changed belt/sash color, no changed headcloth, no changed sandals
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
	- exactly ${shot.expectedHumanCount} visible humans, no fewer and no extra
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
- preserve supplied character face shape, hair color, hairstyle, clothing shape/color/pattern, accessories, and natural hands/finger count
- preserve clear facial visibility for every listed character
- preserve recurring-character screen-side continuity when a previous continuity anchor is supplied
- do not accidentally mirror left-right character order from the previous continuity anchor unless the locked action explicitly requires crossing/repositioning
ABSOLUTE FRAME + PHYSICAL RULES:
- one frame only
- one camera view only
- one continuous scene only
- ONE location only (${location?.id})
- ${aspectRatioFrameDescription(projectAspectRatio)} composition
- compose for a mobile microdrama screen
- keep the complete cast safely inside frame boundaries
- do not crop heads or faces
- do not crop hands when they participate in the action
- for two or more characters, widen the shot until all characters fit comfortably
- preserve supplied location architecture/furniture
- preserve exact same micro-location/camera-axis continuity when a previous continuity same-location anchor is supplied
	- preserve recurring object/furniture/cart/vehicle screen-side continuity when a previous continuity anchor is supplied
	- preserve recurring locked prop/object color, material, texture, logos/markings, stripe/check/print pattern, dirt/wear, and visible state when a previous continuity anchor is supplied
		- preserve recurring state continuity only at the appropriate abstraction level: identity, wardrobe, held/unheld logic, and broad seated-vs-standing continuity should persist unless ACTION changes them, but exact pose/blocking/arm position/body angle should follow the CURRENT SHOT ACTION
		- preserve recurring character face, body, hair/headcloth, wardrobe/clothing layers, fabric pattern, vest/jacket, belt/sash, accessories, and footwear from PREVIOUS_CONTINUITY_ANCHOR unless ACTION explicitly changes clothing
		- preserve supplied prop appearance, especially color and pattern; patterned props must not become plain
	- preserve CRITICAL PROP OVERRIDE exactly; never replace a locked staff/tongkat with a spear-like weapon
- do not invent important objects
- no text overlay
- no watermark
- photorealistic live-action microdrama
- natural skin
- no anime/cartoon/3D look
- this image must be suitable as the first frame of a ${shot.durationSeconds || 8}-second ${aspectRatioFrameDescription(projectAspectRatio)} ${VIDEO_ENGINE_NAME} video
- do not advance the action beyond the shot's starting moment
- solid scenery must remain physically solid
- no body/limb may intersect furniture, walls, counters, doors, props or another person
- no warped hands, fused fingers, extra fingers, missing fingers, detached head, broken neck, changed hair color, changed outfit, or changed face shape
- no clipping, phasing, impossible overlap or geometry penetration
`;
    };
    const buildGeminiCompactAnchorPrompt = (shot, generationContext: any = {}) => {
        const location = locationMap.get(shot.locationId);
        const dialogueBlockingPlanText = buildDialogueBlockingPlan(shot);
        const characterStateLockText = buildCharacterStateLock(shot);
        const dialogue = Array.isArray(shot?.dialogue) ? shot.dialogue : [];
        const firstLine = dialogue[0] || {};
        const speakerId: string = toText(firstLine?.characterId || dialogueBlockingPlanText.match(/ANCHOR_START_SPEAKER_ID:\s*(CHAR_\d+)/i)?.[1]);
        const targetId: string = toText(firstLine?.targetCharacterId || dialogueBlockingPlanText.match(/ANCHOR_START_TARGET_ID:\s*(CHAR_\d+)/i)?.[1]);
        const speakerName = characterMap.get(speakerId)?.name || speakerId || "speaker";
        const targetName = characterMap.get(targetId)?.name || targetId || "listener";
        const castIds: string[] = normalizeIdList(shot.characterIds).map((id) => String(id));
        const requiredVisible: string[] = mergeIdLists(shot.mustRemainVisibleIds, shot.referencedVisibleTargetIds).map((id) => String(id));
        const fullVisibleIds: string[] = mergeIdLists(castIds, requiredVisible).map((id) => String(id));
        const castCount = Number(shot.expectedHumanCount || castIds.length || 0);
        const correctionMode = Boolean(generationContext.correctionSourceProvided);
        const ignorePreviousContinuityForGemini = Boolean(generationContext.ignorePreviousContinuityForGemini);
        const hasIdentityBoard = Boolean(generationContext.hasIdentityBoard);

        // Parse per-character state — generic, no hardcoded IDs.
        const stateLines = String(characterStateLockText).split("\n");
        const perCharacterPosture: Record<string, string> = {};
        castIds.forEach((id: string) => {
            const idLower = String(id).toLowerCase();
            const lineMatch = stateLines.find((line) => line.toLowerCase().startsWith(`- ${idLower} `)) || "";
            const lineLower = lineMatch.toLowerCase();
            perCharacterPosture[id] = toText(lineMatch.match(/POSTURE=([A-Z_]+)/)?.[1]).toUpperCase() || "ACTION_DERIVED";
            if (lineLower.includes("berlutut") || lineLower.includes("kneel")) perCharacterPosture[id] = "KNEELING";
            if (lineLower.includes("jongkok") || lineLower.includes("crouch") || lineLower.includes("squat")) perCharacterPosture[id] = "CROUCHING";
        });

        // Per-character contract (identity + wardrobe + posture + framing).
        const perCharacterContract = castIds.map((id: string) => {
            const character = characterMap.get(id);
            const name = character?.name || id;
            const identityBits = [
                character?.identity?.age,
                character?.identity?.gender,
                character?.identity?.ethnicity,
                character?.identity?.face,
                character?.identity?.hair,
                character?.identity?.skin,
                character?.identity?.body,
            ].filter(Boolean).join("; ");
            const wardrobeBits = [character?.costume?.outfit, character?.costume?.accessories].filter(Boolean).join("; ");
            const posture = perCharacterPosture[id];
            const postureNote = posture === "KNEELING"
                ? "POSTURE: KNEELING (hard lock — at least one knee visibly touches ground/floor/step; lower than standing; do NOT render standing)."
                : posture === "CROUCHING"
                    ? "POSTURE: CROUCHING (hard lock — low bent-knee body weight on feet; do NOT render standing)."
                    : posture === "LYING"
                        ? "POSTURE: LYING (hard lock — body visibly horizontal/reclined; do NOT render standing/seated/kneeling)."
                        : posture === "SEATED"
                            ? "POSTURE: SEATED (hard lock — visible seat contact, bent knees, seated body height, hips supported)."
                            : posture === "STANDING"
                                ? "POSTURE: STANDING (hard lock — feet on ground, standing body height, extended legs readable; no seat/knee contact, no cross-legged pose, no crouch/squat, do not hide folded legs behind a foreground prop)."
                                : "POSTURE/BLOCKING: derive a natural present-time pose from the CURRENT SHOT ACTION. Use PREVIOUS_CONTINUITY_ANCHOR for continuity context only, not as a frozen pose template.";
            return [
                `### ${id} — ${name}`,
                `IDENTITY: match the ${id} tile on the CHARACTER_IDENTITY_BOARD / CHARACTER_MASTER reference EXACTLY.`,
                identityBits ? `IDENTITY SOURCE TEXT: ${identityBits}.` : "",
                `WARDROBE: match the ${id} reference's outfit shape, color, pattern, sleeve/collar, accessories, footwear EXACTLY. Do NOT invent, swap, or borrow wardrobe from another character.`,
                wardrobeBits ? `WARDROBE SOURCE TEXT: ${wardrobeBits}.` : "",
                `FRAMING: full head, hair, shoulders, torso, arms, hands, hips, and legs (as shown in action) MUST be INSIDE the canvas with clear breathing room from every edge. NEVER crop ${id}'s head, hair, face, hands, or body against the canvas border. NEVER use ${id} as a partial/off-screen foreground figure.`,
                postureNote,
                `NO CROSS-CONTAMINATION: ${id}'s face, hair, skin tone, and wardrobe MUST NOT be blended with any other character's identity.`,
            ].filter(Boolean).join("\n");
        }).join("\n\n");

        // Primary prop
        const propIds: string[] = normalizeIdList(shot.propIds || []).map((id) => String(id));
        const propSearchText = [shot.action, shot.continuitySetup, ...(shot.continuityNotes || [])].map(toText).join(" ").toLowerCase();
        const primaryPropId: string = propIds.find((id) => {
            const prop = propMap.get(id);
            return propSearchText.includes(String(id).toLowerCase()) || (toText(prop?.name) && propSearchText.includes(toText(prop?.name).toLowerCase()));
        }) || propIds[0] || "";
        const primaryProp = primaryPropId ? propMap.get(primaryPropId) : null;
        const primaryPropAppearance = primaryProp ? limitText(primaryProp.appearance || primaryProp.description, 420) : "";
        const propStateLockText = buildPropStateLockText(shot, generationContext);
        const propSpatialLockText = buildPropSpatialLockText(shot, generationContext);
        const closedPropNegativeText = buildClosedPropNegativePrompt(propStateLockText);
        const actionStagingPlanText = buildActionStagingPlan(shot);
        const anchorMomentPolicyText = buildAnchorMomentPolicyText(shot, generationContext);

        const qaIssues = (generationContext.qaFeedback || []).map(toText).filter(Boolean);
        const hasStateIssue = qaIssues.some((item) => /seated|standing|kneel|kneeling|berlutut|crouch|crouching|jongkok|posture|continuity state/i.test(item));
        const hasCropIssue = qaIssues.some((item) => /crop|frame edge|out of frame|margin|off-screen|cut/i.test(item));
        const hasIdentityIssue = qaIssues.some((item) => /identity|master|wardrobe|costume|baju|outfit/i.test(item));

        const framingContract = fullVisibleIds.length
            ? fullVisibleIds.map((id) => {
                const character = characterMap.get(id);
                return `- ${id} (${character?.name || id}): FULL BODY INSIDE FRAME. Keep head, hair, shoulders, arms, hands, torso, hips, and all action-relevant body parts strictly inside the canvas with ≥ 8% breathing room from every edge. NEVER crop any required character against the left/right/top/bottom border.`;
            }).join("\n")
            : "- No required human character.";

        const wideFramingInstruction = castCount >= 4
            ? `Use an EXTREME-WIDE ${aspectRatioFrameDescription(projectAspectRatio)} ensemble composition. Zoom OUT aggressively until every character fits comfortably with clear margins on all sides. Stagger characters into foreground/midground/background depth layers so each face is readable and no body is cropped.`
            : castCount >= 2
                ? `Use a MEDIUM-WIDE ${aspectRatioFrameDescription(projectAspectRatio)} two/three-shot. Zoom OUT enough that every listed character's head and at least knees-up are visible with clear safe margins from every canvas edge.`
                : castCount === 1
                    ? `Frame the single character medium-full or medium-wide with safe margin from every edge. If the shot involves an important prop interaction, prioritize readable actor + prop interaction over showing excessive empty environment. Do not make the actor tiny inside a huge set; keep headroom modest and keep actor + prop visually dominant.`
                    : `Show the locked location only. No humans.`;
        const anchorPerformancePlanText = buildAnchorPerformancePlan(shot);
        const standingPropBlockingText = primaryPropId && Object.values(perCharacterPosture).some((posture) => posture === "STANDING")
            ? castIds
                .filter((id) => perCharacterPosture[id] === "STANDING")
                .map((id) => {
                    const character = characterMap.get(id);
                    return `- ${id} (${character?.name || id}) + ${primaryPropId}: if interacting with the prop, keep ${id} fully STANDING beside/behind-near the prop at full standing height. The prop stays below torso/waist height; ${id}'s hips remain high, legs extended, feet visible/on ground. Hands may hover above or rest lightly on the CLOSED lid/top only if the torso remains upright. FORBIDDEN: crouching to reach the prop, sitting behind the prop, kneeling beside it, one knee down, folded/crossed legs hidden by the prop, using the prop as a table while seated.`;
                }).join("\n")
            : "";

        const correctionLines: string[] = [];
        if (hasStateIssue || Object.values(perCharacterPosture).some((posture) => posture && posture !== "ACTION_DERIVED")) {
            castIds.forEach((id: string) => {
                const character = characterMap.get(id);
                if (perCharacterPosture[id] === "KNEELING") correctionLines.push(`${id} (${character?.name || id}) MUST be rendered unmistakably KNEELING: visible knee contact with the ground/floor/step, body lower than standing, positioned on the required side of the prop/action target. NO standing.`);
                if (perCharacterPosture[id] === "CROUCHING") correctionLines.push(`${id} (${character?.name || id}) MUST be rendered unmistakably CROUCHING: low bent-knee body weight on feet. NO standing.`);
                if (perCharacterPosture[id] === "LYING") correctionLines.push(`${id} (${character?.name || id}) MUST be rendered unmistakably LYING/reclined. NO standing.`);
                if (perCharacterPosture[id] === "SEATED") correctionLines.push(`${id} (${character?.name || id}) MUST be rendered unmistakably SEATED: visible seat/throne/chair/floor support beneath hips, seated body height, bent knees. NO standing.`);
                if (perCharacterPosture[id] === "STANDING") correctionLines.push(`${id} (${character?.name || id}) MUST be rendered unmistakably STANDING: feet on ground, standing body height, legs extended/readable, hips above the prop/seat height. FORBIDDEN: sitting cross-legged, seated behind a chest/box/table, kneeling, crouching, squatting, folded legs hidden by a foreground prop.`);
            });
        }
        correctionLines.push(`Keep every required character's full head, hair, face, hands, torso, hips, and legs strictly inside the ${projectAspectRatio} canvas with ≥ 8% safe margin from every edge. Zoom out or recenter rather than cropping.`);
        correctionLines.push(`Framing readability: do not waste the image on excessive empty sky, ceiling, floor, or unused environment. If this shot is a single-character + prop beat, keep the actor large enough to read clearly and keep the important prop close enough to the actor to read as the same action moment.`);
        if (hasIdentityIssue || castIds.length > 1) {
            castIds.forEach((id: string) => {
                const character = characterMap.get(id);
                correctionLines.push(`${id} (${character?.name || id}): match its OWN reference tile face/hair/skin/wardrobe EXACTLY. Do not borrow traits from any other character.`);
            });
        }
        if (primaryPropId) {
            correctionLines.push(`${primaryPropId} must visibly match its PROP_MASTER reference.`);
            correctionLines.push(`Prop state contract: ${limitText(propStateLockText, 300)}`);
        }

        return `
ONE SINGLE PHOTOREALISTIC ${projectAspectLabel} SCENE ANCHOR. ONE ATTEMPT. OBEY ASSET IDENTITY, WARDROBE, PROPS, CAST COUNT, AND FRAMING BEFORE BEAUTY.
FULL-FRAME HD: fill the entire canvas edge-to-edge with the real scene. No letterbox bars, no pillarbox bars, no blurred/dark padding, no inset image, no vignette mask, no giant empty black sky/ceiling band. Crisp detailed 1080p-style live-action frame.
${correctionMode ? "CORRECTION MODE: use the failed candidate only as a base image. Fix identity, wardrobe, posture, prop, count, and framing failures while preserving everything already correct." : (ignorePreviousContinuityForGemini ? "STATE-OVERRIDE MODE: ignore contradictory or stale body posture/blocking from PREVIOUS_CONTINUITY_ANCHOR. Use it for room layout, wardrobe, and spatial continuity only; pose/blocking must follow the CURRENT SHOT ACTION." : "CONTINUITY MODE: use PREVIOUS_CONTINUITY_ANCHOR as the base physical scene when supplied — but its posture is OVERRIDDEN by the per-character state contract below.")}

SHOT_ID: ${shot.id}
LOCATION: ${shot.locationId}${location?.name ? ` — ${location.name}` : ""}
EXACT HUMAN COUNT: ${castCount}
ALLOWED CAST ONLY: ${castIds.join(", ") || "NONE"}
REQUIRED VISIBLE: ${requiredVisible.join(", ") || "NONE"}
${hasIdentityBoard ? "IDENTITY SHEET SUPPLIED: CHARACTER_IDENTITY_BOARD contains all cast as SEPARATE tiles. Match each ID ONLY to its own tile. DO NOT merge tiles. DO NOT render the sheet." : ""}

==================================================
NON-NEGOTIABLE PRIORITY ORDER
==================================================
1. PER-CHARACTER IDENTITY (face/hair/skin/wardrobe) — each character matches ITS OWN reference tile.
2. PER-CHARACTER POSTURE (kneeling/crouching/seated/standing/lying as specified).
3. FRAMING — every required character FULLY inside canvas with safe margin.
4. LOCKED PROP APPEARANCE + REQUIRED OPEN/CLOSED/INTERACTION STATE.
5. EXACT HUMAN COUNT / NO EXTRAS.
6. ROOM/OBJECT CONTINUITY.
7. PRETTY COMPOSITION LAST.

==================================================
PER-CHARACTER CONTRACT (IDENTITY + WARDROBE + POSTURE + FRAMING)
==================================================
${perCharacterContract}

==================================================
FRAMING / SAFE MARGIN CONTRACT — NO CROPPING
==================================================
${framingContract}
- ${wideFramingInstruction}
- Fill the full frame with usable scene content. Do not place the actor and prop only in the lower half while the upper half becomes dark empty padding.
- For one-character + one-prop interaction, compose a medium-full/medium-wide scene where the character and prop occupy a readable central action zone, with floor/steps/architecture continuing naturally to the frame edges.
- Do NOT use any required character as a partially off-screen foreground body.
- If the complete cast does not fit, MOVE THE CAMERA BACKWARD, widen field of view, or reduce subject scale until every required character fits with clear breathing room.
- Full required-character visibility OVERRIDES cinematic depth, dramatic foreground placement, symmetry, and beauty.
- Zero tolerance for cutting a required character's head, face, hands, or body against the canvas border.

==================================================
STATE CONTRACT (PER-CHARACTER, HARD LOCK)
==================================================
${characterStateLockText}
- If a seated character must turn toward the speaker, rotate ONLY head/eyes/shoulders/slightly upper torso. Hips remain supported by the seat.
- If a standing character must listen, feet remain on ground and no seat contact appears.
- If a kneeling character must interact with a prop or speak, keep knee contact visible and rotate/reach from the kneeling pose. Do NOT stand them up.
- If a crouching character must interact, keep the low bent-knee crouch visible. Do NOT stand them up.
- NEVER solve a framing or acting-pose problem by switching a character's posture.
${standingPropBlockingText}

==================================================
FIRST-FRAME PERFORMANCE / NATURAL BLOCKING
==================================================
${anchorPerformancePlanText}
${speakerId && targetId ? `${speakerId} (${speakerName}) starts the first dialogue beat toward ${targetId} (${targetName}).` : "If there is no dialogue target, stage the written action instead of camera-facing posing."}
Preserve identity, wardrobe, prop, count, location, and framing first. Within those hard locks, make the still feel like a live human conversation/action beat, not a neutral portrait.

==================================================
PRIMARY LOCKED PROP
==================================================
${primaryPropId
    ? `PRIMARY_PROP_ID: ${primaryPropId}\nPRIMARY PROP HARD LOCK: ${primaryPropId} (${primaryProp?.name || primaryPropId}) must be visibly recognizable from its PROP_MASTER. Preserve exact silhouette, shape, color, material, texture, markings/pattern, and distinctive details. ${primaryPropAppearance ? `Appearance: ${primaryPropAppearance}` : ""} Do not replace with a generic similar object.`
    : "PRIMARY_PROP_ID: NONE\nNo locked prop needs visual emphasis."}

==================================================
ACTION / REQUIRED MOMENT
==================================================
${limitText(shot.action, 360)}
${anchorMomentPolicyText}
${actionStagingPlanText}

==================================================
LOCKED PROP STATE / RESULT
==================================================
${propStateLockText}
${closedPropNegativeText}
${propSpatialLockText}

==================================================
CONTINUITY
==================================================
${ignorePreviousContinuityForGemini
    ? "PREVIOUS_CONTINUITY_ANCHOR contradicts the required posture. Ignore its posture for conflicting characters; preserve room layout, camera-world direction, wardrobe, and locked-prop world position/screen side."
    : "Preserve same micro-location, camera-world direction, locked-prop world position/screen side, left/right object order, furniture layout, and wardrobe from PREVIOUS_CONTINUITY_ANCHOR when supplied. But NEVER override current action-driven character pose/blocking or per-character identity."}

==================================================
FINAL PIXEL CHECK BEFORE RETURNING
==================================================
${correctionLines.length ? correctionLines.map((line) => `- ${line}`).join("\n") : "- Verify identities, postures, framing, and props."}
Internally verify BEFORE returning the image:
1. Each character's face/hair/skin/wardrobe matches ITS OWN reference tile (no cross-contamination).
2. Each character's posture matches the per-character contract (kneeling/crouching/seated/standing/lying/action-derived).
3. Every required character is FULLY inside canvas with safe margin — no cropping.
4. Primary prop matches its PROP_MASTER and its required open/closed/result state contract.
5. No unlisted humans or duplicate humans appear.
If any check fails, correct it before returning.
`.trim();
    };

    const buildFastAnchorPrompt = (shot, generationContext: any = {}) => {
        const location = locationMap.get(shot.locationId);
        const cast = shot.characterIds.map((id) => {
            const character = characterMap.get(id);
            return {
                id,
                name: character?.name || id,
                identity: character?.identity,
                outfit: character?.costume?.outfit || "",
                accessories: character?.costume?.accessories || "",
            };
        });
        const castCount = Number(shot.expectedHumanCount || shot.characterIds.length || 0);
        const exactHumanCountLock = castCount > 0
            ? `EXACTLY ${castCount} visible humans: ${shot.characterIds.join(", ")}. No fewer, no extras, no edge-cropped partial people. Use extreme-wide ${aspectRatioFrameDescription(projectAspectRatio)} ensemble framing if needed.`
            : "Zero humans only.";
		        const requiredVisible = mergeIdLists(shot.mustRemainVisibleIds, shot.referencedVisibleTargetIds);
		        const propLocks = (shot.propIds || []).map((id) => {
		            const prop = propMap.get(id);
		            return prop ? { id, name: prop.name, description: prop.description, appearance: prop.appearance } : { id };
		        });
			        const dialogueBlockingPlanText = buildDialogueBlockingPlan(shot);
			        const characterStateLockText = buildCharacterStateLock(shot);
			        const criticalPropLockText = buildCriticalPropLockText(shot, generationContext);
                        const propStateLockText = buildPropStateLockText(shot, generationContext);
                        const propSpatialLockText = buildPropSpatialLockText(shot, generationContext);
                        const closedPropNegativeText = buildClosedPropNegativePrompt(propStateLockText);
                        const actionStagingPlanText = buildActionStagingPlan(shot);
                        const anchorMomentPolicyText = buildAnchorMomentPolicyText(shot, generationContext);
                        const anchorPerformancePlanText = buildAnchorPerformancePlan(shot);
			        const characterPropAssignmentLockText = buildCharacterPropAssignmentLock(shot, generationContext);
		        const previousCharacterContinuityText = generationContext.previousContinuityShotId
		            ? shot.characterIds.map((id) => {
		                const character = characterMap.get(id);
		                return `${id} (${character?.name || id}) keeps same face/body/hair/headcloth/outfit layers/kain or sarong pattern/belt or sash/footwear/accessories from PREVIOUS_CONTINUITY_ANCHOR unless ACTION explicitly changes clothing.`;
		            }).join(" ")
		            : "";
		        const previousCastSafetyText = generationContext.previousContinuityShotId && generationContext.previousContinuityImageSafeForCast === false
		            ? `Previous continuity image contains people outside this shot. Do NOT copy those extra humans. Render only allowed cast IDs: ${shot.characterIds.join(", ") || "NONE"}.`
		            : "";
		        return `
FAST TURBO SCENE ANCHOR, photorealistic ${aspectRatioFrameDescription(projectAspectRatio)}.
Generate ONE single frame only. No collage, no split screen, no text overlay, no watermark.
FULL-FRAME HD: fill the entire ${projectAspectRatio} canvas edge-to-edge with the actual scene. No letterbox bars, no pillarbox bars, no blurred/dark padding, no inset image, no vignette mask, no giant empty dark top/bottom band. Crisp realistic detail.

SHOT: ${shot.id}
LOCATION: ${location?.id || shot.locationId} - ${location?.name || ""}
LOCATION LOOK: ${toText(location?.description)} ${toText(location?.architecture)} ${toText(location?.furniture)} ${toText(location?.lighting)}
	EXPECTED HUMANS: ${shot.expectedHumanCount}
	${exactHumanCountLock}
	CAST IDS AND LOCKED LOOKS:
${JSON.stringify(cast)}

ACTION / REQUIRED MOMENT:
${toText(shot.action)}
${anchorMomentPolicyText}
${actionStagingPlanText}

FIRST-FRAME PERFORMANCE / SCRIPT-SPECIFIC REALISM:
${anchorPerformancePlanText}

LOCKED PROP STATE / RESULT:
${propStateLockText}
${closedPropNegativeText}
${propSpatialLockText}

VIDEO / ANCHOR DIALOGUE BLOCKING CONTEXT:
${dialogueBlockingPlanText}

CAMERA:
${toText(shot.camera)}

CONTINUITY STATE — HARD PHYSICAL LOCK:
${toText(shot.continuitySetup) || "Use current established state."}
${characterStateLockText}
Do not change seated/standing/eating/holding state for prettier composition. Do not make everyone face the camera; use natural speaker/listener/object blocking while preserving identity, wardrobe, prop state, full cast visibility, and safe framing.
If any character is contracted as STANDING while interacting with a prop, keep them fully upright at standing height with feet on ground and legs extended/readable. Do not seat, crouch, kneel, squat, or hide folded legs behind the prop.

		REQUIRED VISIBLE IDS: ${requiredVisible.join(", ") || "NONE"}
		LOCKED PROPS:
		${propLocks.length ? JSON.stringify(propLocks) : "NONE"}
				CRITICAL PROP HARD LOCKS:
				${criticalPropLockText}
				CAST / PROP ASSIGNMENT LOCK:
				- ${characterPropAssignmentLockText}
				PREVIOUS CHARACTER/WARDROBE LOCK:
				${previousCharacterContinuityText || "NONE"}
				PREVIOUS CAST FILTER:
				${previousCastSafetyText || "NONE"}
			
	RULES:
		- If LOCKED_ASSET_BOARD or CHARACTER_IDENTITY_BOARD is supplied, use it first for exact human count, all character assets, locked wardrobe/costume, previous continuity anchor, location, and props.
- Use attached CHARACTER_MASTER references to preserve each matching face shape, age, skin, hair color, hairstyle, body, outfit shape/color/pattern, and accessories.
	- Preserve natural anatomy: correct head/neck attachment, realistic hands, and five natural fingers per visible hand unless occluded.
	- Head direction and eyeline are softer than identity/wardrobe/prop/framing, but the anchor must still read as natural human action/dialogue, not a repeated front-facing portrait.
	- Use attached LOCATION_MASTER for the set/layout.
		- Use attached PROP_MASTER references to preserve locked prop shape, scale, color, pattern, markings, material, texture, wear/dirt, and distinctive details.
		- Do not turn patterned/striped/checkered/printed locked props into plain solid-color props.
		- Never replace a locked staff/tongkat with a spear, lance, pike, polearm, pointed metal head, blade, or shiny fantasy weapon.
		- Keep exactly ${shot.expectedHumanCount} visible human(s), no extras, no duplicates.
- Keep all expected characters fully readable inside the ${projectAspectRatio} frame.
- Fill the full frame with real scene content. The actor + locked prop interaction must not be squeezed into only the lower half of the image.
- If more than one person appears, frame wide enough so no face is hidden or cropped.
	- If PREVIOUS_CONTINUITY_ANCHOR is attached, copy the same exact micro-location and camera direction from that image.
	- If PREVIOUS_CONTINUITY_ANCHOR is attached, use it as the continuity base image for held props, hand occupancy, screen placement, and wardrobe continuity. Do not invent a new handling state. But do not freeze the old pose if the current action requires a different readable performance pose.
	- If PREVIOUS_CONTINUITY_ANCHOR is attached, preserve every recurring character's visible face, body, hair/headcloth, outfit layers, vest/jacket, kain/sarong pattern, belt/sash, footwear, and accessories from that image. Do not redesign baju or costume.
- Do not move to another room, interior, doorway, wall, courtyard, street segment, or different corner of the same location.
	- Keep the same alley/room segment, roofline, wall texture, doors/windows, drains, cables, laundry, cart/gerobak, table/counter, and background geometry on the same screen side as the previous anchor.
	- Keep recurring object/prop/furniture/cart/vehicle color, stripe/check/print pattern, material, texture, markings, and worn/new state the same as the previous anchor.
- Do not turn an outdoor alley into an indoor room, and do not move an indoor room into an alley.
- Preserve left/right object placement when reference layout shows it.
- Render the required anchor moment for video continuity. If the prop contract says CLOSED, keep it closed with no visible contents. If the prop contract explicitly says OPEN, show the required progressed open state while preserving identity.
- Stage the characters as a stable but lived-in first frame: readable faces, natural body angles, action/dialogue-aware gaze, and no repeated front-facing portrait pose.
- Natural Indonesian microdrama live-action look, realistic lighting, realistic skin.
	${generationContext.qaFeedback?.length ? `\nFIX THESE QA ISSUES: ${generationContext.qaFeedback.map(toText).join("; ")}\nThese are hard negative constraints. Fix them without changing the locked cast, location, action, continuity state, or camera intent.` : ""}
`.trim();
    };
	    const repairShotForRuntime = (shot) => {
	        if (!shot) return shot;
	        let characterIds = normalizeIdList(shot.characterIds);
        if (!characterIds.length && shot.shotKind === "OPENING_ESTABLISH") {
            const episodeScenes = scripts[shot.episode] || [];
            const sourceSceneId = toText(shot.sceneId).replace(/_OPENING$/, "");
            const sourceScene = episodeScenes.find((scene) => scene.id === sourceSceneId) || episodeScenes[0];
            characterIds = normalizeIdList(sourceScene?.requiredVisibleCharacterIds?.length ? sourceScene.requiredVisibleCharacterIds : sourceScene?.characterIds);
	        }
	        const expectedHumanCount = characterIds.length;
	        const repairedShot = {
	            ...shot,
	            characterIds,
	            expectedHumanCount,
	            camera: shot.camera || inferDeterministicCamera(expectedHumanCount, shot.movementMode || "STATIC"),
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
        if (!locationRef) throw new Error(`LOCATION_REFERENCE_MISSING_${shot.locationId}`);
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
			                authority: `Prop identity authority first. Preserve exact prop shape, scale, color palette, stripe/check/print/logo/marking pattern, texture, material, dirt/wear, and distinctive details so the result is clearly the SAME prop. Do NOT freeze the prop 1:1 to the reference's neutral state: open/closed/lid-up/contents-visible/handling orientation may change ONLY when the current shot/action explicitly requires it.${propStateAuthority} If a human appears in this prop reference, ignore that human completely unless they are explicitly listed in the allowed cast; do not render a prop-reference holder as an extra person. Do not simplify patterned props into plain solid-color props. Do not derive human identity from this image.${staffAuthority}`,
			            };
		        }).filter(Boolean) : [];
		        const previousContinuityShot = getPreviousContinuityShotFor(shot);
		        const continuityImageSafeForCast = isPreviousContinuityImageSafeForCast(shot, previousContinuityShot);
		        const continuityEntry = FAST_ANCHOR_INCLUDE_PREVIOUS && previousContinuityShot && continuityImageSafeForCast ? {
		            image: previousContinuityShot.anchorImage, type: "PREVIOUS_CONTINUITY_ANCHOR", id: previousContinuityShot.id,
		            label: `${previousContinuityShot.id} // PREVIOUS CONTINUITY FRAME`,
			            authority: "PRIMARY CONTINUITY IMAGE. Copy this exact micro-location, indoor/outdoor status, alley/room segment, camera-facing direction, screen side, recurring character face/body/hair/headcloth/outfit layers/vest/kain-sarong pattern/belt-sash/footwear/accessories, furniture/object/cart/vehicle/prop placement, recurring object color/pattern/material/texture/markings/wear, roofline, wall texture, doors, windows, cables, drains, laundry, and background geometry. If a locked prop is being held in this frame and the current action does not explicitly release it, preserve the same handling state and screen placement. NEVER redesign baju/costume. NEVER move to another doorway/room/corner/street segment. NEVER place a previously held locked prop unattended. NEVER override Character Master face/identity. IMPORTANT: use this image for continuity context, not as a frozen CHARACTER pose template — if the current shot action requires a different readable character pose/blocking, stage the new character pose while preserving continuity. LOCKED PROP WORLD POSITIONS are different: preserve each recurring prop's established screen side/depth/world position unless ACTION explicitly moves that prop.",
		        } : null;
                const dialogueBlockingForRefs = buildDialogueBlockingPlan(shot);
                const geminiSpeakerId = toText(dialogueBlockingForRefs.match(/ANCHOR_START_SPEAKER_ID:\s*(CHAR_\d+)/i)?.[1]);
                const geminiTargetId = toText(dialogueBlockingForRefs.match(/ANCHOR_START_TARGET_ID:\s*(CHAR_\d+)/i)?.[1]);
                const hardStateCorrection = isHardAnchorStateCorrection(qaFeedback);
                const correctionEntry = correctionSourceImage && !hardStateCorrection ? {
                    image: correctionSourceImage,
                    type: "CORRECTION_SOURCE",
                    id: `${shot.id}_FAILED_CANDIDATE`,
                    label: `${shot.id} // FAILED CANDIDATE TO EDIT`,
                    authority: "EDIT SOURCE ONLY. Preserve details that already match continuity, but actively correct every QA failure named in FINAL TASK. Failed posture, prop open/closed state, eyeline, and staging here are NOT authoritative and MUST NOT be copied.",
                } : null;
                const speakerReferenceEntry = characterReferenceEntries.find((ref) => ref.id === geminiSpeakerId) || null;
                const targetReferenceEntry = characterReferenceEntries.find((ref) => ref.id === geminiTargetId) || null;

		        const references = continuityEntry && propEntries.length
		            ? [continuityEntry, ...propEntries, ...characterReferenceEntries, locationEntry]
		            : propEntries.length
		                ? [...propEntries, ...characterReferenceEntries, locationEntry]
		                : continuityEntry
		                    ? [continuityEntry, ...characterReferenceEntries, locationEntry]
		                    : [...characterReferenceEntries, locationEntry];
			        const useGeminiStrictAnchor = shouldUseGeminiChatImage(selectedImageProvider, effectiveImageModel);
		        const ignorePreviousContinuityForGemini = useGeminiStrictAnchor && (/(must remain seated|posture=seated|remains seated|tetap duduk|duduk|posture=kneeling|kneeling|berlutut|posture=crouching|crouching|jongkok|posture=lying|lying|berbaring|terbaring)/i.test([shot.action, shot.continuitySetup, ...(shot.continuityNotes || []), ...(qaFeedback || [])].map(toText).join(" ").toLowerCase()) || /previous continuity frame|standing in the supplied previous continuity frame|seated in the candidate but standing|standing.*instead of.*kneeling|rendered standing.*kneeling/i.test([shot.action, shot.continuitySetup, ...(shot.continuityNotes || []), ...(qaFeedback || [])].map(toText).join(" ").toLowerCase()));
		        const boardItems = [
		            ...(continuityEntry ? [continuityEntry] : []),
		            ...characterReferenceEntries,
		            locationEntry,
		            ...propEntries,
		        ];

		        // CHARACTER IDENTITY BOARD: satu gambar berisi semua character master.
		        // Hanya untuk Gemini strict mode saat karakter > 1, supaya SEMUA identitas
		        // sampai ke model dalam 1 slot reference.
		        let characterIdentityBoard = "";
		        if (useGeminiStrictAnchor && characterReferenceEntries.length > 2) {
		            characterIdentityBoard = await createCharacterIdentityBoard(
		                characterReferenceEntries.map((ref) => ({
		                    id: ref.id,
		                    label: ref.label,
		                    image: ref.image,
		                }))
		            );
		        }
		        const characterIdentityBoardEntry = characterIdentityBoard ? {
		            image: characterIdentityBoard,
		            type: "CHARACTER_IDENTITY_BOARD",
		            id: `${shot.id}_CHAR_IDENTITY_BOARD`,
		            label: "ALL CAST IDENTITIES IN ONE SHEET (SEPARATE PEOPLE)",
		            authority: "Identity reference sheet. Each tile is a SEPARATE unique person and shows ONLY the centered main character for that ID. Do NOT render this sheet layout. Do NOT merge identities across tiles. For each character ID listed in the final task, copy the face, hair, skin, wardrobe, and accessories ONLY from that ID's own tile. Ignore background humans, soldiers, guards, crowds, partial bodies, reflections, and all other tiles when rendering a specific character.",
		        } : null;

		        const referenceBoard = useGeminiStrictAnchor ? "" : await createContinuityReferenceBoard(boardItems, `${shot.id} LOCKED ASSET BOARD`);
		        const referencesWithBoard = referenceBoard
		            ? [{
		                image: referenceBoard,
		                type: "LOCKED_ASSET_BOARD",
		                id: `${shot.id}_LOCKED_ASSET_BOARD`,
		                label: "ALL REQUIRED LOCKED ASSETS IN ONE BOARD",
		                authority: `Highest priority consolidated visual board. Render humans ONLY for the allowed cast IDs in the final task: ${shot.characterIds.join(", ") || "NONE"}.`,
		            }, ...references]
		            : references;
		        const generationSearchText = [shot.action, shot.continuitySetup, ...(shot.continuityNotes || []), ...(qaFeedback || [])].map(toText).join(" ").toLowerCase();
		        const primaryPropEntry = propEntries.find((ref) => {
		            const prop = propMap.get(ref.id);
		            return generationSearchText.includes(String(ref.id).toLowerCase()) || (toText(prop?.name) && generationSearchText.includes(toText(prop?.name).toLowerCase()));
		        }) || propEntries[0] || null;

		        // Gemini strict mode: deterministic 3-slot identity-first strategy.
		        // 1 character, first shot: CHARACTER + PROP (if any) + LOCATION.
		        // 1 character, continuity: CHARACTER + PREVIOUS + PROP/LOCATION.
		        // 2 characters: both individual CHARACTER_MASTER refs are mandatory; final slot is correction/continuity/prop/location.
		        // 3+ characters: use one CHARACTER_IDENTITY_BOARD slot, then continuity/prop/location.
		        const geminiStrictReferences = (() => {
		            const picked: any[] = [];
		            const add = (entry) => {
		                if (!entry || picked.length >= GEMINI_IMAGE_MAX_REFERENCES) return;
		                if (picked.some((item) => item.type === entry.type && item.id === entry.id)) return;
		                picked.push(entry);
		            };

		            if (characterIdentityBoardEntry) {
		                // 3+ cast: board is the immutable identity source for all cast members.
		                add(characterIdentityBoardEntry);
		                if (correctionEntry) add(correctionEntry);
		                else if (continuityEntry && !ignorePreviousContinuityForGemini) add(continuityEntry);
		                if (primaryPropEntry) add(primaryPropEntry);
		                add(locationEntry);
		            } else {
		                // 1–2 cast: NEVER replace individual masters with a board.
		                // Every character master is mandatory before any environment/prop reference.
		                characterReferenceEntries.forEach(add);
		                if (correctionEntry) add(correctionEntry);
		                else if (continuityEntry && !ignorePreviousContinuityForGemini) add(continuityEntry);
		                if (primaryPropEntry) add(primaryPropEntry);
		                add(locationEntry);
		            }
		            return picked.slice(0, GEMINI_IMAGE_MAX_REFERENCES);
		        })();

		        const referencesForGeneration = useGeminiStrictAnchor ? geminiStrictReferences : referencesWithBoard;
                console.info(`[anchor:${shot.id}] references`, referencesForGeneration.map((ref, index) => ({
                    slot: index + 1,
                    type: ref.type,
                    id: ref.id,
                    label: ref.label,
                })));
	        throwIfAnchorGenerationStopped(runId);
        setShots((prev) => prev.map((item) => item.id === shotId ? {
            ...item, anchorStatus: "generating",
            qa: {
	                checked: false, pass: false, humanCount: 0, identityPass: false, identityDetails: [],
	                locationPass: false, verticalPass: false, singleFramePass: false, allCharactersVisible: false,
	                framingPass: false, fullFramePass: false, spatialSafetyPass: false, referencedTargetVisiblePass: false,
	                continuityPresencePass: false, positionContinuityPass: false, propAppearancePass: false,
	                wardrobeContinuityPass: false, anatomyPass: false, headDirectionPass: false,
	                stateContinuityPass: false, dialogueEyelinePass: false,
	                imageWidth: 0, imageHeight: 0, issues: [],
	            },
        } : item));
	        try {
	            const generationContext = {
	                previousContinuityShotId: previousContinuityShot?.id || null,
	                previousContinuityImageSafeForCast: continuityImageSafeForCast,
	                qaFeedback,
                    correctionSourceProvided: Boolean(correctionEntry),
                    ignorePreviousContinuityForGemini,
                    hasIdentityBoard: Boolean(characterIdentityBoardEntry),
	            };
            const anchorPrompt = useGeminiStrictAnchor
                ? buildGeminiCompactAnchorPrompt(shot, generationContext)
                : (FAST_IMAGE_MODE ? buildFastAnchorPrompt(shot, generationContext) : buildAnchorPrompt(shot, generationContext));
            const image = await withCreditMeter(`Anchor ${shot.id}`, "image", () => generateImage(
                anchorPrompt,
                referencesForGeneration,
                projectAspectRatio,
	                effectiveImageModel,
	                {
                        provider: selectedImageProvider,
	                    bypassCache: true,
	                    anchorSpeakerId: geminiSpeakerId,
                    anchorTargetId: geminiTargetId,
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
	        if (!locationRef) throw new Error(`LOCATION_REFERENCE_MISSING_${shot.locationId}`);
	        const propRefs = (shot.propIds || []).map((id) => {
	            const prop = propMap.get(id);
	            if (!prop?.referenceImage) return null;
	            return {
	                image: prop.referenceImage, type: "PROP_MASTER", id,
	                label: `${id} // ${prop?.name || id} // PROP APPEARANCE AUTHORITY`,
	                authority: "Compare candidate locked prop identity against this exact prop reference: shape, scale, colors, stripe/check/print/logo/marking pattern, texture, material, dirt/wear, and distinctive details. Open/closed/lid-up/contents-visible/handling state may differ when the shot action or continuity explicitly requires that changed state.",
	            };
	        }).filter(Boolean);
	        const previousContinuityShot = getPreviousContinuityShotFor(shot);
	        const qaReferencePack = [
	            { image: anchorImage, type: "CANDIDATE_SCENE_ANCHOR", id: shot.id, label: `${shot.id} // CANDIDATE TO INSPECT`, authority: "This is the generated candidate. Inspect it; it is not an identity authority." },
	            ...characterRefs,
	            { image: locationRef, type: "LOCATION_MASTER", id: shot.locationId, label: `${shot.locationId} // LOCATION AUTHORITY`, authority: "Compare set/location only. Do not use as a character identity source." },
	            ...propRefs,
	            ...(previousContinuityShot?.anchorImage ? [{
	                image: previousContinuityShot.anchorImage, type: "PREVIOUS_CONTINUITY_ANCHOR", id: previousContinuityShot.id,
	                label: `${previousContinuityShot.id} // PREVIOUS CONTINUITY FRAME`,
	                authority: "Use only to inspect same-location continuity: exact micro-location, alley/room segment, camera-facing direction, recurring character screen side, left-to-right order, furniture/object/cart/vehicle/prop placement, recurring prop/object color/pattern/material/texture/markings/wear, and spatial continuity. CHARACTER pose/blocking is judged primarily against the CURRENT SHOT ACTION, not frozen from the previous scene. LOCKED PROP placement is stricter: preserve each recurring prop's screen side/depth/world position unless ACTION explicitly relocates that prop. Never override Character Master identity.",
	            }] : []),
        ];
        const dimensions = await getImageDimensions(anchorImage);
        const verticalPass = isRequestedAspectRatio(dimensions.width, dimensions.height, projectAspectRatio);
        const mustRemainVisibleIds = mergeIdLists(shot.mustRemainVisibleIds, shot.referencedVisibleTargetIds);
        const dialogueBlockingPlanText = buildDialogueBlockingPlan(shot);
        const characterStateLockText = buildCharacterStateLock(shot);
        const propStateLockText = buildPropStateLockText(shot, {});
        const result = await withCreditMeter(`QA ${shot.id}`, "vision", () => callJSON(`
ROLE: You are a strict visual continuity, persistent-presence, per-character identity, and framing inspector.
	LABELED IMAGE PACK:
	- CANDIDATE_SCENE_ANCHOR = image being inspected.
	- Each CHARACTER_MASTER is the immutable identity authority for its exact Character ID, including face shape, hair color/style, skin tone, body, locked clothing shape/color/pattern, accessories, and hand anatomy.
	- LOCATION_MASTER is the set authority only.
	- PREVIOUS_CONTINUITY_ANCHOR, when supplied, is the same-location continuity authority for exact micro-location, alley/room segment, camera-facing direction, object placement, furniture placement, cart/vehicle screen side, left/right continuity, and recurring visible wardrobe/accessory state. It should NOT force a stale pose from the previous scene when the current shot action clearly requires a different pose/blocking.
Never compare one character against another character's master.
SHOT_ID: ${shot.id}
EXPECTED FORMAT: ONE single continuous frame, ${aspectRatioFrameDescription(projectAspectRatio)}, ONE location only
EXPECTED HUMAN COUNT: ${shot.expectedHumanCount}
EXPECTED CHARACTER IDs: ${shot.characterIds.join(", ") || "NONE"}
${shot.expectedHumanCount === 0 ? "ZERO-HUMAN RULE: if any person, child, adult, silhouette, reflection, poster-like human, or crowd member is visible, pass MUST be false and humanCount must be greater than 0." : "CAST-ONLY RULE: every visible human must match one of the expected Character IDs; unlisted people make pass false."}
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
RECURRING CHARACTER IDS THAT SHOULD PRESERVE SCREEN-SIDE CONTINUITY:
${mergeIdLists(shot.characterIds, previousContinuityShot?.characterIds || []).filter((id) => shot.characterIds.includes(id) && (previousContinuityShot?.characterIds || []).includes(id)).join(", ") || "NONE"}
EXPECTED CONTINUITY STATE:
${toText(shot.continuitySetup) || "No additional state beyond the action and prior continuity anchor."}
PER-CHARACTER STATE CONTRACT:
${characterStateLockText}
LOCKED PROP STATE CONTRACT:
${propStateLockText}
	VIDEO DIALOGUE BLOCKING CONTEXT (DO NOT FAIL STILL IMAGE FOR THIS):
	${dialogueBlockingPlanText}
INCIDENTAL CONTINUITY SET DRESSING:
${(shot.incidentalSetDressing || []).join(", ") || "NONE"}
STRICT INSPECTION TASK:
1. Count visible humans.
2. Check for duplicate/cloned people and unexpected background people.
3. Perform STRICT PER-CHARACTER identity matching.
4. Verify EVERY expected character is visible simultaneously in the SAME scene frame.
5. Verify EVERY MUST REMAIN VISIBLE and REFERENCED TARGET character is actually visible/readable.
6. Verify a carry-over character from prior same-location continuity has not disappeared.
7. Verify EXPECTED CONTINUITY STATE is visibly represented.
8. Verify safe framing (NO CROPPING against any canvas edge).
9. Verify this is ONE coherent photographic frame.
10. Verify the location reasonably matches the location reference.
	10B. Verify FULL-FRAME HD composition: the real scene fills the entire canvas edge-to-edge with no letterbox bars, pillarbox bars, blurred/dark padding, inset photo, vignette mask, or giant empty top/bottom band.
	11. Check obvious costume continuity and unlisted important people/props.
	12. Check SPATIAL SAFETY.
	13. If movementMode is LOCOMOTION, verify start frame leaves a clear path.
	14. If movementMode is STATIC, verify actors are already in stable positions.
	15. If PREVIOUS_CONTINUITY_ANCHOR is supplied, verify no accidental mirroring of recurring characters.
	16. If PREVIOUS_CONTINUITY_ANCHOR is supplied, verify recurring furniture, carts/gerobak, vehicles, counters, tables, doors, windows, locked props, and ordinary continuity set dressing preserve the same screen side, depth, and relative world placement unless ACTION explicitly RELOCATES them. Opening/closing/inspecting a prop is a STATE CHANGE, not permission to move it across the frame.
	17. Verify every PROP_MASTER used by this shot preserves exact prop identity: shape, scale, color palette, stripe/check/floral/print/logo/marking pattern, texture, material, dirt/wear, and distinctive details. A patterned/belang/checkered/printed bag or prop becoming plain MUST fail.
	17B. Verify open/closed/contents visibility ONLY against LOCKED PROP STATE CONTRACT. Do not infer "open" merely from "opening shot", "opening establish", episode opening, or a QA sentence that describes the failed candidate. If the contract says OPEN_STATE=CLOSED, an open lid or visible contents MUST fail. If the contract says OPEN_STATE=OPEN, a closed lid MUST fail. If no explicit open/closed state is listed, do not fail solely because the prop is neutral/closed unless the written action clearly requires opening/contents.
	18. If PREVIOUS_CONTINUITY_ANCHOR is supplied, verify recurring props/objects/furniture/carts/vehicles preserve visible color, pattern, material, texture, markings, wear/newness, and broad state continuity unless ACTION explicitly changes them. If ACTION explicitly changes a prop state according to LOCKED PROP STATE CONTRACT, fail only when the required changed state is missing or the prop identity changes.
		19. Verify locked wardrobe continuity: clothing color, pattern, garment shape, sleeve length, collar/neckline, accessories, and fit remain consistent with CHARACTER_MASTER/continuity. If PREVIOUS_CONTINUITY_ANCHOR is supplied, recurring characters must preserve the same visible outfit layers, vest/jacket presence, kain/sarong pattern, belt/sash color, headcloth/hair, footwear, and accessories from PREVIOUS_CONTINUITY_ANCHOR unless ACTION explicitly changes clothing.
	20. Verify human anatomy: no warped hands, fused fingers, extra fingers, missing fingers, duplicated hands, detached head, broken neck, or impossible head/body connection.
		21. Ignore exact head direction and dialogue eyeline for anchor QA. Those are video-prompt checks, not still-image anchor requirements.
	22. If PREVIOUS_CONTINUITY_ANCHOR is supplied, verify recurring character broad state continuity is preserved at the correct abstraction level: kneeling/crouching/seated/standing/lying, held vs unheld, eating/watching/waiting logic should persist unless ACTION explicitly changes it. However, exact pose/blocking/arm placement/body angle and character micro-position should be judged against the CURRENT SHOT ACTION, not the previous scene still. A current action like opening/inspecting/reaching must be visibly staged, even if the character pose differs from the previous shot.
	23. If PREVIOUS_CONTINUITY_ANCHOR is supplied, verify the candidate remains in the same exact micro-location and camera-facing direction, not a different doorway/wall/corner/courtyard/interior segment of the same broad location.
		24. If dialogue is present, use it only to understand required visible cast/targets. Do not fail the still image for head-turn or eye-line performance.
MOVEMENT MODE: ${shot.movementMode || "STATIC"}
MOVING CHARACTER IDS: ${(shot.movingCharacterIds || []).join(", ") || "NONE"}
ACTION:
${toText(shot.action)}
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
	- image has letterbox/pillarbox bars, blurred padding, dark top/bottom bands, an inset/pasted scene, or actor/prop squeezed into only the lower half while the rest is empty generated padding
	- identity mismatch is obvious
	- character's face/hair/skin/wardrobe blends with or copies another character's master
	- any required character's head, hair, face, hands, torso, hips, or legs is visibly cut by the ${projectAspectRatio} canvas border
	- any required character is used as a partial/off-screen foreground body
	- a character's posture contradicts the PER-CHARACTER STATE CONTRACT, for example kneeling appears standing, crouching appears standing, seated appears standing, or standing appears seated/kneeling/crouching
	- a character's outfit/wardrobe shape/color/pattern/accessories differ from their own CHARACTER_MASTER tile
	- location continuity is obviously wrong
	- locked prop color, stripe/check/print/logo/marking pattern, texture, material, or distinctive appearance changes from PROP_MASTER
	- a prop that should remain the SAME object is replaced by a generic or different object
	- recurring object/furniture/cart/vehicle/prop screen side, depth, or world position changes without an explicit ACTION that physically relocates that object; opening/closing/inspecting alone does NOT authorize relocation
	- recurring object/furniture/cart/vehicle/prop color, pattern, material, texture, markings, or wear/newness changes without explicit ACTION
	- a locked prop state contradicts LOCKED PROP STATE CONTRACT, for example contract says OPEN_STATE=CLOSED but the prop is open/contents-visible, or contract says OPEN_STATE=OPEN but the prop stays closed
		- clothing/baju color, pattern, garment shape, accessories, or costume continuity changes
		- recurring character clothing differs from PREVIOUS_CONTINUITY_ANCHOR without explicit ACTION change, including changed vest/jacket, blouse/top, kain/sarong pattern, belt/sash color, headcloth/hair, footwear, or accessories
	- face shape, jawline, eye/nose/lip structure, hair color, hairstyle, skin tone, or body proportions change from CHARACTER_MASTER
	- hand anatomy is visibly wrong, including extra/missing/fused fingers, melted hands, or duplicated hands
		- recurring character broad state changes without explicit ACTION (for example kneeling becomes standing, seated becomes standing, or standing becomes kneeling with no reason). Do NOT fail merely because exact pose/blocking/arm position differs when the CURRENT SHOT ACTION requires a new readable pose.
- room appears mirrored/flipped relative to PREVIOUS_CONTINUITY_ANCHOR
	- candidate jumps to a different sub-location of the same location, such as a new wall/doorway/courtyard/interior-adjacent area, without explicit ACTION
	- body/limb intersects solid scenery or another person unnaturally
	- LOCOMOTION is required but starting path is blocked
	
	CRITICAL QA — per-character posture verification:
The PER-CHARACTER STATE CONTRACT lists each expected character with their required posture when the script/action explicitly provides one.
For EACH character, verify in the candidate:
- If KNEELING: at least one knee visibly touches the ground/floor/step, body height is lower than standing.
- If CROUCHING: body is low with bent knees and weight on feet, not upright standing.
- If SEATED: hips visibly supported by a seat, knees bent, body at seated height.
- If STANDING: feet on ground, legs extended, no seat contact.
- If ACTION_DERIVED: do not hard-fail posture merely because the body is standing/crouching/leaning naturally; judge whether the pose supports the current action/dialogue.
If ANY character's posture contradicts the contract → stateContinuityPass = false, pass = false, and add an issue describing which character was rendered in the wrong posture.

CRITICAL QA — per-character identity verification:
For EACH expected character ID, compare ONLY against that ID's own CHARACTER_MASTER.
Do NOT compare a character against another character's master.
If a character's face, hair, skin tone, or wardrobe visually matches a DIFFERENT character's master better than their own → identityPass = false for that character, pass = false.

CRITICAL QA — framing verification:
For EACH required character, verify head, hair, face, hands, torso, hips, and legs are FULLY inside the ${projectAspectRatio} canvas with visible safe margin from every edge.
If ANY required character's head/face/hands/body touches or crosses the canvas border → framingPass = false, pass = false.

CRITICAL QA — full-frame verification:
The image must be a real edge-to-edge ${projectAspectRatio} scene. If the top/bottom/side area is a dark/blurred padding band, letterbox/pillarbox, vignette mask, or empty artificial filler instead of actual scene content → fullFramePass = false, pass = false.

RETURN:
{
  "pass": true,
  "humanCount": ${shot.expectedHumanCount},
  "identityPass": true,
  "characterIdentityMatches": ${JSON.stringify(shot.characterIds.map((id) => ({ characterId: id, match: true, reason: "exact master identity preserved" })), null, 2)},
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
	        const positionContinuityPass = previousContinuityShot?.anchorImage ? toBool(result.positionContinuityPass) : true;
	        const propAppearancePass = propRefs.length || previousContinuityShot?.anchorImage ? toBool(result.propAppearancePass) : true;
	        const wardrobeContinuityPass = shot.expectedHumanCount > 0 ? toBool(result.wardrobeContinuityPass) : true;
	        const anatomyPass = shot.expectedHumanCount > 0 ? toBool(result.anatomyPass) : true;
		        const headDirectionPass = true;
		        const stateContinuityPass = toText(shot.continuitySetup) || (shot.incidentalSetDressing || []).length ? toBool(result.stateContinuityPass) : true;
		        const dialogueEyelinePass = true;
		        const finalPass =
		            Number(result.humanCount) === shot.expectedHumanCount &&
		            strictIdentityPass && toBool(result.locationPass) && verticalPass &&
		            singleFramePass && allCharactersVisible && framingPass && fullFramePass && spatialSafetyPass &&
		            referencedTargetVisiblePass && continuityPresencePass && positionContinuityPass && propAppearancePass &&
		            wardrobeContinuityPass && anatomyPass && headDirectionPass && stateContinuityPass && dialogueEyelinePass;
	        const issues = normalizeIssues(result.issues).filter((issue) => !/(head direction|eyeline|eye[-\s]?line|dialogue blocking|speaker.*listener|looking at|staring into camera|face.*target|gaze)/i.test(issue));
        if (!strictIdentityPass) {
            const failedIds = shot.characterIds.filter((id) => identityMap.get(id) !== true);
            issues.unshift(`Character identity mismatch against locked master reference: ${failedIds.join(", ") || "unknown character"}.`);
        }
        if (!verticalPass) issues.unshift(`Anchor must be ${projectAspectRatio}. Actual image: ${dimensions.width}x${dimensions.height}.`);
        if (!singleFramePass && !issues.some((item) => item.toLowerCase().includes("frame"))) issues.push("Anchor must contain one single continuous frame only.");
        if (!fullFramePass) issues.push("Full-frame failed: image contains letterbox/pillarbox bars, blurred/dark padding, inset framing, or excessive artificial empty banding. Regenerate edge-to-edge full-frame HD scene content.");
        if (!allCharactersVisible && shot.expectedHumanCount > 0) issues.push("Not all expected characters are simultaneously visible in the frame.");
        if (!referencedTargetVisiblePass && mustRemainVisibleIds.length) issues.push(`Required/referenced visible target missing or obscured: ${mustRemainVisibleIds.join(", ")}.`);
	        if (!continuityPresencePass) issues.push("Persistent character presence continuity failed.");
	        if (!positionContinuityPass) issues.push("Spatial map continuity failed: screen-side, object placement, furniture/gerobak/vehicle placement, or broad state continuity changed unexpectedly. Do not treat action-driven pose/blocking changes as failures unless they contradict the current shot action.");
	        if (!propAppearancePass) issues.push("Prop identity continuity failed: locked prop/object color, pattern, markings, material, texture, wear/newness, or distinctive details changed unexpectedly, or a changed action state no longer reads as the same prop.");
	        if (!wardrobeContinuityPass) issues.push("Wardrobe continuity failed: baju/clothing color, pattern, garment shape, accessories, or costume details changed unexpectedly.");
	        if (!anatomyPass) issues.push("Human anatomy failed: visible hand/finger count, head/neck attachment, limb structure, or body proportions are wrong.");
		        if (!stateContinuityPass) issues.push("Continuity state failed.");
        if (!framingPass) issues.push("One or more expected characters are cropped, hidden, or too close to the image edge.");
        if (!spatialSafetyPass) issues.push(shot.movementMode === "LOCOMOTION" ? "Spatial safety failed: start position/path is blocked or intersects solid scenery." : "Spatial safety failed: actor/body intersects solid scenery or requires unintended repositioning.");
	        return {
	            checked: true, pass: finalPass, humanCount: Number(result.humanCount || 0),
	            identityPass: strictIdentityPass, identityDetails, locationPass: toBool(result.locationPass),
	            verticalPass, singleFramePass, allCharactersVisible, framingPass, fullFramePass, spatialSafetyPass,
	            referencedTargetVisiblePass, continuityPresencePass, positionContinuityPass, propAppearancePass,
	            wardrobeContinuityPass, anatomyPass, headDirectionPass, stateContinuityPass, dialogueEyelinePass,
	            imageWidth: dimensions.width, imageHeight: dimensions.height,
	            issues: [...new Set(issues.filter(Boolean))],
	        };
	    };
	    const buildQaRegenerationFeedback = (shot, qa) => {
	        if (!shot || !qa?.checked || qa.pass) return [];
	        const feedback: string[] = [];
	        const requiredCharacterState = buildCharacterStateLock(shot);
		        if (Number(qa.humanCount) !== Number(shot.expectedHumanCount)) {
		            feedback.push(`Human count failed: render exactly ${shot.expectedHumanCount} visible human(s), no extras, no duplicates, no missing cast. Previous candidate counted ${Number(qa.humanCount || 0)}.`);
		            if (Number(qa.humanCount || 0) > Number(shot.expectedHumanCount || 0)) {
		                feedback.push(`Extra human removal required: allowed cast IDs are ONLY ${shot.characterIds.join(", ") || "NONE"}. Remove every unlisted person from previous continuity, prop reference, location reference, background, doorway, center frame, reflection, or crowd. Do not preserve extra humans for continuity.`);
		            }
		        }
		        if (!qa.identityPass) {
		            const failedIdentityIds = Array.isArray(qa.identityDetails)
		                ? qa.identityDetails.filter((item) => item && item.match !== true)
		                : [];
	            if (failedIdentityIds.length) {
	                failedIdentityIds.forEach((item) => {
	                    const char = characterMap.get(item.characterId);
	                    feedback.push(`${item.characterId} (${char?.name || item.characterId}) IDENTITY FAILED: face/hair/skin/wardrobe must match THIS character's own reference tile on the CHARACTER_IDENTITY_BOARD / CHARACTER_MASTER image. Do not blend with any other character. Reason: ${toText(item.reason) || "unknown"}.`);
	                });
	            } else {
	                feedback.push(`Identity failed: independently match EVERY listed character (${shot.characterIds.join(", ")}) to its own CHARACTER_MASTER. Do not average or swap faces.`);
		            }
		            feedback.push(`Wardrobe lock per character: each character's outfit shape, color, pattern, sleeve/collar/neckline, accessories, footwear, and fabric must match THEIR OWN reference tile, not another character's.`);
		            feedback.push(`Reference contamination guard: if a CHARACTER_MASTER tile contains background soldiers/guards/crowds/partial people, ignore those humans completely. Only the centered main labeled person in each tile is the valid identity and wardrobe source.`);
		        }
	        if (!qa.verticalPass) feedback.push(`Format failed: regenerate as one strict ${projectAspectLabel} frame.`);
	        if (!qa.singleFramePass) feedback.push("Single-frame failed: output one continuous photographic frame only, no collage, no split-screen, no multiple panels.");
	        if (!qa.fullFramePass) feedback.push(`Full-frame failed: fill the entire ${projectAspectRatio} canvas edge-to-edge with real scene content. No letterbox/pillarbox bars, no blurred/dark padding, no inset image, no vignette mask, no giant empty dark top/bottom band. Generate an HD full-frame scene, not a padded image.`);
	        if (!qa.allCharactersVisible) feedback.push(`Visibility failed: every expected character must be visible simultaneously in the same frame: ${shot.characterIds.join(", ") || "NONE"}. Keep all required characters FULLY inside frame with safe margins.`);
	        if (!qa.framingPass) {
	            feedback.push(`Framing failed — NO CROPPING ALLOWED: every required character (${shot.characterIds.join(", ") || "NONE"}) must be rendered FULLY INSIDE the ${projectAspectRatio} canvas with at least 8% safe margin from every edge (top, bottom, left, right). Do NOT crop any character's head, hair, face, hands, torso, hips, or legs against the border.`);
	            feedback.push(`To fix cropping: zoom OUT / move the camera BACK / widen field of view / reduce subject scale / recenter the group. It is OK to lose dramatic tightness to gain full cast visibility.`);
	            feedback.push(`NO required character may be used as a partial/off-screen foreground body. If ${shot.characterIds.join(", ")} cannot fit at the current framing, WIDEN until all fit.`);
	        }
	        if (!qa.locationPass) feedback.push(`Location failed: keep the generated image inside locked location ${shot.locationId} and preserve the supplied LOCATION_MASTER set.`);
	        if (!qa.spatialSafetyPass) feedback.push(shot.movementMode === "LOCOMOTION" ? "Spatial safety failed: show a clear start path and keep bodies from intersecting furniture, walls, props, or other people." : "Spatial safety failed: keep bodies naturally placed without intersecting furniture, walls, props, or other people.");
	        if (!qa.referencedTargetVisiblePass) feedback.push(`Referenced target failed: required/referenced visible characters must be readable: ${mergeIdLists(shot.mustRemainVisibleIds, shot.referencedVisibleTargetIds).join(", ") || "NONE"}.`);
	        if (!qa.continuityPresencePass) feedback.push("Presence continuity failed: carry-over/required characters from the continuity setup must remain physically present and visible.");
	        if (!qa.positionContinuityPass) feedback.push("Position continuity failed: preserve previous QA anchor micro-location, camera-facing direction, locked-prop screen side/depth/world position, apparent object size/scale, left/right object order, distance between character and prop, and recurring furniture placement. Do NOT freeze the previous CHARACTER pose — current character pose/blocking must follow the current action beat. Opening/closing/inspecting a prop may change lid/contents state but must NOT teleport, resize, rotate to a new silhouette, or move the prop to another screen side unless ACTION explicitly relocates it.");
	        if (!qa.propAppearancePass) {
	            const issuesText = normalizeIssues(qa.issues).join(" ");
	            feedback.push(`Prop identity failed: preserve every locked/recurring prop's exact color, stripe/check/print/logo/marking pattern, material, texture, dirt/wear, and distinctive details so it remains the SAME prop. Do not turn patterned props into plain solid-color props. Do not replace the prop with a generic similar object. Action-driven state changes such as opened / lid-up / contents-visible are allowed only when required and must still keep the same prop identity. Locked prop IDs: ${(shot.propIds || []).join(", ") || "inspect recurring props from previous QA anchor"}.`);
	            feedback.push(`Prop scale/placement lock: the locked prop must keep the SAME apparent width/height proportions, same base footprint, same depth, same screen side, same distance to the active character, and same relationship to steps/floor/furniture. Do not shrink, enlarge, redesign, or move the prop while opening/inspecting it.`);
	            if (/(unattended|center of the frame|placed unattended|different spear|holds a different|handling state|screen placement)/i.test(issuesText)) {
	                feedback.push(`Prop handling failed: each locked prop must stay with its required character/hand according to continuity and action. Locked prop IDs for this shot: ${(shot.propIds || []).join(", ") || "NONE"}. Do not place a required held prop unattended or substitute it with another object.`);
	            }
	            const wrongSpearMatch = issuesText.match(/held by\s+([^.;\n]+?)\s+is\s+(?:a\s+)?(?:conventional\s+)?(?:spear|tombak|lance)[^.;\n]*not\s+(PROP_\d+)/i);
	            if (wrongSpearMatch) {
	                feedback.push(`Character-prop assignment failed: ${toText(wrongSpearMatch[1])} must not hold any spear/tombak/lance/pointed metal weapon. ${toText(wrongSpearMatch[1])}'s visible hand prop must be ${toText(wrongSpearMatch[2])} exactly, with no spearhead or substitute weapon.`);
	            }
	            const requiredSpearMatch = issuesText.match(/([^.;\n]+?)['’]s\s+required\s+(?:spear|tombak|lance)\s+is\s+not\s+clearly\s+visible/i);
	            if (requiredSpearMatch) {
	                feedback.push(`Required spear assignment failed: ${toText(requiredSpearMatch[1])} is the only character who may hold the required spear/tombak/lance in this shot. Do not move that spear to another character.`);
	            }
	            if (/(right[-\s]?hand|tangan kanan)/i.test(issuesText)) {
	                feedback.push(`Right-hand prop condition failed: the required locked prop must be visibly held in the right hand exactly as specified. Do not put it in the left hand, on the ground, on a table, or in another character's hand.`);
	            }
	            (shot.propIds || []).forEach((id) => {
	                const prop = propMap.get(id);
	                if (propLooksLikeStaff(prop, issuesText)) {
	                    feedback.push(`${id} staff/tongkat hard correction: render only a blunt aged dark-brown wooden staff with natural rounded root-knot top, one simple tarnished metal ring near the upper shaft, and a dull forged metal reinforcement ring around the blunt bottom. Absolutely no spearhead, no pointed metal head, no blade, no lance, no pike, no polearm, no shiny fantasy weapon.`);
	                }
	            });
	        }
	        const issuesTextForState = normalizeIssues(qa.issues).join(" ");
        if (hasPropClosedIntent(issuesTextForState)) {
            feedback.push(`Critical prop state failed: render the locked chest/container in the REQUIRED CLOSED state now. The lid must remain shut/down and contents must NOT be visible unless the current script action explicitly opens it.`);
        }
        if (!hasPropClosedIntent(issuesTextForState) && /lid\s+must\s+be\s+open|must\s+be\s+open|open-?chest\s+action\s+state\s+is\s+missing|required\s+end\s+state[^.\n;]*open/i.test(issuesTextForState)) {
            feedback.push(`Critical prop state failed: render the locked chest/container in the REQUIRED OPEN state now. The lid must already be visibly open in the anchor. Do NOT keep it closed or neutral.`);
        }
        if (!hasPropClosedIntent(issuesTextForState) && /see\s+the\s+contents|able\s+to\s+see\s+the\s+contents|contents?\s+visible|isi(?:nya)?\s+terlihat|melihat\s+isi/i.test(issuesTextForState)) {
            feedback.push(`Critical prop contents visibility failed: frame the locked chest/container so its inside/contents are visibly readable in the anchor.`);
        }
        if (!hasPropClosedIntent(issuesTextForState) && /continuity\s+state\s+failed/i.test(issuesTextForState) && /(open|opened|terbuka|contents?)/i.test(issuesTextForState)) {
            feedback.push(`Do not regress to a pre-action prop state. Preserve the required progressed continuity result exactly as described by QA.`);
        }
        const spatialIssueText = normalizeIssues(qa.issues).join(" ");
        if (/(screen[- ]?(?:left|right)|opposite side|moved from|left to right|right to left|relative placement|world position|prop placement)/i.test(spatialIssueText) && !/(explicitly moved|action relocates|placed|carried|dragged|pushed|pulled)/i.test(spatialIssueText)) {
            feedback.push(`Locked prop spatial correction: preserve every recurring locked prop on the SAME established screen side/depth/world position from PREVIOUS_CONTINUITY_ANCHOR. A state change such as open/closed/lid-up/contents-visible does NOT permit moving the prop across the frame.`);
        }
        if (!qa.wardrobeContinuityPass) {
	            feedback.push(`Wardrobe failed: preserve each character's exact visible wardrobe from THEIR OWN CHARACTER_MASTER tile (and PREVIOUS_CONTINUITY_ANCHOR when supplied): same blouse/top, vest/jacket presence and shape, kain/sarong motif, belt/sash color, headcloth/hair, footwear, accessories, sleeve/collar details, fabric texture, and fit. Do not redesign baju/costume. Do not swap outfit between characters.`);
	        }
        if (!qa.anatomyPass) feedback.push("Anatomy failed: regenerate with realistic hands and bodies; five natural fingers per visible hand, no fused/missing/extra fingers, no melted hands, no detached head, no broken neck, no warped limbs.");
		        if (!qa.stateContinuityPass) {
		            feedback.push(`State continuity failed. REQUIRED COMPACT PHYSICAL STATE CONTRACT:\n${buildCompactCharacterStateContract(shot)}\nRender the exact posture named for each character. KNEELING means visible knee contact with ground/floor/step; CROUCHING means low bent-knee weight on feet; SEATED means supported hips + bent knees; STANDING means standing-height feet support. Do NOT switch posture to fit composition.`);
                if (/\bstanding\b/i.test(buildCompactCharacterStateContract(shot)) && /\b(seated|sitting|sit|cross[-\s]?legged|bersila|duduk|kneeling|crouching|jongkok|squat)\b/i.test(issuesTextForState)) {
                    feedback.push("Standing-posture correction: any character contracted as STANDING must be upright at full standing height with feet on the floor/ground and extended legs visible/readable. Do NOT place the character seated cross-legged behind the prop, kneeling, crouching, squatting, or using the prop as a table/cover for folded legs.");
                }
		        }
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
            /required closed prop state|open_state=closed|required closed|contradicting the required closed|must remain closed|lid must remain shut|contents must not be visible/i.test(text) ||
            /required open prop state|open_state=open|must be open|open-chest action state is missing/i.test(text)
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
	            anchorQaFeedback: qa.pass ? [] : feedback,
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
            const selectedImageModeIsGemini = shouldUseGeminiChatImage(selectedImageProvider, imageModelForProvider(selectedImageProvider, selectedImageModel));
            let lastFailedAnchor = previousQaIssues.length && initialShot?.anchorImage && selectedImageModeIsGemini && !isHardAnchorStateCorrection(previousQaIssues)
	                ? initialShot.anchorImage
	                : "";
            for (let attempt = 1; attempt <= ANCHOR_QA_MAX_ATTEMPTS; attempt++) {
	                throwIfAnchorGenerationStopped(runId);
	                setProgress(`Anchor ${shotId} attempt ${attempt}/${ANCHOR_QA_MAX_ATTEMPTS} — ${lastFailedAnchor && selectedImageModeIsGemini ? "editing failed candidate" : `generating fresh ${projectAspectRatio} frame`}${previousQaIssues.length ? " with QA corrections" : ""}...`);
	                const anchor = await generateAnchor(shotId, previousQaIssues, runId, lastFailedAnchor);
	                throwIfAnchorGenerationStopped(runId);
	                const shot = repairShotForRuntime(shots.find((item) => item.id === shotId));
	                if (!shot) throw new Error("SHOT_NOT_FOUND_AFTER_ANCHOR");
	                const qa = await inspectAnchorCandidate(shot, anchor);
	                throwIfAnchorGenerationStopped(runId);
	                setShots((prev) => prev.map((item) => item.id === shotId ? { ...item, anchorImage: anchor, anchorStatus: "ready", qa } : item));
	                if (qa.pass) {
	                    setShots((prev) => prev.map((item) => item.id === shotId ? {
	                        ...item,
	                        qa,
	                        anchorQaFeedback: [],
	                        anchorNeedsManualFix: false,
	                    } : item));
	                    setProgress(`Anchor ${shotId} PASS — locked character identities + continuity verified.`);
	                    return true;
	                }
	                previousQaIssues = buildQaRegenerationFeedback(shot, qa);
	                lastFeedback = previousQaIssues;
                    lastFailedAnchor = selectedImageModeIsGemini && !isHardAnchorStateCorrection(previousQaIssues) ? anchor : "";
	                setShots((prev) => prev.map((item) => item.id === shotId ? {
	                    ...item,
	                    qa,
	                    anchorQaFeedback: previousQaIssues,
	                    anchorNeedsManualFix: !qa.pass,
	                } : item));
	                setProgress(attempt < ANCHOR_QA_MAX_ATTEMPTS
	                    ? `Anchor ${shotId} failed strict QA; next attempt will use ${previousQaIssues.length} QA correction(s)${lastFailedAnchor ? " and edit the failed candidate" : " with a fresh render from locked references"}.`
	                    : `Anchor ${shotId} failed strict QA. QA feedback saved; fix prompt/retry manually to avoid extra image spend.`);
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
            const selectedImageModeIsGemini = shouldUseGeminiChatImage(selectedImageProvider, imageModelForProvider(selectedImageProvider, selectedImageModel));
            const correctionSource = savedFeedback.length && shot?.anchorImage && selectedImageModeIsGemini ? shot.anchorImage : "";
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
    const prepareEpisodeAnchors = async (episodeNumber) => {
        const episodeShots = shots.filter((shot) => Number(shot.episode) === Number(episodeNumber));
        if (!episodeShots.length) { setError(`Tidak ada shot untuk Episode ${episodeNumber}.`); return; }
        const runId = beginAnchorGenerationRun();
        setBusy(true); setError("");
        try {
            for (let i = 0; i < episodeShots.length; i++) {
                if (isAnchorGenerationStopped(runId)) break;
                const shotId = episodeShots[i].id;
                setSelectedShotId(shotId);
                setProgress(`Episode ${episodeNumber}: anchor + QA ${i + 1}/${episodeShots.length}`);
                await regenerateAndValidateAnchor(shotId, { runId, manageBusy: false });
            }
        } catch (err) { handleError(err); } finally { setBusy(false); setProgress(""); }
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
        const shot = shots.find((item) => item.id === shotId);
        if (!shot) throw new Error("SHOT_NOT_FOUND");
        if (!shot.videoPrompt) throw new Error("MASTER_PROMPT_REQUIRED");
        if (!shot.anchorImage) throw new Error("ANCHOR_REQUIRED");
        const qaWarning = !shot.qa?.checked
            ? "QA belum dicek"
            : !shot.qa?.pass
                ? "QA FAIL"
                : "QA PASS";
        const runtimeVideoPrompt = buildModelVideoPrompt(shot, selectedVideoModel, selectedVideoModelInfo);
        if (runtimeVideoPrompt.length > VIDEO_PROMPT_API_LIMIT) throw new Error(`VIDEO_PROMPT_TOO_LONG_AFTER_COMPACT_${runtimeVideoPrompt.length}`);
        setShots((prev) => prev.map((item) => item.id === shotId
            ? { ...item, videoStatus: "generating", videoUrl: null, videoRemoteUri: null }
            : item));
        try {
            setProgress(`${shotId}: ${qaWarning} — tetap generate video. Sending ${runtimeVideoPrompt.length.toLocaleString()} char ${selectedVideoModel} prompt to OpenRouter video...`);
            const job = await startOpenRouterVideo({
                prompt: runtimeVideoPrompt,
                anchorImage: shot.anchorImage,
                aspectRatio: projectAspectRatio,
                durationSeconds: shot.durationSeconds || 8,
                model: selectedVideoModel,
                resolution: videoResolution,
                generateAudio: videoGenerateAudio,
            });
            const jobId = job.id || job.job_id || job.generation_id;
            if (!jobId) throw new Error("OPENROUTER_VIDEO_JOB_ID_MISSING");
            setShots((prev) => prev.map((item) => item.id === shotId
                ? { ...item, operationName: jobId, videoStatus: "generating" }
                : item));
            const completed = await pollOpenRouterVideo(jobId, (text) => setProgress(`${shotId}: ${text}`));
            setProgress(`${shotId}: downloading generated clip...`);
            const localBlobUrl = await downloadOpenRouterVideoToBlobUrl(jobId);
            const remoteUri = completed.unsigned_urls?.[0] || completed.polling_url || jobId;
            setShots((prev) => prev.map((item) => item.id === shotId
                ? { ...item, operationName: jobId, videoRemoteUri: remoteUri, videoUrl: localBlobUrl, videoStatus: "ready" }
                : item));
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
            const textarea = document.createElement("textarea");
            textarea.value = textValue;
            textarea.setAttribute("readonly", "");
            textarea.style.position = "fixed";
            textarea.style.top = "0";
            textarea.style.left = "0";
            textarea.style.width = "2em";
            textarea.style.height = "2em";
            textarea.style.padding = "0";
            textarea.style.border = "none";
            textarea.style.outline = "none";
            textarea.style.boxShadow = "none";
            textarea.style.background = "transparent";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            textarea.setSelectionRange(0, textarea.value.length);
            ok = document.execCommand("copy");
            document.body.removeChild(textarea);
        } catch (e) { ok = false; }
        if (!ok) {
            try {
                if (navigator?.clipboard?.writeText) {
                    await navigator.clipboard.writeText(textValue);
                    ok = true;
                }
            } catch (e) { ok = false; }
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
    const exportGeminiCookies = async () => {
        setError("");
        setProgress("Exporting active Gemini cookie session...");
        try {
            const response = await fetch(`${GEMINI_IMAGE_BRIDGE_ROOT}/sessions/export`, {
                method: "GET",
                cache: "no-store",
                headers: {
                    ...(GEMINI_IMAGE_BRIDGE_API_KEY ? { Authorization: `Bearer ${GEMINI_IMAGE_BRIDGE_API_KEY}` } : {}),
                    ...(GEMINI_IMAGE_BRIDGE_ROOT.includes("ngrok") ? { "ngrok-skip-browser-warning": "true" } : {}),
                },
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.ok) throw new Error(result?.detail || result?.error || `HTTP_${response.status}`);
            const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            downloadBlobUrl(url, `gemini-session-cookies-${stamp}.json`);
            window.setTimeout(() => URL.revokeObjectURL(url), 30000);
            setProgress("Gemini cookie export downloaded.");
            window.setTimeout(() => setProgress(""), 1600);
        } catch (err) {
            handleError(err);
            setProgress("");
        }
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
    const formatDuration = (ms) => {
        const seconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
        if (seconds < 60) return `${seconds}s`;
        return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
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
            : `OpenRouter GPT usage${accountCredits.fetchedAt ? ` • updated ${new Date(accountCredits.fetchedAt).toLocaleTimeString("id-ID")}` : ""} • ${creditDebugText}`;
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

    const navigation = [
        { id: "project", label: "PROJECT", icon: <Film size={15}/> },
        { id: "assets", label: "ASSETS", icon: <Users size={15}/> },
        { id: "episodes", label: "EPISODES", icon: <Clapperboard size={15}/> },
        { id: "scripts", label: "SCRIPT", icon: <ScrollText size={15}/> },
        { id: "shots", label: "SHOTS", icon: <ImageIcon size={15}/> },
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
          <StatusBadge label={`${episodes.length}/${project.episodeCount} EP`} active={episodes.length > 0 && episodes.length === project.episodeCount}/>
          <StatusBadge label={`${shots.filter((x) => x.qa.pass).length}/${shots.length} QA`} active={shots.length > 0 && shots.every((shot) => shot.qa.pass)}/>
          <div className="credit-cluster" title={creditStatusTitle}>
            <div className={`credit-chip ${accountCredits.status === "error" ? "credit-error" : ""}`} title={flashCredits ? formatCreditReset(flashCredits) : creditStatusTitle}>
              <span className="credit-name">TEXT</span>
              <strong>{formatCredits(flashCredits)}</strong>
            </div>
            <div className={`credit-chip ${accountCredits.status === "error" ? "credit-error" : ""}`} title={proCredits ? formatCreditReset(proCredits) : creditStatusTitle}>
              <span className="credit-name">IMAGE</span>
              <strong>{formatCredits(proCredits)}</strong>
            </div>
            <button type="button" className="credit-refresh" disabled={creditsRefreshing} onClick={() => loadGeminiCredits({ silent: false, forceCookieRefresh: true })} title="Refresh OpenRouter usage">
              <RefreshCw size={12} className={creditsRefreshing ? "animate-spin" : ""}/>
            </button>
          </div>
          <label
            className={`provider-chip ${selectedImageProvider === IMAGE_PROVIDER_OPENROUTER ? "on" : "off"}`}
            title={selectedImageProvider === IMAGE_PROVIDER_OPENROUTER
              ? "ON: production assets + anchor via OpenRouter bridge"
              : "OFF: production assets + anchor via Gemini bridge; scripting tetap OpenRouter"}
          >
            <input
              type="checkbox"
              checked={selectedImageProvider === IMAGE_PROVIDER_OPENROUTER}
              onChange={(event) => setImageProviderForProject(event.target.checked ? IMAGE_PROVIDER_OPENROUTER : IMAGE_PROVIDER_GEMINI)}
            />
            <span className="provider-chip-label">IMG</span>
            <strong>{selectedImageProvider === IMAGE_PROVIDER_OPENROUTER ? "OPENROUTER" : "GEMINI"}</strong>
          </label>
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
          <div className="side-label credit-side-title">COUNTSISTENT CREDITS</div>
          <div className="credit-side-panel">
            <div className="credit-side-row">
              <span>TEXT</span>
              <strong>{formatCredits(flashCredits)}</strong>
            </div>
            <div className="credit-reset">{flashCredits ? formatCreditReset(flashCredits) : accountCredits.status.toUpperCase()}</div>
            <div className="credit-side-row mt-3">
              <span>IMAGE</span>
              <strong>{formatCredits(proCredits)}</strong>
            </div>
            <div className="credit-reset">{proCredits ? formatCreditReset(proCredits) : accountCredits.status.toUpperCase()}</div>
            {accountCredits.aiCreditsRemaining !== null && accountCredits.aiCreditsRemaining !== undefined && (
              <div className="credit-side-row mt-3">
                <span>AI CREDITS</span>
                <strong>{Number(accountCredits.aiCreditsRemaining).toLocaleString("id-ID")}</strong>
              </div>
            )}
            {!!detectedCreditRows.length && (
              <div className="credit-detected">
                <button type="button" className="credit-detected-toggle" onClick={() => setCreditsDetectedOpen((prev) => !prev)}>
                  <span>DETECTED QUOTAS</span>
                  <ChevronRight size={12} className={creditsDetectedOpen ? "credit-detected-chevron open" : "credit-detected-chevron"}/>
                </button>
                {creditsDetectedOpen && detectedCreditRows.map((quota) => (
                  <div key={quotaKey(quota)} className="credit-detected-row">
                    <span>{quota.label}</span>
                    <strong>{formatCredits(quota)}</strong>
                  </div>
                ))}
              </div>
            )}
            {!detectedCreditRows.length && !!detectedModelRows.length && (
              <div className="credit-detected">
                <button type="button" className="credit-detected-toggle" onClick={() => setCreditsDetectedOpen((prev) => !prev)}>
                  <span>MODEL STATUS</span>
                  <ChevronRight size={12} className={creditsDetectedOpen ? "credit-detected-chevron open" : "credit-detected-chevron"}/>
                </button>
                {creditsDetectedOpen && detectedModelRows.map((model) => (
                  <div key={model.model_name || model.display_name} className="credit-detected-row">
                    <span>{model.display_name || model.model_name}</span>
                    <strong>{model.available ? "READY" : "LOCKED"}</strong>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="credit-side-refresh" disabled={creditsRefreshing} onClick={() => loadGeminiCredits({ silent: false, forceCookieRefresh: true })}>
              <RefreshCw size={11} className={creditsRefreshing ? "animate-spin" : ""}/>
              REFRESH CREDITS
            </button>
            {accountCredits.error && <div className="credit-side-error">{accountCredits.error}</div>}
          </div>
          <div className="side-divider"/>
          <div className="strict"><ShieldCheck size={14}/>STRICT CONTEXT</div>
          <p className="side-note mono text-[10px] muted leading-5 mt-3">
            LOCKED DATA OVERRIDES AI CREATIVITY.
            <br />
            ONE LOCATION PER SHOT.
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
                        setProject((prev) => ({
                            ...prev,
                            regionMode: value,
                            country: nextCountry,
                            language: getCountryLanguage(nextCountry),
                        }));
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
                      onChange={(value) => setProject((prev) => ({
                          ...prev,
                          country: value,
                          language: getCountryLanguage(value),
                      }))}
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
                <Panel title="AI VISUAL DIRECTOR" icon={<ImageIcon size={16}/>}>
                  <div className="flex justify-between items-center">
                    <div className="field-label">VISUAL STYLE</div>
                    <FieldStatus empty={!project.visualStyle} outdated={visualOutdated}/>
                  </div>
                  <textarea className="input" rows={toText(project.visualStyle) ? 4 : 2} value={project.visualStyle} onChange={(event) => { setProject((prev) => ({ ...prev, visualStyle: event.target.value })); setVisualSource(projectContextKey); }} placeholder="Generated visual style..."/>
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
                  <textarea className="input" rows={toText(project.storyRules) ? 4 : 2} value={project.storyRules} onChange={(event) => { setProject((prev) => ({ ...prev, storyRules: event.target.value })); setGuardSource(projectContextKey); }} placeholder="Generated strict continuity rules..."/>
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
                    <button type="button" disabled={busy || characters.some((item) => !item.locked) || locations.some((item) => !item.locked)} onClick={generateEpisodeManifest} className="primary"><Clapperboard size={14}/>GENERATE EPISODE MANIFEST</button>
                  </div>
                </>
              )}
            </section>)}
          {stage === "episodes" && (<section>
              <PageTitle code="03" title="EPISODE MANIFEST" subtitle="AI Producer schedules only approved locked assets."/>
              {episodes.length === 0 ? (
                <EmptyState title="TIDAK ADA EPISODES"/>
              ) : (
                <>
                  <EpisodeTabs episodes={episodes} selected={selectedEpisode} onChange={setSelectedEpisode}/>
                  {episodes.filter((item) => item.episode === selectedEpisode).map((episode) => (<Panel key={episode.episode} title={`EP ${pad(episode.episode, 2)} // ${episode.title}`} icon={<Clapperboard size={16}/>}>
                        <Info label="LOGLINE" value={episode.logline}/>
                        <Info label="OBJECTIVE" value={episode.objective}/>
                        <div className="grid md:grid-cols-3 gap-3">
                          <Ids title="CAST" items={episode.characterIds}/>
                          <Ids title="LOCATIONS" items={episode.locationIds}/>
                          <Ids title="PROPS" items={episode.propIds}/>
                        </div>
	                        <Info label="OPENING STATE" value={episode.openingState}/>
	                        <Info label="ENDING STATE" value={episode.endingState}/>
	                        <div className="locked"><Lock size={11}/>EPISODE MANIFEST LOCKED</div>
                      </Panel>))}
                  <div className="action-bar">
                    <button type="button" disabled={busy || episodes.length === 0} onClick={generateAllScripts} className="primary"><ScrollText size={14}/>GENERATE ALL SCRIPTS</button>
                  </div>
                </>
              )}
            </section>)}
          {stage === "scripts" && (<section>
              <PageTitle code="04" title="CONTROLLED SCRIPT" subtitle="Automatic Continuity Bridge repairs earlier setup from later scene dependencies."/>
              {episodes.length === 0 ? (
                <EmptyState title="TIDAK ADA EPISODES"/>
              ) : (
                <>
                  <EpisodeTabs episodes={episodes} selected={selectedEpisode} onChange={setSelectedEpisode}/>
                  <div className="space-y-4 mt-5">
                    {(scripts[selectedEpisode] || []).length ? (scripts[selectedEpisode] || []).map((scene) => (<Panel key={scene.id} title={scene.id} icon={<ScrollText size={16}/>}>
                        <div className="mono cyan text-[12px]">LOCATION // {scene.locationId}</div>
                        <div className="mono muted text-[12px]">CAST // {scene.characterIds.join(" + ") || "NONE"}</div>
                        <div className="info">{scene.action}</div>
                        <div className="grid md:grid-cols-2 gap-3">
                          <Info label="MOTION POLICY" value={scene.movementPolicy || "STATIC"}/>
                          <Info label="CONTINUITY BRIDGE" value={scene.continuityRevised ? "AUTO-REVISED" : "NO REVISION"} accent={scene.continuityRevised}/>
                        </div>
                        {scene.continuitySetup && (<Info label="CONTINUITY SETUP" value={scene.continuitySetup}/>)}
                        {scene.requiredVisibleCharacterIds?.length > 0 && (<Info label="REQUIRED VISIBLE CAST" value={scene.requiredVisibleCharacterIds.join(" + ")}/>)}
                        {scene.carryOverCharacterIds?.length > 0 && (<Info label="CARRY-OVER CAST" value={scene.carryOverCharacterIds.join(" + ")}/>)}
                        {scene.incidentalSetDressing?.length > 0 && (<Info label="INCIDENTAL SET DRESSING" value={scene.incidentalSetDressing.join(" • ")}/>)}
                        {scene.dialogue.map((line, index) => (<div className="dialogue" key={index}>
                            <strong>{line.characterId}</strong>
                            <span>{line.text}</span>
                          </div>))}
                      </Panel>)) : <EmptyState title="TIDAK ADA SCRIPT UNTUK EPISODE INI"/>}
                  </div>
                  <div className="action-bar">
                    <button type="button" disabled={busy || episodes.length === 0} onClick={generateAllScripts} className="secondary"><ScrollText size={14}/>{Object.keys(scripts).length ? "REGENERATE ALL SCRIPTS" : "GENERATE ALL SCRIPTS"}</button>
                    <button type="button" disabled={busy || !Object.keys(scripts).length} onClick={rerunContinuityBridge} className="secondary"><RefreshCw size={14}/>RE-RUN CONTINUITY BRIDGE</button>
                    <button type="button" disabled={busy || !Object.keys(scripts).length} onClick={generateAllShots} className="primary"><ImageIcon size={14}/>GENERATE SHOT MANIFEST</button>
                  </div>
                </>
              )}
            </section>)}
          {stage === "shots" && (<section>
              <PageTitle code="05" title="SHOT MANIFEST" subtitle="Director Mode uses 4/6/8/10 second shots with opening establishers and natural final reactions."/>
              {shots.length === 0 ? (
                <EmptyState title="TIDAK ADA SHOTS"/>
              ) : (
                <>
                  <div className="shot-list">
                    {shots.map((shot) => (<button key={shot.id} type="button" onClick={() => setSelectedShotId(shot.id)} className={selectedShotId === shot.id ? "shot active" : "shot"}>
                        <span className="cyan">{shot.id}</span>
                        <span>EP {shot.episode}</span>
                        <span>{shot.expectedHumanCount} HUMAN</span>
                        <span>{shot.locationId}</span>
                        <span className={shot.movementMode === "LOCOMOTION" ? "cyan" : "green"}>{shot.movementMode === "LOCOMOTION" ? "MOVE" : "STATIC"} · {shot.durationSeconds || 8} SEC</span>
                      </button>))}
                  </div>
                  <div className="action-bar">
                    <button type="button" disabled={busy || shots.length === 0} onClick={compileAllVideoPrompts} className="primary"><Terminal size={14}/>MASTER PROMPT COMPILE</button>
                  </div>
                </>
              )}
            </section>)}
          {stage === "render" && (<section>
              <PageTitle code="06" title="SCENE ANCHOR → CONTINUITY QA → OPENROUTER VIDEO" subtitle="Production assets dan anchor bisa pakai Gemini/native atau OpenRouter; scripting tetap OpenRouter."/>
              {shots.length === 0 ? (<EmptyState title="TIDAK ADA SHOTS"/>) : (<div className="render-grid grid xl:grid-cols-[320px_1fr] gap-5">
                <div className="panel shot-queue-panel">
                  <div className="panel-header"><Clapperboard size={15}/>SHOT QUEUE</div>
                  <div className="shot-queue-list p-3 space-y-2">
                    {shots.map((shot) => (<button key={shot.id} type="button" onClick={() => setSelectedShotId(shot.id)} className={selectedShotId === shot.id ? "render-shot active" : "render-shot"}>
                        <div>
                          <div className="mono cyan text-[11px]">{shot.id}</div>
                          <div className="mono muted text-[11px] mt-1">{shot.characterIds.join(" + ") || "NO CAST"}</div>
                        </div>
                        <div className="flex gap-2 items-center">
                          {shot.qa.pass && (<ShieldCheck size={14} className="green"/>)}
                          {shot.videoStatus === "ready" && (<Play size={14} className="cyan"/>)}
                        </div>
                      </button>))}
                  </div>
                </div>
                {selectedShot ? (<div className="space-y-5">
                    <Panel title={`MASTER PROMPT // ${selectedShot.id}`} icon={<Terminal size={16}/>}>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <Mini label="HUMANS" value={String(selectedShot.expectedHumanCount)}/>
                        <Mini label="LOCATION" value={selectedShot.locationId}/>
	                        <Mini label="LENGTH" value={`${selectedShot.durationSeconds || 8} SEC`}/>
                        <Mini label="PROMPT" value={`${selectedModelVideoPrompt.length.toLocaleString()} CH`}/>
                        <Mini label="QA" value={selectedShot.qa.pass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}/>
                      </div>
                      <div className="shot-dialogue-editor">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <span>DIALOGUE</span>
                          <div className="flex gap-2 flex-wrap">
                            <button type="button" disabled={busy || !(selectedShot.characterIds || []).length} onClick={generateDialogueForSelectedShot} className="secondary">
                              <Sparkles size={13}/>
                              AUTO GENERATE DIALOGUE
                            </button>
                            <button type="button" disabled={busy || savingProject} onClick={saveSelectedShotDialogue} className="secondary">
                              {savingProject ? <Loader2 size={13} className="animate-spin"/> : <Save size={13}/>} SAVE DIALOGUE
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={formatShotDialogueForEdit(selectedShot)}
                          onChange={(event) => updateSelectedShotDialogueText(event.target.value)}
                          rows={Math.max(4, (selectedShot.dialogue?.length || 0) + 1)}
                          placeholder="Click AUTO GENERATE DIALOGUE or type manually. Format: CHAR_001: dialogue"
                        />
                        <div className="mono muted text-[11px] mt-2">
                          Dialogue dibuat otomatis berdasarkan shot, karakter, lokasi, action, durasi, dan scene context. Kamu tetap bisa edit manual lalu tekan SAVE DIALOGUE.
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
                      </div>
                      {promptExpanded && (<pre className="prompt-output">{selectedModelVideoPrompt}</pre>)}
                    </Panel>
	                    <div className="grid lg:grid-cols-2 gap-5">
	                      <Panel title={`SCENE ANCHOR // ${projectAspectRatio} SINGLE FRAME`} icon={<ImageIcon size={16}/>}> 
	                        <div className="image-model-picker">
	                          <div className="flex items-center justify-between gap-2">
	                            <span className="field-label" style={{marginBottom:0}}>IMAGE MODEL ({selectedImageProvider === IMAGE_PROVIDER_OPENROUTER ? "OPENROUTER" : "GEMINI"})</span>
	                            <span className="mono muted text-[10px] break-all">
                                {selectedImageProvider === IMAGE_PROVIDER_GEMINI
                                  ? `${imageModelForProvider(selectedImageProvider, selectedImageModel)} bridge`
                                  : selectedImageModel}
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
                              <option key={model.id} value={model.id}>
                                {model.label} — {model.id}
                              </option>
                            ))}
                            <option value="__custom__">Custom model id…</option>
                          </select>

                          <div className="grid md:grid-cols-[1fr_auto] gap-2 items-stretch">
                            <input
                              className="input"
                              placeholder="cth: openai/gpt-image-1, google/gemini-2.5-flash-image, …"
                              value={customImageModel}
                              onChange={(event) => setCustomImageModel(event.target.value)}
                              onKeyDown={(event) => {
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
	                            Model ini dipakai untuk generate <b>Scene Anchor</b> dan <b>Character/Location/Prop reference</b>.
	                            Ganti kapan saja sebelum menekan GENERATE ANCHOR / GENERATE + QA ANCHOR.
                            Nilai disimpan otomatis di snapshot workspace.
                            {shouldUseGeminiChatImage(selectedImageProvider, imageModelForProvider(selectedImageProvider, selectedImageModel)) && (
                              <>
                                <br/>
                                <span className="green">
                                  Mode Gemini: endpoint /chat/completions, bridge model {imageModelForProvider(selectedImageProvider, selectedImageModel)}, maksimal {GEMINI_IMAGE_MAX_REFERENCES} references per request.
                                  Karakter 1–2 memakai CHARACTER_MASTER individual. Karakter &gt; 2 baru digabung ke CHARACTER_IDENTITY_BOARD agar slot reference Gemini tidak mengorbankan identitas.
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="anchor-frame" style={anchorFrameStyle}>
                          {selectedShot.anchorStatus === "generating" ? (
                            <div className="anchor-loading-state">
                              <Loader2 size={30} className="animate-spin green"/>
                              <button type="button" className="anchor-stop-button" onClick={stopAnchorGeneration}>
                                <Square size={13}/>
                                STOP
                              </button>
                            </div>
                          ) : selectedShot.anchorImage ? (<img src={selectedShot.anchorImage} alt={`${selectedShot.id} anchor`}/>) : (<ImageIcon size={32} className="muted"/>)}
                        </div>
                        <button
                          type="button"
                          disabled={!selectedShot.anchorImage}
                          onClick={() => {
                            if (!selectedShot.anchorImage) return;
                            downloadBlobUrl(selectedShot.anchorImage, `${selectedShot.id}_ANCHOR.png`);
                          }}
                          className="secondary w-full"
                        >
                          <Download size={14}/>
                          DOWNLOAD ANCHOR IMAGE
                        </button>
                        <div className="grid gap-3">
                          <button type="button" disabled={busy || selectedShot.anchorStatus === "generating"} onClick={generateSelectedAnchorOnly} className="secondary w-full"><Sparkles size={14}/>GENERATE ANCHOR</button>
                          <button type="button" disabled={busy || selectedShot.anchorStatus === "generating"} onClick={prepareSelectedShot} className="secondary w-full"><ShieldCheck size={14}/>GENERATE + QA ANCHOR</button>
                          <button type="button" disabled={busy || savingProject || selectedShot.anchorStatus === "generating"} onClick={clearReferenceImagesNow} className="secondary w-full"><Trash2 size={14}/>RESET REFERENCES + ANCHORS</button>
                          <button type="button" disabled={busy || shots.length === 0} onClick={() => prepareEpisodeAnchors(selectedEpisode)} className="secondary w-full"><Layers3 size={14}/>BULK ANCHOR + QA EPISODE</button>
                          <button type="button" disabled={busy || shots.length === 0} onClick={prepareAllAnchors} className="secondary w-full"><Boxes size={14}/>BULK ANCHOR + QA ALL SHOTS</button>
                        </div>
                      </Panel>
                      <Panel title="CONTINUITY QA" icon={<ShieldCheck size={16}/>}>
                        <div className={`qa ${selectedShot.qa.pass ? "pass" : selectedShot.qa.checked ? "fail" : ""}`}>
                          <ShieldCheck size={22}/>
                          <div>
                            <div className="orbitron text-sm">{selectedShot.qa.pass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}</div>
                            <div className="mono text-[11px] mt-2">DETECTED HUMANS: {selectedShot.qa.humanCount}</div>
                            <div className="mono text-[11px] mt-1">IDENTITY: {selectedShot.qa.identityPass ? "PASS" : "PENDING"}</div>
                            <div className="mono text-[11px] mt-1">LOCATION: {selectedShot.qa.locationPass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}</div>
                            <div className="mono text-[11px] mt-1">SPATIAL SAFETY: {selectedShot.qa.spatialSafetyPass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}</div>
                            <div className="mono text-[11px] mt-1">REFERENCED TARGET: {selectedShot.qa.referencedTargetVisiblePass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}</div>
	                            <div className="mono text-[11px] mt-1">PRESENCE CONTINUITY: {selectedShot.qa.continuityPresencePass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}</div>
	                            <div className="mono text-[11px] mt-1">POSITION CONTINUITY: {selectedShot.qa.positionContinuityPass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}</div>
	                            <div className="mono text-[11px] mt-1">PROP APPEARANCE: {selectedShot.qa.propAppearancePass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}</div>
	                            <div className="mono text-[11px] mt-1">WARDROBE: {selectedShot.qa.wardrobeContinuityPass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}</div>
	                            <div className="mono text-[11px] mt-1">ANATOMY/HANDS: {selectedShot.qa.anatomyPass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}</div>
	                            <div className="mono text-[11px] mt-1">HEAD DIRECTION: VIDEO ONLY</div>
	                            <div className="mono text-[11px] mt-1">STATE CONTINUITY: {selectedShot.qa.stateContinuityPass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}</div>
                            <div className="mono text-[11px] mt-1">DIALOGUE EYELINE: VIDEO ONLY</div>
                            <div className="mono text-[11px] mt-1">FORMAT {projectAspectRatio}: {selectedShot.qa.verticalPass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}</div>
                            <div className="mono text-[11px] mt-1">SINGLE FRAME: {selectedShot.qa.singleFramePass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}</div>
                            <div className="mono text-[11px] mt-1">ALL CAST VISIBLE: {selectedShot.qa.allCharactersVisible ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}</div>
                            <div className="mono text-[11px] mt-1">FULL FRAME HD: {selectedShot.qa.fullFramePass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}</div>
                            <div className="mono text-[11px] mt-1">SAFE FRAMING: {selectedShot.qa.framingPass ? "PASS" : selectedShot.qa.checked ? "FAIL" : "PENDING"}</div>
                            {selectedShot.qa.imageWidth > 0 && selectedShot.qa.imageHeight > 0 && (<div className="mono text-[11px] mt-1 muted">FRAME: {selectedShot.qa.imageWidth}×{selectedShot.qa.imageHeight}</div>)}
                          </div>
	                        </div>
	                        {selectedShot.qa.issues.map((issue, index) => (<div className="qa-issue" key={index}>{issue}</div>))}
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
	                        <Panel title="OPENROUTER IMAGE-TO-VIDEO" icon={<Play size={16}/>}>
                          <div className="grid md:grid-cols-2 gap-3 mb-4">
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
                                {((selectedVideoModelInfo?.supportedResolutions?.length ? selectedVideoModelInfo.supportedResolutions : ["480p", "720p", "1080p"])).map((item) => (
                                  <option key={item} value={item}>{item}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label className="toggle-row mb-4">
                            <input type="checkbox" checked={videoGenerateAudio} onChange={(event) => setVideoGenerateAudio(event.target.checked)}/>
                            <span>Generate audio jika model mendukung</span>
                          </label>
                          <div className="mono muted text-[10px] leading-5 mb-4">
                            {videoModelsLoading ? "Loading video model catalog..." : `Model: ${selectedVideoModel}`}
                            <br/>
                            Prompt profile: {selectedVideoPromptProfile.targetChars.toLocaleString()} char target · current {selectedModelVideoPrompt.length.toLocaleString()} char
                            <br/>
                            Estimasi shot ini: {formatUsd(estimateVideoCost(selectedVideoModelInfo, selectedShot.durationSeconds || 8) || 0, 4)}
                            {selectedVideoModelInfo?.pricingSkus && (
                              <> · Pricing: {Object.entries(selectedVideoModelInfo.pricingSkus).slice(0, 3).map(([key, value]) => `${key}=${value}`).join(" · ")}</>
                            )}
                          </div>
	                          {selectedShot.videoUrl ? (
	                            <video src={selectedShot.videoUrl} controls playsInline className={`video-preview ${projectAspectRatio === "9:16" ? "portrait" : "landscape"}`}/>
                          ) : (
                            <div className="video-empty">
                              {selectedShot.videoStatus === "generating" ? (
                                <>
                                  <Loader2 size={30} className="animate-spin green"/>
	                                  <span>OPENROUTER VIDEO GENERATING...</span>
                                </>
                              ) : (
                                <>
                                  <Play size={30}/>
                                  <span>VIDEO NOT GENERATED</span>
                                </>
                              )}
                            </div>
                          )}
                          {!selectedShot.qa?.pass && selectedShot.anchorImage && (
                            <div className="error-box mb-3">
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
	                              disabled={busy || !selectedShot.anchorImage || !selectedModelVideoPrompt || selectedShot.videoStatus === "generating"}
	                              onClick={renderSelectedShot}
	                              className="primary"
	                              title={selectedShot.qa?.pass
                                    ? "Kirim anchor image + master prompt ke OpenRouter video API"
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
	                            <div className="mono muted text-[11px] break-all">
	                              OPENROUTER VIDEO: {selectedShot.videoRemoteUri}
	                            </div>
	                          )}
	                          <div className="mono muted text-[10px] leading-5">
	                            Mode: <span className="cyan">first-frame image-to-video</span>. Anchor image menjadi frame awal, master prompt mengontrol gerak.
	                          </div>
                        </Panel>
                      </Panel>
                    </div>
	                  </div>) : (<EmptyState title="PILIH SHOT"/>)}
	              </div>)}
	            </section>)}
          {stage === "gemini-session" && (
            <GeminiSessionView
              sessionState={geminiSessions}
              refreshing={sessionsRefreshing}
              onRefresh={() => loadGeminiSessions({ silent: false })}
              onForceRefresh={() => loadGeminiSessions({ silent: false, forceCookieRefresh: true })}
              onExport={exportGeminiCookies}
            />
          )}
	          </>)}
	        </main>
      </div>
        </>)}
      <style dangerouslySetInnerHTML={{
            __html: `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap');
	*{box-sizing:border-box}
	html,body,#root{max-width:100vw;overflow-x:hidden}
	body{margin:0;background:#f7f8fa;color:#000000;font-family:"Poppins",system-ui,-apple-system,sans-serif}
	.studio{--bg:#f7f8fa;--panel:#ffffff;--panel-2:#f3f4f6;--line:#e5e7eb;--line-soft:#eef0f3;--text:#000000;--muted:#4b5563;--muted-2:#6b7280;--green:#000000;--cyan:#0284c7;--amber:#d97706;--rose:#dc2626;position:relative;isolation:isolate;overflow-x:hidden;width:100%;max-width:100vw;min-height:100vh;background:linear-gradient(180deg,#ffffff 0%,#f7f8fa 42%,#eff2f6 100%);color:var(--text);font-family:"Poppins",system-ui,-apple-system,sans-serif}
	.studio h1,.studio h2{letter-spacing:0;color:#000000;font-family:"Poppins",system-ui,-apple-system,sans-serif;font-weight:700}
	.studio *{font-family:"Poppins",system-ui,-apple-system,sans-serif}
	.orbitron{font-family:"Poppins",system-ui,-apple-system,sans-serif;font-weight:700}
	.mono,.studio input,.studio textarea,.studio select,.studio button,.studio pre,.studio code{font-family:"Poppins",system-ui,-apple-system,sans-serif;color:#000000}
	.green{color:var(--green)}
	.cyan{color:var(--cyan)}
	.muted{color:var(--muted)}
	.flex{display:flex}.grid{display:grid;grid-template-columns:minmax(0,1fr)}.hidden{display:none}.block{display:block}
	.flex-1{flex:1 1 0%}.flex-wrap{flex-wrap:wrap}.min-w-0{min-width:0}.w-full{width:100%}.h-fit{height:fit-content}.ml-auto{margin-left:auto}
	.items-center{align-items:center}.items-start{align-items:flex-start}.justify-between{justify-content:space-between}
	.gap-2{gap:8px}.gap-3{gap:12px}.gap-4{gap:16px}.gap-5{gap:20px}.space-y-2>*+*{margin-top:8px}.space-y-4>*+*{margin-top:16px}.space-y-5>*+*{margin-top:20px}
	.p-3{padding:12px}.p-4{padding:16px}.p-5{padding:20px}.p-10{padding:40px}.mb-5{margin-bottom:20px}.mb-6{margin-bottom:24px}.mt-1{margin-top:4px}.mt-2{margin-top:8px}.mt-3{margin-top:12px}.mt-4{margin-top:16px}.mt-5{margin-top:20px}.my-5{margin-top:20px;margin-bottom:20px}.mr-1{margin-right:4px}
	.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.max-w-5xl{max-width:1120px}.max-w-\\[460px\\]{max-width:460px}.max-h-\\[820px\\]{max-height:820px}.h-\\[56px\\]{height:56px}.min-h-screen{min-height:100vh}.min-h-\\[calc\\(100vh-78px\\)\\]{min-height:calc(100vh - 78px)}
	.aspect-\\[9\\/16\\]{aspect-ratio:9/16}.overflow-y-auto{overflow-y:auto}.whitespace-pre-wrap{white-space:pre-wrap}.break-words{overflow-wrap:anywhere}.break-all{word-break:break-all}
	.font-bold{font-weight:700}.text-sm{font-size:14px}.text-2xl{font-size:24px}.text-\\[10px\\]{font-size:10px}.text-\\[11px\\]{font-size:11px}.text-\\[12px\\]{font-size:12px}.text-\\[13px\\]{font-size:13px}.leading-5{line-height:20px}.tracking-\\[\\.08em\\]{letter-spacing:.08em}.tracking-\\[\\.1em\\]{letter-spacing:.1em}.tracking-\\[\\.2em\\]{letter-spacing:.2em}.tracking-\\[0\\.15em\\]{letter-spacing:.15em}.tracking-\\[0\\.16em\\]{letter-spacing:.16em}
	.bg-\\[\\#f7f8fa\\]{background:#f7f8fa}.text-black{color:#000000}
	.scanline{position:fixed;inset:0;z-index:999;pointer-events:none;opacity:.015;background-image:linear-gradient(rgba(0,0,0,.15) 1px,transparent 1px);background-size:100% 4px}
	.animate-spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
	.login-shell{min-height:100svh;padding:24px;display:flex;align-items:center;justify-content:center;background:#e5e5e5}
	.login-card{width:min(100%,980px);min-height:560px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);overflow:hidden;background:#ffffff;border:none;border-radius:0;box-shadow:0 28px 90px rgba(0,0,0,.18)}
	.login-form{padding:44px 54px;display:flex;flex-direction:column;justify-content:center;gap:20px;background:#ffffff}
	.login-brand{margin-bottom:10px;color:#000000;font-size:16px;font-weight:800;letter-spacing:.12em;text-align:left}
	.login-heading{color:#000000;font-size:30px;line-height:1;font-weight:800;letter-spacing:0}
	.login-subtitle{margin-top:10px;color:#6b7280;font-size:11px;line-height:1.6}
	.login-field{display:flex;flex-direction:column;gap:8px;color:#000000;font-size:10px;font-weight:700;letter-spacing:.12em}
	.login-field input{width:100%;min-height:46px;padding:0 13px;color:#000000;background:#ffffff;border:1px solid #d1d5db;border-radius:7px;font-size:13px;outline:none}
	.login-field input:focus{border-color:#000000;box-shadow:0 0 0 3px rgba(0,0,0,.08)}
	.login-password-wrap{position:relative}
	.login-password-wrap input{padding-right:46px}
	.login-password-toggle{position:absolute;right:7px;top:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;color:#000000;background:#f9fafb;border:1px solid #d1d5db;border-radius:6px;transform:translateY(-50%);cursor:pointer}
	.login-password-toggle:hover{border-color:#000000;background:#ffffff}
	.login-captcha-row{display:grid;grid-template-columns:104px 42px minmax(0,1fr);gap:8px;align-items:center}
	.login-captcha-code{min-height:46px;display:flex;align-items:center;justify-content:center;color:#ffffff;background:#111111;border:1px solid #111111;border-radius:7px;font-size:17px;font-weight:800;letter-spacing:.22em}
	.login-captcha-refresh{height:46px;display:flex;align-items:center;justify-content:center;color:#000000;background:#f9fafb;border:1px solid #d1d5db;border-radius:7px;cursor:pointer}
	.login-captcha-refresh:hover{border-color:#000000;background:#ffffff}
	.login-button{min-height:46px;display:flex;align-items:center;justify-content:center;gap:9px;color:#ffffff!important;background:#000000;border:1px solid #000000;border-radius:7px;font-size:12px;font-weight:800;letter-spacing:.12em;cursor:pointer}
	.login-button svg{color:#ffffff}
	.login-button:hover{filter:brightness(1.08)}
	.login-footer{margin-top:2px;color:#6b7280;font-size:10px;line-height:1.5;text-align:center}
	.login-alert-overlay{position:fixed;inset:0;z-index:1000;padding:20px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.42);backdrop-filter:blur(5px)}
	.login-alert{width:min(100%,360px);padding:30px 28px 24px;display:flex;flex-direction:column;align-items:center;text-align:center;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 28px 80px rgba(0,0,0,.26);animation:loginAlertIn 180ms ease-out both}
	.login-alert-icon{width:64px;height:64px;display:flex;align-items:center;justify-content:center;color:#991b1b;background:rgba(220,38,38,.06);border:2px solid rgba(220,38,38,.34);border-radius:999px}
	.login-alert-icon svg{color:#991b1b}
	.login-alert-title{margin-top:18px;color:#000000;font-size:22px;font-weight:800;letter-spacing:0}
	.login-alert-message{margin-top:10px;color:#991b1b;font-size:13px;font-weight:800;letter-spacing:.12em}
	.login-alert-button{min-width:112px;min-height:42px;margin-top:22px;padding:0 18px;color:#ffffff!important;background:#000000;border:1px solid #000000;border-radius:7px;font-size:12px;font-weight:800;letter-spacing:.12em;cursor:pointer}
	.login-alert-button:hover{filter:brightness(1.08)}
	@keyframes loginAlertIn{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
	.login-showcase{position:relative;overflow:hidden;padding:38px 46px;display:flex;flex-direction:column;justify-content:center;gap:26px;background:radial-gradient(88% 42% at 34% -10%,rgba(255,255,255,.18) 0 18%,transparent 19%),radial-gradient(70% 58% at -12% 18%,rgba(255,255,255,.16) 0 24%,transparent 25%),radial-gradient(76% 64% at 110% 78%,rgba(255,255,255,.14) 0 26%,transparent 27%),linear-gradient(118deg,rgba(255,255,255,.13) 0 10%,rgba(0,0,0,.9) 11% 18%,rgba(255,255,255,.1) 19% 30%,transparent 31% 100%),linear-gradient(36deg,rgba(255,255,255,.1) 0 11%,transparent 12% 19%,rgba(0,0,0,.9) 20% 31%,rgba(255,255,255,.08) 32% 43%,transparent 44% 52%,rgba(255,255,255,.12) 53% 66%,rgba(0,0,0,.82) 67% 100%),#030303;color:#ffffff}
	.login-showcase::before{content:"";position:absolute;inset:-18%;z-index:0;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 520 620' preserveAspectRatio='none'%3E%3Crect width='520' height='620' fill='transparent'/%3E%3Cpath d='M-130 -20 C20 54 96 92 188 171 C286 283 323 386 462 461 C548 507 590 570 596 660 L350 660 C315 536 274 447 195 363 C126 289 78 245 -30 210 C-108 184 -148 96 -130 -20 Z' fill='%23171717'/%3E%3Cpath d='M150 -90 C232 42 302 112 383 164 C469 219 508 316 558 431 L558 680 L398 680 C385 520 342 434 270 351 C199 268 168 184 88 76 C48 22 66 -62 150 -90 Z' fill='%23090909'/%3E%3Cpath d='M-120 260 C22 342 94 324 160 407 C220 482 242 560 350 690 L-120 690 Z' fill='%23202020'/%3E%3Cpath d='M382 -96 C500 28 535 99 580 205 L580 680 L472 680 C481 507 468 366 411 246 C366 152 285 82 218 -96 Z' fill='%23282828' opacity='.9'/%3E%3Cpath d='M-120 128 C26 178 96 204 167 286 C235 365 284 436 379 498 C455 547 520 584 620 650' fill='none' stroke='%23262626' stroke-width='86' stroke-linecap='round' opacity='.82'/%3E%3Cpath d='M-110 42 C50 130 122 156 200 236 C284 321 312 423 404 520 C455 574 503 604 620 650' fill='none' stroke='%23343434' stroke-width='50' stroke-linecap='round' opacity='.68'/%3E%3Cpath d='M335 -112 C399 26 452 69 506 138 C552 198 570 274 608 420' fill='none' stroke='%23111111' stroke-width='104' stroke-linecap='round' opacity='1'/%3E%3C/svg%3E");background-size:145% 145%;background-position:center;opacity:1;transform-origin:50% 100%;animation:loginFluidSway 3.8s ease-in-out infinite;will-change:transform}
	.login-showcase::after{content:"";position:absolute;inset:0;z-index:0;background:radial-gradient(circle at 18% 22%,rgba(255,255,255,.09) 0 1px,transparent 1.15px),radial-gradient(circle at 72% 18%,rgba(255,255,255,.055) 0 1px,transparent 1.15px),radial-gradient(circle at 82% 72%,rgba(255,255,255,.08),transparent 34%),linear-gradient(58deg,transparent 0 18%,rgba(255,255,255,.06) 19% 27%,transparent 28% 36%,rgba(0,0,0,.36) 37% 50%,transparent 51% 100%),linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.42));background-size:6px 6px,8px 8px,100% 100%,100% 100%,100% 100%;opacity:.78;animation:loginFluidTexture 4.8s ease-in-out infinite;will-change:background-position,opacity}
	@keyframes loginFluidSway{0%,100%{transform:translateX(-16px) skewX(-3.6deg) scale(1.065)}50%{transform:translateX(16px) skewX(3.6deg) scale(1.065)}}
	@keyframes loginFluidTexture{0%,100%{background-position:0 0,4px 2px,50% 50%,0 0,0 0;opacity:.72}50%{background-position:12px 10px,-8px 9px,44% 53%,16px 0,0 0;opacity:.86}}
	.login-support{position:absolute;right:34px;top:28px;z-index:1;display:flex;align-items:center;gap:7px;color:#d1d5db;font-size:11px;font-weight:700}
	.login-slider{position:relative;z-index:1;min-height:360px}
	.login-slide{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:34px;opacity:0;transform:translateX(28px) scale(.98);pointer-events:none;transition:opacity 620ms ease,transform 620ms ease}
	.login-slide.active{opacity:1;transform:translateX(0) scale(1);pointer-events:auto}
	.login-slide.active .login-feature-card{animation:loginCardIn 720ms ease both}
	.login-slide.active .login-showcase-copy{animation:loginCopyIn 780ms ease 90ms both}
	.login-feature-card{position:relative;z-index:1;width:min(100%,340px);min-height:150px;margin:0 auto;padding:26px;display:flex;align-items:flex-end;justify-content:space-between;gap:18px;color:#000000;background:#ffffff;border-radius:8px;box-shadow:18px 18px 42px rgba(156,163,175,.24),-10px 10px 28px rgba(156,163,175,.12)}
	.login-feature-card strong{display:block;font-size:20px;line-height:1.05;font-weight:800}
	.login-feature-card span{display:block;margin-top:10px;color:#4b5563;font-size:11px;line-height:1.5}
	.login-mini-card{flex:0 0 94px;min-height:74px;padding:13px;background:#111111;color:#ffffff;border-radius:7px;box-shadow:0 12px 24px rgba(0,0,0,.22)}
	.login-mini-card span{margin:0;color:#d1d5db;font-size:9px;letter-spacing:.16em}
	.login-mini-card strong{margin-top:8px;color:#ffffff;font-size:16px;letter-spacing:.08em}
	.login-showcase-copy{position:relative;z-index:1;width:min(100%,370px);margin:0 auto;text-align:center}
	.login-showcase-copy h2{margin:0;color:#ffffff;font-size:24px;line-height:1.15;font-weight:800}
	.login-showcase-copy p{margin:16px 0 0;color:#d1d5db;font-size:12px;line-height:1.7}
	.login-dots{position:relative;z-index:2;display:flex;justify-content:center;gap:8px}
	.login-dots button{width:7px;height:7px;padding:0;border:0;border-radius:999px;background:#ffffff;opacity:.42;cursor:pointer}
	.login-dots button.active{opacity:1;transform:scale(1.18)}
	@keyframes loginCardIn{from{opacity:0;transform:translateY(18px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
	@keyframes loginCopyIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
	.header{height:76px;position:sticky;top:0;z-index:50;padding:0 22px;display:flex;align-items:center;justify-content:space-between;gap:18px;background:rgba(255,255,255,.96);border-bottom:1px solid var(--line);backdrop-filter:blur(10px)}
	.brand{flex:1 1 auto;min-width:0;overflow:hidden}
	.brand>div:last-child,.workspace,.workspace>section,.panel,.panel-content,.grid,.grid>*{min-width:0}
	.workspace,.workspace>section,.panel,.panel-content,.input,.prompt-output{max-width:100%}
	.workspace .muted,.workspace textarea,.workspace input,.workspace h2{overflow-wrap:anywhere}
	.brand .flex{flex-wrap:nowrap;white-space:nowrap}
	.brand .mono{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
	.logo-box{width:40px;height:40px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;color:var(--green);background:#f9fafb;border:1px solid rgba(0,0,0,.45);border-radius:8px;box-shadow:0 0 18px rgba(0,0,0,.06)}
	.header-actions{flex:1 1 auto;min-width:0;align-items:center;flex-wrap:nowrap;justify-content:flex-end;overflow:hidden}
	.studio button.header-save{flex:0 0 auto;min-height:38px;padding:0 12px;display:flex;align-items:center;gap:8px;color:#ffffff;background:var(--green);border:1px solid var(--green);border-radius:7px;font-size:10px;font-weight:700;letter-spacing:.06em;white-space:nowrap;cursor:pointer;box-shadow:0 10px 24px rgba(0,0,0,.14)}
	.header-save:hover:not(:disabled){filter:brightness(1.06)}
	.studio button.header-clear{flex:0 0 auto;min-height:38px;padding:0 12px;display:flex;align-items:center;gap:8px;color:var(--green);background:#ffffff;border:1px solid rgba(0,0,0,.45);border-radius:7px;font-size:10px;font-weight:700;letter-spacing:.06em;white-space:nowrap;cursor:pointer}
	.header-clear:hover:not(:disabled){border-color:var(--green);background:#f9fafb}
	.save-state{flex:0 1 145px;max-width:145px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:10px;letter-spacing:.04em}
	.credit-cluster{flex:0 0 auto;display:flex;align-items:center;gap:6px}
	.credit-chip{min-height:34px;padding:5px 9px;border:1px solid rgba(0,0,0,.22);background:#f9fafb;border-radius:7px;display:flex;flex-direction:column;justify-content:center;line-height:1.05}
	.credit-chip .credit-name{font-size:8px;letter-spacing:.16em;color:var(--muted)}
	.credit-chip strong{font-size:10px;color:var(--green);font-weight:700;margin-top:3px}
	.credit-chip.credit-error{border-color:rgba(220,38,38,.35)}
	.credit-chip.credit-error strong{color:#dc2626}
	.credit-refresh{width:34px;height:34px;border-radius:7px;border:1px solid var(--line);background:#ffffff;color:var(--muted);display:flex;align-items:center;justify-content:center;cursor:pointer}
	.credit-refresh:hover:not(:disabled){color:var(--green);border-color:rgba(0,0,0,.45)}
	.credit-refresh:disabled{opacity:.5;cursor:not-allowed}
	.provider-chip{flex:0 0 auto;min-height:34px;padding:5px 10px;display:flex;align-items:center;gap:8px;border:1px solid rgba(0,0,0,.26);border-radius:7px;background:#ffffff;line-height:1.05;white-space:nowrap;cursor:pointer}
	.provider-chip input{position:absolute;opacity:0;pointer-events:none}
	.provider-chip-label{font-size:8px;letter-spacing:.16em;color:var(--muted)}
	.provider-chip strong{font-size:10px;color:var(--green);font-weight:800;letter-spacing:.08em}
	.provider-chip.off{border-color:rgba(2,132,199,.35);background:rgba(2,132,199,.04)}
	.provider-chip.on{border-color:rgba(0,0,0,.38);background:#f9fafb}
	.provider-chip:hover{border-color:var(--green)}
	.credit-side-panel{padding:12px;border:1px solid var(--line);border-radius:8px;background:#fafbfc}
	.credit-side-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:10px;letter-spacing:.08em;color:var(--muted)}
	.credit-side-row strong{color:var(--green);font-size:11px}
	.credit-reset{margin-top:5px;font-size:9px;line-height:1.4;color:#6b7280}
	.credit-side-refresh{width:100%;margin-top:12px;min-height:32px;border:1px solid rgba(0,0,0,.28);border-radius:6px;background:#f9fafb;color:var(--green);display:flex;align-items:center;justify-content:center;gap:7px;font-size:9px;font-weight:700;letter-spacing:.1em;cursor:pointer}
		.credit-side-refresh:hover:not(:disabled){border-color:var(--green)}
		.credit-side-refresh:disabled{opacity:.5;cursor:not-allowed}
		.credit-side-error{margin-top:8px;color:#dc2626;font-size:9px;line-height:1.4;word-break:break-word}
		.credit-detected{margin-top:12px;padding-top:10px;border-top:1px solid var(--line-soft)}
		.credit-detected-title{margin-bottom:7px;color:#6b7280;font-size:8px;letter-spacing:.16em}
		.credit-detected-toggle{width:100%;min-height:28px;padding:0;display:flex;align-items:center;justify-content:space-between;gap:8px;color:#6b7280;background:transparent;border:0;font-size:8px;font-weight:700;letter-spacing:.16em;text-align:left;cursor:pointer}
		.credit-detected-toggle:hover{color:#000000}
		.credit-detected-chevron{flex:0 0 auto;transition:transform 120ms ease}
		.credit-detected-chevron.open{transform:rotate(90deg)}
		.credit-detected-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:5px;color:#4b5563;font-size:9px;line-height:1.35}
		.credit-detected-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.credit-detected-row strong{flex:0 0 auto;color:#000000;font-size:9px}
		.credit-log-panel{padding:10px;border:1px solid var(--line);border-radius:8px;background:#fafbfc}
		.credit-log-empty{padding:10px;color:#6b7280;font-size:9px;letter-spacing:.12em;text-align:center}
		.credit-log-item{padding:9px 0;border-bottom:1px solid var(--line-soft)}
		.credit-log-item:last-child{border-bottom:0}
		.credit-log-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;color:#000000;font-size:10px;line-height:1.35}
		.credit-log-top span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.credit-log-top strong{flex:0 0 auto;color:var(--green);font-size:9px;text-align:right}
		.credit-log-error .credit-log-top strong{color:#dc2626}
		.credit-log-meta{margin-top:4px;color:#6b7280;font-size:8px;letter-spacing:.08em}
			.credit-log-clear{width:100%;margin-top:10px;min-height:28px;color:#000000;background:#ffffff;border:1px solid var(--line);border-radius:6px;font-size:8px;font-weight:700;letter-spacing:.12em;cursor:pointer}
			.credit-log-clear:hover{color:var(--green);border-color:rgba(0,0,0,.45)}
			.usage-toolbar{min-height:64px;padding:12px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);background:#ffffff}
			.usage-toolbar .secondary{min-height:36px;font-size:10px}
			.usage-table-wrap{overflow:auto;max-width:100%}
			.usage-table{width:100%;min-width:1180px;border-collapse:collapse;font-size:11px;line-height:1.45}
			.usage-table th{position:sticky;top:0;z-index:1;padding:13px 12px;color:#000000;background:#f3f4f6;border-bottom:1px solid var(--line);text-align:left;font-size:10px;letter-spacing:.12em;font-weight:700}
			.usage-table td{padding:13px 12px;color:#000000;border-bottom:1px solid var(--line-soft);vertical-align:top;white-space:nowrap}
			.usage-table td:nth-child(4){white-space:normal;min-width:170px}
			.usage-table td:nth-child(8),.usage-table td:nth-child(9),.usage-table td:nth-child(10){white-space:normal;min-width:130px}
			.usage-table tr:hover td{background:#f9fafb}
			.usage-delta{color:var(--green)!important;font-weight:700}
			.usage-error{color:#dc2626!important;font-weight:700}
			.usage-error-row td{background:rgba(220,38,38,.03)}
			.usage-empty{height:140px;text-align:center;color:#6b7280!important;letter-spacing:.12em}
			.usage-window-shell{min-height:100svh;background:#f7f8fa}
			.usage-window-workspace{width:100%;min-height:100svh;padding:30px clamp(22px,3vw,44px) 56px;background:linear-gradient(90deg,rgba(0,0,0,.01),transparent 30%)}
			.usage-window-section{width:min(100%,1280px);max-width:1280px;margin:0 auto}
			.workspace-gate{min-height:100svh;padding:28px clamp(20px,4vw,56px) 56px;background:linear-gradient(180deg,#ffffff 0%,#f7f8fa 44%,#eef1f5 100%);color:#000000}
			.workspace-gate-top{min-height:48px;display:flex;align-items:center;justify-content:space-between;gap:18px}
			.workspace-gate-brand{font-size:15px;font-weight:800;letter-spacing:.16em}
			.workspace-gate-subtitle{margin-top:4px;color:#6b7280;font-size:10px;font-weight:700;letter-spacing:.14em}
			.workspace-logout{min-height:38px;padding:0 12px;display:flex;align-items:center;gap:8px;color:#000000;background:#ffffff;border:1px solid rgba(0,0,0,.28);border-radius:7px;font-size:10px;font-weight:700;letter-spacing:.08em;cursor:pointer}
			.workspace-logout:hover{border-color:#000000;background:#f9fafb}
			.workspace-gate-inner{width:min(100%,1120px);margin:56px auto 0}
			.workspace-gate-heading h1{margin:12px 0 0;color:#000000;font-size:42px;line-height:1;font-weight:800;letter-spacing:0}
			.workspace-gate-heading p{max-width:620px;margin:16px 0 0;color:#4b5563;font-size:14px;line-height:1.7}
			.workspace-create{margin-top:28px;padding:16px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:end;background:#ffffff;border:1px solid var(--line);border-radius:8px;box-shadow:0 10px 26px rgba(0,0,0,.04)}
			.workspace-create-field{display:flex;flex-direction:column;gap:8px;color:#000000;font-size:10px;font-weight:700;letter-spacing:.12em}
			.workspace-create-field input{width:100%;min-height:46px;padding:0 13px;color:#000000;background:#ffffff;border:1px solid #d1d5db;border-radius:7px;font-size:13px;outline:none}
			.workspace-create-field input:focus{border-color:#000000;box-shadow:0 0 0 3px rgba(0,0,0,.08)}
			.workspace-create-button{min-height:46px;padding:0 16px;display:flex;align-items:center;justify-content:center;gap:9px;color:#ffffff!important;background:#000000;border:1px solid #000000;border-radius:7px;font-size:11px;font-weight:800;letter-spacing:.1em;cursor:pointer;white-space:nowrap}
			.workspace-card-grid{margin-top:22px;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:14px}
			.workspace-card{position:relative;min-height:126px;padding:18px 106px 18px 18px;display:grid;grid-template-columns:48px minmax(0,1fr);gap:14px;align-items:center;color:#000000;background:#ffffff;border:1px solid var(--line);border-radius:8px;text-align:left;cursor:pointer;box-shadow:0 10px 26px rgba(0,0,0,.035)}
			.workspace-card:focus-visible{outline:3px solid rgba(0,0,0,.16);outline-offset:3px}
			.workspace-card-icon{width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:#f3f4f6;border:1px solid var(--line);border-radius:8px}
			.workspace-card-body{min-width:0;display:flex;flex-direction:column;gap:8px}
			.workspace-card-body strong{max-width:100%;padding-right:8px;font-size:18px;font-weight:800;line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;white-space:normal}
			.workspace-card-body span{color:#6b7280;font-size:10px;line-height:1.4}
			.workspace-action-row{position:absolute;top:14px;right:14px;display:flex;gap:8px}
			.workspace-edit-button,.workspace-delete-button{width:34px;height:34px;display:flex;align-items:center;justify-content:center;color:#111827;background:#ffffff;border:1px solid rgba(0,0,0,.12);border-radius:7px;box-shadow:inset 0 1px 0 rgba(255,255,255,.95),inset 0 -1px 0 rgba(0,0,0,.08),0 8px 18px rgba(0,0,0,.08);cursor:pointer}
			.workspace-edit-button:hover,.workspace-delete-button:hover{background:#ffffff;border-color:rgba(0,0,0,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,1),inset 0 -1px 0 rgba(0,0,0,.12),0 10px 22px rgba(0,0,0,.12)}
			.workspace-name-input{width:100%;min-height:38px;padding:0 10px;color:#000000;background:#ffffff;border:1px solid #d1d5db;border-radius:7px;font-size:16px;font-weight:800;outline:none}
			.workspace-name-input:focus{border-color:#000000;box-shadow:0 0 0 3px rgba(0,0,0,.08)}
			.workspace-card-arrow{position:absolute;right:22px;bottom:20px;color:#000000}
			.workspace-empty{min-height:150px;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#6b7280;background:#ffffff;border:1px dashed var(--line);border-radius:8px;text-align:center}
			.workspace-empty strong{color:#000000;font-size:12px;letter-spacing:.14em}
			.workspace-empty span{font-size:11px}
			.app-shell{display:flex;align-items:stretch;width:100%;max-width:100vw;min-height:calc(100svh - 76px);background:linear-gradient(90deg,#ffffff 0 272px,var(--line) 272px 273px,transparent 273px)}
		.sidebar{width:272px;min-width:272px;min-height:calc(100svh - 76px);height:auto;max-height:none;align-self:stretch;position:relative;top:auto;padding:22px 16px;background:#ffffff;border-right:1px solid var(--line);overflow:visible}
	.workspace{min-width:0;flex:1 1 auto;overflow-x:hidden;padding:30px clamp(22px,3vw,44px) 56px;background:linear-gradient(90deg,rgba(0,0,0,.008),transparent 30%)}
	.workspace>section{width:min(100%,1120px);max-width:1120px}
	.side-label{margin-bottom:14px;color:#000000;font-size:11px;letter-spacing:.18em;font-weight:700}
	.credit-side-title{width:100%;text-align:center}
	.side-divider{height:1px;margin:24px 0;background:var(--line)}
	.nav{width:100%;height:48px;padding:0 13px;display:flex;align-items:center;gap:11px;color:#000000;background:transparent;border:1px solid transparent;border-radius:8px;font-size:12px;letter-spacing:.08em;text-align:left;cursor:pointer}
	.nav:hover{color:#000000;background:#f3f4f6;border-color:#e5e7eb}
	.nav.active{color:var(--green);background:rgba(0,0,0,.06);border-color:rgba(0,0,0,.4);box-shadow:inset 3px 0 0 var(--green)}
	.strict{min-height:42px;padding:0 12px;display:flex;align-items:center;gap:8px;color:var(--green);background:rgba(0,0,0,.045);border:1px solid rgba(0,0,0,.3);border-radius:8px;font-size:11px}
	.side-note{padding:12px;border:1px solid var(--line-soft);border-radius:8px;background:#fafbfc;color:#000000}
	.panel{position:relative;overflow:hidden;background:var(--panel);border:1px solid var(--line);border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.05)}
	.panel-header{min-height:56px;padding:0 18px;display:flex;align-items:center;gap:10px;color:#000000;background:var(--panel-2);border-bottom:1px solid var(--line);font-size:12px;letter-spacing:.08em;font-weight:700}
	.panel-header svg{color:#000000}
	.panel-content{padding:20px;display:flex;flex-direction:column;gap:18px}
	.field-label{display:block;margin-bottom:8px;color:#000000;font-size:11px;letter-spacing:.12em;font-weight:600}
	.input{width:100%;min-width:0;min-height:48px;padding:12px 14px;color:#000000;background:#ffffff;border:1px solid #d1d5db;border-radius:7px;outline:none;font-size:13px;line-height:1.65;transition:border-color 120ms ease,box-shadow 120ms ease,background 120ms ease}
	.input:focus{border-color:rgba(0,0,0,.6);box-shadow:0 0 0 3px rgba(0,0,0,.1);background:#ffffff}
	.input::placeholder{color:#6b7280}
	textarea.input{resize:vertical}
	.primary,.secondary{min-height:46px;padding:0 16px;display:flex;align-items:center;justify-content:center;gap:9px;border-radius:7px;font-size:12px;font-weight:700;letter-spacing:.08em;cursor:pointer}
	.studio button.primary{color:#ffffff;background:#000000;border:1px solid #000000;box-shadow:0 10px 24px rgba(0,0,0,.14)}
	.primary:hover:not(:disabled){filter:brightness(1.06)}
	.secondary{color:#000000;background:#ffffff;border:1px solid #d1d5db}
	.secondary:hover:not(:disabled){color:var(--green);border-color:rgba(0,0,0,.55);background:#f9fafb}
	button:disabled{opacity:.38;cursor:not-allowed}
	.progress-box{min-height:48px;padding:0 15px;display:flex;align-items:center;gap:10px;color:var(--green);background:#f9fafb;border:1px solid rgba(0,0,0,.25);border-radius:8px;font-size:12px}
	.error-box{min-height:60px;padding:14px;display:flex;align-items:flex-start;gap:12px;color:var(--rose);background:rgba(220,38,38,.04);border:1px solid rgba(220,38,38,.3);border-radius:8px}
	.error-box button{color:var(--rose);background:transparent;border:none;font-size:18px;cursor:pointer}
	.status{flex:0 0 auto;min-height:32px;padding:0 10px;display:flex;align-items:center;color:#000000;background:#f9fafb;border:1px solid var(--line);border-radius:999px;font-size:10px;white-space:nowrap}
	.status.active{color:var(--green);border-color:rgba(0,0,0,.35);background:rgba(0,0,0,.045)}
	.status.warning{color:var(--amber);border-color:rgba(217,119,6,.35);background:rgba(217,119,6,.045)}
	.asset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px;margin-bottom:30px}
	.empty-state{min-height:300px;margin-top:36px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--muted);background:#ffffff;border:1px dashed var(--line);border-radius:8px}
	.empty-state svg{color:#000000}
	.empty-state-title{color:#000000;font-size:13px;font-weight:700;letter-spacing:.14em}
	.asset{overflow:hidden;background:var(--panel);border:1px solid var(--line);border-radius:8px}
	.asset-image{display:flex;align-items:center;justify-content:center;overflow:hidden;background:#f3f4f6;border-bottom:1px solid var(--line)}
	.asset-image img{width:100%;height:100%;object-fit:contain}
	.locked{width:fit-content;min-height:30px;padding:0 10px;display:flex;align-items:center;gap:7px;color:var(--green);background:rgba(0,0,0,.045);border:1px solid rgba(0,0,0,.3);border-radius:999px;font-size:10px}
	.studio .green>svg,.studio svg.green,.studio .locked svg,.studio .status svg,.studio .strict svg,.studio .nav.active svg,.studio .header-clear svg,.studio .credit-side-refresh svg,.studio .secondary:hover svg,.studio .progress-box svg,.studio .qa.pass>svg{color:#000000}
	.action-bar{position:sticky;bottom:14px;z-index:30;margin-top:24px;padding:12px;display:flex;gap:10px;align-items:center;background:rgba(255,255,255,.96);border:1px solid var(--line);border-radius:8px;box-shadow:0 14px 32px rgba(0,0,0,.06)}
	.episode-tabs{margin-bottom:18px;display:flex;flex-wrap:wrap;gap:8px}
	.episode{min-height:38px;padding:0 12px;color:#000000;background:#ffffff;border:1px solid #d1d5db;border-radius:7px;font-size:11px;cursor:pointer}
	.episode.active{color:var(--green);border-color:rgba(0,0,0,.6);background:rgba(0,0,0,.045)}
	.info{padding:14px;color:#000000;background:#f9fafb;border:1px solid var(--line);border-radius:7px;font-size:12px;line-height:1.7}
	.id-box{min-height:96px;padding:12px;background:#f9fafb;border:1px solid var(--line);border-radius:7px}
	.dialogue{padding:12px;display:grid;grid-template-columns:120px 1fr;gap:12px;background:#f9fafb;border-left:3px solid var(--green);border-radius:6px;font-size:12px;color:#000000}
	.dialogue strong{color:var(--green)}
	.shot-list{overflow:hidden;border:1px solid var(--line);border-radius:8px}
		.shot{width:100%;min-height:50px;padding:0 14px;display:grid;grid-template-columns:180px 80px 110px 120px 1fr;gap:12px;align-items:center;color:#000000;background:#ffffff;border:none;border-bottom:1px solid var(--line);text-align:left;font-size:11px;cursor:pointer}
		.shot:last-child{border-bottom:0}
		.shot.active{color:#000000;background:#f3f4f6;box-shadow:inset 3px 0 0 var(--green)}
		.render-grid{align-items:start}
		.shot-queue-panel{height:auto;min-height:calc(100svh - 52px);display:flex;flex-direction:column;position:relative;top:auto;overflow:visible}
		.shot-queue-panel .panel-header{flex:0 0 auto}
		.shot-queue-list{flex:0 0 auto;min-height:0;overflow:visible}
		.render-shot{width:100%;min-height:58px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;background:#ffffff;color:#000000;border:1px solid var(--line);border-radius:7px;text-align:left;cursor:pointer}
	.render-shot.active{border-color:rgba(0,0,0,.6);background:rgba(0,0,0,.045)}
	.shot-dialogue-editor{display:block;margin:14px 0 2px}
	.shot-dialogue-editor span{display:block;margin-bottom:8px;color:#000000;font-size:11px;font-weight:800;letter-spacing:.14em}
	.shot-dialogue-editor textarea{width:100%;min-height:112px;padding:13px 14px;color:#000000;background:#ffffff;border:1px solid #d1d5db;border-radius:7px;font-size:13px;line-height:1.65;outline:none;resize:vertical}
	.shot-dialogue-editor textarea:focus{border-color:#000000;box-shadow:0 0 0 3px rgba(0,0,0,.08)}
	.prompt-output{max-height:420px;overflow:auto;padding:16px;white-space:pre-wrap;color:#000000;background:#f9fafb;border:1px solid var(--line);border-radius:7px;font-size:12px;line-height:1.8}
	.anchor-frame{position:relative;width:100%;margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#f3f4f6;border:1px solid var(--line);border-radius:8px}
	.anchor-frame img{width:100%;height:100%;object-fit:contain;background:#f3f4f6}
	.anchor-loading-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
	.anchor-stop-button{min-height:38px;padding:0 16px;display:flex;align-items:center;justify-content:center;gap:8px;color:#111827;background:#ffffff;border:1px solid rgba(0,0,0,.14);border-radius:7px;box-shadow:inset 0 1px 0 rgba(255,255,255,.95),inset 0 -1px 0 rgba(0,0,0,.08),0 10px 22px rgba(0,0,0,.1);font-size:11px;font-weight:800;letter-spacing:.12em;cursor:pointer}
	.anchor-stop-button:hover{border-color:rgba(0,0,0,.28);box-shadow:inset 0 1px 0 rgba(255,255,255,1),inset 0 -1px 0 rgba(0,0,0,.12),0 12px 26px rgba(0,0,0,.14)}
	.qa{min-height:110px;padding:16px;display:flex;align-items:center;gap:14px;color:#000000;background:#f9fafb;border:1px solid var(--line);border-radius:8px}
	.qa.pass{color:var(--green);border-color:rgba(0,0,0,.4);background:rgba(0,0,0,.04)}
	.qa.fail{color:var(--rose);border-color:rgba(220,38,38,.4);background:rgba(220,38,38,.04)}
	.qa-issue{padding:10px;color:#991b1b;background:rgba(220,38,38,.045);border-left:3px solid var(--rose);border-radius:6px;font-size:12px}
	.video-empty{min-height:320px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#6b7280;background:#f3f4f6;border:1px solid var(--line);border-radius:8px;font-size:12px}
	.video-preview{width:100%;max-height:620px;background:#000;border:1px solid var(--line);border-radius:8px}
	.video-preview.portrait{max-width:460px;margin:0 auto}
	.video-preview.landscape{max-width:760px;margin:0 auto}
	.toggle-row{display:flex;align-items:center;gap:10px;font-size:12px;color:#111827}
	.toggle-row input{width:16px;height:16px}
	.provider-toggle-row{align-items:flex-start;padding:10px 12px;background:#ffffff;border:1px solid var(--line);border-radius:8px;font-weight:800;letter-spacing:.08em}
	.mini{min-height:64px;padding:12px;background:#f9fafb;border:1px solid var(--line);border-radius:7px}
	.session-cookie-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}
	.session-cookie{min-height:66px;padding:12px;background:#f9fafb;border:1px solid var(--line);border-radius:7px}
	.session-cookie-name{color:#000000;font-size:10px;font-weight:700;letter-spacing:.1em;word-break:break-all}
	.session-cookie-value{margin-top:8px;color:#000000;font-size:12px;line-height:1.45;word-break:break-all}
	.session-cookie-missing{margin-top:8px;color:#dc2626;font-size:11px;font-weight:700;letter-spacing:.08em}
	.session-candidate-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
	.session-card{padding:14px;background:#ffffff;border:1px solid var(--line);border-radius:8px}
	.session-card.active{border-color:rgba(0,0,0,.55);background:rgba(0,0,0,.035)}
	.session-card-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;color:#000000;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
	.session-card-top span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
	.session-card-top strong{flex:0 0 auto;color:#000000;font-size:10px}
	.image-model-picker{display:flex;flex-direction:column;gap:8px;padding:12px;margin-bottom:14px;background:#fafbfc;border:1px solid var(--line);border-radius:8px}
	@media(min-width:768px){.md\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.md\\:grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.md\\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}.md\\:p-8{padding:32px}.md\\:text-3xl{font-size:30px}}
	@media(min-width:1024px){.lg\\:flex{display:flex}.lg\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}}
	@media(min-width:1280px){.xl\\:grid-cols-\\[320px_1fr\\]{grid-template-columns:320px minmax(0,1fr)}}
	@media(max-width:1500px){.header-actions>.status,.save-state{display:none}}
	@media(max-width:1180px){.credit-cluster{display:none}}
	@media(max-width:900px){
	 .login-shell{padding:18px}
	 .login-card{grid-template-columns:1fr;min-height:0}
	 .login-form{padding:34px 24px}
	 .login-showcase{min-height:320px;padding:54px 24px 34px}
	 .login-slider{min-height:300px}
	 .workspace-gate{padding:22px 16px 40px}
	 .workspace-gate-inner{margin-top:36px}
	 .workspace-gate-heading h1{font-size:34px}
	 .workspace-create{grid-template-columns:1fr}
	 .workspace-create-button{width:100%}
	 .sidebar{display:none}
	 .app-shell{display:block}
	 .header{height:auto;min-height:72px;padding:12px 16px;gap:12px}
	 .brand{width:100%}
	 .brand .mono{white-space:normal;line-height:1.5}
	 .workspace{width:100%;max-width:100vw;padding:22px 16px 40px}
	 .workspace>section{width:calc(100vw - 32px);max-width:calc(100vw - 32px)}
	 .usage-window-workspace{padding:22px 16px 40px}
	 .shot{grid-template-columns:1fr 70px 80px}
	 .shot span:nth-child(4),.shot span:nth-child(5){display:none}
	 .action-bar{flex-direction:column;align-items:stretch}
	 .dialogue{grid-template-columns:1fr}
	}
	@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`,
        }}/>
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
            <div key={workspace.id} role="button" tabIndex={0} className="workspace-card" onClick={() => onOpenWorkspace(workspace.id)} onKeyDown={(event) => handleCardKeyDown(event, workspace.id)}>
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
function GeminiSessionView({ sessionState, refreshing, onRefresh, onForceRefresh, onExport }) {
    const active = sessionState.activeSession || null;
    const candidates = Array.isArray(sessionState.candidateSessions) ? sessionState.candidateSessions : [];
    const activeCookies = Array.isArray(active?.cookies) ? active.cookies : [];
    const formatSessionTime = (value) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "--";
        return date.toLocaleString("id-ID");
    };
    const renderCookies = (cookies) => {
        if (!Array.isArray(cookies) || !cookies.length) return <div className="mono muted text-[11px]">NO COOKIE METADATA</div>;
        return (<div className="session-cookie-grid">
          {cookies.map((cookie) => (
            <div className="session-cookie" key={cookie.name}>
              <div className="session-cookie-name">{cookie.name}</div>
              <div className={cookie.present ? "session-cookie-value" : "session-cookie-missing"}>
                {cookie.present ? `${cookie.preview || "PRESENT"} · ${cookie.length || 0} chars` : "MISSING"}
              </div>
            </div>
          ))}
        </div>);
    };
    return (<section className="max-w-5xl">
      <PageTitle code="GEM" title="SESSION GEMINI" subtitle="Lihat Gemini Web session yang dipakai bridge dan export cookie aktif sebagai JSON."/>
      <Panel title="ACTIVE GEMINI SESSION" icon={<Lock size={16}/>}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Mini label="BRIDGE" value={sessionState.ready ? "READY" : sessionState.status === "error" ? "ERROR" : "CHECKING"}/>
          <Mini label="SOURCE" value={active?.source || "--"}/>
          <Mini label="EXPORT" value={sessionState.cookieExportAvailable ? "AVAILABLE" : "UNAVAILABLE"}/>
          <Mini label="UPDATED" value={formatSessionTime(sessionState.fetchedAt)}/>
        </div>
        {active ? renderCookies(activeCookies) : <EmptyState title="SESSION BELUM TERBACA"/>}
        {sessionState.cookieCachePath && (
          <div className="info">
            COOKIE CACHE: <span className="mono">{sessionState.cookieCachePath}</span>
          </div>
        )}
        {sessionState.error && (
          <div className="qa-issue">{sessionState.error}</div>
        )}
        <div className="grid md:grid-cols-3 gap-3">
          <button type="button" className="secondary" disabled={refreshing} onClick={onRefresh}>
            {refreshing ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
            REFRESH SESSION
          </button>
          <button type="button" className="secondary" disabled={refreshing} onClick={onForceRefresh}>
            {refreshing ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
            FORCE COOKIE READ
          </button>
          <button type="button" className="primary" disabled={!sessionState.cookieExportAvailable} onClick={onExport}>
            <Download size={14}/>
            EXPORT COOKIE JSON
          </button>
        </div>
        <div className="mono muted text-[10px] leading-5">
          Export berisi cookie penuh. Simpan hanya di perangkat sendiri dan jangan dibagikan.
        </div>
      </Panel>
      <div className="mt-5">
        <Panel title="DETECTED COOKIE SESSIONS" icon={<ShieldCheck size={16}/>}>
          {!candidates.length ? (
            <EmptyState title="TIDAK ADA COOKIE CANDIDATE"/>
          ) : (
            <div className="session-candidate-list">
              {candidates.map((session, index) => (
                <div className={session.authenticated ? "session-card active" : "session-card"} key={`${session.source}_${index}`}>
                  <div className="session-card-top">
                    <span>{session.source || `SESSION ${index + 1}`}</span>
                    <strong>{session.authenticated ? "ACTIVE" : session.export_available ? "AVAILABLE" : "MISSING"}</strong>
                  </div>
                  {renderCookies(session.cookies)}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </section>);
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
        return value ? value : "--";
    };
    const formatKind = (row) => {
        const category = row?.metadata?.taskCategory || row?.metadata?.task_category || "";
        return String(category || row?.task_type || "--").toUpperCase();
    };
    const logs = Array.isArray(rows) ? rows : [];
    if (!logs.length) {
        return (<Panel title="CREDIT USAGE TABLE" icon={<Table2 size={16}/>}>
          <div className="usage-toolbar">
            <div className="mono muted text-[11px]">
              {loading ? "LOADING AI USAGE LOGS..." : error ? `ERROR: ${error}` : "0 ROW(S) FROM ai_usage_events"}
            </div>
            <button type="button" className="secondary" onClick={onRefresh} disabled={loading}>
              REFRESH
            </button>
          </div>
          {!loading && !error && <EmptyState title="TIDAK ADA LOG DI DATABASE"/>}
        </Panel>);
    }
    return (<Panel title="CREDIT USAGE TABLE" icon={<Table2 size={16}/>}>
      <div className="usage-toolbar">
        <div className="mono muted text-[11px]">
          {`${logs.length} ROW(S) FROM ai_usage_events${error ? ` • ${error}` : ""}`}
        </div>
        <button type="button" className="secondary" disabled={loading} onClick={onRefresh}>
          REFRESH
        </button>
      </div>
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
            {logs.map((row) => (
              <tr key={row.id}>
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
    </Panel>);
}
function InputField({ label, value, placeholder = "", onChange }) {
    return (<label>
      <span className="field-label">{label}</span>
      <input className="input" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)}/>
    </label>);
}
function TextAreaField({ label, value, rows = 4, placeholder = "", onChange }) {
    return (<label>
      <span className="field-label">{label}</span>
      <textarea className="input" rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)}/>
    </label>);
}
function NumberField({ label, value, min, max, onChange }) {
    return (<label>
      <span className="field-label">{label}</span>
      <input className="input" type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value || min))))}/>
    </label>);
}
function SelectField({ label, value, values, onChange }) {
    return (<label className="block">
      <span className="field-label">{label}</span>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        {values.map((item) => (<option key={item} value={item}>{item}</option>))}
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
      <Trash2 size={34}/>
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
    const normalizedAspectRatio = normalizeAssetAspectRatio(assetType, aspectRatio);
    const ratioStyle: React.CSSProperties = {
        aspectRatio: aspectRatioToCssValue(normalizedAspectRatio),
    };

    return (<div className="asset">
      <div className="asset-image" style={ratioStyle}>
        {status === "generating" ? (<Loader2 size={27} className="animate-spin green"/>) : image ? (<img src={image} alt={title}/>) : (<ImageIcon size={28} className="muted"/>)}
      </div>
      <div className="p-4">
        <div className="mono cyan text-[11px]">{id}</div>
        <div className="orbitron text-sm mt-2">{title}</div>
        {subtitle && <div className="mono green text-[11px] mt-1">{subtitle}</div>}
        <div className="mono muted text-[11px] leading-5 mt-3">{description}</div>
        {locked && (<div className="locked mt-4"><Lock size={11}/>LOCKED</div>)}
      </div>
    </div>);
}
function EpisodeTabs({ episodes, selected, onChange }) {
    return (<div className="episode-tabs">
      {episodes.map((episode) => (<button key={episode.episode} type="button" className={selected === episode.episode ? "episode active" : "episode"} onClick={() => onChange(episode.episode)}>
          EP {pad(episode.episode, 2)}
        </button>))}
    </div>);
}
function Info({ label, value, accent = false }) {
    return (<div>
      <div className="field-label">{label}</div>
      <div className={accent ? "info green" : "info"}>{value}</div>
    </div>);
}
function Ids({ title, items }) {
    return (<div className="id-box">
      <div className="field-label">{title}</div>
      <div className="space-y-2">
        {items.length ? (items.map((item) => (<div key={item} className="mono cyan text-[11px]">{item}</div>))) : (<div className="mono muted text-[11px]">NONE</div>)}
      </div>
    </div>);
}
function Mini({ label, value }) {
    return (<div className="mini">
      <div className="field-label">{label}</div>
      <div className="mono green text-[12px] break-all">{value}</div>
    </div>);
}
