import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Icon } from "./Icons";
import { SettingsSegmentedControl } from "./SettingsSegmentedControl";

type Client = "cursor" | "vscode" | "cline" | "codex";
type Format = "json" | "args";

function generateConfig(client: Client, format: Format, serverPath: string): string {
  const escaped = serverPath.replace(/\\/g, "/");

  if (client === "codex") {
    return [
      "[mcp_servers.\"my-last-feedback\"]",
      "type = \"sse\"",
      "url = \"http://127.0.0.1:3838/mcp\"",
      "tool_timeout_sec = 64800",
      "",
      "",
      "[mcp_servers.\"my-last-feedback\".tools.interactive_feedback]",
      "approval_mode = \"approve\"",
      "",
    ].join("\n");
  }

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
    case "codex": return "Codex";
  }
}

function configFilePath(c: Client): string {
  switch (c) {
    case "cursor": return "~/.cursor/mcp.json";
    case "vscode": return ".vscode/mcp.json";
    case "cline": return "MCP Settings";
    case "codex": return "~/.codex/config.toml";
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
        <SettingsSegmentedControl
          ariaLabel={t("mcpConfig.client", "Client")}
          value={client}
          onChange={(value) => setClient(value as Client)}
          options={(["cursor", "vscode", "cline", "codex"] as Client[]).map((c) => ({ id: c, label: clientLabel(c) }))}
        />
      </div>

      {/* Format selector */}
      {client !== "codex" && (
        <div className="mcp-config-row">
          <span className="mcp-config-label">{t("mcpConfig.format", "Format")}</span>
          <SettingsSegmentedControl
            ariaLabel={t("mcpConfig.format", "Format")}
            value={format}
            onChange={(value) => setFormat(value as Format)}
            options={[
              { id: "json", label: "JSON" },
              { id: "args", label: t("mcpConfig.cmdArgs", "Cmd+Args") },
            ]}
          />
        </div>
      )}

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
            <Icon name="check" size={14} />
          ) : (
            <Icon name="copy" size={14} />
          )}
        </button>
      </div>
    </div>
  );
}
