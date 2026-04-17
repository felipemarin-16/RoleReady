import type { JobData, ResumeData } from "@/lib/types";

function inferSeniority(roleTitle: string, rawJobText: string) {
  const corpus = `${roleTitle} ${rawJobText}`.toLowerCase();

  if (/\b(staff|principal|director|head|vp|vice president)\b/.test(corpus)) {
    return "staff-plus";
  }

  if (/\b(senior|sr\.?)\b/.test(corpus)) {
    return "senior";
  }

  if (/\b(junior|jr\.?|entry|associate|intern)\b/.test(corpus)) {
    return "junior";
  }

  return "mid-level";
}

function cleanProjectEntry(entry: string) {
  // Strip trailing date patterns: "2026(Present)", "(2024-Present)", "2024 - Present", "(2023)"
  return entry
    .replace(/\s*\d{4}\s*\(Present\)\s*$/i, "")
    .replace(/\s*[\(\[]\d{4}\s*[-–]\s*(Present|\d{4})[\)\]]\s*$/i, "")
    .replace(/\s*\d{4}\s*[-–]\s*(Present|\d{4})\s*$/i, "")
    .replace(/\s*[\(\[]\d{4}[\)\]]\s*$/i, "")
    .trim();
}

function buildResumeProjectSummary(resume: ResumeData) {
  const experienceHighlights = resume.experience.slice(0, 3).join(" | ");
  const projectHighlights = resume.projects.slice(0, 2).map(cleanProjectEntry).join(" | ");
  const skills = resume.skills.slice(0, 8).join(", ");

  return [
    `Candidate: ${resume.name}.`,
    experienceHighlights ? `Experience highlights: ${experienceHighlights}.` : "",
    projectHighlights ? `Project highlights: ${projectHighlights}.` : "",
    skills ? `Top skills: ${skills}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildInterviewContext(resume: ResumeData, job: JobData, candidateName: string) {
  return {
    candidateName: candidateName.trim() || resume.name,
    role: job.roleTitle || "Target Role",
    companyName: job.companyName || "the company",
    jobType: job.jobType || "Full-time",
    seniority: inferSeniority(job.roleTitle, job.rawText),
    interviewType: "mixed behavioral and role-fit",
    resumeProjectSummary: buildResumeProjectSummary(resume),
  };
}
