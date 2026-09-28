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
