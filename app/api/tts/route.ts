import { NextResponse } from "next/server";

type TtsRequest = {
  text?: string;
  coachVoice?: "female" | "male";
};

const DEFAULT_VOICE_IDS = {
  female: "21m00Tcm4TlvDq8ikWAM",
  male: "pNInz6obpgDQGcFmaJgB",
} as const;

const PREFERRED_VOICE_NAMES = {
  female: ["Rachel", "Bella", "Sarah"],
  male: ["Adam", "Antoni", "Arnold"],
} as const;

export const runtime = "nodejs";

type ElevenVoice = {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
};

async function listVoices(apiKey: string) {
  const response = await fetch("https://api.elevenlabs.io/v2/voices", {
    headers: {
      "xi-api-key": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as { voices?: ElevenVoice[] };
  return data.voices ?? [];
}

function pickVoiceFromCatalog(voices: ElevenVoice[], coachVoice: "female" | "male") {
  const preferredByName = voices.find((voice) =>
    PREFERRED_VOICE_NAMES[coachVoice].some(
      (name) => voice.name.toLowerCase() === name.toLowerCase(),
    ),
  );

  if (preferredByName) {
    return preferredByName.voice_id;
  }

  const preferredByGender = voices.find(
    (voice) => voice.labels?.gender?.toLowerCase() === coachVoice,
  );

  return preferredByGender?.voice_id ?? null;
}

async function requestSpeech({
  apiKey,
  voiceId,
  modelId,
  text,
}: {
  apiKey: string;
  voiceId: string;
  modelId: string;
  text: string;
}) {
  return fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.42,
          similarity_boost: 0.88,
          style: 0.18,
          use_speaker_boost: true,
          speed: 1,
        },
      }),
      cache: "no-store",
    },
  );
}

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ElevenLabs is not configured." },
      { status: 503 },
    );
  }

  let body: TtsRequest;

  try {
    body = (await request.json()) as TtsRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text = body.text?.trim();
  const coachVoice = body.coachVoice === "male" ? "male" : "female";

  if (!text) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }

  const voiceId =
    process.env.ELEVENLABS_VOICE_ID ||
    (coachVoice === "male"
      ? process.env.ELEVENLABS_VOICE_ID_MALE || DEFAULT_VOICE_IDS.male
      : process.env.ELEVENLABS_VOICE_ID_FEMALE || DEFAULT_VOICE_IDS.female);

  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  let activeVoiceId = voiceId;
  let elevenResponse = await requestSpeech({
    apiKey,
    voiceId: activeVoiceId,
    modelId,
    text,
  });

  if (
    !elevenResponse.ok &&
    !process.env.ELEVENLABS_VOICE_ID &&
    !process.env.ELEVENLABS_VOICE_ID_FEMALE &&
    !process.env.ELEVENLABS_VOICE_ID_MALE
  ) {
    const voices = await listVoices(apiKey);
    const fallbackVoiceId = pickVoiceFromCatalog(voices, coachVoice);

    if (fallbackVoiceId && fallbackVoiceId !== activeVoiceId) {
      activeVoiceId = fallbackVoiceId;
      elevenResponse = await requestSpeech({
        apiKey,
        voiceId: activeVoiceId,
        modelId,
        text,
      });
    }
  }

  if (!elevenResponse.ok) {
    const message = await elevenResponse.text();

    return NextResponse.json(
      {
        error: "ElevenLabs request failed.",
        details: message,
        voiceId: activeVoiceId,
      },
      { status: elevenResponse.status },
    );
  }

  const audio = await elevenResponse.arrayBuffer();

  return new Response(audio, {
    headers: {
      "Content-Type": elevenResponse.headers.get("content-type") || "audio/mpeg",
      "Cache-Control": "no-store",
      "x-roleready-tts-provider": "elevenlabs",
      "x-roleready-voice-id": activeVoiceId,
    },
  });
}
