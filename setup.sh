#!/bin/bash
set -e

echo "🚀 Setting up ProPDFs development environment..."

# Create backend virtual environment
if [ ! -d "backend/.venv" ]; then
    echo "Creating Python virtual environment..."
    cd backend
    python3.11 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    cd ..
fi

# Setup Flutter
cd frontend
flutter pub get
cd ..

# Create .env if not exists
if [ ! -f "backend/.env" ]; then
    cp backend/.env.example backend/.env
    echo "⚠️  Created backend/.env from template. Please edit with your credentials."
fi

echo "✅ Setup complete!"
echo ""
echo "To start development:"
echo "  1. docker compose up -d     # Start infrastructure"
echo "  2. cd backend && uvicorn app.main:app --reload  # Start API"
echo "  3. cd frontend && flutter run -d chrome  # Start Flutter"
