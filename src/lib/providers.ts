export const PROVIDER_IDS = [
  "opendata",
  "google",
  "deepseek",
  "groq",
  "mistral",
  "openrouter",
  "openai",
  "anthropic",
  "xai",
  "ollama",
  "custom",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ProviderModel = {
  id: string;
  label: string;
  in: number;
  out: number;
};

export type ProviderMeta = {
  id: ProviderId;
  label: string;
  badge: string;
  free: boolean;
  needsKey: boolean;
  keyPrefix: string;
  keyHost: string;
  needsBaseUrl: boolean;
  defaultBaseUrl?: string;
  supportsWebGrounding?: boolean;
  models: ProviderModel[];
};

const m = (id: string, label: string, i: number, o: number): ProviderModel => ({
  id,
  label,
  in: i,
  out: o,
});

/**
 * Multi-Provider Registry based on r13i/dodomains + faizul666/domain-search-agent
 * extended with Open-Data Zero-Key mode and Local Ollama support.
 */
export const PROVIDERS: ProviderMeta[] = [
  {
    id: "opendata",
    label: "Open-Data & Phonetik Engine (Kein API-Key nötig)",
    badge: "Sofort startklar · 100% kostenlos",
    free: true,
    needsKey: false,
    keyPrefix: "",
    keyHost: "openthesaurus.de + datamuse.com",
    needsBaseUrl: false,
    models: [
      m(
        "opendata-lexical-v1",
        "OpenThesaurus DE + Datamuse + Morphem-Synthese",
        0,
        0,
      ),
    ],
  },
  {
    id: "google",
    label: "Google Gemini",
    badge: "Empfohlen · Live Web-Trademark-Grounding",
    free: true,
    needsKey: true,
    keyPrefix: "AIza",
    keyHost: "aistudio.google.com",
    needsBaseUrl: false,
    supportsWebGrounding: true,
    models: [
      m("gemini-2.5-flash", "Gemini 2.5 Flash (Schnell + Search Grounding)", 0.3, 2.5),
      m("gemini-2.5-flash-lite", "Gemini 2.5 Flash Lite", 0.1, 0.4),
      m("gemini-2.5-pro", "Gemini 2.5 Pro (Tiefenanalyse)", 1.25, 10.0),
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    badge: "Aus domain-search-agent · Sehr kreativ",
    free: false,
    needsKey: true,
    keyPrefix: "sk-",
    keyHost: "platform.deepseek.com",
    needsBaseUrl: false,
    defaultBaseUrl: "https://api.deepseek.com/v1",
    models: [
      m("deepseek-chat", "DeepSeek V3 / Chat", 0.14, 0.28),
      m("deepseek-reasoner", "DeepSeek R1 Reasoner", 0.55, 2.19),
    ],
  },
  {
    id: "groq",
    label: "Groq (Ultra-Fast)",
    badge: "Kostenloser Tier verfügbar",
    free: true,
    needsKey: true,
    keyPrefix: "gsk_",
    keyHost: "console.groq.com",
    needsBaseUrl: false,
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    models: [
      m("llama-3.3-70b-versatile", "Llama 3.3 70B Versatile", 0.59, 0.79),
      m("llama-3.1-8b-instant", "Llama 3.1 8B Instant", 0.05, 0.08),
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    badge: "Alle Modelle über 1 Key",
    free: true,
    needsKey: true,
    keyPrefix: "sk-or-",
    keyHost: "openrouter.ai",
    needsBaseUrl: false,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    models: [
      m("google/gemini-2.5-flash", "Google Gemini 2.5 Flash", 0.3, 2.5),
      m("deepseek/deepseek-chat", "DeepSeek Chat V3", 0.14, 0.28),
      m("anthropic/claude-3.5-sonnet", "Claude 3.5 Sonnet", 3.0, 15.0),
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    badge: "GPT-4o / GPT-4.1",
    free: false,
    needsKey: true,
    keyPrefix: "sk-",
    keyHost: "platform.openai.com",
    needsBaseUrl: false,
    defaultBaseUrl: "https://api.openai.com/v1",
    models: [
      m("gpt-4o-mini", "GPT-4o Mini", 0.15, 0.6),
      m("gpt-4o", "GPT-4o", 2.5, 10.0),
      m("gpt-4.1-mini", "GPT-4.1 Mini", 0.4, 1.6),
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    badge: "Stark bei Marken-Nuancen",
    free: false,
    needsKey: true,
    keyPrefix: "sk-ant-",
    keyHost: "console.anthropic.com",
    needsBaseUrl: false,
    models: [
      m("claude-3-5-haiku-latest", "Claude 3.5 Haiku", 0.8, 4.0),
      m("claude-3-7-sonnet-latest", "Claude 3.7 Sonnet", 3.0, 15.0),
    ],
  },
  {
    id: "mistral",
    label: "Mistral AI (EU)",
    badge: "Europäischer KI-Provider",
    free: true,
    needsKey: true,
    keyPrefix: "",
    keyHost: "console.mistral.ai",
    needsBaseUrl: false,
    defaultBaseUrl: "https://api.mistral.ai/v1",
    models: [
      m("mistral-small-latest", "Mistral Small", 0.15, 0.6),
      m("mistral-large-latest", "Mistral Large", 2.0, 6.0),
    ],
  },
  {
    id: "xai",
    label: "xAI Grok",
    badge: "Grok",
    free: false,
    needsKey: true,
    keyPrefix: "xai-",
    keyHost: "console.x.ai",
    needsBaseUrl: false,
    defaultBaseUrl: "https://api.x.ai/v1",
    models: [m("grok-2-latest", "Grok 2 Latest", 2.0, 10.0)],
  },
  {
    id: "ollama",
    label: "Ollama (Lokal auf deinem Mac)",
    badge: "100% Lokal & Privat",
    free: true,
    needsKey: false,
    keyPrefix: "",
    keyHost: "localhost:11434",
    needsBaseUrl: true,
    defaultBaseUrl: "http://localhost:11434/v1",
    models: [
      m("llama3.2", "Llama 3.2 (Lokal)", 0, 0),
      m("qwen2.5", "Qwen 2.5 (Lokal)", 0, 0),
      m("mistral", "Mistral (Lokal)", 0, 0),
      m("deepseek-r1", "DeepSeek R1 (Lokal)", 0, 0),
    ],
  },
  {
    id: "custom",
    label: "Custom (OpenAI-kompatibler Endpoint)",
    badge: "Eigener Server / LM Studio",
    free: false,
    needsKey: false,
    keyPrefix: "",
    keyHost: "",
    needsBaseUrl: true,
    defaultBaseUrl: "http://localhost:1234/v1",
    models: [m("local-model", "Standard-Modell", 0, 0)],
  },
];

export type LlmConfig = {
  provider: ProviderId;
  model: string;
  apiKey: string;
  baseUrl?: string;
};

export const LLM_STORAGE_KEY = "markenfrei.llm.v1";

export function getProvider(id: string): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function defaultModel(id: string): string {
  return getProvider(id)?.models[0]?.id ?? "";
}

export function getDefaultConfig(): LlmConfig {
  return {
    provider: "opendata",
    model: "opendata-lexical-v1",
    apiKey: "",
  };
}
