"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { SiteHeader } from "@/components/site-header";
import { buildInterviewContext } from "@/lib/interview-context";
import { extractTextFromPdf } from "@/lib/pdf";
import { parseResumeText } from "@/lib/resume-parser";
import { parseJobPosting } from "@/lib/job-parser";
import { saveInterviewSession, saveSetupSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export function SetupScreen() {
  const router = useRouter();
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [jobPosting, setJobPosting] = useState("");
  const [confirmedCompany, setConfirmedCompany] = useState("");
  const [confirmedPosition, setConfirmedPosition] = useState("");
  const [confirmedJobType, setConfirmedJobType] = useState("Full-time");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);
  const targetQuestionCount = Number.parseInt(process.env.NEXT_PUBLIC_INTERVIEW_TARGET_COUNT || "5", 10);
  const canContinueFromStepOne = candidateName.trim().length > 0;
  const canContinueFromStepTwo = Boolean(resumeFile);
  const canContinueFromStepThree = jobPosting.trim().length > 0;
  const canStart = canContinueFromStepOne && canContinueFromStepTwo && canContinueFromStepThree && confirmedCompany.trim().length > 0 && confirmedPosition.trim().length > 0;

  function goToNextStep() {
    if (step === 0 && !canContinueFromStepOne) {
      setError("Add the name you want the interviewer to use.");
      return;
    }

    if (step === 1 && !canContinueFromStepTwo) {
      setError("Upload a PDF resume to continue.");
      return;
    }

    if (step === 2) {
      if (!canContinueFromStepThree) {
        setError("Paste a job posting to continue.");
        return;
      }
      // Pre-populate confirmation from parsed job
      const parsed = parseJobPosting(jobPosting);
      setConfirmedCompany(parsed.companyName !== "the company" ? parsed.companyName : "");
      setConfirmedPosition(parsed.roleTitle !== "Target Role" ? parsed.roleTitle : "");
      setConfirmedJobType(parsed.jobType || "Full-time");
    }

    if (step === 3) {
      if (!confirmedCompany.trim()) {
        setError("Enter the company name to continue.");
        return;
      }
      if (!confirmedPosition.trim()) {
        setError("Enter the position title to continue.");
        return;
      }
    }

    if (step < 3) {
      setError("");
      setStep((current) => current + 1);
    }
  }

  function goToPreviousStep() {
    setError("");
    setStep((current) => Math.max(0, current - 1));
  }

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
    setShowOverlay(true);

    const minWait = new Promise<void>((resolve) => setTimeout(resolve, 3000));

    try {
      const rawResumeText = await extractTextFromPdf(resumeFile);
      const resume = parseResumeText(rawResumeText);
      const parsedJob = parseJobPosting(jobPosting);
      const job = {
        ...parsedJob,
        companyName: confirmedCompany.trim() || parsedJob.companyName,
        roleTitle: confirmedPosition.trim() || parsedJob.roleTitle,
        jobType: confirmedJobType || parsedJob.jobType,
      };
      const context = buildInterviewContext(resume, job, candidateName);

      const openingSkill = job.requiredSkills[0] || job.keywords[0] || "role-fit";
      const openingQuestion = `Tell me about yourself and walk me through the experience or projects that make you a strong fit for the ${job.roleTitle || "role"} role.`;
      const openingFocus = "Open with a concise narrative: who you are, what you've done, and why this role.";

      console.groupCollapsed("RoleReady setup debug");
      console.info("Parsed resume", resume);
      console.info("Parsed job", job);
      console.info("Interview context", context);
      console.groupEnd();

      saveSetupSession({
        createdAt: new Date().toISOString(),
        coachVoice: "female",
        companySummary: "",
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

      await minWait;

      startTransition(() => {
        router.push("/interview");
      });
    } catch (setupError) {
      setShowOverlay(false);
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
    <>
    {showOverlay ? (
      <div className="animate-fade-in fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#f8f9fc]">
        <p className="font-display text-3xl text-ink">Preparing your interview</p>
        <p className="mt-3 text-sm text-slate">Getting everything ready for you…</p>
        <div className="mt-8 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-ink/30"
              style={{ animation: `fade-in 0.6s ease ${i * 0.2}s infinite alternate both` }}
            />
          ))}
        </div>
      </div>
    ) : null}

    <main className="min-h-screen px-4 py-6 sm:px-6">
      <div className="animate-entrance mx-auto max-w-lg">
        <SiteHeader current="home" />

        {/* Hero */}
        <div className="mt-16 text-center">
          <h1 className="font-display text-4xl leading-tight text-ink sm:text-5xl">
            Practice interviews that feel real.
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-base leading-7 text-slate">
            Upload your resume, paste a job posting, and get a tailored mock interview with coaching feedback.
          </p>
        </div>

        {/* Setup flow — no card wrappers, just content */}
        <div className="mt-14">
          {/* Progress bar */}
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className={cn(
                  "h-0.5 flex-1 rounded-full transition-all duration-300",
                  index <= step ? "bg-ink" : "bg-ink/12",
                )}
              />
            ))}
          </div>

          {/* Step heading */}
          <div className="mt-10 text-center">
            <h2 className="font-display text-3xl text-ink sm:text-4xl">
              {step === 0
                ? "What’s your name?"
                : step === 1
                  ? "Upload your resume"
                  : step === 2
                    ? "Paste the job posting"
                    : "Confirm job details"}
            </h2>
            <p className="mt-3 text-sm text-slate">
              {step === 0
                ? "This is how the interviewer will address you."
                : step === 1
                  ? "A PDF resume lets RoleReady tailor the questions to your experience."
                  : step === 2
                    ? "The job description shapes every question in the interview."
                    : "We’ll use these details in the interview and your cover letter."}
            </p>
          </div>

          {/* Step input */}
          <div key={step} className="animate-step-in mt-8">
            {step === 0 ? (
              <input
                id="candidate-name"
                type="text"
                className="field text-center text-lg"
                placeholder="e.g. Felipe"
                value={candidateName}
                autoFocus
                onChange={(event) => setCandidateName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") goToNextStep();
                }}
              />
            ) : null}

            {step === 1 ? (
              <label
                htmlFor="resume"
                className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-ink/20 px-6 py-10 text-center transition hover:border-ink/35 hover:bg-ink/[0.02]"
              >
                {resumeFile ? (
                  <>
                    <span className="text-base font-semibold text-ink">{resumeFile.name}</span>
                    <span className="mt-1 text-sm text-slate">Click to replace</span>
                  </>
                ) : (
                  <>
                    <span className="text-base font-semibold text-ink">Click to upload PDF</span>
                    <span className="mt-1 text-sm text-slate">or drag and drop</span>
                  </>
                )}
                <input
                  id="resume"
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setResumeFile(file);
                  }}
                />
              </label>
            ) : null}

            {step === 2 ? (
              <textarea
                id="job-posting"
                rows={10}
                className="field resize-none text-base"
                placeholder="Paste the job posting here."
                value={jobPosting}
                autoFocus
                onChange={(event) => setJobPosting(event.target.value)}
              />
            ) : null}

            {step === 3 ? (
              <div className="flex flex-col gap-5">
                <div>
                  <label htmlFor="confirmed-company" className="mb-1.5 block text-sm font-medium text-ink">
                    Company
                  </label>
                  <input
                    id="confirmed-company"
                    type="text"
                    className="field"
                    placeholder="e.g. Acme Corp"
                    value={confirmedCompany}
                    autoFocus
                    onChange={(event) => setConfirmedCompany(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="confirmed-position" className="mb-1.5 block text-sm font-medium text-ink">
                    Position
                  </label>
                  <input
                    id="confirmed-position"
                    type="text"
                    className="field"
                    placeholder="e.g. Software Engineer"
                    value={confirmedPosition}
                    onChange={(event) => setConfirmedPosition(event.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">Job type</label>
                  <div className="flex flex-wrap gap-2">
                    {["Full-time", "Part-time", "Contract", "Internship", "Freelance"].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setConfirmedJobType(type)}
                        className={cn(
                          "rounded-full border px-4 py-1.5 text-sm transition",
                          confirmedJobType === type
                            ? "border-ink bg-ink text-white"
                            : "border-ink/18 text-ink hover:border-ink/35",
                        )}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Navigation */}
          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous step"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full border transition",
                step === 0 || loading
                  ? "cursor-not-allowed border-ink/8 text-ink/18"
                  : "border-ink/18 text-ink hover:border-ink/35",
              )}
              onClick={goToPreviousStep}
              disabled={step === 0 || loading}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10 13L5 8L10 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {step < 3 ? (
              <button
                type="button"
                aria-label="Next step"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/18 text-ink transition hover:border-ink/35"
                onClick={goToNextStep}
                disabled={loading}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className="button-primary"
                onClick={handleStartInterview}
                disabled={loading || !canStart}
              >
                {loading ? "Preparing..." : "Start interview"}
              </button>
            )}
          </div>

          {error ? (
            <p className="mt-5 text-center text-sm text-red-600">{error}</p>
          ) : null}
        </div>
      </div>
    </main>
    </>
  );
}
