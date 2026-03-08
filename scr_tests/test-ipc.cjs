const net = require('net');
const crypto = require('crypto');

// ── Alias generation (mirrors server.mjs logic) ──
function generateAlias(baseName, agentName, clientName) {
  const key = `${baseName}:${agentName || ''}:${clientName || ''}`;
  const hash = crypto.createHash('md5').update(key).digest('hex');
  return hash.slice(0, 4).toUpperCase();
}

// ── IPC helpers ──
function sendNoWait(msg) {
  return new Promise((resolve, reject) => {
    const c = net.createConnection(19850, '127.0.0.1', () => {
      c.write(JSON.stringify(msg) + '\n');
      console.log('Sent:', msg.session_id, msg.caller?.alias ? `(alias: ${msg.caller.alias})` : '');
      resolve();
    });
    c.on('error', reject);
  });
}

(async () => {
  try {
    // ── Group 1: Same workspace, different agents (alias differentiates them) ──
    // These simulate two agents working in the same "Copilot" workspace
    const aliasAlpha = generateAlias('Copilot', 'agent-alpha', 'vscode');
    const aliasBeta = generateAlias('Copilot', 'agent-beta', 'vscode');
    console.log(`\n[Group 1] Same workspace "Copilot", two agents: ${aliasAlpha} vs ${aliasBeta}`);

    await sendNoWait({
      type: 'feedback_request',
      session_id: 'sess-alias-1a',
      caller: { name: 'Copilot', version: '1.0', alias: aliasAlpha },
      payload: {
        summary: `## Agent ${aliasAlpha}: Button Refactor\n\n1. Hide Continue button\n2. Same line layout\n3. Submit right-aligned`,
        request_name: 'Button refactor',
        project_directory: 'e:/Dev/my-last-feedback'
      }
    });

    await sendNoWait({
      type: 'feedback_request',
      session_id: 'sess-alias-1b',
      caller: { name: 'Copilot', version: '1.0', alias: aliasBeta },
      payload: {
        summary: `## Agent ${aliasBeta}: Scrollbar Fix\n\nScrollbar thumbs match caller color via CSS \`color-mix()\`.\n\n\`\`\`css\n.caller-panel ::-webkit-scrollbar-thumb {\n  background: color-mix(in srgb, var(--caller-color) 40%, transparent);\n}\n\`\`\``,
        request_name: 'Scrollbar color',
        project_directory: 'e:/Dev/my-last-feedback'
      }
    });

    // ── Group 2: Different workspace, same agent name ──
    const aliasCursor = generateAlias('Cursor', 'agent-alpha', 'cursor');
    console.log(`\n[Group 2] Different workspace "Cursor", agent: ${aliasCursor}`);

    await sendNoWait({
      type: 'feedback_request',
      session_id: 'sess-alias-2',
      caller: { name: 'Cursor', version: '2.0', alias: aliasCursor },
      payload: {
        summary: '## Feature: Floating Copy Button\n\nSemi-transparent copy button at bottom-right.\n- Hover to show\n- Copies raw markdown\n- Checkmark after copy',
        request_name: 'Copy button',
        project_directory: 'e:/Dev/my-last-feedback'
      }
    });

    // ── Group 3: Second session from same alias (should merge into same caller tab) ──
    console.log(`\n[Group 3] Second session from same alias ${aliasAlpha} (should merge)`);

    await sendNoWait({
      type: 'feedback_request',
      session_id: 'sess-alias-3',
      caller: { name: 'Copilot', version: '1.0', alias: aliasAlpha },
      payload: {
        summary: `## Agent ${aliasAlpha}: Follow-up Task\n\nRefactoring the sidebar layout based on previous feedback.\n\n- Moved identicon to left\n- Two-line header format\n- Monospace font stack`,
        request_name: 'Sidebar redesign',
        project_directory: 'e:/Dev/my-last-feedback'
      }
    });

    // ── Group 4: Caller with no alias (backward compatibility) ──
    console.log('\n[Group 4] Caller without alias (backward compatibility)');

    await sendNoWait({
      type: 'feedback_request',
      session_id: 'sess-noalias-1',
      caller: { name: 'LegacyClient', version: '0.9' },
      payload: {
        summary: '## Legacy Mode Test\n\nThis caller has no alias field — testing backward compatibility.\nShould still appear as a valid caller tab.',
        request_name: 'Legacy test',
        project_directory: 'e:/Dev/my-last-feedback'
      }
    });

    // ── Group 5: Questions with alias ──
    console.log(`\n[Group 5] Questions from agent ${aliasBeta}`);

    await sendNoWait({
      type: 'feedback_request',
      session_id: 'sess-alias-q1',
      caller: { name: 'Copilot', version: '1.0', alias: aliasBeta },
      payload: {
        summary: '## Architecture Proposal\n\n### Plan A: PostgreSQL + Prisma\nRobust relational DB with type-safe ORM.\n\n### Plan B: SQLite + Drizzle\nLightweight embedded DB for desktop apps.\n\n### Plan C: MongoDB + Mongoose\nDocument store with flexible schema.',
        request_name: 'Architecture decision',
        project_directory: 'e:/Dev/my-last-feedback',
        questions: [
          { label: 'Database choice', options: ['Plan A', 'Plan B', 'Plan C'] },
          { label: 'Need caching?', options: ['Yes', 'No'] },
          { label: 'Cache type', options: ['Redis', 'Local LRU'] },
          { label: 'Additional requirements' }
        ]
      }
    });

    // ── Group 6: Questions from different alias on different workspace ──
    console.log(`\n[Group 6] Questions from Cursor agent ${aliasCursor}`);

    await sendNoWait({
      type: 'feedback_request',
      session_id: 'sess-alias-q2',
      caller: { name: 'Cursor', version: '2.0', alias: aliasCursor },
      payload: {
        summary: '## UI Redesign Options\n\n### Option 1: Minimal Dark\nClean dark theme.\n\n### Option 2: Material Design\nMD3 guidelines.\n\n### Option 3: Glassmorphism\nFrosted glass effects.',
        request_name: 'UI style confirmation',
        project_directory: 'e:/Dev/my-last-feedback',
        questions: [
          { label: 'UI style', options: ['Option 1', 'Option 2', 'Option 3'] },
          { label: 'Use animations?', options: ['Yes', 'No'] },
          { label: 'Color preference' }
        ]
      }
    });

    // ── Group 7: Third distinct alias on same workspace ──
    const aliasGamma = generateAlias('Copilot', 'agent-gamma', 'vscode');
    console.log(`\n[Group 7] Third agent on "Copilot": ${aliasGamma}`);

    await sendNoWait({
      type: 'feedback_request',
      session_id: 'sess-alias-7',
      caller: { name: 'Copilot', version: '1.0', alias: aliasGamma },
      payload: {
        summary: `## Agent ${aliasGamma}: Testing Report\n\nAll 18 unit tests passed.\n\n| Category | Tests | Status |\n|----------|-------|--------|\n| Alias determinism | 2 | ✓ |\n| Format validation | 2 | ✓ |\n| Differentiation | 3 | ✓ |\n| Collision resistance | 1 | ✓ |`,
        request_name: 'Test results',
        project_directory: 'e:/Dev/my-last-feedback'
      }
    });

    console.log(`\n========================================`);
    console.log(`All 8 messages sent:`);
    console.log(`  - 3 distinct aliases on "Copilot": ${aliasAlpha}, ${aliasBeta}, ${aliasGamma}`);
    console.log(`  - 1 alias on "Cursor": ${aliasCursor}`);
    console.log(`  - 1 legacy caller (no alias)`);
    console.log(`  - 2 sessions with questions`);
    console.log(`  - 1 merged session (same alias ${aliasAlpha})`);
    console.log(`========================================\n`);

    setTimeout(() => process.exit(0), 500);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
