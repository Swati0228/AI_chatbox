# Node.js ticket summarizer

This is the Node.js/Express equivalent of the Spring Boot project. It exposes the
same `POST /api/summarize` endpoint, accepts a support ticket as raw text, and
returns a plain-text two-line summary.

## Run

Requires Node.js 20 or newer.

```bash
cd nodeJsDemo
npm install
cp .env.example .env
```

Set your real `OPENAI_API_KEY` in `.env`, then start the API:

```bash
npm start
```

The server uses port `8080` by default. Test it with:

```bash
curl -X POST http://localhost:8080/api/summarize \
  -H "Content-Type: text/plain" \
  --data "Customers cannot complete checkout because the payment page times out."
```

Run the automated tests with `npm test`. The tests use a fake OpenAI client and
do not make paid API calls.
