/**
 * AI Assistant flow — intent parsing + slot analysis.
 * Pure functions only, zero React. Swap these out for a real NLP call
 * once the agent backend is live.
 */

export type Intent =
  | { kind: "create_job"; role?: string }
  | { kind: "unknown" };

export interface JobDraft {
  role?: string;
  /** "Junior" | "Mid" | "Senior" | "Lead" | "Staff" | "Principal" */
  experience?: string;
  techStack?: string[];
  /** Free-form: "Remote", "Bangalore", etc. */
  location?: string;
  /** Free-form: "12-18 LPA" */
  salary?: string;
}

const TECH_TOKENS = [
  "react",
  "next.js",
  "nextjs",
  "node.js",
  "nodejs",
  "typescript",
  "javascript",
  "python",
  "django",
  "flask",
  "fastapi",
  "java",
  "spring",
  "kotlin",
  "go",
  "golang",
  "rust",
  "ruby",
  "rails",
  "php",
  "laravel",
  "angular",
  "vue",
  "svelte",
  "tailwind",
  "graphql",
  "rest",
  "aws",
  "gcp",
  "azure",
  "kubernetes",
  "docker",
  "terraform",
  "postgres",
  "mysql",
  "mongodb",
  "redis",
  "kafka",
  "elasticsearch",
  "sql",
  "nosql",
];

const EXPERIENCE_ALIASES: Record<string, string> = {
  junior: "Junior",
  jr: "Junior",
  entry: "Junior",
  "entry-level": "Junior",
  mid: "Mid",
  "mid-level": "Mid",
  intermediate: "Mid",
  senior: "Senior",
  sr: "Senior",
  lead: "Lead",
  staff: "Staff",
  principal: "Principal",
};

// Map human text to a years range used by the /ai/generate-jd endpoint.
export function experienceToYears(label?: string): { min: number; max: number } {
  switch ((label || "").toLowerCase()) {
    case "junior":
      return { min: 0, max: 2 };
    case "mid":
      return { min: 2, max: 5 };
    case "senior":
      return { min: 5, max: 9 };
    case "lead":
      return { min: 8, max: 12 };
    case "staff":
      return { min: 10, max: 15 };
    case "principal":
      return { min: 12, max: 20 };
    default:
      return { min: 2, max: 5 };
  }
}

export function parseIntent(text: string): Intent {
  const lower = text.toLowerCase().trim();
  if (!lower) return { kind: "unknown" };

  // Very forgiving matcher for "create X job / hire X / open X role"
  const verb = /(create|hire|open|post|add|draft|need|looking\s+for)/;
  if (!verb.test(lower)) return { kind: "unknown" };

  // Try to pull a role phrase — trim stop words from start/end
  const clean = lower
    .replace(verb, "")
    .replace(/(a|an|the|new|urgent(ly)?|asap|please|role|job|opening|position|developer|engineer|specialist)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Heuristic: if nothing left, try to fall back to the original text minus the verb
  const role =
    clean.length > 1 ? clean : text.toLowerCase().replace(verb, "").replace(/\s+/g, " ").trim();

  return { kind: "create_job", role: role || undefined };
}

export function extractSlots(text: string): Partial<JobDraft> {
  const lower = text.toLowerCase();
  const out: Partial<JobDraft> = {};

  // Experience
  for (const [alias, canonical] of Object.entries(EXPERIENCE_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(lower)) {
      out.experience = canonical;
      break;
    }
  }
  // Explicit years "X years" / "X-Y yrs"
  const yrs = lower.match(/(\d{1,2})\s*(?:-|to)\s*(\d{1,2})\s*(?:years|yrs)?/);
  if (yrs) {
    const min = parseInt(yrs[1], 10);
    if (!out.experience) {
      if (min >= 8) out.experience = "Lead";
      else if (min >= 5) out.experience = "Senior";
      else if (min >= 2) out.experience = "Mid";
      else out.experience = "Junior";
    }
  }

  // Location
  if (/\bremote\b/.test(lower)) out.location = "Remote";
  else {
    const city = lower.match(/\bin\s+([a-z][a-z\s]{1,30}?)(?:[,.?!]|$)/);
    if (city) out.location = city[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Tech stack
  const techs = TECH_TOKENS.filter((t) => lower.includes(t));
  if (techs.length > 0) {
    out.techStack = techs.map((t) => t.toUpperCase() === t ? t : t.charAt(0).toUpperCase() + t.slice(1));
  }

  // Salary (very loose)
  const salary = lower.match(/(\d{1,3}\s*[-+]\s*\d{1,3}\s*(?:lpa|lakhs?|k|usd|eur))/);
  if (salary) out.salary = salary[1];

  return out;
}

/**
 * Which slots still need to be filled before we can reasonably generate a JD?
 * Keep this tight — we want to ask as little as possible.
 * experience + location are the only two we actively solicit; everything else
 * is extracted opportunistically from the user's free-text.
 */
export function missingSlots(draft: JobDraft): Array<keyof JobDraft> {
  const missing: Array<keyof JobDraft> = [];
  if (!draft.experience) missing.push("experience");
  if (!draft.location) missing.push("location");
  return missing;
}

/** Human-readable prompt text for each missing slot. */
export const SLOT_PROMPTS: Record<keyof JobDraft, string> = {
  role: "What role should I draft?",
  experience: "What's the **experience level**? (Junior / Mid / Senior / Lead)",
  location: "Where's the role based? (**Remote**, or a city like *Bangalore* / *San Francisco*)",
  techStack: "What's the tech stack?",
  salary: "What's the salary range?",
};

/** Does the role sound technical? Used to pre-fill interview feature defaults. */
export function isTechnicalRole(draft: JobDraft): boolean {
  if ((draft.techStack ?? []).length > 0) return true;
  const role = (draft.role || "").toLowerCase();
  return /(developer|engineer|programmer|devops|sre|architect|data\s+scientist|ml|backend|frontend|full.?stack|mobile|android|ios|embedded|qa|sdet)/.test(role);
}

export function buildJDPrompt(draft: JobDraft): string {
  const parts: string[] = [];
  if (draft.role) parts.push(draft.role);
  if (draft.experience) parts.push(`${draft.experience} level`);
  if (draft.techStack && draft.techStack.length > 0) parts.push(`stack: ${draft.techStack.join(", ")}`);
  if (draft.location) parts.push(`location: ${draft.location}`);
  if (draft.salary) parts.push(`salary: ${draft.salary}`);
  return parts.join(" — ");
}

export function friendlyTitle(draft: JobDraft): string {
  const exp = draft.experience ? `${draft.experience} ` : "";
  const role = draft.role ? draft.role.replace(/\b\w/g, (c) => c.toUpperCase()) : "Role";
  return `${exp}${role}`.trim();
}
