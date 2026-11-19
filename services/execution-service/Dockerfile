FROM node:20-alpine

WORKDIR /app

# No npm dependencies on purpose: this service talks to the Docker Engine API
# directly, so there is nothing to install and nothing extra to attack.
COPY package.json ./
COPY src ./src
COPY scripts ./scripts

EXPOSE 5005

CMD ["node", "src/index.js"]
