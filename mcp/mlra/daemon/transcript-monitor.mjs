// ── MLRA Transcript Monitor ──
// Monitors VS Code Copilot Chat transcript JSONL files for alive detection.
// Detects agent derailment (turn_end without MLRA tool call)
// and confirms connectivity (MLRA tool execution).

import { watch, statSync, openSync, readSync, closeSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { EventEmitter } from "node:events";

// MLRA tools that indicate the agent is properly connected to the orchestrator
const MLRA_TOOLS = new Set([
  "register_LRA",
  "submit",
  "router_vote",
  "order",
  "check_orders",
  "await_order_finish",
  "submit_feedback",
]);

/**
 * Monitors a single session's transcript JSONL file.
 *
 * Events:
 *   "connected"  (callerId, sessionId)           — Agent called an MLRA tool
 *   "derailed"   (callerId, sessionId, reason)    — Agent ended turn without MLRA tool
 */
export class TranscriptMonitor extends EventEmitter {
  /**
   * @param {string} sessionId  - VS Code Chat Session UUID
   * @param {string} transcriptDir - Directory containing transcript JSONL files
   * @param {string} callerId - MLRA caller ID (may be set later via setCallerId)
   */
  constructor(sessionId, transcriptDir, callerId = null) {
    super();
    this.sessionId = sessionId;
    this.transcriptPath = join(transcriptDir, `${sessionId}.jsonl`);
    this.callerId = callerId;
    this.lastOffset = 0;
    this.watcher = null;
    this.status = "unknown"; // "unknown" | "connected" | "derailed"

    // Track turn state for derailment detection
    this._currentTurnHasMLRATool = false;
    this._inTurn = false;
  }

  setCallerId(callerId) {
    this.callerId = callerId;
  }

  start() {
    try {
      // Read existing content to establish initial state
      this._processNewLines();
    } catch (e) {
      // File may not exist yet — that's OK
    }

    if (existsSync(this.transcriptPath)) {
      this._watchFile();
    } else {
      // File doesn't exist yet — watch the directory for its creation
      this._watchDirForCreation();
    }
  }

  _watchFile() {
    if (this.watcher) return;
    try {
      this.watcher = watch(this.transcriptPath, { persistent: false }, (eventType) => {
        if (eventType === "change") {
          this._processNewLines();
        }
      });
      this.watcher.on("error", (err) => {
        console.error(`[TranscriptMonitor] Watch error for ${this.sessionId}: ${err.message}`);
      });
    } catch (e) {
      console.error(`[TranscriptMonitor] Could not watch ${this.transcriptPath}: ${e.message}`);
    }
  }

  _watchDirForCreation() {
    const dir = dirname(this.transcriptPath);
    const filename = `${this.sessionId}.jsonl`;
    try {
      this._dirWatcher = watch(dir, { persistent: false }, (eventType, changed) => {
        if (changed === filename && existsSync(this.transcriptPath)) {
          // File created — switch to file watcher
          this._dirWatcher.close();
          this._dirWatcher = null;
          this._processNewLines();
          this._watchFile();
        }
      });
      this._dirWatcher.on("error", () => {
        // Directory might not exist either — give up silently
      });
    } catch {
      // Cannot watch directory — file monitoring won't work for this session
    }
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this._dirWatcher) {
      this._dirWatcher.close();
      this._dirWatcher = null;
    }
  }

  _processNewLines() {
    let stat;
    try {
      stat = statSync(this.transcriptPath);
    } catch {
      return; // File doesn't exist yet
    }

    if (stat.size <= this.lastOffset) return;

    const fd = openSync(this.transcriptPath, "r");
    try {
      const buf = Buffer.alloc(stat.size - this.lastOffset);
      readSync(fd, buf, 0, buf.length, this.lastOffset);
      this.lastOffset = stat.size;

      const text = buf.toString("utf-8");
      const lines = text.split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          this._handleEvent(event);
        } catch {
          // Malformed line — skip
        }
      }
    } finally {
      closeSync(fd);
    }
  }

  _handleEvent(event) {
    switch (event.type) {
      case "assistant.turn_start": {
        this._inTurn = true;
        this._currentTurnHasMLRATool = false;
        break;
      }

      case "tool.execution_start": {
        const toolName = event.data?.toolName;
        if (toolName && MLRA_TOOLS.has(toolName)) {
          this._currentTurnHasMLRATool = true;
          if (this.status !== "connected") {
            this.status = "connected";
            if (this.callerId) {
              this.emit("connected", this.callerId, this.sessionId);
            }
          }
        }
        break;
      }

      case "assistant.turn_end": {
        // Agent ended its turn — this should NEVER happen in a properly
        // connected MLRA session, because MLRA blocking tools prevent turn_end.
        this._inTurn = false;
        this.status = "derailed";
        if (this.callerId) {
          this.emit("derailed", this.callerId, this.sessionId, "turn_end");
        }
        break;
      }
    }
  }
}

/**
 * Manages TranscriptMonitor instances for all registered sessions.
 * Daemon creates one TranscriptMonitorPool and adds monitors as sessions register.
 */
export class TranscriptMonitorPool extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, TranscriptMonitor>} sessionId → TranscriptMonitor */
    this.monitors = new Map();
    /** @type {Map<string, string>} callerId → sessionId (reverse lookup) */
    this.callerToSession = new Map();
  }

  /**
   * Add a monitor for a session.
   * Called when Hook TCP notification arrives with session_id + transcriptDir.
   * callerId may be null if register_LRA hasn't happened yet.
   */
  addSession(sessionId, transcriptDir, callerId = null) {
    if (this.monitors.has(sessionId)) {
      // Update callerId if provided
      if (callerId) {
        const monitor = this.monitors.get(sessionId);
        monitor.setCallerId(callerId);
        this.callerToSession.set(callerId, sessionId);
      }
      return;
    }

    const monitor = new TranscriptMonitor(sessionId, transcriptDir, callerId);

    // Forward events
    monitor.on("connected", (cid, sid) => this.emit("connected", cid, sid));
    monitor.on("derailed", (cid, sid, reason) => this.emit("derailed", cid, sid, reason));

    this.monitors.set(sessionId, monitor);
    if (callerId) {
      this.callerToSession.set(callerId, sessionId);
    }
    monitor.start();

    console.error(`[TranscriptMonitorPool] Monitoring session ${sessionId}${callerId ? ` (caller: ${callerId})` : ""}`);
  }

  /**
   * Associate a callerId with an already-known sessionId.
   * Called when register_LRA arrives and we match to a Hook notification.
   */
  linkCaller(callerId, sessionId) {
    const monitor = this.monitors.get(sessionId);
    if (monitor) {
      monitor.setCallerId(callerId);
      this.callerToSession.set(callerId, sessionId);
    }
  }

  /**
   * Get the monitor for a callerId.
   */
  getByCallerId(callerId) {
    const sessionId = this.callerToSession.get(callerId);
    return sessionId ? this.monitors.get(sessionId) : null;
  }

  /**
   * Remove a monitor.
   */
  removeSession(sessionId) {
    const monitor = this.monitors.get(sessionId);
    if (monitor) {
      monitor.stop();
      this.monitors.delete(sessionId);
      if (monitor.callerId) {
        this.callerToSession.delete(monitor.callerId);
      }
    }
  }

  /**
   * Stop all monitors.
   */
  stopAll() {
    for (const monitor of this.monitors.values()) {
      monitor.stop();
    }
    this.monitors.clear();
    this.callerToSession.clear();
  }
}
