import { db, studentHousingAgentSettingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const SETTINGS_ROW_ID = 1;

export type AgentSettings = {
  persona: string;
  tone: string;
  empathyScale: number;
  goalOrientationScale: number;
  updatedAt: Date;
};

export type AgentSettingsInput = Omit<AgentSettings, "updatedAt">;

export const DEFAULT_AGENT_SETTINGS: AgentSettingsInput = {
  persona:
    "You are a practical, friendly housing guide for students moving to a new city. Help them weigh budget, privacy, shared living, transit, and amenities, and keep the student in charge of the decision.",
  tone: "Warm, plain-spoken, and calm. Explain trade-offs without pressure.",
  empathyScale: 5,
  goalOrientationScale: 5,
};

// Normally `pnpm --filter db push` (run by scripts/post-merge.sh) creates this
// table. This keeps the admin panel and the assistant working even if a deploy
// reaches the server before that push has run.
let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = db
      .execute(
        sql`create table if not exists student_housing_agent_settings (
          id integer primary key,
          persona text not null,
          tone text not null,
          empathy_scale integer not null,
          goal_orientation_scale integer not null,
          updated_at timestamptz not null default now()
        )`,
      )
      .then(() => undefined)
      .catch((error) => {
        tableReady = null;
        throw error;
      });
  }
  return tableReady;
}

/** Reads the saved settings, creating the row with defaults on first use. */
export async function getAgentSettings(): Promise<AgentSettings> {
  await ensureTable();
  await db
    .insert(studentHousingAgentSettingsTable)
    .values({ id: SETTINGS_ROW_ID, ...DEFAULT_AGENT_SETTINGS })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(studentHousingAgentSettingsTable)
    .where(eq(studentHousingAgentSettingsTable.id, SETTINGS_ROW_ID));
  if (!row) {
    throw new Error("Agent settings row is missing.");
  }
  return {
    persona: row.persona,
    tone: row.tone,
    empathyScale: row.empathyScale,
    goalOrientationScale: row.goalOrientationScale,
    updatedAt: row.updatedAt,
  };
}

export async function saveAgentSettings(
  input: AgentSettingsInput,
): Promise<AgentSettings> {
  await ensureTable();
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
  return {
    persona: row.persona,
    tone: row.tone,
    empathyScale: row.empathyScale,
    goalOrientationScale: row.goalOrientationScale,
    updatedAt: row.updatedAt,
  };
}

function empathyGuidance(value: number): string {
  if (value <= 2) {
    return "Be direct and factual. Skip emotional commentary unless the student brings up how they feel.";
  }
  if (value <= 4) {
    return "Stay mostly practical. Acknowledge feelings in a few words only when the student expresses them.";
  }
  if (value <= 6) {
    return "Balance warmth and practicality: briefly acknowledge worries or uncertainty, then help.";
  }
  if (value <= 8) {
    return "Be warm. Acknowledge the student's feelings and uncertainty before giving advice.";
  }
  return "Be highly empathetic. Lead by recognizing how the student feels and reassure them, then help gently. Never dismiss a concern.";
}

function goalGuidance(value: number): string {
  if (value <= 2) {
    return "Be passive and exploratory. Follow the student's lead, ask open reflective questions, and do not push toward decisions or next steps unless they ask.";
  }
  if (value <= 4) {
    return "Lean exploratory. Offer at most one light, optional next step.";
  }
  if (value <= 6) {
    return "Balance exploring and acting. Help narrow the options and suggest one next step when it fits.";
  }
  if (value <= 8) {
    return "Be goal-oriented. Help the student narrow to a shortlist and end replies with a concrete next step.";
  }
  return "Be strongly goal-oriented. Actively move the student toward a decision with a specific next action in every reply, while leaving the final choice to them and never pressuring.";
}

/**
 * Turns the admin's settings into instructions for the model. Admin-written
 * text is passed as style guidance and is explicitly ranked below the safety
 * and accuracy rules in the main system message.
 */
export function buildBehaviorInstructions(settings: AgentSettingsInput): string {
  return [
    "Style settings chosen by the site admin. They change voice and approach only, and never override the accuracy, safety, and privacy rules above.",
    `Persona: ${settings.persona}`,
    `Tone: ${settings.tone}`,
    `Empathy (${settings.empathyScale}/10): ${empathyGuidance(settings.empathyScale)}`,
    `Goal orientation (${settings.goalOrientationScale}/10, 0 = passive, 10 = goal-oriented): ${goalGuidance(settings.goalOrientationScale)}`,
  ].join("\n");
}
