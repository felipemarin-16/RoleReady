import { FILLER_WORDS, HEDGING_PHRASES } from "@/lib/constants";
import type {
  AnswerFeedback,
  AnswerScores,
  FinalReport,
  InterviewQuestion,
  InterviewTurn,
  JobData,
  ResumeData,
} from "@/lib/types";
import { average, clamp, keywordOverlapScore, splitSentences, unique } from "@/lib/utils";
import { buildCoverLetter } from "@/lib/cover-letter";

type ScoreInput = {
  answer: string;
  question: InterviewQuestion;
  job: JobData;
};

function countMatches(text: string, phrases: string[]) {
  const lower = text.toLowerCase();
  return phrases.reduce((count, phrase) => count + (lower.match(new RegExp(`\\b${phrase}\\b`, "g"))?.length ?? 0), 0);
}

function hasMetrics(text: string) {
  return /\b\d+[%x]?\b/.test(text) || /\b(increased|reduced|grew|improved|saved|shipped|launched)\b/i.test(text);
}

function hasOwnershipLanguage(text: string) {
  return /\b(i led|i built|i designed|i owned|i delivered|i created|i drove|i managed|i launched)\b/i.test(text);
}

export function generateFollowUp(answer: string, question: InterviewQuestion) {
  const trimmed = answer.trim();
  if (!trimmed) {
    return "Could you give me one concise example so I can understand your approach?";
  }

  if (/\b\d+\s+years?\b/i.test(trimmed) && !hasMetrics(trimmed)) {
    return "Across those years, what was your strongest measurable outcome?";
  }

  if (/\b(left|transitioned|moved on|switched)\b/i.test(trimmed)) {
    return "What drove that transition, and how did it shape your next impact?";
  }

  if (trimmed.split(/\s+/).length < 35) {
    return "Can you add one concrete example and the result it created?";
  }

  if (!hasMetrics(trimmed)) {
    return "What metric, business result, or visible outcome best proves that work mattered?";
  }

  if (question.category === "role-specific" && !/\b(using|with)\b/i.test(trimmed)) {
    return "Which tools or methods did you personally use, and why did you choose them?";
  }

  if (!hasOwnershipLanguage(trimmed)) {
    return "Which parts did you own directly versus what the team handled?";
  }

  if (!/\b(challenge|problem|risk|obstacle)\b/i.test(trimmed) && question.category === "behavioral") {
    return "What was the hardest part of that situation, and how did you adapt in the moment?";
  }

  return "If you had ten more seconds, what final result would you emphasize for this role?";
}

export function scoreAnswer({ answer, question, job }: ScoreInput): AnswerScores {
  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
  const fillerCount = countMatches(answer, FILLER_WORDS);
  const hedgingCount = countMatches(answer, HEDGING_PHRASES);
  const relevanceBase = keywordOverlapScore(answer, [question.focus, ...question.targetSkills, ...job.keywords.slice(0, 6)]);
  const alignmentBase = keywordOverlapScore(answer, job.requiredSkills.length ? job.requiredSkills : job.keywords.slice(0, 8));

  const specificity =
    clamp(
      (wordCount >= 90 ? 40 : wordCount >= 45 ? 28 : wordCount >= 20 ? 18 : 8) +
        (hasMetrics(answer) ? 28 : 0) +
        (/\b(because|when|after|before|result|impact)\b/i.test(answer) ? 16 : 0) +
        (hasOwnershipLanguage(answer) ? 16 : 0),
    );

  const confidence = clamp(
    78 -
      fillerCount * 7 -
      hedgingCount * 10 -
      (wordCount < 20 ? 20 : 0) +
      (hasOwnershipLanguage(answer) ? 14 : 0) +
      (splitSentences(answer).length >= 3 ? 8 : 0),
  );

  const relevance = clamp(relevanceBase * 0.7 + (wordCount >= 25 ? 24 : 12));
  const alignment = clamp(alignmentBase * 0.8 + (hasMetrics(answer) ? 10 : 0) + (hasOwnershipLanguage(answer) ? 10 : 0));
  const overall = Math.round(average([relevance, specificity, confidence, alignment]));

  return {
    relevance: Math.round(relevance),
    specificity: Math.round(specificity),
    confidence: Math.round(confidence),
    alignment: Math.round(alignment),
    overall,
  };
}

export function buildImprovedAnswer(answer: string, question: InterviewQuestion, job: JobData) {
  const trimmed = answer.trim();
  const roleSignal = job.roleTitle || "the role";
  const skillSignal = question.targetSkills[0] || job.requiredSkills[0] || "the core skill";

  if (!trimmed) {
    return `I would frame this around a specific example that shows why my background matches ${roleSignal}. I would describe the situation, the action I owned directly, the tools or decisions I used, and a measurable result that connects back to ${skillSignal}.`;
  }

  return `A stronger version would open with the context in one sentence, explain the challenge, spell out what I owned directly, and end with a measurable outcome. I would make the link to ${roleSignal} explicit by naming how the example demonstrates ${skillSignal} and what I learned that I would bring into this role.`;
}

export function buildAnswerFeedback(answer: string, question: InterviewQuestion, job: JobData): AnswerFeedback {
  const strengths: string[] = [];
  const issues: string[] = [];

  if (hasMetrics(answer)) {
    strengths.push("Included outcomes or measurable impact.");
  } else {
    issues.push("Missing a metric or tangible result.");
  }

  if (hasOwnershipLanguage(answer)) {
    strengths.push("Explained personal ownership clearly.");
  } else {
    issues.push("Personal contribution could be clearer.");
  }

  if (answer.trim().split(/\s+/).length >= 45) {
    strengths.push("Provided enough context to understand the example.");
  } else {
    issues.push("Answer is short and could use more detail.");
  }

  if (question.category === "motivation" && !answer.toLowerCase().includes(job.companyName.toLowerCase())) {
    issues.push("Did not directly connect motivation to the company.");
  }

  return {
    strengths: strengths.length ? strengths : ["Stayed on topic and answered directly."],
    issues: issues.length ? issues : ["Could still be sharper with a stronger closing takeaway."],
    improvedAnswer: buildImprovedAnswer(answer, question, job),
  };
}

export function buildResumeGaps(resume: ResumeData, job: JobData) {
  const resumeCorpus = `${resume.skills.join(" ")} ${resume.experience.join(" ")} ${resume.projects.join(" ")}`.toLowerCase();
  const missingRequired = job.requiredSkills.filter((skill) => !resumeCorpus.includes(skill.toLowerCase()));

  if (!missingRequired.length) {
    return [
      "Your resume broadly aligns with the role, but you could make results and ownership more explicit.",
    ];
  }

  return missingRequired.slice(0, 5).map(
    (skill) => `The job emphasizes ${skill}, but that signal is not obvious in the resume as written.`,
  );
}

export function compileFinalReport(
  turns: InterviewTurn[],
  resume: ResumeData,
  job: JobData,
  companySummary?: string,
): FinalReport {
  const overallScore = Math.round(average(turns.map((turn) => turn.scores.overall)));
  const strengths = unique(
    turns.flatMap((turn) => turn.feedback.strengths).slice(0, 8),
  ).slice(0, 4);
  const weaknesses = unique(
    turns.flatMap((turn) => turn.feedback.issues).slice(0, 8),
  ).slice(0, 4);
  const recommendations = unique([
    "Use a clear structure: context, action, result, then tie it back to the role.",
    "Add at least one metric or proof point in every answer.",
    "Reduce filler language and end with a stronger close.",
    "Name your personal contribution before describing the team effort.",
  ]).slice(0, 4);

  return {
    overallScore,
    strengths,
    weaknesses,
    improvedAnswers: turns.map((turn) => ({
      questionId: turn.questionId,
      question: turn.question,
      improvedAnswer: turn.feedback.improvedAnswer,
    })),
    resumeGaps: buildResumeGaps(resume, job),
    recommendations,
    coverLetterText: buildCoverLetter({ resume, job, companySummary }),
  };
}
