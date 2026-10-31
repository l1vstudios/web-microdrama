# Morai Frontend

Frontend React + Vite untuk Morai. Backend sudah dipisah ke folder sibling supaya frontend lebih ringan saat development.

## Jalankan Frontend

```bash
cd /Users/brainsoft/kerjaan/webjs/morai
npm run dev
```

## Jalankan Backend Manual

```bash
cd /Users/brainsoft/kerjaan/webjs/morai-backend
bun run migrate
bun run start
```

Backend default:

```txt
http://localhost:8787
```

`morai-backend` membaca `.env` lokalnya sendiri, fallback `.env` frontend, lalu `~/.hermes/.env` untuk `GOOGLE_API_KEY`.

## Model Default

```txt
TEXT  gemini-3.6-flash
IMAGE gemini-nano-banana-2.1
VIDEO veo-3.1-generate-preview
```

## Image Provider Toggle

```txt
# Production assets + anchor lewat Google AI backend OpenAI-compatible
VITE_OPENROUTER_BRIDGE_URL=http://localhost:8787/openai/v1
```

Nama env frontend masih `VITE_OPENROUTER_BRIDGE_URL` untuk kompatibilitas lama, tapi backend di `8787` sekarang memakai Google AI Studio / Gemini API.
