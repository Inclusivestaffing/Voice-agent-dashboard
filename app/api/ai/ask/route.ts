import { NextRequest, NextResponse } from "next/server";
import { demoCalls, filterDemo, demoTranscriptText, DEMO_WORKSPACE, DEMO_BH } from "@/lib/demo/openWater";
import { snapshotFromCalls } from "@/lib/reports/snapshot";
import { ruleAnswer, askContext, ASK_MODEL } from "@/lib/ai/ask";
import { chatTitle, cleanHistory, SUGGESTED_QUESTIONS } from "@/lib/ai/askShared";
import { parseFilters } from "@/lib/filters";
import { anthropic } from "@/lib/ai/analyzeCall";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, history = [], workspaceId = "demo", filters } = body;

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Question is required." }, { status: 400 });
    }

    const cleanedHistory = cleanHistory(history);

    // Build snapshot for demo or workspace
    // (In demo mode, we use the 44 Open Water calls with actual diagnosis data)
    const f = parseFilters(filters ?? {}, DEMO_WORKSPACE.timezone);
    const all = demoCalls();
    const calls = filterDemo(all, f);
    const transcripts = new Map(calls.map((c) => [c.call_id, demoTranscriptText(c.call_id)]));
    const snapshot = snapshotFromCalls({
      calls,
      prev: [],
      transcripts,
      workspace: DEMO_WORKSPACE,
      businessHours: DEMO_BH,
      period: { from: f.from, to: f.to },
    });

    let answer = "";

    // If Claude API key is configured, use Claude Sonnet; otherwise use data-grounded ruleAnswer
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const res = await anthropic().messages.create({
          model: ASK_MODEL,
          max_tokens: 1500,
          system: [
            {
              type: "text",
              text: `You are "Ask AI", the voice-agent intelligence analyst for Retell AI phone systems. Answer the user's questions with direct facts, numbers, and recommendations from the analytics data provided. Treat individual calls as "Call #N". Keep formatting clean with bold text, bullet points, and numbered lists.`,
            },
            {
              type: "text",
              text: `<analytics_data>\n${askContext(snapshot)}\n</analytics_data>`,
            },
          ],
          messages: [...cleanedHistory, { role: "user", content: question }],
        });

        const textBlock = res.content.find((c) => c.type === "text");
        if (textBlock && "text" in textBlock) {
          answer = textBlock.text;
        }
      } catch (err) {
        console.error("Claude call failed, falling back to rule engine:", err);
      }
    }

    if (!answer) {
      answer = ruleAnswer(question, snapshot);
    }

    const title = chatTitle(question);

    return NextResponse.json({
      answer,
      title,
      suggestedQuestions: SUGGESTED_QUESTIONS,
    });
  } catch (error: unknown) {
    console.error("Ask AI error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate answer" },
      { status: 500 }
    );
  }
}
