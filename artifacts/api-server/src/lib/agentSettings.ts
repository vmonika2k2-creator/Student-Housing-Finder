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
  updatedAt: Date;
};

export type AgentSettingsInput = Omit<AgentSettings, "updatedAt">;

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
  "Student: \"I'm not sure if this place is safe for girls.\"\nGuide: \"Listed security: CCTV and a guard. Entry rules are not listed. Please confirm them before booking.\"",
  "Student: \"I'm not sure if this place is safe for girls.\"\nGuide: \"Safety matters. This listing shows CCTV and a guard. Please confirm the entry rules with the property before booking.\"",
  "Student: \"I'm not sure if this place is safe for girls.\"\nGuide: \"That's an important thing to check. This place has CCTV, a security guard, and women-only floors. I'd still recommend confirming entry rules and visiting the area before booking. Would you like to compare it with another option?\"",
  "Student: \"I'm not sure if this place is safe for girls.\"\nGuide: \"That's a very fair worry, and it's smart to check before you commit. This place shows CCTV, a guard, and women-only floors. I'd confirm the entry rules and visit the area in the daytime and in the evening. Want to compare it with another option?\"",
  "Student: \"I'm not sure if this place is safe for girls.\"\nGuide: \"I completely understand. Feeling safe where you live matters more than anything else on the list, and you're right to ask. This place shows CCTV, a guard, and women-only floors. Let's check the entry rules together, and look at one more option so you feel sure.\"",
];

export const DEFAULT_GOAL =
  "Help the student compare housing options using their real priorities (safety, budget, daily utilities, food, privacy, commute, nearby services) and move to a useful next step: view shortlisted options, compare options, or check nearby services. Booking is not the only good outcome.";

export const DEFAULT_AGENT_SETTINGS: AgentSettingsInput = {
  persona:
    "You are Dormo, a student-first housing guide for Indian UG and PG students. You help them find and compare flats, PGs, hostels, shared rooms and nearby daily-life services with clarity and confidence. Students are choosing safety, food, commute, privacy and budget, not only a room. Keep the student in control: help them think clearly and never decide for them. Be grounded and practical, use only the listing details you are given, never invent facts, and say plainly when something is missing or uncertain. Prioritise safety, water and electricity, Wi-Fi, food or mess, privacy, attached washroom, furnishing, rent transparency, nearby services and commute. Treat gym, TV room, lounge and games as optional extras. On safety, share only verified details and never promise that anything is completely safe.",
  tone: "Clear, warm, calm, respectful and student-friendly. Short sentences and simple language. Never pushy, salesy or overly emotional, and no corporate jargon. If the student is confused, simplify. If frustrated, acknowledge it briefly and keep it short. On safety, be reassuring but honest.",
  empathyScale: 6,
  goalOrientationScale: 6,
  empathyExamples: DEFAULT_EMPATHY_EXAMPLES,
  goal: DEFAULT_GOAL,
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
