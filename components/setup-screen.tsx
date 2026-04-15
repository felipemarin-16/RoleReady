"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { SiteHeader } from "@/components/site-header";
import { buildInterviewContext } from "@/lib/interview-context";
import { extractTextFromPdf } from "@/lib/pdf";
import { parseResumeText } from "@/lib/resume-parser";
import { parseJobPosting } from "@/lib/job-parser";
import { saveInterviewSession, saveSetupSession } from "@/lib/session";
import type { CoachVoice } from "@/lib/types";
import { cn } from "@/lib/utils";

const INITIAL_JOB_POSTING = `Senior Product Designer
Join Northstar Health to shape patient-facing experiences across web and mobile.

Responsibilities
- Partner with product, engineering, and research to define solutions
- Turn complex workflows into clean, usable journeys
- Present design rationale to stakeholders

Requirements
- 4+ years of product design experience
- Strong Figma and design systems experience
- Experience using data and research to inform decisions

Preferred Qualifications
- Healthcare experience
- Experience collaborating in agile teams`;

export function SetupScreen() {
  const router = useRouter();
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobPosting, setJobPosting] = useState(INITIAL_JOB_POSTING);
  const [companySummary, setCompanySummary] = useState(
    "Northstar Health is focused on making care journeys clearer, faster, and more human for patients.",
  );
  const [coachVoice, setCoachVoice] = useState<CoachVoice>("female");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const targetQuestionCount = Number.parseInt(process.env.NEXT_PUBLIC_INTERVIEW_TARGET_COUNT || "5", 10);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSpeechSupported(
      "speechSynthesis" in window || "webkitSpeechRecognition" in window || "SpeechRecognition" in window,
    );
  }, []);

  async function handleStartInterview() {
    if (!resumeFile) {
      setError("Upload a PDF resume to begin the interview.");
      return;
    }

    if (!jobPosting.trim()) {
      setError("Paste a job posting so RoleReady can tailor the questions.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const rawResumeText = await extractTextFromPdf(resumeFile);
      const resume = parseResumeText(rawResumeText);
      const job = parseJobPosting(jobPosting);
      const context = buildInterviewContext(resume, job);
      const openingResponse = await fetch("/api/interview/opening", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          state: {
            role: context.role,
            seniority: context.seniority,
            interviewType: context.interviewType,
            resumeProjectSummary: context.resumeProjectSummary,
            companySummary,
            requiredSkills: job.requiredSkills,
            keywords: job.keywords,
            previousQuestions: [],
            previousAnswers: [],
            coveredSkills: [],
          },
        }),
      });

      if (!openingResponse.ok) {
        const details = await openingResponse.text();
        throw new Error(details || "Unable to start interview with local model.");
      }

      const openingPayload = (await openingResponse.json()) as {
        question?: string;
        whyThisQuestion?: string;
        nextSkillToProbe?: string;
      };

      const openingQuestion = (openingPayload.question || `Tell me about yourself and why you are a fit for the ${job.roleTitle} role.`).trim();
      const openingFocus = (openingPayload.whyThisQuestion || "Start with a concise fit narrative anchored in outcomes.").trim();
      const openingSkill = (openingPayload.nextSkillToProbe || job.requiredSkills[0] || job.keywords[0] || "role-fit").trim();

      console.groupCollapsed("RoleReady setup debug");
      console.info("Parsed resume", resume);
      console.info("Parsed job", job);
      console.info("Interview context", context);
      console.info("Opening question", openingPayload);
      console.groupEnd();

      saveSetupSession({
        createdAt: new Date().toISOString(),
        coachVoice,
        companySummary,
        resumeFileName: resumeFile.name,
        resume,
        job,
        context,
      });

      saveInterviewSession({
        startedAt: new Date().toISOString(),
        currentQuestionIndex: 0,
        targetQuestionCount: Number.isFinite(targetQuestionCount) && targetQuestionCount > 0 ? targetQuestionCount : 5,
        currentQuestion: {
          id: "q1",
          category: "adaptive",
          prompt: openingQuestion,
          focus: openingFocus,
          targetSkills: [openingSkill].filter(Boolean),
        },
        coveredSkills: openingSkill ? [openingSkill] : [],
        turns: [],
      });

      startTransition(() => {
        router.push("/interview");
      });
    } catch (setupError) {
      setError(
        setupError instanceof Error
          ? setupError.message
          : "We ran into an issue while parsing the resume. Please try another PDF.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <SiteHeader current="home" />

        <section id="home" className="mt-10 grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
          <div className="space-y-6">
            <span className="inline-flex rounded-full border border-ink/10 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
              RoleReady
            </span>
            <div className="space-y-4">
              <h1 className="max-w-2xl font-display text-4xl leading-tight text-ink sm:text-5xl">
                Mock interview practice that feels polished, personal, and role-aware.
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate sm:text-lg">
                Upload your resume, paste the job posting, and RoleReady runs an adaptive mock interview with tailored prompts, coaching follow-ups, and a final report.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="panel p-5">
                <p className="text-sm font-semibold text-ink">What you’ll get</p>
                <p className="mt-2 text-sm leading-6 text-slate">
                  Tailored interview questions, real-time transcripts, coaching feedback, and a downloadable cover letter.
                </p>
              </div>
              <div className="panel p-5">
                <p className="text-sm font-semibold text-ink">Speech setup</p>
                <p className="mt-2 text-sm leading-6 text-slate">
                  RoleReady uses the configured coach voice path and falls back to browser voice automatically when needed.
                </p>
              </div>
            </div>
          </div>

          <div className="panel overflow-hidden">
            <div className="border-b border-ink/10 bg-[#FBF7F1] px-6 py-4 sm:px-8">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate">Screen 1 of 3</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">Interview setup</h2>
            </div>

            <div className="space-y-6 p-6 sm:p-8">
              <div>
                <label className="label" htmlFor="resume">
                  Resume PDF
                </label>
                <input
                  id="resume"
                  type="file"
                  accept="application/pdf"
                  className="field file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setResumeFile(file);
                  }}
                />
                <p className="mt-2 text-sm text-slate">
                  {resumeFile ? `Selected: ${resumeFile.name}` : "Upload a PDF resume to unlock the interview flow."}
                </p>
              </div>

              <div>
                <label className="label" htmlFor="job-posting">
                  Job posting
                </label>
                <textarea
                  id="job-posting"
                  rows={11}
                  className="field resize-none"
                  value={jobPosting}
                  onChange={(event) => setJobPosting(event.target.value)}
                />
              </div>

              <div>
                <label className="label" htmlFor="company-summary">
                  Company summary (optional)
                </label>
                <textarea
                  id="company-summary"
                  rows={4}
                  className="field resize-none"
                  placeholder="Add a mission, product summary, or culture notes to personalize the motivation question."
                  value={companySummary}
                  onChange={(event) => setCompanySummary(event.target.value)}
                />
              </div>

              <div className="rounded-[24px] border border-ink/10 bg-white p-4">
                <p className="text-sm font-semibold text-ink">Coach voice</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(["female", "male"] as CoachVoice[]).map((voice) => (
                    <button
                      key={voice}
                      type="button"
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left text-sm transition",
                        coachVoice === voice
                          ? "border-ink bg-ink text-white"
                          : "border-ink/10 bg-white text-ink hover:border-ink/20",
                      )}
                      onClick={() => setCoachVoice(voice)}
                    >
                      <span className="block font-semibold capitalize">{voice} coach</span>
                      <span className={cn("mt-1 block text-xs", coachVoice === voice ? "text-white/80" : "text-slate")}>
                        RoleReady will pick the best available voice match for this coach style.
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate">
                  Speech support:{" "}
                  <span className={cn("font-semibold", speechSupported ? "text-pine" : "text-amber-700")}>
                    {speechSupported ? "microphone + voice playback available" : "microphone required for interview mode"}
                  </span>
                </div>
                <button
                  type="button"
                  className="button-primary min-w-[220px]"
                  onClick={handleStartInterview}
                  disabled={loading || !resumeFile || !jobPosting.trim()}
                >
                  {loading ? "Preparing interview..." : "Continue to interview"}
                </button>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              ) : null}
            </div>
          </div>
        </section>

        <section id="about" className="mt-16 grid gap-6 lg:grid-cols-3">
          <div className="panel p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate">About</p>
            <p className="mt-3 text-sm leading-7 text-slate">
              RoleReady is designed to feel like a focused mock interview, not a chat tool. The setup is lightweight so the demo starts fast.
            </p>
          </div>
          <div className="panel p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate">Question logic</p>
            <p className="mt-3 text-sm leading-7 text-slate">
              Resume parsing, job extraction, question generation, and scoring all run with deterministic heuristics for a reliable prototype flow.
            </p>
          </div>
          <div className="panel p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate">Voice path</p>
            <p className="mt-3 text-sm leading-7 text-slate">
              Coach playback can run through ElevenLabs or browser voice, while microphone capture stays browser-native.
            </p>
          </div>
        </section>

        <section id="contact" className="mt-16 pb-10">
          <div className="panel p-6 sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate">Contact</p>
            <h3 className="mt-3 text-2xl font-semibold text-ink">Ready to customize the interview flow further?</h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate">
              This prototype is set up to evolve. The next steps can be better voice profiles, richer resume heuristics, deeper feedback, or branding updates once the structure feels right.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
