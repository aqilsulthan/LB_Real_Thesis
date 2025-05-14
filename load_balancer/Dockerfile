FROM node:18
       WORKDIR /load_balancer
       COPY package*.json ./
       RUN npm install
       COPY . .
       CMD ["node", "index.js"]