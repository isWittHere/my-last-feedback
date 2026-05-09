import { useEffect, useMemo, useRef, useState } from "react";

export type AgentActivityMatrixPhase = "thinking" | "output" | "tool" | "approval" | "settle";

type Frame = number[][];

type MatrixPreset = {
  id: string;
  interval?: number;
  gen: () => Generator<Frame, void, unknown>;
};

const HIDDEN_INDICES = new Set([0, 6, 42, 48]);

function emptyFrame(): Frame {
  return Array.from({ length: 7 }, () => Array(7).fill(0));
}

function copyFrame(frame: Frame): Frame {
  return frame.map((row) => [...row]);
}

const LOGO: Frame = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1],
];

const vectorSDF = {
  circle: (pointX: number, pointY: number, centerX: number, centerY: number, radius: number) => Math.hypot(pointX - centerX, pointY - centerY) - radius,
  box: (pointX: number, pointY: number, centerX: number, centerY: number, width: number, height: number) => {
    const deltaX = Math.abs(pointX - centerX) - width;
    const deltaY = Math.abs(pointY - centerY) - height;
    return Math.min(Math.max(deltaX, deltaY), 0) + Math.hypot(Math.max(deltaX, 0), Math.max(deltaY, 0));
  },
  smoothUnion: (distanceA: number, distanceB: number, smoothing: number) => {
    const blend = Math.max(smoothing - Math.abs(distanceA - distanceB), 0) / smoothing;
    return Math.min(distanceA, distanceB) - blend * blend * smoothing * 0.25;
  },
  mix: (distanceA: number, distanceB: number, amount: number) => distanceA * (1 - amount) + distanceB * amount,
};

function renderSDF(sceneFn: (x: number, y: number) => number, edge = 0.28): Frame {
  const frame = emptyFrame();
  for (let rowIndex = 0; rowIndex < 7; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < 7; columnIndex += 1) {
      const centerDistance = sceneFn(columnIndex, rowIndex);
      const leftDistance = sceneFn(columnIndex - 0.16, rowIndex);
      const rightDistance = sceneFn(columnIndex + 0.16, rowIndex);
      const upDistance = sceneFn(columnIndex, rowIndex - 0.16);
      const downDistance = sceneFn(columnIndex, rowIndex + 0.16);
      const averagedDistance = (centerDistance * 2 + leftDistance + rightDistance + upDistance + downDistance) / 6;
      const normalized = 1 - Math.max(0, Math.min(1, (averagedDistance + 0.14) / (edge + 0.14)));
      frame[rowIndex][columnIndex] = Math.max(0, Math.min(4, Math.round(normalized * normalized * 4)));
    }
  }
  return frame;
}

const thinkingPreset: MatrixPreset = {
  id: "metaballs",
  interval: 70,
  gen: function* () {
    while (true) {
      for (let frameIndex = 0; frameIndex < 60; frameIndex += 1) {
        const progress = frameIndex / 60;
        const angleA = progress * Math.PI * 2;
        const angleB = progress * Math.PI * -3;
        const angleC = progress * Math.PI * 4;
        const pointAX = 3 + Math.cos(angleA) * 3;
        const pointAY = 3 + Math.sin(angleA) * 3;
        const pointBX = 3 + Math.sin(angleB) * 2.5;
        const pointBY = 3 + Math.cos(angleB) * 2.5;
        const pointCX = 3 + Math.cos(angleC) * 2;
        const pointCY = 3 + Math.sin(angleC) * 3;

        yield renderSDF((x, y) => {
          const distanceA = vectorSDF.circle(x, y, pointAX, pointAY, 1.8);
          const distanceB = vectorSDF.circle(x, y, pointBX, pointBY, 1.5);
          const distanceC = vectorSDF.circle(x, y, pointCX, pointCY, 1.3);
          const distanceCore = vectorSDF.circle(x, y, 3, 3, 1.5);
          const fusedAB = vectorSDF.smoothUnion(distanceA, distanceB, 2);
          const fusedABC = vectorSDF.smoothUnion(fusedAB, distanceC, 2);
          return vectorSDF.smoothUnion(fusedABC, distanceCore, 2.5);
        }, 0.3);
      }
    }
  },
};

const outputRainPreset: MatrixPreset = {
  id: "matrix-rain",
  interval: 50,
  gen: function* () {
    const streams = Array.from({ length: 7 }, (_, columnIndex) => ({
      columnIndex,
      y: -columnIndex * 1.7,
      speed: 0.22 + (columnIndex % 3) * 0.04,
      tail: 4,
    }));

    while (true) {
      for (let frameIndex = 0; frameIndex < 90; frameIndex += 1) {
        const frame = emptyFrame();
        for (const stream of streams) {
          const head = Math.floor(stream.y);
          for (let trailIndex = 0; trailIndex <= stream.tail; trailIndex += 1) {
            const rowIndex = head - trailIndex;
            if (rowIndex < 0 || rowIndex > 6) continue;
            if (trailIndex === 0) frame[rowIndex][stream.columnIndex] = 4;
            else frame[rowIndex][stream.columnIndex] = Math.max(frame[rowIndex][stream.columnIndex], trailIndex <= 1 ? 3 : 2);
          }
          stream.y += stream.speed;
          if (stream.y > 11) stream.y = -3 - ((frameIndex + stream.columnIndex * 5) % 4);
        }
        yield frame;
      }
    }
  },
};

const toolRipplePreset: MatrixPreset = {
  id: "ripple",
  interval: 58,
  gen: function* () {
    while (true) {
      for (let frameIndex = 0; frameIndex < 40; frameIndex += 1) {
        const progress = frameIndex / 40;
        yield renderSDF((x, y) => {
          const deltaX = Math.abs(x - 3);
          const deltaY = Math.abs(y - 3);
          const distance = Math.max(deltaX, deltaY) * 0.5 + Math.hypot(deltaX, deltaY) * 0.5;
          return Math.sin(distance * 2 - progress * Math.PI * 2.4) * 0.9;
        }, 0.42);
      }
    }
  },
};

const toolMorphPreset: MatrixPreset = {
  id: "morph",
  interval: 70,
  gen: function* () {
    while (true) {
      for (let frameIndex = 0; frameIndex < 60; frameIndex += 1) {
        const progress = frameIndex / 60;
        const blend = (Math.sin(progress * Math.PI * 2 - Math.PI / 2) + 1) / 2;
        const scale = 1 + Math.sin(progress * Math.PI * 2) * 0.8;
        yield renderSDF((x, y) => {
          const box = Math.max(
            vectorSDF.box(x, y, 3, 3, 2.8 * scale, 2.8 * scale),
            -vectorSDF.box(x, y, 3, 3, 1.5 * scale, 1.5 * scale),
          );
          const circle = Math.abs(vectorSDF.circle(x, y, 3, 3, 3.2 * scale)) - 0.8;
          return vectorSDF.mix(box, circle, blend);
        }, 0.3);
      }
    }
  },
};

const settleScanPreset: MatrixPreset = {
  id: "settle-scan",
  interval: 55,
  gen: function* () {
    for (let holdIndex = 0; holdIndex < 2; holdIndex += 1) yield emptyFrame();
    for (let rowIndex = 0; rowIndex < 7; rowIndex += 1) {
      const scanFrame = emptyFrame();
      for (let previousRow = 0; previousRow < rowIndex; previousRow += 1) {
        for (let columnIndex = 0; columnIndex < 7; columnIndex += 1) scanFrame[previousRow][columnIndex] = LOGO[previousRow][columnIndex];
      }
      for (let columnIndex = 0; columnIndex < 7; columnIndex += 1) scanFrame[rowIndex][columnIndex] = 3;
      yield scanFrame;
    }
    for (let holdIndex = 0; holdIndex < 5; holdIndex += 1) yield copyFrame(LOGO);
    for (let rowIndex = 6; rowIndex >= 0; rowIndex -= 1) {
      const clearFrame = copyFrame(LOGO);
      for (let clearRow = rowIndex; clearRow < 7; clearRow += 1) {
        for (let columnIndex = 0; columnIndex < 7; columnIndex += 1) clearFrame[clearRow][columnIndex] = 0;
      }
      yield clearFrame;
    }
    for (let holdIndex = 0; holdIndex < 2; holdIndex += 1) yield emptyFrame();
  },
};

const phasePresets: Record<AgentActivityMatrixPhase, MatrixPreset[]> = {
  thinking: [thinkingPreset],
  output: [outputRainPreset],
  tool: [toolRipplePreset, toolMorphPreset],
  approval: [toolMorphPreset],
  settle: [settleScanPreset],
};

function levelColor(level: number): string {
  switch (level) {
    case 1: return "var(--agent-dot-lv1)";
    case 2: return "var(--agent-dot-lv2)";
    case 3: return "var(--agent-dot-lv3)";
    case 4: return "var(--agent-dot-lv4)";
    default: return "transparent";
  }
}

function DotMatrix({ preset, loop, onComplete }: { preset: MatrixPreset; loop: boolean; onComplete?: () => void }) {
  const [frame, setFrame] = useState<Frame>(emptyFrame);
  const completeRef = useRef(onComplete);

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let cancelled = false;
    let timerId = 0;
    let generator = preset.gen();
    const interval = preset.interval ?? 70;

    const tick = () => {
      const result = generator.next();
      if (cancelled) return;
      if (result.done) {
        if (loop) {
          generator = preset.gen();
          timerId = window.setTimeout(tick, interval);
          return;
        }
        completeRef.current?.();
        return;
      }
      setFrame(result.value);
      timerId = window.setTimeout(tick, interval);
    };

    tick();

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [loop, preset]);

  const dots = [];
  for (let rowIndex = 0; rowIndex < 7; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < 7; columnIndex += 1) {
      const cellIndex = rowIndex * 7 + columnIndex;
      const hidden = HIDDEN_INDICES.has(cellIndex);
      dots.push(
        <span
          key={cellIndex}
          className="agent-activity-matrix-dot"
          style={{ background: hidden ? "transparent" : levelColor(frame[rowIndex]?.[columnIndex] ?? 0) }}
        />,
      );
    }
  }

  return <span className="agent-activity-matrix-grid" aria-hidden="true">{dots}</span>;
}

export function AgentActivityMatrix({ phase, onComplete }: { phase: AgentActivityMatrixPhase; onComplete?: () => void }) {
  const preset = useMemo(() => {
    const presets = phasePresets[phase];
    return presets[Math.floor(Math.random() * presets.length)] || presets[0];
  }, [phase]);

  return (
    <span className="agent-activity-matrix" data-phase={phase}>
      <DotMatrix preset={preset} loop={phase !== "settle"} onComplete={phase === "settle" ? onComplete : undefined} />
    </span>
  );
}