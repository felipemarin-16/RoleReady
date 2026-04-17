"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Shell } from "@/components/shell";
import { compileFinalReport } from "@/lib/interview-engine";
import { downloadCoverLetterPdf } from "@/lib/pdf-export";
import { clearRoleReadySession, getFinalReport, getInterviewSession, getSetupSession, saveFinalReport } from "@/lib/session";
import type { FinalReport, InterviewSession, SetupSession } from "@/lib/types";

export function ResultsScreen() {
  const router = useRouter();
  const [setup, setSetup] = useState<SetupSession | null>(null);
  const [interview, setInterview] = useState<InterviewSession | null>(null);
  const [report, setReport] = useState<FinalReport | null>(null);

  useEffect(() => {
    const sessionSetup = getSetupSession();
    const sessionInterview = getInterviewSession();
    const sessionReport = getFinalReport();

    if (!sessionSetup || !sessionInterview) {
      return;
    }

    setSetup(sessionSetup);
    setInterview(sessionInterview);

    if (sessionReport) {
      setReport(sessionReport);
      return;
    }

    const nextReport = compileFinalReport(
      sessionInterview.turns,
      sessionSetup.resume,
      sessionSetup.job,
      sessionSetup.companySummary,
    );
    saveFinalReport(nextReport);
    setReport(nextReport);
  }, []);

  if (!setup || !interview || !report) {
    return (
      <Shell
        badge="Results"
        title="Your interview results will appear here."
        subtitle="Complete a session first so RoleReady can generate the score, feedback, and cover letter."
        current="results"
      >
        <div className="panel p-6">
          <button type="button" className="button-primary" onClick={() => router.push("/")}>
            Return to setup
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      badge="Results"
      title="A concise report you can use right away."
      subtitle="RoleReady summarizes where the interview landed, what to sharpen, and how to present your story more convincingly for the role."
      current="results"
      aside={
        <>
          <div className="panel p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">Overall score</p>
            <div className="mt-4 flex items-end gap-3">
              <span className="font-display text-6xl text-ink">{report.overallScore}</span>
              <span className="pb-2 text-lg text-slate">/ 100</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate">
              Based on relevance, specificity, confidence signals, and alignment with the role.
            </p>
          </div>

          <div className="panel p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">Actions</p>
            <div className="mt-4 grid gap-3">
              <button
                type="button"
                className="button-primary w-full"
                onClick={() => downloadCoverLetterPdf(setup.resume.name, report.coverLetterText)}
              >
                Download cover letter PDF
              </button>
              <button
                type="button"
                className="button-secondary w-full"
                onClick={() => {
                  clearRoleReadySession();
                  router.push("/");
                }}
              >
                Start over
              </button>
            </div>
          </div>
        </>
      }
    >
      <div className="grid gap-6">
        <div className="panel overflow-hidden">
          <div className="border-b border-ink/10 bg-[#FBF7F1] px-6 py-4 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate">Screen 3 of 3</p>
            <p className="mt-2 text-sm text-slate">
              Target role: <span className="font-semibold text-ink">{setup.job.roleTitle}</span> at{" "}
              <span className="font-semibold text-ink">{setup.job.companyName}</span>
            </p>
          </div>

          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-2">
            <section className="rounded-[26px] border border-ink/10 bg-white p-5">
              <h2 className="text-lg font-semibold text-ink">What went well</h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate">
                {report.strengths.map((item) => (
                  <li key={item} className="rounded-2xl bg-[#EEF7F5] px-4 py-3 text-ink">
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-[26px] border border-ink/10 bg-white p-5">
              <h2 className="text-lg font-semibold text-ink">What hurt the answer</h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate">
                {report.weaknesses.map((item) => (
                  <li key={item} className="rounded-2xl bg-[#FFF3F0] px-4 py-3 text-ink">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <div className="panel p-6 sm:p-8">
          <h2 className="text-2xl font-semibold text-ink">Better version of your answers</h2>
          <div className="mt-6 space-y-4">
            {report.improvedAnswers.map((item) => {
              const turn = interview.turns.find((entry) => entry.questionId === item.questionId);
              return (
                <div key={item.questionId} className="rounded-[24px] border border-ink/10 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">{turn?.category ?? "Question"}</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-ink">{item.question || turn?.question}</p>
                  <p className="mt-4 text-sm leading-7 text-slate">{item.improvedAnswer}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="panel p-6 sm:p-8">
            <h2 className="text-2xl font-semibold text-ink">Resume gaps for this job</h2>
            <ul className="mt-6 space-y-3 text-sm leading-6 text-slate">
              {report.resumeGaps.map((gap) => (
                <li key={gap} className="rounded-[22px] bg-[#FBF7F1] px-4 py-3">
                  {gap}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-6 sm:p-8">
            <h2 className="text-2xl font-semibold text-ink">Recommendations</h2>
            <ul className="mt-6 space-y-3 text-sm leading-6 text-slate">
              {report.recommendations.map((item) => (
                <li key={item} className="rounded-[22px] bg-white px-4 py-3 shadow-sm">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="panel p-6 sm:p-8">
          <h2 className="text-2xl font-semibold text-ink">Interview transcript review</h2>
          <p className="mt-2 text-sm leading-6 text-slate">
            Review each question, your recorded answer transcript, and the coach follow-up.
          </p>
          <div className="mt-6 space-y-4">
            {interview.turns.map((turn, index) => (
              <article key={`${turn.questionId}-${index}`} className="rounded-[24px] border border-ink/10 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">Coach question</p>
                <p className="mt-2 text-sm leading-7 text-ink">{turn.question}</p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate">Your answer transcript</p>
                <p className="mt-2 text-sm leading-7 text-ink">{turn.answer}</p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate">Coach follow-up</p>
                <p className="mt-2 text-sm leading-7 text-pine">{turn.followUp}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="panel p-6 sm:p-8">
          <h2 className="text-2xl font-semibold text-ink">Cover letter preview</h2>
          <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-slate">{report.coverLetterText}</pre>
          </div>
        </div>
      </div>
    </Shell>
  );
}
