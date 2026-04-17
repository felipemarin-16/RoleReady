"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { LiveAudioWaveform } from "@/components/live-audio-waveform";
import { SiteHeader } from "@/components/site-header";
import { Shell } from "@/components/shell";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { buildAnswerFeedback, compileFinalReport, scoreAnswer } from "@/lib/interview-engine";
import { getInterviewSession, getSetupSession, saveFinalReport, saveInterviewSession } from "@/lib/session";
import type { InterviewModelEvaluation, InterviewSession, InterviewTurn, SetupSession } from "@/lib/types";
import { cn } from "@/lib/utils";

function getFirstName(fullName: string) {
  const cleaned = fullName.replace(/[^a-zA-Z\s'-]/g, " ").trim();
  const first = cleaned.split(/\s+/).find(Boolean);
  return first ? `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()}` : "there";
}

function uniqueItems(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

export function InterviewScreen() {
  const router = useRouter();
  const [setup, setSetup] = useState<SetupSession | null>(null);
  const [interview, setInterview] = useState<InterviewSession | null>(null);
  const [draftAnswer, setDraftAnswer] = useState("");
  const draftAnswerRef = useRef("");
  const [status, setStatus] = useState("Loading interview...");
  const [error, setError] = useState("");
  const [pendingAdvance, setPendingAdvance] = useState(false);
  const [spokenQuestionId, setSpokenQuestionId] = useState("");
  const [openingDelivered, setOpeningDelivered] = useState(false);
  const [userMicStream, setUserMicStream] = useState<MediaStream | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  useEffect(() => {
    const sessionSetup = getSetupSession();
    const sessionInterview = getInterviewSession();

    if (!sessionSetup || !sessionInterview) {
      setStatus("Missing interview setup.");
      return;
    }

    setSetup(sessionSetup);
    setInterview(sessionInterview);
    setStatus("Ready");
  }, []);

  const currentQuestion = interview?.currentQuestion ?? null;
  const progressLabel = interview
    ? `Question ${Math.min(interview.currentQuestionIndex + 1, interview.targetQuestionCount)} of ${interview.targetQuestionCount}`
    : "Interview";
  const interviewContext = setup?.context ?? {
    candidateName: setup?.resume.name || "there",
    role: setup?.job.roleTitle || "Target Role",
    seniority: "mid-level",
    interviewType: "mixed behavioral and role-fit",
    resumeProjectSummary: setup?.resume.rawText.slice(0, 600) || "",
  };
  const candidateFirstName = getFirstName(setup?.context.candidateName ?? setup?.resume.name ?? "");
  const interviewRole = setup?.context.role || setup?.job.roleTitle || "this role";
  const interviewCompany = setup?.context.companyName || setup?.job.companyName || "";
  const openingGreeting = interviewCompany && interviewCompany !== "the company"
    ? `Hi ${candidateFirstName}, it's nice to meet you. I'm Mark and I'll be interviewing you today for the ${interviewRole} position at ${interviewCompany}. Take a breath, stay comfortable, and answer as clearly as you can.`
    : `Hi ${candidateFirstName}, it's nice to meet you. I'm Mark and I'll be interviewing you today for the ${interviewRole} position. Take a breath, stay comfortable, and answer as clearly as you can.`;
  const ttsMode = "browser";
  const {
    supported: ttsSupported,
    ready: ttsReady,
    selectedVoiceName,
    provider,
    activeAudioElement,
    browserSpeechLevel,
    lastError: voiceError,
    speak,
    stop: stopSpeaking,
    speaking,
  } = useSpeechSynthesis(setup?.coachVoice ?? "female", { mode: ttsMode });
  const {
    supported: sttSupported,
    listening,
    error: recognitionError,
    start,
    stop,
    reset,
  } = useSpeechRecognition((text) => {
    setDraftAnswer((current) => {
      const next = `${current} ${text}`.trim();
      draftAnswerRef.current = next;
      return next;
    });
  });

  useEffect(() => {
    if (!currentQuestion || !interview || pendingAdvance) {
      return;
    }

    if (spokenQuestionId === currentQuestion.id) {
      return;
    }

    if (ttsSupported && !ttsReady) {
      return;
    }

    const isOpeningQuestion = interview.currentQuestionIndex === 0 && interview.turns.length === 0 && !openingDelivered;
    const spokenPrompt = isOpeningQuestion
      ? `${openingGreeting} First question: ${currentQuestion.prompt}`
      : currentQuestion.prompt;

    speak(spokenPrompt);
    setSpokenQuestionId(currentQuestion.id);
    if (isOpeningQuestion) {
      setOpeningDelivered(true);
    }
  }, [currentQuestion, interview, openingDelivered, openingGreeting, pendingAdvance, speak, spokenQuestionId, ttsReady, ttsSupported]);

  useEffect(() => {
    if (recognitionError) {
      setError(recognitionError);
    }
  }, [recognitionError]);

  useEffect(() => {
    return () => {
      userMicStream?.getTracks().forEach((track) => track.stop());
    };
  }, [userMicStream]);

  function updateInterview(nextInterview: InterviewSession) {
    setInterview(nextInterview);
    saveInterviewSession(nextInterview);
  }

  async function handleStartRecording() {
    if (!sttSupported) {
      setError("Speech recognition is unavailable in this browser. This prototype currently requires microphone input.");
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone access is unavailable in this browser.");
      return;
    }

    setError("");
    stopSpeaking();

    try {
      const hasLiveTrack = userMicStream?.getTracks().some((track) => track.readyState === "live");
      if (!hasLiveTrack) {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        setUserMicStream(nextStream);
      }

      start();
    } catch (streamError) {
      setError(streamError instanceof Error ? streamError.message : "Microphone permission is required to record an answer.");
    }
  }

  function handleStopRecording() {
    stop();
  }

  function handleReplayQuestion() {
    if (!currentQuestion) {
      return;
    }

    if (ttsSupported && !ttsReady) {
      setError("Coach voice is still loading. Give it a second and try replay again.");
      return;
    }

    setError("");
    speak(currentQuestion.prompt);
  }

  function handleContinue() {
    if (!setup || !interview) {
      return;
    }

    const nextIndex = interview.currentQuestionIndex + 1;

    if (nextIndex >= interview.targetQuestionCount) {
      const report = compileFinalReport(interview.turns, setup.resume, setup.job, setup.companySummary);
      saveFinalReport(report);
      startTransition(() => {
        router.push("/results");
      });
      return;
    }

    const nextQuestionPrompt = interview.pendingNextQuestion?.trim();
    if (!nextQuestionPrompt) {
      setError("No follow-up question is ready yet. Submit another answer to continue.");
      setPendingAdvance(false);
      return;
    }

    const nextSkill = interview.pendingNextSkill?.trim();
    const nextFocus = interview.pendingFollowUpReason?.trim() || "Answer with ownership, decisions, and measurable outcomes.";

    updateInterview({
      ...interview,
      currentQuestionIndex: nextIndex,
      currentQuestion: {
        id: `q${nextIndex + 1}`,
        category: "adaptive",
        prompt: nextQuestionPrompt,
        focus: nextFocus,
        targetSkills: nextSkill ? [nextSkill] : [],
      },
      pendingNextQuestion: undefined,
      pendingNextSkill: undefined,
      pendingFollowUpReason: undefined,
    });
    setDraftAnswer("");
    draftAnswerRef.current = "";
    setPendingAdvance(false);
    reset();
  }

  function storeTurn(turn: InterviewTurn, modelResponse: InterviewModelEvaluation) {
    if (!setup || !interview) {
      return;
    }

    const nextTurns = [...interview.turns, turn];
    const completed = nextTurns.length >= interview.targetQuestionCount;
    const nextSkill = modelResponse.next_skill_to_probe?.trim();
    const nextCoveredSkills = uniqueItems([
      ...interview.coveredSkills,
      ...(nextSkill ? [nextSkill] : []),
    ]);

    const nextInterview = {
      ...interview,
      turns: nextTurns,
      coveredSkills: nextCoveredSkills,
      pendingNextQuestion: modelResponse.follow_up_question,
      pendingNextSkill: modelResponse.next_skill_to_probe,
      pendingFollowUpReason: modelResponse.why_this_follow_up,
      completedAt: completed ? new Date().toISOString() : interview.completedAt,
    };

    updateInterview(nextInterview);
    setPendingAdvance(true);
    stop();
    reset();

    if (completed) {
      const report = compileFinalReport(nextTurns, setup.resume, setup.job, setup.companySummary);
      saveFinalReport(report);
      window.setTimeout(() => {
        startTransition(() => {
          router.push("/results");
        });
      }, 900);
    }
  }

  async function handleSpeakToggle() {
    if (listening) {
      stop();
      // Wait briefly for any final speech recognition results to flush into the ref
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      void handleSubmitAnswer();
    } else {
      void handleStartRecording();
    }
  }

  async function handleSubmitAnswer() {
    if (!setup || !interview || !currentQuestion) {
      return;
    }

    const answer = draftAnswerRef.current.trim() || draftAnswer.trim();
    if (!answer) {
      setError("No answer was recorded. Tap Speak and say your answer.");
      return;
    }

    setError("");
    setEvaluating(true);

    try {
      const modelResponse = await fetch("/api/interview/turn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          state: {
            candidateName: setup.context?.candidateName || setup.resume.name || "",
            companyName: setup.job.companyName || "",
            role: interviewContext.role,
            seniority: interviewContext.seniority,
            interviewType: interviewContext.interviewType,
            resumeProjectSummary: interviewContext.resumeProjectSummary,
            companySummary: setup.companySummary,
            requiredSkills: setup.job.requiredSkills,
            keywords: setup.job.keywords,
            previousQuestions: interview.turns.map((turn) => turn.question),
            previousAnswers: interview.turns.map((turn) => turn.answer),
            coveredSkills: interview.coveredSkills,
            latestQuestion: currentQuestion.prompt,
            latestAnswer: answer,
          },
        }),
      });

      if (!modelResponse.ok) {
        const details = await modelResponse.text();
        throw new Error(details || "Local interview model request failed.");
      }

      const evaluation = (await modelResponse.json()) as InterviewModelEvaluation;
      const heuristicFeedback = buildAnswerFeedback(answer, currentQuestion, setup.job);

      storeTurn(
        {
          questionId: currentQuestion.id,
          category: currentQuestion.category,
          question: currentQuestion.prompt,
          answer,
          followUp: evaluation.follow_up_question,
          evaluation: evaluation.evaluation,
          whyThisFollowUp: evaluation.why_this_follow_up,
          nextSkillToProbe: evaluation.next_skill_to_probe,
          scores: scoreAnswer({
            answer,
            question: currentQuestion,
            job: setup.job,
          }),
          feedback: {
            strengths: evaluation.strengths.length ? evaluation.strengths : heuristicFeedback.strengths,
            issues: evaluation.gaps.length ? evaluation.gaps : heuristicFeedback.issues,
            improvedAnswer: heuristicFeedback.improvedAnswer,
          },
        },
        evaluation,
      );
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Could not evaluate this answer with the local model.",
      );
    } finally {
      setEvaluating(false);
    }
  }

  function handleSkipQuestion() {
    if (!currentQuestion) {
      return;
    }

    const skipEvaluation: InterviewModelEvaluation = {
      evaluation: "No answer was provided, so interview depth for this topic is limited.",
      strengths: ["Protected the interview flow by moving forward."],
      gaps: ["No concrete response to evaluate for this question."],
      follow_up_question: "Let’s shift to another area. Can you share one strong example that best represents your impact?",
      why_this_follow_up: "This keeps momentum while recovering evidence for role fit.",
      next_skill_to_probe: interview?.coveredSkills[0] || setup?.job.requiredSkills[0] || "role-fit execution",
    };

    storeTurn(
      {
        questionId: currentQuestion.id,
        category: currentQuestion.category,
        question: currentQuestion.prompt,
        answer: "Skipped by user.",
        followUp: skipEvaluation.follow_up_question,
        evaluation: skipEvaluation.evaluation,
        whyThisFollowUp: skipEvaluation.why_this_follow_up,
        nextSkillToProbe: skipEvaluation.next_skill_to_probe,
        scores: {
          relevance: 20,
          specificity: 10,
          confidence: 35,
          alignment: 20,
          overall: 21,
        },
        feedback: {
          strengths: skipEvaluation.strengths,
          issues: skipEvaluation.gaps,
          improvedAnswer:
            "Use a short, structured answer even if you are unsure: context, action, result, and why it matters here.",
        },
      },
      skipEvaluation,
    );
  }

  if (!setup || !interview || !currentQuestion) {
    return (
      <Shell
        badge="RoleReady"
        title="Interview session not found."
        subtitle="Set up a session first so the app can tailor the questions and report."
        current="interview"
      >
        <div className="panel p-6">
          <p className="text-sm text-slate">{status}</p>
          <button type="button" className="button-primary mt-4" onClick={() => router.push("/")}>
            Return to setup
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <main className="min-h-screen bg-transparent px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <SiteHeader current="interview" />

        {/* Question card */}
        <section className="animate-entrance relative mt-8 min-h-[260px] overflow-hidden rounded-[40px] border border-white/70 bg-[linear-gradient(120deg,rgba(212,255,215,0.92)_0%,rgba(195,232,247,0.96)_48%,rgba(159,181,255,0.92)_100%)] px-6 py-8 shadow-[0_35px_80px_-35px_rgba(74,103,168,0.45)] sm:px-10 sm:py-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.34),transparent_35%)]" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/60">
                {progressLabel}
              </p>
              <LiveAudioWaveform
                tone="coach"
                active={speaking}
                mediaElement={activeAudioElement}
                activityLevel={browserSpeechLevel}
                className="w-24"
              />
            </div>

            {interview.currentQuestionIndex === 0 && interview.turns.length === 0 ? (
              <p className="mt-6 text-sm leading-7 text-ink/70">{openingGreeting}</p>
            ) : null}

            <h2
              key={currentQuestion.id}
              className={cn(
                "animate-step-in mt-6 font-semibold leading-[1.4] text-ink",
                currentQuestion.prompt.length > 120
                  ? "text-xl sm:text-2xl"
                  : currentQuestion.prompt.length > 70
                    ? "text-2xl sm:text-3xl"
                    : "text-3xl sm:text-4xl",
              )}
            >
              {currentQuestion.prompt}
            </h2>

            <p className="mt-4 min-h-[1.5rem] text-sm leading-6 text-ink/65">
              {pendingAdvance ? "\u00A0" : currentQuestion.focus}
            </p>
          </div>
        </section>

        {/* Response area */}
        <div className="mt-10 flex flex-col items-center gap-4">
          {/* Single circular action button — same shape in all states */}
          <button
            type="button"
            onClick={() => {
              if (pendingAdvance) {
                handleContinue();
              } else {
                void handleSpeakToggle();
              }
            }}
            disabled={evaluating || (!pendingAdvance && (!sttSupported || speaking))}
            className={cn(
              "relative flex h-20 w-20 items-center justify-center rounded-full text-sm font-semibold text-white transition-all duration-200 disabled:opacity-40",
              evaluating
                ? "bg-ink/40 cursor-not-allowed"
                : listening
                  ? "animate-recording-pulse bg-red-500"
                  : pendingAdvance
                    ? "animate-fade-in bg-ink hover:scale-105 active:scale-95"
                    : "bg-ink hover:scale-105 active:scale-95",
            )}
          >
            {evaluating ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : listening ? (
              "Stop"
            ) : pendingAdvance ? (
              interview.turns.length >= interview.targetQuestionCount ? "Done" : "Next"
            ) : (
              "Speak"
            )}
          </button>

          {/* Status hint */}
          <p className="text-sm text-slate">
            {evaluating
              ? "Thinking…"
              : speaking
                ? "Coach is speaking…"
                : listening
                  ? "Tap Stop when you're done"
                  : pendingAdvance
                    ? "Tap Next to continue"
                    : "Tap Speak when ready"}
          </p>

          {/* Errors */}
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
