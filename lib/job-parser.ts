import { COMMON_SKILLS } from "@/lib/constants";
import type { JobData } from "@/lib/types";
import { extractBulletLikeLines, normalizeWhitespace, toTitleCase, unique } from "@/lib/utils";

const STOP_WORDS = new Set([
  "the",
  "and",
  "with",
  "your",
  "that",
  "will",
  "have",
  "for",
  "our",
  "you",
  "are",
  "this",
  "from",
  "into",
  "their",
  "they",
  "about",
  "role",
  "team",
  "work",
  "using",
  "across",
  "years",
  "experience",
]);

function findRoleTitle(lines: string[]) {
  const explicit = lines.find((line) => /^(role|title|position)\s*:/i.test(line));
  if (explicit) {
    return explicit.split(":").slice(1).join(":").trim();
  }

  const candidate = lines.find(
    (line) =>
      line.length < 80 &&
      /manager|engineer|designer|analyst|specialist|lead|director|coordinator|developer|consultant/i.test(line),
  );

  return candidate ?? "Target Role";
}

function findCompanyName(text: string) {
  const explicit = text.match(/company\s*:\s*([A-Z][A-Za-z0-9&.\- ]{1,40})/i);
  if (explicit?.[1]) {
    return explicit[1].trim();
  }

  const joined = text.match(/join\s+([A-Z][A-Za-z0-9&.\- ]{1,40})/);
  if (joined?.[1]) {
    return joined[1].trim();
  }

  const atCompany = text.match(/(?:at|with)\s+([A-Z][A-Za-z0-9&.\- ]{1,40})/);
  return atCompany?.[1]?.trim() ?? "the company";
}

function findJobType(text: string) {
  if (/\bintern(ship)?\b/i.test(text)) return "Internship";
  if (/\bpart[\s-]?time\b/i.test(text)) return "Part-time";
  if (/\bcontract(or)?\b/i.test(text)) return "Contract";
  if (/\bfreelance\b/i.test(text)) return "Freelance";
  return "Full-time";
}

function findSkills(text: string) {
  const lower = text.toLowerCase();
  return COMMON_SKILLS.filter((skill) => lower.includes(skill.toLowerCase()));
}

function getSectionMatches(text: string, pattern: RegExp) {
  const lines = text.split("\n");
  const matches: string[] = [];
  let collecting = false;

  for (const line of lines) {
    if (pattern.test(line)) {
      collecting = true;
      continue;
    }

    if (collecting && /^[A-Z][A-Za-z ]{2,30}:?$/.test(line)) {
      break;
    }

    if (collecting && line.trim()) {
      matches.push(line.trim().replace(/^[•*-]\s*/, ""));
    }
  }

  return matches;
}

function extractKeywords(text: string, detectedSkills: string[]) {
  const tokens = text
    .toLowerCase()
    .match(/[a-z][a-z.+-]{2,}/g);

  if (!tokens) {
    return detectedSkills;
  }

  const counts = new Map<string, number>();

  for (const token of tokens) {
    if (STOP_WORDS.has(token)) {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const frequent = Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([keyword]) => keyword);

  return unique([...detectedSkills, ...frequent]);
}

export function parseJobPosting(rawText: string): JobData {
  const normalized = normalizeWhitespace(rawText);
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const skills = findSkills(normalized);
  const responsibilities = getSectionMatches(normalized, /^(responsibilities|what you'll do|what you will do|what you’ll do)$/i);
  const requiredSection = getSectionMatches(
    normalized,
    /^(requirements|required qualifications|must have|minimum qualifications)$/i,
  );
  const preferredSection = getSectionMatches(
    normalized,
    /^(preferred qualifications|nice to have|bonus points|preferred)$/i,
  );

  const requiredSkills = unique([...skills, ...findSkills(requiredSection.join("\n"))]);
  const preferredSkills = unique(findSkills(preferredSection.join("\n")));
  const fallbackResponsibilities = extractBulletLikeLines(normalized).slice(0, 6);

  return {
    rawText: normalized,
    roleTitle: toTitleCase(findRoleTitle(lines)),
    companyName: findCompanyName(normalized),
    jobType: findJobType(normalized),
    requiredSkills,
    preferredSkills,
    responsibilities: responsibilities.length ? responsibilities : fallbackResponsibilities,
    keywords: extractKeywords(normalized, requiredSkills),
  };
}
