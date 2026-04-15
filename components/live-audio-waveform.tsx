"use client";

import { useAudioWaveform } from "@/hooks/useAudioWaveform";
import { cn } from "@/lib/utils";

type LiveAudioWaveformProps = {
  tone: "coach" | "candidate";
  active: boolean;
  mediaElement?: HTMLMediaElement | null;
  mediaStream?: MediaStream | null;
  activityLevel?: number;
  className?: string;
  barCount?: number;
};

export function LiveAudioWaveform({
  tone,
  active,
  mediaElement,
  mediaStream,
  activityLevel,
  className,
  barCount = 20,
}: LiveAudioWaveformProps) {
  const levels = useAudioWaveform({
    active,
    mediaElement,
    mediaStream,
    activityLevel,
    barCount,
  });

  return (
    <div
      aria-hidden="true"
      className={cn("flex h-[56px] items-end justify-center gap-1 overflow-hidden", className)}
    >
      {levels.map((level, index) => (
        <span
          key={`${tone}-${index}`}
          className={cn(
            "inline-block rounded-full transition-[height,opacity] duration-75 ease-out",
            tone === "coach"
              ? "bg-gradient-to-t from-[#6B4E18] via-[#8B6420] to-[#AE853A]"
              : "bg-gradient-to-t from-[#4AA3D8] via-[#63B7E8] to-[#2D63C3]",
          )}
          style={{
            width: 5,
            height: `${Math.max(8, Math.round(8 + level * 44))}px`,
            opacity: Math.max(0.35, Math.min(1, 0.45 + level * 0.75)),
          }}
        />
      ))}
    </div>
  );
}
