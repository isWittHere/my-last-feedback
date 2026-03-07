import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

type Client = "cursor" | "vscode" | "cline";
type Format = "json" | "args";

function generateConfig(client: Client, format: Format, serverPath: string): string {
  const escaped = serverPath.replace(/\\/g, "/");

  if (format === "args") {
    return `node ${escaped}`;
  }

  // JSON format per client
  if (client === "cursor") {
    return JSON.stringify({
      mcpServers: {
        "my-last-feedback": {
          command: "node",
          args: [escaped],
          timeout: 600,
          autoApprove: ["interactive_feedback"],
        },
      },
    }, null, 2);
  }
  if (client === "vscode") {
    return JSON.stringify({
      servers: {
        "my-last-feedback": {
          command: "node",
          args: [escaped],
          timeout: 600,
        },
      },
    }, null, 2);
  }
  // cline / generic
  return JSON.stringify({
    mcpServers: {
      "my-last-feedback": {
        command: "node",
        args: [escaped],
        timeout: 600,
      },
    },
  }, null, 2);
}

function clientLabel(c: Client): string {
  switch (c) {
    case "cursor": return "Cursor";
    case "vscode": return "VS Code";
    case "cline": return "Cline";
  }
}

function configFilePath(c: Client): string {
  switch (c) {
    case "cursor": return "~/.cursor/mcp.json";
    case "vscode": return ".vscode/mcp.json";
    case "cline": return "MCP Settings";
  }
}

export function McpConfigHelper({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const [serverPath, setServerPath] = useState("");
  const [client, setClient] = useState<Client>("cursor");
  const [format, setFormat] = useState<Format>("json");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    invoke<string>("get_server_path").then(setServerPath).catch(() => {});
  }, []);

  const config = serverPath ? generateConfig(client, format, serverPath) : "";

  const handleCopy = useCallback(() => {
    if (!config) return;
    writeText(config)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }, [config]);

  return (
    <div className={`mcp-config${compact ? " mcp-config-compact" : ""}`}>
      <div className="mcp-config-header">
        <span className="mcp-config-title">{t("mcpConfig.title", "MCP Configuration")}</span>
      </div>

      {/* Client selector */}
      <div className="mcp-config-row">
        <span className="mcp-config-label">{t("mcpConfig.client", "Client")}</span>
        <div className="settings-btn-group">
          {(["cursor", "vscode", "cline"] as Client[]).map((c) => (
            <button
              key={c}
              className={`settings-btn-option${client === c ? " active" : ""}`}
              onClick={() => setClient(c)}
            >
              {clientLabel(c)}
            </button>
          ))}
        </div>
      </div>

      {/* Format selector */}
      <div className="mcp-config-row">
        <span className="mcp-config-label">{t("mcpConfig.format", "Format")}</span>
        <div className="settings-btn-group">
          <button
            className={`settings-btn-option${format === "json" ? " active" : ""}`}
            onClick={() => setFormat("json")}
          >
            JSON
          </button>
          <button
            className={`settings-btn-option${format === "args" ? " active" : ""}`}
            onClick={() => setFormat("args")}
          >
            {t("mcpConfig.cmdArgs", "Cmd+Args")}
          </button>
        </div>
      </div>

      {/* Config file hint */}
      {format === "json" && (
        <div className="mcp-config-hint">
          {t("mcpConfig.addTo", "Add to")} <code>{configFilePath(client)}</code>
        </div>
      )}

      {/* Config code block */}
      <div className="mcp-config-code-wrap">
        <pre className="mcp-config-code">{config}</pre>
        <button
          className="mcp-config-copy"
          onClick={handleCopy}
          title={t("mcpConfig.copy", "Copy")}
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
