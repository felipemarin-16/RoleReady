import { NextResponse } from "next/server";

import { evaluateInterviewTurn } from "@/lib/interview-brain";

export const runtime = "nodejs";

type TurnRequest = {
  state?: {
    candidateName?: string;
    role?: string;
    companyName?: string;
    seniority?: string;
    interviewType?: string;
    resumeProjectSummary?: string;
    companySummary?: string;
    requiredSkills?: string[];
    keywords?: string[];
    previousQuestions?: string[];
    previousAnswers?: string[];
    coveredSkills?: string[];
    latestQuestion?: string;
    latestAnswer?: string;
  };
};

export async function POST(request: Request) {
  let body: TurnRequest;

  try {
    body = (await request.json()) as TurnRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const state = body.state;

  if (!state?.role || !state.resumeProjectSummary || !state.latestAnswer) {
    return NextResponse.json(
      { error: "Missing required interview state (role/resumeProjectSummary/latestAnswer)." },
      { status: 400 },
    );
  }

  const evaluation = await evaluateInterviewTurn({
    candidateName: state.candidateName || "",
    role: state.role,
    companyName: state.companyName || "",
    seniority: state.seniority || "mid-level",
    interviewType: state.interviewType || "mixed behavioral and role-fit",
    resumeProjectSummary: state.resumeProjectSummary,
    companySummary: state.companySummary || "",
    requiredSkills: Array.isArray(state.requiredSkills) ? state.requiredSkills : [],
    keywords: Array.isArray(state.keywords) ? state.keywords : [],
    previousQuestions: Array.isArray(state.previousQuestions) ? state.previousQuestions : [],
    previousAnswers: Array.isArray(state.previousAnswers) ? state.previousAnswers : [],
    coveredSkills: Array.isArray(state.coveredSkills) ? state.coveredSkills : [],
    latestQuestion: state.latestQuestion || "",
    latestAnswer: state.latestAnswer || "",
  });

  return NextResponse.json(evaluation, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
