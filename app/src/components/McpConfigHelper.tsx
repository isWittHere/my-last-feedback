import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Icon } from "./Icons";
import { SettingsSegmentedControl } from "./SettingsSegmentedControl";

function MonoIcon({ path, size = 16 }: { path: string; size?: number }) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      height={size}
      width={size}
      viewBox="0 0 24 24"
      style={{ flex: "none", lineHeight: 1 }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={path} />
    </svg>
  );
}

const CURSOR_PATH = "M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z";

const CLINE_PATH = "M17.035 3.991c2.75 0 4.98 2.24 4.98 5.003v1.667l1.45 2.896a1.01 1.01 0 01-.002.909l-1.448 2.864v1.668c0 2.762-2.23 5.002-4.98 5.002H7.074c-2.751 0-4.98-2.24-4.98-5.002V17.33l-1.48-2.855a1.01 1.01 0 01-.003-.927l1.482-2.887V8.994c0-2.763 2.23-5.003 4.98-5.003h9.962zM8.265 9.6a2.274 2.274 0 00-2.274 2.274v4.042a2.274 2.274 0 004.547 0v-4.042A2.274 2.274 0 008.265 9.6zm7.326 0a2.274 2.274 0 00-2.274 2.274v4.042a2.274 2.274 0 104.548 0v-4.042A2.274 2.274 0 0015.59 9.6zM12.054 5.558a2.779 2.779 0 100-5.558 2.779 2.779 0 000 5.558z";

const CODEX_PATH = "M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z";

const VCODE_PATH = "M23.15 2.587L18.21.21a1.49 1.49 0 00-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 00-1.276.057L.327 7.261A1 1 0 00.326 8.74L3.899 12 .326 15.26a1 1 0 00.001 1.479L1.65 17.94a.999.999 0 001.276.057l4.12-3.128 9.46 8.63a1.49 1.49 0 001.704.29l4.942-2.377A1.5 1.5 0 0024 20.06V3.939a1.5 1.5 0 00-.85-1.352zm-5.146 14.279L11.41 12l6.594-4.866v9.732z";

type Client = "cursor" | "vscode" | "cline" | "codex";
type Format = "json" | "args";

function generateConfig(client: Client, format: Format, serverPath: string): string {
  const escaped = serverPath.replace(/\\/g, "/");

  if (client === "codex") {
    return [
      "[mcp_servers.\"my-last-feedback\"]",
      "type = \"stdio\"",
      "command = \"node\"",
      `args = ["${escaped}"]`,
      "tool_timeout_sec = 64800",
      "enabled = true",
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

function clientIcon(c: Client) {
  switch (c) {
    case "cursor": return <MonoIcon path={CURSOR_PATH} size={14} />;
    case "vscode": return <MonoIcon path={VCODE_PATH} size={14} />;
    case "cline": return <MonoIcon path={CLINE_PATH} size={14} />;
    case "codex": return <MonoIcon path={CODEX_PATH} size={14} />;
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
          options={(["cursor", "vscode", "cline", "codex"] as Client[]).map((c) => ({ id: c, label: clientLabel(c), icon: clientIcon(c) }))}
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
