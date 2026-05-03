import { useEffect, useState } from "react";

export interface Model {
  id: string;
  name: string;
}

export const DEFAULT_MODEL_ID = "@cf/google/gemma-4-26b-a4b-it";

export const FALLBACK_MODELS: Model[] = [
  { id: "@cf/google/gemma-4-26b-a4b-it", name: "Google Gemma 4 26B" },
  { id: "@cf/moonshotai/kimi-k2.5", name: "Kimi K2.5" },
  {
    id: "@cf/meta/llama-4-scout-17b-16e-instruct",
    name: "Meta Llama 4 Scout 17B",
  },
  { id: "@cf/qwen/qwen3-30b-a3b-fp8", name: "Qwen 3 30B" },
  { id: "@cf/openai/gpt-oss-120b", name: "OpenAI GPT OSS 120B" },
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    name: "Meta Llama 3.3 70B",
  },
  {
    id: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
    name: "DeepSeek R1 32B",
  },
  { id: "@cf/qwen/qwq-32b", name: "Qwen QwQ 32B" },
  {
    id: "@cf/mistralai/mistral-small-3.1-24b-instruct",
    name: "Mistral Small 3.1 24B",
  },
  { id: "@cf/openai/gpt-oss-20b", name: "OpenAI GPT OSS 20B" },
];

export function useModels() {
  const [models, setModels] = useState<Model[]>(FALLBACK_MODELS);
  const [loading, setLoading] = useState(true);

  const refreshModels = (newModels?: Model[]) => {
    if (newModels) {
      setModels(newModels);
      return;
    }
    setLoading(true);
    fetch("/api/models")
      .then((res) => res.json() as Promise<Model[]>)
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setModels(data);
      })
      .catch((err) => {
        console.error("Failed to refresh models:", err);
        // keep current models
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refreshModels();
  }, []);

  return { models, loading, refreshModels };
}
