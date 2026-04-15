"use client";

import { useEffect, useState } from "react";

type UseAudioWaveformOptions = {
  active: boolean;
  mediaElement?: HTMLMediaElement | null;
  mediaStream?: MediaStream | null;
  activityLevel?: number;
  barCount?: number;
};

const IDLE_LEVEL = 0.08;

function createIdleLevels(barCount: number) {
  return Array.from({ length: barCount }, () => IDLE_LEVEL);
}

export function useAudioWaveform({
  active,
  mediaElement,
  mediaStream,
  activityLevel = 0,
  barCount = 20,
}: UseAudioWaveformOptions) {
  const [levels, setLevels] = useState<number[]>(() => createIdleLevels(barCount));

  useEffect(() => {
    setLevels(createIdleLevels(barCount));
  }, [barCount]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!active || (!mediaElement && !mediaStream && activityLevel <= 0)) {
      setLevels(createIdleLevels(barCount));
      return;
    }

    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      setLevels(createIdleLevels(barCount));
      return;
    }

    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;

    let sourceNode: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null = null;
    let oscillator: OscillatorNode | null = null;
    let activityGainNode: GainNode | null = null;

    try {
      if (mediaElement) {
        sourceNode = audioContext.createMediaElementSource(mediaElement);
      } else if (mediaStream) {
        sourceNode = audioContext.createMediaStreamSource(mediaStream);
      } else {
        oscillator = audioContext.createOscillator();
        oscillator.type = "sawtooth";
        oscillator.frequency.value = 172;
        activityGainNode = audioContext.createGain();
        activityGainNode.gain.value = 0.001;
        oscillator.connect(activityGainNode);
        activityGainNode.connect(analyser);
        oscillator.start();
      }
    } catch {
      setLevels(createIdleLevels(barCount));
      void audioContext.close();
      return;
    }

    if (sourceNode) {
      sourceNode.connect(analyser);
    }
    if (mediaElement) {
      analyser.connect(audioContext.destination);
    }

    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }

    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    let animationFrame = 0;
    let cancelled = false;

    const draw = () => {
      if (cancelled) {
        return;
      }

      analyser.getByteFrequencyData(frequencyData);

      if (activityGainNode && oscillator) {
        const signal = Math.max(0.001, Math.min(0.28, activityLevel * 0.28));
        activityGainNode.gain.setTargetAtTime(signal, audioContext.currentTime, 0.04);
        oscillator.frequency.setTargetAtTime(145 + activityLevel * 230, audioContext.currentTime, 0.06);
      }

      const halfCount = Math.ceil(barCount / 2);
      const frequencyCap = Math.max(18, Math.floor(frequencyData.length * 0.62));
      const centerOutLevels = Array.from({ length: halfCount }, (_, bandIndex) => {
        const fromRatio = Math.pow(bandIndex / halfCount, 1.8);
        const toRatio = Math.pow((bandIndex + 1) / halfCount, 1.8);
        const start = Math.floor(fromRatio * frequencyCap);
        const end = Math.max(start + 1, Math.min(frequencyCap, Math.floor(toRatio * frequencyCap)));
        let total = 0;

        for (let i = start; i < end; i += 1) {
          total += frequencyData[i];
        }

        const average = total / Math.max(1, end - start);
        const normalized = Math.pow(Math.max(0, average / 255), 0.72);
        const centerWeight = 1 - (bandIndex / Math.max(1, halfCount - 1)) * 0.34;
        return Math.max(IDLE_LEVEL, Math.min(1, normalized * centerWeight));
      });

      const nextLevels = Array.from({ length: barCount }, (_, index) => {
        const centerDistance = Math.abs(index - (barCount - 1) / 2);
        const bandIndex = Math.min(halfCount - 1, Math.round(centerDistance));
        return centerOutLevels[bandIndex];
      });

      setLevels((current) =>
        current.map((value, index) => value * 0.58 + nextLevels[index] * 0.42),
      );

      animationFrame = window.requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      sourceNode?.disconnect();
      if (oscillator) {
        oscillator.stop();
        oscillator.disconnect();
      }
      activityGainNode?.disconnect();
      analyser.disconnect();
      void audioContext.close();
      setLevels(createIdleLevels(barCount));
    };
  }, [active, activityLevel, barCount, mediaElement, mediaStream]);

  return levels;
}
