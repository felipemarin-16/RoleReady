"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { LiveAudioWaveform } from "@/components/live-audio-waveform";
import { SiteHeader } from "@/components/site-header";
import { Shell } from "@/components/shell";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { buildAnswerFeedback, compileFinalReport, scoreAnswer } from "@/lib/interview-engine";
import { getInterviewSession, getSetupSession, saveFinalReport, saveInterviewSession } from "@/lib/session";
import type { InterviewModelEvaluation, InterviewSession, InterviewTurn, SetupSession } from "@/lib/types";

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
  const [status, setStatus] = useState("Loading interview...");
  const [error, setError] = useState("");
  const [followUpPreview, setFollowUpPreview] = useState("");
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
    role: setup?.job.roleTitle || "Target Role",
    seniority: "mid-level",
    interviewType: "mixed behavioral and role-fit",
    resumeProjectSummary: setup?.resume.rawText.slice(0, 600) || "",
  };
  const candidateFirstName = getFirstName(setup?.resume.name ?? "");
  const openingGreeting = `Hi ${candidateFirstName}, it's nice to meet you. I'm Mark and I'll be interviewing you today. Take a breath, stay comfortable, and answer as clearly as you can.`;
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
    setDraftAnswer((current) => `${current} ${text}`.trim());
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
    setFollowUpPreview("");
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
    setFollowUpPreview(modelResponse.follow_up_question);
    setPendingAdvance(true);
    stop();
    reset();
    speak(modelResponse.follow_up_question);

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

  async function handleSubmitAnswer() {
    if (!setup || !interview || !currentQuestion) {
      return;
    }

    const answer = draftAnswer.trim();
    if (!answer) {
      setError("Record your answer before continuing.");
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
      <div className="mx-auto max-w-6xl">
        <SiteHeader current="interview" />

        <div className="mt-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate">Interview in Progress</p>
          <h1 className="mt-3 font-display text-4xl text-ink sm:text-5xl">{progressLabel}</h1>
        </div>

        <div className="mx-auto mt-10 max-w-5xl">
          <section className="relative overflow-hidden rounded-[40px] border border-white/70 bg-[linear-gradient(120deg,rgba(212,255,215,0.92)_0%,rgba(195,232,247,0.96)_48%,rgba(159,181,255,0.92)_100%)] px-6 py-8 shadow-[0_35px_80px_-35px_rgba(74,103,168,0.45)] sm:px-8 sm:py-10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.34),transparent_35%)]" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <p className="pt-4 text-sm font-semibold uppercase tracking-[0.18em] text-ink/80">
                  Question {interview.currentQuestionIndex + 1}
                </p>
                <LiveAudioWaveform
                  tone="coach"
                  active={speaking}
                  mediaElement={activeAudioElement}
                  activityLevel={browserSpeechLevel}
                  className="mt-1 flex-1"
                />
                <div className="hidden min-w-[110px] text-right text-xs text-ink/70 sm:block">
                  <p>{setup.coachVoice} coach</p>
                  <p>{selectedVoiceName || "system voice"}</p>
                  <p className="mt-1 uppercase tracking-[0.16em] text-[10px]">{provider === "elevenlabs" ? "ElevenLabs" : "Browser"}</p>
                </div>
              </div>

              {interview.currentQuestionIndex === 0 && interview.turns.length === 0 ? (
                <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-7 text-ink/85">{openingGreeting}</p>
              ) : null}

              <div className="mx-auto mt-10 max-w-4xl text-center">
                <h2 className="text-3xl font-semibold leading-[1.35] text-ink sm:text-4xl">
                  {currentQuestion.prompt}
                </h2>
              </div>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-2xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/75">
                    {followUpPreview ? "Coach follow-up" : "Coach tip"}
                  </p>
                  <p className="mt-2 text-base leading-7 text-ink/85">
                    {followUpPreview
                      ? followUpPreview
                      : currentQuestion.focus}
                  </p>
                </div>
                <div className="min-w-[180px] rounded-full bg-white/70 px-4 py-3 text-center text-sm font-semibold text-ink shadow-sm">
                  {speaking
                    ? "Coach is speaking"
                    : ttsSupported && !ttsReady
                      ? "Loading voice..."
                      : "Your turn next"}
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-panel backdrop-blur">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-lg font-semibold text-ink">Your response</p>
                <p className="mt-1 text-sm text-slate">
                  Use microphone controls only. Your transcript is captured in the background and shown on the results screen.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => {
                    void handleStartRecording();
                  }}
                  disabled={!sttSupported || listening || pendingAdvance || evaluating}
                >
                  {listening ? "Recording..." : "Start recording"}
                </button>
                <button type="button" className="button-secondary" onClick={handleStopRecording} disabled={!listening || evaluating}>
                  Stop
                </button>
                <button type="button" className="button-secondary" onClick={handleReplayQuestion} disabled={speaking || evaluating}>
                  Replay
                </button>
                <button type="button" className="button-secondary" onClick={handleSkipQuestion} disabled={pendingAdvance || evaluating}>
                  Skip
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-ink/10 bg-white px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-medium text-ink">
                  {listening
                    ? "Recording your answer..."
                    : evaluating
                      ? "Coach is evaluating your answer..."
                    : pendingAdvance
                      ? "Answer submitted. Review the follow-up, then continue."
                      : draftAnswer
                        ? "Answer captured. Submit when you're ready."
                        : "No recorded answer yet."}
                </p>
                <span className="rounded-full bg-[#EEF7F5] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-pine">
                  {draftAnswer ? `${draftAnswer.split(/\s+/).filter(Boolean).length} words captured` : "waiting"}
                </span>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : null}

            {voiceError ? (
              <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {voiceError}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate">
              <span className="rounded-full bg-[#FBF7F1] px-4 py-2">{sttSupported ? "Microphone enabled" : "Microphone not available"}</span>
              <span className="rounded-full bg-[#EEF7F5] px-4 py-2">
                {provider === "elevenlabs"
                  ? selectedVoiceName
                    ? `Voice: ${selectedVoiceName}`
                    : "Voice: ElevenLabs"
                  : selectedVoiceName
                    ? `Voice: ${selectedVoiceName}`
                    : "Voice: browser"}
              </span>
              <span className="rounded-full bg-white px-4 py-2">
                Engine: {provider === "elevenlabs" ? "ElevenLabs" : "Browser voice"}
              </span>
            </div>
          </section>

          <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="rounded-[30px] bg-white/70 px-6 py-5 shadow-panel backdrop-blur">
              <div className="flex flex-col items-center justify-center gap-2 text-center">
                <p className="text-lg font-medium text-ink">
                  {listening ? "Listening now" : pendingAdvance ? "Coach follow-up ready" : "Your turn to answer"}
                </p>
                <LiveAudioWaveform
                  tone="candidate"
                  active={listening}
                  mediaStream={userMicStream}
                  className="w-full max-w-[320px]"
                />
                <p className="text-sm text-slate">
                  {listening
                    ? "Speak naturally and stop recording when you finish."
                    : "Answer by voice, submit, then continue to the next question."}
                </p>
              </div>
            </div>

            <div className="flex justify-center lg:justify-end">
              {pendingAdvance ? (
                <button type="button" className="button-primary min-w-[220px]" onClick={handleContinue}>
                  {interview.turns.length >= interview.targetQuestionCount ? "See results" : "Next question"}
                </button>
              ) : (
                <button
                  type="button"
                  className="button-primary min-w-[220px]"
                  onClick={() => {
                    void handleSubmitAnswer();
                  }}
                  disabled={listening || !draftAnswer.trim() || evaluating}
                >
                  {evaluating ? "Evaluating..." : "Submit answer"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
