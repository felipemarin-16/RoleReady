"use client";

import { useEffect, useRef, useState } from "react";

type SpeechRecognitionConstructor = new () => SpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    start(): void;
    stop(): void;
  }

  interface SpeechRecognitionEvent {
    resultIndex: number;
    results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionErrorEvent {
    error: string;
  }
}

export function useSpeechRecognition(onFinalText?: (text: string) => void) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const callbackRef = useRef(onFinalText);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    callbackRef.current = onFinalText;
  }, [onFinalText]);

  useEffect(() => {
    const Recognition =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : undefined;

    if (!Recognition) {
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    setSupported(true);

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim() ?? "";

        if (result.isFinal) {
          finalText += `${transcript} `;
        } else {
          interim += `${transcript} `;
        }
      }

      setInterimTranscript(interim.trim());

      if (finalText.trim()) {
        callbackRef.current?.(finalText.trim());
      }
    };

    recognition.onerror = (event) => {
      setError(event.error || "Speech recognition failed.");
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      setInterimTranscript("");
    };

    return () => {
      recognition.stop();
    };
  }, []);

  function start() {
    setError("");
    try {
      recognitionRef.current?.start();
      setListening(true);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Unable to start speech recognition.");
    }
  }

  function stop() {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Some browsers throw if recognition is already stopped.
    }
    setListening(false);
    setInterimTranscript("");
  }

  function reset() {
    setInterimTranscript("");
    setError("");
  }

  return {
    supported,
    listening,
    interimTranscript,
    error,
    start,
    stop,
    reset,
  };
}
