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
   * Generate HTML viewer for the diagram
   */
  generateHTMLViewer(mermaidDiagram, outputDir) {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>State Machine Diagram</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 100%;
            margin: 0 auto;
        }
        h1 {
            color: white;
            text-align: center;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .subtitle {
            color: rgba(255,255,255,0.9);
            text-align: center;
            margin-bottom: 30px;
            font-size: 14px;
        }
        .controls {
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            margin-bottom: 20px;
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 10px;
        }
        button {
            padding: 10px 20px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.3s ease;
        }
        button:hover {
            background: #5568d3;
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
        button:active {
            transform: translateY(0);
        }
        #diagram-container {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            overflow: auto;
            transition: transform 0.3s ease;
        }
        .footer {
            text-align: center;
            color: rgba(255,255,255,0.8);
            margin-top: 30px;
            font-size: 12px;
        }
        .zoom-indicator {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 500;
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 State Machine Diagram</h1>
        <p class="subtitle">Generated by FSM Toolkit</p>

        <div class="controls">
            <button onclick="zoomIn()" title="Zoom In">🔍 Zoom In</button>
            <button onclick="zoomOut()" title="Zoom Out">🔎 Zoom Out</button>
            <button onclick="resetZoom()" title="Reset Zoom">↺ Reset</button>
            <button onclick="fitToScreen()" title="Fit to Screen">⛶ Fit Screen</button>
            <button onclick="downloadSVG()" title="Download SVG">💾 Download SVG</button>
            <button onclick="downloadPNG()" title="Download PNG">📷 Download PNG</button>
        </div>

        <div id="diagram-container">
            <div class="mermaid">
${mermaidDiagram}
            </div>
        </div>

        <div class="footer">
            Generated with FSM Toolkit • Powered by Mermaid.js
        </div>
    </div>

    <div id="zoom-indicator" class="zoom-indicator"></div>

    <script>
        mermaid.initialize({
            startOnLoad: true,
            theme: 'default',
            securityLevel: 'loose',
            flowchart: {
                useMaxWidth: false
            }
        });

        let currentZoom = 1;
        const container = document.getElementById('diagram-container');
        const zoomIndicator = document.getElementById('zoom-indicator');

        function showZoomIndicator() {
            zoomIndicator.textContent = Math.round(currentZoom * 100) + '%';
            zoomIndicator.style.display = 'block';
            setTimeout(() => {
                zoomIndicator.style.display = 'none';
            }, 1000);
        }

        function zoomIn() {
            currentZoom = Math.min(3, currentZoom + 0.1);
            applyZoom();
        }

        function zoomOut() {
            currentZoom = Math.max(0.3, currentZoom - 0.1);
            applyZoom();
        }

        function resetZoom() {
            currentZoom = 1;
            applyZoom();
        }

        function fitToScreen() {
            const svg = container.querySelector('svg');
            if (svg) {
                const containerWidth = container.clientWidth;
                const svgWidth = svg.getBBox().width;
                currentZoom = (containerWidth - 60) / svgWidth;
                applyZoom();
            }
        }

        function applyZoom() {
            container.style.transform = \`scale(\${currentZoom})\`;
            container.style.transformOrigin = 'top left';
            showZoomIndicator();
        }

        function downloadSVG() {
            const svg = container.querySelector('svg');
            if (svg) {
                const serializer = new XMLSerializer();
                const svgString = serializer.serializeToString(svg);
                const blob = new Blob([svgString], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'state-machine.svg';
                a.click();
                URL.revokeObjectURL(url);
            }
        }

        function downloadPNG() {
            const svg = container.querySelector('svg');
            if (svg) {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const svgData = new XMLSerializer().serializeToString(svg);
                const img = new Image();

                img.onload = function() {
                    canvas.width = img.width * 2;
                    canvas.height = img.height * 2;
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    canvas.toBlob(function(blob) {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'state-machine.png';
                        a.click();
                        URL.revokeObjectURL(url);
                    });
                };

                img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
            }
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '=') {
                    e.preventDefault();
                    zoomIn();
                } else if (e.key === '-') {
                    e.preventDefault();
                    zoomOut();
                } else if (e.key === '0') {
                    e.preventDefault();
                    resetZoom();
                }
            }
        });

        // Auto-fit on load
        window.addEventListener('load', () => {
            setTimeout(fitToScreen, 500);
        });
    </script>
</body>
</html>`;

    const htmlPath = path.join(outputDir, 'view-diagram.html');
    fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
    return htmlPath;
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

    // Generate HTML viewer
    const htmlPath = this.generateHTMLViewer(results.mermaidDiagram, outputDir);
    console.log(`🌐 HTML viewer saved to: ${htmlPath}`);

    return {
      mermaidPath,
      analysisPath,
      htmlPath
    };
  }
}

module.exports = CodeToFSMAnalyzer;
