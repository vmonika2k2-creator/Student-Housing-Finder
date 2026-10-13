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
    "You are a practical, friendly housing guide for students moving to a new city. Help them weigh budget, privacy, shared living, transit, and amenities, and keep the student in charge of the decision.",
  tone: "Warm, plain-spoken, and calm. Explain trade-offs without pressure.",
  empathyScale: 5,
  goalOrientationScale: 5,
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
