# Vibe sandbox template.
#
# Build with:
#   cd sandbox-templates/nextjs
#   e2b template build --name vibe-nextjs-v3 --cmd "/compile_page.sh"
#
# Then set E2B_TEMPLATE_ID=vibe-nextjs-v3 in .env

FROM node:21-slim

# curl is used by compile_page.sh to wait for the dev server
RUN apt-get update \
  && apt-get install -y curl zip \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY compile_page.sh /compile_page.sh
RUN chmod +x /compile_page.sh

WORKDIR /home/user/nextjs-app

RUN npx --yes create-next-app@15.3.3 . --yes

RUN npx --yes shadcn@2.6.3 init --yes -b neutral --force
RUN npx --yes shadcn@2.6.3 add --all --yes

# Move the app to the home directory. The original used a bare `*` glob, which
# leaves dotfiles behind; -A includes them so .gitignore and friends come along.
RUN cp -a /home/user/nextjs-app/. /home/user/ \
  && rm -rf /home/user/nextjs-app

WORKDIR /home/user

# --- Vibe inspector -------------------------------------------------------
# Copied AFTER the app move, so create-next-app's own next.config.ts cannot
# overwrite ours.
COPY vibe/ /home/user/vibe/
COPY next.config.vibe.ts /home/user/next.config.ts
COPY instrumentation-client.ts /home/user/instrumentation-client.ts

# create-next-app may emit any of these; Next picks one arbitrarily when
# several exist, which would silently disable the inspector.
RUN rm -f /home/user/next.config.js /home/user/next.config.mjs

# Parser used by the source-location loader.
RUN npm install --no-audit --no-fund --save-dev @babel/parser magic-string esbuild

# Standalone inspector bundle for STATIC_HTML projects, which have no Next
# compiler to build vibe/inspector.ts for them. The static server injects this.
RUN npx esbuild /home/user/vibe/inspector-static.ts --bundle --format=iife --platform=browser --target=es2020 --outfile=/home/user/vibe/inspector.bundle.js || echo "inspector bundle failed; click-to-edit unavailable for static sites"

# Static projects serve from here.
RUN mkdir -p /home/user/site

ENV VIBE_INSPECTOR=1
ENV VIBE_ROOT=/home/user
ENV NEXT_TELEMETRY_DISABLED=1
