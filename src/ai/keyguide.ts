import type { MediaProviderId } from '../types'
import type { ProviderId } from './catalog'

/**
 * How to get each key, shown in the ⓘ next to a provider. Kept short: where
 * to click, what the key looks like, and the one setting that limits damage
 * if it ever leaks (a spend cap, a scope, a referrer restriction).
 */
export interface KeyGuide {
  steps: string[]
  looksLike?: string
  free?: string
  safety?: string
}

export const KEY_GUIDES: Record<ProviderId | MediaProviderId, KeyGuide> = {
  openrouter: {
    steps: [
      'Sign in at openrouter.ai with Google, GitHub or email.',
      'Open Credits and add a few dollars. Free models work without credit, at low rate limits.',
      'Open Keys, then Create key. Name it FuseLLM.',
      'Copy it straight away. It is shown only once.',
      'After saving it, use Check OpenRouter access. Privacy settings and workspace/key guardrails can block models, including those without zero-data-retention endpoints.',
    ],
    looksLike: 'sk-or-v1-…',
    free: 'Models tagged (free), such as Nemotron 3 Ultra, cost nothing.',
    safety: 'Set a credit limit on the key when you create it. You can change or revoke it any time.',
  },
  perplexity: {
    steps: ['Sign in at perplexity.ai.', 'Open Settings, then API, and add a payment method or credit.', 'Under API keys, choose Create key and copy it.'],
    looksLike: 'pplx-…',
    safety: 'Turn on auto top-up only with a cap you are comfortable with.',
  },
  openai: {
    steps: [
      'Sign in at platform.openai.com.',
      'Settings → Billing: add prepaid credit.',
      'API keys → Create new secret key. Pick a project, and choose Restricted if you want to limit it to model calls.',
      'Copy the key. It is shown only once.',
    ],
    looksLike: 'sk-proj-…',
    free: 'Some newer models and image generation ask you to verify your organization first (Settings → General).',
    safety: 'Set a monthly budget on the project under Settings → Limits.',
  },
  anthropic: {
    steps: ['Sign in to the Claude Console (console.anthropic.com).', 'Billing: buy credits.', 'API keys → Create key, pick a workspace, and copy it.'],
    looksLike: 'sk-ant-api03-…',
    safety: 'Put the key in its own workspace and give that workspace a spend limit.',
  },
  google: {
    steps: ['Open aistudio.google.com and sign in with a Google account.', 'Choose Get API key, then Create API key (in a new or existing Cloud project).', 'Copy it.'],
    looksLike: 'AIza…',
    free: 'There is a free tier with rate limits. On the free tier Google may use prompts to improve its products; enable billing on the project to lift limits and change that.',
    safety: 'In Google Cloud → Credentials, restrict the key to the Generative Language API and to the website https://fusellm.lowkey.tools/*. A leaked key is then useless anywhere else.',
  },
  deepseek: {
    steps: ['Sign up at platform.deepseek.com.', 'Top up a small balance.', 'API keys → Create new API key, and copy it.'],
    looksLike: 'sk-…',
    safety: 'DeepSeek bills from a prepaid balance, so the balance is your cap.',
  },
  xai: {
    steps: ['Sign in at console.x.ai.', 'Create a team if asked, and add credits under Billing.', 'API keys → Create API key. You can limit it to chat endpoints and chosen models.', 'Copy it.'],
    looksLike: 'xai-…',
    safety: 'Limit the key to the models you use and set a spending limit on the team.',
  },
  moonshot: {
    steps: ['Sign up at platform.moonshot.ai (the international console).', 'Recharge a small balance.', 'API keys → Create, and copy it.'],
    looksLike: 'sk-…',
    safety: 'Keys from the China console (moonshot.cn) will not work with the international endpoint used here.',
  },
  qwen: {
    steps: [
      'Sign in to Alibaba Cloud Model Studio, international edition (Singapore region).',
      'Activate Model Studio if prompted.',
      'Open API keys (top right), then Create API key, and copy it.',
    ],
    looksLike: 'sk-…',
    free: 'New accounts usually get a free token quota per model for a limited time.',
    safety: 'The key must come from the international (Singapore) region. China-region keys need a different base URL.',
  },
  minimax: {
    steps: ['Sign up at minimax.io and open the developer platform.', 'Add credit under Billing.', 'Account → API keys → Create new secret key, and copy it.'],
    safety: 'Keys from the China site (minimaxi.com) do not work with api.minimax.io.',
  },
  elevenlabs: {
    steps: [
      'Sign in at elevenlabs.io.',
      'Open Developers (or Settings) → API keys → Create API key.',
      'Turn on Restrict key and allow only Text to Speech, Sound Effects, Music and Voices (read).',
      'Set a credit quota for the key, then copy it.',
    ],
    looksLike: 'sk_…',
    free: 'The free plan has a small monthly credit allowance. Music and commercial use may need a paid plan.',
    safety: 'The endpoint restrictions and credit quota above are the most important part.',
  },
  fal: {
    steps: ['Sign in at fal.ai with GitHub or Google.', 'Billing: add credits.', 'Keys → Add key with the API scope, and copy it.'],
    looksLike: 'a key ID and secret joined by a colon (xxxx:yyyy)',
    safety: 'Keep the prepaid balance small; fal bills per generation.',
  },
}
