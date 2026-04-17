import { getLlmProvider } from "@/lib/llm/provider";
import type { InterviewModelEvaluation } from "@/lib/types";

export type InterviewBrainState = {
  candidateName: string;
  role: string;
  companyName?: string;
  seniority: string;
  interviewType: string;
  resumeProjectSummary: string;
  companySummary?: string;
  requiredSkills: string[];
  keywords: string[];
  previousQuestions: string[];
  previousAnswers: string[];
  coveredSkills: string[];
  latestQuestion?: string;
  latestAnswer?: string;
};

// Interview stage inferred from how many questions have already been asked.
// previousQuestions.length = number of completed turns before this one.
//   0 → intro just answered → generate motivation Q
//   1 → motivation answered → generate experience Q
//   2 → experience answered → generate deep-dive Q
//   3 → deep-dive answered → generate behavioral Q
//   4+ → generate a closing or wrap-up Q
type InterviewStage = "motivation" | "experience" | "deep-dive" | "behavioral" | "closing";

function inferStage(previousQuestionsCount: number): InterviewStage {
  if (previousQuestionsCount === 0) return "motivation";
  if (previousQuestionsCount === 1) return "experience";
  if (previousQuestionsCount === 2) return "deep-dive";
  if (previousQuestionsCount === 3) return "behavioral";
  return "closing";
}

// Returns the first required skill not yet mentioned in coveredSkills.
function uncoveredSkill(state: InterviewBrainState): string {
  const covered = new Set(state.coveredSkills.map((s) => s.toLowerCase()));
  const next = state.requiredSkills.find((s) => !covered.has(s.toLowerCase()));
  return next || state.requiredSkills[0] || state.keywords[0] || "role-fit";
}

// Simple word-overlap similarity check. Returns true if newQ shares > 50% of
// significant words with any question already asked — meaning it is a near-duplicate.
function isTooSimilar(newQuestion: string, previousQuestions: string[]): boolean {
  const sig = (s: string) =>
    s
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4);

  const newWords = new Set(sig(newQuestion));
  if (newWords.size === 0) return false;

  for (const prev of previousQuestions) {
    const prevWords = sig(prev);
    const overlap = prevWords.filter((w) => newWords.has(w)).length;
    if (overlap / Math.max(newWords.size, prevWords.length, 1) > 0.5) {
      return true;
    }
  }
  return false;
}

// Stage-aware fallback question used when the model fails or generates a near-duplicate.
function stageFallbackQuestion(stage: InterviewStage, state: InterviewBrainState): string {
  const role = state.role || "this role";
  const skill = uncoveredSkill(state);
  const company =
    state.companyName?.trim() ||
    state.companySummary?.split(".")[0]?.trim() ||
    "this company";

  switch (stage) {
    case "motivation":
      return `Why are you drawn to the ${role} role at ${company}, and why are you making a move right now?`;
    case "experience":
      return `Walk me through the project or experience from your background that is most relevant to the ${role} role — what you owned, the problem you solved, and the outcome.`;
    case "deep-dive":
      return `What was the most difficult part of that work, and how specifically did you handle it?`;
    case "behavioral":
      return `Tell me about a time when you had to ${skill} under pressure or in a high-stakes situation. What happened and what did you do?`;
    case "closing":
      return `Thinking about everything we've discussed, what is the one thing about your background you most want me to remember for this role?`;
  }
}

// Stage-aware system prompt. Short and directive so small models (0.6b) can follow it.
function buildStageSystemPrompt(stage: InterviewStage): string {
  const jsonShape =
    'Return ONLY strict JSON: {"evaluation": string, "strengths": [string, string], ' +
    '"gaps": [string, string], "follow_up_question": string, ' +
    '"why_this_follow_up": string, "next_skill_to_probe": string}.';

  switch (stage) {
    case "motivation":
      return (
        `You are a professional interviewer. ${jsonShape} ` +
        "follow_up_question must be a MOTIVATION question. " +
        "Use the company and role fields from the context — do NOT use placeholders like [Company Name]. " +
        "Ask why the candidate wants this specific role at this company, and why now in their career. " +
        "One concise, direct sentence."
      );

    case "experience":
      return (
        `You are a professional interviewer. ${jsonShape} ` +
        "follow_up_question must ask the candidate to walk through ONE specific project or experience " +
        "from their resume: what they personally owned, the problem, and the result. " +
        "Pick the most role-relevant detail from resume_summary. One direct question."
      );

    case "deep-dive":
      return (
        `You are a professional interviewer. ${jsonShape} ` +
        "The candidate just described an experience. follow_up_question must probe something they did NOT cover: " +
        "a key decision, a specific challenge, a measurable outcome, or a lesson learned. " +
        "Do NOT rephrase or repeat already_asked questions. One targeted question."
      );

    case "behavioral":
      return (
        `You are a professional interviewer. ${jsonShape} ` +
        'follow_up_question MUST start with "Tell me about a time when". ' +
        "Focus on a skill_to_probe_next that has not been demonstrated yet. " +
        "Do not repeat already_asked questions."
      );

    case "closing":
      return (
        `You are a professional interviewer. ${jsonShape} ` +
        "follow_up_question should invite the candidate to make their strongest final case or " +
        "reflect on the conversation. Keep it brief and warm."
      );
  }
}

function sanitizeList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function sanitizeText(input: unknown, fallback: string): string {
  const text = String(input ?? "").trim();
  return text || fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Opening question — always static, no LLM.
// A reliable, role-aware intro prompt that starts every interview cleanly.
// ─────────────────────────────────────────────────────────────────────────────
export async function generateOpeningQuestion(state: InterviewBrainState) {
  const role = state.role || "this role";

  return {
    question: `Tell me about yourself and walk me through the experience or projects that make you a strong fit for the ${role} role.`,
    whyThisQuestion:
      "Opens with a candidate-led narrative so we can identify which areas to probe first.",
    nextSkillToProbe:
      state.requiredSkills[0] || state.keywords[0] || "role-fit",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Turn evaluation — stage-aware, anti-repetition, with quality fallbacks.
// ─────────────────────────────────────────────────────────────────────────────
export async function evaluateInterviewTurn(
  state: InterviewBrainState,
): Promise<InterviewModelEvaluation> {
  const provider = getLlmProvider();
  const stage = inferStage(state.previousQuestions.length);
  const systemPrompt = buildStageSystemPrompt(stage);
  const skill = uncoveredSkill(state);

  // Include the current question in the "already asked" list so the model avoids it.
  const allAskedQuestions = [
    ...state.previousQuestions,
    state.latestQuestion || "",
  ].filter(Boolean);

  const userPrompt = JSON.stringify({
    candidate_name: state.candidateName,
    role: state.role,
    company: state.companyName?.trim() || "the company",
    seniority: state.seniority,
    resume_summary: state.resumeProjectSummary.slice(0, 350),
    required_skills: state.requiredSkills.slice(0, 4),
    skill_to_probe_next: skill,
    already_asked: allAskedQuestions.slice(-4),
    latest_question: state.latestQuestion || "",
    latest_answer: (state.latestAnswer || "").slice(0, 500),
  });

  const defaultEvaluation: InterviewModelEvaluation = {
    evaluation: "The answer is relevant but could be more specific and evidence-based.",
    strengths: ["Showed relevant background.", "Stayed on topic."],
    gaps: [
      "Add a concrete example with a clear outcome.",
      "Quantify impact where possible.",
    ],
    follow_up_question: stageFallbackQuestion(stage, state),
    why_this_follow_up: `Moves the interview into the ${stage} stage.`,
    next_skill_to_probe: skill,
  };

  try {
    const output = await provider.generateJson<InterviewModelEvaluation>({
      systemPrompt,
      userPrompt,
    });

    const rawFollowUp = sanitizeText(output.follow_up_question, "");

    // Anti-repetition: if the model generated something too close to a prior question,
    // fall back to the stage-appropriate question instead.
    const followUpQuestion =
      rawFollowUp && !isTooSimilar(rawFollowUp, allAskedQuestions)
        ? rawFollowUp
        : stageFallbackQuestion(stage, state);

    const strengths = sanitizeList(output.strengths);
    const gaps = sanitizeList(output.gaps);

    return {
      evaluation: sanitizeText(
        output.evaluation,
        defaultEvaluation.evaluation,
      ),
      strengths: strengths.length ? strengths : defaultEvaluation.strengths,
      gaps: gaps.length ? gaps : defaultEvaluation.gaps,
      follow_up_question: followUpQuestion,
      why_this_follow_up: sanitizeText(
        output.why_this_follow_up,
        defaultEvaluation.why_this_follow_up,
      ),
      next_skill_to_probe: sanitizeText(output.next_skill_to_probe, skill),
    };
  } catch {
    return {
      ...defaultEvaluation,
      follow_up_question: stageFallbackQuestion(stage, state),
    };
  }
}
