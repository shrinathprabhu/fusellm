import type { Circuit } from '../../types.ts'
import { act, ask, decide, pause, tpl } from './kit.ts'

/*
 * Circuits built around a Jev decision. Jev (TypeSafe, on the OpenRouter
 * key) answers one structured question — a labelled choice, an ordered score
 * or a probability — and later stages act on its answer. It routes work to
 * the right specialist, gates what goes out, and scores against a rubric.
 */

export const JEV_CIRCUITS: Circuit[] = [
  tpl({
    id: 'jev-ticket-router',
    cat: 'support',
    emoji: '🔀',
    name: 'Support ticket routed by Jev to billing, bug or how-to, then answered by the right specialist',
    desc: 'Jev reads the ticket and picks one queue. The reply stage follows that choice: a billing reply, a bug acknowledgement with reproduction questions, or step-by-step help, and it is posted to Slack for an agent to send.',
    hint: 'Paste one customer ticket…',
    stages: [
      decide('Route', 'choice', '{{brief}}', 'Which team should handle this support ticket?', [
        'billing: Charges, refunds, invoices, plans, payment methods or subscription changes.',
        'bug: Something in the product is broken, erroring or behaving differently from before.',
        'howto: The customer wants to know how to do something the product already supports.',
        'urgent: Security, data loss, legal threat, or the customer cannot use the product at all.',
      ]),
      ask('Reply', 'claude-sonnet', 'Jev routed this ticket as:\n\n{{step:Route}}\n\nWrite the reply that fits that route. billing: explain the charge or change and the next step, never promise a refund. bug: acknowledge it, ask for the reproduction details you need, and say what happens next. howto: numbered steps. urgent: a short holding reply and a one-line escalation note for the on-call lead at the top.', { role: 'support-agent', skills: ['support-reply'], from: 'brief' }),
      act('Post to Slack', 'slack.post', { text: '*Ticket · {{date}}*\nRoute: {{step:Route}}\n\n{{step:Reply}}' }),
    ],
  }),
  tpl({
    id: 'jev-lead-score',
    cat: 'sales',
    emoji: '🌡️',
    name: 'Inbound lead scored by Jev from cold to hot, with the follow-up that fits the score',
    desc: 'Sonar researches the company behind a new inbound lead, Jev scores the fit on a five-level scale you can edit, and the follow-up is written for that score: a meeting ask for hot leads, a nurture email for cold ones. Logged to a Sheet.',
    hint: 'New signup: priya@brightlogistics.in, “we have 40 drivers and route by hand”. We sell route optimisation for fleets of 20+.',
    stages: [
      ask('Research', 'sonar-pro', 'Research the company behind this lead: size, industry, location, recent news and signs they have the problem we solve. Keep it under 250 words, link sources.', { role: 'research-analyst', from: 'brief', web: true, mode: 'search' }),
      decide('Score', 'score', 'Lead and our offer:\n{{brief}}\n\nResearch:\n{{output}}', 'How good a fit is this lead for our offer, right now?', [
        'No fit: wrong industry, size or region, or a student or competitor.',
        'Weak fit: could use it one day, no sign of the problem today.',
        'Possible fit: right profile, but no clear trigger or urgency.',
        'Good fit: right profile and a visible sign of the problem.',
        'Hot: right profile, clear pain, and signs of buying now (hiring, growth, a stated need).',
      ]),
      ask('Follow-up', 'claude-sonnet', 'Jev scored this lead (0 is no fit, 4 is hot):\n\n{{step:Score}}\n\nResearch:\n{{step:Research}}\n\nWrite the follow-up that fits: 3–4, a short personal email asking for a 20-minute call with two times; 2, a helpful email with one resource and a soft question; 0–1, a polite reply with no sales ask.', { role: 'sdr', skills: ['outreach'], from: 'brief' }),
      act('Log to a Sheet', 'gsheets.append', { sheet: '', range: 'Leads!A:D', rows: '[["{{date}}", "{{brief}}", "{{step:Score}}", "{{step:Follow-up}}"]]' }),
    ],
  }),
  tpl({
    id: 'jev-cv-rubric',
    cat: 'people',
    emoji: '📏',
    name: 'Candidate scored by Jev on a five-level rubric, then interview questions for the gaps',
    desc: 'Jev scores a CV against the job’s must-haves on a fixed rubric, the same way for every candidate, and a recruiter writes the screening questions that would test the gaps it found. You decide who moves on.',
    hint: 'The job’s must-haves first, then the CV…',
    stages: [
      decide('Rubric score', 'score', '{{brief}}', 'How well does this CV meet the stated must-haves? Judge only evidence in the CV, never age, gender, nationality, name or career gaps.', [
        'Meets almost none of the must-haves.',
        'Meets a few must-haves; major gaps.',
        'Meets about half; the gaps could be trained.',
        'Meets most must-haves with evidence.',
        'Meets every must-have with strong, specific evidence.',
      ]),
      ask('Screen questions', 'claude-sonnet', 'Jev’s rubric score (0 lowest, 4 highest):\n\n{{step:Rubric score}}\n\nFor this job and CV, list which must-haves have weak or no evidence, and write two screening questions per gap that would let the candidate show it.', { role: 'recruiter', skills: ['interview-kit'], from: 'brief' }),
      pause('Move them on?', 'Score:\n{{step:Rubric score}}\n\nQuestions:\n{{step:Screen questions}}\n\nContinue to keep the notes, send back with comments, or cancel.'),
    ],
  }),
  tpl({
    id: 'jev-brand-gate',
    cat: 'social',
    emoji: '🚦',
    name: 'Social post checked by Jev for how likely it is to be on-brand before it posts',
    desc: 'A post is drafted from your idea, Jev gives the probability it meets your brand rules, and you see that number next to the post before choosing to publish to Discord or send it back.',
    hint: 'Idea: we now ship to Canada. Brand rules: warm, plain words, no exclamation marks, never mention competitors.',
    stages: [
      ask('Post', 'claude-sonnet', 'Write the post from the idea, following the brand rules in the brief. If comments came back, revise.', { role: 'social-media', skills: ['social'], from: 'brief' }),
      decide('On-brand?', 'noul', 'Brand rules and idea:\n{{brief}}\n\nPost:\n{{output}}', 'Does this post follow every brand rule stated?', [
        'true: The post follows every stated brand rule and says what the idea asked for.',
        'false: The post breaks at least one stated brand rule or misstates the idea.',
      ]),
      pause('Your call', 'Jev’s probability that the post is on-brand:\n{{step:On-brand?}}\n\nThe post:\n{{step:Post}}\n\nContinue to publish, send it back to Post with changes, or cancel.', 'Post'),
      act('Publish', 'discord.post', { content: '{{step:Post}}' }),
    ],
  }),
  tpl({
    id: 'jev-merge-risk',
    cat: 'quality',
    emoji: '🧯',
    name: 'Code change risk-rated by Jev, with high-risk changes sent for a deep second review',
    desc: 'A reviewer summarises what a diff changes, Jev rates the merge risk as low, medium or high, and the second review scales to match: a quick sanity check for low risk, a full security and correctness audit for high.',
    hint: 'Paste the diff and the PR description…',
    stages: [
      ask('Summary', 'gemini-flash', 'Summarise what this change does in under 200 words: files and areas touched, data or auth paths affected, migrations, config and dependency changes, and test coverage.', { role: 'staff-reviewer', from: 'brief', mode: 'fast' }),
      decide('Risk', 'choice', '{{output}}', 'How risky is merging this change?', [
        'low: Docs, tests, copy, styling or isolated code with tests; easy to revert.',
        'medium: Changes behaviour users see or shared code, with some tests.',
        'high: Touches auth, payments, data migrations, security, infrastructure, or has no tests for changed logic.',
      ]),
      ask('Second review', 'gpt-astra', 'Jev rated this change:\n\n{{step:Risk}}\n\nReview the diff at the depth the rating calls for. low: a short sanity check. medium: correctness and edge cases. high: a full correctness, security, data-safety and rollback review, block on anything unsafe.', { role: 'staff-reviewer', skills: ['code-review', 'security-audit'], from: 'brief', mode: 'deep' }),
    ],
  }),
  tpl({
    id: 'jev-expense-policy',
    cat: 'finance',
    emoji: '💳',
    name: 'Expense claim checked by Jev against policy: approve, ask a question, or reject',
    desc: 'Receipts are extracted into line items, Jev decides against your written expense policy, and the claimant gets a clear message explaining the outcome. Approvals are logged to a Sheet.',
    hint: 'Policy: meals up to €40/day when travelling, no alcohol, taxis only after 21:00… Then the receipts.',
    stages: [
      ask('Line items', 'gemini-flash', 'Extract every line item from the receipts: date, vendor, category, amount, currency, and anything the policy cares about (alcohol, time, travel). Keep it short.', { role: 'accountant', skills: ['extract'], from: 'brief', mode: 'fast' }),
      decide('Policy check', 'choice', 'Policy and claim:\n{{brief}}\n\nLine items:\n{{output}}', 'Under the stated policy, what should happen to this expense claim?', [
        'approve: Every item is within policy and documented.',
        'query: Something is unclear or missing (a receipt, a reason, a time) and the claimant should explain.',
        'reject: At least one item clearly breaks the policy.',
      ]),
      ask('Message', 'claude-haiku', 'Jev decided:\n\n{{step:Policy check}}\n\nLine items:\n{{step:Line items}}\n\nWrite a short, friendly message to the claimant explaining the outcome, quoting the policy line behind any query or rejection.', { role: 'accountant', from: 'brief' }),
      act('Log', 'gsheets.append', { sheet: '', range: 'Expenses!A:C', rows: '[["{{date}}", "{{step:Policy check}}", "{{step:Line items}}"]]' }),
    ],
  }),
  tpl({
    id: 'jev-clause-triage',
    cat: 'legal',
    emoji: '🗂️',
    name: 'Contract clause triaged by Jev as standard, negotiate or needs a lawyer',
    desc: 'Paste one clause and your position. Jev triages it, and a contract reader writes the matching next step: an OK note, suggested replacement wording, or the questions for a lawyer. Not legal advice.',
    hint: 'We are the customer. Clause 12.3: “Supplier’s total liability shall not exceed fees paid in the prior month.”',
    stages: [
      decide('Triage', 'choice', '{{brief}}', 'For the party named, how should this contract clause be handled?', [
        'standard: Market-standard and balanced for this kind of agreement; accept.',
        'negotiate: One-sided or unusual, but a reasonable counter-proposal would fix it.',
        'lawyer: Material legal or financial risk, unclear drafting, or regulated subject matter.',
      ]),
      ask('Next step', 'claude-opus', 'Jev triaged the clause:\n\n{{step:Triage}}\n\nWrite the matching next step. standard: one line on why it is fine. negotiate: replacement wording and a one-line reason to send the other side. lawyer: what the risk is and the exact questions to ask a lawyer. Not legal advice.', { role: 'lawyer-ish', from: 'brief' }),
    ],
  }),
  tpl({
    id: 'jev-claim-probability',
    cat: 'research',
    emoji: '🎲',
    name: 'How likely is this claim true? Evidence gathered, then Jev gives a probability',
    desc: 'Sonar gathers evidence for and against a claim, Opus summarises it neutrally, and Jev returns a calibrated probability that the claim is true, with the summary you can check.',
    hint: 'Claim: “Remote workers are less productive than office workers.”',
    stages: [
      ask('Evidence', 'sonar-pro', 'Find the strongest evidence for and against the claim, preferring studies and primary data. Link and date each source.', { role: 'research-analyst', from: 'brief', web: true, mode: 'search' }),
      ask('Neutral summary', 'claude-opus', 'Summarise the evidence neutrally in under 300 words: what supports the claim, what contradicts it, and how strong each side is. Do not give a verdict.', { role: 'journalist' }),
      decide('Probability', 'noul', 'Claim:\n{{brief}}\n\nEvidence summary:\n{{output}}', 'Given this evidence, is the claim true as stated?', [
        'true: The claim is true as stated, for the population and context it names.',
        'false: The claim is false, overstated, or true only in a narrower context than stated.',
      ]),
    ],
  }),
  tpl({
    id: 'jev-alert-triage',
    cat: 'devops',
    emoji: '📟',
    name: 'Production alert triaged by Jev: page someone now, open a ticket, or ignore',
    desc: 'Paste an alert and recent context. Jev decides how urgent it is, and an SRE writes the matching action: a page message with the first three checks, a ticket for the backlog, or a note on why it is noise. Posted to Slack.',
    hint: 'Alert: p95 latency on /checkout above 2s for 10 min. Deploy 20 min ago. Error rate normal.',
    stages: [
      decide('Urgency', 'choice', '{{brief}}', 'How should the on-call team respond to this alert?', [
        'page: Users are affected now or data is at risk; wake someone.',
        'ticket: Real problem, but no user impact yet; fix in working hours.',
        'ignore: Noise, a known flap, or already resolved.',
      ]),
      ask('Action', 'claude-sonnet', 'Jev decided:\n\n{{step:Urgency}}\n\nWrite the matching action. page: a page message with impact and the first three things to check. ticket: a ticket title and description. ignore: one line on why, and how to tune the alert.', { role: 'sre', from: 'brief', mode: 'fast' }),
      act('Post to Slack', 'slack.post', { text: '*Alert triage · {{date}}*\n{{step:Urgency}}\n\n{{step:Action}}' }),
    ],
  }),
  tpl({
    id: 'jev-eval-grader',
    cat: 'ai',
    emoji: '🧮',
    name: 'Chatbot answer graded by Jev on a fixed scale, for building an eval set',
    desc: 'Runs your prompt on the model you want to test, Jev grades the answer on a five-level scale against your reference answer, and the question, answer and grade are appended to a Sheet so scores build up run after run.',
    hint: 'Question: “Can I return an opened item?” Reference answer: “Yes, within 30 days, unless it is underwear or earrings.”',
    stages: [
      ask('Answer', 'gpt-luna', 'Answer the customer question in the brief as a support assistant would. Ignore the reference answer.', { from: 'brief', mode: 'fast' }),
      decide('Grade', 'score', 'Question and reference answer:\n{{brief}}\n\nModel answer:\n{{output}}', 'How well does the model answer match the reference answer in substance?', [
        'Wrong or harmful.',
        'Mostly wrong or misses the main point.',
        'Partly right; important details missing or wrong.',
        'Right, with a minor omission.',
        'Fully right and complete.',
      ]),
      act('Log the grade', 'gsheets.append', { sheet: '', range: 'Evals!A:D', rows: '[["{{date}}", "{{brief}}", "{{step:Answer}}", "{{step:Grade}}"]]' }),
    ],
  }),
  tpl({
    id: 'jev-essay-band',
    cat: 'education',
    emoji: '🖍️',
    name: 'Essay placed in a grade band by Jev, then feedback on how to reach the next one',
    desc: 'Jev places an essay in one of five grade bands you define, consistently across a class, and a teacher writes feedback aimed at moving it up exactly one band.',
    hint: 'Band descriptors (or leave ours), the question, then the essay…',
    stages: [
      decide('Band', 'score', '{{brief}}', 'Which grade band does this essay fall in, judged on argument, evidence, structure and expression?', [
        'Band 1: No clear argument; little relevant evidence.',
        'Band 2: An argument is attempted; evidence thin or loosely used.',
        'Band 3: Clear argument with relevant evidence; analysis uneven.',
        'Band 4: Well-structured argument, evidence analysed, minor lapses.',
        'Band 5: Sophisticated, consistently analytical and precisely written.',
      ]),
      ask('Feedback', 'claude-sonnet', 'Jev placed the essay (0 is Band 1, 4 is Band 5):\n\n{{step:Band}}\n\nWrite feedback that would move it up exactly one band: two strengths quoted from the essay, and three specific revisions. Do not rewrite the essay.', { role: 'teacher', from: 'brief' }),
    ],
  }),
  tpl({
    id: 'jev-should-i-buy',
    cat: 'personal',
    emoji: '🤔',
    name: 'Should I buy it? Jev weighs a purchase against the money rules you set',
    desc: 'Write your own money rules once, then paste any purchase you are tempted by. Jev decides buy, wait 30 days or skip against your rules, and a coach explains the call and a cheaper alternative. Not financial advice.',
    hint: 'My rules: no non-essential buys over ₹10k without waiting a month; savings first… Purchase: noise-cancelling headphones, ₹28k.',
    stages: [
      decide('Verdict', 'choice', '{{brief}}', 'Under the person’s own stated rules, what should they do about this purchase?', [
        'buy: It fits every rule they stated.',
        'wait: It could fit, but a rule says to wait or save first.',
        'skip: It breaks one of their rules.',
      ]),
      ask('Why', 'claude-haiku', 'Jev’s verdict:\n\n{{step:Verdict}}\n\nExplain the verdict in three lines using the person’s own rules, and suggest a cheaper or second-hand alternative if one exists. Education, not financial advice.', { role: 'money-coach', from: 'brief', mode: 'fast' }),
    ],
  }),
]
