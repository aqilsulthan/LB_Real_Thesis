# FROM node:18
#        WORKDIR /load_balancer
#        COPY package*.json ./
#        RUN npm install
#        COPY . .
#        CMD ["node", "index.js"]

FROM node:18
WORKDIR /app
COPY package.json ./
RUN npm install
COPY index.js ./
EXPOSE 8080
CMD ["node", "index.js"]