"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { CoachVoice } from "@/lib/types";

type TtsMode = "auto" | "browser" | "elevenlabs";

const FEMALE_HINTS = [
  "samantha",
  "victoria",
  "zira",
  "female",
  "karen",
  "ava",
  "serena",
  "moira",
  "siri female",
  "allison",
  "emma",
  "olivia",
  "aria",
];

const MALE_HINTS = [
  "alex",
  "daniel",
  "david",
  "male",
  "fred",
  "tom",
  "google uk english male",
  "aaron",
  "rishi",
  "oliver",
  "arthur",
  "junior",
  "siri male",
];

const NATURAL_HINTS = ["premium", "enhanced", "neural", "natural", "siri"];
const ROBOTIC_HINTS = ["compact", "espeak", "festival"];

function getVoiceScore(voice: SpeechSynthesisVoice, desiredVoice: CoachVoice) {
  const lowerName = voice.name.toLowerCase();
  const desiredHints = desiredVoice === "female" ? FEMALE_HINTS : MALE_HINTS;
  const oppositeHints = desiredVoice === "female" ? MALE_HINTS : FEMALE_HINTS;

  let score = 0;

  if (voice.lang.toLowerCase().startsWith("en")) {
    score += 40;
  }

  if (voice.localService) {
    score += 12;
  }

  if (voice.default) {
    score += 4;
  }

  if (desiredHints.some((hint) => lowerName.includes(hint))) {
    score += 40;
  }

  if (oppositeHints.some((hint) => lowerName.includes(hint))) {
    score -= 28;
  }

  if (NATURAL_HINTS.some((hint) => lowerName.includes(hint))) {
    score += 18;
  }

  if (ROBOTIC_HINTS.some((hint) => lowerName.includes(hint))) {
    score -= 40;
  }

  return score;
}

function pickVoice(voices: SpeechSynthesisVoice[], desiredVoice: CoachVoice) {
  if (!voices.length) {
    return null;
  }

  return [...voices].sort((left, right) => getVoiceScore(right, desiredVoice) - getVoiceScore(left, desiredVoice))[0] ?? null;
}

export function useSpeechSynthesis(
  desiredVoice: CoachVoice,
  options?: { mode?: TtsMode },
) {
  const mode = options?.mode ?? "browser";
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [ready, setReady] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState("");
  const [provider, setProvider] = useState<"elevenlabs" | "browser">(mode === "elevenlabs" ? "elevenlabs" : "browser");
  const [lastError, setLastError] = useState("");
  const [activeAudioElement, setActiveAudioElement] = useState<HTMLAudioElement | null>(null);
  const [browserSpeechLevel, setBrowserSpeechLevel] = useState(0);
  const browserAnimationFrameRef = useRef<number | null>(null);
  const browserTargetLevelRef = useRef(0);
  const browserTimeSeedRef = useRef(0);
  const elevenLabsVoiceName = useMemo(
    () => (desiredVoice === "male" ? "ElevenLabs · Adam" : "ElevenLabs · Rachel"),
    [desiredVoice],
  );

  function stopBrowserActivityLoop() {
    if (browserAnimationFrameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(browserAnimationFrameRef.current);
      browserAnimationFrameRef.current = null;
    }
    browserTargetLevelRef.current = 0;
    setBrowserSpeechLevel(0);
  }

  function startBrowserActivityLoop() {
    if (typeof window === "undefined") {
      return;
    }

    if (browserAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(browserAnimationFrameRef.current);
    }

    browserTimeSeedRef.current = Math.random() * Math.PI;
    let tick = 0;

    const loop = () => {
      tick += 1;
      const wobble = (Math.sin(browserTimeSeedRef.current + tick * 0.27) + 1) * 0.08;
      browserTargetLevelRef.current = Math.max(0, browserTargetLevelRef.current * 0.88 - 0.01);
      const nextLevel = Math.min(1, Math.max(0.06, browserTargetLevelRef.current + wobble));
      setBrowserSpeechLevel((current) => current * 0.5 + nextLevel * 0.5);
      browserAnimationFrameRef.current = window.requestAnimationFrame(loop);
    };

    browserAnimationFrameRef.current = window.requestAnimationFrame(loop);
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSupported("speechSynthesis" in window || mode !== "browser");
    setReady(true);

    const updateVoices = () => {
      const nextVoices = window.speechSynthesis.getVoices();
      setVoices(nextVoices);
    };

    if ("speechSynthesis" in window) {
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = null;
        window.speechSynthesis.cancel();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setActiveAudioElement(null);
      stopBrowserActivityLoop();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [mode]);

  useEffect(() => {
    if (provider === "elevenlabs") {
      setSelectedVoiceName(elevenLabsVoiceName);
      return;
    }

    const selectedVoice = pickVoice(voices, desiredVoice);
    setSelectedVoiceName(selectedVoice?.name ?? "");
  }, [desiredVoice, elevenLabsVoiceName, provider, voices]);

  async function playElevenLabs(text: string) {
    setLastError("");
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        coachVoice: desiredVoice,
      }),
    });

    if (!response.ok) {
      let message = "ElevenLabs request failed.";

      try {
        const payload = (await response.json()) as {
          error?: string;
          details?: string;
          voiceId?: string;
        };
        message = [payload.error, payload.details, payload.voiceId ? `voice ${payload.voiceId}` : ""]
          .filter(Boolean)
          .join(" | ");
      } catch {
        const details = await response.text();
        message = details || message;
      }

      setLastError(message);
      return false;
    }

    const audioBlob = await response.blob();
    const objectUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(objectUrl);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    objectUrlRef.current = objectUrl;
    audioRef.current = audio;
    setActiveAudioElement(audio);
    setBrowserSpeechLevel(0);
    setProvider("elevenlabs");
    setSelectedVoiceName(elevenLabsVoiceName);

    audio.onplay = () => setSpeaking(true);
    audio.onended = () => {
      setSpeaking(false);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      audioRef.current = null;
      setActiveAudioElement(null);
      stopBrowserActivityLoop();
    };
    audio.onerror = () => {
      setSpeaking(false);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      audioRef.current = null;
      setActiveAudioElement(null);
      stopBrowserActivityLoop();
    };

    await audio.play();
    return true;
  }

  function playBrowserFallback(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setProvider("browser");
      setLastError("Browser speech synthesis is unavailable in this browser.");
      setSpeaking(false);
      setActiveAudioElement(null);
      stopBrowserActivityLoop();
      return false;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const availableVoices = voices.length ? voices : window.speechSynthesis.getVoices();
    const matchedVoice = pickVoice(availableVoices, desiredVoice);

    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    setProvider("browser");
    setActiveAudioElement(null);
    setSelectedVoiceName(matchedVoice?.name ?? "System voice");
    setBrowserSpeechLevel(0.18);
    utterance.rate = desiredVoice === "male" ? 0.94 : 0.98;
    utterance.pitch = 1;
    utterance.onstart = () => {
      setSpeaking(true);
      browserTargetLevelRef.current = 0.34;
      startBrowserActivityLoop();
    };
    utterance.onboundary = () => {
      browserTargetLevelRef.current = Math.min(1, browserTargetLevelRef.current + 0.26);
    };
    utterance.onend = () => {
      setSpeaking(false);
      stopBrowserActivityLoop();
    };
    utterance.onerror = () => {
      setSpeaking(false);
      stopBrowserActivityLoop();
    };

    window.speechSynthesis.speak(utterance);
    return true;
  }

  function speak(text: string, options?: { allowBrowserFallback?: boolean }) {
    if (!supported || !text.trim()) {
      return;
    }

    stop();
    const allowBrowserFallback = options?.allowBrowserFallback ?? true;
    void (async () => {
      try {
        if (mode === "browser") {
          setLastError("");
          playBrowserFallback(text);
          return;
        }

        const played = await playElevenLabs(text);

        if (!played && allowBrowserFallback && mode !== "elevenlabs") {
          playBrowserFallback(text);
        }
      } catch (error) {
        const blockedByAutoplay =
          error instanceof DOMException && error.name === "NotAllowedError";

        if (blockedByAutoplay) {
          setProvider("elevenlabs");
          setSelectedVoiceName(elevenLabsVoiceName);
          setLastError("ElevenLabs is ready. Click Replay to start coach audio after browser autoplay restrictions.");
          setSpeaking(false);
          return;
        }

        if (allowBrowserFallback && mode !== "elevenlabs") {
          playBrowserFallback(text);
          return;
        }

        setLastError(
          error instanceof Error ? error.message : "Coach audio could not be played.",
        );
      }
    })();
  }

  function stop() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setSpeaking(false);
    setActiveAudioElement(null);
    stopBrowserActivityLoop();
  }

  return {
    supported,
    ready,
    speaking,
    selectedVoiceName,
    provider,
    activeAudioElement,
    browserSpeechLevel,
    lastError,
    speak,
    stop,
  };
}
