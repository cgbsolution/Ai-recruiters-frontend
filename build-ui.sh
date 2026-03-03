#!/bin/bash
set -e

# Check if .env.local exists, if not create it with default API URL
if [ ! -f ".env.local" ]; then
  echo "⚙️  Creating .env.local with default API base URL..."
  cat <<EOL > .env.local
NEXT_PUBLIC_API_BASE_URL=https://c26820b8a4c1b3c2aa868d6d57e14a79-example004.cluster.autonomy.computer
EOL
else
  echo "ℹ️  .env.local already exists, skipping creation."
fi

echo "📦 Installing dependencies..."
npm install

echo "⚒️  Building Next.js app..."
npm run build

echo "✅ UI build complete!"
