# RoleReady

RoleReady is a polished mock interview prototype built with Next.js, TypeScript, Tailwind CSS, browser-native speech, and a swappable server-side interview intelligence provider.

## Features

- Upload and parse a PDF resume client-side
- Paste a job posting and optional company summary
- Run adaptive interview intelligence through a local Ollama model (default)
- Preserve interview state (role, seniority, skills covered, previous Q/A) on each turn
- Generate realistic follow-up questions tied to the latest answer in structured JSON
- Run a voice-based interview with browser speech synthesis and browser speech recognition
- Keep transcript review on the results screen for a more realistic interview flow
- Score answers and produce a final coaching report
- Generate and download a cover letter PDF

## Local development

```bash
npm install
npm run dev
```

Start Ollama locally (example):

```bash
ollama serve
ollama pull qwen3:4b
```

## Interview intelligence provider

Set `INTERVIEW_LLM_PROVIDER` to choose the interview brain:

- `ollama` (default): local model on your machine.
- `hosted`: reserved placeholder for a future hosted API provider.

Core Ollama env vars:

- `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`)
- `OLLAMA_MODEL` (recommended `qwen3:4b`, optional `qwen3:8b`)
- `OLLAMA_TIMEOUT_MS`
- `NEXT_PUBLIC_INTERVIEW_TARGET_COUNT` (defaults to 5 rounds)

## Voice mode setup

RoleReady supports three coach playback modes:

- `NEXT_PUBLIC_TTS_MODE=browser` (default): browser voice only.
- `NEXT_PUBLIC_TTS_MODE=auto`: try ElevenLabs first, then fall back to browser voice.
- `NEXT_PUBLIC_TTS_MODE=elevenlabs`: ElevenLabs only (no fallback).

For free local testing, keep `NEXT_PUBLIC_TTS_MODE=browser`.

## ElevenLabs setup (optional)

Create `.env.local` from `.env.example` and add your API key:

```bash
cp .env.example .env.local
```

Required:

- `ELEVENLABS_API_KEY`

Optional:

- `ELEVENLABS_VOICE_ID`
- `ELEVENLABS_VOICE_ID_FEMALE`
- `ELEVENLABS_VOICE_ID_MALE`
- `ELEVENLABS_MODEL_ID`

If ElevenLabs is not configured or disabled, RoleReady uses browser speech synthesis.

## Deployment

The app is structured for Vercel with the Next.js App Router and no paid runtime APIs required for the default experience.
