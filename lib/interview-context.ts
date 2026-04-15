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

function buildResumeProjectSummary(resume: ResumeData) {
  const experienceHighlights = resume.experience.slice(0, 3).join(" | ");
  const projectHighlights = resume.projects.slice(0, 2).join(" | ");
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

export function buildInterviewContext(resume: ResumeData, job: JobData) {
  return {
    role: job.roleTitle || "Target Role",
    seniority: inferSeniority(job.roleTitle, job.rawText),
    interviewType: "mixed behavioral and role-fit",
    resumeProjectSummary: buildResumeProjectSummary(resume),
  };
}

