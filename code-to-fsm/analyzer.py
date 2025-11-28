"""
Code to FSM Analyzer
Uses Claude to analyze code and extract state machine patterns
"""

import os
import re
import subprocess
import tempfile
from pathlib import Path
from glob import glob as glob_sync


class CodeToFSMAnalyzer:
    def __init__(self, workspace_path, options=None):
        self.workspace_path = workspace_path
        options = options or {}
        self.options = {
            'file_patterns': options.get('file_patterns', [
                '**/*.py', '**/*.js', '**/*.ts', '**/*.cpp', '**/*.c', '**/*.java'
            ]),
            'exclude_patterns': options.get('exclude_patterns', [
                '**/node_modules/**', '**/venv/**', '**/build/**', '**/.git/**',
                '**/__pycache__/**', '**/*.pyc'
            ]),
            'max_file_size': options.get('max_file_size', 100000)  # 100KB max per file
        }

    def scan_workspace(self):
        """Scan the workspace for relevant files"""
        files = []
        workspace = Path(self.workspace_path)

        for pattern in self.options['file_patterns']:
            matches = workspace.glob(pattern)
            for match in matches:
                # Check if file should be excluded
                should_exclude = False
                for exclude_pattern in self.options['exclude_patterns']:
                    exclude_glob = exclude_pattern.replace('**/', '')
                    if exclude_glob in str(match):
                        should_exclude = True
                        break

                if not should_exclude and match.is_file():
                    # Check file size
                    if match.stat().st_size <= self.options['max_file_size']:
                        files.append(str(match))

        return files

    def read_files(self, file_paths):
        """Read and prepare file contents for analysis"""
        file_contents = []

        for file_path in file_paths:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    relative_path = os.path.relpath(file_path, self.workspace_path)
                    file_contents.append({
                        'path': relative_path,
                        'content': content
                    })
            except Exception as error:
                print(f'Warning: Could not read {file_path}: {error}')

        return file_contents

    def create_analysis_prompt(self, files, focus_area=None):
        """Create analysis prompt for Claude"""
        files_summary = '\n---\n\n'.join([
            f'File: {f["path"]}\n```\n{f["content"]}\n```\n'
            for f in files
        ])

        prompt = f"""You are analyzing a codebase to extract state machine patterns.

Here are the relevant files from the project:

{files_summary}

Your task is to:
1. Identify any state machine logic, state transitions, or finite state machine patterns
2. Extract the states, events/transitions, and their relationships
3. Generate a Mermaid stateDiagram-v2 that represents this state machine

"""

        if focus_area:
            prompt += f'\nFocus specifically on: {focus_area}\n'

        prompt += """
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
"""

        return prompt

    def analyze_with_claude(self, prompt):
        """Call Claude CLI to analyze the code"""
        print('🖥️  Using Claude CLI...')

        # Write prompt to temp file to avoid command line length limits
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt', encoding='utf-8') as f:
            f.write(prompt)
            tmp_file = f.name

        try:
            # Use shell redirection to read from temp file
            result = subprocess.run(
                'claude --print < "{}"'.format(tmp_file),
                shell=True,
                capture_output=True,
                text=True,
                encoding='utf-8'
            )

            if result.returncode != 0:
                raise Exception(f'Claude CLI exited with code {result.returncode}: {result.stderr}')

            return result.stdout.strip()

        finally:
            # Clean up temp file
            try:
                os.unlink(tmp_file)
            except:
                pass

    def extract_mermaid_diagram(self, response):
        """Extract Mermaid diagram from Claude's response"""
        # Look for stateDiagram-v2 block
        diagram_match = re.search(r'stateDiagram-v2[\s\S]*?(?=\n\n|\n```|$)', response)

        if diagram_match:
            return diagram_match.group(0).strip()

        # Fallback: look for anything between ```mermaid and ```
        code_block_match = re.search(r'```mermaid\n([\s\S]*?)```', response)
        if code_block_match:
            return code_block_match.group(1).strip()

        # Last resort: return the whole response if it looks like a diagram
        if 'stateDiagram-v2' in response:
            return response

        raise Exception('Could not extract Mermaid diagram from response')

    def analyze(self, focus_area=None, selected_files=None):
        """Main analysis workflow"""
        print('🔍 Scanning workspace...')

        if selected_files:
            file_paths = [os.path.join(self.workspace_path, f) for f in selected_files]
        else:
            file_paths = self.scan_workspace()

        print(f'📁 Found {len(file_paths)} files to analyze')

        if len(file_paths) == 0:
            raise Exception('No files found to analyze')

        print('📖 Reading file contents...')
        files = self.read_files(file_paths)

        print('🤖 Calling Claude to analyze state machine patterns...')
        prompt = self.create_analysis_prompt(files, focus_area)
        response = self.analyze_with_claude(prompt)

        print('✅ Analysis complete!')
        print('\n' + '=' * 60)
        print('CLAUDE\'S ANALYSIS:')
        print('=' * 60 + '\n')
        print(response)
        print('\n' + '=' * 60 + '\n')

        mermaid_diagram = self.extract_mermaid_diagram(response)

        return {
            'analysis': response,
            'mermaid_diagram': mermaid_diagram,
            'files_analyzed': [f['path'] for f in files]
        }

    def generate_html_viewer(self, mermaid_diagram, output_dir):
        """Generate HTML viewer for the diagram"""
        # Get template directory relative to this file
        template_dir = Path(__file__).parent / 'templates'

        # Read template files
        with open(template_dir / 'viewer-template.html', 'r', encoding='utf-8') as f:
            html = f.read()
        with open(template_dir / 'viewer.css', 'r', encoding='utf-8') as f:
            css = f.read()
        with open(template_dir / 'viewer.js', 'r', encoding='utf-8') as f:
            js = f.read()

        # Inject CSS, JavaScript, and mermaid diagram into HTML
        html = html.replace('{{STYLES}}', css)
        html = html.replace('{{SCRIPTS}}', js)
        html = html.replace('{{MERMAID_DIAGRAM}}', mermaid_diagram)

        # Write the combined HTML file
        html_path = os.path.join(output_dir, 'view-diagram.html')
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(html)

        return html_path

    def save_results(self, results, output_dir):
        """Save results to files"""
        os.makedirs(output_dir, exist_ok=True)

        # Save Mermaid diagram
        mermaid_path = os.path.join(output_dir, 'state-machine.mmd')
        with open(mermaid_path, 'w', encoding='utf-8') as f:
            f.write(results['mermaid_diagram'])
        print(f'💾 Mermaid diagram saved to: {mermaid_path}')

        # Save full analysis
        analysis_path = os.path.join(output_dir, 'analysis.txt')
        full_analysis = f'Files Analyzed:\n' + '\n'.join(results['files_analyzed']) + '\n\n'
        full_analysis += f'Analysis:\n{results["analysis"]}'
        with open(analysis_path, 'w', encoding='utf-8') as f:
            f.write(full_analysis)
        print(f'💾 Full analysis saved to: {analysis_path}')

        # Generate HTML viewer
        html_path = self.generate_html_viewer(results['mermaid_diagram'], output_dir)
        print(f'🌐 HTML viewer saved to: {html_path}')

        return {
            'mermaid_path': mermaid_path,
            'analysis_path': analysis_path,
            'html_path': html_path
        }
