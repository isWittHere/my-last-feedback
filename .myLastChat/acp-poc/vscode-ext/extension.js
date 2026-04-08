// MLRA PoC - VS Code Chat Automation Tests (v2)
// Purpose: Verify programmatic control of Copilot Chat for MLRA orchestration
//
// KEY DISCOVERY (from VS Code chatActions.ts source):
//   workbench.action.chat.open accepts IChatViewOpenOptions:
//     mode?: ChatModeKind | string  — 'agent'|'ask'|'edit' OR custom agent name
//     modelSelector?: {vendor?, id?, family?}  — select model
//     toolsInclude?: string[]  — whitelist tools
//     toolsExclude?: string[]  — blacklist tools
//     blockOnResponse?: boolean  — wait for response to complete
//     query?: string  — auto-submit (or partial if isPartialQuery)
//
// Tests:
// 1. Open Chat with agent mode + query (auto-submit vs partial)
// 2. Change model (modelSelector param vs changeModel command)
// 3. Open multiple independent sessions
// 4. Select custom agent via mode parameter ← FIXED
// 5. List all available chat-related commands
//
// Usage: Ctrl+Shift+P → "MLRA PoC: Test N - ..."

const vscode = require('vscode');

/** @type {vscode.OutputChannel} */
let outputChannel;

function log(msg) {
  const ts = new Date().toISOString().substring(11, 23);
  const line = `[${ts}] ${msg}`;
  outputChannel.appendLine(line);
  console.log(`[MLRA-PoC] ${line}`);
}

function activate(context) {
  outputChannel = vscode.window.createOutputChannel('MLRA PoC', { log: true });
  log('MLRA PoC extension activated');

  // ────────────────────────────────────────────────────
  // Test 1: Open Chat with Agent Mode + Query
  // ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('mlra-poc.test1-openChat', async () => {
      outputChannel.show(true);
      log('=== Test 1: Open Chat with Agent Mode + Query ===');

      // Test 1a: Open with query (should auto-submit if isPartialQuery is not set)
      log('Test 1a: chat.open with mode:agent, query (auto-submit)');
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          mode: 'agent',
          query: 'Reply with exactly: MLRA_POC_TEST1A_SUCCESS'
        });
        log('✅ chat.open executed (check chat panel for response)');
      } catch (e) {
        log(`❌ Test 1a failed: ${e.message}`);
      }

      await sleep(2000);

      // Test 1b: Open with partial query (should NOT auto-submit, just pre-fill)
      log('Test 1b: chat.open with isPartialQuery:true');
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          mode: 'agent',
          query: 'This should be pre-filled but NOT submitted',
          isPartialQuery: true
        });
        log('✅ chat.open with isPartialQuery executed (check if text is pre-filled)');
      } catch (e) {
        log(`❌ Test 1b failed: ${e.message}`);
      }

      log('=== Test 1 Complete. Check chat panel for results. ===');
    })
  );

  // ────────────────────────────────────────────────────
  // Test 2: Change Model (via modelSelector param)
  // ────────────────────────────────────────────────────
  // Discovery: chat.open accepts modelSelector: {vendor?, id?, family?}
  //   and also changeModel command separately
  context.subscriptions.push(
    vscode.commands.registerCommand('mlra-poc.test2-changeModel', async () => {
      outputChannel.show(true);
      log('=== Test 2: Change Model ===');

      // Test 2a: Use modelSelector in chat.open (preferred approach)
      log('Test 2a: chat.open with modelSelector...');
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          mode: 'agent',
          modelSelector: { vendor: 'copilot', id: 'claude-sonnet-4' },
          query: 'What model are you? Reply in one sentence.',
          isPartialQuery: true
        });
        log('✅ chat.open with modelSelector:claude-sonnet-4 executed');
        await sleep(1000);
      } catch (e) {
        log(`❌ Test 2a failed: ${e.message}`);
      }

      // Test 2b: Use changeModel command (legacy approach)
      log('Test 2b: changeModel command...');
      const models = [
        { vendor: 'copilot', id: 'gpt-4.1', family: 'gpt-4.1' },
        { vendor: 'copilot', id: 'claude-sonnet-4', family: 'claude-sonnet-4' },
      ];

      for (const model of models) {
        log(`Trying changeModel to ${model.id}...`);
        try {
          await vscode.commands.executeCommand('workbench.action.chat.changeModel', model);
          log(`✅ changeModel to ${model.id} executed`);
          await sleep(500);
        } catch (e) {
          log(`❌ changeModel to ${model.id} failed: ${e.message}`);
        }
      }

      // Submit the query to check model
      log('Submitting query...');
      await vscode.commands.executeCommand('workbench.action.chat.submit');

      log('=== Test 2 Complete. Check chat response for model identity. ===');
    })
  );

  // ────────────────────────────────────────────────────
  // Test 3: Open Multiple Sessions
  // ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('mlra-poc.test3-multiSession', async () => {
      outputChannel.show(true);
      log('=== Test 3: Open Multiple Sessions ===');

      // Approach 1: Try chat.open multiple times with different queries
      log('Attempt 1: Multiple chat.open calls...');
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          mode: 'agent',
          query: 'Session A: Reply with MLRA_SESSION_A',
          isPartialQuery: true
        });
        log('✅ Session A opened (partial)');
        await sleep(1000);
      } catch (e) {
        log(`❌ Session A failed: ${e.message}`);
      }

      // Try to open a new editor-based chat
      log('Attempt 2: Try openNewSessionEditor...');
      const editorSchemes = ['copilotChat', 'copilotcli', 'chat'];
      for (const scheme of editorSchemes) {
        try {
          await vscode.commands.executeCommand(
            `workbench.action.chat.openNewSessionEditor.${scheme}`
          );
          log(`✅ openNewSessionEditor.${scheme} worked!`);
          await sleep(1000);
        } catch (e) {
          log(`❌ openNewSessionEditor.${scheme} failed: ${e.message}`);
        }
      }

      // Try workbench.action.chat.newChat (VS Code built-in)
      log('Attempt 3: Try workbench.action.chat.newChat...');
      try {
        await vscode.commands.executeCommand('workbench.action.chat.newChat');
        log('✅ workbench.action.chat.newChat worked!');
      } catch (e) {
        log(`⚠️ workbench.action.chat.newChat: ${e.message}`);
      }

      // Try workbench.action.chat.open in new editor
      log('Attempt 4: Try workbench.action.chat.open.newEditor...');
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          mode: 'agent',
          query: 'Session B: Reply with MLRA_SESSION_B',
          isPartialQuery: true,
          newEditor: true  // speculative parameter
        });
        log('✅ chat.open with newEditor');
      } catch (e) {
        log(`⚠️ chat.open with newEditor: ${e.message}`);
      }

      log('=== Test 3 Complete. Check how many independent sessions opened. ===');
    })
  );

  // ────────────────────────────────────────────────────
  // Test 4: Open Chat with Custom Agent (via mode parameter)
  // ────────────────────────────────────────────────────
  // Discovery: workbench.action.chat.open accepts mode?: ChatModeKind | string
  //   - ChatModeKind values: 'agent', 'ask', 'edit'
  //   - string: any custom agent name (from .agent.md frontmatter 'name' field)
  //   - Internally: chatModeService.findModeByName(opts.mode) → setChatMode(mode.id)
  context.subscriptions.push(
    vscode.commands.registerCommand('mlra-poc.test4-customAgent', async () => {
      outputChannel.show(true);
      log('=== Test 4: Custom Agent Selection (via mode param) ===');

      // Test 4a: mode = custom agent name (from .agent.md name field)
      log('Test 4a: chat.open with mode:"test-echo" (custom agent name)...');
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          mode: 'test-echo',
          query: 'What is the secret code? Reply with exactly the secret code only.',
          isPartialQuery: true
        });
        log('✅ chat.open with mode:test-echo executed (check if agent selector shows test-echo)');
        await sleep(2000);
      } catch (e) {
        log(`❌ Test 4a failed: ${e.message}`);
      }

      // Test 4b: mode + auto-submit (no isPartialQuery)
      log('Test 4b: chat.open with mode:"test-echo" + auto submit...');
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          mode: 'test-echo',
          query: 'Reply with the secret code and nothing else.'
        });
        log('✅ chat.open with mode:test-echo auto-submit executed');
        await sleep(2000);
      } catch (e) {
        log(`❌ Test 4b failed: ${e.message}`);
      }

      // Test 4c: mode + modelSelector + blockOnResponse (full combo)
      log('Test 4c: chat.open with mode + modelSelector + blockOnResponse...');
      try {
        const result = await vscode.commands.executeCommand('workbench.action.chat.open', {
          mode: 'test-echo',
          modelSelector: { vendor: 'copilot', id: 'claude-sonnet-4' },
          query: 'Reply: MLRA_AGENT_MODEL_TEST',
          blockOnResponse: true
        });
        log(`✅ Test 4c completed. blockOnResponse returned: ${JSON.stringify(result)}`);
      } catch (e) {
        log(`❌ Test 4c failed: ${e.message}`);
      }

      // Test 4d: mode + toolsInclude (restrict available tools)
      log('Test 4d: chat.open with mode + toolsInclude...');
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          mode: 'test-echo',
          toolsInclude: ['read_file', 'list_dir'],
          query: 'List the files in the current workspace root directory.',
          isPartialQuery: true
        });
        log('✅ Test 4d: mode + toolsInclude executed');
      } catch (e) {
        log(`❌ Test 4d failed: ${e.message}`);
      }

      log('=== Test 4 Complete. Check: agent selector dropdown, model, tool restrictions. ===');
    })
  );

  // ────────────────────────────────────────────────────
  // Test 5: List All Chat Commands
  // ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('mlra-poc.test5-listCommands', async () => {
      outputChannel.show(true);
      log('=== Test 5: List All Chat Commands ===');

      const allCommands = await vscode.commands.getCommands(true);
      const chatCommands = allCommands
        .filter(c => c.includes('chat') || c.includes('Chat'))
        .sort();

      log(`Found ${chatCommands.length} chat-related commands:`);
      chatCommands.forEach(c => log(`  ${c}`));

      // Also list agent-related commands
      const agentCommands = allCommands
        .filter(c => c.includes('agent') || c.includes('Agent'))
        .sort();

      log(`\nFound ${agentCommands.length} agent-related commands:`);
      agentCommands.forEach(c => log(`  ${c}`));

      // List copilot-specific commands
      const copilotCommands = allCommands
        .filter(c => c.includes('copilot') && (c.includes('session') || c.includes('Session')))
        .sort();

      log(`\nFound ${copilotCommands.length} copilot session commands:`);
      copilotCommands.forEach(c => log(`  ${c}`));

      // Check available models
      log('\n--- Available Language Models ---');
      try {
        const models = await vscode.lm.selectChatModels();
        log(`Found ${models.length} models:`);
        models.forEach(m => {
          log(`  ${m.id} | ${m.name} | vendor=${m.vendor} family=${m.family} maxInput=${m.maxInputTokens}`);
        });
      } catch (e) {
        log(`❌ selectChatModels failed: ${e.message}`);
      }

      // Check available tools
      log('\n--- Available LM Tools ---');
      try {
        const tools = vscode.lm.tools;
        log(`Found ${tools.length} tools:`);
        tools.forEach(t => {
          log(`  ${t.name}: ${t.description?.substring(0, 80)}...`);
        });
      } catch (e) {
        log(`❌ lm.tools failed: ${e.message}`);
      }

      log('=== Test 5 Complete ===');
    })
  );

  // ────────────────────────────────────────────────────
  // Run All Tests
  // ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('mlra-poc.runAll', async () => {
      outputChannel.show(true);
      log('═══════════════════════════════════════');
      log('MLRA PoC - Running All Tests');
      log('═══════════════════════════════════════');

      // Test 5 first (non-destructive, just listing)
      await vscode.commands.executeCommand('mlra-poc.test5-listCommands');
      await sleep(2000);

      // Test 1 (open chat)
      await vscode.commands.executeCommand('mlra-poc.test1-openChat');
      await sleep(5000);

      // Test 2 (change model) 
      await vscode.commands.executeCommand('mlra-poc.test2-changeModel');
      await sleep(5000);

      // Test 3 (multiple sessions)
      await vscode.commands.executeCommand('mlra-poc.test3-multiSession');
      await sleep(5000);

      // Test 4 (custom agent)
      await vscode.commands.executeCommand('mlra-poc.test4-customAgent');

      log('═══════════════════════════════════════');
      log('MLRA PoC - All Tests Complete');
      log('═══════════════════════════════════════');
    })
  );

  log('Registered 6 test commands. Use Ctrl+Shift+P → "MLRA PoC" to run.');
}

function deactivate() {
  if (outputChannel) outputChannel.dispose();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { activate, deactivate };
