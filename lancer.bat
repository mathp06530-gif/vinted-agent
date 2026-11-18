@echo off
cd /d "%~dp0"
title Vinted Agent
python -m pip install -q -r requirements.txt
start "" http://localhost:5050
python app.py
pause
