import os
import json
import subprocess
from flask import Flask, request, jsonify
from dotenv import load_dotenv
import requests

load_dotenv()
API_KEY = os.environ.get("GEMINI_API_KEY")

# Mapping editor names to their launch commands
EDITOR_COMMANDS = {
    'vscode': 'code',
    'sublime': 'subl',
    'atom': 'atom',
    'vim': 'vim',
    'pycharm': 'pycharm',
}

# On Windows, search C: drive for existing files
import subprocess as sp

def find_existing_file(file_name: str) -> str:
    # Try common folders first
    for base in [os.getcwd(), os.path.expanduser("~/Downloads"), os.path.expanduser("~/Projects")]:
        candidate = os.path.join(base, file_name)
        if os.path.exists(candidate):
            return candidate
    # Fallback to Windows 'where' for speed
    try:
        out = sp.check_output(
            ["where", "/R", "C:\\", file_name],
            stderr=sp.DEVNULL,
            text=True
        ).splitlines()
        return out[0] if out else ""
    except sp.CalledProcessError:
        return ""


def call_gemini(prompt: str) -> dict:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-2.0-flash:generateContent"
    )
    headers = {"Content-Type": "application/json", "X-goog-api-key": API_KEY}
    system_instruction = (
        "You are an assistant that decides if the user wants to run code. "
        "Respond only in JSON format with keys: run_code (true/false), "
        "file_name, location, editor (optional), and code. Do not wrap JSON in markdown. "
        "For every code snippet, include all necessary headers or imports."
    )
    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": system_instruction}]},
            {"role": "user", "parts": [{"text": prompt}]}  
        ],
        "generation_config": {"response_mime_type": "application/json"}
    }
    resp = requests.post(url, headers=headers, json=payload)
    try:
        resp.raise_for_status()
    except requests.exceptions.HTTPError:
        return {"error": "HTTPError", "status_code": resp.status_code, "response": resp.text}
    data = resp.json()
    raw = data["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(raw)

app = Flask(__name__)

@app.route('/generate', methods=['POST'])
def generate():
    data = request.get_json()
    user_prompt = data.get('prompt', '')
    instruction = call_gemini(user_prompt)

    if instruction.get("error"):
        return jsonify(instruction), 500

    run_code = instruction.get('run_code', False)
    file_name = instruction.get('file_name', 'script.py')
    location = instruction.get('location', '.')
    editor = instruction.get('editor', '').lower()
    code_content = instruction.get('code', '')

    result = {'llm_response': instruction}

    if run_code:
        existing_path = find_existing_file(file_name)
        if existing_path:
            file_path = existing_path
            result['file_found'] = file_path
            result['action'] = 'overwriting existing file'
        else:
            os.makedirs(location, exist_ok=True)
            file_path = os.path.abspath(os.path.join(location, file_name))
            result['action'] = 'creating new file'

        # If C++ file, auto-add headers if missing
        ext = os.path.splitext(file_path)[1]
        # if ext == '.cpp':
        #     preamble = ''
        #     if '#include' not in code_content:
        #         preamble = '#include <iostream>\n#include <string>\nusing namespace std;\n\n'
        #     code_content = preamble + code_content

        # Write file
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(code_content)
        result['file_path'] = file_path

        # Launch editor
        if editor and editor in EDITOR_COMMANDS:
            subprocess.Popen([EDITOR_COMMANDS[editor], file_path])
            result['editor_launched'] = EDITOR_COMMANDS[editor]

        # Execute
        if ext == '.py':
            proc = sp.run(['python', file_path], capture_output=True, text=True)
            result['execution_stdout'] = proc.stdout
            result['execution_stderr'] = proc.stderr
        elif ext == '.cpp':
            exe = file_path.replace('.cpp', '')
            compile_proc = sp.run(['g++', file_path, '-o', exe], capture_output=True, text=True)
            result['compile_stdout'] = compile_proc.stdout
            result['compile_stderr'] = compile_proc.stderr
            if compile_proc.returncode == 0:
                run_proc = sp.run([exe], capture_output=True, text=True)
                result['execution_stdout'] = run_proc.stdout
                result['execution_stderr'] = run_proc.stderr

    return jsonify(result)

if __name__ == '__main__':
    app.run(port=5000, debug=True)
