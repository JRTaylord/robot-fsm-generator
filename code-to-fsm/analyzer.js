/**
 * Code to FSM Analyzer
 * Uses Claude to analyze code and extract state machine patterns
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const { spawn } = require('child_process');

class CodeToFSMAnalyzer {
  constructor(workspacePath, options = {}) {
    this.workspacePath = workspacePath;
    this.options = {
      filePatterns: options.filePatterns || ['**/*.py', '**/*.js', '**/*.ts', '**/*.cpp', '**/*.c', '**/*.java'],
      excludePatterns: options.excludePatterns || ['**/node_modules/**', '**/venv/**', '**/build/**', '**/.git/**'],
      maxFileSize: options.maxFileSize || 100000 // 100KB max per file
    };
  }

  /**
   * Scan the workspace for relevant files
   */
  async scanWorkspace() {
    const files = [];
    
    for (const pattern of this.options.filePatterns) {
      const matches = await glob(pattern, {
        cwd: this.workspacePath,
        ignore: this.options.excludePatterns,
        absolute: true
      });
      files.push(...matches);
    }

    // Filter by file size
    const validFiles = [];
    for (const file of files) {
      const stats = fs.statSync(file);
      if (stats.size <= this.options.maxFileSize) {
        validFiles.push(file);
      }
    }

    return validFiles;
  }

  /**
   * Read and prepare file contents for analysis
   */
  readFiles(filePaths) {
    const fileContents = [];
    
    for (const filePath of filePaths) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relativePath = path.relative(this.workspacePath, filePath);
        fileContents.push({
          path: relativePath,
          content: content
        });
      } catch (error) {
        console.warn(`Warning: Could not read ${filePath}: ${error.message}`);
      }
    }

    return fileContents;
  }

  /**
   * Create analysis prompt for Claude
   */
  createAnalysisPrompt(files, focusArea = null) {
    const filesSummary = files.map(f => 
      `File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\`\n`
    ).join('\n---\n\n');

    let prompt = `You are analyzing a codebase to extract state machine patterns. 

Here are the relevant files from the project:

${filesSummary}

Your task is to:
1. Identify any state machine logic, state transitions, or finite state machine patterns
2. Extract the states, events/transitions, and their relationships
3. Generate a Mermaid stateDiagram-v2 that represents this state machine

`;

    if (focusArea) {
      prompt += `\nFocus specifically on: ${focusArea}\n`;
    }

    prompt += `
Look for patterns like:
- Explicit state variables or enums (e.g., state = "IDLE", State.RUNNING)
- State transition functions (e.g., transition_to(), setState())
- Switch/case statements on state variables
- If/else chains checking state
- Event handlers that change state
- Robot control states (idle, moving, stopped, error, etc.)

Output format:
1. First, provide a brief explanation of what state machine you found
2. Then output ONLY the Mermaid diagram code, starting with "stateDiagram-v2"
3. Use clear, descriptive state names
4. Label transitions with the events/conditions that trigger them

Example output format:
I found a robot control state machine with 4 states...

stateDiagram-v2
    [*] --> Idle
    Idle --> Moving: start_command
    Moving --> Stopped: stop_command
    Moving --> Error: sensor_fault
    Error --> Idle: reset
    Stopped --> [*]
`;

    return prompt;
  }

  /**
   * Call Claude CLI to analyze the code
   */
  async analyzeWithClaude(prompt) {
    console.log('🖥️  Using Claude CLI...');

    // Write prompt to temp file to avoid command line length limits
    const os = require('os');
    const tmpFile = path.join(os.tmpdir(), `claude-prompt-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, prompt, 'utf-8');

    return new Promise((resolve, reject) => {
      // On Windows, we need to use 'claude.cmd' or set shell: true
      const isWindows = process.platform === 'win32';

      // Use shell redirection to read from temp file
      const command = isWindows
        ? `claude.cmd --print < "${tmpFile}"`
        : `claude --print < "${tmpFile}"`;

      const claude = spawn(command, [], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });

      let output = '';
      let errorOutput = '';

      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      claude.on('close', (code) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tmpFile);
        } catch (err) {
          // Ignore cleanup errors
        }

        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${errorOutput}`));
        } else {
          resolve(output.trim());
        }
      });

      claude.on('error', (err) => {
        // Clean up temp file on error
        try {
          fs.unlinkSync(tmpFile);
        } catch (e) {
          // Ignore cleanup errors
        }
        reject(new Error(`Failed to start Claude CLI: ${err.message}. Make sure 'claude' is installed and in your PATH.`));
      });
    });
  }

  /**
   * Extract Mermaid diagram from Claude's response
   */
  extractMermaidDiagram(response) {
    // Look for stateDiagram-v2 block
    const diagramMatch = response.match(/stateDiagram-v2[\s\S]*?(?=\n\n|\n```|$)/);
    
    if (diagramMatch) {
      return diagramMatch[0].trim();
    }

    // Fallback: look for anything between ```mermaid and ```
    const codeBlockMatch = response.match(/```mermaid\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Last resort: return the whole response if it looks like a diagram
    if (response.includes('stateDiagram-v2')) {
      return response;
    }

    throw new Error('Could not extract Mermaid diagram from response');
  }

  /**
   * Main analysis workflow
   */
  async analyze(focusArea = null, selectedFiles = null) {
    console.log('🔍 Scanning workspace...');
    
    let filePaths;
    if (selectedFiles) {
      filePaths = selectedFiles.map(f => path.resolve(this.workspacePath, f));
    } else {
      filePaths = await this.scanWorkspace();
    }
    
    console.log(`📁 Found ${filePaths.length} files to analyze`);

    if (filePaths.length === 0) {
      throw new Error('No files found to analyze');
    }

    console.log('📖 Reading file contents...');
    const files = this.readFiles(filePaths);
    
    console.log('🤖 Calling Claude to analyze state machine patterns...');
    const prompt = this.createAnalysisPrompt(files, focusArea);
    const response = await this.analyzeWithClaude(prompt);
    
    console.log('✅ Analysis complete!');
    console.log('\n' + '='.repeat(60));
    console.log('CLAUDE\'S ANALYSIS:');
    console.log('='.repeat(60) + '\n');
    console.log(response);
    console.log('\n' + '='.repeat(60) + '\n');

    const mermaidDiagram = this.extractMermaidDiagram(response);
    
    return {
      analysis: response,
      mermaidDiagram: mermaidDiagram,
      filesAnalyzed: files.map(f => f.path)
    };
  }

  /**
   * Save results to files
   */
  saveResults(results, outputDir) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save Mermaid diagram
    const mermaidPath = path.join(outputDir, 'state-machine.mmd');
    fs.writeFileSync(mermaidPath, results.mermaidDiagram, 'utf-8');
    console.log(`💾 Mermaid diagram saved to: ${mermaidPath}`);

    // Save full analysis
    const analysisPath = path.join(outputDir, 'analysis.txt');
    const fullAnalysis = `Files Analyzed:\n${results.filesAnalyzed.join('\n')}\n\n` +
                        `Analysis:\n${results.analysis}`;
    fs.writeFileSync(analysisPath, fullAnalysis, 'utf-8');
    console.log(`💾 Full analysis saved to: ${analysisPath}`);

    return {
      mermaidPath,
      analysisPath
    };
  }
}

module.exports = CodeToFSMAnalyzer;
