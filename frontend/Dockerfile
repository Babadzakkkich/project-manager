FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM nginx:alpine

# Удаляем дефолтный конфиг
RUN rm -f /etc/nginx/conf.d/default.conf

# Копируем конфиги nginx
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/syncro.conf /etc/nginx/conf.d/default.conf

# Копируем SSL сертификаты
COPY nginx/ssl/nginx-selfsigned.crt /etc/nginx/ssl/nginx-selfsigned.crt
COPY nginx/ssl/nginx-selfsigned.key /etc/nginx/ssl/nginx-selfsigned.key

# Копируем собранный фронтенд
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]