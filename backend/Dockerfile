FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

WORKDIR /app/src

CMD ["uvicorn", "main:main_app", "--host", "0.0.0.0", "--port", "8000"]