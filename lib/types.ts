export type CoachVoice = "female" | "male";

export type ResumeSection = {
  title: string;
  entries: string[];
};

export type ResumeData = {
  rawText: string;
  name: string;
  education: string[];
  projects: string[];
  skills: string[];
  experience: string[];
  sections: ResumeSection[];
};

export type JobData = {
  rawText: string;
  roleTitle: string;
  companyName: string;
  jobType: string;
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  keywords: string[];
};

export type QuestionCategory =
  | "intro"
  | "motivation"
  | "resume-dive"
  | "behavioral"
  | "role-specific"
  | "adaptive";

export type InterviewQuestion = {
  id: string;
  category: QuestionCategory;
  prompt: string;
  focus: string;
  targetSkills: string[];
};

export type AnswerScores = {
  relevance: number;
  specificity: number;
  confidence: number;
  alignment: number;
  overall: number;
};

export type AnswerFeedback = {
  strengths: string[];
  issues: string[];
  improvedAnswer: string;
};

export type InterviewTurn = {
  questionId: string;
  category: QuestionCategory;
  question: string;
  answer: string;
  followUp: string;
  evaluation?: string;
  whyThisFollowUp?: string;
  nextSkillToProbe?: string;
  scores: AnswerScores;
  feedback: AnswerFeedback;
};

export type InterviewModelEvaluation = {
  evaluation: string;
  strengths: string[];
  gaps: string[];
  follow_up_question: string;
  why_this_follow_up: string;
  next_skill_to_probe: string;
};

export type InterviewContext = {
  candidateName: string;
  role: string;
  companyName: string;
  jobType: string;
  seniority: string;
  interviewType: string;
  resumeProjectSummary: string;
};

export type SetupSession = {
  createdAt: string;
  coachVoice: CoachVoice;
  companySummary: string;
  resumeFileName: string;
  resume: ResumeData;
  job: JobData;
  context: InterviewContext;
  questions?: InterviewQuestion[];
};

export type InterviewSession = {
  startedAt: string;
  completedAt?: string;
  currentQuestionIndex: number;
  targetQuestionCount: number;
  currentQuestion: InterviewQuestion;
  coveredSkills: string[];
  pendingNextQuestion?: string;
  pendingNextSkill?: string;
  pendingFollowUpReason?: string;
  turns: InterviewTurn[];
};

export type FinalReport = {
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  improvedAnswers: { questionId: string; question: string; improvedAnswer: string }[];
  resumeGaps: string[];
  recommendations: string[];
  coverLetterText: string;
};
