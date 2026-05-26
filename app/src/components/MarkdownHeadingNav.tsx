import type { RefObject } from "react";

export interface MarkdownHeadingEntry {
  level: number;
  text: string;
  index: number;
}

export function parseMarkdownHeadings(markdown: string): MarkdownHeadingEntry[] {
  const result: MarkdownHeadingEntry[] = [];
  const lines = markdown.split("\n");
  let inCodeBlock = false;
  let index = 0;
  for (const line of lines) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const match = /^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      result.push({ level: match[1].length, text: match[2].trim(), index: index++ });
    }
  }
  return result;
}

export function MarkdownHeadingNav({
  headings,
  scrollContainerRef,
  activeIndex,
}: {
  headings: MarkdownHeadingEntry[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  activeIndex: number;
}) {
  if (headings.length === 0) return null;

  const handleClick = (heading: MarkdownHeadingEntry) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const allHeadings = container.querySelectorAll("h1, h2, h3, h4");
    const target = allHeadings[heading.index] as HTMLElement | undefined;
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const widthMap: Record<number, string> = { 1: "100%", 2: "70%", 3: "45%", 4: "25%" };
  const thicknessMap: Record<number, number> = { 1: 3, 2: 2, 3: 2, 4: 1 };

  return (
    <div className="heading-nav-bar">
      {headings.map((heading, index) => (
        <button
          key={index}
          className={`heading-nav-line${index === activeIndex ? " active" : ""}`}
          style={{
            width: widthMap[heading.level] || "25%",
            height: thicknessMap[heading.level] || 1,
          }}
          title={heading.text}
          onClick={() => handleClick(heading)}
        />
      ))}
    </div>
  );
}
