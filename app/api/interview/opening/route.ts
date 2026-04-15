import { NextResponse } from "next/server";

import { generateOpeningQuestion } from "@/lib/interview-brain";

export const runtime = "nodejs";

type OpeningRequest = {
  state?: {
    role?: string;
    seniority?: string;
    interviewType?: string;
    resumeProjectSummary?: string;
    companySummary?: string;
    requiredSkills?: string[];
    keywords?: string[];
    previousQuestions?: string[];
    previousAnswers?: string[];
    coveredSkills?: string[];
  };
};

export async function POST(request: Request) {
  let body: OpeningRequest;

  try {
    body = (await request.json()) as OpeningRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const state = body.state;

  if (!state?.role || !state.resumeProjectSummary) {
    return NextResponse.json(
      { error: "Missing required interview state (role/resumeProjectSummary)." },
      { status: 400 },
    );
  }

  const opening = await generateOpeningQuestion({
    role: state.role,
    seniority: state.seniority || "mid-level",
    interviewType: state.interviewType || "mixed behavioral and role-fit",
    resumeProjectSummary: state.resumeProjectSummary,
    companySummary: state.companySummary || "",
    requiredSkills: Array.isArray(state.requiredSkills) ? state.requiredSkills : [],
    keywords: Array.isArray(state.keywords) ? state.keywords : [],
    previousQuestions: Array.isArray(state.previousQuestions) ? state.previousQuestions : [],
    previousAnswers: Array.isArray(state.previousAnswers) ? state.previousAnswers : [],
    coveredSkills: Array.isArray(state.coveredSkills) ? state.coveredSkills : [],
  });

  return NextResponse.json(opening, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

