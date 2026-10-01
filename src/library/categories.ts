import type { SkillCategory } from '../types.ts'

/*
 * Shelves for the library. Roles and skills share one set, so a role and
 * the skills that suit it sit under the same heading; circuit templates have
 * their own, named after the job the circuit does.
 *
 * No DOM or React here: the build reads this too (llms-full.txt).
 */

export const LIB_CATEGORIES: { id: SkillCategory; label: string }[] = [
  { id: 'code', label: 'Engineering' },
  { id: 'review', label: 'Review and QA' },
  { id: 'research', label: 'Research' },
  { id: 'data', label: 'Data and finance' },
  { id: 'writing', label: 'Writing' },
  { id: 'planning', label: 'Planning and strategy' },
  { id: 'business', label: 'Business and people' },
  { id: 'marketing', label: 'Marketing and sales' },
  { id: 'design', label: 'Product and design' },
  { id: 'media', label: 'Images, video and audio' },
  { id: 'learning', label: 'Learning and careers' },
  { id: 'personal', label: 'Everyday life' },
]

export const LIB_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(LIB_CATEGORIES.map(c => [c.id, c.label]))

export const CIRCUIT_CATEGORIES: { id: string; label: string }[] = [
  { id: 'build', label: 'Build and ship software' },
  { id: 'quality', label: 'Code quality and security' },
  { id: 'devops', label: 'DevOps and incidents' },
  { id: 'ai', label: 'AI, agents and prompts' },
  { id: 'research', label: 'Research and analysis' },
  { id: 'data', label: 'Data and spreadsheets' },
  { id: 'writing', label: 'Writing and editing' },
  { id: 'marketing', label: 'Marketing and SEO' },
  { id: 'social', label: 'Social media and creators' },
  { id: 'sales', label: 'Sales and outreach' },
  { id: 'support', label: 'Customer support' },
  { id: 'ops', label: 'Operations and admin' },
  { id: 'finance', label: 'Finance and money' },
  { id: 'people', label: 'Hiring and HR' },
  { id: 'legal', label: 'Legal and compliance' },
  { id: 'product', label: 'Product and design' },
  { id: 'education', label: 'Learning and teaching' },
  { id: 'career', label: 'Careers and job search' },
  { id: 'personal', label: 'Personal life' },
  { id: 'health', label: 'Health and fitness' },
  { id: 'media', label: 'Images, video and audio' },
]

export const CIRCUIT_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CIRCUIT_CATEGORIES.map(c => [c.id, c.label]))

/**
 * Six groups for browsing, shared by circuits, roles and skills so the same
 * kind of work sits under the same heading everywhere. Each folds several
 * circuit shelves and library shelves together.
 */
export const GROUPS: { id: string; emoji: string; label: string; circuits: string[]; lib: SkillCategory[] }[] = [
  { id: 'everyday', emoji: '🏠', label: 'Everyday life', circuits: ['personal', 'health', 'education', 'career'], lib: ['personal', 'learning'] },
  { id: 'work', emoji: '💼', label: 'Work and business', circuits: ['ops', 'support', 'sales', 'finance', 'people', 'legal'], lib: ['business', 'planning'] },
  { id: 'marketing', emoji: '📣', label: 'Marketing and content', circuits: ['marketing', 'social', 'writing'], lib: ['marketing', 'writing'] },
  { id: 'research', emoji: '🔬', label: 'Research and data', circuits: ['research', 'data'], lib: ['research', 'data'] },
  { id: 'tech', emoji: '🛠️', label: 'Tech and product', circuits: ['build', 'quality', 'devops', 'ai', 'product'], lib: ['code', 'review', 'design'] },
  { id: 'media', emoji: '🎬', label: 'Media', circuits: ['media'], lib: ['media'] },
]

export const groupOfCircuit = (category?: string) => GROUPS.find(g => g.circuits.includes(category ?? ''))?.id
export const groupOfLib = (category?: string) => GROUPS.find(g => (g.lib as string[]).includes(category ?? ''))?.id

/** The circuits to show first: broadly useful, quick to understand, cheap to try. */
export const START_HERE = [
  'tpl-voice-memo-notes',
  'tpl-meeting-recording',
  'tpl-plan-my-day',
  'tpl-deep-research',
  'tpl-code-review-loop',
  'tpl-content-engine',
  'tpl-reply-to-messages',
  'tpl-scam-check',
  'tpl-document-explainer',
  'tpl-job-hunt-pack',
  'tpl-jev-ticket-router',
  'tpl-movie-studio',
]
