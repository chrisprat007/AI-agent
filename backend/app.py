import os
import json
import subprocess
import re
import shutil
from flask import Flask, request, jsonify
from dotenv import load_dotenv
import requests
from requests.exceptions import RequestException
import sys

load_dotenv()
API_KEY = os.environ.get("GEMINI_API_KEY")

EDITOR_COMMANDS = {
    'vscode': 'code',
    'sublime': 'subl',
    'atom': 'atom',
    'vim': 'vim',
    'pycharm': 'pycharm',
}

EXTENSION_COMMANDS = {
    '.py': ['python'],
    '.cpp': ['g++', '{file}', '-o', '{exe}', '&&', '{exe}'],
    '.c': ['gcc', '{file}', '-o', '{exe}', '&&', '{exe}'],
    '.java': ['javac', '{file}', '&&', 'java', '{main_class}'],
    '.js': ['node', '{file}'],
    '.ts': ['tsc', '{file}', '&&', 'node', '{js_file}'],
    '.sh': ['bash', '{file}'],
    '.rb': ['ruby', '{file}'],
    '.go': ['go', 'run', '{file}'],
    '.php': ['php', '{file}'],
    '.cs': ['dotnet', 'run', '--project', '{file_dir}']
}

def safe_parse_json(raw):
    raw = re.sub(r'\\(?![\\nt"r/])', r'\\\\', raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        return {"error": "JSONDecodeError", "reason": str(e), "raw_response": raw}

def call_gemini(prompt: str) -> dict:
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    headers = {"Content-Type": "application/json", "X-goog-api-key": API_KEY}
    system_instruction = (
        "You are an assistant that decides if the user wants to run code. "
        "Respond only in JSON format with keys: run_code (true/false), "
        "file_name, location, editor (optional), install_cmd (optional), and code. "
        "Do not wrap JSON in markdown. Escape all backslashes properly for valid JSON."
    )
    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": system_instruction}]},
            {"role": "user", "parts": [{"text": prompt}]}
        ],
        "generation_config": {"response_mime_type": "application/json"}
    }
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        resp.raise_for_status()
        raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        return safe_parse_json(raw)
    except RequestException:
        return {
            "run_code": True,
            "file_name": "script.py",
            "location": ".",
            "editor": "",
            "install_cmd": "",
            "code": "# Fallback code – Gemini is unreachable.\nprint('Hello from fallback!')\n"
        }
def execute_file(file_path: str):
    ext = os.path.splitext(file_path)[1].lower()
    file_dir = os.path.dirname(file_path)
    file_stem = os.path.splitext(os.path.basename(file_path))[0]

    if ext == '.py':
        cmd = [sys.executable, file_path]

    elif ext == '.js':
        cmd = ['node', file_path]

    elif ext == '.cpp':
        exe_name = file_stem + ('.exe' if os.name == 'nt' else '')
        exe_path = os.path.join(file_dir, exe_name)
        compile_proc = subprocess.run(
            ['g++', file_path, '-o', exe_path],
            capture_output=True,
            text=True
        )
        if compile_proc.returncode != 0:
            return {
                'execution_stdout': compile_proc.stdout,
                'execution_stderr': compile_proc.stderr or 'Compilation failed'
            }
        cmd = [exe_path]

    else:
        return {
            'execution_stdout': '',
            'execution_stderr': f'Unsupported extension: {ext}'
        }

    proc = subprocess.run(cmd, capture_output=True, text=True)
    return {
        'execution_stdout': proc.stdout,
        'execution_stderr': proc.stderr
    }

app = Flask(__name__)

@app.route('/generate', methods=['POST'])
def generate():
    data = request.get_json(force=True)
    if isinstance(data, list):
        data = data[0]
    user_prompt = data.get('prompt', '')
    instruction = call_gemini(user_prompt)
    run_code = instruction.get('run_code', False)
    file_name = instruction.get('file_name', 'script.py')
    location = instruction.get('location', '.')
    code = instruction.get('code', '')
    install_cmd = instruction.get('install_cmd', '')

    os.makedirs(location, exist_ok=True)
    file_path = os.path.abspath(os.path.join(location, file_name))
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(code)

    result = {'llm_response': instruction, 'file_path': file_path}
    print(f"Generated file at: {file_path}")
    os.system(f'code "{file_path}"')
    result['editor_launched'] = 'code'

    if run_code:
        exec_result = execute_file(file_path)
        result.update(exec_result)

    return jsonify(result)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
