import type { MetricKey } from "@/types/adb"
import { Check, Circle } from "lucide-react"

const OPTIONS: { value: MetricKey; label: string }[] = [
  { value: "fps", label: "FPS" },
  { value: "cpu", label: "CPU" },
  { value: "power", label: "耗能" },
  { value: "memory", label: "内存" },
  { value: "traffic", label: "流量" },
]

interface Props {
  value: MetricKey[]
  onChange: (value: MetricKey[]) => void
  disabled?: boolean
}

export function MetricSelector({ value, onChange, disabled }: Props) {
  const toggle = (metric: MetricKey) => {
    if (value.includes(metric)) {
      onChange(value.filter((m) => m !== metric))
    } else {
      onChange([...value, metric])
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="text-sm font-medium">性能参数选择</div>
      <div className="rounded-md border">
        {OPTIONS.map((opt) => {
          const active = value.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => toggle(opt.value)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {active ? (
                <Check className="h-4 w-4 text-primary" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
              <span>{opt.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}


