import type { ReactNode } from "react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Area, AreaChart, Brush, CartesianGrid, XAxis, YAxis } from "recharts"

type BrushState = {
  // 百分比 0-100，避免因数据长度变化导致拖动中断
  start: number
  end: number
}

type ChartListContextValue = {
  brush: BrushState
  setBrush: (state: BrushState) => void
  dragging: boolean
  setDragging: (v: boolean) => void
}

const ChartListContext = createContext<ChartListContextValue | null>(null)

export function useChartList() {
  const ctx = useContext(ChartListContext)
  if (!ctx) throw new Error("useChartList must be used inside <ChartList />")
  return ctx
}

export function ChartList({
  children,
  initialBrush,
  onDraggingChange,
}: {
  children: ReactNode
  initialBrush?: BrushState
  onDraggingChange?: (dragging: boolean) => void
}) {
  const [brush, setBrush] = useState<BrushState>(initialBrush ?? { start: 0, end: 100 })
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    onDraggingChange?.(dragging)
  }, [dragging, onDraggingChange])

  const value = useMemo(() => ({ brush, setBrush, dragging, setDragging }), [brush, dragging])

  const childArray = useMemo(
    () => (Array.isArray(children) ? children : [children]).filter(Boolean) as ReactNode[],
    [children]
  )

  return (
    <ChartListContext.Provider value={value}>
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {childArray.map((child, index) => (
            <motion.div
              key={(child as any)?.key ?? index}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{
                duration: 0.2,
                ease: "easeOut",
                layout: { duration: 0.25, ease: "easeInOut" },
              }}
            >
              {child}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ChartListContext.Provider>
  )
}

type LineConfig = {
  dataKey: string
  label: string
  color: string
}

type ChartItemProps = {
  title?: string
  icon?: ReactNode
  data: Array<Record<string, number | string>>
  xKey: string
  yDomain?: [number, number]
  lines: LineConfig[]
  height?: number | string
}

export function ChartItem({
  title,
  icon,
  data,
  xKey,
  yDomain,
  lines,
  height = 224, // 默认约 56px * 4 = 224px
}: ChartItemProps) {
  const { brush, setBrush, setDragging } = useChartList()
  const draggingRef = useRef(false)
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [displayData, setDisplayData] = useState(data)
  const pendingDataRef = useRef<typeof data | null>(null)

  // 数据刷新时，如果正在拖拽则暂存，拖拽结束再应用，避免中断
  useEffect(() => {
    if (draggingRef.current) {
      pendingDataRef.current = data
    } else {
      setDisplayData(data)
    }
  }, [data])

  const brushIndexRange = useMemo(() => {
    const maxIndex = Math.max(displayData.length - 1, 0)
    if (maxIndex <= 0) return { startIndex: 0, endIndex: 0 }
    const toIndex = (pct: number) => Math.max(0, Math.min(maxIndex, Math.round((pct / 100) * maxIndex)))
    return {
      startIndex: toIndex(brush.start),
      endIndex: toIndex(brush.end),
    }
  }, [brush, displayData.length])

  const visibleData = useMemo(() => {
    if (!displayData.length) return displayData
    const start = Math.max(0, Math.min(displayData.length - 1, brushIndexRange.startIndex))
    const end = Math.max(start, Math.min(displayData.length - 1, brushIndexRange.endIndex))
    return displayData.slice(start, end + 1)
  }, [brushIndexRange.endIndex, brushIndexRange.startIndex, displayData])

  const stats = useMemo(
    () =>
      lines.map((line) => {
        const values = visibleData
          .map((item) => item[line.dataKey])
          .filter((v) => typeof v === "number" && Number.isFinite(v)) as number[]

        if (!values.length) {
          return { key: line.dataKey, label: line.label, color: line.color, max: null, min: null, avg: null }
        }

        const max = Math.max(...values)
        const min = Math.min(...values)
        const avg = values.reduce((sum, v) => sum + v, 0) / values.length

        return { key: line.dataKey, label: line.label, color: line.color, max, min, avg }
      }),
    [lines, visibleData]
  )

  const formatNumber = useCallback((value: number | null) => {
    if (value === null || Number.isNaN(value)) return "—"
    if (Math.abs(value) >= 100) return value.toFixed(0)
    return value.toFixed(1)
  }, [])

  useEffect(() => {
    // 如果数据长度变小导致刷选越界，做一次修正
    if (draggingRef.current) return
    const maxIndex = Math.max(displayData.length - 1, 0)
    if (maxIndex <= 0) return
    // clamp percent based on current maxIndex
    const pctStart = Math.max(0, Math.min(brush.start, 100))
    const pctEnd = Math.max(pctStart, Math.min(brush.end, 100))
    if (pctStart !== brush.start || pctEnd !== brush.end) {
      setBrush({ start: pctStart, end: pctEnd })
    }
  }, [brush.start, brush.end, displayData.length, setBrush])

  const handleBrushChange = useCallback(
    (next: { startIndex?: number; endIndex?: number }) => {
      if (next.startIndex === undefined || next.endIndex === undefined) return
      draggingRef.current = true
      setDragging(true)
      if (dragTimerRef.current) clearTimeout(dragTimerRef.current)
      dragTimerRef.current = setTimeout(() => {
        draggingRef.current = false
        setDragging(false)
        if (pendingDataRef.current) {
          setDisplayData(pendingDataRef.current)
          pendingDataRef.current = null
        }
      }, 150)
      // 立即同步刷选到全局，保持兄弟图表实时联动
      const maxIndex = Math.max(displayData.length - 1, 1)
      const toPct = (idx: number) => Math.max(0, Math.min(100, (idx / maxIndex) * 100))
      setBrush({ start: toPct(next.startIndex), end: toPct(next.endIndex) })
    },
    [displayData.length, setBrush]
  )

  const config = useMemo(
    () =>
      lines.reduce<Record<string, { label: string; color: string }>>((acc, line) => {
        acc[line.dataKey] = { label: line.label, color: line.color }
        return acc
      }, {}),
    [lines]
  )

  return (
    <div className="space-y-1">
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {icon ? <span className="text-muted-foreground">{icon}</span> : null}
            <span>{title}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            {stats.map((stat) => (
              <div key={stat.key} className="flex items-center gap-1">
                <span
                  className="inline-flex h-2 w-2 rounded-full"
                  style={{ backgroundColor: `var(--color-${stat.key})` }}
                />
                <span className="text-xs text-foreground/80">{stat.label}</span>
                <span className="font-medium text-foreground/80">
                  max {formatNumber(stat.max)} / avg {formatNumber(stat.avg)} / min {formatNumber(stat.min)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <ChartContainer
        className="w-full rounded-md border bg-card/60 p-2"
        style={{ height }}
        config={config}
      >
        <AreaChart data={displayData}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} domain={yDomain} />
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <ChartLegend content={<ChartLegendContent />} />
          {lines.map((line) => (
            <Area
              key={line.dataKey}
              dataKey={line.dataKey}
              type="linear"
              stroke={`var(--color-${line.dataKey})`}
              fill={`var(--color-${line.dataKey})`}
              fillOpacity={0.2}
              strokeWidth={2}
              name={line.label}
              isAnimationActive={false}
            />
          ))}
          <Brush
            dataKey={xKey}
            height={16}
            stroke="var(--border)"
            fill="var(--card)"
            travellerWidth={12}
            startIndex={brushIndexRange.startIndex}
            endIndex={brushIndexRange.endIndex}
            onChange={handleBrushChange}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}

