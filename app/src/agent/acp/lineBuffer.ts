export class AcpLineBuffer {
  private pending = "";

  push(chunk: string): string[] {
    this.pending += chunk;
    const lines: string[] = [];
    let newlineIndex = this.pending.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.pending.slice(0, newlineIndex).replace(/\r$/, "");
      this.pending = this.pending.slice(newlineIndex + 1);
      if (line.trim()) lines.push(line);
      newlineIndex = this.pending.indexOf("\n");
    }
    return lines;
  }

  clear() {
    this.pending = "";
  }
}