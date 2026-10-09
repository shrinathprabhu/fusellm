import type { Metrics } from '../types'

/**
 * A real run of the "tpl-content-engine" template, replayed on the landing
 * page. Outputs, timings, token counts and costs are exactly as recorded;
 * only the fields the replay shows are kept (no prompt history, no library
 * snapshot, no keys). The image it made is demo-cover.webp, beside this file.
 */
export interface DemoStep {
  id: string
  stageName: string
  /** Catalog id; empty for media stages, which show `modelLabel` instead. */
  modelId: string
  modelLabel: string
  kind?: 'media'
  content: string
  /** The stage's instruction, as set in the circuit. */
  task: string
  /** The model's saved reasoning, when it reported any. */
  thinking?: string
  metrics: Metrics
  verdict?: 'approved'
  next?: string
}

export interface DemoRun {
  templateId: string
  circuitName: string
  circuitEmoji: string
  brief: string
  startedAt: number
  endedAt: number
  /** The run's token stop-loss. */
  budget: number
  steps: DemoStep[]
}

export const DEMO_RUN: DemoRun = {
  templateId: 'tpl-content-engine',
  circuitName: 'One idea turned into a blog post, LinkedIn, X and newsletter copy with a cover image',
  circuitEmoji: '📣',
  brief: 'Generate me a random blog for marketing fusellm.lowkey.tools',
  startedAt: 1791559115097,
  endedAt: 1791559208068,
  budget: 1000000,
  steps: [
    {
      id: 'p3k6t345r376h',
      stageName: 'Draft',
      modelId: 'claude-sonnet',
      modelLabel: 'Claude Sonnet 5.5',
      content:
        "**Assumptions:** FuseLLM (fusellm.lowkey.tools) lets you chain several LLM steps into one automated workflow, called a circuit. I've avoided specific features, pricing, or numbers I can't verify. Title options:\n\n1. One prompt, five jobs: why your AI content sounds the same everywhere\n2. Stop asking one prompt to do everything\n3. Split the prompt: how to get a blog post, a LinkedIn post and a tweet that don't read alike\n\n---\n\n# One prompt, five jobs: why your AI content sounds the same everywhere\n\nPaste this into a chat window: \"Write a blog post, a LinkedIn post, a tweet, a newsletter and a cover image description about our new feature.\" You'll get five things back. They will share the same opening line, the same three adjectives, and the same closing question.\n\nThat isn't the model being lazy. It's the prompt being overloaded. You asked one pass to decide the argument, pick the tone for four channels, respect four length limits, and describe an image. It did all of it at once, so it did none of it with much care.\n\nThe fix is not a longer prompt. It's a shorter one, run several times.\n\n## Give each step one job\n\nA person doing this work wouldn't write all five pieces in one sitting without stopping. They'd settle the idea first. Then they'd write the long version. Then they'd cut it down for LinkedIn, rewrite it for X, and so on.\n\nChaining steps copies that order. Each step gets a narrow instruction and only the input it needs.\n\nTake a single idea: \"Our invoices page now shows which invoices a customer has opened.\"\n\n**Step 1: Draft.** One job: write the blog post. The only question is whether the argument holds up. Length is 700 words and the tone is plain. The step doesn't think about hashtags or character counts.\n\n**Step 2: LinkedIn.** One job: take the finished post and pull out the single point a finance lead would stop scrolling for. That might be \"You can stop sending 'just checking you got this' emails.\" The step writes about 150 words in first person with no recap of the whole post.\n\n**Step 3: X.** One job: say that same point in under 280 characters. It's a different job from step 2, because a tweet isn't a short LinkedIn post. It needs one claim and nothing else.\n\n**Step 4: Newsletter.** One job: write a subject line and a short body for people who already know the product. They don't need the explanation. They need to know what changed and where to click.\n\nEach step is small enough to check by eye. If the tweet is weak, you fix the tweet step. You don't rerun everything and hope.\n\n## Why this works better than it sounds\n\n**Constraints stop competing.** In a single prompt, \"keep it under 280 characters\" sits next to \"be thorough\" and the model splits the difference. In a chain, each constraint belongs to one step and gets followed.\n\n**The strongest idea gets chosen once.** In the single-prompt version, each output picks its own angle, so the tweet may stress a different benefit than the blog. In a chain, the argument is fixed in step 1 and everything downstream works from it. Your channels say the same thing in different registers instead of five different things.\n\n**Failures are findable.** When a one-shot output is off, you can't tell why. Was the idea weak? The tone? The length? With separate steps, you read the output of each one and see where it went wrong.\n\n**You can swap parts.** Maybe you want a different model for the image brief, or a stricter instruction on the newsletter step. In a chain, you change one step. In one giant prompt, you change a paragraph and hope nothing else moves.\n\n## What it costs you\n\nMore steps means more setup. You have to decide what each one does and what it passes on. That's real work, and for a one-off tweet it isn't worth it. Just write the tweet.\n\nBut if you publish the same idea across a blog, LinkedIn, X and email every week, you're already doing this sequence by hand. You're just doing it in your head, with copy and paste in between. Writing the sequence down once, and running it on every new idea, is the only extra work.\n\n## Where FuseLLM fits\n\nFuseLLM is built for this pattern. You define the steps, say what each one receives and returns, and run the whole circuit from a single input. This post came from one: a one-line brief went in, a drafting step wrote the article, and later steps adapted it for the other channels and the cover image.\n\nYou can read the setup, check each step's output, and change the one that isn't working.\n\nIf you've been rerunning one big prompt and editing the result by hand, try splitting it into three steps. Draft, adapt, check. Compare what comes out with what you get now.\n\nTry it at **fusellm.lowkey.tools**.",
      task:
        "Write the post: 600-800 words, one clear argument, concrete examples, no listicle padding. Open with the specific thing that makes it worth reading.",
      thinking:
        "Given the brief is vague about what FuseLLM actually does, I'm inferring it's a tool for building automated multi-step LLM workflows (\"circuits\"), and I'll make reasonable assumptions explicit before writing a focused 600-800 word piece built around one clear argument, concrete examples, plain language, and a specific opening—no listicle format or superlatives.\n\nMy argument: a single giant prompt doing five jobs at once produces five mediocre, same-sounding outputs, whereas splitting into discrete steps with single jobs works better—I'll open with that exact contrast and end with a plain call-to-action pointing to fusellm.lowkey.tools, avoiding invented specifics like pricing.",
      metrics: { startedAt: 1791559115111, endedAt: 1791559136350, usage: { input: 358, output: 1961, reasoning: 452, cost: 0.020326 } },
    },
    {
      id: 'p6a10563t5o47',
      stageName: 'Edit',
      modelId: 'gpt-astra',
      modelLabel: 'GPT-6 Astra',
      content:
        '# Stop asking one prompt to do five jobs\n\nA blog post needs an argument. A LinkedIn post needs a point worth discussing. An X post needs to fit in 280 characters. Asking for all three at once often gets you the same copy in different lengths.\n\nAdd a newsletter and a cover image brief, and one prompt has to juggle five jobs.\n\nInstead, split the work into steps. Give each step one job and an output you can check.\n\n## Start with the argument, not the formats\n\nTake this product update:\n\n> Our invoices page now shows which invoices a customer has opened.\n\nBefore turning that into content, decide what matters. A finance lead can see whether an invoice was opened before following up. That’s the benefit. It doesn’t mean the customer has approved the invoice or plans to pay.\n\nSettle that distinction first. Otherwise, you risk spreading the same inflated claim across five channels.\n\nThen build the sequence.\n\n**1. Draft the blog post.** Explain what changed, who it helps and how to use it. Keep the language plain. Don’t worry about hashtags or subject lines.\n\n**2. Edit the argument.** Cut repetition. Check claims against the product facts. Make sure the benefit survives without hype. Use this version as the source for the remaining steps.\n\n**3. Adapt for LinkedIn.** Pull out one practical point: “Before sending another invoice reminder, check whether the customer opened it.” Build around that, rather than summarizing every paragraph.\n\n**4. Write the X post.** Keep one claim and the context needed to understand it. Stay within 280 characters. Don’t cram in the whole launch announcement.\n\n**5. Write the newsletter.** Give existing customers a subject line, a short explanation and a link. They need to know what changed and where to find it—not hear the sales pitch again.\n\n**6. Brief the cover image.** Choose one visual idea that supports the article. Describe the composition and any required text. Don’t invent a product screenshot.\n\n## Separate the jobs so you can fix them\n\nThe value isn’t that short prompts magically produce good writing. It’s that separate steps make problems easier to locate.\n\nIf the X post loses the point, revise its instructions. If every version overstates the benefit, fix the source post. If the image brief adds nothing, rethink the visual—not the article.\n\nEach channel can keep its own shape while working from the same checked argument.\n\n## Know when it’s worth the setup\n\nFor a one-off post, a circuit may be more work than you need. Write the post.\n\nFor a weekly blog, LinkedIn update, X post and newsletter, you already repeat a sequence. Defining it makes the handoffs explicit: what goes in, what comes out and what needs checking.\n\nMore model calls can also mean more cost and waiting. Separate steps don’t remove the need for review. Use enough steps to make the work clear, not as many as you can fit.\n\n## Try the workflow in FuseLLM\n\nFuseLLM connects LLM steps into an automated workflow called a circuit. This article passed through drafting and editing steps in one.\n\nStart small: draft, edit, adapt. Run one idea through it and compare the results with your usual all-in-one prompt.\n\nTry it at [fusellm.lowkey.tools](https://fusellm.lowkey.tools).\n\n---\n\n## Changes\n\n- Cut roughly a third, including alternate titles, repeated benefits and the claim that setup is the only extra work.\n- Replaced the sweeping opening with a specific contrast between channel needs.\n- Added editing and cover-image steps to complete the workflow.\n- Distinguished an opened invoice from approval or intent to pay.\n- Removed unsupported claims about model swapping, selective reruns and downstream work already completed.\n- Kept the product description limited to circuits. Assumed the invoice update is hypothetical; no author decision blocks publication.\n\nVERDICT: APPROVED',
      task:
        "Edit it hard: cut the weak third, sharpen the opening, kill clichés and hedges. Return the edited post, then the list of changes.",
      thinking:
        "**Editing and finalizing plans**\n\nI need to edit the document, aiming for around 550 words but needing to cut down from 850. I should avoid unverifiable claims and ensure that the steps I mention are based on known information. I'll just use the current developer's name for drafting and editing without implying future claims. It's important to check for missing cover images and ensure the accuracy regarding invoices since they’re not equal to payment. Finally, I'll summarize my changes concisely for the final version, targeting around 500 words.",
      metrics: { startedAt: 1791559136351, endedAt: 1791559163727, usage: { input: 1440, output: 889, reasoning: 86, cost: 0.0624425 } },
      verdict: 'approved',
      next: 'Approved',
    },
    {
      id: 'p6m6g1h653x6n',
      stageName: 'Channel cuts',
      modelId: 'gemini-flash',
      modelLabel: 'Gemini 3.8 Flash',
      content:
        '*Assumptions: The audience consists of solo founders and content operators running recurring multi-channel distribution who currently rely on all-in-one prompts.*\n\n## LinkedIn Post\n\nWhen you ask one prompt to draft a blog post, a LinkedIn update, a newsletter, and three tweets, you usually get the same paragraph stretched or compressed to fit different character limits.\n\nDifferent channels do different work:\n- An article needs a substantiated argument.\n- A LinkedIn post needs a specific operational point.\n- An X post needs a single claim within 280 characters.\n- A newsletter needs a clear update for existing readers.\n\nInstead of one all-in-one prompt, split the work into sequential steps:\n1. Draft the core argument.\n2. Edit the claims against product facts.\n3. Adapt the verified draft into channel-specific cuts.\n\nThe benefit is easier debugging. When a social post overstates a feature, you can refine that specific prompt step without re-running or breaking the rest of your distribution.\n\nTry running this workflow as an automated circuit at https://fusellm.lowkey.tools.\n\n---\n\n## X Posts\n\n### Option 1\n*Audience: Content marketers and copywriters*\n\nAsking one prompt to write a blog post, a newsletter, and three tweets gives you the same text in five lengths.\n\nSplit the workflow: establish the core argument once, verify the facts, then adapt for each format.\n\nfusellm.lowkey.tools\n\n### Option 2\n*Audience: Growth engineers and prompt designers*\n\nAll-in-one prompts are hard to debug. When one channel output fails, you have to rerun the entire generation.\n\nBreak multi-channel publishing into discrete steps: draft, edit, adapt. Fix errors where they happen.\n\nfusellm.lowkey.tools\n\n### Option 3\n*Audience: Solo founders*\n\nFor a one-off post, write it manually.\n\nFor a weekly blog post, newsletter, and social queue, connect your prompts into a fixed circuit with one job per step. You get distinct channel copy without starting from scratch.\n\nfusellm.lowkey.tools\n\n---\n\n## Newsletter Intro\n\n### Subject line options\n- Stop asking one prompt to do five jobs\n- Why mega-prompts produce repetitive copy\n- A sequential approach to multi-channel content\n\n### Body (79 words)\nAsking a single prompt to produce a blog post, social updates, and an email usually results in repetitive copy across every channel. Different formats have different jobs: an article proves a claim, while an email directs an existing user to a change.\n\nThe fix is straightforward: separate drafting, editing, and channel adaptations into a linear sequence. Settle the core argument first, then adapt it. Here is how to use FuseLLM circuits to keep claims accurate across every channel.\n\n---\n\n## Cover\n\nA minimal technical diagram showing a single text block passing through an editing checkpoint and branching cleanly into four distinct document formats, vector style on a dark background.',
      task:
        "Cut the finished post into: a LinkedIn post, three X posts that stand alone, a newsletter intro of 80 words, and a one-line image prompt for the cover, under a \"## Cover\" heading.",
      thinking:
        "**Defining the Task**\n\nI'm zeroing in on the core of the request. The goal is crafting copy that's direct, benefit-driven, and perfectly suited to a blog post format. Avoiding clichés and ensuring clarity are paramount. I've noted that the source material is from an \"Edit\" blog post titled \"Stop asking one prompt to do five jobs\".\n\n\n**Outlining the Strategy**\n\nI'm now focused on the specific deliverables outlined: LinkedIn, X (Twitter), newsletter, and image prompt. I'm keeping the core message in mind - the importance of breaking down complex prompts into smaller, more manageable steps for clearer, less repetitive output. The target audience of content marketers, founders, and technical writers remains central to my approach. I'm structuring this as a \"circuit.\"\n\n\n**Crafting the LinkedIn Message**\n\nI'm zeroing in on the LinkedIn post's specifics now. The core idea is to show the need for short, impactful sentences. I've drafted a structure contrasting the needs of a blog post, a LinkedIn update, and a tweet, demonstrating how a single, overly complex prompt leads to subpar results. The current focus is on illustrating the power of sequential steps for clearer, less repetitive outputs. I'm aiming for a concise, benefit-driven message, highlighting FuseLLM as a potential solution.\n\n\n**Developing X Posts**\n\nI've crafted two X (Twitter) post options. The first, targeting content marketers and copywriters, highlights the output quality problem of overly complex prompts. The second, aimed at growth and prompt engineers, focuses on debugging difficulties. Both emphasize breaking the process into smaller, manageable steps, and include a link to FuseLLM. The character counts for each post meet the requirements.\n\n\n**Refining the Workflow**\n\nI've been drafting another X (Twitter) option, focusing on pragmatism and workflow design for solo founders and lean teams, promoting a circuit-based approach to content creation. I've also drafted the newsletter introduction, aiming for 80 words, along with subject lines, highlighting the pitfalls of single-prompt content creation and advocating for a multi-channel approach using sequential prompts. My work demonstrates different formats have different jobs.\n\n\n**Refining the Newsletter**\n\nI'm now putting the finishing touches on the newsletter introduction, aiming for the perfect word count to direct users to the update. I'm separating drafting, editing, and channel cuts into a linear sequence in FuseLLM to ensure claims are accurate across every platform, and I'm very close to achieving that.",
      metrics: { startedAt: 1791559163727, endedAt: 1791559195539, usage: { input: 1160, output: 2229, reasoning: 1596, cost: 0.00922875 } },
    },
    {
      id: 'p264m1t2r520e',
      stageName: 'Cover image',
      modelId: '',
      modelLabel: 'Nano Banana 2 (Gemini 3.1 Flash Image)',
      kind: 'media',
      content:
        'Made 1 image with Nano Banana 2 (Gemini 3.1 Flash Image).\n\n**Prompt:** A minimal technical diagram showing a single text block passing through an editing checkpoint and branching cleanly into four distinct document formats, vector style on a dark background.',
      task:
        "Image from the “## Cover” section of the previous step, 16:9.",
      metrics: { startedAt: 1791559196014, endedAt: 1791559208067, usage: { input: 0, output: 0, cost: 0.067215 } },
    },
  ],
}
