import type { JobData, ResumeData } from "@/lib/types";

type CoverLetterInput = {
  resume: ResumeData;
  job: JobData;
  companySummary?: string;
};

export function buildCoverLetter({ resume, job, companySummary }: CoverLetterInput) {
  const companyRef = job.companyName === "the company" ? "your team" : job.companyName;
  const introSignal = resume.experience[0] || resume.projects[0] || resume.education[0] || "my recent work";
  const skills = resume.skills.slice(0, 3).join(", ") || "cross-functional execution";
  const responsibilities = job.responsibilities.slice(0, 2).join(" and ");
  const companyAngle = companySummary?.trim()
    ? ` I am especially drawn to ${companySummary.split(".")[0].trim()}.`
    : "";

  return `Dear Hiring Team,

I am excited to apply for the ${job.roleTitle} role at ${companyRef}. My background in ${skills} and experience with ${introSignal} align well with the needs of this position.

Across my recent work, I have focused on delivering practical results, collaborating across teams, and translating ambiguous problems into measurable outcomes. That foundation prepares me to contribute to responsibilities like ${responsibilities || "driving meaningful impact quickly"} from day one.${companyAngle}

What stands out most about this opportunity is the chance to bring structured thinking, clear communication, and hands-on execution to a role that values both initiative and impact. I would welcome the opportunity to discuss how my experience and motivation can support ${companyRef}'s goals.

Thank you for your time and consideration.

Sincerely,
${resume.name}`;
}
