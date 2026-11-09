// A subset of real calls from the Open Water Marine September 2026 report, converted
// into Retell's call shape. Used to check the rule-based pre-classifier.
import type { RetellCall } from "@/lib/types";

const GREETING = "Agent: Thanks for calling Open Water Marine, this is Allen. How can I help you today?\n";

function call(id: number, durS: number | null, transcript: string, extra: Partial<RetellCall> = {}): RetellCall {
  return {
    call_id: `owm-${id}`,
    call_type: "phone_call",
    call_status: transcript || durS ? "ended" : "error",
    direction: "inbound",
    duration_ms: durS === null ? undefined : durS * 1000,
    transcript,
    disconnection_reason: "user_hangup",
    call_analysis: transcript ? { call_summary: "summary", user_sentiment: "Neutral" } : undefined,
    ...extra,
  };
}

export const expectedSilent = [5, 24, 27, 28, 38, 39, 48];
export const expectedSpam = [47, 50, 51];
export const expectedNoData = [14, 26];
export const expectedNeedsLLM = [7, 32, 45];

export const sampleCalls: Record<number, RetellCall> = {
  5: call(5, 4, "Agent: Thanks for calling Open Water Marine, this is Allen. How can I help \n"),
  24: call(24, 4, "Agent: Thanks for calling Open Water Marine, this is Allen. How can I help you \n"),
  27: call(27, 7, GREETING),
  28: call(28, 6, GREETING),
  38: call(38, 10, GREETING),
  39: call(39, 5, GREETING),
  48: call(48, 2, "Agent: Thanks for calling Open Water \n"),
  47: call(47, 13, "Agent: Thanks for \nUser: To be added to our do not call list, please press nine. I look forward to speaking with you. And have a blessed day. \n" + GREETING),
  50: call(50, 10, "User: Liz \nAgent: Thanks for \nUser: please press nine. I look forward to speaking with you. \nUser: And have a blessed day. \nAgent: Thank you, and you have a blessed day as well! Take care.\n"),
  51: call(51, 29, "User: Credit or for equipment financing. However, I need to speak with you before this offer expires. Please visit our website. To decline this offer, visit our website Thank you, and have a great day. \nAgent: Thanks for \n"),
  14: call(14, null, ""),
  26: call(26, null, ""),
  7: call(7, 24, "User: Live. \n" + GREETING + "User: I'm stuck on a sandbar. \nAgent: Oh no, that's no good. First, may I ask who I'm speaking with?\nUser: My name's Sean. I I need help right now. \nAgent: Oh no, let's get you help right away — I'm transferring you to the team now.\n", { disconnection_reason: "call_transfer" }),
  32: call(32, 85, GREETING + "User: Hi, Alan. This is Grant Peterson. I missed your guys' call this morning. I'm out of town. I was gonna see if you were able to grab my boat at the house or not. \nAgent: ...Could I just get the best phone number to reach you on?\nUser: Could I speak to a person? \nAgent: Sounds good, Grant. I'll transfer you to the team so you can talk to someone directly.\n", { disconnection_reason: "transfer_cancelled" }),
  45: call(45, 197, GREETING + "User: Hi. Um, are you still renting pontoons, or is it too late? \nAgent: Yah, we're still renting pontoons.\nUser: Could you spell out the website? I can't understand. \n"),
};
