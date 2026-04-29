/**
 * Tiny rule-based intent classifier. Replace with an LLM call once
 * pi-agent's classifier is wired in.
 */
export type Intent =
  | "ask_question"
  | "add_source"
  | "summarize"
  | "generate_briefing"
  | "generate_faq"
  | "generate_quiz"
  | "generate_mind_map"
  | "generate_slides"
  | "extract_action_items"
  | "unknown";

export function classifyIntent(message: string): Intent {
  const text = message.toLowerCase();

  if (/\b(brief(ing)?|manager (note|update))\b/.test(text)) return "generate_briefing";
  if (/\bfaq\b/.test(text)) return "generate_faq";
  if (/\bquiz\b/.test(text)) return "generate_quiz";
  if (/\bmind ?map\b/.test(text)) return "generate_mind_map";
  if (/\b(slides?|slide ?deck|ppt|powerpoint|presentation|deck|keynote)\b/.test(text)) return "generate_slides";
  if (/\b(action items?|todo|tasks?)\b/.test(text)) return "extract_action_items";
  if (/\b(summar(y|ize|ise))\b/.test(text)) return "summarize";
  if (/\b(add|upload|attach)\b.*\b(source|file|url|link|document)\b/.test(text)) return "add_source";
  if (/\?$|^(what|why|how|when|who|where|explain|tell me)/.test(text)) return "ask_question";

  return "unknown";
}
