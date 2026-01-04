#!/bin/sh
set -e

# Check if node_modules exists, if not, install dependencies
if [ ! -d "/app/node_modules" ] || [ ! -f "/app/node_modules/.bin/next" ]; then
    echo "Dependencies not found or incomplete. Installing..."
    npm install
fi

# Force install the stable client specifically
npm install @prisma/client@5.10.2

# Generate Prisma Client using specific version
npx prisma@5.10.2 generate

# Push schema to DB
npx prisma@5.10.2 db push --accept-data-loss

# Execute the command passed to the docker container
exec "$@"
