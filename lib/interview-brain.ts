import { getLlmProvider } from "@/lib/llm/provider";
import type { InterviewModelEvaluation } from "@/lib/types";

const BEHAVIORAL_SKILL_HINTS = new Set([
  "communication",
  "leadership",
  "prioritization",
  "collaboration",
  "ownership",
  "stakeholder management",
  "project management",
  "agile",
  "problem solving",
  "decision-making",
  "adaptability",
]);

export type InterviewBrainState = {
  candidateName: string;
  role: string;
  companyName?: string;
  seniority: string;
  interviewType: string;
  resumeProjectSummary: string;
  resumeHighlights?: string[];
  resumeSkills?: string[];
  jobSummary?: string;
  companySummary?: string;
  requiredSkills: string[];
  preferredSkills?: string[];
  responsibilities?: string[];
  keywords: string[];
  previousQuestions: string[];
  previousAnswers: string[];
  coveredSkills: string[];
  latestQuestion?: string;
  latestAnswer?: string;
};

type InterviewStage =
  | "motivation"
  | "experience-overview"
  | "project-deep-dive"
  | "project-follow-up"
  | "tradeoffs"
  | "role-behavioral"
  | "closing";

type AnswerReviewPayload = Pick<InterviewModelEvaluation, "evaluation" | "strengths" | "gaps">;
type NextQuestionPayload = Pick<
  InterviewModelEvaluation,
  "follow_up_question" | "coach_tip" | "why_this_follow_up" | "next_skill_to_probe"
>;

function inferStage(previousQuestionsCount: number): InterviewStage {
  if (previousQuestionsCount === 0) return "motivation";
  if (previousQuestionsCount === 1) return "experience-overview";
  if (previousQuestionsCount === 2) return "project-deep-dive";
  if (previousQuestionsCount === 3) return "project-follow-up";
  if (previousQuestionsCount === 4) return "tradeoffs";
  if (previousQuestionsCount === 5) return "role-behavioral";
  return "closing";
}

// Returns the first required skill not yet mentioned in coveredSkills.
function uncoveredSkill(state: InterviewBrainState): string {
  const covered = new Set(state.coveredSkills.map((s) => s.toLowerCase()));
  const next = state.requiredSkills.find((s) => !covered.has(s.toLowerCase()));
  return next || state.requiredSkills[0] || state.keywords[0] || "role-fit";
}

function pickRelevantResumeHighlight(state: InterviewBrainState): string {
  return state.resumeHighlights?.find(Boolean)?.trim() || "the most relevant project or experience from your background";
}

function normalizedCompanyReference(companyName?: string) {
  const company = companyName?.trim();
  if (!company || company.toLowerCase() === "the company" || company.toLowerCase() === "the team") {
    return "";
  }
  return company;
}

function normalizeSkillLabel(skill: string) {
  return skill.replace(/\bnodejs\b/i, "Node.js").replace(/\bgit\b/i, "Git").trim();
}

function isBehavioralSkill(skill: string) {
  const lower = skill.toLowerCase().trim();
  return BEHAVIORAL_SKILL_HINTS.has(lower);
}

function buildRoleBehavioralQuestion(state: InterviewBrainState) {
  const skill = normalizeSkillLabel(uncoveredSkill(state));
  const responsibilities = state.responsibilities || [];
  const responsibility = responsibilities[0]?.replace(/\s+/g, " ").trim() || "";
  const compactResponsibility =
    responsibility.length > 110 ? `${responsibility.slice(0, 107).trim()}...` : responsibility;

  if (isBehavioralSkill(skill)) {
    return `Tell me about a time when you had to show ${skill}. What happened?`;
  }

  if (compactResponsibility) {
    return `Tell me about a project where you used ${skill}. What were you trying to accomplish?`;
  }

  return `Tell me about a project where you used ${skill}. What did you work on?`;
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

function questionFocus(question: string) {
  const lower = question.toLowerCase();

  if (/\b(tradeoff|trade-off|decision|collaboration|stakeholder|speed|quality|complexity)\b/.test(lower)) {
    return "tradeoff";
  }

  if (/\b(challenge|difficult|hardest|obstacle|problem)\b/.test(lower)) {
    return "challenge";
  }

  if (/\bwhy\b.*\b(role|company|opportunity|next step)\b|\bright next step\b/.test(lower)) {
    return "motivation";
  }

  if (/\bresume\b|\bproject\b|\bwalk me through\b|\btell me about yourself\b/.test(lower)) {
    return "experience";
  }

  if (/\btell me about a time when\b|\bhigh-stakes\b|\bfast-moving\b/.test(lower)) {
    return "behavioral";
  }

  if (/\bwrap up\b|\bremember\b|\bbefore we wrap up\b/.test(lower)) {
    return "closing";
  }

  return "general";
}

function conflictsWithRecentAngle(newQuestion: string, previousQuestions: string[]) {
  const lastQuestion = previousQuestions.at(-1);
  if (!lastQuestion) {
    return false;
  }

  const nextFocus = questionFocus(newQuestion);
  const lastFocus = questionFocus(lastQuestion);

  return nextFocus !== "general" && nextFocus === lastFocus;
}

// Stage-aware fallback question used when the model fails or generates a near-duplicate.
function stageFallbackQuestion(stage: InterviewStage, state: InterviewBrainState): string {
  const company =
    state.companyName?.trim() ||
    state.companySummary?.split(".")[0]?.trim() ||
    "this company";
  const companyReference = normalizedCompanyReference(company);
  const highlight = pickRelevantResumeHighlight(state).replace(/\s+/g, " ").trim();

  switch (stage) {
    case "motivation":
      return companyReference
        ? `Why are you interested in this role at ${companyReference}?`
        : "Why are you interested in this role?";
    case "experience-overview":
      return "Tell me about yourself.";
    case "project-deep-dive":
      return `I saw ${highlight} on your resume. Walk me through that project.`;
    case "project-follow-up":
      return "What was the hardest part of that project for you?";
    case "tradeoffs":
      return "What tradeoff or decision did you have to make on that project?";
    case "role-behavioral":
      return buildRoleBehavioralQuestion(state);
    case "closing":
      return "Before we wrap up, what would you want me to remember about you?";
  }
}

// Stage-aware system prompt for the next interview question.
function buildStageSystemPrompt(stage: InterviewStage): string {
  const jsonShape =
    'Return ONLY strict JSON: {"follow_up_question": string, "coach_tip": string, "why_this_follow_up": string, "next_skill_to_probe": string}.';
  const interviewerRule =
    "Speak like a real interviewer talking to a candidate in a live interview. " +
    "Ask one concise, natural, conversational interview question. " +
    "Do NOT ask analytical or meta questions like 'what do you understand' or 'what are the most relevant aspects'. " +
    "Do NOT use placeholders.";
  const coachTipRule =
    "coach_tip must be a short candidate-facing tip for answering THIS exact question well. " +
    "It should explain the answer approach or what to emphasize, not leak internal reasoning and not reduce the advice to naming one technology unless the question is specifically about that technology. " +
    "Write it like a helpful interview coach, in one sentence.";

  switch (stage) {
    case "motivation":
      return (
        `You are a professional interviewer. ${jsonShape} ` +
        `${interviewerRule} ` +
        `${coachTipRule} ` +
        "follow_up_question must be a MOTIVATION question. " +
        "Use the company and role fields from the context — do NOT use placeholders like [Company Name]. " +
        "Ask why the candidate wants this specific role. " +
        "One concise, direct sentence."
      );

    case "experience-overview":
      return (
        `You are a professional interviewer. ${jsonShape} ` +
        `${interviewerRule} ` +
        `${coachTipRule} ` +
        "follow_up_question must ask for a simple overview of the candidate's background. " +
        "Do not turn it into an analysis prompt. One concise direct sentence."
      );

    case "project-deep-dive":
      return (
        `You are a professional interviewer. ${jsonShape} ` +
        `${interviewerRule} ` +
        `${coachTipRule} ` +
        "follow_up_question must choose ONE specific project or technical example from the resume and ask for a deep walkthrough. " +
        "Use resume_highlights to choose the best project. Ask about it in a natural way. " +
        "Do NOT use generic fit wording."
      );

    case "project-follow-up":
      return (
        `You are a professional interviewer. ${jsonShape} ` +
        `${interviewerRule} ` +
        `${coachTipRule} ` +
        "The candidate just described a project. follow_up_question must ask one focused follow-up on that same project. " +
        "Probe missing depth such as challenge, ownership boundary, decision-making, metrics, or implementation details. " +
        "Do NOT switch to a new topic."
      );

    case "tradeoffs":
      return (
        `You are a professional interviewer. ${jsonShape} ` +
        `${interviewerRule} ` +
        `${coachTipRule} ` +
        "follow_up_question must ask about tradeoffs, technical decisions, collaboration, metrics, stakeholder communication, or outcomes. " +
        "Keep it tied to the project or experience already under discussion."
      );

    case "role-behavioral":
      return (
        `You are a professional interviewer. ${jsonShape} ` +
        `${interviewerRule} ` +
        `${coachTipRule} ` +
        "follow_up_question must be a role-specific or behavioral question tied to the actual job. " +
        'If behavioral, it may start with "Tell me about a time when". ' +
        "Use uncovered required skills, responsibilities, or working style expectations from the posting. " +
        "Do not repeat already_asked questions."
      );

    case "closing":
      return (
        `You are a professional interviewer. ${jsonShape} ` +
        `${interviewerRule} ` +
        `${coachTipRule} ` +
        "follow_up_question should invite the candidate to make their strongest final case or " +
        "reflect on the conversation. Keep it brief and warm."
      );
  }
}

async function generateCoachTip(
  provider: ReturnType<typeof getLlmProvider>,
  question: string,
  stage: InterviewStage,
  state: InterviewBrainState,
) {
  try {
    const output = await provider.generateJson<{ coach_tip?: string }>({
      systemPrompt:
        'Return ONLY strict JSON: {"coach_tip": string}. ' +
        "You are a supportive interview coach. Write one short, natural tip that helps the candidate answer the exact interview question well. " +
        "Focus on what to emphasize or how to structure the answer for this specific question. " +
        "Do NOT leak internal reasoning, and do NOT reduce the tip to naming a random skill or technology unless the question is directly about it.",
      userPrompt: JSON.stringify({
        stage,
        role: state.role,
        company: normalizedCompanyReference(state.companyName) || "",
        question,
        resume_highlights: (state.resumeHighlights || []).slice(0, 3),
        required_skills: state.requiredSkills.slice(0, 5),
      }),
    });

    return sanitizeText(output.coach_tip, "");
  } catch {
    return "";
  }
}

function buildAnswerReviewSystemPrompt() {
  return (
    'Return ONLY strict JSON: {"evaluation": string}. ' +
    "You are a supportive interview coach reviewing ONE candidate answer. " +
    "Analyze the answer and provide feedback that identifies ONE specific strength and ONE concrete improvement. " +
    "Use an encouraging, constructive tone. " +

    "Format the evaluation exactly like this: " +
    'Strength: [positive observation]\nImprovement: [specific suggestion with an example]. ' +

    "RULES: " +
    "- Keep each section to 2-3 sentences maximum. " +
    "- Base the feedback on the actual answer, question, and resume context. " +
    "- Focus only on answer quality: clarity, specificity, structure, relevance, completeness, and confidence. " +
    "- Do NOT judge overall job fit or qualifications. " +
    "- Do NOT quote long chunks of the answer. " +
    "- Avoid generic wording that could apply to any answer. " +
    "- The improvement must include a practical example of how to answer better next time. " +
    "- If no real strength stands out, say that gently but honestly."
  );
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

function normalizeQuestionSpacing(question: string) {
  return question.replace(/\s+/g, " ").trim();
}

function questionLooksAwkward(question: string) {
  const lower = question.toLowerCase();

  return (
    /\bhad to (sql|react|typescript|javascript|python|java|c\+\+|git|aws|docker|kubernetes)\b/i.test(question) ||
    /\bhow does your experience fit\b/i.test(lower) ||
    /\bstrong fit for this role\b/i.test(lower) ||
    /\brole involves you'?ll\b/i.test(lower) ||
    question.length > 240
  );
}

function ensureQuestionQuality(rawQuestion: string, stage: InterviewStage, state: InterviewBrainState) {
  const normalized = normalizeQuestionSpacing(rawQuestion);

  if (!normalized) {
    return stageFallbackQuestion(stage, state);
  }

  if (questionLooksAwkward(normalized)) {
    return stageFallbackQuestion(stage, state);
  }

  return normalized;
}

async function polishQuestion(
  provider: ReturnType<typeof getLlmProvider>,
  question: string,
  stage: InterviewStage,
  state: InterviewBrainState,
) {
  try {
    const polished = await provider.generateJson<{ question?: string }>({
      systemPrompt:
        'You rewrite interview questions. Return ONLY strict JSON: {"question": string}. ' +
        "Rewrite the question so it sounds like a real interviewer speaking to a candidate. " +
        "Keep it concise, conversational, grammatically correct, and easy to answer. Preserve the core intent. " +
        "Do not introduce placeholders, analysis language, resume noise, or awkward wording. " +
        "Do not paste long job-description text into the question.",
      userPrompt: JSON.stringify({
        stage,
        role: state.role,
        company: normalizedCompanyReference(state.companyName) || "",
        resume_highlight: pickRelevantResumeHighlight(state),
        original_question: question,
      }),
    });

    return ensureQuestionQuality(String(polished.question ?? ""), stage, state);
  } catch {
    return ensureQuestionQuality(question, stage, state);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Opening question — always static, no LLM.
// A reliable, role-aware intro prompt that starts every interview cleanly.
// ─────────────────────────────────────────────────────────────────────────────
export async function generateOpeningQuestion(state: InterviewBrainState) {
  const provider = getLlmProvider();
  const baseQuestion = "Tell me about yourself.";
  const question = await polishQuestion(provider, baseQuestion, "motivation", state);
  const coachTip = await generateCoachTip(provider, question, "motivation", state);

  return {
    question,
    coach_tip: coachTip,
    whyThisQuestion:
      "Starts with a natural warm-up so the candidate can frame their story before the interview narrows into role fit and project depth.",
    nextSkillToProbe:
      state.requiredSkills[0] || state.keywords[0] || "role-fit",
  };
}

function normalizeFeedbackBlock(text: string, fallback: string) {
  const cleaned = text
    .replace(/```(?:json)?/gi, "")
    .replace(/\r/g, "")
    .replace(/"strengths"\s*:\s*\[[\s\S]*$/i, "")
    .replace(/"gaps"\s*:\s*\[[\s\S]*$/i, "")
    .trim();

  const strengthMatch = cleaned.match(/Strength:\s*([\s\S]*?)(?=\s*Improvement:|$)/i);
  const improvementMatch = cleaned.match(/Improvement:\s*([\s\S]*?)$/i);

  const toSentence = (value: string) => {
    const trimmed = value.replace(/\s+/g, " ").trim().replace(/[.]+$/g, "");
    if (!trimmed) return "";
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  };

  if (strengthMatch || improvementMatch) {
    const strength = strengthMatch?.[1]?.replace(/\s+/g, " ").trim() || "None.";
    const improvement = improvementMatch?.[1]?.replace(/\s+/g, " ").trim();

    if (improvement) {
      return `Strength: ${toSentence(strength)}\nImprovement: ${toSentence(improvement)}`;
    }
  }

  const plainParagraph = cleaned.replace(/\s+/g, " ").trim();
  if (!plainParagraph) {
    return fallback;
  }

  const sentences = plainParagraph.match(/[^.!?]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
  if (!sentences.length) {
    return fallback;
  }

  const clipped = sentences.slice(0, 4).map(toSentence);
  if (clipped.length === 1) {
    return `Strength: None.\nImprovement: ${clipped[0]}`;
  }

  return `Strength: ${clipped[0]}\nImprovement: ${clipped.slice(1).join(" ")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Turn evaluation — stage-aware, anti-repetition, with quality fallbacks.
// ─────────────────────────────────────────────────────────────────────────────
export async function evaluateInterviewTurn(
  state: InterviewBrainState,
): Promise<InterviewModelEvaluation> {
  const provider = getLlmProvider();
  const stage = inferStage(state.previousQuestions.length);
  const questionSystemPrompt = buildStageSystemPrompt(stage);
  const answerReviewSystemPrompt = buildAnswerReviewSystemPrompt();
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
    resume_highlights: (state.resumeHighlights || []).slice(0, 4),
    resume_skills: (state.resumeSkills || []).slice(0, 10),
    job_summary: (state.jobSummary || "").slice(0, 350),
    required_skills: state.requiredSkills.slice(0, 4),
    preferred_skills: (state.preferredSkills || []).slice(0, 4),
    responsibilities: (state.responsibilities || []).slice(0, 4),
    skill_to_probe_next: skill,
    already_asked: allAskedQuestions.slice(-4),
    latest_question: state.latestQuestion || "",
    latest_answer: (state.latestAnswer || "").slice(0, 500),
  });

  const defaultAnswerReview: AnswerReviewPayload = {
    evaluation:
      "Strength: You gave a direct answer, which helps the interviewer understand your main point quickly.\nImprovement: The response would be stronger with one concrete example that shows what you did and what came out of it. For example, briefly name a project, explain your role, and end with the result.",
    strengths: ["Answered directly."],
    gaps: [
      "Stayed too general to be memorable.",
      "Needed a more concrete example.",
    ],
  };

  const defaultQuestionPlan: NextQuestionPayload = {
    follow_up_question: stageFallbackQuestion(stage, state),
    coach_tip: "",
    why_this_follow_up: `Moves the interview into the ${stage} stage.`,
    next_skill_to_probe: skill,
  };

  try {
    const answerReviewOutput = await provider.generateJson<AnswerReviewPayload>({
      systemPrompt: answerReviewSystemPrompt,
      userPrompt: JSON.stringify({
        question: state.latestQuestion || "",
        answer: (state.latestAnswer || "").slice(0, 700),
        resume_excerpt: state.resumeProjectSummary.slice(0, 350),
      }),
    });

    const questionOutput = await provider.generateJson<NextQuestionPayload>({
      systemPrompt: questionSystemPrompt,
      userPrompt,
    });

    const rawFollowUp = sanitizeText(questionOutput.follow_up_question, "");

    // Anti-repetition: if the model generated something too close to a prior question,
    // fall back to the stage-appropriate question instead.
    const candidateQuestion =
      rawFollowUp &&
        !isTooSimilar(rawFollowUp, allAskedQuestions) &&
        !conflictsWithRecentAngle(rawFollowUp, allAskedQuestions)
        ? ensureQuestionQuality(rawFollowUp, stage, state)
        : stageFallbackQuestion(stage, state);
    const followUpQuestion = await polishQuestion(provider, candidateQuestion, stage, state);
    const coachTip = sanitizeText(
      questionOutput.coach_tip,
      await generateCoachTip(provider, followUpQuestion, stage, state),
    );

    const strengths = sanitizeList(answerReviewOutput.strengths);
    const gaps = sanitizeList(answerReviewOutput.gaps);
    const evaluation = normalizeFeedbackBlock(
      sanitizeText(answerReviewOutput.evaluation, defaultAnswerReview.evaluation),
      defaultAnswerReview.evaluation,
    );

    return {
      evaluation,
      strengths: strengths.length ? strengths : defaultAnswerReview.strengths,
      gaps: gaps.length ? gaps : defaultAnswerReview.gaps,
      follow_up_question: followUpQuestion,
      coach_tip: coachTip,
      why_this_follow_up: sanitizeText(
        questionOutput.why_this_follow_up,
        defaultQuestionPlan.why_this_follow_up,
      ),
      next_skill_to_probe: sanitizeText(questionOutput.next_skill_to_probe, skill),
    };
  } catch {
    return {
      ...defaultAnswerReview,
      ...defaultQuestionPlan,
      follow_up_question: stageFallbackQuestion(stage, state),
    };
  }
}
