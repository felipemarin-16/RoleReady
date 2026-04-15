import { getLlmProvider } from "@/lib/llm/provider";
import type { InterviewModelEvaluation } from "@/lib/types";

export type InterviewBrainState = {
  role: string;
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

function sanitizeList(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function sanitizeText(input: unknown, fallback: string) {
  const text = String(input ?? "").trim();
  return text || fallback;
}

function defaultSkill(state: InterviewBrainState) {
  return state.requiredSkills[0] || state.keywords[0] || "role-fit execution";
}

function fallbackEvaluation(state: InterviewBrainState): InterviewModelEvaluation {
  const latestAnswer = state.latestAnswer?.trim() ?? "";
  const nextSkill = defaultSkill(state);

  return {
    evaluation: latestAnswer
      ? "The answer is directionally relevant but can be tighter and more evidence-based."
      : "No answer content was captured, so the interview should gather a concise example.",
    strengths: latestAnswer
      ? ["Stayed aligned with the question context.", "Shared useful background detail."]
      : ["Maintained interview flow."],
    gaps: latestAnswer
      ? ["Needs clearer ownership language.", "Could add one measurable outcome."]
      : ["No concrete answer provided yet."],
    follow_up_question: `Could you share a concrete example that shows your impact in ${nextSkill}?`,
    why_this_follow_up: "This follow-up requests specific evidence and ownership to evaluate role fit.",
    next_skill_to_probe: nextSkill,
  };
}

export async function generateOpeningQuestion(state: InterviewBrainState) {
  const provider = getLlmProvider();

  const systemPrompt = [
    "You are an experienced recruiter running a realistic mock interview.",
    "Your tone must be concise, professional, and naturally curious.",
    "Generate exactly one interview question as JSON.",
    "Do not greet. Do not add prefacing text.",
    "The question must not repeat previous questions.",
    "Return strict JSON with keys: question, why_this_question, next_skill_to_probe.",
  ].join(" ");

  const userPrompt = JSON.stringify({
    role: state.role,
    seniority: state.seniority,
    interview_type: state.interviewType,
    resume_project_summary: state.resumeProjectSummary,
    company_summary: state.companySummary || "",
    required_skills: state.requiredSkills,
    keywords: state.keywords,
    previous_questions: state.previousQuestions,
    covered_skills: state.coveredSkills,
  });

  try {
    const output = await provider.generateJson<{
      question?: string;
      why_this_question?: string;
      next_skill_to_probe?: string;
    }>({ systemPrompt, userPrompt });

    return {
      question: sanitizeText(
        output.question,
        `Tell me about yourself and why your background fits this ${state.role} role.`,
      ),
      whyThisQuestion: sanitizeText(
        output.why_this_question,
        "Open with a focused fit narrative before diving deeper.",
      ),
      nextSkillToProbe: sanitizeText(output.next_skill_to_probe, defaultSkill(state)),
    };
  } catch {
    return {
      question: `Tell me about yourself and why your background fits this ${state.role} role.`,
      whyThisQuestion: "Open with a focused fit narrative before diving deeper.",
      nextSkillToProbe: defaultSkill(state),
    };
  }
}

export async function evaluateInterviewTurn(state: InterviewBrainState): Promise<InterviewModelEvaluation> {
  const provider = getLlmProvider();

  const systemPrompt = [
    "You are an adaptive interviewer.",
    "Analyze the candidate's latest answer and produce strict JSON.",
    "Avoid repeating previous questions.",
    "Follow-up question must be directly tied to the latest answer.",
    "Track coverage and choose a useful next skill to probe.",
    "Keep language concise and realistic for a live interview.",
    "Return only JSON with keys:",
    "evaluation, strengths, gaps, follow_up_question, why_this_follow_up, next_skill_to_probe.",
  ].join(" ");

  const userPrompt = JSON.stringify({
    role: state.role,
    seniority: state.seniority,
    interview_type: state.interviewType,
    resume_project_summary: state.resumeProjectSummary,
    company_summary: state.companySummary || "",
    required_skills: state.requiredSkills,
    keywords: state.keywords,
    previous_questions: state.previousQuestions,
    previous_answers: state.previousAnswers,
    covered_skills: state.coveredSkills,
    latest_question: state.latestQuestion || "",
    latest_answer: state.latestAnswer || "",
  });

  try {
    const output = await provider.generateJson<InterviewModelEvaluation>({
      systemPrompt,
      userPrompt,
    });

    return {
      evaluation: sanitizeText(output.evaluation, "The answer is relevant but needs sharper evidence."),
      strengths: sanitizeList(output.strengths),
      gaps: sanitizeList(output.gaps),
      follow_up_question: sanitizeText(
        output.follow_up_question,
        `Could you give me a concrete example that demonstrates your impact in ${defaultSkill(state)}?`,
      ),
      why_this_follow_up: sanitizeText(
        output.why_this_follow_up,
        "This follow-up requests concrete detail and measurable impact.",
      ),
      next_skill_to_probe: sanitizeText(output.next_skill_to_probe, defaultSkill(state)),
    };
  } catch {
    return fallbackEvaluation(state);
  }
}

