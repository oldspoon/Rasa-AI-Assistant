# Hugging Face Space (Docker SDK): the Rasa server and the custom action
# server run together in this one container. The Rasa model is trained
# during the image build.
#
# The action server talks to Postgres when DATABASE_URL is set (Space
# secret) and to the bundled SQLite file otherwise.

FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY action_server/requirements.txt /tmp/action-server-requirements.txt
COPY rasa/requirements.txt /tmp/rasa-requirements.txt
RUN python -m pip install --upgrade pip \
 && python -m pip install \
        -r /tmp/action-server-requirements.txt \
        -r /tmp/rasa-requirements.txt

COPY action_server /app/action_server
COPY rasa /app/rasa

WORKDIR /app/rasa
RUN python -m rasa train

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 7860
CMD ["/app/start.sh"]
