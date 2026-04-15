import type { ResumeData, ResumeSection } from "@/lib/types";
import { extractBulletLikeLines, normalizeWhitespace, toTitleCase, unique } from "@/lib/utils";

const SECTION_PATTERNS: Array<{ key: keyof Omit<ResumeData, "rawText" | "name" | "sections">; label: RegExp }> = [
  { key: "education", label: /^(education|academic background)$/i },
  { key: "experience", label: /^(experience|work experience|professional experience|employment)$/i },
  { key: "projects", label: /^(projects|selected projects|project experience)$/i },
  { key: "skills", label: /^(skills|technical skills|core skills|competencies)$/i },
];

const CONTACT_PATTERN =
  /@|https?:\/\/|\bgithub\b|\bportfolio\b|\blinkedin\b|\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/i;

function isLikelyContactLine(line: string) {
  return CONTACT_PATTERN.test(line) || (line.includes("|") && !/experience|project|education|skills/i.test(line));
}

function cleanResumeLine(line: string) {
  return line.replace(/^[•*-]\s*/, "").replace(/\s+/g, " ").trim();
}

function isMeaningfulEntry(line: string, title?: string) {
  if (!line || line.length < 4) {
    return false;
  }

  if (isLikelyContactLine(line)) {
    return false;
  }

  if (SECTION_PATTERNS.some(({ label }) => label.test(line))) {
    return false;
  }

  if (title === "skills") {
    return true;
  }

  if (line.length > 220) {
    return false;
  }

  return true;
}

function normalizeSectionEntries(title: string, entries: string[]) {
  return unique(
    entries
      .map(cleanResumeLine)
      .filter((entry) => isMeaningfulEntry(entry, title))
      .map((entry) => entry.replace(/\s*[|]\s*/g, " | ")),
  );
}

function findLikelyName(lines: string[]) {
  const candidate = lines.find(
    (line) =>
      /^[A-Za-z ,.'-]{4,40}$/.test(line) &&
      line.split(" ").length <= 4 &&
      !line.toLowerCase().includes("resume") &&
      !isLikelyContactLine(line),
  );

  return candidate ? toTitleCase(candidate) : "Candidate";
}

function createSections(text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const sections: ResumeSection[] = [];
  let current: ResumeSection = { title: "Summary", entries: [] };

  for (const line of lines) {
    const heading = SECTION_PATTERNS.find(({ label }) => label.test(line));

    if (heading) {
      if (current.entries.length) {
        sections.push(current);
      }
      current = { title: heading.key, entries: [] };
      continue;
    }

    current.entries.push(cleanResumeLine(line));
  }

  if (current.entries.length) {
    sections.push(current);
  }

  return sections.map((section) => ({
    ...section,
    entries: normalizeSectionEntries(section.title.toLowerCase(), section.entries),
  }));
}

function getSectionEntries(sections: ResumeSection[], title: string) {
  return sections
    .filter((section) => section.title.toLowerCase() === title)
    .flatMap((section) => section.entries)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseResumeText(rawText: string): ResumeData {
  const normalized = normalizeWhitespace(rawText);
  const lines = normalized
    .split("\n")
    .map(cleanResumeLine)
    .filter(Boolean)
    .filter((line) => !isLikelyContactLine(line));
  const sections = createSections(normalized);
  const fallbackEntries = extractBulletLikeLines(normalized)
    .map(cleanResumeLine)
    .filter((line) => isMeaningfulEntry(line));

  const skillsFromSection = getSectionEntries(sections, "skills")
    .flatMap((line) => line.split(/[,|/•]/))
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 1);

  const experience = normalizeSectionEntries("experience", getSectionEntries(sections, "experience"));
  const projects = normalizeSectionEntries("projects", getSectionEntries(sections, "projects"));
  const education = normalizeSectionEntries("education", getSectionEntries(sections, "education"));

  return {
    rawText: normalized,
    name: findLikelyName(lines),
    education: education.length ? education : fallbackEntries.slice(0, 2),
    projects: projects.length ? projects : fallbackEntries.slice(2, 5),
    skills: unique(skillsFromSection).slice(0, 18),
    experience: experience.length ? experience : fallbackEntries.slice(0, 6),
    sections,
  };
}
