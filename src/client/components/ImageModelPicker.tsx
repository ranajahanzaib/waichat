import { estimateImageNeurons, estimateImagesPerDay } from "../utils/imageGeneration";
import type { ImageModelDefinition, ImageSize } from "../../shared/imageModels";
import { FREE_NEURON_ALLOCATION } from "../../shared/imageModels";

interface ImageModelPickerProps {
  models: ImageModelDefinition[];
  value: string;
  size: ImageSize;
  steps: number;
  onChange: (model: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function ImageModelPicker({ models, value, size, steps, onChange, disabled, compact }: ImageModelPickerProps) {
  const selected = models.find((model) => model.id === value) || models[0];
  if (!selected) return <p className="text-xs text-gray-500 dark:text-white/50">No supported image models are currently available.</p>;
  const groups = [
    { label: "Free-tier friendly", models: models.filter((model) => model.tier === "free-friendly") },
    { label: "Uses more quota", models: models.filter((model) => model.tier === "uses-more-quota") },
  ];
  const estimate = estimateImageNeurons(selected.id, size, steps);
  const imagesPerDay = estimateImagesPerDay(selected.id, size, steps);
  return <div className={compact ? "min-w-0" : "space-y-3"}>
    <select value={selected.id} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-label="Image model" className={`block w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent ${compact ? "p-1.5 text-xs" : "p-2 text-sm"}`}>
      {groups.map((group) => group.models.length > 0 && <optgroup key={group.label} label={group.label}>
        {group.models.map((model) => {
          const defaultCost = estimateImageNeurons(model.id, model.defaultSize, model.steps.default);
          const defaultImagesPerDay = estimateImagesPerDay(model.id, model.defaultSize, model.steps.default);
          return <option key={model.id} value={model.id}>{model.name} · ~{defaultCost.toLocaleString()} N/image · ~{defaultImagesPerDay}/day · {model.licenseBadge}</option>;
        })}
      </optgroup>)}
    </select>
    <p className="text-xs text-gray-500 dark:text-white/50">
      Estimated {estimate.toLocaleString()} Neurons/image · about {imagesPerDay.toLocaleString()} images per 10,000-Neuron day.
    </p>
    <a href={selected.termsUrl} target="_blank" rel="noreferrer" className="inline-block text-xs underline underline-offset-2 text-gray-500 dark:text-white/50">{selected.licenseBadge}</a>
    {!compact && <p className="text-xs text-gray-500 dark:text-white/50">Estimate only. Workers Free allocation is {FREE_NEURON_ALLOCATION.toLocaleString()} Neurons/day shared with chat; chat usage is not tracked here.</p>}
  </div>;
}
