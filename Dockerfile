# O salão num contêiner: Node 24 e o código, nada mais (o projeto não tem dependências).
FROM node:24-alpine
ENV NODE_ENV=production PORTA=3000 BANCO=/dados/salao.db
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
# O banco fica num volume; o resto do contêiner pode ser somente leitura.
RUN mkdir -p /dados && chown node:node /dados
USER node
EXPOSE 3000
VOLUME ["/dados"]
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/saude').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "src/servidor/index.ts"]
