import type { InterviewQuestion, JobData, ResumeData } from "@/lib/types";

type QuestionInput = {
  resume: ResumeData;
  job: JobData;
  companySummary?: string;
};

const CONTACT_NOISE_PATTERN = /@|\bgithub\b|\bportfolio\b|\blinkedin\b|\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/i;

function shortenHighlight(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const firstSentence = compact.split(/(?<=[.!?])\s/)[0] ?? compact;
  const shortened = firstSentence.split("|")[0]?.trim() ?? firstSentence;

  if (shortened.length <= 110) {
    return shortened;
  }

  return `${shortened.slice(0, 107).trim()}...`;
}

function normalizeHighlight(entry: string) {
  return entry.replace(/\s+/g, " ").replace(/[•]/g, "").trim();
}

function isCleanHighlight(entry: string) {
  const compact = normalizeHighlight(entry);
  const sectionSignalCount = (compact.match(/\b(education|experience|projects|skills|languages)\b/gi) ?? []).length;
  const wordCount = compact.split(/\s+/).filter(Boolean).length;

  if (!compact || compact.length < 22 || compact.length > 150) {
    return false;
  }

  if (CONTACT_NOISE_PATTERN.test(compact)) {
    return false;
  }

  if (sectionSignalCount > 1) {
    return false;
  }

  if (wordCount < 5) {
    return false;
  }

  return true;
}

function chooseHighlight(entries: string[]) {
  const cleanEntries = entries.map(normalizeHighlight).filter(isCleanHighlight);

  // Prefer entries that sound like ownership + impact to keep the question interview-like.
  const ranked = [...cleanEntries].sort((left, right) => {
    const leftScore = Number(/\b(led|built|owned|launched|improved|shipped|delivered)\b/i.test(left)) + Number(/\d/.test(left));
    const rightScore = Number(/\b(led|built|owned|launched|improved|shipped|delivered)\b/i.test(right)) + Number(/\d/.test(right));
    return rightScore - leftScore;
  });

  return ranked[0] ?? null;
}

function pickResumeHighlight(resume: ResumeData) {
  const projectCandidate = chooseHighlight(resume.projects);
  if (projectCandidate) {
    return {
      contextLabel: `your project "${shortenHighlight(projectCandidate)}"`,
      targetSkills: resume.skills.slice(0, 3),
    };
  }

  const experienceCandidate = chooseHighlight(resume.experience);
  if (experienceCandidate) {
    return {
      contextLabel: `your work on "${shortenHighlight(experienceCandidate)}"`,
      targetSkills: resume.skills.slice(0, 3),
    };
  }

  const educationCandidate = chooseHighlight(resume.education);
  if (educationCandidate) {
    return {
      contextLabel: `the experience you highlighted in "${shortenHighlight(educationCandidate)}"`,
      targetSkills: resume.skills.slice(0, 2),
    };
  }

  return {
    contextLabel: "the part of your background that best matches this role",
    targetSkills: resume.skills.slice(0, 3),
  };
}

function pickRoleSkill(job: JobData) {
  return job.requiredSkills[0] || job.keywords[0] || "the core responsibilities of the role";
}

export function generateInterviewQuestions({
  resume,
  job,
  companySummary,
}: QuestionInput): InterviewQuestion[] {
  const companyRef = job.companyName === "the company" ? "the team" : job.companyName;
  const roleRef = job.roleTitle || "this role";
  const resumeHighlight = pickResumeHighlight(resume);
  const summarySignal = companySummary?.trim()
    ? ` and how your background connects to ${companySummary.split(".")[0].trim()}`
    : "";

  return [
    {
      id: "q1",
      category: "intro",
      prompt: `Tell me about yourself and walk me through the parts of your background that make you a strong fit for the ${roleRef} role.`,
      focus: "Link past experience to the role in a concise narrative.",
      targetSkills: [pickRoleSkill(job)],
    },
    {
      id: "q2",
      category: "motivation",
      prompt: `Why does the ${roleRef} opportunity at ${companyRef} stand out to you,${summarySignal} and why now?`,
      focus: "Show motivation, company alignment, and career intent.",
      targetSkills: [job.companyName, roleRef].filter(Boolean),
    },
    {
      id: "q3",
      category: "resume-dive",
      prompt: `Let’s go deeper on ${resumeHighlight.contextLabel}. What problem were you solving, what did you own directly, and what result came out of it?`,
      focus: "Demonstrate ownership, depth, and measurable impact.",
      targetSkills: resumeHighlight.targetSkills,
    },
    {
      id: "q4",
      category: "behavioral",
      prompt: `Tell me about a time you had to balance ambiguity, deadlines, or stakeholder expectations. How did you approach it and what did you learn?`,
      focus: "Use a STAR-style answer with reflection.",
      targetSkills: ["communication", "leadership", "prioritization"],
    },
    {
      id: "q5",
      category: "role-specific",
      prompt: `This role emphasizes ${pickRoleSkill(job)}. Walk me through a project where you used that skill in a meaningful way and how you measured success.`,
      focus: "Translate experience into role-specific proof.",
      targetSkills: [pickRoleSkill(job), ...job.requiredSkills.slice(1, 3)],
    },
  ];
}
