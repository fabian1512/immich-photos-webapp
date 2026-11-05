FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/fabian1512/immich-photos-webapp" \
      org.opencontainers.image.description="A web app for Immich in the style of the Apple Photos app" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY server.mjs ./
COPY public ./public
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.mjs"]
