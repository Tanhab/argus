# Optional: the easy path is `npx tsx tools/fake-target/index.ts`. This image exists for
# deploying the target to a droplet for the flap benchmark. Single zero-dependency file —
# no monorepo build, just run it through tsx.
FROM node:24-alpine

WORKDIR /app

COPY index.ts ./

USER node

ENV PORT=7070
EXPOSE 7070

CMD ["npx", "--yes", "tsx", "index.ts"]
