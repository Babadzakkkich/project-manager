FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM nginx:alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/syncro.conf /etc/nginx/conf.d/default.conf

COPY nginx/ssl/nginx-selfsigned.crt /etc/nginx/ssl/nginx-selfsigned.crt
COPY nginx/ssl/nginx-selfsigned.key /etc/nginx/ssl/nginx-selfsigned.key

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]