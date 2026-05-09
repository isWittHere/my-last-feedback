// mcp/mlfb/tools/interactive-feedback.mjs
// The `interactive_feedback` MCP tool.

import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { resolveCallerInfo } from "../../common/caller-info.mjs";
import {
  ensureAppRunning,
  requestFeedbackViaIpc,
} from "../app-ipc.mjs";

const MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

const REQUEST_TYPE_VALUES = [
  "analysis",
  "completion",
  "planning",
  "document",
];
const REQUEST_TYPE_SET = new Set(REQUEST_TYPE_VALUES);
const REQUEST_TYPE_HINT = "request_type is REQUIRED and should be one of: analysis, completion, planning, document. Explanations, investigation details, analysis results, and reports should use analysis. It is metadata for categorization and visual display only; it does not change tool behavior, permissions, routing, or available capabilities.";

const TOOL_DESCRIPTION = `Request interactive feedback from the user via a desktop GUI window.
The user may provide text feedback, test logs, and/or attach images.
Images will be returned as ImageContent alongside the text feedback.

MANDATORY ARGUMENTS: project_directory, summary, request_name, request_type, agent_name.
${REQUEST_TYPE_HINT}

IMPORTANT - rules for AI agents calling this tool:
1. request_name MUST always be provided with a meaningful task title. Never omit it or leave it blank.
2. summary MUST be written in standard Markdown format (headings, lists, bold, code blocks). Do NOT use escape characters such as \\n or \\t.
3. Describe full context, suggestions, and detailed information in summary. Use questions only for concise, actionable choices or brief input fields.
4. request_type: REQUIRED metadata only. It categorizes why you are asking for feedback and affects display/category labels only. It does NOT change tool behavior, permissions, routing, or available capabilities. Use one of: analysis (分析), completion (完成), planning (规划), document (文档). Explanations, investigation details, analysis results, and reports should use analysis. Never omit request_type.
5. agent_name: REQUIRED. Your 4-char uppercase hex identifier assigned by the hook system (delivered via PostToolUse additionalContext, e.g. "[my-last-feedback] Your agent_name is \"A1B2\"").`;

function normalizeRequestType(value) {
  if (typeof value === "string" && REQUEST_TYPE_SET.has(value)) return value;
  return "analysis";
}

/**
 * Register the interactive_feedback tool on the given McpServer.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 */
export function registerInteractiveFeedback(server) {
  server.tool(
    "interactive_feedback",
    TOOL_DESCRIPTION,
    {
      project_directory: z.string().describe("Full path to the project directory"),
      summary: z.string().describe(
        "Summary of changes and feedback in standard Markdown format. " +
        "MUST use proper Markdown syntax: headings (## Heading), bullet lists (- item), bold (**text**), code blocks. " +
        "Do NOT use escape characters. Provide complete context, suggestions, and detailed information here."
      ),
      request_name: z.string().describe(
        "A concise title (5-10 words) for the current task, displayed in the window title bar. " +
        "This parameter is REQUIRED and MUST NOT be left empty."
      ),
      request_type: z.string().describe(
        "REQUIRED metadata only. Why the agent is using this tool. This categorizes the request for display and does not change tool behavior, permissions, routing, or capabilities. " +
        "Allowed values: analysis=分析, completion=完成, planning=规划, document=文档. Explanations, investigation details, analysis results, and reports should use analysis."
      ),
      agent_name: z.string().regex(/^[A-Z0-9]{4}$/, "agent_name must be 4 uppercase hex chars (e.g. A1B2)").describe(
        "REQUIRED. Your 4-char uppercase hex agent identifier (e.g. A1B2). " +
        "Provided by the hook system via PostToolUse additionalContext. Use the same value in ALL calls."
      ),
      questions: z.array(z.object({
        label: z.string().describe("Short question label, e.g. 'Database choice', 'Need caching?'"),
        options: z.array(z.string()).optional().describe("Option identifiers for quick selection, e.g. ['A', 'B', 'C']. Omit for free-text input."),
      })).optional().describe(
        "Structured questions for the user. Options are short identifiers only — describe full proposals and details in summary."
      ),
    },
    async ({ project_directory, summary, request_name, request_type, agent_name, questions }) => {
      const checkedRequestType = normalizeRequestType(request_type);
      const projectDir = project_directory.split("\n")[0].trim();
      const info = await resolveCallerInfo(server, { workspaceHint: projectDir });

      // agent_name is required and validated by zod — trust it directly.
      const alias = agent_name;
      const callerInfo = {
        name: info.folderName,
        version: info.clientVersion,
        clientName: info.clientName,
        alias,
      };
      console.error("[MLFB] callerInfo:", JSON.stringify(callerInfo));

      let result;
      try {
        const socket = await ensureAppRunning();
        console.error("[MLFB] IPC socket connected, sending request...");
        result = await requestFeedbackViaIpc(socket, projectDir, summary, request_name, checkedRequestType, callerInfo, questions);
      } catch (ipcErr) {
        console.error("[MLFB] IPC failed:", ipcErr.message);
        throw new Error(`MLFB persistent IPC failed: ${ipcErr.message}. Please start or restart the My Last Feedback app and try again.`);
      }

      const content = [];

      const feedbackText = result.interactive_feedback || "";
      if (feedbackText) {
        content.push({ type: "text", text: feedbackText });
      }

      const images = result.images || [];
      for (const img of images) {
        if (img && typeof img === "object" && img.data) {
          content.push({
            type: "image",
            data: img.data,
            mimeType: img.type || "image/png",
          });
        } else if (typeof img === "string" && existsSync(img)) {
          try {
            const imgBytes = readFileSync(img);
            const ext = img.split(".").pop()?.toLowerCase() || "png";
            content.push({
              type: "image",
              data: imgBytes.toString("base64"),
              mimeType: MIME_BY_EXT[ext] || "image/png",
            });
          } catch {}
        }
      }

      if (content.length === 0) {
        content.push({ type: "text", text: "(No feedback provided)" });
      }

      return { content };
    }
  );
}
