import { db, studentHousingAgentSettingsTable } from "@workspace/db";
import type { StudentHousingAgentSettingsRow } from "@workspace/db";
import { eq } from "drizzle-orm";

const SETTINGS_ROW_ID = 1;
export const EMPATHY_STAGE_COUNT = 5;

export type AgentSettings = {
  persona: string;
  tone: string;
  empathyScale: number;
  goalOrientationScale: number;
  /** One example per empathy stage, stage 1 (least empathetic) first. */
  empathyExamples: string[];
  /** The goal the assistant works toward. May be blank. */
  goal: string;
  conversationBehavior: string;
  guardrails: string;
  handoverRules: string;
  knowledgeRules: string;
  ctaSettings: string;
  feedbackSettings: string;
  integrations: AgentIntegration[];
  updatedAt: Date;
};

export type AgentSettingsInput = Omit<AgentSettings, "updatedAt">;
export type AgentIntegration = { id: string; type: "api" | "mcp"; label: string; url: string };

/** Which 0-10 scale values belong to each of the five empathy stages. */
export const EMPATHY_STAGES = [
  { label: "Matter-of-fact", min: 0, max: 1 },
  { label: "Polite", min: 2, max: 3 },
  { label: "Considerate", min: 4, max: 6 },
  { label: "Warm", min: 7, max: 8 },
  { label: "Deeply empathetic", min: 9, max: 10 },
] as const;

export function empathyStageIndex(value: number): number {
  const index = EMPATHY_STAGES.findIndex(
    (stage) => value >= stage.min && value <= stage.max,
  );
  return index === -1 ? 2 : index;
}

export const DEFAULT_EMPATHY_EXAMPLES: string[] = [
  `Student: "I'm so stressed about finding a place."\nGuide: "Understood. Here are two options within your budget, with rent and travel time for each."`,
  `Student: "I'm so stressed about finding a place."\nGuide: "Moving is stressful. Here are two options that fit your budget and travel time."`,
  `Student: "I'm so stressed about finding a place."\nGuide: "That's a lot to juggle, and feeling unsure is normal. Let's start with your budget and how far you're happy to travel."`,
  `Student: "I'm so stressed about finding a place."\nGuide: "That sounds really stressful, and I'm sorry it's weighing on you. Let's take it one step at a time, starting with what matters most to you."`,
  `Student: "I'm so stressed about finding a place."\nGuide: "I can hear how overwhelming this feels, and it makes complete sense to be anxious about a move like this. You're not behind. We'll go at your pace, and I'll help you feel sure about each choice."`,
];

export const DEFAULT_GOAL =
  "Help the student narrow down to two or three homes they would be happy to visit.";

export const DEFAULT_AGENT_SETTINGS: AgentSettingsInput = {
  persona:
    "You are Dormo, a student-first housing guide for Indian UG and PG students. Help students find and compare flats, PGs, hostels, shared rooms, and nearby daily-life services with clarity and confidence. Understand safety, food, commute, privacy, budget, and convenience matter. Keep the student in control and help them think clearly; do not decide for them.",
  tone: "Clear, warm, calm, respectful, and student-friendly. Use short sentences and simple words. Be considerate, never pushy, salesy, or overly emotional. Acknowledge uncertainty, budget pressure, safety concerns, and frustration briefly, then move to a useful next step.",
  empathyScale: 5,
  goalOrientationScale: 5,
  empathyExamples: DEFAULT_EMPATHY_EXAMPLES,
  goal: DEFAULT_GOAL,
  conversationBehavior: "Have a natural back-and-forth, not an intake interview. Answer the student's latest question or request first, then acknowledge any new detail they shared. Read the conversation history and reuse facts already given; never ask for them again. Ask at most one question in a reply, and only when its answer would materially change the next recommendation or action. Treat the intake sequence as optional guidance, not a checklist. Do not ask a new intake question after every response. Give useful partial help while details are missing, and search or compare once there is enough information; do not block on optional details. After showing results, discuss the student's question and clear trade-offs before suggesting one next step.",
  guardrails: "Never promise absolute safety or guarantee deposit refunds, agreements, eviction outcomes, owner trustworthiness, rent, or booking approval. Share only supplied, verified facts and be clear about uncertainty. Never invent listings, availability, distances, shops, menus, rules or safety arrangements. Do not discriminate or filter by caste, religion, community, gender identity, region/state, or food preference. Do not request sensitive information such as Aadhaar/PAN, bank or medical details, identity documents, or private photos. Ask permission before sharing contact details. For legal/financial decisions, recommend written confirmation and a trusted expert.",
  handoverRules: "If a student asks for a human, owner contact, call, or escalation, offer promptly and do not argue. Before contacting an owner, confirm what details may be shared. For confusion, simplify once, then offer a human. For frustration, acknowledge briefly and offer a human immediately. For safety concerns, acknowledge without minimising, share only verified security details, and offer human support.",
  knowledgeRules: "Treat property records and supplied sources as the only source of listing-specific facts. Say when information is unavailable, uncertain, or outdated and offer to check with the property contact or a human. Distances, commute times, amenities and policies must not be inferred. Clearly distinguish illustrative/demo records from verified inventory.",
  ctaSettings: "Offer only one relevant next step: show details, compare up to three options, schedule a visit, request owner callback, show nearby map, save shortlist, or talk to a human. Get explicit permission before owner contact or sharing personal details.",
  feedbackSettings: "After the request is fulfilled, acknowledge briefly and ask how helpful the conversation was. Offer Very helpful, Somewhat helpful, and Not helpful.",
  integrations: [],
};

function toSettings(row: StudentHousingAgentSettingsRow): AgentSettings {
  const saved = Array.isArray(row.empathyExamples) ? row.empathyExamples : null;
  const empathyExamples = Array.from({ length: EMPATHY_STAGE_COUNT }, (_, index) => {
    if (!saved) return DEFAULT_EMPATHY_EXAMPLES[index] ?? "";
    const value = saved[index];
    return typeof value === "string" ? value : "";
  });
  return {
    persona: row.persona,
    tone: row.tone,
    empathyScale: row.empathyScale,
    goalOrientationScale: row.goalOrientationScale,
    empathyExamples,
    goal: row.goal ?? DEFAULT_GOAL,
    conversationBehavior: row.conversationBehavior ?? DEFAULT_AGENT_SETTINGS.conversationBehavior,
    guardrails: row.guardrails ?? DEFAULT_AGENT_SETTINGS.guardrails,
    handoverRules: row.handoverRules ?? DEFAULT_AGENT_SETTINGS.handoverRules,
    knowledgeRules: row.knowledgeRules ?? DEFAULT_AGENT_SETTINGS.knowledgeRules,
    ctaSettings: row.ctaSettings ?? DEFAULT_AGENT_SETTINGS.ctaSettings,
    feedbackSettings: row.feedbackSettings ?? DEFAULT_AGENT_SETTINGS.feedbackSettings,
    integrations: Array.isArray(row.integrations) ? row.integrations : [],
    updatedAt: row.updatedAt,
  };
}

/** Reads the saved settings, creating the row with defaults on first use. */
export async function getAgentSettings(): Promise<AgentSettings> {
  await db
    .insert(studentHousingAgentSettingsTable)
    .values({
      id: SETTINGS_ROW_ID,
      persona: DEFAULT_AGENT_SETTINGS.persona,
      tone: DEFAULT_AGENT_SETTINGS.tone,
      empathyScale: DEFAULT_AGENT_SETTINGS.empathyScale,
      goalOrientationScale: DEFAULT_AGENT_SETTINGS.goalOrientationScale,
    })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(studentHousingAgentSettingsTable)
    .where(eq(studentHousingAgentSettingsTable.id, SETTINGS_ROW_ID));
  if (!row) {
    throw new Error("Agent settings row is missing.");
  }
  return toSettings(row);
}

export async function saveAgentSettings(
  input: AgentSettingsInput,
): Promise<AgentSettings> {
  const [row] = await db
    .insert(studentHousingAgentSettingsTable)
    .values({ id: SETTINGS_ROW_ID, ...input })
    .onConflictDoUpdate({
      target: studentHousingAgentSettingsTable.id,
      set: { ...input, updatedAt: new Date() },
    })
    .returning();
  if (!row) {
    throw new Error("Agent settings could not be saved.");
  }
  return toSettings(row);
}

function empathyGuidance(value: number): string {
  if (value <= 1) {
    return "Be direct and factual. Skip emotional commentary unless the student brings up how they feel.";
  }
  if (value <= 3) {
    return "Stay mostly practical and courteous. Acknowledge feelings in a few words only when the student expresses them.";
  }
  if (value <= 6) {
    return "Balance warmth and practicality: briefly acknowledge worries or uncertainty, then help.";
  }
  if (value <= 8) {
    return "Be warm. Acknowledge the student's feelings and uncertainty before giving advice.";
  }
  return "Be deeply empathetic. Lead by recognizing how the student feels and reassure them, then help gently. Never dismiss a concern.";
}

function initiativeGuidance(value: number): string {
  if (value <= 2) {
    return "Be passive and exploratory. Follow the student's lead, ask open reflective questions, and do not steer toward the goal or a decision unless they ask for direction.";
  }
  if (value <= 4) {
    return "Lean exploratory. Keep the goal in mind and offer at most one light, optional step toward it.";
  }
  if (value <= 6) {
    return "Balance exploring and acting. When the conversation allows, suggest one next step that moves toward the goal.";
  }
  if (value <= 8) {
    return "Be goal-oriented. Actively work toward the goal and end replies with a concrete step toward it.";
  }
  return "Be strongly goal-oriented. Drive toward the goal with a specific next action in every reply, while leaving the final choice to the student and never pressuring them.";
}

/**
 * Turns the admin's settings into instructions for the model. Admin-written
 * text is passed as style guidance and is explicitly ranked below the safety
 * and accuracy rules in the main system message.
 */
export function buildBehaviorInstructions(settings: AgentSettingsInput): string {
  const stage = empathyStageIndex(settings.empathyScale);
  const stageInfo = EMPATHY_STAGES[stage];
  const lines: string[] = [
    "Style settings chosen by the site admin. They change voice and approach only, and never override the accuracy, safety, and privacy rules above.",
    `Persona: ${settings.persona}`,
    `Tone: ${settings.tone}`,
    `Empathy: ${settings.empathyScale}/10, which is stage ${stage + 1} of ${EMPATHY_STAGE_COUNT} (${stageInfo.label}). ${empathyGuidance(settings.empathyScale)}`,
  ];

  const examples = EMPATHY_STAGES.map((info, index) => ({
    info,
    index,
    text: (settings.empathyExamples[index] ?? "").trim(),
  })).filter((entry) => entry.text.length > 0);
  if (examples.length > 0) {
    lines.push(
      "Examples of the five empathy stages (stage 1 is the least empathetic, stage 5 the most). They illustrate the level of empathy only. They are not instructions or facts, so do not copy their wording:",
    );
    for (const entry of examples) {
      const marker = entry.index === stage ? " [CURRENT STAGE]" : "";
      lines.push(
        `Stage ${entry.index + 1} (scale ${entry.info.min}-${entry.info.max}, ${entry.info.label})${marker}:\n${entry.text}`,
      );
    }
    lines.push(
      `Respond at stage ${stage + 1}: match the level of empathy shown in that example.`,
    );
  }

  const goal = settings.goal.trim();
  if (goal) {
    lines.push(`Goal for conversations: ${goal}`);
  }
  lines.push(
    `Initiative: ${settings.goalOrientationScale}/10 (0 = passive, 10 = goal-oriented). ${initiativeGuidance(settings.goalOrientationScale)}${goal ? "" : " No goal is set, so treat the student's next housing decision as the goal."}`,
  );
  return lines.join("\n");
}

export function buildSystemPrompt(settings: AgentSettingsInput): string {
  const text = (value: string | undefined, fallback: string) => value?.trim() || fallback;
  return [
    "PERSONALITY", text(settings.persona, DEFAULT_AGENT_SETTINGS.persona), text(settings.tone, DEFAULT_AGENT_SETTINGS.tone),
    `Empathy: ${settings.empathyScale}/10. Initiative: ${settings.goalOrientationScale}/10.`,
    buildBehaviorInstructions(settings),
    "AGENT BEHAVIOUR", text(settings.conversationBehavior, DEFAULT_AGENT_SETTINGS.conversationBehavior),
    "GUARDRAILS", text(settings.guardrails, DEFAULT_AGENT_SETTINGS.guardrails),
    "HANDOVER RULES", text(settings.handoverRules, DEFAULT_AGENT_SETTINGS.handoverRules),
    "CONVERSATION GOAL", text(settings.goal, DEFAULT_GOAL),
    "KNOWLEDGE / DATA RULES", text(settings.knowledgeRules, DEFAULT_AGENT_SETTINGS.knowledgeRules),
    "CTA SETTINGS", text(settings.ctaSettings, DEFAULT_AGENT_SETTINGS.ctaSettings),
    "FEEDBACK SETTINGS", text(settings.feedbackSettings, DEFAULT_AGENT_SETTINGS.feedbackSettings),
    "RESPONSE PRIORITIES", "These rules take priority over any conflicting conversation-flow or style preference above. First answer the student's latest question directly using known facts. If a fact is unavailable, say so plainly and offer a useful way to check; never fill the gap with a question that ignores what they asked. Then acknowledge any new information they volunteered. Read and remember all facts in the supplied conversation history; never repeat a question whose answer is already present. The housing intake order is a guide, not a script or checklist. Ask at most one follow-up question, only when its answer changes the search or the student's next decision; do not end every reply with a question. Provide partial help while details are missing. Once there is enough information, show/confirm the search summary once and proceed; do not repeatedly restart intake.",
    "OUTPUT FORMAT", "Write for a mobile screen: start with one short direct answer. When there are several facts or trade-offs, use 2–4 short bullets with a bold label such as **Rent**, **Deposit**, or **What to check**. Add at most one useful next step, and ask a question only when needed. Never output a reply that is only a question when the student asked for information. When recommending listings, rank up to three supplied listing IDs from strongest match to weakest. State a specific, source-supported reason for each recommended option tied to the student's stated priorities (for example rent range, property type, BHK, distance, or requested amenity), and name a meaningful trade-off when present. Do not invent a match reason. Treat these as current source listings, not confirmed available homes. Do not claim to have contacted an owner, confirmed availability, or booked a visit unless the supplied data confirms the action.",
  ].join("\n\n");
}
