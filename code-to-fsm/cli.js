#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const CodeToFSMAnalyzer = require('./analyzer');

const program = new Command();

program
  .name('code-to-fsm')
  .description('Analyze code to extract state machines and generate Mermaid/XState diagrams')
  .version('1.0.0');

program
  .command('analyze')
  .description('Analyze a codebase to extract state machine patterns using Claude CLI')
  .argument('<workspace>', 'Path to the workspace/project directory')
  .option('-o, --output <dir>', 'Output directory for generated files', './fsm-output')
  .option('-f, --files <files...>', 'Specific files to analyze (relative to workspace)')
  .option('-p, --patterns <patterns...>', 'File patterns to match (e.g., "*.py" "*.js")')
  .option('--focus <area>', 'Focus area or component to analyze (e.g., "robot controller")')
  .option('--to-xstate', 'Also generate XState machine code')
  .option('--xstate-format <format>', 'XState output format: esm, cjs, json', 'esm')
  .option('--machine-id <id>', 'XState machine ID', 'extractedMachine')
  .action(async (workspace, options) => {
    try {
      const workspacePath = path.resolve(workspace);
      
      if (!fs.existsSync(workspacePath)) {
        console.error(`❌ Error: Workspace not found: ${workspace}`);
        process.exit(1);
      }

      console.log('🚀 Starting code analysis...');
      console.log(`📂 Workspace: ${workspacePath}`);
      if (options.focus) {
        console.log(`🎯 Focus: ${options.focus}`);
      }

      const analyzerOptions = {};
      if (options.patterns) {
        analyzerOptions.filePatterns = options.patterns;
      }

      const analyzer = new CodeToFSMAnalyzer(workspacePath, analyzerOptions);
      const results = await analyzer.analyze(options.focus, options.files);

      // Save results
      const outputDir = path.resolve(options.output);
      const savedFiles = analyzer.saveResults(results, outputDir);

      // Optionally convert to XState
      if (options.toXstate) {
        console.log('\n🔄 Converting to XState...');
        
        // Load the mermaid-to-xstate parser
        const MermaidToXStateParser = require('../mermaid-to-xstate/parser');
        const parser = new MermaidToXStateParser();
        
        const machine = parser.parse(results.mermaidDiagram);
        machine.id = options.machineId;
        
        const xstateCode = parser.generateXStateCode(machine, options.xstateFormat);
        const xstatePath = path.join(outputDir, `state-machine.${options.xstateFormat === 'json' ? 'json' : 'js'}`);
        
        fs.writeFileSync(xstatePath, xstateCode, 'utf-8');
        console.log(`💾 XState machine saved to: ${xstatePath}`);
      }

      console.log('\n✨ Done! Your state machine has been extracted.');
      console.log(`\n📊 View your Mermaid diagram: ${savedFiles.mermaidPath}`);
      console.log(`📄 Read full analysis: ${savedFiles.analysisPath}`);
      
      if (options.toXstate) {
        console.log(`\n💡 Next steps:`);
        console.log(`   1. Review the generated state machine`);
        console.log(`   2. Refactor your code to use XState`);
        console.log(`   3. Use XState Inspector for debugging: https://stately.ai/viz`);
      }

    } catch (error) {
      console.error('❌ Error:', error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('interactive')
  .description('Interactive mode - chat with Claude about your state machine using Claude CLI')
  .argument('<workspace>', 'Path to the workspace/project directory')
  .option('-f, --files <files...>', 'Specific files to analyze')
  .action(async (workspace, options) => {
    console.log('🤖 Interactive mode - Chat with Claude about your state machine');
    console.log('   Type your questions or "exit" to quit\n');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'You: '
    });

    const workspacePath = path.resolve(workspace);
    const analyzer = new CodeToFSMAnalyzer(workspacePath);

    // Read files once
    console.log('📖 Reading files...');
    const filePaths = options.files
      ? options.files.map(f => path.resolve(workspacePath, f))
      : await analyzer.scanWorkspace();
    const files = analyzer.readFiles(filePaths);

    const conversationHistory = [];
    
    // Initial context message
    const contextMessage = `You are helping analyze code to understand state machine patterns. 

Here are the relevant files:

${files.map(f => `File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\`\n`).join('\n---\n\n')}

Please help the user understand the state machine logic in this code.`;

    conversationHistory.push({ role: "user", content: contextMessage });
    
    console.log('✅ Ready! Ask me anything about the state machine in your code.\n');

    rl.prompt();

    rl.on('line', async (line) => {
      const input = line.trim();
      
      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        console.log('👋 Goodbye!');
        rl.close();
        return;
      }

      if (!input) {
        rl.prompt();
        return;
      }

      conversationHistory.push({ role: "user", content: input });

      try {
        console.log('\n🤔 Claude is thinking...\n');

        // Use Claude CLI for interactive chat
        const { spawn } = require('child_process');
        const prompt = conversationHistory.map(msg =>
          msg.role === 'user' ? `User: ${msg.content}` : `Assistant: ${msg.content}`
        ).join('\n\n');

        const assistantMessage = await new Promise((resolve, reject) => {
          const isWindows = process.platform === 'win32';
          const claude = spawn(isWindows ? 'claude.cmd' : 'claude', ['--print', prompt], {
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: isWindows
          });
          let output = '';

          claude.stdout.on('data', (data) => { output += data.toString(); });
          claude.on('close', (code) => {
            if (code !== 0) reject(new Error(`Claude CLI exited with code ${code}`));
            else resolve(output.trim());
          });
          claude.on('error', (err) => reject(new Error(`Failed to start Claude CLI: ${err.message}. Make sure 'claude' is installed and in your PATH.`)));
        });

        conversationHistory.push({ role: "assistant", content: assistantMessage });
        console.log(`Claude: ${assistantMessage}\n`);
      } catch (error) {
        console.error('❌ Error:', error.message);
      }

      rl.prompt();
    });

    rl.on('close', () => {
      process.exit(0);
    });
  });

program.parse();
